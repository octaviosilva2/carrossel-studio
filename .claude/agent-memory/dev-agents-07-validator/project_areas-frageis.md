---
name: areas-frageis
description: Pontos frágeis recorrentes do Carrossel Studio que a auditoria deve checar em cada fatia
metadata:
  type: project
---

Áreas que já exigiram atenção na auditoria — conferir explicitamente em fatias futuras.

**Why:** são dívidas/riscos conscientes que atravessam fatias; se não vigiados, viram furo silencioso.

**How to apply:** ao auditar qualquer fatia, checar se estes seguem de pé ou foram fechados.
- **Fonte no deploy:** o produto depende de Segoe UI. A S1 NÃO embarca woff2 — usa a stack `'Segoe UI','Selawik',system-ui`. Fidelidade só garantida no Windows onde os PNGs são gerados; em Vercel/Linux cai para fallback. Follow-up: embarcar Selawik via `next/font/local`. Verificar em qualquer fatia que gere PNG para produção.
- **`noUncheckedIndexedAccess`:** a spec da S1 pediu essa flag no tsconfig junto de `strict`, mas a entrega só ligou `strict:true`. Ausente. Relevante porque S2+ introduz arrays de slides. Conferir se foi ligada.
- **ESLint desativado no build:** `next.config.mjs` tem `eslint.ignoreDuringBuilds:true`. Gate objetivo é type-check+build+testes; lint entra em fatia de tooling. Não confundir "build passou" com "lint passou".
- **Fidelidade visual vs. dados de entrada:** o render é fiel ao input — se o texto do fixture vem sem acento, o PNG sai sem acento. Isso é dado, não bug de render. Separar falha de fonte/layout de conteúdo do fixture.
