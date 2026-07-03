# S6 — Multi-cliente + deploy + hardening — SPEC

> Gate 2 (spec). Desenho técnico da story aprovada. Filtro de simplicidade (YAGNI)
> aplicado: nada de abstração para futuro especulado. Reusa o máximo do que já existe.

## Princípio-guia
O isolamento por `ownerId` **já existe e é sólido** (toda query de carousel filtra por
dono, falha fechado). A S6 **não reescreve** isso — adiciona a superfície nova
(settings) seguindo o MESMO padrão, audita o conjunto e endurece pontas soltas.

## 1. Backend

### 1.1 Extrair `getDefaultClient` (refactor mínimo)
Hoje é privado em `carousels.ts`. Extrair para **`src/lib/client-repo.ts`** (`server-only`)
e reusar em `carousels.ts` e na nova `settings.ts` — sem duplicar a regra "1º client do dono".
- `export async function getDefaultClient(ownerId: string): Promise<ClientRow>`
- `carousels.ts` passa a importar daqui (comportamento idêntico, zero mudança de lógica).

### 1.2 `src/lib/actions/settings-types.ts` (módulo neutro)
Um arquivo `"use server"` só exporta funções async → schema/tipos ficam aqui (padrão S3).
- `ClientSettingsSchema` (Zod):
  - `name`: string, trim, 1..80.
  - `handle`: string, trim, 1..30, regex `^[A-Za-z0-9_]+$` (sem `@`).
  - `avatarUrl`: string — aceita `https://…` OU `data:image/…` (o default é data-URL SVG).
  - `verified`: boolean.
  - `theme`: enum `["light","dark"]`.
- Tipos: `ClientSettings` (form), `UpdateClientSettingsResult = { ok: true; updatedAt: string }`.

### 1.3 `src/lib/actions/settings.ts` (`"use server"`)
Padrão de segurança idêntico às actions da S3 (requireUser + Zod + ownerId na query):
- `getClientSettings(): Promise<ClientSettings>` — `requireUser()` → `getDefaultClient(user.id)`
  → projeta os 5 campos. (Falha fechado: sem client → o helper lança.)
- `updateClientSettings(input): Promise<UpdateClientSettingsResult>`:
  - `requireUser()`.
  - `ClientSettingsSchema.parse(input)` (borda; rejeita antes de tocar o banco).
  - `getDefaultClient(user.id)` para obter o `id` do client do dono.
  - `UPDATE clients SET … , updatedAt=now WHERE id = <clientId> AND ownerId = <user.id>`
    (filtro por dono reforçado na escrita — defesa em profundidade).
  - Retorna `{ ok, updatedAt }`.

## 2. Frontend

### 2.1 `src/app/settings/page.tsx` (Server Component)
- `requireUser()` (redireciona `/login` se deslogado — AC-5).
- `getClientSettings()` → passa como prop inicial ao form.

### 2.2 `src/app/settings/settings-form.tsx` (Client Component)
Reusa componentes existentes (Card/Input/Label/Switch/Button) e o padrão do `IdentityPanel`:
- Campos: Nome (Input), Handle (Input com prefixo `@`, strip de `@` no onChange), Avatar
  (preview + "Trocar" via `uploadImageToBlob` + `validateImageFile`, "Remover" → default),
  Selo (Switch), Tema padrão (Switch light/dark ou dois botões).
- Botão **Salvar** com estados `idle | salvando | salvo | erro` + `aria-live` (padrão da S3/S5).
- Chama `updateClientSettings`; erro de rede/validação → mensagem genérica inline.
- Default de avatar: reusa `DEFAULT_AVATAR_DATA_URL` de `editor-state.ts` (fonte única).

### 2.3 Navegação
- Link para `/settings` no header de `/carousels` (ex.: ícone engrenagem "Configurações").
  Sem redesenho — só um link discreto, coerente com a UI minimalista.

## 3. Fonte do slide (deploy prep — AC-13)
Problema: `SLIDE_FONT_STACK` começa por `'Segoe UI'` (só no Windows) → no Linux da Vercel
cai em `system-ui`, quebrando a métrica do PNG.
- Baixar **Selawik** (Regular 400 + Bold 700) — par métrico livre da Segoe UI, licença MIT
  (github.com/microsoft/Selawik) — para `src/fonts/`.
