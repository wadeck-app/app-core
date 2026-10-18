import React from 'react';

export function VersionRow({ name, children }: { name: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-6 py-0.5">
      <dt className="text-muted">{name}</dt>
      <dd className="font-mono text-content">{children}</dd>
    </div>
  );
}
