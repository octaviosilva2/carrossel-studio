# PROMPTS DAS SESSÕES — Carrossel Studio

> Um prompt de abertura pronto por sessão. **Como usar:** abra uma conversa NOVA do
> Claude Code com o projeto aberto, cole o bloco da sessão correspondente e envie.
> Cada sessão começa limpa (contexto enxuto = token economizado) e fecha uma fatia
> inteira pela esteira `dev-agents`, parando nos gates pra você aprovar.
>
> Faça as sessões **na ordem**. Só abra a próxima depois que a anterior estiver
> validada e o `STATUS.md` atualizado. Ordem: S1 → S2 → S4 → S3 → S5 → S6 também
> funciona (S4 export só depende do render da S1), mas o padrão é a ordem numérica.

---

## Diretriz de UI da plataforma (vale para TODAS as sessões)

A interface **do software** (telas, editor, botões, menus, modais) deve ser **estilo
software moderno: minimalista, bonita, atraente e simples de usar**. NÃO confundir com
as regras visuais do **slide** (o PNG de saída), que são fixas e imutáveis (modelo
Twitter/X do Octavio — ver docs/REFERENCIA-VISUAL.md). Para a UI da plataforma:
- shadcn/ui + Tailwind como base; tokens de tema (sem hardcode de cor solto).
- Use a skill `dev-agents:ui-ux-pro-max` como guia de design.
- Hierarquia visual clara, espaçamento generoso, tipografia consistente.
- Botões e estados bem estilizados (hover / active / disabled / loading), dark mode.
- Simplicidade acima de tudo — atraente sem poluir. O agente de frontend (05) capricha.

---

## Sessão 1 — Fundação + Motor de render

```text
Sessão 1 do Carrossel Studio. Leia docs/STATUS.md, docs/ROADMAP.md, docs/REFERENCIA-VISUAL.md
e a "Diretriz de UI da plataforma" no topo de docs/PROMPTS-SESSOES.md. O research já está
em .work/s1-fundacao-render/research.md com as 4 lacunas resolvidas — comece pela STORY
(estágio 02), pulando o research.

Conduza a esteira dev-agents (skill dev-agents:feature), parando nos gates
(story → spec → validação):

Escopo:
1. Scaffold da app: Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui, com UI
   base minimalista estilo software (ver a Diretriz de UI).
2. Componente React do "slide" portando FIELMENTE os tokens de docs/REFERENCIA-VISUAL.md
   (1080×1350, margem 80, header centralizado na vertical, selo azul #1D9BF0, imagem
   radius 28, temas claro e escuro). Resolva na spec a fonte Segoe UI na web (embarcar
   woff2 ou equivalente fiel).
3. Render desse componente para PNG EXATAMENTE 1080×1350 no browser (HTML→PNG, sem
   Python). Validar com PNG real a partir de dados fixos, conferindo dimensão e fidelidade.

Ao fim: rode os testes, atualize docs/STATUS.md e docs/ROADMAP.md, registre a sessão em
docs/sessoes/.
```

---

## Sessão 2 — Editor manual

```text
Sessão 2 do Carrossel Studio. Leia docs/STATUS.md, docs/ROADMAP.md e docs/VISAO.md.
Pré-requisito: S1 entregue (o componente do slide e o motor de render já existem —
reuse-os, não recrie).

Conduza a esteira dev-agents (skill dev-agents:feature), parando nos gates:

Escopo — editor manual de carrossel (estado local, ainda SEM banco):
1. Montar um carrossel slide a slide: editar header (avatar, nome, handle, selo on/off),
   corpo de texto e imagem do slide (upload local com preview, sem storage remoto ainda).
2. Adicionar, remover e reordenar slides; navegar entre eles.
3. Preview ao vivo de cada slide reusando o componente da S1.
4. Alternar tema claro/escuro do carrossel.

Ao fim: rode os testes, atualize docs/STATUS.md e docs/ROADMAP.md, registre a sessão em
docs/sessoes/.
```

