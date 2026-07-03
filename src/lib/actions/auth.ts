"use server";

// Server actions finas de autenticacao. Validam a entrada com Zod e delegam ao
// Auth.js. Erro de login e sempre GENERICO (nao revela se o email existe — AC 2).

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/auth";

// Borda: credenciais vindas do form.
const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

/** Resultado do signInAction consumido pelo form (erro inline ou redirect). */
export interface SignInResult {
  error: string;
}

/**
 * Faz login por credenciais. Em sucesso, `signIn` com redirectTo lanca um redirect
 * (o codigo apos nao roda). Em falha, retorna erro generico. Nunca vaza detalhe.
 */
export async function signInAction(
  _prevState: SignInResult | undefined,
  formData: FormData,
): Promise<SignInResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "E-mail ou senha inválidos" };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/carousels",
    });
    // Inatingivel em sucesso (signIn redireciona). Mantido por exaustividade.
    return { error: "" };
  } catch (error) {
    // AuthError (ex.: CredentialsSignin) => mensagem generica. Qualquer outro erro
    // (inclui o redirect que o Next propaga como throw) e re-lancado.
    if (error instanceof AuthError) {
      return { error: "E-mail ou senha inválidos" };
    }
    throw error;
  }
}

/** Encerra a sessao (limpa o cookie JWT) e redireciona para /login. */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
