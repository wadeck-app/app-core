import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WidgetFrame } from './WidgetFrame.js';

const renderFrame = (label: string | undefined, bare = false) =>
  render(
    <WidgetFrame moduleTitle="Orchestrator" label={label} bare={bare} handle={<span>grip</span>} toolbar={<button>tools</button>}>
      <p>body</p>
    </WidgetFrame>,
  );

describe('WidgetFrame', () => {
  it('shows the widget label as a heading, around an article named after it', () => {
    renderFrame('Runs today');
    expect(screen.getByRole('heading', { name: 'Runs today' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Runs today' })).toContainElement(screen.getByText('body'));
  });

  it('falls back to the module name when the widget has no label, so a frame is never anonymous', () => {
    renderFrame(undefined);
    expect(screen.getByRole('heading', { name: 'Orchestrator' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Orchestrator' })).toBeInTheDocument();
  });

  it('names the module in the tooltip of the tile', () => {
    renderFrame('Runs today');
    expect(screen.getByTitle('Orchestrator')).toContainElement(screen.getByText('body'));
  });

  it('always shows the grip and the tools, not only on hover', () => {
    renderFrame('Runs today');
    expect(screen.getByText('grip')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tools' })).toBeInTheDocument();
    expect(screen.getByRole('banner').className).not.toContain('opacity-0');
  });

  it('leaves the widget its own box unless bare is asked', () => {
    renderFrame('Runs today');
    expect(screen.getByRole('article').className).not.toContain('border-0');
  });

  it('strips the widget own box when bare', () => {
    renderFrame('Runs today', true);
    expect(screen.getByRole('article').className).toContain('[&>.border]:border-0');
  });
});
