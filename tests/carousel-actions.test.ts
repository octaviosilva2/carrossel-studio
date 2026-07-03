import { describe, it, expect, vi, beforeEach } from "vitest";

// Testes das server actions de carrossel (S3) com as FRONTEIRAS EXTERNAS mockadas
// (mocking-estrategico): o banco (@/db) e o guard de sessao (@/lib/auth-guard) e o
// next/navigation. jsdom nao conecta a Postgres — o valor testavel aqui e a REGRA:
// (a) toda action exige sessao (barrada sem usuario), (b) queries de carousel
// filtram por ownerId da SESSAO (nunca do client), (c) recurso de outro dono/
// inexistente => notFound (nao vaza dado alheio), (d) listCarousels so do dono,
// (e) saveCarousel usa transacao (replace-all) e valida a entrada com Zod antes.
//
// Estrategia de mock do banco: um query builder encadeavel cujo RESULTADO final
// (o array retornado ao `await`) e configuravel por teste. Capturamos os argumentos
// passados a `.where()` para provar que o ownerId da sessao entra no filtro — sem
// depender da estrutura SQL interna do Drizzle: usamos os `eq`/`and` REAIS, que
// carregam os valores comparados, e varremos o objeto resultante atras do id.

// --- Estado do mock (reconfiguravel por teste) -------------------------------
// vi.mock e "hoisted" para o topo do arquivo; para o factory poder referenciar o
// estado do mock, ele nasce dentro de vi.hoisted (tambem elevado, mas ANTES do
// factory). `mockState` guarda a fila de resultados, os filtros where capturados
// e o flag de transacao — reconfiguravel por teste via beforeEach.
const mockState = vi.hoisted(() => {
  const state = {
    /** Fila de resultados devolvidos por `await builder`, em ordem. */
    dbResults: [] as unknown[],
    resultCursor: 0,
    /** Argumentos de cada `.where(...)` — para inspecionar os filtros. */
    whereArgs: [] as unknown[],
    /** Sinaliza se `db.transaction` foi chamado (replace-all atomico). */
    transactionCalled: false,
    /**
     * Se != null, `db.transaction` REJEITA com este erro DEPOIS de rodar o
     * callback — simula uma falha no meio do replace-all onde o driver `pg`
     * faz ROLLBACK e propaga. `null` = transacao normal (comportamento padrao).
     */
    transactionError: null as Error | null,
  };

  /**
   * Builder encadeavel: cada metodo retorna o proprio builder. "Thenable" —
   * `await builder` resolve com o proximo resultado da fila.
   */
  function makeChainBuilder(): Record<string, unknown> {
    const builder: Record<string, unknown> = {};
    const chain =
      (name: string) =>
      (...args: unknown[]) => {
        if (name === "where") state.whereArgs.push(args[0]);
        return builder;
      };

    for (const method of [
      "select",
      "from",
      "where",
      "orderBy",
      "limit",
      "insert",
      "values",
      "returning",
      "update",
      "set",
      "delete",
    ]) {
      builder[method] = chain(method);
    }

    builder.then = (resolve: (v: unknown) => void) => {
      const value = state.dbResults[state.resultCursor] ?? [];
      state.resultCursor += 1;
      resolve(value);
    };

    return builder;
  }

  const db = {
    select: () => makeChainBuilder(),
    insert: () => makeChainBuilder(),
    update: () => makeChainBuilder(),
    delete: () => makeChainBuilder(),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      state.transactionCalled = true;
      const tx = {
        insert: () => makeChainBuilder(),
        update: () => makeChainBuilder(),
        delete: () => makeChainBuilder(),
        select: () => makeChainBuilder(),
      };
      const result = await cb(tx);
      // Falha injetada no meio do replace-all: o driver `pg` faria ROLLBACK e
      // propagaria o erro (a transacao inteira e desfeita, nada de commit parcial).
      if (state.transactionError) throw state.transactionError;
      return result;
    },
  };

  return { state, db };
});

vi.mock("@/db", () => ({ db: mockState.db }));

