import { LogEntry, LogStorage } from '../interfaces/LogStorage';
import { v4 as uuidv4 } from 'uuid';

export class LogPipe {
  private storage: LogStorage;

  constructor(storage: LogStorage) {
    this.storage = storage;
  }

  async publish(topic: string, data: any): Promise<LogEntry> {
    const entry: LogEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      topic,
      data,
    };
    await this.storage.append(entry);
    return entry;
  }

  async consume(
    topic: string,
    offset: number,
    limit = 100
  ): Promise<LogEntry[]> {
    return this.storage.read(topic, offset, limit);
  }

  async getOffset(): Promise<number> {
    return this.storage.getLength();
  }

  async readMessage(
    topic: string,
    start: number,
    length: number
  ): Promise<string> {
    return this.storage.readMessage(topic, start, length);
  }

  async commitOffset(
    topic: string,
    groupId: string,
    consumerId: string,
    offset: number
  ): Promise<void> {
    return this.storage.commitOffset(topic, groupId, consumerId, offset);
  }

  async getCommittedOffset(
    topic: string,
    groupId: string,
    consumerId: string
  ): Promise<number> {
    return this.storage.getCommittedOffset(topic, groupId, consumerId);
  }
}
