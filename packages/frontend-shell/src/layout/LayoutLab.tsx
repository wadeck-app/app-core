import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutByVariant } from './LayoutByVariant.js';
import { LAYOUT_VARIANTS, LayoutSwitcher } from './LayoutSwitcher.js';
import type { NavModule } from './navModel.js';
import { titleFromId } from './navModel.js';

// Dev-only comparison page (served at /__layout-lab/<variant>, mounted by main.tsx when import.meta.env.DEV).
// Renders each layout with the same five fake modules, a realistic count of pages, to judge how the
// navigation scales. Not part of the production bundle.
// It offers every variant of the real app except the current (classic) layout.
const { classic: _classic, ...VARIANTS } = LAYOUT_VARIANTS;
type VariantId = keyof typeof VARIANTS;

const isVariantId = (v: string | undefined): v is VariantId => v !== undefined && v in VARIANTS;

const FAKE_MODULES: Record<string, string[]> = {
  billing: ['Overview', 'Invoices', 'Customers', 'Payment methods', 'Tax settings'],
  inventory: ['Stock', 'Suppliers', 'Purchase orders'],
  reports: ['Dashboards', 'Scheduled exports'],
  'audit-log': ['Events', 'Retention'],
  // A single page on purpose: variants A and C must not show a side menu for it.
  settings: ['General'],
};

export function fakeNavModules(variant: VariantId): NavModule[] {
  return Object.entries(FAKE_MODULES).map(([id, labels]) => {
    const basePath = `/__layout-lab/${variant}/${id}`;
    return {
      id,
      title: titleFromId(id),
      basePath,
      pages: labels.map((label, i) => ({ moduleId: id, routePath: i === 0 ? basePath : `${basePath}/${i}`, label, exact: i === 0 })),
    };
  });
}

function Placeholder(): React.ReactElement {
  const { pathname } = useLocation();
  return (
    <div className="p-6">
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
        Module page content goes here <code className="text-content">{pathname}</code>
      </div>
    </div>
  );
}

export function LayoutLab(): React.ReactElement {
  const { pathname } = useLocation();
  const variant = /^\/__layout-lab\/([^/]*)/.exec(pathname)?.[1];
  if (!isVariantId(variant)) {
    return (
      <div role="alert" className="p-6 text-danger">
        Unknown layout variant "{variant ?? ''}". Open one of:{' '}
        {Object.keys(VARIANTS).map((v) => (
          <Link key={v} to={`/__layout-lab/${v}`} className="underline">
            /__layout-lab/{v}
          </Link>
        ))}
      </div>
    );
  }
  return (
    <>
      <LayoutByVariant variant={variant} modules={[]} navModules={fakeNavModules(variant)}>
        <Placeholder />
      </LayoutByVariant>
      <LayoutSwitcher
        variant={variant}
        variants={Object.keys(VARIANTS) as VariantId[]}
        // Same module and page in the other variant, so the comparison stays on what is being looked at.
        hrefFor={(v) => pathname.replace(`/__layout-lab/${variant}`, `/__layout-lab/${v}`)}
      />
    </>
  );
}
