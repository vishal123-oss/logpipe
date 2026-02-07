import { Request, Response } from 'express';
import { LogPipe } from '../core/LogPipe';

export class ConsumerController {
  private logPipe: LogPipe;

  constructor(logPipe: LogPipe) {
    this.logPipe = logPipe;
  }

  async consume(req: Request, res: Response): Promise<void> {
    const topic = req.query.topic as string;
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 100;
    const consumerId = (req.query.consumerId as string) || 'default';
    const groupId = (req.query.groupId as string) || 'default';
    if (!topic) {
      res.status(400).json({ error: 'topic required' });
      return;
    }
    // use committed offset for progress (if offset=0)
    let useOffset = offset;
    if (useOffset === 0) {
      useOffset = await this.logPipe.getCommittedOffset(topic, groupId, consumerId);
    }
    const events = await this.logPipe.consume(topic, useOffset, limit);
    res.json({ consumerId, groupId, topic, offset: useOffset, events, count: events.length });
  }

  async getOffset(req: Request, res: Response): Promise<void> {
    const topic = req.query.topic as string;
    const consumerId = (req.query.consumerId as string) || 'default';
    const groupId = (req.query.groupId as string) || 'default';
    if (!topic) {
      res.status(400).json({ error: 'topic required' });
      return;
    }
    const offset = await this.logPipe.getCommittedOffset(topic, groupId, consumerId);
    res.json({ topic, groupId, consumerId, offset });
  }

  async commitOffset(req: Request, res: Response): Promise<void> {
    const { topic, groupId = 'default', consumerId = 'default', offset } = req.body;
    if (!topic || offset === undefined) {
      res.status(400).json({ error: 'topic and offset required' });
      return;
    }
    await this.logPipe.commitOffset(topic, groupId, consumerId, offset);
    res.json({ success: true, topic, groupId, consumerId, offset });
  }
}
