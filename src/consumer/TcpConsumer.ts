import * as net from 'net';
import { LogPipe } from '../core/LogPipe';
import { FileLog } from '../adapters/FileLog';

export class TcpConsumer {
  private server: net.Server;
  private logPipe: LogPipe;
  private port: number;
  private subscriptions: Map<net.Socket, { topic: string; offset: number }> =
    new Map();

  constructor(port = 5000) {
    this.port = port;
    this.logPipe = new LogPipe(new FileLog());
    this.server = net.createServer((socket) => this.handleConnection(socket));
  }

  private handleConnection(socket: net.Socket): void {
    socket.on('data', async (data) => {
      try {
        const msg = data.toString().trim();
        if (msg.startsWith('SUB ')) {
          const [, topic, offsetStr] = msg.split(' ');
          const offset = parseInt(offsetStr || '0');
          this.subscriptions.set(socket, { topic, offset });
          await this.streamMessages(socket);
        }
      } catch {
        socket.write('ERROR: invalid sub format\n');
      }
    });

    socket.on('end', () => {
      this.subscriptions.delete(socket);
    });
    socket.on('error', () => {
      this.subscriptions.delete(socket);
    });
  }

  private async streamMessages(socket: net.Socket): Promise<void> {
    const sub = this.subscriptions.get(socket);
    if (!sub) return;
    let currentOffset = sub.offset;
    const interval = setInterval(async () => {
      const events = await this.logPipe.consume(sub.topic, currentOffset, 10);
      if (events.length > 0) {
        events.forEach((event) => {
          socket.write(JSON.stringify(event) + '\n');
        });
        currentOffset += events.length;
        this.subscriptions.set(socket, { ...sub, offset: currentOffset });
      }
    }, 1000);
    (socket as any).pollInterval = interval;
  }

  start(): void {
    this.server.listen(this.port, () => {
      console.log(`TCP Consumer listening on port ${this.port}`);
    });
  }

  stop(): void {
    this.server.close();
    this.subscriptions.forEach((_, socket) => {
      const interval = (socket as any).pollInterval;
      if (interval) clearInterval(interval);
    });
  }
}
