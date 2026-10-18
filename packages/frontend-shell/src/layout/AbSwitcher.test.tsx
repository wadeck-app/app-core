import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AbDock, HIDDEN_TESTS_KEY, type AbTest } from './AbSwitcher.js';
import { usePersistentChoice } from './usePersistentChoice.js';

// The A/B bar is generic: these tests use fake tests, so the bar stays covered while no real test is open.
const COLORS = { red: 'Red', green: 'Green', blue: 'Blue' } as const;
type Color = keyof typeof COLORS;

function useColorTest(): AbTest {
  const [value, setValue] = usePersistentChoice<Color>('test.color', ['red', 'green', 'blue'], 'red', 'color');
  return {
    id: 'color',
    label: 'Fake color',
    summary: COLORS[value],
    options: (Object.keys(COLORS) as Color[]).map((c) => ({ id: c, label: COLORS[c], title: `Paints it ${COLORS[c].toLowerCase()}, a longer explanation.` })),
    value,
    onSelect: (id) => setValue(id as Color),
  };
}

function manyOptionsTest(count: number): AbTest {
  return {
    id: 'many',
    label: 'Many',
    summary: 'o0',
    options: Array.from({ length: count }, (_, i) => ({ id: `o${i}`, label: `o${i}`, title: `option ${i}` })),
    value: 'o0',
    onSelect: () => {},
  };
}

function Harness({ extra = [] }: { extra?: AbTest[] }) {
  const color = useColorTest();
  return <AbDock tests={[color, ...extra]} />;
}

beforeEach(() => {
  localStorage.clear();
});

describe('AbDock rows', () => {
  it('puts the name of the test on the left, muted and apart from the options', () => {
    render(<Harness />);
    const group = screen.getByRole('group', { name: 'Fake color' });
    const name = group.parentElement!.firstElementChild!;
    expect(name).toHaveTextContent('Fake color');
    expect(name.className).toContain('text-muted');
    expect(name.className).toContain('border-r');
    expect(within(group).queryByText('Fake color')).not.toBeInTheDocument();
  });

  it('marks the current option and changes it on click, remembering it', () => {
    const first = render(<Harness />);
    const row = () => within(screen.getByRole('group', { name: 'Fake color' }));
    expect(row().getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(row().getByRole('button', { name: 'Blue' }));
    expect(row().getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('test.color')).toBe('blue');
    first.unmount();

    render(<Harness />);
    expect(row().getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('explains every option in a tooltip', () => {
    render(<Harness />);
    for (const b of within(screen.getByRole('group', { name: 'Fake color' })).getAllByRole('button')) {
      expect(b.getAttribute('title')!.length, b.textContent ?? '').toBeGreaterThan(20);
    }
  });

  it('wraps a long row onto several lines of 10 columns, labels on one line', () => {
    render(<AbDock tests={[manyOptionsTest(23)]} />);
    const group = screen.getByRole('group', { name: 'Many' });
    expect(group.style.gridTemplateColumns).toContain('repeat(10,');
    for (const b of within(group).getAllByRole('button')) expect(b.className).toContain('whitespace-nowrap');
  });

  it('keeps few options (Off / On) at a normal cell width instead of stretching them', () => {
    render(<AbDock tests={[{ ...manyOptionsTest(2), id: 'two', label: 'Two' }]} />);
    expect(screen.getByRole('group', { name: 'Two' }).style.gridTemplateColumns).toContain('6rem');
  });

  it('stacks the tests in the order given, each row as wide as the others', () => {
    render(<Harness extra={[manyOptionsTest(4)]} />);
    const groups = Array.from(document.querySelectorAll('[data-testid="ab-dock"] [role="group"]'));
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Fake color', 'Many']);
    const widths = groups.map((g) => g.parentElement!.className.match(/w-\[[^\]]+\]/)![0]);
    expect(new Set(widths).size).toBe(1);
  });

  it('is fixed at the bottom center and above everything', () => {
    render(<Harness />);
    const fixed = screen.getByTestId('ab-dock').parentElement!;
    for (const c of ['fixed', 'bottom-6', 'left-1/2', 'z-[9999]']) expect(fixed.className).toContain(c);
  });
});

describe('AbDock hiding', () => {
  it('hides a row and leaves a reminder chip with the current choice, which stays applied', () => {
    localStorage.setItem('test.color', 'green');
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide Fake color' }));
    expect(screen.queryByRole('group', { name: 'Fake color' })).not.toBeInTheDocument();
    const chip = screen.getByRole('button', { name: 'Show Fake color' });
    expect(chip).toHaveTextContent('Fake color: Green');
    // The choice is untouched by hiding.
    expect(localStorage.getItem('test.color')).toBe('green');

    fireEvent.click(chip);
    expect(within(screen.getByRole('group', { name: 'Fake color' })).getByRole('button', { name: 'Green' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Show Fake color' })).not.toBeInTheDocument();
  });

  it('remembers a hidden row after a reload', () => {
    const first = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide Fake color' }));
    first.unmount();

    render(<Harness />);
    expect(screen.queryByRole('group', { name: 'Fake color' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Fake color' })).toHaveTextContent('Fake color: Red');
  });

  it('reports an invalid stored value instead of silently ignoring it, and hides nothing', () => {
    localStorage.setItem(HIDDEN_TESTS_KEY, '{not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Harness />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(HIDDEN_TESTS_KEY));
    expect(screen.getByRole('group', { name: 'Fake color' })).toBeInTheDocument();
    warn.mockRestore();
  });

  it('reports a stored value that is not a list of strings', () => {
    localStorage.setItem(HIDDEN_TESTS_KEY, '{"a":1}');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Harness />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('JSON array of strings'));
    warn.mockRestore();
  });
});

describe('usePersistentChoice', () => {
  it('warns and falls back to the initial value when the stored one is unknown', () => {
    localStorage.setItem('test.color', 'purple');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Harness />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown color "purple"'));
    expect(within(screen.getByRole('group', { name: 'Fake color' })).getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true');
    warn.mockRestore();
  });
});
