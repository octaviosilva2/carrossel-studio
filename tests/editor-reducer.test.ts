import { describe, it, expect } from "vitest";

import {
  editorReducer,
  initialState,
  toSlideData,
  DEFAULT_AVATAR_DATA_URL,
  type EditorState,
  type EditorSlide,
} from "@/lib/editor-state";

// Testes do reducer PURO (S2). Nao renderiza nada — so logica de transicao.
// Cobre a tabela §A do spec.md: cada linha e ao menos um `it`. Como o id de novos
// slides vem de `crypto.randomUUID()` (nao-deterministico), asserimos SHAPE e
// COMPORTAMENTO (novo slide existe / foi selecionado), nunca o valor do id.

// --- Fixtures de estado (deterministas, ids fixos) ---------------------------

/**
 * Estado com 3 slides de ids conhecidos ("a","b","c"), o do meio ("b")
 * selecionado. Base para os casos de selecao/reorder/remocao/isolamento.
 * Cada teste que precisa parte de uma copia fresca (nada compartilhado mutavel).
 */
function threeSlidesState(): EditorState {
  return {
    identity: {
      name: "Octavio",
      handle: "octaviosilva",
      avatarUrl: "data:image/png;base64,AAAA",
      verified: true,
    },
    theme: "light",
    slides: [
      { id: "a", body: "corpo a", imageUrl: undefined },
      { id: "b", body: "corpo b", imageUrl: "data:image/png;base64,IMG_B" },
      { id: "c", body: "corpo c", imageUrl: undefined },
    ],
    selectedSlideId: "b",
  };
}

// --- initialState ------------------------------------------------------------

describe("initialState", () => {
  it("comeca com exatamente 1 slide", () => {
    expect(initialState.slides).toHaveLength(1);
  });

  it("tem o slide inicial como selecionado", () => {
    const first = initialState.slides[0];
    expect(first).toBeDefined();
    expect(initialState.selectedSlideId).toBe(first?.id);
  });

  it("usa o avatar DEFAULT (data-URL), nunca string vazia", () => {
    expect(initialState.identity.avatarUrl).toBe(DEFAULT_AVATAR_DATA_URL);
    expect(initialState.identity.avatarUrl).not.toBe("");
  });

  it("o slide inicial nasce com corpo vazio e sem imagem", () => {
    const first = initialState.slides[0] as EditorSlide;
    expect(first.body).toBe("");
    expect(first.imageUrl).toBeUndefined();
  });
});

// --- Identidade (UPDATE_IDENTITY / TOGGLE_VERIFIED) --------------------------

describe("UPDATE_IDENTITY", () => {
  it("atualiza o name e nao toca nos slides", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "UPDATE_IDENTITY",
      patch: { name: "Novo Nome" },
    });
    expect(next.identity.name).toBe("Novo Nome");
    // Slides inalterados (mesma referencia do array).
    expect(next.slides).toBe(prev.slides);
  });

  it("guarda o handle EXATAMENTE como recebido (sem '@' — strip e da UI)", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "UPDATE_IDENTITY",
      patch: { handle: "semarroba" },
    });
    expect(next.identity.handle).toBe("semarroba");
    expect(next.identity.handle).not.toContain("@");
  });

  it("preserva os demais campos de identity ao aplicar patch parcial", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "UPDATE_IDENTITY",
      patch: { name: "So o nome" },
    });
    // handle/avatar/verified intactos.
    expect(next.identity.handle).toBe(prev.identity.handle);
    expect(next.identity.avatarUrl).toBe(prev.identity.avatarUrl);
    expect(next.identity.verified).toBe(prev.identity.verified);
  });
});

describe("TOGGLE_VERIFIED", () => {
  it("inverte o selo verificado", () => {
    const prev = threeSlidesState(); // verified: true
    const off = editorReducer(prev, { type: "TOGGLE_VERIFIED" });
    expect(off.identity.verified).toBe(false);
    const on = editorReducer(off, { type: "TOGGLE_VERIFIED" });
    expect(on.identity.verified).toBe(true);
  });

  it("nao toca nos slides", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, { type: "TOGGLE_VERIFIED" });
    expect(next.slides).toBe(prev.slides);
  });
});

describe("SET_AVATAR / REMOVE_AVATAR", () => {
  it("SET_AVATAR troca a avatarUrl", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "SET_AVATAR",
      avatarUrl: "data:image/png;base64,NOVO",
    });
    expect(next.identity.avatarUrl).toBe("data:image/png;base64,NOVO");
  });

  it("REMOVE_AVATAR volta ao placeholder default (nunca '')", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, { type: "REMOVE_AVATAR" });
    expect(next.identity.avatarUrl).toBe(DEFAULT_AVATAR_DATA_URL);
    expect(next.identity.avatarUrl).not.toBe("");
  });
});

