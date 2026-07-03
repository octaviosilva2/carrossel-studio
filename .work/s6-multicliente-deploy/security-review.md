# S6 — Revisão de segurança (auditoria ativa)

> Método: seguir o dado não-confiável da entrada até o uso; testar IDOR; falha
> fechado; superfície de ataque nova. Escopo = diff da S6 + reauditoria dos pontos
> tocados. Severidade: 🔴 explorável · 🟡 condicional · 🟢 endurecimento.

## Superfície nova auditada

### `src/lib/actions/settings.ts` — getClientSettings / updateClientSettings
- **Authz / IDOR:** ✅ o `clientId` NUNCA vem do input — é derivado de
  `getDefaultClient(user.id)` (filtro por `ownerId` da sessão). O UPDATE reforça
  `WHERE id = clientId AND ownerId = user.id`. Trocar ids no payload não alcança a
  marca de outro dono (não há id de client no payload). Sem IDOR.
- **Injeção:** ✅ Drizzle parametriza; nenhum input concatenado em SQL.
- **Validação de borda:** ✅ `ClientSettingsSchema.parse` lança antes de tocar o
  banco (nome/handle/tema/avatar). Handle restrito a `[A-Za-z0-9_]`.
- **Auth:** ✅ `requireUser()` no topo (redireciona /login sem sessão).

### `src/app/settings/*` — página + form
- **XSS:** ✅ `name`/`handle` renderizados como texto (React escapa). Avatar em
  `<img src>`; `data:image/svg+xml` carregado via `<img>` NÃO executa script
  (browsers desativam scripting em SVG de `<img>`). `javascript:` é barrado pelo
  refine (só `https://` ou `data:image/`).
- **Cache:** ✅ `dynamic = "force-dynamic"` — não serve dado de outro usuário de cache.

### `scripts/create-client.mjs`
- **Injeção:** ✅ SQL parametrizado (`$1..$6`). **Segredo:** ✅ senha só do ambiente,
  hash bcrypt 12, nunca impressa. **Idempotência:** ✅ não sobrescreve senha de
  e-mail existente.

### `src/lib/export-png.ts` — toExportSafeUrl (endurecimento AC-10)
- **SSRF / fetch de host arbitrário:** ✅ agora só busca bytes cross-origin de
  `*.public.blob.vercel-storage.com` (`isAllowedBlobHost`, match por sufixo de
  rótulo — recusa `evil-blob.vercel-storage.com`). Nota: o fetch roda no **browser**
  (client), não no servidor — não era SSRF de servidor; o endurecimento evita virar
  proxy de fetch de host arbitrário a partir de URL vinda de dado.

## Reauditoria dos pontos herdados (AC-8)
- `carousels.ts` — ✅ toda query filtra por `ownerId`; `getCarousel`/`saveCarousel`/
  `deleteCarousel` fazem `AND ownerId`; id alheio → `notFound()` (não vaza existência).
- `generate.ts` — ✅ `requireUser()` antes de qualquer chamada à API; persiste com
  `ownerId` da sessão (`createGeneratedCarousel`). Intenção do usuário só na msg user.
- `api/blob/upload` — ✅ token só com sessão; reforço server de tipo + 6 MB.
- `auth.ts` — ✅ bcrypt compare, falha genérica (não revela se e-mail existe).
- `env.ts` — ✅ valida segredos no boot; nunca imprime valores.
- Segredos no repo — ✅ nenhum; `.env.example` só com chaves vazias.

## Achados

### 🟢 (endurecimento, não bloqueia) — avatarUrl aceita qualquer host https
`settings-types.ts`: `avatarUrl` aceita `https://<qualquer>` além de `data:image/`.
O dono edita a PRÓPRIA marca (sem impacto cross-user) e o export já recusa host
fora do Blob. **Sugestão futura:** restringir `https` ao host do Blob para consistência
(uploads já vão pro Blob; o único outro caso legítimo é o default data-URL). Deixado
aberto por ser não-explorável e para não quebrar dados pré-existentes.

## Veredito
Nenhum achado 🔴/🟡. Isolamento por `ownerId` íntegro em toda a superfície (nova e
herdada). Um endurecimento 🟢 registrado para fatia futura.
