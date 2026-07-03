import { describe, it, expect, vi, beforeEach } from "vitest";

// Testes da server action de login (S3). Fronteiras mockadas: `@/auth` (que
// arrastaria @/db/server-only) e `next-auth` (so a classe AuthError). Prova o
// comportamento OBSERVAVEL do login sem subir o Auth.js real:
// - credenciais malformadas => erro GENERICO, signIn nunca e chamado (AC 22).
// - falha de credenciais (AuthError) => MESMA mensagem generica, sem vazar qual
//   campo falhou (AC 2, "falha fechado").
// - erro que nao e AuthError (ex.: redirect de sucesso propagado pelo Next) => re-lancado.

// AuthError simulado (o real vem de next-auth; usamos uma subclasse-marcador).
const { AuthErrorMock } = vi.hoisted(() => {
  class AuthErrorMock extends Error {
    type = "CredentialsSignin";
    constructor(message = "auth") {
      super(message);
      this.name = "AuthError";
    }
  }
  return { AuthErrorMock };
});

const { signInMock, signOutMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("next-auth", () => ({ AuthError: AuthErrorMock }));
vi.mock("@/auth", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

import { signInAction, signOutAction } from "@/lib/actions/auth";

/** Monta um FormData de login (nunca credenciais reais). */
function loginForm(email: unknown, password: unknown): FormData {
  const fd = new FormData();
  if (email !== undefined) fd.set("email", String(email));
  if (password !== undefined) fd.set("password", String(password));
  return fd;
}

beforeEach(() => {
  signInMock.mockReset();
  signOutMock.mockReset();
});

describe("signInAction — validação de borda (AC 22)", () => {
  it("email malformado => erro genérico e signIn NUNCA é chamado", async () => {
    const result = await signInAction(undefined, loginForm("nao-email", "x"));
    expect(result.error).toBe("E-mail ou senha inválidos");
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("senha vazia => erro genérico e signIn NUNCA é chamado", async () => {
    const result = await signInAction(
      undefined,
      loginForm("admin@example.com", ""),
    );
    expect(result.error).toBe("E-mail ou senha inválidos");
    expect(signInMock).not.toHaveBeenCalled();
  });
});

describe("signInAction — falha fechado com mensagem genérica (AC 2)", () => {
  it("credenciais inválidas (AuthError) => mensagem genérica, não revela o campo", async () => {
    // signIn lanca AuthError (como o Auth.js faz em CredentialsSignin).
    signInMock.mockRejectedValue(new AuthErrorMock());

    const result = await signInAction(
      undefined,
      loginForm("admin@example.com", "senhaerrada"),
    );

    expect(result.error).toBe("E-mail ou senha inválidos");
    // A mensagem NUNCA diz "email nao existe" ou "senha incorreta".
    expect(result.error).not.toMatch(/email|senha incorreta|não existe/i);
  });

  it("chama signIn com o provider 'credentials' e redirectTo quando o input é válido", async () => {
    // signIn de sucesso lanca o redirect do Next (nao-AuthError) — re-lancado.
    signInMock.mockResolvedValue(undefined);

    await signInAction(undefined, loginForm("admin@example.com", "senha-ok"));

    expect(signInMock).toHaveBeenCalledWith(
      "credentials",
      expect.objectContaining({
        email: "admin@example.com",
        password: "senha-ok",
        redirectTo: "/carousels",
      }),
    );
  });

  it("erro que NÃO é AuthError (ex.: redirect do Next) é re-lançado, não engolido", async () => {
    const redirectError = new Error("NEXT_REDIRECT");
    signInMock.mockRejectedValue(redirectError);

    await expect(
      signInAction(undefined, loginForm("admin@example.com", "senha-ok")),
    ).rejects.toBe(redirectError);
  });
});

describe("signOutAction (AC 5)", () => {
  it("chama signOut com redirectTo /login", async () => {
    signOutMock.mockResolvedValue(undefined);
    await signOutAction();
    expect(signOutMock).toHaveBeenCalledWith(
      expect.objectContaining({ redirectTo: "/login" }),
    );
  });
});
