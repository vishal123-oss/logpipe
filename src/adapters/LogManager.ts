import * as fs from 'fs/promises';
import * as path from 'path';
import { TopicStats, ConsumerStats, GroupStats } from '../interfaces/LogStorage';

export class LogManager {
  private baseDir: string;

  constructor(baseDir = 'logs') {
    this.baseDir = baseDir;
  }

  private async ensureTopicDir(topic: string): Promise<string> {
    const topicDir = path.join(this.baseDir, topic);
    await fs.mkdir(topicDir, { recursive: true });
    return topicDir;
  }

  async append(
    topic: string,
    message: string
  ): Promise<{ start: number; length: number }> {
    const topicDir = await this.ensureTopicDir(topic);
    const filePath = path.join(topicDir, 'events.log');
    let start = 0;
    try {
      const stats = await fs.stat(filePath);
      start = stats.size;
    } catch {
      start = 0;
    }
    const buffer = Buffer.from(message + '\n');
    await fs.appendFile(filePath, buffer);
    const position = { start, length: buffer.length };
    await this.appendToIndex(topic, position);
    return position;
  }

  async readChunk(
    topic: string,
    start: number,
    length: number
  ): Promise<string> {
    const topicDir = await this.ensureTopicDir(topic);
    const filePath = path.join(topicDir, 'events.log');
    const fd = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(length);
      await fd.read(buffer, 0, length, start);
      return buffer.toString().trim();
    } finally {
      await fd.close();
    }
  }

  private getIndexPath(topic: string): string {
    const topicDir = path.join(this.baseDir, topic);
    return path.join(topicDir, 'index.json');
  }

  private async loadIndex(
    topic: string
  ): Promise<Array<{ start: number; length: number }>> {
    const indexPath = this.getIndexPath(topic);
    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      let index = JSON.parse(content);
      // validate + rebuild if inconsistent (e.g. file reset across test runs, stale positions)
      const topicDir = await this.ensureTopicDir(topic);
      const filePath = path.join(topicDir, 'events.log');
      let fileSize = 0;
      try {
        const stats = await fs.stat(filePath);
        fileSize = stats.size;
      } catch {}
      index = index.filter((pos: any) => pos.start + (pos.length || 0) <= fileSize);
      if (index.length > 0) {
        const last = index[index.length - 1];
        if (last.start + last.length !== fileSize) {
          index = await this.rebuildIndex(topic);
        }
      }
      return index;
    } catch {
      return [];
    }
  }

  private async saveIndex(
    topic: string,
    index: Array<{ start: number; length: number }>
  ): Promise<void> {
    const indexPath = this.getIndexPath(topic);
    await fs.writeFile(indexPath, JSON.stringify(index));
  }

  private async rebuildIndex(
    topic: string
  ): Promise<Array<{ start: number; length: number }>> {
    const topicDir = await this.ensureTopicDir(topic);
    const filePath = path.join(topicDir, 'events.log');
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    const index: Array<{ start: number; length: number }> = [];
    let startPos = 0;
    for (const line of lines) {
      const buffer = Buffer.from(line + '\n');
      index.push({ start: startPos, length: buffer.length });
      startPos += buffer.length;
    }
    await this.saveIndex(topic, index);
    return index;
  }

  private async appendToIndex(
    topic: string,
    position: { start: number; length: number }
  ): Promise<void> {
    const index = await this.loadIndex(topic);
    index.push(position);
    await this.saveIndex(topic, index);
  }

  async getIndex(
    topic: string
  ): Promise<Array<{ start: number; length: number }>> {
    return this.loadIndex(topic);
  }

  private getOffsetsPath(): string {
    return path.join(this.baseDir, 'offsets.json');
  }

  private async ensureBaseDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  private async loadOffsets(): Promise<Array<{ topic: string; groupId: string; consumerId: string; offset: number }>> {
    const offsetsPath = this.getOffsetsPath();
    try {
      await this.ensureBaseDir();
      const content = await fs.readFile(offsetsPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  private async saveOffsets(
    offsets: Array<{ topic: string; groupId: string; consumerId: string; offset: number }>
  ): Promise<void> {
    const offsetsPath = this.getOffsetsPath();
    await this.ensureBaseDir();
    await fs.writeFile(offsetsPath, JSON.stringify(offsets));
  }

  async commitOffset(
    topic: string,
    groupId: string,
    consumerId: string,
    offset: number
  ): Promise<void> {
    let offsets = await this.loadOffsets();
    const existingIndex = offsets.findIndex(
      (o) =>
        o.topic === topic &&
        o.groupId === groupId &&
        o.consumerId === consumerId
    );
    if (existingIndex !== -1) {
      offsets[existingIndex].offset = offset;
    } else {
      offsets.push({ topic, groupId, consumerId, offset });
    }
    await this.saveOffsets(offsets);
  }

  async getCommittedOffset(
    topic: string,
    groupId: string,
    consumerId: string
  ): Promise<number> {
    const offsets = await this.loadOffsets();
    const found = offsets.find(
      (o) =>
        o.topic === topic &&
        o.groupId === groupId &&
        o.consumerId === consumerId
    );
    return found ? found.offset : 0;
  }

  // get producer topics (dirs with events) + consumer topics (from offsets); tag or
  async getTopics(): Promise<Array<{ topic: string; tag: 'producer_events' | 'consumer_events' }>> {
    await this.ensureBaseDir();
    const producerTopics = new Set<string>();
    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          // check if has events.log to confirm producer
          const eventsPath = path.join(this.baseDir, entry.name, 'events.log');
          try {
            await fs.access(eventsPath);
            producerTopics.add(entry.name);
          } catch (e) {
            console.error('Topic access check failed:', e);
          }
        }
      }
    } catch (e) {
      console.error('Failed to list topic directories:', e);
    }

    const offsets = await this.loadOffsets();
    const consumerTopics = new Set(offsets.map(o => o.topic));

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
  }

  // compute detailed stats for topic (scan index for events/dates, offsets for consumers/groups)
  async getTopicStats(topic: string): Promise<TopicStats> {
    // event count + dates from index/logs
    const index = await this.getIndex(topic);
    const eventCount = index.length;
    if (eventCount === 0) {
      // no topic dir or events
      throw new Error(`Topic '${topic}' does not exist or has no events produced yet`);
    }
    let firstEventAt: Date | undefined;
    let lastEventAt: Date | undefined;
    const producedDates = new Set<string>();
    // peek first/last via chunks (avoid full load)
    const firstChunk = await this.readChunk(topic, index[0].start, index[0].length);
    const firstEntry = JSON.parse(firstChunk) as any;
    firstEventAt = new Date(firstEntry.timestamp);
    producedDates.add(firstEventAt.toISOString().split('T')[0]);

    if (eventCount > 1) {
      const lastChunk = await this.readChunk(topic, index[eventCount - 1].start, index[eventCount - 1].length);
      const lastEntry = JSON.parse(lastChunk) as any;
      lastEventAt = new Date(lastEntry.timestamp);
      producedDates.add(lastEventAt.toISOString().split('T')[0]);
    }

    // consumers/groups + per-consumer details/% from offsets
    const offsets = await this.loadOffsets();
    const consumers = new Set<string>();
    const groups = new Set<string>();
    const consumerDetails: Array<{ consumerId: string; groupId: string; committedOffset: number; percentRead: number; eventsReadApprox: number }> = [];
    for (const o of offsets) {
      if (o.topic === topic) {
        const percent = eventCount > 0 ? Math.round((o.offset / eventCount) * 100) : 0;
        groups.add(o.groupId);
        consumers.add(o.consumerId);
        consumerDetails.push({
          consumerId: o.consumerId,
          groupId: o.groupId,
          committedOffset: o.offset,
          percentRead: percent,
          eventsReadApprox: o.offset,
        });
      }
    }

    const totalReads = 0; // FileLog merges
    const avgProgress = consumerDetails.length > 0 ? Math.round(consumerDetails.reduce((sum, d) => sum + d.percentRead, 0) / consumerDetails.length) : 0;
    const activity = totalReads > 10 ? 'high' : totalReads > 3 ? 'medium' : 'low';

    return {
      topic,
      eventCount,
      producedDates: Array.from(producedDates).sort(),
      producers: ['system'], // placeholder (no producer tracking; events via /publish or TCP)
      consumers: Array.from(consumers),
      groups: Array.from(groups),
      readCount: totalReads, // FileLog tracks separately
      lastReadAt: undefined, // FileLog tracks separately
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

  // get consumers (multi-topic support; progress from offsets, event links via index peek, deps)
  async getConsumers(consumerId?: string): Promise<ConsumerStats[]> {
    const offsets = await this.loadOffsets();
    const consumerMap = new Map<string, ConsumerStats>();
    for (const o of offsets) {
      const { topic: t, groupId: g, consumerId: c, offset } = o;
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
      // progress + event link: peek last committed event ID from index if exists
      let lastEventLink = '';
      const index = await this.getIndex(t);
      if (index.length > offset) {
        // peek chunk for ID
        const chunk = await this.readChunk(t, index[offset].start, index[offset].length);
        try {
          const entry = JSON.parse(chunk) as any;
          lastEventLink = entry.id || '';
        } catch {}
      }
      stats.progress.push({ topic: t, committedOffset: offset, lastEventLink });
      stats.totalEventsConsumed += offset;
      stats.dependencies = [...new Set([...stats.dependencies, g, t])]; // unique deps
    }
    return Array.from(consumerMap.values());
  }

  // get groups stats (consumers/topics/progress from offsets)
  async getGroups(groupId?: string): Promise<GroupStats[]> {
    const offsets = await this.loadOffsets();
    const groupMap = new Map<string, GroupStats>();
    for (const o of offsets) {
      const { topic: t, groupId: g, consumerId: c, offset } = o;
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
      stats.insights.avgProgress = stats.progress.length > 0 ? Math.round(stats.progress.reduce((sum, p) => sum + p.avgOffset, 0) / stats.progress.length) : 0;
    }
    return Array.from(groupMap.values());
  }
}
