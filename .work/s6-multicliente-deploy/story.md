# S6 — Multi-cliente + deploy + hardening — STORY

> Gate 1 (story). Escrita direto pelo CTO (research pulado: o código já foi mapeado
> nesta sessão). Escopo travado com o CEO em 2026-07-02 (3 decisões YAGNI abaixo).

## Decisões de escopo (aprovadas pelo CEO)
1. **Provisionamento via script** (não área de admin com UI). Cada cliente = 1 conta
   criada por `npm run client:create`. O produto ganha uma tela de configurar a
   identidade padrão. Isolamento por `ownerId` já cobre multi-usuário.
2. **Uma identidade por cliente** (sem multi-identidade). Sem mudança de schema.
3. **Deploy preparado pelo CTO, executado pelo CEO.** O CTO resolve a fonte woff2,
   valida o build de produção e documenta; o CEO conecta o repo na Vercel e sobe.

## História
**Como** Octavio (operador do modelo done-for-you),
**quero** (a) configurar a identidade padrão da marca por uma tela, (b) provisionar
contas de cliente por script, (c) o produto endurecido e (d) pronto para deploy,
**para** entregar acesso isolado e seguro ao 1º cliente pagante.

## Critérios de aceite

### A. Configuração de identidade (tela `/settings`)
- **AC-1** — Usuário logado acessa `/settings` e vê a identidade padrão atual (nome,
  handle, avatar, selo, tema) carregada do seu `client`.
- **AC-2** — Edita nome, handle (sem `@`), selo (on/off) e tema padrão (light/dark) e
  salva; ao recarregar, os valores persistem.
- **AC-3** — Troca o avatar (upload real no Blob, validação tipo + 6 MB) e pode removê-lo
  (volta ao placeholder padrão).
- **AC-4** — Carrosséis novos criados após a edição herdam a nova identidade padrão
  (overrides null herdam do `client` atualizado).
- **AC-5** — Visitante não logado em `/settings` é redirecionado para `/login`.
- **AC-6** — Salvar com dados inválidos (handle vazio, nome vazio, tema fora de
  light/dark, avatar não-URL) é rejeitado na borda (Zod) sem gravar nada.

### B. Isolamento de dados
- **AC-7** — `getClientSettings`/`updateClientSettings` operam SEMPRE sobre o `client`
  do `ownerId` da sessão; usuário nunca lê/edita a marca de outro (filtro por owner na
  query, falha fechado).
- **AC-8** — Auditoria confirma: toda action/rota (carousels, generate, blob upload,
  settings) exige sessão e filtra por dono; nenhuma query cross-owner.

### C. Hardening
- **AC-9** — Skill `dev-agents:analise-seguranca` rodada; achados alta/média corrigidos
  ou justificados por escrito.
- **AC-10** — `toExportSafeUrl` só aceita host do Blob
  (`*.public.blob.vercel-storage.com`) + same-origin (endurecimento 🟡 herdado da S4).
- **AC-11** — Nenhum segredo no código/repo; `.env.example` cobre todas as variáveis.

### D. Provisionamento
- **AC-12** — `npm run client:create` cria uma conta de cliente (user + client com
  identidade inicial) idempotente por e-mail, lendo dados do ambiente, senha hasheada
  (bcrypt cost 12), nunca imprimindo a senha.

### E. Deploy prep
- **AC-13** — Fonte do slide embarcada (Selawik via `next/font/local`) — o PNG mantém
  fidelidade métrica no Linux sem depender de fonte do SO. Segoe UI segue primeiro na
  cascata (fidelidade máxima no Windows local).
- **AC-14** — `npm run build` de produção passa limpo; `type-check` e `test` verdes.
- **AC-15** — Guia de deploy Vercel documentado (`docs/DEPLOY.md`): env vars, migration,
  seed/provisionamento, checklist Hobby→Pro.

## Fora de escopo
- Área de admin com UI (provisionamento é por script).
- Multi-identidade por cliente.
- Reset de senha por e-mail (fatia futura do playbook).
- Painel de uso / cota.
- Executar o deploy em si (o CEO executa com o guia).

## Edge cases
- Cliente sem `client` configurado → erro tratável (seed/script sempre cria; não deve ocorrer).
- Upload de avatar falha → erro inline, mantém avatar anterior.
- Handle digitado com `@` → strip automático (igual ao editor).
- E-mail já existente no `client:create` → idempotente (não recria, avisa).

## Perguntas abertas
Nenhuma — as 3 ambiguidades de escopo foram resolvidas no gate de triagem.
