// Source of the dsl-lib fixture bundle (built by build.mjs into app-module-dsl-lib/dsl-lib/entries.mjs).
// It lives outside app-module-*/ because module folders must not contain React source.
import { createElement } from 'react';
import { useParams } from 'react-router-dom';
import { resolveExpressionValue } from '@wadeck-app/dsl-renderer';
// A deep dsl-ui import, as entriesGenerator output uses: build.mjs maps it to the shared dsl-ui.
import { Badge } from '@wadeck-app/dsl-ui/dist/components/display/Badge.js';

// Replaced by build.mjs (esbuild define).
const LABEL = __FIXTURE_LABEL__;

function Hello({ who }) {
  return createElement(
    'div',
    { className: 'dsllib-fixture-hello' },
    createElement('span', { id: 'dsllib-hello' }, `${LABEL} hello ${who}`),
    createElement(Badge, { label: 'dsl-ui-badge', variant: 'success' }),
  );
}

function RouteParam({ id }) {
  const params = useParams();
  return createElement('p', { id: 'dsllib-route-param' }, `${LABEL} item=${id} hook=${params.id}`);
}

export default [
  {
    name: 'Hello',
    category: 'atomic',
    tags: [],
    render: ({ node, ctx }) => createElement(Hello, { who: String(resolveExpressionValue(node['who'], ctx) ?? '') }),
  },
  {
    name: 'RouteParam',
    category: 'atomic',
    tags: [],
    render: ({ node, ctx }) => createElement(RouteParam, { id: String(resolveExpressionValue(node['id'], ctx) ?? '') }),
  },
];
