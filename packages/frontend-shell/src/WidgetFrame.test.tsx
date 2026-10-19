import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WidgetFrame, type WidgetFrameVariant } from './WidgetFrame.js';

const VARIANTS: WidgetFrameVariant[] = ['current', 'flat', 'datadog', 'jira', 'wash', 'spotlight'];

const renderFrame = (variant: WidgetFrameVariant, label: string | undefined, bare = false) =>
  render(
    <WidgetFrame variant={variant} moduleId="orchestrator" moduleTitle="Orchestrator" label={label} bare={bare}>
      <p>body</p>
    </WidgetFrame>,
  );

describe('WidgetFrame', () => {
  it.each(VARIANTS)('%s shows the widget label as a heading, around an article named after it', (variant) => {
    renderFrame(variant, 'Runs today');
    expect(screen.getByRole('heading', { name: 'Runs today' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Runs today' })).toContainElement(screen.getByText('body'));
  });

  it.each(VARIANTS.filter((v) => v !== 'current'))('%s falls back to the module name when the widget has no label, so a frame is never anonymous', (variant) => {
    renderFrame(variant, undefined);
    expect(screen.getByRole('article', { name: 'Orchestrator' })).toBeInTheDocument();
    expect(screen.getAllByText('Orchestrator').length).toBeGreaterThan(0);
  });

  it.each(VARIANTS)('%s leaves the widget its own box unless bare is asked', (variant) => {
    renderFrame(variant, 'Runs today');
    expect(screen.getByRole('article').className).not.toContain('border-0');
  });

  it.each(VARIANTS)('%s strips the widget own box when bare', (variant) => {
    renderFrame(variant, 'Runs today', true);
    expect(screen.getByRole('article').className).toContain('[&>.border]:border-0');
  });
});
