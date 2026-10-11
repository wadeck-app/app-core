// Fixture D: a widget (not a page) that
// registers its own HTTP route and fetches it live via $sources, proving
// widget/page have equal capability (only placement differs).
export default function (moduleContext) {
  moduleContext.registerRoute('GET', '/count', (_req, reply) => {
    return reply.code(200).send({ count: 42 });
  });
}
