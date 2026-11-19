type Reply = { code: (status: number) => { send: (body: unknown) => unknown } };
type RouteOptions = { effect?: 'read' | 'write' | 'sensitive' };
type ModuleContext = { registerRoute: (method: string, path: string, handler: (req: unknown, reply: Reply) => unknown, options?: RouteOptions) => void };

// Fixture of the PIN protection: one route declared sensitive (it answers only with the access token the PIN unlocks), one that is
// not, to check that the gate touches nothing else.
export default function (moduleContext: ModuleContext): void {
  moduleContext.registerRoute('POST', '/launch', (_req, reply) => reply.code(200).send({ launched: true }), { effect: 'sensitive' });
  moduleContext.registerRoute('GET', '/open', (_req, reply) => reply.code(200).send({ open: true }));
}
