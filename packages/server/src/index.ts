// violations-suppress: ts/no-barrel-index process entry point (starts the server), not a re-export barrel
import { buildServer } from './server.js';
import { resolvePort } from './port.js';
import { removePortFile, writePortFile } from './portFile.js';

const { server } = await buildServer();
const port = resolvePort();
await server.listen({ port, host: '127.0.0.1' });
writePortFile(port);
process.stdout.write(JSON.stringify({ type: 'ready', port }) + '\n');

function shutdown(): void {
  removePortFile();
  void server.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
