import * as net from 'net';

const client = net.connect(5000, 'localhost', () => {
  // use explicit groupId/consumerId (defaults ok; offset from committed if omitted)
  client.write('SUB orders default default 0');
});

client.on('data', (data) => {
  console.log('Consumed msg:', data.toString().trim());
});

client.on('error', (err) => console.error('TCP error:', err.message));