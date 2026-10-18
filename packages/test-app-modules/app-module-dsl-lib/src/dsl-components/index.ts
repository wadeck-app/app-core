// Source of the dsl-lib fixture bundle: `app-core-cli package` builds it into dist-module/dsl-lib/entries.mjs.
// It default-exports the ComponentRegistryEntry[] the shell registers under this module's id ("dsl-lib").
import { createElement } from 'react';
import { useParams } from 'react-router-dom';
import { resolveExpressionValue } from '@wadeck-app/dsl-renderer';
// A deep dsl-ui import, as entriesGenerator output uses: `package` maps it to the shared dsl-ui.
import { Badge } from '@wadeck-app/dsl-ui/dist/components/display/Badge.js';

// Printed by every component, so tests can tell which build of the fixture is on screen.
const LABEL = 'v1';

type RenderProps = { node: Record<string, unknown>; ctx: Parameters<typeof resolveExpressionValue>[1] };

function Hello({ who }: { who: string }) {
  return createElement(
    'div',
    { className: 'dsllib-fixture-hello' },
    createElement('span', { id: 'dsllib-hello' }, `${LABEL} hello ${who}`),
    createElement(Badge, { label: 'dsl-ui-badge', variant: 'success' }),
  );
}

function RouteParam({ id }: { id: string }) {
  const params = useParams();
  return createElement('p', { id: 'dsllib-route-param' }, `${LABEL} item=${id} hook=${params.id}`);
}

function NavbarStat({ text }: { text: string }) {
  return createElement('span', { id: 'dsllib-navbar', className: 'dsllib-fixture-navbar' }, `${LABEL} navbar ${text}`);
}

function OverlayBox({ text }: { text: string }) {
  return createElement('div', { id: 'dsllib-overlay', className: 'dsllib-fixture-overlay' }, `${LABEL} overlay ${text}`);
}

// Used by views that exercise the shell's per-widget error boundary.
function Boom() {
  throw new Error(`${LABEL} fixture boom`);
}

export default [
  {
    name: 'Hello',
    category: 'atomic',
    tags: [],
    render: ({ node, ctx }: RenderProps) => createElement(Hello, { who: String(resolveExpressionValue(node['who'], ctx) ?? '') }),
  },
  {
    name: 'RouteParam',
    category: 'atomic',
    tags: [],
    render: ({ node, ctx }: RenderProps) => createElement(RouteParam, { id: String(resolveExpressionValue(node['id'], ctx) ?? '') }),
  },
  {
    name: 'NavbarStat',
    category: 'atomic',
    tags: [],
    render: ({ node, ctx }: RenderProps) => createElement(NavbarStat, { text: String(resolveExpressionValue(node['text'], ctx) ?? '') }),
  },
  {
    name: 'OverlayBox',
    category: 'atomic',
    tags: [],
    render: ({ node, ctx }: RenderProps) => createElement(OverlayBox, { text: String(resolveExpressionValue(node['text'], ctx) ?? '') }),
  },
  {
    name: 'Boom',
    category: 'atomic',
    tags: [],
    render: () => createElement(Boom),
  },
];
