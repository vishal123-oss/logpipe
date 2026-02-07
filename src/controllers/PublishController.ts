import { Request, Response } from 'express';
import { LogPipe } from '../core/LogPipe';

export class PublishController {
  private logPipe: LogPipe;

  constructor(logPipe: LogPipe) {
    this.logPipe = logPipe;
  }

  async publish(req: Request, res: Response): Promise<void> {
    const { topic, data } = req.body;
    if (!topic || !data) {
      res.status(400).json({ error: 'topic and data required' });
      return;
    }
    const entry = await this.logPipe.publish(topic, data);
    res.json({ success: true, entry });
  }

  // cart dummy handlers (publish events)
  async addToCart(req: Request, res: Response): Promise<void> {
    const { userId, item } = req.body;
    if (!userId || !item) {
      res.status(400).json({ error: 'userId and item required' });
      return;
    }
    const event = await this.logPipe.publish('cart.add', {
      userId,
      item,
      timestamp: new Date(),
    });
    res.json({
      success: true,
      message: 'Item added - processing async',
      eventId: event.id,
    });
  }

  async removeFromCart(req: Request, res: Response): Promise<void> {
    const { userId, itemId } = req.body;
    const event = await this.logPipe.publish('cart.remove', {
      userId,
      itemId,
      timestamp: new Date(),
    });
    res.json({
      success: true,
      message: 'Item removed - processing async',
      eventId: event.id,
    });
  }

  async checkout(req: Request, res: Response): Promise<void> {
    const { userId, total } = req.body;
    if (!userId || !total) {
      res.status(400).json({ error: 'userId and total required' });
      return;
    }
    const event = await this.logPipe.publish('order.create', {
      userId,
      total,
      timestamp: new Date(),
    });
    res.json({
      success: true,
      message: 'Checkout initiated - async inventory/email',
      eventId: event.id,
    });
  }

  async processPayment(req: Request, res: Response): Promise<void> {
    const { orderId, amount } = req.body;
    const event = await this.logPipe.publish('payment.process', {
      orderId,
      amount,
      timestamp: new Date(),
    });
    res.json({
      success: true,
      message: 'Payment queued async',
      eventId: event.id,
    });
  }

  async sendEmailNotification(req: Request, res: Response): Promise<void> {
    const { userId, orderId } = req.body;
    const event = await this.logPipe.publish('notification.email', {
      userId,
      orderId,
      timestamp: new Date(),
    });
    res.json({
      success: true,
      message: 'Notification sent async',
      eventId: event.id,
    });
  }
}
