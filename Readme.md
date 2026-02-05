# LogPipe - Custom Message Broker

A lightweight, file-based message broker for event-driven architectures in Node.js. Stores events/logs in memory and persists to FS for other services to consume.

## Features
- Write events (publish)
- Read events (consume with offset)
- In-memory + FS persistence
- Simple HTTP API
- Follows clean architecture principles

## Quick Start
```bash
npm install
npm run dev
```

## API
- POST /publish - Publish event (HTTP)
- GET /consume?topic=xx&consumerId=xx&offset=0 - Consume events from topic (indexed for perf)
- GET /read?topic=xx&start=0&length=100 - Read specific chunk from topic file (efficient, no full load)
- Cart flow dummies: /api/cart/add, /api/checkout, /api/payment/process, /api/notify/email, /api/cart/remove (publish events, fast response)

## TCP Producer (for superfast appends)
- Connect to port 4000, send JSON `{ "topic": "xx", "data": {} }`
- Receives `SUCCESS:id` or `ERROR:...`
- Run example: `npx ts-node examples/test-producer.ts` (after `npm run dev` in another terminal)

## TCP Consumer (streaming subs with long polling)
- Connect to port 5000, send `SUB topic offset` (e.g. `SUB orders 0`)
- Streams new messages as JSON lines (long poll via interval check on index)
- Run example: `npx ts-node examples/test-consumer.ts` (after `npm run dev`)

## Examples
See `examples/test-logpipe.ts` (run: `npx ts-node examples/test-logpipe.ts`) for usage tests (publish, consume, chunk read).

## Development
- `npm run dev` - Start in dev mode
- `npm run build` - Build TS
- `npm run lint` - Lint code
- `npm run format` - Format code

## Architecture
- Clean Architecture with Core, Interfaces, Adapters
- Best practices: TypeScript, ESLint, Prettier, etc.
