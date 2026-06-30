# Research — S1: Fundação + Motor de render

## Pedido (como recebido)
Primeira fatia de construção (GREENFIELD — só docs, sem código de app). Escopo:
1. Scaffold da app: Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui.
2. Componente React do "slide" do carrossel, seguindo as regras visuais do produto.
3. Render desse componente para PNG **exatamente 1080×1350** no browser (HTML→PNG já DECIDIDO; sem Python).
4. Validar com PNG real a partir de dados fixos (avatar, nome, selo, handle, texto, imagem).

## Estado atual do repo
Greenfield confirmado. NÃO existe `package.json`, nem pasta `app/`, `src/` ou qualquer código de aplicação (`Glob **/package.json` → nada; `Glob **/*` só retorna docs + `.git`).
O que existe hoje:
- `CLAUDE.md:34-41` — regras visuais do produto e stack aprovada.
- `docs/VISAO.md` — visão do produto, camadas, jornada, regras visuais herdadas.
- `docs/adr/0001-stack-tecnica.md` — stack aprovada pelo CEO.
- `docs/RESTRICOES.md` — limites Vercel Hobby.
- `docs/ROADMAP.md` — 6 sessões; S1 é a atual.
- `docs/STATUS.md`, `docs/PLAYBOOK-CLIENTE.md`, `docs/sessoes/2026-06-30-sessao-01.md` — governança (não-técnico para S1).
- `.work/s1-fundacao-render/STATUS.md` — estado do pipeline (estágio 01 em andamento).

**O que falta (a ser criado na implementação):** o scaffold inteiro — `package.json`, config Next/TS/Tailwind, `app/`, componente do slide, função de export PNG e uma página/rota de teste com dados fixos.

## Regras visuais que o componente do slide DEVE cumprir
Destiladas de `CLAUDE.md:34-41` e `docs/VISAO.md:24-32,44-50`. São determinísticas — o visual nunca "erra" (VISAO §3).

- **Dimensão fixa:** cada PNG = exatamente **1080×1350** (px reais no arquivo final).
- **Tema claro:** fundo `#FFFFFF`, texto `#14171A`.
- **Tema escuro:** fundo preto, texto branco. [PRECISA CLARIFICAR: hex exato do preto e do branco no tema escuro — docs dizem "preto"/"branco" sem hex; a skill original `carrossel-treets-modelo-octavio` pode ter o valor canônico. Marcar na spec.]
- **Selo verificado:** círculo azul `#1D9BF0` com check branco. NUNCA estrela. Selo é on/off por identidade (VISAO:45).
- **Header** (avatar + nome + selo + handle) centralizado na vertical junto ao texto.
- **Imagem do slide:** borda arredondada (**radius 28**), escala pela largura, centralizada.
- **Proibido no corpo:** barra de engajamento, logo do X, emojis.
- **Fonte/margens/centralização:** definidas pelo renderizador (código fixo) — VISAO:29. [PRECISA CLARIFICAR: família de fonte oficial do modelo Octavio (a skill Python provavelmente usa uma fonte específica). Definir na spec, pois afeta diretamente o render no canvas — ver Riscos.]

Dados que o slide recebe (de VISAO §5/§6, mesmos campos que vêm da identidade + slide): `nome`, `@handle`, `avatar` (url/blob), `selo` (on/off), `texto` do slide, `imagem` opcional do slide, `tema` (claro/escuro). Em S1 esses dados são **fixos/hardcoded** para validar o render.

## Features similares (padrão a reusar / origem)
- **Skill original `carrossel-treets-modelo-octavio` (Python + Pillow)** — referenciada em `CLAUDE.md:35` e `ADR 0001:8-9`. É a fonte de verdade das regras visuais; o produto web reimplementa esse layout em HTML/CSS. NÃO está neste repo (vive no SISTEMA de skills do Octavio). Vale consultá-la na spec para extrair fonte, margens exatas, tamanhos de avatar/texto e o hex do tema escuro — números que os docs deste repo não fixam.
- **Não há código similar dentro do repo** (greenfield). O "padrão a seguir" é externo: o ADR e a VISAO.

## O que já está quebrado
- Nada de código para estar quebrado (greenfield).
- **Lacuna documental, não bug:** os docs especificam cores em hex só parcialmente (claro tem hex; escuro não) e não fixam fonte/margens/tamanhos. Isso precisa ser resolvido na spec antes do componente, senão o render não é fiel à skill original.

## Opções técnicas reais para HTML→PNG no browser (trade-offs)
Decisão de biblioteca específica é da spec; abaixo o levantamento para embasar.

- **`html-to-image`** — converte um nó DOM em PNG/SVG via SVG `<foreignObject>` + canvas. Aceita `pixelRatio` (chave para gerar 1080×1350 nítido a partir de um nó CSS menor) e `width/height`. Boa fidelidade de CSS moderno. Lida com web fonts se embutidas como data-URL. Mantida e popular. **Recomendada** para S1 (ver abaixo). [APIs/versão exata a confirmar na spec.]
- **`dom-to-image` / `dom-to-image-more`** — mesma técnica (foreignObject→canvas). O original está pouco mantido; o fork `-more` é mais atual. `html-to-image` é essencialmente o sucessor melhor mantido. Sem vantagem clara sobre ele.
- **`html2canvas`** — reimplementa um motor de render próprio (não usa foreignObject). Cobre menos CSS moderno (gradientes, alguns box-shadow, filtros) e historicamente sofre com fontes e arredondamentos — risco de divergência visual do componente real. Menos indicado para fidelidade pixel-perfect.
- **`satori` (+ `@vercel/og` / `resvg`)** — gera SVG a partir de JSX e rasteriza. Excelente determinismo e roda também no server (bom para o fallback do ADR e para o export em lote da S4). PORÉM: não usa o motor CSS do browser — suporta um subconjunto de CSS, exige fontes carregadas como buffer, e o componente de render acaba precisando seguir as limitações do Satori (não é "qualquer React/Tailwind"). Trade-off: mais determinístico e server-friendly, menos liberdade de CSS/Tailwind.

