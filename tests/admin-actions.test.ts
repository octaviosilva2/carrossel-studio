import { describe, it, expect, vi, beforeEach } from "vitest";

// Testes das server actions administrativas (gestao de contas de cliente).
// Fronteiras externas mockadas (mocking-estrategico): o banco (@/db), o guard de
// sessao (@/lib/auth-guard) e o bcrypt (custo 12 real seria lento demais aqui —
// so o VALOR passado importa, nao o hash em si). O valor testavel e a REGRA:
// (a) toda action exige requireAdmin(), (b) createClientAccount e idempotente
// por e-mail e nunca retorna a senha, (c) listClientsAdmin agrega a contagem de
// carrosseis por dono, (d) deleteClientAccount so apaga contas role='client'.

// --- Estado do mock do banco (fila de resultados, ao estilo carousel-actions) --
const mockState = vi.hoisted(() => {
  const state = {
    dbResults: [] as unknown[],
    resultCursor: 0,
    whereArgs: [] as unknown[],
    transactionCalled: false,
  };

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
      "innerJoin",
      "where",
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
        select: () => makeChainBuilder(),
        delete: () => makeChainBuilder(),
      };
      return await cb(tx);
    },
  };

  return { state, db };
});

vi.mock("@/db", () => ({ db: mockState.db }));

// --- Mock do guard de sessao (admin) -----------------------------------------
const { requireAdminMock } = vi.hoisted(() => ({ requireAdminMock: vi.fn() }));
vi.mock("@/lib/auth-guard", () => ({ requireAdmin: () => requireAdminMock() }));

// --- Mock do bcrypt (o valor testavel e o COST passado, nao o hash real) ------
const { hashMock } = vi.hoisted(() => ({
  hashMock: vi.fn(async (_pw: string, _cost: number) => "hashed-password"),
}));
vi.mock("bcryptjs", () => ({ hash: (...args: [string, number]) => hashMock(...args) }));

import {
  createClientAccount,
  deleteClientAccount,
  listClientsAdmin,
} from "@/lib/actions/admin";

const VALID_UUID = "33333333-3333-4333-8333-333333333333";

/** Varredura recursiva atras de um valor (mesma tecnica dos demais testes de actions). */
function containsValue(obj: unknown, needle: string, seen = new Set<unknown>()): boolean {
  if (obj == null) return false;
  if (typeof obj === "string") return obj.includes(needle);
  if (typeof obj !== "object") return false;
  if (seen.has(obj)) return false;
  seen.add(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    let value: unknown;
    try {
      value = (obj as Record<string, unknown>)[key];
    } catch {
      continue;
    }
    if (containsValue(value, needle, seen)) return true;
  }
  return false;
}

beforeEach(() => {
  mockState.state.dbResults = [];
  mockState.state.resultCursor = 0;
  mockState.state.whereArgs.length = 0;
  mockState.state.transactionCalled = false;
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue({
    id: "admin-1",
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
  });
  hashMock.mockClear();
});

