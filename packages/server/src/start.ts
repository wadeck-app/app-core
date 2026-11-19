import { buildServer, type BuildServerOptions } from './server.js';
import { resolvePort } from './port.js';
import { removePortFile, writePortFile } from './portFile.js';

export interface RunningServer {
  port: number;
  stop(): Promise<void>;
}

// Single start sequence shared by the dev entry point (index.ts) and `app-core-cli serve`:
// listen on the configured port, then publish server.port.json for Orchestrator's portFile liveness.
// `port` wins over APP_CORE_PORT (an application made of one module asks for its own, next to a global app-core on 4850).
export async function startServer(opts: BuildServerOptions & { port?: number } = {}): Promise<RunningServer> {
  const { server, manager } = await buildServer(opts);
  const requested = opts.port ?? resolvePort();
  await server.listen({ port: requested, host: '127.0.0.1' });
  // Port 0 asks the system for a free port: the port file and the caller need the one really bound, never 0.
  const address = server.server.address();
  const port = typeof address === 'object' && address !== null ? address.port : requested;
  writePortFile(port, opts.configDir);
  return {
    port,
    stop: async () => {
      removePortFile(opts.configDir);
      // Teardown + dispose of every module first, so streaming responses end and no hook runs while
      // the server is draining; server.close() runs it again (a no-op) for the other close paths.
      await manager.shutdown();
      await server.close();
    },
  };
}
