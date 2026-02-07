export interface LogEntry {
  id: string;
  timestamp: Date;
  topic: string;
  data: any;
  position?: { start: number; length: number };
}

// stats for a topic (producer/consumer details, reads, date aggregates, per-consumer % progress)
export interface TopicStats {
  topic: string;
  eventCount: number;
  producedDates: string[]; // YYYY-MM-DD for date-wise creation
  producers: string[]; // placeholder (events produced via publish/TCP; extendable)
  consumers: string[]; // unique consumerIds
  groups: string[]; // unique groupIds involved
  readCount: number; // total consume calls
  lastReadAt?: Date;
  firstEventAt?: Date;
  lastEventAt?: Date;
  consumerDetails: Array<{ // who read, % progress, group
    consumerId: string;
    groupId: string;
    committedOffset: number;
    percentRead: number; // e.g. 50 for half
    eventsReadApprox: number;
  }>;
  insights: { // activity summary
    totalUniqueReaders: number;
    avgProgressPercent: number;
    activityLevel: string; // low/medium/high based on reads
  };
}

// stats for a consumer (multi-topic support, progress, links via offsets)
export interface ConsumerStats {
  consumerId: string;
  groups: string[];
  topics: string[]; // topics this consumer has read/committed on
  progress: Array<{ topic: string; committedOffset: number; lastEventLink?: string }>; // per-topic progress + event link example
  totalEventsConsumed: number; // aggregate across topics
  dependencies: string[]; // e.g. groups/topics as deps
  lastActivity?: Date;
}

// stats for a group (attached consumers, topics/progress)
export interface GroupStats {
  groupId: string;
  consumers: string[]; // attached
  topics: string[]; // topics read in group
  progress: Array<{ topic: string; avgOffset: number; consumersCount: number }>; // per-topic
  totalEventsConsumed: number;
  insights: { totalConsumers: number; avgProgress: number };
}

export interface LogStorage {
  append(entry: LogEntry): Promise<void>;
  read(topic: string, offset: number, limit?: number): Promise<LogEntry[]>;
  getLength(): Promise<number>;
  readMessage(topic: string, start: number, length: number): Promise<string>;
  commitOffset(topic: string, groupId: string, consumerId: string, offset: number): Promise<void>;
  getCommittedOffset(topic: string, groupId: string, consumerId: string): Promise<number>;

  // get topics with producer/consumer tag
  getTopics(): Promise<Array<{ topic: string; tag: 'producer_events' | 'consumer_events' }>>;

  // detailed stats for a topic
  getTopicStats(topic: string): Promise<TopicStats>;

  // list/stats for consumers (multi-topic progress, links, deps)
  getConsumers(consumerId?: string): Promise<ConsumerStats[]>;

  // list/stats for groups (consumers/topics/progress)
  getGroups(groupId?: string): Promise<GroupStats[]>;
}
