import { buildServer } from './server.js';
import { resolvePort } from './port.js';

const { server } = await buildServer();
const port = resolvePort();
await server.listen({ port, host: '127.0.0.1' });
process.stdout.write(JSON.stringify({ type: 'ready', port }) + '\n');

function shutdown(): void {
  void server.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
