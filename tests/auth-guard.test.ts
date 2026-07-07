import { describe, it, expect, vi, beforeEach } from "vitest";

// Testes do guard de sessao (requireUser/requireAdmin/getSessionUser). Prova a
// checagem de existencia no banco (fix): sessao JWT valida (assinatura ok) mas
// apontando pra um usuario ja EXCLUIDO (ex.: admin apagou o cliente) precisa
// desconectar — sem isso o cookie continua "logado" ate expirar mesmo sem user.
// Fronteiras mockadas: @/auth (sessao), @/db (existencia do user) e
// next/navigation (redirect lanca, como no Next real).

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: () => authMock() }));

// db.select({id}).from(users).where(...).limit(1) — builder encadeavel generico
// (mesmo padrao de tests/auth-actions.test.ts). state.userRows decide se o
// usuario da sessao "ainda existe" no banco.
const mockState = vi.hoisted(() => {
  const state = { userRows: [{ id: "user-1" }] as { id: string }[] };
  const builder: Record<string, unknown> = {};
  const chain = () => () => builder;
  for (const method of ["select", "from", "where", "limit"]) {
    builder[method] = chain();
  }
  builder.then = (resolve: (v: unknown) => void) => resolve(state.userRows);
  const db = { select: () => builder };
  return { state, db };
});
vi.mock("@/db", () => ({ db: mockState.db }));

const { RedirectError } = vi.hoisted(() => {
  class RedirectError extends Error {
    constructor(public readonly url: string) {
      super(`NEXT_REDIRECT:${url}`);
      this.name = "RedirectError";
    }
  }
  return { RedirectError };
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

import { requireUser, requireAdmin, getSessionUser } from "@/lib/auth-guard";

beforeEach(() => {
  authMock.mockReset();
  mockState.state.userRows = [{ id: "user-1" }];
});

describe("requireUser", () => {
  it("sem sessao => redireciona pra /login", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireUser()).rejects.toMatchObject({ url: "/login" });
  });

  it("sessao valida e usuario existe no banco => retorna o usuario", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", email: "a@b.com", name: "A", role: "client" },
    });
    const user = await requireUser();
    expect(user).toEqual({
      id: "user-1",
      email: "a@b.com",
      name: "A",
      role: "client",
    });
  });

  it("sessao JWT valida mas usuario ja foi excluido do banco => redireciona pra /login (fix)", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-deletado", email: "x@y.com", role: "client" },
    });
    mockState.state.userRows = []; // usuario nao existe mais
    await expect(requireUser()).rejects.toMatchObject({ url: "/login" });
  });
});

describe("requireAdmin", () => {
  it("sem sessao => redireciona pra /login", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toMatchObject({ url: "/login" });
  });

  it("sessao valida sem role admin => redireciona pra /dashboard", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", role: "client" },
    });
    await expect(requireAdmin()).rejects.toMatchObject({ url: "/dashboard" });
  });

  it("sessao valida com role admin e usuario existe => retorna o usuario", async () => {
    authMock.mockResolvedValue({
      user: { id: "admin-1", role: "admin" },
    });
    const user = await requireAdmin();
    expect(user.role).toBe("admin");
  });

  it("usuario admin excluido do banco => redireciona pra /login antes de checar role", async () => {
    authMock.mockResolvedValue({
      user: { id: "admin-excluido", role: "admin" },
    });
    mockState.state.userRows = [];
    await expect(requireAdmin()).rejects.toMatchObject({ url: "/login" });
  });
});

describe("getSessionUser (usado pela página de /login — não redireciona)", () => {
  it("sem sessao => null", async () => {
    authMock.mockResolvedValue(null);
    expect(await getSessionUser()).toBeNull();
  });

  it("sessao de usuario excluido => null (não lança, a página decide o que fazer)", async () => {
    authMock.mockResolvedValue({ user: { id: "sumiu" } });
    mockState.state.userRows = [];
    expect(await getSessionUser()).toBeNull();
  });

  it("sessao valida => devolve o usuario", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "client" } });
    expect(await getSessionUser()).toEqual({
      id: "user-1",
      email: undefined,
      name: undefined,
      role: "client",
    });
  });
});
