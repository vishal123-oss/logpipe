import express from 'express';
import { LogPipe } from './core/LogPipe';
import { FileLog } from './adapters/FileLog';
import { TcpProducer } from './producer/TcpProducer';
import { TcpConsumer } from './consumer/TcpConsumer';
import { createRoutes } from './routes';
import { errorHandler } from './middleware/asyncHandler';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const logPipe = new LogPipe(new FileLog());
const tcpProducer = new TcpProducer(4000);
tcpProducer.start();
const tcpConsumer = new TcpConsumer(5000);
tcpConsumer.start();

// mount MVC routes (producer/consumer/admin)
app.use(createRoutes(logPipe));

// global error middleware (catches from asyncHandler/next(err) in all routes)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`LogPipe broker running on http://localhost:${PORT}`);
});
