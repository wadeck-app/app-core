import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@wadeck-app/dsl-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModuleView } from './ModuleView.js';
import { ShellNotifier } from './ShellNotifier.js';

// A row action the module declares. The renderer fires it from a click handler nobody awaits, so its outcome has to
// reach the user through the notifier.
const rawYaml = `
$actions:
  clear: { url: "POST /api/modules/queue/dlq/{id}/clear", successMessage: "Cleared" }
$type: DataTable
rows:
  - { id: "7", name: "job" }
columns:
  - { key: "name", label: "Name" }
  - { type: actions, actions: [{ label: "Clear", action: "clear" }] }
`;

const renderView = (notifier: boolean) =>
  render(
    <MemoryRouter>
      <ToastProvider>{notifier ? <ShellNotifier><ModuleView rawYaml={rawYaml} /></ShellNotifier> : <ModuleView rawYaml={rawYaml} />}</ToastProvider>
    </MemoryRouter>,
  );

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ShellNotifier: the outcome of a module action reaches the user as a toast', () => {
  it('shows the server message when the action fails', async () => {
    // The renderer also logs the failure to the console; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(json(409, { message: 'queue is locked' }));
    vi.stubGlobal('fetch', fetchMock);
    renderView(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));

    // What failed, how, and the server's reason.
    expect(await screen.findByText('Action "clear" failed (HTTP 409): queue is locked')).toBeInTheDocument();
    // The row id is substituted in the URL before the request leaves.
    expect(fetchMock).toHaveBeenCalledWith('/api/modules/queue/dlq/7/clear', expect.objectContaining({ method: 'POST' }));
  });

  it('shows the success message the module declared when the action succeeds, and no failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    renderView(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));

    expect(await screen.findByText('Cleared')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });
});
