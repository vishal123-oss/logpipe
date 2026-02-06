import * as net from 'net';
import { LogPipe } from '../core/LogPipe';
import { FileLog } from '../adapters/FileLog';

export class TcpProducer {
  private server: net.Server;
  private logPipe: LogPipe;
  private port: number;

  constructor(port = 4000) {
    this.port = port;
    this.logPipe = new LogPipe(new FileLog());
    this.server = net.createServer((socket) => this.handleConnection(socket));
  }

  private handleConnection(socket: net.Socket): void {
    socket.on('data', async (data) => {
      try {
        const request = JSON.parse(data.toString().trim());
        const { topic, data: messageData } = request;
        if (!topic || !messageData) {
          socket.write('ERROR: topic and data required\n');
          return;
        }
        const entry = await this.logPipe.publish(topic, messageData);
        socket.write(`SUCCESS:${entry.id}\n`);
      } catch {
        socket.write('ERROR: invalid format\n');
      }
    });

    socket.on('end', () => {});
  }

  start(): void {
    this.server.listen(this.port, () => {
      console.log(`TCP Producer listening on port ${this.port}`);
    });
  }

  stop(): void {
    this.server.close();
  }
}
