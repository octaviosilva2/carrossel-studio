# Sessão 2026-07-02 — ADR 0002 Bloco 1: Infra na VPS (EasyPanel)

## Objetivo
Provisionar banco (Postgres + PgBouncer) e storage (MinIO) na VPS Hostinger via
EasyPanel, conforme `docs/adr/0002-migracao-vps-easypanel.md`, Fases 0, 1, 4, 5 e 6.
Sessão 100% conduzida (CEO executou no painel/terminal, CTO guiou e validou) — sem
acesso SSH do agente.

## Fase 0 — Pré-requisitos
- VPS Hostinger (`srv949450.hstgr.cloud`, IP `72.60.6.238`), Ubuntu 24.04 + EasyPanel,
  specs confirmadas pelo CEO.
- Domínio `evoiatecnologia.com` (Hostinger). DNS configurado: `carrosselstudio` (CNAME
  → Vercel), `db` e `storage` (A → IP da VPS) — confirmado propagado.
- Backup das credenciais antigas (Neon + Vercel Blob) preservado em
  `.env.local.backup-neon` (confirmado protegido pelo `.gitignore`, padrão `.env.*`).

## Fase 1 — Postgres + PgBouncer
- Serviço `carrossel-postgres` criado dentro do projeto EasyPanel **`n8n-enzo`**
  (decisão do CEO — projeto já existente com outros serviços, não um projeto dedicado).
- **Desvio:** imagem `postgres:18` entra em crash loop com o template atual do
  EasyPanel (a 18+ mudou o layout esperado do volume; o template ainda monta no
  caminho antigo). Usamos **`postgres:17`** — sem risco, banco novo sem dado real.
- TLS habilitado no Postgres (certificado autoassinado gerado no container,
  `ssl = on`), validado com `SHOW ssl` → `on`.
- Backup agendado (diário, 2h, Local Disk) configurado e **restore de teste
  executado com sucesso** antes de confiar.
- Usuário `carrossel_app` criado **sem superuser** (`rolsuper=f`), dono do banco
  `carrossel_studio` (privilégio suficiente pra migrations, sem superuser).
- **PgBouncer — desvio de arquitetura:** o tipo de serviço "Compose" (BETA) do
  EasyPanel cria uma rede Docker isolada, sem alcançar os demais serviços do projeto
  (`connect timeout`/`connect failed`). Recriado como tipo **"Aplicativo"** (imagem
  `edoburu/pgbouncer`), que compartilha a rede do projeto — resolveu.
- **Dívida técnica registrada:** o PgBouncer usa `extra_hosts` fixando o IP interno
  do Postgres (`10.11.4.135`), contornando um bug conhecido de resolução DNS do
  Alpine/musl em rede overlay do Docker. **Se o serviço `carrossel-postgres` for
  destruído e recriado** (não um simples restart), esse IP pode mudar e quebrar
  silenciosamente o PgBouncer — precisa atualizar o `extra_hosts` manualmente.
- TLS também no PgBouncer (`client_tls_sslmode=require`, mesmo certificado),
  exposto na porta pública `6432`. Validado ponta a ponta: TLS + autenticação +
  query real via `psql` com o usuário `carrossel_app`.

## Fase 4 — MinIO (storage)
- Serviço `carrossel-storage` (template oficial MinIO), volume persistente,
  domínio customizado `storage.evoiatecnologia.com` (TLS automático via Traefik,
  validado).
- Bucket `carrossel-studio` criado com **leitura pública** (`mc anonymous set
  download`).
- Usuário dedicado `carrossel-app` criado (não a credencial root), com policy
  restrita só a esse bucket (`PutObject`/`GetObject`/`ListBucket`).
- **CORS — desvio:** a API `PutBucketCors` (CORS por bucket) não é implementada no
  MinIO Community Edition (`mc cors set` retorna "not implemented" — é recurso do
  MinIO AIStor/Enterprise). Configurado via variável de ambiente global do servidor
  `MINIO_API_CORS_ALLOW_ORIGIN` — suficiente aqui porque é um MinIO dedicado a um
  único bucket/app.
- Validado ponta a ponta: upload real com a credencial do app, leitura pública sem
  autenticação, preflight CORS OPTIONS correto.

## Fase 5 — Segurança
- **UFW estava inativo** (nenhum firewall de SO rodando) — ativado com
  `allow 22/80/443/6432`, resto bloqueado por padrão. Confirmado de fora: `5432`
  fechado, `6432`/`443`/`22` abertos.
- **fail2ban não estava instalado** — instalado e confirmado `active (running)`.
- TLS confirmado válido em Postgres, PgBouncer e MinIO.
- Usuários de app (Postgres `carrossel_app`, MinIO `carrossel-app`) confirmados sem
  privilégio de superuser/root, senhas geradas aleatórias (hex 40-48 chars).
- **Fora do escopo desta sessão:** VPS reporta 70 atualizações pendentes (16 de
  segurança) e pede reinício — não resolvido agora. Painel da Hostinger também tem
  um firewall de rede próprio ("Regras de firewall") zerado — não configurado
  (UFW no SO já cobre o necessário; ficaria como camada extra futura).

## Fase 6 — Staging
- Segundo Postgres isolado, `carrossel-postgres-staging` (banco `carrossel_staging`),
  `postgres:17`, mesmo projeto EasyPanel. Sem PgBouncer/TLS/exposição pública por
  enquanto — não está em uso ainda (fica pronto pra quando um cutover de staging
  real for planejado).

## Entrega final
`.env.local` atualizado com as chaves: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
`S3_ENDPOINT`, `S3_PUBLIC_HOST`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY` (valores reais preenchidos — arquivo gitignored, não commitado).
`AUTH_SECRET` mantido. `BLOB_READ_WRITE_TOKEN` removida (substituída pelo S3_*).
Backup do `.env.local` anterior (Neon/Blob) preservado em `.env.local.backup-neon`.

**Nota:** `DATABASE_URL_UNPOOLED` (porta 5432) só funciona com a porta aberta sob
demanda (EasyPanel → "Expor" + `ufw allow 5432/tcp`) — fechar de novo depois de
rodar migrations, conforme Fase 5.

## Próximo passo
Bloco 2 do ADR 0002 (troca de driver Neon→pg, storage Blob→S3) — esteira
`dev-agents:feature`, só depois que este `.env.local` estiver confirmado.