// --- Mock do guard de sessao -------------------------------------------------
// requireUser: por padrao retorna um usuario logado (id da sessao). Testes de
// "sem sessao" fazem-no rejeitar/redirecionar como a implementacao real faria.

const SESSION_USER_ID = "session-user-123";
const { requireUserMock } = vi.hoisted(() => ({ requireUserMock: vi.fn() }));

vi.mock("@/lib/auth-guard", () => ({
  requireUser: () => requireUserMock(),
}));

// --- Mock do next/navigation -------------------------------------------------
// notFound() e redirect() lancam no Next (interrompem o fluxo). Simulamos com
// erros marcados para asserir "chamou notFound" sem tocar o runtime do Next.
// As classes vivem em vi.hoisted para o factory (elevado) enxerga-las.
const { NotFoundError, RedirectError } = vi.hoisted(() => {
  class NotFoundError extends Error {
    constructor() {
      super("NEXT_NOT_FOUND");
      this.name = "NotFoundError";
    }
  }
  class RedirectError extends Error {
    constructor(url: string) {
      super(`NEXT_REDIRECT:${url}`);
      this.name = "RedirectError";
    }
  }
  return { NotFoundError, RedirectError };
});

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError();
  },
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

import {
  getCarousel,
  saveCarousel,
  listCarousels,
  deleteCarousel,
  createCarousel,
} from "@/lib/actions/carousels";
import type { SaveCarouselInput } from "@/lib/actions/carousel-types";

const VALID_UUID = "22222222-2222-4222-8222-222222222222";

/**
 * Varre recursivamente um objeto (o `where` do Drizzle e um SQL wrapper com o
 * valor comparado guardado em campos internos: params/queryChunks). Procura o
 * `needle` em qualquer valor string alcancavel. Evita depender do JSON.stringify
 * (o Drizzle guarda o valor em propriedades nao-enumeraveis / Param objects).
 */
function containsValue(obj: unknown, needle: string, seen = new Set<unknown>()): boolean {
  if (obj == null) return false;
  if (typeof obj === "string") return obj.includes(needle);
  if (typeof obj !== "object") return false;
  if (seen.has(obj)) return false;
  seen.add(obj);

  // Varre chaves proprias (enumeraveis e nao-enumeraveis).
  for (const key of Object.getOwnPropertyNames(obj)) {
    let value: unknown;
    try {
      value = (obj as Record<string, unknown>)[key];
    } catch {
      continue; // getters que lancam: ignora.
    }
    if (containsValue(value, needle, seen)) return true;
  }
  return false;
}

