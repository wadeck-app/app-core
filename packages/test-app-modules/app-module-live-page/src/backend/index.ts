type Reply = { code: (status: number) => { send: (body: unknown) => unknown } };
type ModuleContext = { registerRoute: (method: string, path: string, handler: (req: unknown, reply: Reply) => unknown) => void };

// Fixture C: registers its own HTTP route,
// whose data a $sources entry in page.yaml fetches live via GenericPageRunner.
export default function (moduleContext: ModuleContext): void {
  moduleContext.registerRoute('GET', '/greeting', (_req, reply) => {
    return reply.code(200).send({ message: 'hello-from-module-c' });
  });
}
