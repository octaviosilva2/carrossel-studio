# Story — Geração de carrossel com IA (Porta A)

## User Story
Como cliente done-for-you do Carrossel Studio (usuário logado), quero descrever em
texto o que quero comunicar e receber um carrossel já montado (texto e estrutura de
slides) no editor, para que eu parta de um rascunho pronto em vez da folha em branco
e só precise ajustar antes de exportar.

## Contexto e limites herdados (não são negociáveis, vêm do research/VISAO/CLAUDE.md)
- A IA decide **apenas TEXTO e ESTRUTURA** (nº de slides, ordem, quais slides pedem
  imagem). **Nunca decide o visual** — cor, fonte, margem, selo e 1080×1350 são
  determinísticos no `<Slide>`.
- A saída da IA precisa cair no **mesmo estado do editor da S2** (`EditorSlide { body }`),
  sem alterar o contrato `SlideData`.
- Texto gerado em **pt-BR**, **sem emojis**, parágrafos separados por `\n\n`, sem
  markdown/HTML de estilo.
- A geração exige **sessão** (`requireUser()`); a intenção do usuário é entrada não
  confiável (validar tamanho por Zod; não concatenar no system prompt).
- Modelo/parametrização da Claude API ficam para a spec (consultar skill `claude-api`;
  não fixar de memória).

## Decisões propostas (recomendação do PO — confirmar no gate)
Estas eram perguntas do research. Proponho um default enxuto para a S5 e marco como
`[PRECISA CLARIFICAR]` só o que é genuinamente decisão do CEO.

1. **Substituir / acrescentar / novo carrossel?**
   Recomendação: **cria um carrossel novo já populado** e abre no editor. É o corte
   mais fino e seguro (não precisa de action nova no reducer, aterrissa via
   `initialState` como o `/editor?id=` já faz; não há risco de o usuário perder
   trabalho existente). "Acrescentar/substituir slides de um carrossel aberto" fica
   fora de escopo desta fatia. → confirmar no critério de aceite AC-3.

2. **A IA decide tema e título?**
   Recomendação: **título SIM** (é texto), **tema NÃO** (é visual). O tema herda o
   default da identidade/carrossel (S3); o cliente troca claro/escuro no editor como
   já faz hoje. Coerente com "IA decide texto e estrutura, nunca o visual". →
   AC-4 / Fora de escopo.

3. **"Onde cabe imagem" sem URL de imagem.**
   Recomendação: a IA **sinaliza** por slide que ali caberia imagem, sem preencher
   `imageUrl` (a URL vem de upload manual na S2/S3). O sinal deve aparecer para o
   cliente como um placeholder/indicação no slide, e **não pode violar o contrato
   `SlideData`** (a forma exata — flag efêmera de UI vs. campo — é decisão de solução
   do estágio 03). → AC-5.

4. **Regeneração: do zero vs. refino conversacional.**
   Recomendação para a S5: **apenas regenerar do zero** a partir da mesma tela de
   intenção (o cliente edita a intenção e gera de novo, produzindo um novo carrossel).
   O **refino conversacional** ("encurta o slide 3", da VISAO) é claramente uma fatia
   maior e fica **fora de escopo** desta sessão. → AC-6 / Fora de escopo.

5. **Cota/limite por usuário.**
   Sem infraestrutura de contagem hoje; é decisão de negócio (custo × modelo
   done-for-you). Recomendação: **sem cota nesta fatia**, apenas as proteções
   estruturais (exige login; um pedido de geração por vez por usuário). →
   `[PRECISA CLARIFICAR]` abaixo.

## Critérios de aceite
- [ ] **AC-1 (acesso).** Dado um visitante **não logado**, quando tenta acessar a tela
      de intenção ou disparar a geração, então é barrado (redirect para login / 401),
      sem chamar a Claude API.
- [ ] **AC-2 (intenção → geração).** Dado um cliente logado na tela de intenção, quando
      descreve o que quer comunicar (texto dentro do limite) e confirma, então o sistema
      chama o endpoint server-side, que chama a Claude API e retorna uma estrutura de
      slides validada por Zod no servidor.
- [ ] **AC-3 (aterrissagem no editor).** Dado que a geração teve sucesso, quando ela
      conclui, então um **carrossel novo** é aberto no **editor da S2** já preenchido com
      os slides gerados (`body` por slide), pronto para o cliente ajustar. O carrossel
      aberto anteriormente não é alterado.
- [ ] **AC-4 (só texto e estrutura).** Dado o resultado da geração, então a IA definiu
      apenas nº de slides, ordem e o `body` de cada slide (e o `title` do carrossel);
      o **tema (claro/escuro) herda o default da identidade/carrossel** e continua
      editável no editor. A IA não emite cor, fonte, tema nem HTML/markdown de estilo.
