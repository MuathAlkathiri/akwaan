import "@testing-library/jest-dom/vitest";

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: () => undefined,
});

/**
 * jsdom implements neither of these, and Radix measures with both.
 *
 * Same class of gap as `scrollIntoView` above: a browser API the component tree
 * calls during layout, absent from jsdom, and irrelevant to what any test asserts.
 * Without them a dialog or select throws on mount instead of rendering.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as never;

Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
  configurable: true,
  value: () => false,
});
Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
  configurable: true,
  value: () => undefined,
});
