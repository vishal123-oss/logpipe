import { LogEntry, LogStorage } from '../interfaces/LogStorage';

export class InMemoryLog implements LogStorage {
  private logs: LogEntry[] = [];

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
}