/** Client padrao "encontrado" pelo banco (usado quando a action busca o client). */
function clientRow() {
  return {
    id: "client-1",
    ownerId: SESSION_USER_ID,
    name: "Sua Marca",
    handle: "suamarca",
    avatarUrl: "https://blob.example/a.png",
    verified: false,
    theme: "light",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Linha de carousel "encontrada" (posse ok). */
function carouselRow() {
  return {
    id: VALID_UUID,
    ownerId: SESSION_USER_ID,
    clientId: "client-1",
    title: "Meu carrossel",
    overrideName: null,
    overrideHandle: null,
    overrideAvatarUrl: null,
    overrideVerified: null,
    overrideTheme: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function validSaveInput(): SaveCarouselInput {
  return {
    id: VALID_UUID,
    title: "Meu carrossel",
    theme: "light",
    identity: {
      name: "Octavio",
      handle: "octaviosilva",
      avatarUrl: "https://blob.example/avatar.png",
      verified: true,
    },
    slides: [{ body: "a" }, { body: "b", imageUrl: "https://blob.example/i.png" }],
  };
}

beforeEach(() => {
  mockState.state.dbResults = [];
  mockState.state.resultCursor = 0;
  mockState.state.whereArgs.length = 0;
  mockState.state.transactionCalled = false;
  mockState.state.transactionError = null;
  requireUserMock.mockReset();
  // Por padrao: usuario logado.
  requireUserMock.mockResolvedValue({
    id: SESSION_USER_ID,
    email: "admin@example.com",
    name: "Admin",
  });
});

// =============================================================================
// Barreira de sessao — toda action chama requireUser (AC 6)
// =============================================================================
describe("barreira de sessão — requireUser no topo (AC 6)", () => {
  it("getCarousel chama requireUser antes de qualquer query", async () => {
    mockState.state.dbResults = [[carouselRow()], [clientRow()], []];
    await getCarousel(VALID_UUID);
    expect(requireUserMock).toHaveBeenCalledTimes(1);
  });

  it("listCarousels chama requireUser antes de listar", async () => {
    mockState.state.dbResults = [[]];
    await listCarousels();
    expect(requireUserMock).toHaveBeenCalledTimes(1);
  });

  it("saveCarousel chama requireUser antes de persistir", async () => {
    mockState.state.dbResults = [[carouselRow()], [clientRow()]];
    await saveCarousel(validSaveInput());
    expect(requireUserMock).toHaveBeenCalledTimes(1);
  });

  it("deleteCarousel chama requireUser antes de apagar", async () => {
    mockState.state.dbResults = [[{ id: VALID_UUID }]];
    await deleteCarousel(VALID_UUID);
    expect(requireUserMock).toHaveBeenCalledTimes(1);
  });

  it("createCarousel chama requireUser antes de criar", async () => {
    mockState.state.dbResults = [[clientRow()], [{ id: VALID_UUID }], []];
    await createCarousel();
    expect(requireUserMock).toHaveBeenCalledTimes(1);
  });

  it("sem sessão, requireUser redireciona e a query nunca roda (AC 6, edge sessão)", async () => {
    // Simula a implementacao real: sem sessao, requireUser lanca (redirect).
    requireUserMock.mockRejectedValue(new RedirectError("/login"));
    mockState.state.dbResults = [[carouselRow()]];

    await expect(getCarousel(VALID_UUID)).rejects.toBeInstanceOf(RedirectError);
    // Nenhuma query de dados chegou a rodar (nenhum where capturado).
    expect(mockState.state.whereArgs).toHaveLength(0);
  });
});

// =============================================================================
// Filtro por ownerId da sessao (AC 9, 23) + outro dono => notFound
// =============================================================================
describe("authz por dono — ownerId da sessão no filtro (AC 9, 23)", () => {
  it("getCarousel filtra por ownerId da sessão (id da sessão aparece no where)", async () => {
    mockState.state.dbResults = [[carouselRow()], [clientRow()], []];
    await getCarousel(VALID_UUID);

    // Algum dos filtros where deve conter o id da sessao (nunca um id do client).
    const hasOwnerFilter = mockState.state.whereArgs.some((w) =>
      containsValue(w, SESSION_USER_ID),
    );
    expect(hasOwnerFilter).toBe(true);
    // Discriminacao: um id inexistente NAO aparece (prova que o scan nao e trivial).
    const hasBogus = mockState.state.whereArgs.some((w) =>
      containsValue(w, "id-que-nunca-foi-usado"),
    );
    expect(hasBogus).toBe(false);
  });

  it("getCarousel com carousel de OUTRO dono (query vazia) => notFound (AC 23)", async () => {
    // Primeira query (carousel WHERE id AND ownerId) volta vazia: dono errado.
    mockState.state.dbResults = [[]];
    await expect(getCarousel(VALID_UUID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getCarousel com id não-UUID => notFound (não vaza, nem toca o banco)", async () => {
    await expect(getCarousel("id-invalido")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(mockState.state.whereArgs).toHaveLength(0);
  });

  it("saveCarousel de OUTRO dono (posse não confirmada) => notFound, sem transação (AC 23)", async () => {
    // Query de posse volta vazia: nao e do dono -> notFound antes de qualquer escrita.
    mockState.state.dbResults = [[]];
    await expect(saveCarousel(validSaveInput())).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(mockState.state.transactionCalled).toBe(false);
  });

  it("saveCarousel filtra a posse por ownerId da sessão", async () => {
    mockState.state.dbResults = [[carouselRow()], [clientRow()]];
    await saveCarousel(validSaveInput());
    const hasOwnerFilter = mockState.state.whereArgs.some((w) =>
      containsValue(w, SESSION_USER_ID),
    );
    expect(hasOwnerFilter).toBe(true);
  });

  it("deleteCarousel de OUTRO dono (0 linhas afetadas) => notFound", async () => {
    // returning() volta vazio: nenhuma linha do dono foi apagada.
    mockState.state.dbResults = [[]];
    await expect(deleteCarousel(VALID_UUID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("deleteCarousel filtra por ownerId da sessão", async () => {
    mockState.state.dbResults = [[{ id: VALID_UUID }]];
    await deleteCarousel(VALID_UUID);
    const hasOwnerFilter = mockState.state.whereArgs.some((w) =>
      containsValue(w, SESSION_USER_ID),
    );
    expect(hasOwnerFilter).toBe(true);
  });
});

// =============================================================================
// listCarousels — so os do dono (AC 18)
// =============================================================================
describe("listCarousels — só os do dono (AC 18)", () => {
  it("filtra por ownerId da sessão", async () => {
    mockState.state.dbResults = [[]];
    await listCarousels();
    const hasOwnerFilter = mockState.state.whereArgs.some((w) =>
      containsValue(w, SESSION_USER_ID),
    );
    expect(hasOwnerFilter).toBe(true);
  });

  it("mapeia as linhas para CarouselListItem com updatedAt em ISO", async () => {
    const updatedAt = new Date("2026-06-30T12:00:00.000Z");
    mockState.state.dbResults = [[{ id: VALID_UUID, title: "X", updatedAt }]];

    const list = await listCarousels();

    expect(list).toEqual([
      { id: VALID_UUID, title: "X", updatedAt: "2026-06-30T12:00:00.000Z" },
    ]);
  });

  it("lista vazia quando o dono não tem carrosséis", async () => {
    mockState.state.dbResults = [[]];
    expect(await listCarousels()).toEqual([]);
  });
});

// =============================================================================
// saveCarousel — transacao replace-all e validacao Zod (AC 16, 17, 22)
// =============================================================================
describe("saveCarousel — transação replace-all e validação (AC 16, 17, 22)", () => {
  it("persiste dentro de uma transação (replace-all atômico)", async () => {
    mockState.state.dbResults = [[carouselRow()], [clientRow()]];
    const result = await saveCarousel(validSaveInput());

    expect(mockState.state.transactionCalled).toBe(true);
    expect(result.ok).toBe(true);
    expect(typeof result.updatedAt).toBe("string");
  });

  it("entrada malformada (title vazio) rejeita ANTES de qualquer efeito (AC 22)", async () => {
    mockState.state.dbResults = [[carouselRow()], [clientRow()]];
    const bad = { ...validSaveInput(), title: "" };

    await expect(saveCarousel(bad)).rejects.toBeTruthy();
    // Zod barra antes: nenhuma transacao e nenhuma query de posse.
    expect(mockState.state.transactionCalled).toBe(false);
  });

  it("id não-UUID no payload rejeita sem transação (AC 22)", async () => {
    const bad = { ...validSaveInput(), id: "nao-uuid" };
    await expect(saveCarousel(bad)).rejects.toBeTruthy();
    expect(mockState.state.transactionCalled).toBe(false);
  });

  it("erro no meio do replace-all => transação propaga (rollback), sem retorno de sucesso (edge case)", async () => {
    // Posse ok (carousel + client encontrados), mas uma query DENTRO da transacao
    // falha. O driver `pg` faz ROLLBACK e propaga; saveCarousel NAO deve engolir o
    // erro nem retornar { ok:true } (nada de estado parcial persistido).
    mockState.state.dbResults = [[carouselRow()], [clientRow()]];
    mockState.state.transactionError = new Error("falha no INSERT de slides");

    await expect(saveCarousel(validSaveInput())).rejects.toThrow(
      /falha no INSERT de slides/,
    );
    // A transacao CHEGOU a ser aberta (a falha foi no meio, atomicamente desfeita).
    expect(mockState.state.transactionCalled).toBe(true);
  });
});
