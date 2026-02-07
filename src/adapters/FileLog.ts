import { LogEntry, LogStorage, TopicStats, ConsumerStats, GroupStats } from '../interfaces/LogStorage';
import { LogManager } from './LogManager';

export class FileLog implements LogStorage {
  private logManager = new LogManager();
  // in-mem tracking for read stats (persists only across runtime)
  private readCounts: Map<string, number> = new Map();
  private lastReads: Map<string, Date> = new Map();

  async append(entry: LogEntry): Promise<void> {
    const message = JSON.stringify(entry);
    const position = await this.logManager.append(entry.topic, message);
    entry.position = position;
  }

  async read(topic: string, offset: number, limit = 100): Promise<LogEntry[]> {
    // track read for stats
    const count = (this.readCounts.get(topic) || 0) + 1;
    this.readCounts.set(topic, count);
    this.lastReads.set(topic, new Date());
    const index = await this.logManager.getIndex(topic);
    const entries: LogEntry[] = [];
    const end = Math.min(offset + limit, index.length);
    for (let i = offset; i < end; i++) {
      const pos = index[i];
      const chunk = await this.logManager.readChunk(
        topic,
        pos.start,
        pos.length
      );
      const entry = JSON.parse(chunk) as LogEntry;
      entries.push(entry);
    }
    return entries;
  }

  async getLength(): Promise<number> {
    return 0;
  }

  async readMessage(
    topic: string,
    start: number,
    length: number
  ): Promise<string> {
    return this.logManager.readChunk(topic, start, length);
  }

  async commitOffset(
    topic: string,
    groupId: string,
    consumerId: string,
    offset: number
  ): Promise<void> {
    await this.logManager.commitOffset(topic, groupId, consumerId, offset);
  }

  async getCommittedOffset(
    topic: string,
    groupId: string,
    consumerId: string
  ): Promise<number> {
    return this.logManager.getCommittedOffset(topic, groupId, consumerId);
  }

  // delegate topics list with tags
  async getTopics(): Promise<Array<{ topic: string; tag: 'producer_events' | 'consumer_events' }>> {
    return this.logManager.getTopics();
  }

  // get stats (delegate core to LogManager, merge local read tracking)
  async getTopicStats(topic: string): Promise<TopicStats> {
    let baseStats = await this.logManager.getTopicStats(topic);
    const readCount = this.readCounts.get(topic) || 0;
    const lastReadAt = this.lastReads.get(topic);
    // recompute insights with actual reads
    const avg = baseStats.consumerDetails.length > 0 ? Math.round(baseStats.consumerDetails.reduce((sum, d) => sum + d.percentRead, 0) / baseStats.consumerDetails.length) : 0;
    const activity = readCount > 10 ? 'high' : readCount > 3 ? 'medium' : 'low';
    baseStats = {
      ...baseStats,
      readCount,
      lastReadAt,
      insights: { ...baseStats.insights, avgProgressPercent: avg, activityLevel: activity },
    };
    return baseStats;
  }

  // get consumers (delegate; supports multi-topic reads/progress)
  async getConsumers(consumerId?: string): Promise<ConsumerStats[]> {
    return this.logManager.getConsumers(consumerId);
  }

  // get groups (delegate)
  async getGroups(groupId?: string): Promise<GroupStats[]> {
    return this.logManager.getGroups(groupId);
  }
}
