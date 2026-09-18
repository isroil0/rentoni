import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom has no ResizeObserver; Recharts' responsive container needs one.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom does not implement matchMedia.
globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof matchMedia;

// jsdom defines scrollTo as a stub that logs "Not implemented"; replace it outright so
// route changes don't pollute the console output the smoke tests assert on.
Object.defineProperty(globalThis, 'scrollTo', { value: () => {}, configurable: true, writable: true });
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', { value: () => {}, configurable: true, writable: true });
}

/**
 * Node 26 defines a global `localStorage` that is undefined unless the process was
 * started with --localstorage-file, and it shadows the one jsdom installs on `window`.
 * Bare `localStorage` references (which work normally in a browser) therefore blow up
 * here, so point the global at jsdom's implementation — or an in-memory equivalent.
 */
function installLocalStorage() {
  const existing = (globalThis as { localStorage?: Storage }).localStorage;
  if (existing && typeof existing.clear === 'function') return;

  const fromWindow = typeof window !== 'undefined' ? window.localStorage : undefined;
  const store =
    fromWindow && typeof fromWindow.clear === 'function'
      ? fromWindow
      : (() => {
          const map = new Map<string, string>();
          return {
            get length() {
              return map.size;
            },
            key: (index: number) => [...map.keys()][index] ?? null,
            getItem: (key: string) => map.get(key) ?? null,
            setItem: (key: string, value: string) => void map.set(key, String(value)),
            removeItem: (key: string) => void map.delete(key),
            clear: () => map.clear(),
          } as Storage;
        })();

  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true });
}

installLocalStorage();

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