// =============================================================================
// Barreira de sessao — toda action chama requireAdmin
// =============================================================================
describe("barreira de sessão — requireAdmin no topo", () => {
  it("createClientAccount chama requireAdmin antes de tudo", async () => {
    mockState.state.dbResults = [[], [{ id: VALID_UUID }], []];
    await createClientAccount({ email: "novo@x.com", password: "senha-1234" });
    expect(requireAdminMock).toHaveBeenCalledTimes(1);
  });

  it("listClientsAdmin chama requireAdmin antes de listar", async () => {
    mockState.state.dbResults = [[]];
    await listClientsAdmin();
    expect(requireAdminMock).toHaveBeenCalledTimes(1);
  });

  it("deleteClientAccount chama requireAdmin antes de apagar", async () => {
    mockState.state.dbResults = [[{ id: VALID_UUID }]];
    await deleteClientAccount(VALID_UUID);
    expect(requireAdminMock).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// createClientAccount — idempotente por e-mail, nunca retorna a senha
// =============================================================================
describe("createClientAccount — provisionamento idempotente", () => {
  it("cria user (role client) + client placeholder quando o e-mail não existe", async () => {
    mockState.state.dbResults = [
      [], // SELECT existing por e-mail — vazio
      [{ id: VALID_UUID }], // tx.insert(users).returning()
      [], // tx.insert(clients).values() — sem returning
    ];

    const result = await createClientAccount({
      email: "novo@x.com",
      password: "senha-1234",
    });

    expect(result).toEqual({ userId: VALID_UUID });
    expect(mockState.state.transactionCalled).toBe(true);
    // Nunca retorna a senha em texto.
    expect(JSON.stringify(result)).not.toContain("senha-1234");
  });

  it("hash da senha usa custo 12 (bcrypt)", async () => {
    mockState.state.dbResults = [[], [{ id: VALID_UUID }], []];
    await createClientAccount({ email: "novo@x.com", password: "senha-1234" });
    expect(hashMock).toHaveBeenCalledWith("senha-1234", 12);
  });

  it("e-mail já existente rejeita com erro claro, sem transação", async () => {
    mockState.state.dbResults = [[{ id: "existing-id" }]];

    await expect(
      createClientAccount({ email: "ja-existe@x.com", password: "senha-1234" }),
    ).rejects.toBeTruthy();
    expect(mockState.state.transactionCalled).toBe(false);
  });

  it("senha curta (<8) rejeita pelo Zod antes de tocar o banco", async () => {
    await expect(
      createClientAccount({ email: "novo@x.com", password: "curta" }),
    ).rejects.toBeTruthy();
    expect(mockState.state.resultCursor).toBe(0);
    expect(mockState.state.transactionCalled).toBe(false);
  });
});

// =============================================================================
// listClientsAdmin — agrega carouselCount por dono
// =============================================================================
describe("listClientsAdmin — listagem com contagem de carrosséis", () => {
  it("agrega carouselCount por dono corretamente", async () => {
    mockState.state.dbResults = [
      [
        { id: "u1", email: "a@x.com", name: "Marca A", handle: "marcaa" },
        { id: "u2", email: "b@x.com", name: "Marca B", handle: "marcab" },
      ],
      [{ ownerId: "u1" }, { ownerId: "u1" }, { ownerId: "u2" }],
    ];

    const list = await listClientsAdmin();

    expect(list).toEqual([
      { id: "u1", email: "a@x.com", name: "Marca A", handle: "marcaa", carouselCount: 2 },
      { id: "u2", email: "b@x.com", name: "Marca B", handle: "marcab", carouselCount: 1 },
    ]);
  });

  it("dono sem nenhum carrossel entra com carouselCount 0", async () => {
    mockState.state.dbResults = [
      [{ id: "u1", email: "a@x.com", name: "Marca A", handle: "marcaa" }],
      [],
    ];

    const list = await listClientsAdmin();

    expect(list).toEqual([
      { id: "u1", email: "a@x.com", name: "Marca A", handle: "marcaa", carouselCount: 0 },
    ]);
  });

  it("lista vazia quando não há clientes (não roda a query de carrosséis)", async () => {
    mockState.state.dbResults = [[]];
    expect(await listClientsAdmin()).toEqual([]);
    expect(mockState.state.resultCursor).toBe(1);
  });
});

// =============================================================================
// deleteClientAccount — só apaga contas role='client'
// =============================================================================
describe("deleteClientAccount — remoção restrita a contas role='client'", () => {
  it("apaga com sucesso quando existe e é role client", async () => {
    mockState.state.dbResults = [[{ id: VALID_UUID }]];
    const result = await deleteClientAccount(VALID_UUID);
    expect(result.ok).toBe(true);
  });

  it("o DELETE filtra por role='client' (defesa em profundidade — nunca apaga admin)", async () => {
    mockState.state.dbResults = [[{ id: VALID_UUID }]];
    await deleteClientAccount(VALID_UUID);
    const hasRoleFilter = mockState.state.whereArgs.some((w) =>
      containsValue(w, "client"),
    );
    expect(hasRoleFilter).toBe(true);
  });

  it("id não-UUID rejeita antes de tocar o banco", async () => {
    await expect(deleteClientAccount("id-invalido")).rejects.toBeTruthy();
    expect(mockState.state.resultCursor).toBe(0);
  });

  it("0 linhas afetadas (inexistente ou é admin) lança erro claro", async () => {
    mockState.state.dbResults = [[]];
    await expect(deleteClientAccount(VALID_UUID)).rejects.toBeTruthy();
  });
});
