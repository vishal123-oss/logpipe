# LogPipe – APIs and Producer/Consumer Flow

Base URL (HTTP): **http://localhost:3000**  
TCP Producer: **localhost:4000**  
TCP Consumer: **localhost:5000**

---

## Steps to do (copy-paste order)

**Prerequisite:** Start server: `npm run dev`

### Step 1 – Publish events (producer)

**What this step is doing:** The producer writes three events to the topic `orders`. Each event is appended to the topic log and gets a position (offset 0, 1, 2). No consumer is involved yet—this only adds data to the broker.

**Endpoint:** `POST http://localhost:3000/publish`

```bash
curl -X POST http://localhost:3000/publish -H "Content-Type: application/json" \
  -d '{"topic":"orders","data":{"orderId":1,"status":"created"}}'
```

```bash
curl -X POST http://localhost:3000/publish -H "Content-Type: application/json" \
  -d '{"topic":"orders","data":{"orderId":2,"status":"paid"}}'
```

```bash
curl -X POST http://localhost:3000/publish -H "Content-Type: application/json" \
  -d '{"topic":"orders","data":{"orderId":3,"status":"shipped"}}'
```

---

### Step 2 – Consume from start (consumer, first time)

**What this step is doing:** Consumer `alice` (in group `notifications`) reads from topic `orders`. She has no committed offset yet, so the server uses offset 0 and returns all events from the start. The response includes `events`, `offset` (0), and `count`. We do not commit yet, so the next call would still see the same events.

**Endpoint:** `GET http://localhost:3000/consume?topic=orders&consumerId=alice&groupId=notifications`

```bash
curl "http://localhost:3000/consume?topic=orders&consumerId=alice&groupId=notifications"
```

You get `events` (e.g. 3) and `offset` (e.g. 0). No commit yet.

---

### Step 3 – Commit offset (save progress: “I processed 2 events”)

**What this step is doing:** We tell the broker that `alice` has finished processing up to (but not including) offset 2—i.e. she processed events at index 0 and 1. The broker stores this in `logs/offsets.json` so that the next time alice consumes without passing an offset, she will resume from 2 and not see those events again.

**Endpoint:** `POST http://localhost:3000/commit-offset`

```bash
curl -X POST http://localhost:3000/commit-offset -H "Content-Type: application/json" \
  -d '{"topic":"orders","groupId":"notifications","consumerId":"alice","offset":2}'
```

---

### Step 4 – Get committed offset (inspect)

**What this step is doing:** We ask the broker what offset it has stored for `alice` on topic `orders` in group `notifications`. This is read-only; it shows that the commit in Step 3 was persisted (e.g. `offset: 2`). Useful for debugging or dashboards.

**Endpoint:** `GET http://localhost:3000/offset?topic=orders&consumerId=alice&groupId=notifications`

```bash
curl "http://localhost:3000/offset?topic=orders&consumerId=alice&groupId=notifications"
```

Response: `{ "topic", "groupId", "consumerId", "offset": 2 }`.

---

### Step 5 – Consume again (resume from committed offset)

**What this step is doing:** Alice consumes again with the same `consumerId` and `groupId`, but we do not pass `offset` in the URL. The server looks up her committed offset (2) and returns only events from index 2 onward. This demonstrates resume: after a restart or another process, the consumer continues from where it left off instead of re-reading from 0.

**Endpoint:** `GET http://localhost:3000/consume?topic=orders&consumerId=alice&groupId=notifications`

(No `offset` in URL → server uses committed offset 2.)

```bash
curl "http://localhost:3000/consume?topic=orders&consumerId=alice&groupId=notifications"
```

You get only events from index 2 onward (e.g. 1 event).

---

### Step 6 – Second consumer (different consumerId)

**What this step is doing:** We introduce a second consumer, `bob`, on the same topic and group. Bob has no committed offset, so his first consume starts at 0 and returns all events. Then we commit bob at offset 1 (he “processed” the first event). This shows that each consumer has its own progress: alice at 2, bob at 1. Multiple consumers can read the same topic independently.

**Endpoint:** `GET http://localhost:3000/consume?topic=orders&consumerId=bob&groupId=notifications`

```bash
curl "http://localhost:3000/consume?topic=orders&consumerId=bob&groupId=notifications"
```

Bob has no committed offset → reads from 0 and gets all events. Then commit Bob at 1:

**Endpoint:** `POST http://localhost:3000/commit-offset`

```bash
curl -X POST http://localhost:3000/commit-offset -H "Content-Type: application/json" \
  -d '{"topic":"orders","groupId":"notifications","consumerId":"bob","offset":1}'
```

---

### Step 7 – Check status (optional)

**What this step is doing:** Returns broker health and global metadata (e.g. total log length / current offset). Does not depend on any topic or consumer; use it to confirm the server is running.

**Endpoint:** `GET http://localhost:3000/status`

```bash
curl "http://localhost:3000/status"
```

---

## API reference

### 1. Producer APIs (writing events)

### HTTP: Publish event

**POST** `/publish`

| Body (JSON) | Description |
|-------------|-------------|
| `topic`    | Topic name (string) |
| `data`     | Payload (any JSON object) |

**Example:**
```bash
curl -X POST http://localhost:3000/publish \
  -H "Content-Type: application/json" \
  -d '{"topic":"orders","data":{"orderId":101,"status":"paid"}}'
```
**Response:** `{ "success": true, "entry": { "id", "timestamp", "topic", "data" } }`

---

### TCP: Produce via socket (port 4000)

Send one JSON line per message:
```json
{"topic":"orders","data":{"orderId":102,"status":"shipped"}}
```
**Response:** `SUCCESS:<entry-id>`

**Example (script):** `npm run example:producer` (sends one message and exits)

---