// --- Tema (SET_THEME) --------------------------------------------------------

describe("SET_THEME", () => {
  it("muda o tema para dark", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, { type: "SET_THEME", theme: "dark" });
    expect(next.theme).toBe("dark");
  });

  it("nao toca nos slides nem na identidade", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, { type: "SET_THEME", theme: "dark" });
    expect(next.slides).toBe(prev.slides);
    expect(next.identity).toBe(prev.identity);
  });
});

// --- ADD_SLIDE ---------------------------------------------------------------

describe("ADD_SLIDE", () => {
  it("acrescenta um slide vazio AO FIM da lista", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, { type: "ADD_SLIDE" });
    expect(next.slides).toHaveLength(prev.slides.length + 1);
    const added = next.slides[next.slides.length - 1] as EditorSlide;
    expect(added.body).toBe("");
    expect(added.imageUrl).toBeUndefined();
    // Os slides anteriores continuam na mesma ordem.
    expect(next.slides.slice(0, 3).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("torna o novo slide o selecionado", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, { type: "ADD_SLIDE" });
    const added = next.slides[next.slides.length - 1] as EditorSlide;
    expect(next.selectedSlideId).toBe(added.id);
  });

  it("gera um id novo e unico para o slide (nao colide com os existentes)", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, { type: "ADD_SLIDE" });
    const added = next.slides[next.slides.length - 1] as EditorSlide;
    expect(typeof added.id).toBe("string");
    expect(added.id.length).toBeGreaterThan(0);
    expect(["a", "b", "c"]).not.toContain(added.id);
  });
});

// --- SELECT_SLIDE ------------------------------------------------------------

describe("SELECT_SLIDE", () => {
  it("com id valido muda a selecao", () => {
    const prev = threeSlidesState(); // selecionado: "b"
    const next = editorReducer(prev, { type: "SELECT_SLIDE", id: "c" });
    expect(next.selectedSlideId).toBe("c");
  });

  it("com id inexistente e no-op (retorna a MESMA referencia)", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "SELECT_SLIDE",
      id: "nao-existe",
    });
    expect(next).toBe(prev);
    expect(next.selectedSlideId).toBe("b");
  });
});

// --- UPDATE_SLIDE_BODY (isolamento por-slide) -------------------------------

describe("UPDATE_SLIDE_BODY", () => {
  it("altera o body SO do slide alvo", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "UPDATE_SLIDE_BODY",
      id: "b",
      body: "corpo b editado",
    });
    const slideB = next.slides.find((s) => s.id === "b");
    expect(slideB?.body).toBe("corpo b editado");
  });

  it("nao altera o corpo dos outros slides", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "UPDATE_SLIDE_BODY",
      id: "b",
      body: "corpo b editado",
    });
    expect(next.slides.find((s) => s.id === "a")?.body).toBe("corpo a");
    expect(next.slides.find((s) => s.id === "c")?.body).toBe("corpo c");
  });

  it("preserva quebras de linha duplas (\\n\\n) no body", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "UPDATE_SLIDE_BODY",
      id: "a",
      body: "bloco 1\n\nbloco 2",
    });
    expect(next.slides.find((s) => s.id === "a")?.body).toBe(
      "bloco 1\n\nbloco 2",
    );
  });
});

// --- SET_SLIDE_IMAGE / REMOVE_SLIDE_IMAGE (isolamento por-slide) -------------

describe("SET_SLIDE_IMAGE", () => {
  it("define a imagem SO do slide alvo", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "SET_SLIDE_IMAGE",
      id: "a",
      imageUrl: "data:image/png;base64,IMG_A",
    });
    expect(next.slides.find((s) => s.id === "a")?.imageUrl).toBe(
      "data:image/png;base64,IMG_A",
    );
  });

  it("nao afeta a imagem dos outros slides", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "SET_SLIDE_IMAGE",
      id: "a",
      imageUrl: "data:image/png;base64,IMG_A",
    });
    // "b" mantem sua imagem, "c" continua sem.
    expect(next.slides.find((s) => s.id === "b")?.imageUrl).toBe(
      "data:image/png;base64,IMG_B",
    );
    expect(next.slides.find((s) => s.id === "c")?.imageUrl).toBeUndefined();
  });
});

