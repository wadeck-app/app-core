import { buildServer, type BuildServerOptions } from './server.js';
import { resolvePort } from './port.js';
import { removePortFile, writePortFile } from './portFile.js';

export interface RunningServer {
  port: number;
  stop(): Promise<void>;
}

// Single start sequence shared by the dev entry point (index.ts) and `app-core-cli serve`:
// listen on the configured port, then publish server.port.json for Orchestrator's portFile liveness.
export async function startServer(opts: BuildServerOptions = {}): Promise<RunningServer> {
  const { server, manager } = await buildServer(opts);
  const port = resolvePort();
  await server.listen({ port, host: '127.0.0.1' });
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
