// Extensao de tipos do Auth.js: adiciona `id` ao usuario da sessao e `uid` ao JWT.
// Modulo de types puro (sem runtime). Reflete os callbacks jwt/session de auth.ts.

import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  /** Campo extra devolvido por `authorize` (src/auth.ts), alem do User padrao. */
  interface User {
    /** 'admin' | 'client' — lido do banco no authorize. */
    role?: string;
  }

  interface Session {
    user: {
      /** id do usuario, populado pelo callback `session` a partir do token. */
      id: string;
      /**
       * 'admin' | 'client', populado pelo callback `session` a partir do token.
       * Opcional: sessoes de JWT emitidos ANTES desta mudanca nao carregam o
       * claim — requireAdmin() trata ausencia como nao-admin (falha fechado).
       */
      role?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** id do usuario, injetado pelo callback `jwt` no login. */
    uid?: string;
    /** role do usuario, injetado pelo callback `jwt` no login. */
    role?: string;
  }
}
