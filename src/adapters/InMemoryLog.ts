import { LogEntry, LogStorage } from '../interfaces/LogStorage';

export class InMemoryLog implements LogStorage {
  private logs: LogEntry[] = [];
  private offsets: Map<string, number> = new Map();

  private getOffsetKey(topic: string, groupId: string, consumerId: string): string {
    return `${topic}:${groupId}:${consumerId}`;
  }

  async append(entry: LogEntry): Promise<void> {
    this.logs.push(entry);
  }

  async read(topic: string, offset: number, limit = 100): Promise<LogEntry[]> {
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
}
