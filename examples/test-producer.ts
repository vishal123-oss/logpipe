import * as net from 'net';

const client = net.connect(4000, 'localhost', () => {
  const payload = { topic: 'orders', data: { orderId: 999, status: 'paid' } };
  client.write(JSON.stringify(payload));
});

client.on('data', (data) => {
  console.log('Producer response:', data.toString().trim());
  client.end();
});

client.on('error', (err) => console.error('TCP error:', err.message));