describe("REMOVE_SLIDE_IMAGE", () => {
  it("remove a imagem SO do slide alvo (vira undefined)", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "REMOVE_SLIDE_IMAGE",
      id: "b",
    });
    expect(next.slides.find((s) => s.id === "b")?.imageUrl).toBeUndefined();
  });

  it("nao afeta os outros slides", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "REMOVE_SLIDE_IMAGE",
      id: "b",
    });
    expect(next.slides.find((s) => s.id === "a")?.imageUrl).toBeUndefined();
    expect(next.slides.find((s) => s.id === "c")?.imageUrl).toBeUndefined();
  });
});

// --- MOVE_SLIDE (reorder + no-op nas pontas) --------------------------------

describe("MOVE_SLIDE", () => {
  it("move para cima troca com o vizinho anterior", () => {
    const prev = threeSlidesState(); // [a, b, c]
    const next = editorReducer(prev, {
      type: "MOVE_SLIDE",
      id: "b",
      direction: "up",
    });
    expect(next.slides.map((s) => s.id)).toEqual(["b", "a", "c"]);
  });

  it("move para baixo troca com o vizinho seguinte", () => {
    const prev = threeSlidesState(); // [a, b, c]
    const next = editorReducer(prev, {
      type: "MOVE_SLIDE",
      id: "b",
      direction: "down",
    });
    expect(next.slides.map((s) => s.id)).toEqual(["a", "c", "b"]);
  });

  it("a selecao acompanha o slide movido (id estavel)", () => {
    const prev = threeSlidesState(); // selecionado "b"
    const next = editorReducer(prev, {
      type: "MOVE_SLIDE",
      id: "b",
      direction: "up",
    });
    // "b" mudou de indice (0 agora), mas continua selecionado.
    expect(next.selectedSlideId).toBe("b");
    expect(next.slides[0]?.id).toBe("b");
  });

  it("move para cima no PRIMEIRO slide e no-op (retorna a MESMA referencia)", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "MOVE_SLIDE",
      id: "a",
      direction: "up",
    });
    expect(next).toBe(prev);
  });

  it("move para baixo no ULTIMO slide e no-op (retorna a MESMA referencia)", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "MOVE_SLIDE",
      id: "c",
      direction: "down",
    });
    expect(next).toBe(prev);
  });

  it("com id inexistente e no-op (mesma referencia)", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "MOVE_SLIDE",
      id: "nao-existe",
      direction: "up",
    });
    expect(next).toBe(prev);
  });
});

// --- REMOVE_SLIDE (recalculo de selecao) ------------------------------------

describe("REMOVE_SLIDE", () => {
  it("remove o slide alvo da lista", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, { type: "REMOVE_SLIDE", id: "b" });
    expect(next.slides.map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("ao remover o SELECIONADO com vizinhos, seleciona o vizinho (min(indice, len-1))", () => {
    // selecionado "b" (indice 1). Apos remover, nova lista [a, c].
    // novoIndice = min(1, 1) = 1 -> "c".
    const prev = threeSlidesState();
    const next = editorReducer(prev, { type: "REMOVE_SLIDE", id: "b" });
    expect(next.selectedSlideId).toBe("c");
  });

  it("ao remover o ULTIMO da lista (selecionado), seleciona o novo ultimo", () => {
    // Estado com "c" selecionado (indice 2). Remove "c" -> [a, b].
    // novoIndice = min(2, 1) = 1 -> "b".
    const base = threeSlidesState();
    const prev: EditorState = { ...base, selectedSlideId: "c" };
    const next = editorReducer(prev, { type: "REMOVE_SLIDE", id: "c" });
    expect(next.slides.map((s) => s.id)).toEqual(["a", "b"]);
    expect(next.selectedSlideId).toBe("b");
  });

  it("ao remover o UNICO slide, vira estado vazio (slides=[], selectedSlideId=null)", () => {
    const prev: EditorState = {
      ...threeSlidesState(),
      slides: [{ id: "solo", body: "unico", imageUrl: undefined }],
      selectedSlideId: "solo",
    };
    const next = editorReducer(prev, { type: "REMOVE_SLIDE", id: "solo" });
    expect(next.slides).toEqual([]);
    expect(next.selectedSlideId).toBeNull();
  });

  it("ao remover um NAO-selecionado, a selecao fica inalterada", () => {
    const prev = threeSlidesState(); // selecionado "b"
    const next = editorReducer(prev, { type: "REMOVE_SLIDE", id: "a" });
    expect(next.selectedSlideId).toBe("b");
    expect(next.slides.map((s) => s.id)).toEqual(["b", "c"]);
  });

  it("com id inexistente e no-op (mesma referencia)", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "REMOVE_SLIDE",
      id: "nao-existe",
    });
    expect(next).toBe(prev);
  });
});

