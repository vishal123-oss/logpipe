import { LogEntry, LogStorage, TopicStats, ConsumerStats, GroupStats } from '../interfaces/LogStorage';

export class InMemoryLog implements LogStorage {
  private logs: LogEntry[] = [];
  private offsets: Map<string, number> = new Map();
  // extra for stats tracking
  private readCounts: Map<string, number> = new Map();
  private lastReads: Map<string, Date> = new Map();

  private getOffsetKey(topic: string, groupId: string, consumerId: string): string {
    return `${topic}:${groupId}:${consumerId}`;
  }

  async append(entry: LogEntry): Promise<void> {
    this.logs.push(entry);
  }

  async read(topic: string, offset: number, limit = 100): Promise<LogEntry[]> {
    // track read for stats
    const count = (this.readCounts.get(topic) || 0) + 1;
    this.readCounts.set(topic, count);
    this.lastReads.set(topic, new Date());
    return this.logs
      .filter((log) => log.topic === topic)
      .slice(offset, offset + limit);
  }

  async getLength(): Promise<number> {
    return this.logs.length;
  }

  async readMessage(
    topic: string,
    _start: number,
    _length: number
  ): Promise<string> {
    const entry = this.logs.find((log) => log.topic === topic);
    if (entry) {
      return JSON.stringify(entry);
    }
    return '';
  }

  async commitOffset(
    topic: string,
    groupId: string,
    consumerId: string,
    offset: number
  ): Promise<void> {
    const key = this.getOffsetKey(topic, groupId, consumerId);
    this.offsets.set(key, offset);
  }

  async getCommittedOffset(
    topic: string,
    groupId: string,
    consumerId: string
  ): Promise<number> {
    const key = this.getOffsetKey(topic, groupId, consumerId);
    return this.offsets.get(key) ?? 0;
  }

  // topics: producer from logs, consumer from offsets; tag accordingly (both -> producer)
  async getTopics(): Promise<Array<{ topic: string; tag: 'producer_events' | 'consumer_events' }>> {
    try {
      const producerTopics = new Set(this.logs.map(log => log.topic));
      const consumerTopics = new Set<string>();
      for (const [key] of this.offsets) {
        const topic = key.split(':')[0];
        consumerTopics.add(topic);
      }
      const allTopics = new Map<string, 'producer_events' | 'consumer_events'>();
      for (const t of producerTopics) {
        allTopics.set(t, 'producer_events');
      }
      for (const t of consumerTopics) {
        if (!allTopics.has(t)) {
          allTopics.set(t, 'consumer_events');
        }
      }
      return Array.from(allTopics.entries()).map(([topic, tag]) => ({ topic, tag }));
    } catch (e) {
      console.error('In-memory topics listing failed:', e);
      return [];
    }
  }

  // compute topic stats (consumers/groups from offsets, dates from logs, reads tracked)
  async getTopicStats(topic: string): Promise<TopicStats> {
    const topicLogs = this.logs.filter(log => log.topic === topic);
    const eventCount = topicLogs.length;
    if (eventCount === 0) {
      // no events for topic
      throw new Error(`Topic '${topic}' does not exist or has no events produced yet`);
    }
    const producedDates = [...new Set(topicLogs.map(log => log.timestamp.toISOString().split('T')[0]))];
    const firstEventAt = topicLogs[0]?.timestamp;
    const lastEventAt = topicLogs[topicLogs.length - 1]?.timestamp;

    // unique consumers/groups from offsets (key=topic:group:consumer)
    const consumers = new Set<string>();
    const groups = new Set<string>();
    const consumerDetails: Array<{ consumerId: string; groupId: string; committedOffset: number; percentRead: number; eventsReadApprox: number }> = [];
    for (const [key, offset] of this.offsets) {
      if (key.startsWith(`${topic}:`)) {
        const [, groupId, consumerId] = key.split(':');
        groups.add(groupId);
        consumers.add(consumerId);
        const percent = eventCount > 0 ? Math.round((offset / eventCount) * 100) : 0;
        consumerDetails.push({
          consumerId,
          groupId,
          committedOffset: offset,
          percentRead: percent,
          eventsReadApprox: offset,
        });
      }
    }

    const totalReads = this.readCounts.get(topic) || 0;
    const avgProgress = consumerDetails.length > 0 ? Math.round(consumerDetails.reduce((sum, d) => sum + d.percentRead, 0) / consumerDetails.length) : 0;
    const activity = totalReads > 10 ? 'high' : totalReads > 3 ? 'medium' : 'low';

    return {
      topic,
      eventCount,
      producedDates: producedDates.sort(),
      producers: ['system'], // placeholder; no explicit producerId in publishes
      consumers: Array.from(consumers),
      groups: Array.from(groups),
      readCount: totalReads,
      lastReadAt: this.lastReads.get(topic),
      firstEventAt,
      lastEventAt,
      consumerDetails,
      insights: {
        totalUniqueReaders: consumers.size,
        avgProgressPercent: avgProgress,
        activityLevel: activity,
      },
    };
  }

