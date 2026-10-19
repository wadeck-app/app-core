import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WidgetFrame, type WidgetFrameVariant } from './WidgetFrame.js';

const VARIANTS: WidgetFrameVariant[] = ['datadog', 'datadog-compact', 'datadog-accent', 'datadog-footer', 'datadog-logo'];
const WITH_FOOTER: WidgetFrameVariant[] = ['datadog-footer'];

const renderFrame = (variant: WidgetFrameVariant, label: string | undefined, bare = false) =>
  render(
    <WidgetFrame variant={variant} moduleId="orchestrator" moduleTitle="Orchestrator" label={label} bare={bare} handle={<span>grip</span>} toolbar={<button>tools</button>} footer={<span>footer text</span>}>
      <p>body</p>
    </WidgetFrame>,
  );

describe('WidgetFrame', () => {
  it.each(VARIANTS)('%s shows the widget label as a heading, around an article named after it', (variant) => {
    renderFrame(variant, 'Runs today');
    expect(screen.getByRole('heading', { name: 'Runs today' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Runs today' })).toContainElement(screen.getByText('body'));
  });

  it.each(VARIANTS)('%s falls back to the module name when the widget has no label, so a frame is never anonymous', (variant) => {
    renderFrame(variant, undefined);
    expect(screen.getByRole('article', { name: 'Orchestrator' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Orchestrator' })).toBeInTheDocument();
  });

  it.each(VARIANTS)('%s names the module when the widget has a label', (variant) => {
    renderFrame(variant, 'Runs today');
    // Written next to the title, or in the tooltip of the tile.
    expect(screen.queryAllByText('Orchestrator').length + screen.queryAllByTitle('Orchestrator').length).toBeGreaterThan(0);
  });

  it.each(VARIANTS)('%s leaves the widget its own box unless bare is asked', (variant) => {
    renderFrame(variant, 'Runs today');
    expect(screen.getByRole('article').className).not.toContain('border-0');
  });

  it.each(VARIANTS)('%s strips the widget own box when bare', (variant) => {
    renderFrame(variant, 'Runs today', true);
    expect(screen.getByRole('article').className).toContain('[&>.border]:border-0');
  });

  it.each(VARIANTS)('%s always shows the grip and the tools, not only on hover', (variant) => {
    renderFrame(variant, 'Runs today');
    expect(screen.getByText('grip')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tools' })).toBeInTheDocument();
    expect(screen.getByRole('banner').className).not.toContain('opacity-0');
  });

  it.each(VARIANTS)('%s shows the footer only if it has one', (variant) => {
    renderFrame(variant, 'Runs today');
    expect(screen.queryByText('footer text') !== null).toBe(WITH_FOOTER.includes(variant));
  });
});
