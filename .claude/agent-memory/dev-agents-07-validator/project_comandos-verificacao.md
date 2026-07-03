---
name: comandos-verificacao
description: Comandos objetivos para auditar uma fatia do Carrossel Studio (build, type-check, testes, dimensão de PNG)
metadata:
  type: project
---

Comandos de verificação objetiva desta esteira (Next.js 15 + Vitest + sharp).

**Why:** toda auditoria exige rodar a verdade, não confiar no relato do estágio anterior. Estes são os comandos que provam os critérios do produto.

**How to apply:** rodar do raiz do repo antes de emitir veredito.
- `npm run type-check` — `tsc --noEmit`, deve sair limpo (TS strict).
- `npm run build` — `next build`, compila + type-check + gera rotas estáticas.
- `npm test` — `vitest run`. Suíte cresce por fatia; até a S5 = ~230 passed / 1 skip (o skip é herdado da S1 em `png-dimensions`, não é falha). Confirmar o número, não confiar no que o handoff diz.
- **Armadilha de contagem (visto na S5):** o handoff pode citar um total de testes que não bate com o disco. Rodar `npm test` você mesmo; se o estágio 06 estiver rodando em paralelo, a contagem sobe entre rodadas (arquivos `*.test.ts` aparecendo). Reconfirmar o estado estável antes do veredito e checar `ls -lt tests/*.test.*` por mtime recente.
- Dimensão real dos PNGs (independente do teste), critério CENTRAL do produto = todo PNG exatamente 1080×1350:
  `node -e "const s=require('sharp');const fs=require('fs');(async()=>{for(const f of fs.readdirSync('tests/fixtures').sort()){const m=await s('tests/fixtures/'+f).metadata();console.log(f,m.width+'x'+m.height,m.format)}})()"`
- Fixtures PNG são gerados pelo caminho REAL de export via `npm run gen:fixtures` (Playwright/Edge no Windows → clica "Exportar PNG" na rota `/render-test`). Exigem dev server no ar.
- Fidelidade visual: dá para abrir os PNGs de `tests/fixtures/` diretamente com a tool Read e conferir o modelo Octavio (selo azul com check, header centralizado, temas, radius) — melhor que confiar em conferência externa.
