// Matchers do jest-dom para Vitest (toBeInTheDocument, toHaveStyle, etc.)
import "@testing-library/jest-dom/vitest";

// jsdom nao implementa ResizeObserver; o ThemePreview usa para escalar o preview
// de forma fluida. Stub minimo (nao dispara callbacks) — o preview cai no tamanho
// inicial e os testes de fumaca nao dependem da medicao real.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// jsdom nao implementa matchMedia; o AppShell/editor usam para detectar o
// breakpoint lg (desktop vs mobile/tablet). Stub minimo: sempre "nao bate"
// (matches: false), suficiente para os testes de fumaca nao quebrarem.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  })) as unknown as typeof window.matchMedia;
}
