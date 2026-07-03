import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { Slide } from "@/components/slide/slide";
import type { SlideData } from "@/components/slide/types";
import {
  BODY_SIZE_IMG,
  BODY_SIZE_NOIMG,
} from "@/components/slide/slide-tokens";

// Dados base reusados; cada teste sobrescreve o que precisa.
const base: SlideData = {
  name: "Octavio Silva",
  handle: "octaviosilva",
  avatarUrl: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
  verified: true,
  body: "Primeiro bloco de ideia.\n\nSegundo bloco de ideia.",
  theme: "light",
};

function renderSlide(overrides: Partial<SlideData> = {}) {
  return render(<Slide data={{ ...base, ...overrides }} />);
}

describe("<Slide> — contrato de props", () => {
  it("prefixa o handle com @", () => {
    const { getByText } = renderSlide({ handle: "octaviosilva" });
    expect(getByText("@octaviosilva")).toBeInTheDocument();
  });

  it("renderiza o nome", () => {
    const { getByText } = renderSlide({ name: "Octavio Silva" });
    expect(getByText("Octavio Silva")).toBeInTheDocument();
  });

  it("mostra o selo verificado quando verified=true (e so 1 svg = so o selo)", () => {
    const { container } = renderSlide({ verified: true });
    expect(
      container.querySelector('svg[aria-label="Conta verificada"]')
    ).not.toBeNull();
    // Apenas o selo: nenhum logo do X / passarinho extra.
    expect(container.querySelectorAll("svg").length).toBe(1);
  });

  it("nao renderiza selo quando verified=false (0 svg)", () => {
    const { container } = renderSlide({ verified: false });
    expect(
      container.querySelector('svg[aria-label="Conta verificada"]')
    ).toBeNull();
    expect(container.querySelectorAll("svg").length).toBe(0);
  });

  it("usa corpo 52px sem imagem e 46px com imagem", () => {
    const semImg = renderSlide({ imageUrl: undefined });
    const pSem = semImg.container.querySelector("p") as HTMLParagraphElement;
    expect(pSem.style.fontSize).toBe(`${BODY_SIZE_NOIMG}px`);

    const comImg = renderSlide({ imageUrl: "data:image/svg+xml,<svg/>" });
    const pCom = comImg.container.querySelector("p") as HTMLParagraphElement;
    expect(pCom.style.fontSize).toBe(`${BODY_SIZE_IMG}px`);
  });

  it("separa blocos de ideia por \\n\\n em paragrafos distintos", () => {
    const { container } = renderSlide({
      body: "Bloco um.\n\nBloco dois.\n\nBloco tres.",
    });
    expect(container.querySelectorAll("p").length).toBe(3);
  });

  it("renderiza a imagem do slide quando imageUrl e fornecida", () => {
    const semImg = renderSlide({ imageUrl: undefined });
    // So o avatar (1 img)
    expect(semImg.container.querySelectorAll("img").length).toBe(1);

    const comImg = renderSlide({ imageUrl: "data:image/svg+xml,<svg/>" });
    // Avatar + imagem do slide (2 img)
    expect(comImg.container.querySelectorAll("img").length).toBe(2);
  });
});

describe("<Slide> — temas (cores exatas)", () => {
  it("tema claro aplica os hexes corretos", () => {
    const { container } = renderSlide({ theme: "light" });
    const el = container.querySelector(".slide") as HTMLElement;
    expect(el.getAttribute("data-theme")).toBe("light");
    expect(el.style.getPropertyValue("--slide-bg")).toBe("#ffffff");
    expect(el.style.getPropertyValue("--slide-text")).toBe("#14171a");
    expect(el.style.getPropertyValue("--slide-handle")).toBe("#536471");
    expect(el.style.getPropertyValue("--slide-badge")).toBe("#1d9bf0");
  });

  it("tema escuro aplica os hexes corretos", () => {
    const { container } = renderSlide({ theme: "dark" });
    const el = container.querySelector(".slide") as HTMLElement;
    expect(el.getAttribute("data-theme")).toBe("dark");
    expect(el.style.getPropertyValue("--slide-bg")).toBe("#000000");
    expect(el.style.getPropertyValue("--slide-text")).toBe("#ffffff");
    expect(el.style.getPropertyValue("--slide-handle")).toBe("#71767b");
    expect(el.style.getPropertyValue("--slide-badge")).toBe("#1d9bf0");
  });
});

describe("<Slide> — regras inviolaveis", () => {
  it("nao contem barra de engajamento nem texto de curtidas/retweets", () => {
    const { container } = renderSlide();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/curtidas|retweets|views|likes|repost/i);
  });

  it("dimensiona o no raiz em 1080x1350", () => {
    const { container } = renderSlide();
    const el = container.querySelector(".slide") as HTMLElement;
    expect(el.style.width).toBe("1080px");
    expect(el.style.height).toBe("1350px");
  });
});
