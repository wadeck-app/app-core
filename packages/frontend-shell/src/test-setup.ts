import '@testing-library/jest-dom/vitest';

// jsdom has no matchMedia; dsl-ui's useTheme reads it when no theme is stored.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom has no 2D canvas and logs "Not implemented" on every getContext(). Declared here: the optical logo centering
// (opticalCenter.ts) measures glyphs with a canvas and, without one, leaves the text at its default centering.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

// jsdom has no ResizeObserver; Radix popovers (dsl-ui Popover) observe their content size.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;
