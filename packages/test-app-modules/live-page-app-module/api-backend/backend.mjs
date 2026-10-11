// Fixture C: exercises Decision #26 end-to-end -- registers its own HTTP route,
// whose data a $sources entry in page.yaml fetches live via GenericPageRunner.
export default function (moduleContext) {
  moduleContext.registerRoute('GET', '/greeting', (_req, reply) => {
    return reply.code(200).send({ message: 'hello-from-module-c' });
  });
}
