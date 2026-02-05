import { LogEntry, LogStorage } from '../interfaces/LogStorage';
import { LogManager } from './LogManager';

export class FileLog implements LogStorage {
  private logManager = new LogManager();

  async append(entry: LogEntry): Promise<void> {
    const message = JSON.stringify(entry);
    const position = await this.logManager.append(entry.topic, message);
    entry.position = position;
  }

  async read(topic: string, offset: number, limit = 100): Promise<LogEntry[]> {
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
}
