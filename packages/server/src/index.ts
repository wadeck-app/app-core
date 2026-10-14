// violations-suppress: ts/no-barrel-index process entry point (starts the server), not a re-export barrel
import { startServer } from './start.js';

const { port, stop } = await startServer();
process.stdout.write(JSON.stringify({ type: 'ready', port }) + '\n');

function shutdown(): void {
  void stop().finally(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