- `src/app/fonts.ts`: `localFont({ src: [Regular, Bold], variable: "--font-selawik",
  display: "swap" })`.
- `layout.tsx`: aplicar `selawik.variable` no `<html>` (expõe a CSS var no DOM; o export
  html-to-image já aguarda `document.fonts.ready`).
- `slide-tokens.ts`: `SLIDE_FONT_STACK = "'Segoe UI', var(--font-selawik), 'Selawik',
  system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"` — Segoe UI segue 1º
  (fidelidade máxima no Windows), Selawik embarcada garante o Linux.
- Se o download da fonte falhar no ambiente: reportar e deixar documentado como passo
  manual pré-deploy (não inventar fonte).

## 4. Hardening

### 4.1 `toExportSafeUrl` — allowlist de host (AC-10)
Hoje faz `fetch` de qualquer host cross-origin http(s). Endurecer: cross-origin só é
aceito se `parsed.hostname` terminar em `.public.blob.vercel-storage.com`. Outro host
cross-origin → lançar erro legível (não buscar host arbitrário). same-origin e data-URL
seguem passando direto.

### 4.2 Auditoria de authz (AC-8) + análise de segurança (AC-9)
- Rodar skill `dev-agents:analise-seguranca` sobre o diff da sessão.
- Conferir: `carousels.ts` (✓ ownerId), `generate.ts` (✓ requireUser + createGeneratedCarousel
  usa ownerId), `blob/upload` (✓ sessão), `settings.ts` (novo — conferir), `auth.ts`,
  `env.ts`. Registrar veredito por ponto.

### 4.3 Segredos (AC-11)
- Conferir que nada de segredo no repo; `.env.example` cobre todas as vars (incluir nota
  de `client:create`).

## 5. Provisionamento — `scripts/create-client.mjs` (AC-12)
Espelha `seed.mjs` (Node puro, dotenv, bcrypt 12, idempotente por e-mail):
- Lê `CLIENT_EMAIL`, `CLIENT_PASSWORD`, `CLIENT_NAME`, `CLIENT_HANDLE` do ambiente
  (aborta se faltar obrigatório). Avatar inicial = default SVG data-URL.
- Se o e-mail já existe → não recria (idempotente), avisa.
- Transação: `INSERT users` + `INSERT clients` (owner = novo user).
- Nunca imprime a senha. `package.json`: script `"client:create": "node scripts/create-client.mjs"`.

## 6. Testes (AC-14)
- `tests/settings/settings-action.test.ts`: authz por owner (mock db), Zod rejeita inválido
  (handle vazio, tema inválido, nome vazio), update monta o WHERE com ownerId.
- `tests/export/export-safe-url.test.ts` (ou estender o existente): allowlist rejeita host
  estranho, aceita `*.public.blob.vercel-storage.com`, passa data-URL e same-origin.
- Reusar o estilo de mock das suítes S3/S5. Alvo: suíte inteira verde + `type-check` + `build`.

## 7. Deploy guide — `docs/DEPLOY.md` (AC-15)
- Pré-requisitos: Neon, Vercel Blob, AUTH_SECRET, (ANTHROPIC_API_KEY opcional).
- Passos: conectar repo → env vars (lista completa) → `drizzle-kit migrate` → seed/`client:create`
  → deploy. Checklist Hobby→Pro (upgrade antes do 1º cliente pagante — `docs/RESTRICOES.md`).
- Nota da fonte (se virou passo manual).

## Arquivos tocados (resumo)
**Novos:** `src/lib/client-repo.ts`, `src/lib/actions/settings-types.ts`,
`src/lib/actions/settings.ts`, `src/app/settings/page.tsx`,
`src/app/settings/settings-form.tsx`, `src/app/fonts.ts`, `src/fonts/*`,
`scripts/create-client.mjs`, `docs/DEPLOY.md`, testes novos.
**Editados:** `src/lib/actions/carousels.ts` (importa client-repo),
`src/lib/export-png.ts` (allowlist), `src/components/slide/slide-tokens.ts` (font stack),
`src/app/layout.tsx` (font var), `src/app/carousels/*` (link settings), `package.json`
(script), `.env.example` (nota).

## Fora de escopo (reafirmado)
Área de admin UI, multi-identidade, reset de senha por e-mail, painel de cota, executar
o deploy.