**Recomendação para S1:** usar uma lib de captura de DOM com controle de `pixelRatio` (família `html-to-image`), porque (a) o componente é React/Tailwind real e o que se vê no preview é o que se exporta — alinha com a S2 (preview ao vivo) que reusa o mesmo componente; (b) `pixelRatio` resolve o 1080×1350 nítido a partir de um nó menor; (c) custo zero de servidor (exigência Hobby — RESTRICOES). **Manter `satori`/server como fallback declarado** (ADR 0001:25) para S4/export em lote se a captura no browser se mostrar inconsistente. Decisão final e versão → spec.

### Como bater 1080×1350 exato (estratégia, a validar na spec)
Renderizar o componente num container de proporção 4:5 (ex.: 432×540 CSS) e exportar com `pixelRatio` 2.5 → 1080×1350; OU renderizar 540×675 com `pixelRatio` 2 → 1080×1350; OU renderizar o nó já em 1080×1350 reais (fora da viewport / escala visual) e exportar com `pixelRatio` 1. Qualquer caminho deve produzir o arquivo final em 1080×1350 px exatos — a checar no teste real (regra inegociável de CLAUDE.md:41).

## Riscos sinalizados
- **Fontes não embarcadas no canvas** — captura DOM→canvas frequentemente perde web fonts se não estiverem totalmente carregadas/embutidas; o PNG sai com fonte fallback (quebra fidelidade ao modelo Octavio). Mitigar: `document.fonts.ready` antes de exportar e/ou fonte embutida. Alto impacto na fidelidade. [Fonte oficial PRECISA CLARIFICAR.]
- **DPR / escala para 1080×1350 exato** — errar `pixelRatio`/dimensões gera PNG fora de 1080×1350 ou borrado. É o critério de aceite central da S1; precisa de verificação dimensional automática no teste.
- **CORS em avatar/imagem** — imagens de origem externa (ou Blob futuro) "tingem" o canvas (tainted) e quebram o export. Em S1 com dados fixos, usar assets locais/same-origin ou data-URL evita o problema; registrar para S2/S3 (Vercel Blob precisará de CORS correto).
- **Light vs dark** — dois temas = dois caminhos visuais; o teste precisa cobrir ambos (export claro e escuro), e o hex do dark ainda não está fixado nos docs.
- **SSR vs client component** — a captura DOM→canvas é client-only (usa `window`/`document`/`canvas`). O export tem de viver num Client Component / efeito de cliente; o componente do slide pode ser server-renderável para o markup, mas a função de export é client. Em Next 15 App Router, marcar `"use client"` na fronteira de export.
- **Vercel Hobby** (RESTRICOES) — reforça render no browser (sem função pesada). Sem impacto direto em S1 (que nem deploya), mas guia a escolha técnica.
- **shadcn/ui no scaffold** — depende de Tailwind configurado e de passos de init próprios; não bloqueia o render, mas faz parte do "scaffold completo" pedido. Versões e passos exatos → spec.

## Dependências afetadas
- **Nenhum código existente é afetado** (greenfield) — risco de regressão nulo nesta fatia.
- **Cria as fundações que TODAS as sessões seguintes herdam:** toolchain Next 15/TS/Tailwind/shadcn, convenções de pasta, e o **componente do slide + função de export** que são o "motor de render" reusado por S2 (preview ao vivo), S4 (export em lote/ZIP) e S5 (saída da IA cai no mesmo preview).
- **Contrato implícito a estabelecer na spec:** as props do componente do slide (nome, handle, avatar, selo, texto, imagem, tema). Esse shape vira o contrato que S2/S3/S5 vão alimentar — desenhar com cuidado aqui evita retrabalho depois.

## O que a S1 deixa pronto para S2 reusar
- Componente `<Slide>` (ou nome a definir) determinístico, parametrizado pelas props acima, fiel às regras visuais.
- Função/utilitário de export DOM→PNG 1080×1350 (client-side) com `pixelRatio` resolvido.
- Toolchain e convenções de projeto (Next App Router, TS strict, Tailwind tokens dos temas claro/escuro, shadcn instalado).
- Uma rota/página de teste com dados fixos provando o PNG real — vira base do preview da S2.

## Perguntas abertas
- [PRECISA CLARIFICAR: hex exato do tema escuro (fundo e texto) — docs só dizem "preto/branco".]
- [PRECISA CLARIFICAR: família tipográfica oficial do modelo Octavio (afeta diretamente fidelidade no canvas).]
- [PRECISA CLARIFICAR: margens, tamanho do avatar, tamanho/peso do texto e do nome/handle — números que vivem na skill `carrossel-treets-modelo-octavio` (Python/Pillow), fora deste repo. Spec deve extrair ou o CEO/CTO fixa.]
- [PRECISA CLARIFICAR: biblioteca e versão de HTML→PNG, e a estratégia de DPR final — decisão da spec, validada no teste do PNG real.]
