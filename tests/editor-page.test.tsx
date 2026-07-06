import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mocka as fronteiras server-only para que o import de <EditorClient> nao arraste
// `@/db`/`server-only` para o jsdom. O foco deste teste e a integracao UI+reducer;
// o comportamento das actions e coberto por seus proprios testes.
vi.mock("@/lib/actions/carousels", () => ({
  saveCarousel: vi.fn(),
  deleteCarousel: vi.fn(),
}));
vi.mock("@/lib/blob-upload", () => ({
  uploadImageToBlob: vi.fn(),
}));
// EditorClient (redesign) usa useRouter() (botao Excluir). Fora de um App
// Router de verdade, o hook exige este mock — nenhuma navegacao roda no teste.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { EditorClient } from "@/app/editor/editor-client";
import { initialState } from "@/lib/editor-state";

// Testes de FUMACA da integracao editor (S2). Nao testa pixel/scale/fidelidade de
// fonte (isso e o <Slide> da S1, ja coberto). So valida que a integracao editor
// + reducer + paineis rende sem erro e que os fluxos-chave alteram o DOM visivel.
// Seletores resilientes: texto/role/aria-label, nunca classe de estilo.
//
// S3: a pagina /editor virou Server Component async (le ?id=, faz I/O de banco),
// impropria para render sincrono em jsdom. A integracao pagina+reducer+paineis
// migrou para <EditorClient>, semeado por initialState — e o que testamos aqui.

// Helper: renderiza o editor client com o estado inicial da S2 (1 slide vazio).
function renderEditor() {
  return render(<EditorClient initialState={initialState} />);
}

describe("/editor — fumaca de integracao", () => {
  it("renderiza sem erro e mostra 1 slide no preview (.slide no DOM)", () => {
    const { container } = renderEditor();
    // O estado inicial tem 1 slide -> o <Slide> e renderizado.
    expect(container.querySelectorAll(".slide")).toHaveLength(1);
  });

  it("clicar 'Adicionar slide' cria um novo item na navegacao", () => {
    renderEditor();
    // Estado inicial: 1 item "Slide 1".
    expect(screen.getByText("Slide 1")).toBeInTheDocument();
    expect(screen.queryByText("Slide 2")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Adicionar slide" }),
    );

    // Agora ha um "Slide 2".
    expect(screen.getByText("Slide 2")).toBeInTheDocument();
  });

  it("remover o unico slide leva ao estado vazio: some o .slide e aparece o CTA", () => {
    const { container } = renderEditor();
    expect(container.querySelectorAll(".slide")).toHaveLength(1);

    // Remove o unico slide (aria-label do botao remover do slide 1).
    fireEvent.click(
      screen.getByRole("button", { name: "Remover slide 1" }),
    );

    // Sem <Slide> renderizado e CTA de estado vazio visivel no preview.
    expect(container.querySelectorAll(".slide")).toHaveLength(0);
    expect(
      screen.getByText("Adicione um slide para comecar."),
    ).toBeInTheDocument();
  });

  it("upload de arquivo nao-imagem mostra erro e NAO altera o preview", () => {
    const { container } = renderEditor();
    // Preview intacto antes do upload invalido.
    expect(container.querySelectorAll(".slide")).toHaveLength(1);

    // O input de arquivo e nativo, escondido (sr-only). Localiza pelo type.
    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    // Dispara change com um PDF sintetico (nunca dado real de cliente).
    const badFile = new File([new Uint8Array(8)], "doc.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(fileInput, { target: { files: [badFile] } });

    // Mensagem de erro inline visivel; o <Slide> continua no DOM (estado intacto).
    expect(screen.getByText("Envie um arquivo de imagem.")).toBeInTheDocument();
    expect(container.querySelectorAll(".slide")).toHaveLength(1);
  });

  it("editar o corpo do slide reflete na navegacao (label do item na lista)", () => {
    renderEditor();
    // Corpo inicial vazio -> a navegacao mostra o rotulo "Slide vazio".
    expect(screen.getByText("Slide vazio")).toBeInTheDocument();

    const textarea = screen.getByLabelText("Corpo do slide");
    fireEvent.change(textarea, { target: { value: "Ideia nova" } });

    // O corpo editado propaga: aparece na lista (rotulo do item), no textarea e no
    // preview <Slide> — 3 ocorrencias. E o rotulo "Slide vazio" some da lista.
    expect(screen.getAllByText("Ideia nova").length).toBeGreaterThan(0);
    expect(screen.queryByText("Slide vazio")).toBeNull();
  });
});
