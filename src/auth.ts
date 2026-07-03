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

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    // Injeta o id do usuario no token na primeira emissao (quando `user` existe).
    jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
      }
      return token;
    },
    // Expoe session.user.id a partir do token para o resto da app consumir.
    session({ session, token }) {
      if (typeof token.uid === "string") {
        session.user.id = token.uid;
      }
      return session;
    },
  },
});