## 2. Consumer APIs (reading events + offset)

### HTTP: Consume (read from topic)

**GET** `/consume`

| Query param | Default   | Description |
|-------------|-----------|-------------|
| `topic`     | required  | Topic to read |
| `consumerId`| `default` | Consumer identity (for resume) |
| `groupId`   | `default` | Consumer group |
| `offset`    | *see below* | Start index; if **0 or omitted**, server uses **committed offset** for this consumerId+groupId |
| `limit`     | `100`     | Max events to return |

**Flow:**  
- If `offset=0` (or not set): server calls `getCommittedOffset(topic, groupId, consumerId)` and reads from that position (resume).  
- If `offset>0`: server reads from that index (explicit replay).

**Example (resume by consumerId):**
```bash
curl "http://localhost:3000/consume?topic=orders&consumerId=alice&groupId=notifications"
```
**Response:** `{ "consumerId", "groupId", "topic", "offset", "events", "count" }`

---

### HTTP: Get committed offset

**GET** `/offset`

| Query param | Default   | Description |
|-------------|-----------|-------------|
| `topic`     | required  | Topic |
| `consumerId`| `default` | Consumer identity |
| `groupId`   | `default` | Consumer group |

**Example:**
```bash
curl "http://localhost:3000/offset?topic=orders&consumerId=alice&groupId=notifications"
```
**Response:** `{ "topic", "groupId", "consumerId", "offset" }`

---

### HTTP: Commit offset (save progress)

**POST** `/commit-offset`

| Body (JSON) | Default   | Description |
|-------------|-----------|-------------|
| `topic`     | required  | Topic |
| `groupId`   | `default` | Consumer group |
| `consumerId`| `default` | Consumer identity |
| `offset`    | required  | Next position to read from (e.g. after processing N events, commit N) |

**Example:**
```bash
curl -X POST http://localhost:3000/commit-offset \
  -H "Content-Type: application/json" \
  -d '{"topic":"orders","groupId":"notifications","consumerId":"alice","offset":5}'
```
**Response:** `{ "success": true, "topic", "groupId", "consumerId", "offset" }`

---

### TCP: Consume via socket (port 5000)

Send a subscription line:

- **Compat:** `SUB <topic> <offset>`  
  e.g. `SUB orders 0` → read from index 0.
- **With consumerId/groupId:** `SUB <topic> <groupId> <consumerId> [offset]`  
  If `offset` is omitted, server uses **committed offset** for that consumer and commits as it streams.

**Example (script):** `npm run example:consumer` (subscribes to `orders` from 0)

---

## 3. Other HTTP APIs

| Method | Path        | Purpose |
|--------|-------------|---------|
| GET    | `/status`   | Broker status; `currentOffset` = total log length |
| GET    | `/topics`   | List all topics with tag (producer_events = has log events; consumer_events = has offset commits) |
| GET    | `/topics/:topic/stats` | Detailed stats (producers/consumers/groups, event counts, reads, date-wise creation) |
| GET    | `/consumers?consumerId=xx` | List consumers + multi-topic stats (progress, event links, groups/deps, reads) |
| GET    | `/groups?groupId=xx` | List groups + stats (attached consumers, topics, progress) |
| GET    | `/read`     | Raw read: `?topic=...&start=0&length=100` |

---

## 4. End-to-end flow (producer → consumer)

```
┌─────────────┐                    ┌─────────────┐                    ┌─────────────┐
│  PRODUCER   │                    │   LOGPIPE   │                    │  CONSUMER   │
│             │                    │   (broker)  │                    │             │
└──────┬──────┘                    └──────┬──────┘                    └──────┬──────┘
       │                                  │                                  │
       │  POST /publish                    │                                  │
       │  { topic, data }                  │                                  │
       │ ────────────────────────────────>│                                  │
       │                                  │ append to topic log               │
       │  { success, entry }               │                                  │
       │ <────────────────────────────────│                                  │
       │                                  │                                  │
       │                                  │     GET /consume?topic=orders    │
       │                                  │     &consumerId=alice&groupId=g1  │
       │                                  │ <─────────────────────────────────
       │                                  │ (use committed offset for alice)  │
       │                                  │ read(topic, offset, limit)        │
       │                                  │ { events, offset, count }         │
       │                                  │ ─────────────────────────────────>
       │                                  │                                  │
       │                                  │     POST /commit-offset           │
       │                                  │     { topic, groupId, consumerId, │
       │                                  │       offset: 3 }                 │
       │                                  │ <─────────────────────────────────
       │                                  │ save in offsets.json              │
       │                                  │ { success }                       │
       │                                  │ ─────────────────────────────────>
       │                                  │                                  │
       │  (more publishes...)              │     GET /consume (same consumer)  │
       │ ────────────────────────────────>│     (no offset in URL)            │
       │                                  │ <─────────────────────────────────
       │                                  │ use committed offset (3) → resume │
       │                                  │ { events from index 3, ... }      │
       │                                  │ ─────────────────────────────────>
```

**In short:**

1. **Producer** calls **POST /publish** (or TCP to 4000) → events are appended to the topic log.
2. **Consumer** calls **GET /consume** with `topic` + optional `consumerId`/`groupId`:
   - If **offset is 0 or omitted**: server uses **committed offset** for that `(topic, groupId, consumerId)` → consumer **resumes** where it left off.
   - If **offset > 0**: server reads from that index (explicit position).
3. After processing events, **consumer** calls **POST /commit-offset** with the **next** offset (e.g. current + count of processed events).
4. Next **GET /consume** with same `consumerId`/`groupId` (and no offset) returns events **after** the committed offset.
5. **GET /offset** lets you **inspect** the current committed offset for a consumer.

So: **producer** = write to topic; **consumer** = read from topic using **consumerId + offset** for progress and resume.