// --- Reorder/remocao NAO alteram identidade nem tema ------------------------

describe("reorder/remocao preservam identidade e tema", () => {
  it("MOVE_SLIDE nao altera identity nem theme", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "MOVE_SLIDE",
      id: "b",
      direction: "up",
    });
    expect(next.identity).toBe(prev.identity);
    expect(next.theme).toBe(prev.theme);
  });

  it("REMOVE_SLIDE nao altera identity nem theme", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, { type: "REMOVE_SLIDE", id: "a" });
    expect(next.identity).toBe(prev.identity);
    expect(next.theme).toBe(prev.theme);
  });
});

// --- Pureza (nao muta o estado de entrada) ----------------------------------

describe("pureza do reducer", () => {
  it("nao muta o estado anterior ao adicionar um slide", () => {
    const prev = threeSlidesState();
    const lenAntes = prev.slides.length;
    editorReducer(prev, { type: "ADD_SLIDE" });
    // O array original nao foi mutado (push aconteceu numa copia).
    expect(prev.slides.length).toBe(lenAntes);
  });

  it("nao muta o estado anterior ao editar o corpo", () => {
    const prev = threeSlidesState();
    editorReducer(prev, {
      type: "UPDATE_SLIDE_BODY",
      id: "b",
      body: "mutou?",
    });
    expect(prev.slides.find((s) => s.id === "b")?.body).toBe("corpo b");
  });
});

// --- APPLY_GENERATED (aplica carrossel gerado pela IA) ----------------------

describe("APPLY_GENERATED", () => {
  it("substitui titulo e slides pelo resultado gerado", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "APPLY_GENERATED",
      title: "Carrossel novo",
      slides: [{ body: "gerado 1" }, { body: "gerado 2" }],
    });
    expect(next.title).toBe("Carrossel novo");
    expect(next.slides.map((s) => s.body)).toEqual(["gerado 1", "gerado 2"]);
    // Os ids antigos ("a","b","c") sumiram — slides sao novos.
    expect(next.slides.map((s) => s.id)).not.toContain("a");
  });

  it("seleciona o primeiro slide gerado", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "APPLY_GENERATED",
      title: "T",
      slides: [{ body: "primeiro" }, { body: "segundo" }],
    });
    const first = next.slides[0];
    expect(first).toBeDefined();
    expect(next.selectedSlideId).toBe(first?.id);
  });

  it("cada slide gerado nasce sem imagem (imageUrl undefined)", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "APPLY_GENERATED",
      title: "T",
      slides: [{ body: "x" }],
    });
    expect(next.slides.every((s) => s.imageUrl === undefined)).toBe(true);
  });

  it("nao altera identity nem theme (so titulo e slides)", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "APPLY_GENERATED",
      title: "T",
      slides: [{ body: "x" }],
    });
    expect(next.identity).toBe(prev.identity);
    expect(next.theme).toBe(prev.theme);
  });

  it("lista vazia e no-op (nunca deixa o editor sem slide)", () => {
    const prev = threeSlidesState();
    const next = editorReducer(prev, {
      type: "APPLY_GENERATED",
      title: "T",
      slides: [],
    });
    expect(next).toBe(prev);
  });
});

// --- toSlideData (adaptador) ------------------------------------------------

describe("toSlideData", () => {
  it("monta o SlideData combinando identidade + slide + tema", () => {
    const identity = {
      name: "Octavio",
      handle: "octaviosilva",
      avatarUrl: "data:image/png;base64,AV",
      verified: true,
    };
    const slide: EditorSlide = {
      id: "x",
      body: "conteudo",
      imageUrl: "data:image/png;base64,IMG",
    };
    const data = toSlideData(identity, slide, "dark");
    expect(data).toEqual({
      name: "Octavio",
      handle: "octaviosilva",
      avatarUrl: "data:image/png;base64,AV",
      verified: true,
      body: "conteudo",
      imageUrl: "data:image/png;base64,IMG",
      theme: "dark",
    });
  });

  it("preserva imageUrl undefined (slide sem imagem)", () => {
    const identity = {
      name: "",
      handle: "",
      avatarUrl: DEFAULT_AVATAR_DATA_URL,
      verified: false,
    };
    const slide: EditorSlide = { id: "y", body: "", imageUrl: undefined };
    const data = toSlideData(identity, slide, "light");
    expect(data.imageUrl).toBeUndefined();
    expect(data.theme).toBe("light");
    expect(data.avatarUrl).toBe(DEFAULT_AVATAR_DATA_URL);
  });
});