---

## Sessão 3 — Persistência + Auth + Storage

```text
Sessão 3 do Carrossel Studio. Leia docs/STATUS.md, docs/ROADMAP.md e
docs/adr/0001-stack-tecnica.md. Pré-requisito: S2 entregue.

CREDENCIAIS NECESSÁRIAS (confirme que estão no .env antes de começar; se faltar, pare e
avise): DATABASE_URL (Neon), token do Vercel Blob, e AUTH_SECRET do Auth.js.

Conduza a esteira dev-agents (skill dev-agents:feature), parando nos gates:

Escopo:
1. Auth.js (NextAuth v5) com login por senha (hash bcrypt/argon2), sessões no Postgres.
2. Drizzle ORM + schema (users, clients, carousels, slides) + migrations no Neon.
3. Upload real de imagem no Vercel Blob (avatares e imagens de slide).
4. Salvar, listar e reabrir carrosséis por usuário; ligar o editor da S2 à persistência.

Aplique a baseline de segurança (validação Zod nas bordas, authz por usuário, sem
segredo no código). Ao fim: rode os testes, atualize STATUS/ROADMAP, registre a sessão.
```

---

## Sessão 4 — Export

```text
Sessão 4 do Carrossel Studio. Leia docs/STATUS.md, docs/ROADMAP.md e docs/VISAO.md.
Pré-requisito: S1 (motor de render). S3 ajuda mas não é obrigatória.

Conduza a esteira dev-agents (skill dev-agents:feature), parando nos gates:

Escopo:
1. Gerar o PNG de TODOS os slides do carrossel, cada um EXATAMENTE 1080×1350.
2. Baixar como ZIP (e permitir baixar um slide individual).
3. Garantir nitidez (devicePixelRatio) e nomeação ordenada dos arquivos.

Ao fim: rode os testes, atualize STATUS/ROADMAP, registre a sessão em docs/sessoes/.
```

---

## Sessão 5 — Geração com IA

```text
Sessão 5 do Carrossel Studio. Leia docs/STATUS.md, docs/ROADMAP.md e docs/VISAO.md.
Pré-requisito: S2 (editor) e S3 (persistência).

CREDENCIAL NECESSÁRIA: ANTHROPIC_API_KEY (Claude API com billing ativo) no .env — se
faltar, pare e avise. CONSULTE a skill claude-api para o modelo correto e os parâmetros;
não fixe modelo de memória.

Conduza a esteira dev-agents (skill dev-agents:feature), parando nos gates:

Escopo:
1. Tela de entrada de intenção (o cliente descreve o que quer comunicar).
2. Endpoint server-side que chama a Claude API e monta a estrutura dos slides,
   validada com Zod, respeitando as regras visuais.
3. O resultado cai no editor da S2 para o cliente ajustar ou pedir regeneração.

Ao fim: rode os testes, atualize STATUS/ROADMAP, registre a sessão em docs/sessoes/.
```

---

## Sessão 6 — Multi-cliente + deploy + hardening

```text
Sessão 6 do Carrossel Studio. Leia docs/STATUS.md, docs/ROADMAP.md, docs/PLAYBOOK-CLIENTE.md
e docs/RESTRICOES.md. Pré-requisito: S1–S5 entregues.

Conduza a esteira dev-agents (skill dev-agents:feature), parando nos gates:

Escopo:
1. Configuração por cliente (identidade padrão: avatar, nome, handle, selo, tema padrão).
2. Isolamento de dados por cliente (cada cliente só vê o que é seu).
3. Hardening de segurança: rode a skill de análise de segurança, revise authz, segredos
   e validação nas bordas.
4. Deploy de produção na Vercel (respeitando os limites do plano em docs/RESTRICOES.md).

Ao fim: rode os testes, faça a revisão de segurança, atualize STATUS/ROADMAP e registre
a sessão. Esta sessão deixa o produto pronto pra configurar o 1º cliente.
```