  // get consumers list/stats (multi-topic, progress/offsets, event links via sample, deps)
  async getConsumers(consumerId?: string): Promise<ConsumerStats[]> {
    const consumerMap = new Map<string, ConsumerStats>();
    for (const [key, offset] of this.offsets) {
      const [t, g, c] = key.split(':');
      if (consumerId && c !== consumerId) continue;
      if (!consumerMap.has(c)) {
        consumerMap.set(c, {
          consumerId: c,
          groups: [],
          topics: [],
          progress: [],
          totalEventsConsumed: 0,
          dependencies: [],
          lastActivity: undefined,
        });
      }
      const stats = consumerMap.get(c)!;
      if (!stats.groups.includes(g)) stats.groups.push(g);
      if (!stats.topics.includes(t)) stats.topics.push(t);
      // progress link: sample last event ID if available
      let lastEventLink = '';
      const topicLogs = this.logs.filter(log => log.topic === t);
      if (topicLogs.length > offset) {
        lastEventLink = topicLogs[offset]?.id || '';
      }
      stats.progress.push({ topic: t, committedOffset: offset, lastEventLink });
      stats.totalEventsConsumed += offset; // approx consumed
      stats.dependencies.push(g, t); // groups + topics as deps
      // last activity from reads if tracked
      if (this.lastReads.has(t)) {
        stats.lastActivity = this.lastReads.get(t);
      }
    }
    return Array.from(consumerMap.values());
  }

  // get groups stats (consumers/topics/progress from offsets)
  async getGroups(groupId?: string): Promise<GroupStats[]> {
    const groupMap = new Map<string, GroupStats>();
    for (const [key, offset] of this.offsets) {
      const [t, g, c] = key.split(':');
      if (groupId && g !== groupId) continue;
      if (!groupMap.has(g)) {
        groupMap.set(g, {
          groupId: g,
          consumers: [],
          topics: [],
          progress: [],
          totalEventsConsumed: 0,
          insights: { totalConsumers: 0, avgProgress: 0 },
        });
      }
      const stats = groupMap.get(g)!;
      if (!stats.consumers.includes(c)) stats.consumers.push(c);
      if (!stats.topics.includes(t)) stats.topics.push(t);
      // progress: avg offset
      const existing = stats.progress.find(p => p.topic === t);
      if (existing) {
        existing.avgOffset = (existing.avgOffset + offset) / 2;
        existing.consumersCount++;
      } else {
        stats.progress.push({ topic: t, avgOffset: offset, consumersCount: 1 });
      }
      stats.totalEventsConsumed += offset;
    }
    // compute insights
    for (const stats of groupMap.values()) {
      stats.insights.totalConsumers = stats.consumers.length;
      stats.insights.avgProgress = stats.progress.length > 0 ? Math.round(stats.progress.reduce((sum, p) => sum + (p.avgOffset / 100), 0) / stats.progress.length * 100) : 0; // approx %
    }
    return Array.from(groupMap.values());
  }
}
