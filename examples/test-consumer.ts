import * as net from 'net';

const client = net.connect(5000, 'localhost', () => {
  client.write('SUB orders 0');
});

client.on('data', (data) => {
  console.log('Consumed msg:', data.toString().trim());
});

client.on('error', (err) => console.error('TCP error:', err.message));