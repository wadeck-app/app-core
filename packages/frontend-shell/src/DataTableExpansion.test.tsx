import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ModulePage } from './ModulePage.js';
import type { LoadedModuleSummary } from './types.js';

// DataTable `expansion` needs a renderNode callback that dsl-renderer's entriesGenerator emits
// into src/generated/entries.tsx. A stale generated file (older generator) parses the YAML
// instead and the row toggle opens nothing, so this exercises the real generated registry.
const rawYaml = `
$type: DataTable
rows:
  - { id: "1", event: "with-payload", payloadText: "{\\"hello\\":\\"world\\"}" }
  - { id: "2", event: "without-payload" }
columns:
  - { key: "event", label: "Event" }
expansionCondition: payloadText
expansion:
  $type: JsonViewer
  row: $ctx.row
  field: payloadText
`;

const modules: LoadedModuleSummary[] = [
  {
    id: 'module-x',
    version: '1.0.0',
    extensionPoints: [{ kind: 'page', slot: 'nav', label: 'Expandable', view: {}, rawYaml }],
  },
];

describe('DataTable expansion in a module view', () => {
  it('shows the row payload when the toggle is clicked, only for rows that have one', () => {
    render(
      <MemoryRouter initialEntries={['/modules/module-x/0']}>
        <Routes>
          <Route path="/modules/:moduleId/:index" element={<ModulePage modules={modules} />} />
        </Routes>
      </MemoryRouter>,
    );

    // One toggle: the row without payloadText has none (expansionCondition).
    const toggles = screen.getAllByRole('button');
    expect(toggles).toHaveLength(1);
    expect(screen.queryByText(/"hello": "world"/)).not.toBeInTheDocument();

    fireEvent.click(toggles[0]);

    expect(screen.getByText(/"hello": "world"/)).toBeInTheDocument();
  });
});
