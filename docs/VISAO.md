# Visão do Produto — Carrossel Studio

## 1. O que é
Plataforma web para gerar carrosséis estilo Twitter/X (modelo Octavio) prontos
para o Instagram. **Venda:** done-for-you — o Octavio configura cada cliente,
entrega o acesso e cobra setup + manutenção mensal.

## 2. Duas portas de entrada (mesmo motor)

**Porta A — Com IA (montadora).**
O cliente cola um tema/link ou texto pronto. A IA capta a intenção (nº de slides,
tom, imagens, CTA), escreve/formata e **monta** o carrossel posicionando tudo.
Refino por conversa ("encurta o slide 3").

**Porta B — Manual (passo a passo).**
Wizard guiado, sem IA:
1. Quantos slides o carrossel terá?
2. Texto de cada slide (um a um).
3. Esse slide tem imagem? → anexa.
4. Monta.

> As duas portas geram o **mesmo `spec`** e caem no **mesmo preview/exportação**.

## 3. Como funciona por dentro (3 camadas)
| Camada | Quem faz | Decide |
|---|---|---|
| Entrada | IA *ou* wizard manual | Texto e estrutura |
| Spec | sistema | Slides, ordem, imagem por slide, identidade |
| Visual | renderizador (código fixo) | Fonte, margens, centralização, borda, selo, 1080×1350 |

A camada visual é **determinística** — as regras do produto viram código. O visual
nunca "erra", venha de IA ou do manual.

## 4. Jornada do usuário
1. Login (acesso entregue pelo Octavio).
2. Escolhe a identidade (perfil) e o modo (IA ou manual).
3. Cria o carrossel.
4. Preview ao vivo → refina (edita texto inline, reordena, add/remove slide, troca imagem).
5. Aprova.
6. Exporta PNGs 1080×1350 (claro ou escuro).
7. Baixa (zip ou um a um).
8. Histórico: reabre, edita e reexporta quando quiser.

## 5. Identidade / perfis
Cada perfil guarda: nome, @handle, avatar, selo on/off, tom de voz, tema padrão.
**Múltiplas identidades por cliente** permitidas (ex.: pessoa + empresa).

## 6. Imagens
Upload pelo cliente. A IA sugere onde cabe (porta A); no manual, ele anexa por slide.
O código garante borda arredondada, centralização e escala.

## 7. Armazenamento
| Guarda | Onde |
|---|---|
| Clientes / identidades | Postgres |
| Carrosséis (título, dono, status, datas) | Postgres |
| Slides (texto, ordem, imagem, tema) | Postgres |
| Avatares + imagens de slide | Vercel Blob |
| PNGs exportados (última versão) | Vercel Blob (+ regerar) |

## 8. Decisões em aberto
- Render final: HTML (recomendado) vs Python — confirmar no teste lado a lado (passo 1 da execução).
- Métricas: painel simples de histórico (sem analytics de Instagram).