- [ ] **AC-5 (sugestão de imagem).** Dado que a IA identifica um slide que comportaria
      imagem, então esse slide é **sinalizado** para o cliente (indicação/placeholder),
      **sem** `imageUrl` preenchido; a imagem real continua sendo upload manual na S2/S3.
- [ ] **AC-6 (regenerar).** Dado um resultado que o cliente não gostou, quando ele
      volta à tela de intenção, ajusta o texto e gera de novo, então recebe um novo
      carrossel gerado. (Refino conversacional está fora de escopo — ver abaixo.)
- [ ] **AC-7 (regras visuais no texto).** Dado qualquer resultado gerado, então o `body`
      dos slides está em **pt-BR**, **sem emojis**, sem markdown/HTML, com parágrafos
      separados por `\n\n`, e cada `body` respeita o teto de tamanho definido (referência:
      `body` ≤ 2000 chars, alinhado ao `slideInputSchema` da S3). Emojis/markdown são
      removidos server-side antes de cair no editor (rede de segurança, além do prompt).
- [ ] **AC-8 (feedback de estado).** Dado que a geração está em andamento, então a UI
      mostra um estado "gerando…" (acessível via `aria-live`, seguindo o padrão de
      `handleSave`/`handleExportZip`), e os controles de geração ficam desabilitados
      até concluir.
- [ ] **AC-9 (erro tratado).** Dado que a Claude API falha (rate limit 429, auth,
      timeout, `stop_reason: "refusal"`, ou JSON fora do contrato), então o cliente vê
      uma mensagem **genérica em pt-BR** ("não consegui gerar, tente novamente"), sem
      vazar detalhe técnico, e pode tentar de novo. Nenhum carrossel quebrado é criado.
- [ ] **AC-10 (chave ausente).** Dado que `ANTHROPIC_API_KEY` não está configurada,
      então a geração falha de forma controlada (mensagem clara ao operador/erro no
      boot conforme padrão de `env.ts`), sem expor a chave e sem quebrar o resto do app.

## Edge cases
- **Intenção vazia** → bloqueia o envio com aviso ("descreva o que quer comunicar"),
  sem chamar a API.
- **Intenção acima do limite de caracteres** → rejeita na borda (Zod) com mensagem de
  tamanho, sem chamar a API.
- **Intenção pedindo emojis / formatação proibida** → o resultado ainda sai sem emojis
  e sem markdown (prompt proíbe + sanitização server-side).
- **API retorna refusal (HTTP 200, content vazio)** → tratado como "não consegui gerar",
  não como erro de código (checar `stop_reason` antes de ler `content`).
- **API retorna JSON malformado ou nº de slides absurdo (0 ou excessivo)** → Zod nosso
  no servidor rejeita; cliente vê erro genérico; nada é aberto no editor.
- **Timeout / latência alta** → estado "gerando…" persiste; ao estourar, cai no erro
  tratado (AC-9); não trava a UI.
- **Duplo clique / geração concorrente** → um pedido por vez; controles desabilitados
  durante a geração (AC-8).
- **Sessão expira durante a geração** → falha fechada (não persiste resultado órfão).

## Fora de escopo (explícito — não será cobrado depois)
- **Refino conversacional** ("encurta o slide 3", "deixa mais formal") — fatia futura.
- **Substituir ou acrescentar** slides em um carrossel já aberto — nesta fatia a
  geração sempre cria um carrossel novo.
- **A IA escolher tema (claro/escuro)** — tema é visual e herda o default; editável
  no editor.
- **A IA preencher `imageUrl`** ou gerar/buscar imagens — imagem é upload manual
  (S2/S3); a IA só sinaliza onde caberia.
- **Cota/rate-limit por usuário** com contagem persistida — depende de decisão do CEO
  (ver perguntas). Nesta fatia só há a proteção de login + um pedido por vez.
- **Streaming da resposta / geração parcial ao vivo** — decisão de solução do 03 se
  necessário; não é requisito da story.
- **Colar link/URL como fonte da intenção** (a VISAO cita "cola um tema/link") — nesta
  fatia a intenção é texto livre; extração de conteúdo de link fica para depois.
- **Escolha de modelo/tom pela UI** — modelo é fixado na spec; tom vem da intenção.

## Perguntas abertas
- [PRECISA CLARIFICAR: há **cota/limite de gerações por usuário** nesta fase (ex.: X
  gerações/mês) para conter custo da Claude API, ou seguimos **sem cota** e só com as
  proteções estruturais (login + um pedido por vez)? — decisão de negócio do CEO.]
- [PRECISA CLARIFICAR: confirmar a recomendação de **sempre criar carrossel novo**
  (em vez de substituir/acrescentar no carrossel aberto) como comportamento da S5.]
- [PRECISA CLARIFICAR: confirmar que a **IA gera o título** do carrossel (além do texto
  dos slides) e **não** escolhe o tema.]
