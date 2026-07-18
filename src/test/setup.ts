/**
 * jsdom does not implement ResizeObserver, which dockview requires; install a
 * no-op stub before any test module loads dockview.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub;
}
