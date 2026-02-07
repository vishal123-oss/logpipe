import { Request, Response } from 'express';
import { LogPipe } from '../core/LogPipe';

export class AdminController {
  private logPipe: LogPipe;

  constructor(logPipe: LogPipe) {
    this.logPipe = logPipe;
  }

  async status(_req: Request, res: Response): Promise<void> {
    const offset = await this.logPipe.getOffset();
    res.json({ currentOffset: offset, status: 'running' });
  }

  async topics(_req: Request, res: Response): Promise<void> {
    const topics = await this.logPipe.getTopics();
    res.json({ topics });
  }

  async read(req: Request, res: Response): Promise<void> {
    const topic = req.query.topic as string;
    const start = parseInt(req.query.start as string) || 0;
    const length = parseInt(req.query.length as string) || 100;
    if (!topic) {
      res.status(400).json({ error: 'topic required' });
      return;
    }
    const message = await this.logPipe.readMessage(topic, start, length);
    res.json({ topic, start, length, message });
  }

  // stats api: producers/consumers/groups/reads/date details for topic
  async topicStats(req: Request, res: Response): Promise<void> {
    const topic = req.params.topic as string;
    if (!topic) {
      res.status(400).json({ error: 'topic required' });
      return;
    }
    try {
      const stats = await this.logPipe.getTopicStats(topic);
      res.json(stats);
    } catch (e: any) {
      // specific msg for missing topic
      res.status(404).json({ error: e.message || `Topic '${topic}' does not exist or has no events produced yet` });
    }
  }

  // consumer list/stats (multi-topic, progress, event links, deps)
  async consumers(req: Request, res: Response): Promise<void> {
    const consumerId = req.query.consumerId as string | undefined;
    const stats = await this.logPipe.getConsumers(consumerId);
    res.json({ consumers: stats });
  }

  // groups list/stats (attached consumers, topics/progress)
  async groups(req: Request, res: Response): Promise<void> {
    const groupId = req.query.groupId as string | undefined;
    const stats = await this.logPipe.getGroups(groupId);
    res.json({ groups: stats });
  }
}
