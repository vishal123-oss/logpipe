import express, { Request, Response } from 'express';
import { LogPipe } from './core/LogPipe';
import { FileLog } from './adapters/FileLog';
import { TcpProducer } from './producer/TcpProducer';
import { TcpConsumer } from './consumer/TcpConsumer';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const logPipe = new LogPipe(new FileLog());
const tcpProducer = new TcpProducer(4000);
tcpProducer.start();
const tcpConsumer = new TcpConsumer(5000);
tcpConsumer.start();

app.post('/publish', async (req: Request, res: Response): Promise<void> => {
  const { topic, data } = req.body;
  if (!topic || !data) {
    res.status(400).json({ error: 'topic and data required' });
    return;
  }
  const entry = await logPipe.publish(topic, data);
  res.json({ success: true, entry });
});

app.get('/consume', async (req: Request, res: Response): Promise<void> => {
  const topic = req.query.topic as string;
  const offset = parseInt(req.query.offset as string) || 0;
  const limit = parseInt(req.query.limit as string) || 100;
  const consumerId = (req.query.consumerId as string) || 'default';
  if (!topic) {
    res.status(400).json({ error: 'topic required' });
    return;
  }
  const events = await logPipe.consume(topic, offset, limit);
  res.json({ consumerId, topic, offset, events, count: events.length });
});

app.get('/status', async (_req: Request, res: Response): Promise<void> => {
  const offset = await logPipe.getOffset();
  res.json({ currentOffset: offset, status: 'running' });
});

app.get('/read', async (req: Request, res: Response): Promise<void> => {
  const topic = req.query.topic as string;
  const start = parseInt(req.query.start as string) || 0;
  const length = parseInt(req.query.length as string) || 100;
  if (!topic) {
    res.status(400).json({ error: 'topic required' });
    return;
  }
  const message = await logPipe.readMessage(topic, start, length);
  res.json({ topic, start, length, message });
});

// Dummy e-commerce cart APIs (integrate with LogPipe for async flows)
app.post(
  '/api/cart/add',
  async (req: Request, res: Response): Promise<void> => {
    const { userId, item } = req.body;
    if (!userId || !item) {
      res.status(400).json({ error: 'userId and item required' });
      return;
    }
    const event = await logPipe.publish('cart.add', {
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
);

app.post(
  '/api/cart/remove',
  async (req: Request, res: Response): Promise<void> => {
    const { userId, itemId } = req.body;
    const event = await logPipe.publish('cart.remove', {
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
);

app.post(
  '/api/checkout',
  async (req: Request, res: Response): Promise<void> => {
    const { userId, total } = req.body;
    if (!userId || !total) {
      res.status(400).json({ error: 'userId and total required' });
      return;
    }
    const event = await logPipe.publish('order.create', {
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
);

app.post(
  '/api/payment/process',
  async (req: Request, res: Response): Promise<void> => {
    const { orderId, amount } = req.body;
    const event = await logPipe.publish('payment.process', {
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
);

app.post(
  '/api/notify/email',
  async (req: Request, res: Response): Promise<void> => {
    const { userId, orderId } = req.body;
    const event = await logPipe.publish('notification.email', {
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
);

app.listen(PORT, () => {
  console.log(`LogPipe broker running on http://localhost:${PORT}`);
});
