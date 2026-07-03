import { describe, it, expect, vi, beforeEach } from "vitest";

// Testes da action de configuracao da identidade padrao (S6). Fronteiras externas
// mockadas (mocking-estrategico): o banco (@/db), o guard de sessao
// (@/lib/auth-guard) e o repo do client (@/lib/client-repo). O valor testavel e a
// REGRA: (a) requireUser no topo, (b) Zod barra entrada invalida ANTES de tocar o
// banco, (c) o UPDATE filtra por ownerId da SESSAO (isolamento por dono), (d) a
// leitura projeta e normaliza o tema.

// --- Estado do mock do banco (captura o where do update) ---------------------
const mockState = vi.hoisted(() => {
  const state = {
    whereArgs: [] as unknown[],
    updateCalled: false,
    setArgs: [] as unknown[],
  };

  function makeChainBuilder(): Record<string, unknown> {
    const builder: Record<string, unknown> = {};
    const chain =
      (name: string) =>
      (...args: unknown[]) => {
        if (name === "where") state.whereArgs.push(args[0]);
        if (name === "set") state.setArgs.push(args[0]);
        return builder;
      };
    for (const method of ["update", "set", "where"]) {
      builder[method] = chain(method);
    }
    // Thenable: `await builder` resolve vazio (o update nao retorna nada usado).
    builder.then = (resolve: (v: unknown) => void) => resolve([]);
    return builder;
  }

  const db = {
    update: () => {
      state.updateCalled = true;
      return makeChainBuilder();
    },
  };

  return { state, db };
});

vi.mock("@/db", () => ({ db: mockState.db }));

// --- Mock do guard de sessao -------------------------------------------------
const SESSION_USER_ID = "session-user-123";
const { requireUserMock } = vi.hoisted(() => ({ requireUserMock: vi.fn() }));
vi.mock("@/lib/auth-guard", () => ({ requireUser: () => requireUserMock() }));

// --- Mock do repo do client (marca do dono) ----------------------------------
const { getDefaultClientMock } = vi.hoisted(() => ({
  getDefaultClientMock: vi.fn(),
}));
vi.mock("@/lib/client-repo", () => ({
  getDefaultClient: (ownerId: string) => getDefaultClientMock(ownerId),
}));

import { getClientSettings, updateClientSettings } from "@/lib/actions/settings";
import type { ClientSettings } from "@/lib/actions/settings-types";

// Varredura recursiva atras de um valor (o where do Drizzle guarda o valor em
// campos internos). Reusa a ideia do teste de carousel-actions.
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

function clientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "client-1",
    ownerId: SESSION_USER_ID,
    name: "Sua Marca",
    handle: "suamarca",
    avatarUrl: "data:image/svg+xml,<svg/>",
    verified: false,
    theme: "light",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function validSettings(): ClientSettings {
  return {
    name: "Octavio Silva",
    handle: "octaviosilva",
    avatarUrl: "https://storage.evoiatecnologia.com/carrossel-studio/a.png",
    verified: true,
    theme: "dark",
  };
}

beforeEach(() => {
  mockState.state.whereArgs.length = 0;
  mockState.state.setArgs.length = 0;
  mockState.state.updateCalled = false;
  requireUserMock.mockReset();
  requireUserMock.mockResolvedValue({
    id: SESSION_USER_ID,
    email: "admin@example.com",
    name: "Admin",
  });
  getDefaultClientMock.mockReset();
  getDefaultClientMock.mockResolvedValue(clientRow());
});

// =============================================================================
// getClientSettings — leitura projetada do dono (AC-1, AC-7)
// =============================================================================
describe("getClientSettings — leitura do dono", () => {
  it("chama requireUser e busca o client pelo id da sessão", async () => {
    await getClientSettings();
    expect(requireUserMock).toHaveBeenCalledTimes(1);
    expect(getDefaultClientMock).toHaveBeenCalledWith(SESSION_USER_ID);
  });

  it("projeta os 5 campos da identidade", async () => {
    getDefaultClientMock.mockResolvedValue(
      clientRow({ name: "Marca X", handle: "marcax", verified: true, theme: "dark" }),
    );
    const s = await getClientSettings();
    expect(s).toEqual({
      name: "Marca X",
      handle: "marcax",
      avatarUrl: "data:image/svg+xml,<svg/>",
      verified: true,
      theme: "dark",
    });
  });

  it("normaliza tema desconhecido do banco para 'light'", async () => {
    getDefaultClientMock.mockResolvedValue(clientRow({ theme: "sepia" }));
    const s = await getClientSettings();
    expect(s.theme).toBe("light");
  });
});

// =============================================================================
// updateClientSettings — authz + validacao (AC-2, AC-6, AC-7)
// =============================================================================
describe("updateClientSettings — validação e isolamento por dono", () => {
  it("persiste válido e retorna ok + updatedAt ISO", async () => {
    const result = await updateClientSettings(validSettings());
    expect(requireUserMock).toHaveBeenCalledTimes(1);
    expect(mockState.state.updateCalled).toBe(true);
    expect(result.ok).toBe(true);
    expect(typeof result.updatedAt).toBe("string");
    // updatedAt e uma data ISO valida.
    expect(Number.isNaN(Date.parse(result.updatedAt))).toBe(false);
  });

  it("o UPDATE filtra por ownerId da sessão (isolamento por dono)", async () => {
    await updateClientSettings(validSettings());
    const hasOwnerFilter = mockState.state.whereArgs.some((w) =>
      containsValue(w, SESSION_USER_ID),
    );
    expect(hasOwnerFilter).toBe(true);
  });

  it("aceita avatar data-URL (o default do seed)", async () => {
    const result = await updateClientSettings({
      ...validSettings(),
      avatarUrl: "data:image/png;base64,AAAA",
    });
    expect(result.ok).toBe(true);
  });

  it("handle vazio rejeita ANTES de tocar o banco (AC-6)", async () => {
    await expect(
      updateClientSettings({ ...validSettings(), handle: "" }),
    ).rejects.toBeTruthy();
    expect(mockState.state.updateCalled).toBe(false);
  });

  it("handle com caractere inválido (@/espaço) rejeita sem gravar", async () => {
    await expect(
      updateClientSettings({ ...validSettings(), handle: "octavio silva" }),
    ).rejects.toBeTruthy();
    await expect(
      updateClientSettings({ ...validSettings(), handle: "@octavio" }),
    ).rejects.toBeTruthy();
    expect(mockState.state.updateCalled).toBe(false);
  });

  it("nome vazio rejeita sem gravar (AC-6)", async () => {
    await expect(
      updateClientSettings({ ...validSettings(), name: "   " }),
    ).rejects.toBeTruthy();
    expect(mockState.state.updateCalled).toBe(false);
  });

  it("tema fora de light/dark rejeita sem gravar (AC-6)", async () => {
    await expect(
      updateClientSettings({
        ...validSettings(),
        theme: "sepia" as unknown as ClientSettings["theme"],
      }),
    ).rejects.toBeTruthy();
    expect(mockState.state.updateCalled).toBe(false);
  });

  it("avatar com esquema não permitido (javascript:) rejeita sem gravar", async () => {
    await expect(
      updateClientSettings({
        ...validSettings(),
        avatarUrl: "javascript:alert(1)",
      }),
    ).rejects.toBeTruthy();
    expect(mockState.state.updateCalled).toBe(false);
  });
});
