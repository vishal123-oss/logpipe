export interface LogEntry {
  id: string;
  timestamp: Date;
  topic: string;
  data: any;
  position?: { start: number; length: number };
}

export interface LogStorage {
  append(entry: LogEntry): Promise<void>;
  read(topic: string, offset: number, limit?: number): Promise<LogEntry[]>;
  getLength(): Promise<number>;
  readMessage(topic: string, start: number, length: number): Promise<string>;
}
