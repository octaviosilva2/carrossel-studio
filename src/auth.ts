// Configuracao do Auth.js v5 (NextAuth). Opcao A da spec: login por senha via
// provider Credentials + sessao JWT (stateless, assinada com AUTH_SECRET). Usuario
// e hash da senha vivem no Postgres; a sessao nao. Sem @auth/drizzle-adapter.
// Runtime Node (bcrypt nao roda em Edge).

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { clearFailuresForEmail } from "@/lib/login-attempts-repo";
import { normalizeEmail } from "@/lib/rate-limit";

// Schema das credenciais recebidas do form de login (borda).
const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      // Valida entrada, busca user por email e compara o hash. Retorna o usuario
      // (id/email/name) em sucesso ou null (Auth.js trata como falha de login).
      // Nunca revela se o email existe — falha generica.
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const found = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        const user = found[0];
        if (!user) return null;

        const passwordOk = await compare(password, user.passwordHash);
        if (!passwordOk) return null;

        // Login bem-sucedido: unico ponto que sabe que a senha bateu. Zera as
        // falhas do e-mail (reset da janela — decisao 4). Best-effort: se o DELETE
        // falhar, loga internamente e NAO impede o login (o usuario ja provou a
        // senha; as falhas antigas saem sozinhas da janela em <=15 min). Usa a
        // MESMA normalizacao da contagem/gravacao para a chave bater exatamente.
        await clearFailuresForEmail(normalizeEmail(email));

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    // Injeta id + role no token na primeira emissao (quando `user` existe).
    jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
        token.role = user.role;
      }
      return token;
    },
    // Expoe session.user.id/role a partir do token para o resto da app consumir.
    session({ session, token }) {
      if (typeof token.uid === "string") {
        session.user.id = token.uid;
      }
      if (typeof token.role === "string") {
        session.user.role = token.role;
      }
      return session;
    },
  },
});
