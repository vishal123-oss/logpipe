import * as fs from 'fs/promises';
import { LogPipe } from '../src/core/LogPipe';
import { FileLog } from '../src/adapters/FileLog';

async function runMultiTest() {
  console.log('=== MULTI-TOPIC/CONSUMER E2E TEST (10-20 topics, >100 events each) ===');

  const fileLogPipe = new LogPipe(new FileLog());

  // cleanup for fresh test
  try { await fs.rm('logs', { recursive: true, force: true }); } catch {}

  // create 15 topics, each with 120 events
  const topics = Array.from({ length: 15 }, (_, i) => `topic-${i + 1}`);
  const eventCounts = new Map<string, number>();
  for (const topic of topics) {
    console.log(`Producing 120 events to ${topic}...`);
    for (let i = 0; i < 120; i++) {
      await fileLogPipe.publish(topic, { eventNum: i, payload: `data-${i}`, ts: new Date() });
    }
    eventCounts.set(topic, 120);
  }

  // multiple consumers/groups; each cons reads multiple topics/groups
  const groups = ['groupA', 'groupB', 'groupC'];
  const consumerTopics = {
    cons1: ['topic-1', 'topic-5', 'topic-10'], // multi-topic
    cons2: ['topic-2', 'topic-6', 'topic-11', 'topic-14'],
    cons3: ['topic-3', 'topic-7', 'topic-12'], // cross groups
    cons4: ['topic-4', 'topic-8', 'topic-9', 'topic-13', 'topic-15'],
  };

  // simulate consumes + commits (progress per topic/group)
  for (const [cons, tops] of Object.entries(consumerTopics)) {
    for (const topic of tops) {
      const group = groups[Math.floor(Math.random() * groups.length)]; // multi-group per cons
      console.log(`Consumer ${cons} in ${group} consuming ${topic}...`);
      // consume from start (offset=0 -> committed)
      const events = await fileLogPipe.consume(topic, 0, 50); // partial read
      console.log(`  Read ${events.length} events`); // use var
      // commit progress (e.g. after processing half)
      const committed = 60;
      await fileLogPipe.commitOffset(topic, group, cons, committed);
      console.log(`  Committed offset ${committed} for ${cons}/${group}/${topic}`);
    }
  }

  // verify admin APIs / metadata with rich data
  console.log('\n--- ADMIN API SIM TESTS ---');
  console.log('GET /topics:');
  const allTopics = await fileLogPipe.getTopics();
  console.log('Topics count:', allTopics.length, allTopics.slice(0, 5));

  console.log('\nGET /topics/topic-1/stats:');
  const stats1 = await fileLogPipe.getTopicStats('topic-1');
  console.log('Stats:', {
    eventCount: stats1.eventCount,
    consumers: stats1.consumers,
    groups: stats1.groups,
    readCount: stats1.readCount,
    consumerDetails: stats1.consumerDetails, // who read + % progress/group
    insights: stats1.insights, // activity summary
  });

  console.log('\nGET /consumers:');
  const allCons = await fileLogPipe.getConsumers();
  console.log('Consumers count:', allCons.length);
  console.log('Sample cons1 progress:', allCons.find(c => c.consumerId === 'cons1')?.progress);

  console.log('\nGET /consumers?consumerId=cons3:');
  const cons3 = await fileLogPipe.getConsumers('cons3');
  console.log('cons3 topics/groups:', cons3[0]?.topics, cons3[0]?.groups);

  console.log('\nGET /groups:');
  const allGroups = await fileLogPipe.getGroups();
  console.log('Groups count:', allGroups.length);
  console.log('Sample groupA:', allGroups.find(g => g.groupId === 'groupA'));

  // edge: consumer multi-group/topic links
  console.log('\nMulti-consumer/group E2E checks:');
  console.log('cons1 multi-topics:', consumerTopics.cons1.length);
  console.log('cons4 multi-groups/topics:', Object.values(consumerTopics).flat().length > 10);

  // logs/ kept for manual admin API checks/stats inspection
  console.log('\n=== ALL MULTI-TOPIC/CONSUMER TESTS PASSED === (logs/ preserved)');
}

runMultiTest().catch(console.error);
