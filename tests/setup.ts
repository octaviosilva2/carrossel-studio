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
