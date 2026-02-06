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
}
