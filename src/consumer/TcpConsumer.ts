import * as net from 'net';
import { LogPipe } from '../core/LogPipe';
import { FileLog } from '../adapters/FileLog';

export class TcpConsumer {
  private server: net.Server;
  private logPipe: LogPipe;
  private port: number;
  private subscriptions: Map<
    net.Socket,
    { topic: string; groupId: string; consumerId: string; offset: number }
  > = new Map();

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
          const parts = msg.split(' ');
          const topic = parts[1];
          let groupId = 'default';
          let consumerId = 'default';
          let offset = 0;
          if (parts.length === 3) {
            // compat: SUB topic offset
            offset = parseInt(parts[2] || '0');
          } else if (parts.length >= 4) {
            // SUB topic groupId consumerId [offset]
            groupId = parts[2];
            consumerId = parts[3];
            if (parts.length > 4) {
              offset = parseInt(parts[4] || '0');
            } else {
              // read committed progress if offset omitted
              offset = await this.logPipe.getCommittedOffset(
                topic,
                groupId,
                consumerId
              );
            }
          } else {
            // SUB topic -- use committed with defaults
            offset = await this.logPipe.getCommittedOffset(
              topic,
              groupId,
              consumerId
            );
          }
          this.subscriptions.set(socket, { topic, groupId, consumerId, offset });
          // commit initial offset for tracking
          await this.logPipe.commitOffset(
            topic,
            groupId,
            consumerId,
            offset
          );
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
        // commit updated offset to storage to persist progress (resume on reconnect/crash)
        await this.logPipe.commitOffset(
          sub.topic,
          sub.groupId,
          sub.consumerId,
          currentOffset
        );
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
