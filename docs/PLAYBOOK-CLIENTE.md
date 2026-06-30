# Playbook — Como vender e configurar para um cliente (done-for-you)

> Procedimento operacional do modelo de venda. Itens marcados com **[CEO define]**
> são decisões de negócio. Itens técnicos viram requisitos do produto (entram na spec).

## 1. Modelo de venda
Done-for-you: o cliente **não se cadastra sozinho**. O Octavio configura a conta e a
identidade do cliente, entrega o acesso pronto, e cobra:
- **Setup** (configuração inicial) — **[CEO define valor]**
- **Mensalidade** (manutenção + uso) — **[CEO define valor]**

## 2. O que está incluído (proposta ao cliente)
- Conta configurada com a identidade do cliente (nome, @handle, avatar, selo, tom de voz).
- Geração de carrosséis ilimitada/por cota — **[CEO define cota]**.
- Temas claro e escuro.
- Suporte/manutenção — **[CEO define escopo]**.

## 3. Onboarding técnico — passo a passo (provisionar um cliente novo)
> Estes passos definem o que a **área de administração** do produto precisa permitir.
1. **Criar a conta do cliente** (e-mail + senha provisória).
2. **Criar a(s) identidade(s)** do cliente:
   - Nome de exibição, @handle, avatar (upload), selo verificado on/off, tom de voz, tema padrão.
   - Permitir mais de uma identidade (ex.: pessoa + empresa).
3. **Calibrar o tom de voz** com 1–2 carrosséis de exemplo do nicho do cliente.
4. **Entregar o acesso**: enviar URL + login; orientar a trocar a senha.
5. **Treinar o cliente** (15 min): as duas portas — com IA e manual — e como exportar.

## 4. Treinamento do cliente (resumo de uso)
- **Porta com IA:** cola um tema/link ou texto pronto; a IA monta; ele refina.
- **Porta manual:** define nº de slides, escreve cada um, anexa imagens.
- **Exportar:** preview → aprovar → baixar PNGs (claro/escuro).
- **Histórico:** reabrir, editar e reexportar carrosséis antigos.

## 5. Manutenção (pós-venda)
- Ajustes de tom/identidade sob demanda.
- Acompanhamento de uso (cota, custos de API).
- **[CEO define]** SLA e canal de suporte.

## 6. Requisitos que este playbook impõe ao produto
(Entram na spec da esteira dev-agents.)
- **Área de admin** para o Octavio: criar contas, identidades e entregar acesso.
- **Multi-identidade** por conta de cliente.
- **Reset/troca de senha** segura.
- **Painel de uso** (quantos carrosséis, período) por cliente.
