import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AbDock, HIDDEN_TESTS_KEY, type AbTest } from './AbSwitcher.js';
import { useAbTest } from './useAbTest.js';

// The A/B bar is generic: these tests use fake tests, so it stays covered while no real test is open.
const COLOR_OPTIONS = {
  red: { label: 'Red', hint: 'Paints it red, a longer explanation.' },
  green: { label: 'Green', hint: 'Paints it green, a longer explanation.' },
  blue: { label: 'Blue', hint: 'Paints it blue, a longer explanation.' },
} as const;

function manyOptionsTest(count: number, id = 'many', label = 'Many'): AbTest {
  return {
    id,
    label,
    summary: 'o0',
    options: Array.from({ length: count }, (_, i) => ({ id: `o${i}`, label: `o${i}`, title: `option ${i}` })),
    value: 'o0',
    onSelect: () => {},
  };
}

let applied: string | undefined;

// A real consumer: declares the test with useAbTest, applies `value`, renders the dock.
function Harness({ extra = [], enabled }: { extra?: AbTest[]; enabled?: boolean }) {
  const color = useAbTest({ id: 'color', label: 'Fake color', options: COLOR_OPTIONS, initial: 'red' });
  applied = color.value;
  return <AbDock tests={[color, ...extra]} enabled={enabled} />;
}

const colorRow = () => within(screen.getByRole('group', { name: 'Fake color' }));

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/');
  applied = undefined;
});

afterEach(() => {
  window.history.pushState({}, '', '/');
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

  it('marks the current option and changes it on click', () => {
    render(<Harness />);
    expect(colorRow().getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(colorRow().getByRole('button', { name: 'Blue' }));
    expect(colorRow().getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'true');
    expect(applied).toBe('blue');
  });

  it('explains every option in a tooltip', () => {
    render(<Harness />);
    for (const b of colorRow().getAllByRole('button')) expect(b.getAttribute('title')!.length, b.textContent ?? '').toBeGreaterThan(20);
  });

  it('wraps a long row onto several lines of 10 columns, labels on one line', () => {
    render(<AbDock tests={[manyOptionsTest(23)]} />);
    const group = screen.getByRole('group', { name: 'Many' });
    expect(group.style.gridTemplateColumns).toContain('repeat(10,');
    for (const b of within(group).getAllByRole('button')) expect(b.className).toContain('whitespace-nowrap');
  });

  it('keeps few options (Off / On) at a normal cell width instead of stretching them', () => {
    render(<AbDock tests={[manyOptionsTest(2, 'two', 'Two')]} />);
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

describe('AbDock dev flag (built in)', () => {
  it('shows in development without the caller writing any condition', () => {
    // vitest runs with import.meta.env.DEV = true
    render(<Harness />);
    expect(screen.getByTestId('ab-dock')).toBeInTheDocument();
  });

  it('renders nothing when forced off, and the test still applies its choice', () => {
    localStorage.setItem('ab.color', 'green');
    render(<Harness enabled={false} />);
    expect(screen.queryByTestId('ab-dock')).not.toBeInTheDocument();
    expect(applied).toBe('green');
  });

  it('can be forced on explicitly', () => {
    render(<Harness enabled />);
    expect(screen.getByTestId('ab-dock')).toBeInTheDocument();
  });
});

describe('useAbTest', () => {
  it('stores the choice under ab.<id> and restores it after a reload', () => {
    const first = render(<Harness />);
    fireEvent.click(colorRow().getByRole('button', { name: 'Blue' }));
    expect(localStorage.getItem('ab.color')).toBe('blue');
    first.unmount();

    render(<Harness />);
    expect(colorRow().getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'true');
    expect(applied).toBe('blue');
  });

  it('lists the options in the order declared, with the declared tooltips', () => {
    render(<Harness />);
    const buttons = colorRow().getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Red', 'Green', 'Blue']);
    expect(buttons[1]).toHaveAttribute('title', COLOR_OPTIONS.green.hint);
  });

  it('warns and falls back to the reference option when the stored one is unknown', () => {
    localStorage.setItem('ab.color', 'purple');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Harness />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown fake color "purple"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('expected one of: red, green, blue'));
    expect(applied).toBe('red');
    warn.mockRestore();
  });

  describe('link override (?ab.<id>=<option>)', () => {
    it('forces the option for this page load, over the stored one, without storing it', () => {
      localStorage.setItem('ab.color', 'green');
      window.history.pushState({}, '', '/?ab.color=blue');
      render(<Harness />);
      expect(applied).toBe('blue');
      expect(colorRow().getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'true');
      expect(localStorage.getItem('ab.color')).toBe('green');
    });

    it('stores the next choice made by hand', () => {
      window.history.pushState({}, '', '/?ab.color=blue');
      render(<Harness />);
      fireEvent.click(colorRow().getByRole('button', { name: 'Green' }));
      expect(localStorage.getItem('ab.color')).toBe('green');
    });

    it('warns about an unknown option in the link and falls back to the stored choice', () => {
      localStorage.setItem('ab.color', 'green');
      window.history.pushState({}, '', '/?ab.color=zzz');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<Harness />);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('URL parameter "ab.color"'));
      expect(applied).toBe('green');
      warn.mockRestore();
    });

    it('ignores the parameters of other tests', () => {
      window.history.pushState({}, '', '/?ab.other=blue');
      render(<Harness />);
      expect(applied).toBe('red');
    });
  });

  describe('other tabs', () => {
    const storageEvent = (key: string, newValue: string | null) =>
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: localStorage }));
      });

    it('applies a choice made in another tab', () => {
      render(<Harness />);
      storageEvent('ab.color', 'blue');
      expect(applied).toBe('blue');
      expect(colorRow().getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('ignores other keys, removals and unknown values', () => {
      render(<Harness />);
      storageEvent('ab.other', 'blue');
      storageEvent('ab.color', null);
      storageEvent('ab.color', 'purple');
      expect(applied).toBe('red');
    });

    it('removes exactly the listener it added once unmounted', () => {
      const add = vi.spyOn(window, 'addEventListener');
      const remove = vi.spyOn(window, 'removeEventListener');
      const { unmount } = render(<Harness />);
      const added = add.mock.calls.filter((c) => c[0] === 'storage').map((c) => c[1]);
      expect(added.length).toBeGreaterThan(0);
      unmount();
      const removed = remove.mock.calls.filter((c) => c[0] === 'storage').map((c) => c[1]);
      for (const handler of added) expect(removed).toContain(handler);
      add.mockRestore();
      remove.mockRestore();
    });
  });
});

describe('AbDock hiding', () => {
  it('hides a row and leaves a reminder chip with the current choice, which stays applied', () => {
    localStorage.setItem('ab.color', 'green');
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide Fake color' }));
    expect(screen.queryByRole('group', { name: 'Fake color' })).not.toBeInTheDocument();
    const chip = screen.getByRole('button', { name: 'Show Fake color' });
    expect(chip).toHaveTextContent('Fake color: Green');
    expect(applied).toBe('green');
    expect(localStorage.getItem('ab.color')).toBe('green');

    fireEvent.click(chip);
    expect(colorRow().getByRole('button', { name: 'Green' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Show Fake color' })).not.toBeInTheDocument();
  });

  it('remembers a hidden row after a reload, under ab.hidden', () => {
    const first = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide Fake color' }));
    expect(JSON.parse(localStorage.getItem(HIDDEN_TESTS_KEY)!)).toEqual(['color']);
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
