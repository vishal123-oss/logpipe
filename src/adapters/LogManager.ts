import * as fs from 'fs/promises';
import * as path from 'path';

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
      return JSON.parse(content);
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
}
