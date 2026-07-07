# Sessão 2026-07-07 — Correções de mobile/tablet + auth

## Objetivo
Rodada de bugs reportados pelo CEO usando o app pelo celular/tablet: responsividade
(AppShell + editor), zoom automático em campos, Assistente IA tampado pelo teclado,
onboarding sem gatilho, sessão presa após excluir conta, e o avatar/imagem saindo em
branco no PNG exportado no mobile.

## Correções

**Responsividade (AppShell + editor, <lg):**
- Barra de navegação inferior (Dashboard/Histórico, estilo Instagram) + menu de conta
  (avatar) no topo direito, substituindo o drawer hamburguer.
- Editor: menu de 3 pontinhos (Excluir) no header; Assistente IA vira botão abaixo de
  "Adicionar slide", abrindo um drawer de meia altura pelo TOPO da tela (não por baixo —
  o teclado virtual cobre a parte de baixo e tampava o campo de mensagem).
- Corrigido: menus (`DropdownMenu`) saindo transparentes — faltava o token de cor
  `popover` no `tailwind.config.ts`/`globals.css` (nunca tinha sido adicionado).
- Corrigido: zoom automático do iOS ao focar campos — `text-sm` (14px) sobrescrevendo o
  padrão `text-base md:text-sm` do design system em dois pontos (título do editor, chat
  do assistente).

**Auth:**
- Login passa a redirecionar pra `/onboarding` (não só `/dashboard`) quando o client
  ainda não concluiu o onboarding — antes não existia NENHUM gatilho automático.
- Sessão presa após excluir conta: sessão é JWT (stateless — ver ADR da stack), então
  excluir o usuário no banco não invalidava cookies já emitidos. `requireUser`/
  `requireAdmin` agora confirmam a existência do usuário no banco a cada chamada.
  Bug reproduzido e corrigido ao vivo (criar conta → excluir pelo admin → sessão antiga
  cai em `/login` na navegação seguinte).
- Olhinho de mostrar/ocultar senha (`PasswordInput`) no login e em Configurações.

**Export mobile (avatar/imagem em branco):**
- Primeira tentativa (aguardar `img.decode()` antes de rasterizar) não resolveu — o
  usuário confirmou que o problema persistia especificamente no PNG salvo/baixado pelo
  celular.
- Causa raiz real (pesquisa em issues do `html-to-image`/`dom-to-image`): bug conhecido
  e amplamente documentado do Safari/iOS no pipeline interno de rasterização via SVG
  `<foreignObject>` — imagens embutidas às vezes não terminam de decodificar a tempo
  dentro da própria lib, independente de qualquer timing do lado da aplicação.
  Substituída a lib por `modern-screenshot` (fork ativamente mantido, criado
  especificamente pra corrigir esse bug do Safari). `html-to-image` removida das
  dependências.
- Download no mobile: prefere o share sheet nativo (Web Share API) quando disponível,
  permitindo salvar direto na galeria; cai no download tradicional quando não suportado.

## Verificação
Suíte automatizada (363 testes, incluindo casos novos para onboarding/auth-guard/export)
+ type-check + build de produção, mais verificação ao vivo em navegador real (Playwright)
reproduzindo os cenários reportados: menus opacos, header sem quebra de linha, onboarding
redirecionando, sessão derrubada após exclusão, olhinho de senha, export com avatar
cross-origin correto. **Não foi possível testar em um iPhone/Safari real** — a troca de
lib de export resolve a causa raiz documentada, mas fica pendente confirmação do CEO no
aparelho real após o deploy.
