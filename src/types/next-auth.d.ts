// Extensao de tipos do Auth.js: adiciona `id` ao usuario da sessao e `uid` ao JWT.
// Modulo de types puro (sem runtime). Reflete os callbacks jwt/session de auth.ts.

import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** id do usuario, populado pelo callback `session` a partir do token. */
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** id do usuario, injetado pelo callback `jwt` no login. */
    uid?: string;
  }
}
