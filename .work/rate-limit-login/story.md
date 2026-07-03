# Story — Rate limit no login

## User Story
Como **CEO/operador do Carrossel Studio responsável pelas contas dos clientes**, quero que
tentativas repetidas de login com falha sejam **bloqueadas temporariamente**, para que um
ataque de força bruta (distribuído ou não) não consiga adivinhar a senha de uma conta e
acessar dado real de cliente.

> Contexto: hoje o único freio contra brute force é o custo do bcrypt (~250 ms/tentativa),
> insuficiente. O bloqueio se aplica ao `signInAction` em `src/lib/actions/auth.ts` — o único
> caminho que o form de `/login` usa. Decisão técnica já fixada na ADR 0003 (§2.1) e **fora de
> negociação nesta story**: contagem/bloqueio **persistidos no Postgres** (tabela nova, ex.
> `login_attempts`), **sem Redis/Upstash/vendor externo**.

## Critérios de aceite

### Bloqueio por excesso de tentativas
- [ ] Dado um e-mail com **menos de 5** tentativas de login com falha nos últimos 15 minutos,
      quando alguém envia o form de `/login` com a senha correta, então o login é permitido e
      o usuário é redirecionado a `/carousels` (comportamento atual preservado).
- [ ] Dado um e-mail que atingiu **5 tentativas de login com falha** dentro de uma janela de
      15 minutos, quando alguém envia o form de `/login` para esse e-mail (mesmo com a senha
      correta), então a tentativa é **recusada sem chegar a validar a senha** e o form exibe a
      mensagem genérica **"E-mail ou senha inválidos"** (a mesma de senha errada).
- [ ] Dado um **IP de origem** que atingiu 5 tentativas de login com falha dentro de 15 minutos
      (independente de quais e-mails), quando esse IP envia o form de `/login`, então a
      tentativa é recusada com a mesma mensagem genérica, mesmo que o e-mail alvo ainda não
      esteja bloqueado.
- [ ] Dado um e-mail (ou IP) atualmente bloqueado, quando a janela de bloqueio expira (passados
      os 15 minutos desde a tentativa que estourou o limite — parâmetro exato a confirmar na
      spec), então uma nova tentativa de login volta a ser aceita normalmente.

### Contabilização das tentativas
- [ ] Dado um login com **falha** (senha errada, e-mail inexistente ou entrada inválida),
      quando o `signInAction` processa a requisição, então a tentativa é **registrada** na
      tabela `login_attempts` associada ao e-mail informado e ao IP de origem.
- [ ] Dado um login **bem-sucedido**, quando o usuário autentica, então o contador de falhas
      relevante é **zerado/desconsiderado** de forma que o próximo login legítimo não seja
      penalizado por falhas antigas dentro da janela (mecanismo exato — reset vs. janela
      deslizante — a definir na spec; ver perguntas abertas).

### Não vazar informação ao atacante
- [ ] Dado qualquer recusa de login (senha errada, e-mail inexistente **ou** bloqueio por rate
      limit), quando o form recebe a resposta, então a mensagem exibida é **idêntica**
      ("E-mail ou senha inválidos") — **nunca** revela se a causa foi excesso de tentativas ou
      credencial errada, nem se o e-mail existe.
- [ ] Dado um e-mail inexistente sendo martelado, quando ele atinge o limite, então o
      comportamento de bloqueio e a mensagem são **indistinguíveis** dos de um e-mail que existe
      (o bloqueio não pode virar oráculo de enumeração de contas).

### Persistência e correção sob serverless
- [ ] Dado que a Vercel executa o app em **múltiplas instâncias serverless**, quando tentativas
      de um mesmo e-mail/IP chegam em instâncias diferentes, então a contagem é **consistente**
      porque vive no Postgres (não em memória de processo).
- [ ] Existe uma **migration Drizzle** que cria a tabela `login_attempts` seguindo o padrão do
      schema atual (`src/db/schema.ts`): PK `uuid` `defaultRandom`, timestamps `timestamptz`, e
      índice(s) que sirvam a consulta por e-mail e por IP dentro da janela de tempo.

### Testes e build
- [ ] Existe cobertura automatizada provando: (a) permite login abaixo do limite, (b) bloqueia
      no 5º na janela, (c) libera após expirar a janela, (d) mensagem sempre genérica, (e)
      bloqueio funciona por e-mail e por IP independentemente.
- [ ] `npm run test` e `npm run build` verdes ao final (critério de aceite da ADR 0003 §3).

## Edge cases
- **IP indisponível/irreconhecível** na server action (cabeçalho de proxy ausente ou vazio) →
  comportamento definido e seguro (ver `[PRECISA CLARIFICAR]` sobre a fonte do IP); a falta de
  IP **não pode** desligar o bloqueio por e-mail.
- **Múltiplos usuários atrás do mesmo IP** (NAT corporativo, wifi compartilhado) → o limite por
  IP pode gerar falso positivo; comportamento esperado: ainda bloqueia (segurança > conveniência
  nesta fase), mas o limiar por IP deve ser calibrado na spec para não travar uso legítimo
  cotidiano (o operador é praticamente o único usuário hoje).
- **Entrada inválida no form** (e-mail malformado, senha vazia) → conta como tentativa falha
  para fins de rate limit? (ver perguntas abertas) — mas nunca deve dar erro técnico; sempre a
  mensagem genérica.
- **Banco indisponível** ao consultar/gravar `login_attempts` → comportamento esperado: **fail
  safe** — se não dá pra checar o limite, o login **não** deve ser liberado às cegas de forma a
  anular a proteção; o comportamento exato (recusar com mensagem genérica vs. degradar) fica
  como decisão da spec, mas não pode abrir buraco de segurança nem derrubar o login para o
  operador legítimo (tensão real — ver perguntas abertas).
- **Corrida (duas tentativas simultâneas do mesmo e-mail)** → a contagem não pode "escapar" do
  limite por concorrência; a spec deve garantir contagem correta (contagem no banco, não em
  read-modify-write frágil).
- **Crescimento infinito da tabela** → registros antigos fora de qualquer janela viram lixo;
  precisa de estratégia de limpeza/expiração (ver fora de escopo / perguntas abertas).
- **Login com sucesso após algumas falhas (mas antes do limite)** → deve entrar normalmente e
  não carregar penalidade para a próxima sessão legítima.

## Fora de escopo
- **CAPTCHA / desafio interativo** após N tentativas — não nesta entrega.
- **Notificar o usuário/operador por e-mail** sobre tentativas suspeitas ou bloqueio — fatia
  futura.
- **Desbloqueio manual** (painel admin para liberar um e-mail/IP antes da janela expirar) — não
  agora; a janela expira sozinha.
- **Rate limit em outras rotas** (reset de senha, geração via Claude API, uploads) — esta story
  cobre **apenas** o login (`signInAction`).
- **Bloqueio permanente / lockout progressivo** (aumentar a janela a cada reincidência) — só o
  bloqueio temporário fixo desta entrega.
- **Redis/Upstash/qualquer vendor externo de rate limit** — proibido por decisão da ADR
  0001/0003; não é uma opção a considerar.
- **Detecção de bot por fingerprint / device / geolocalização** — fora.
- Itens 2.2 (CORS MinIO) e 2.3 (headers HTTP) da ADR 0003 — são outras entregas.

## Perguntas abertas
- [PRECISA CLARIFICAR: **fonte do IP na server action.** `signInAction` é uma server action —
  o IP confiável vem do cabeçalho `x-forwarded-for` populado pela Vercel, lido via `headers()`
  do `next/headers`. Confirmar que essa é a fonte aceita e como tratar o caso de o cabeçalho
  vir com cadeia de IPs (pegar o primeiro? o da Vercel?). Definição fecha na spec.]
- [PRECISA CLARIFICAR: **onde a checagem/registro acontece** — dentro do `signInAction` (antes
  de `signIn(...)`), ou dentro do `authorize` em `src/auth.ts`? O `authorize` sabe se a senha
  bateu, mas não enxerga o IP facilmente; o `signInAction` enxerga o IP mas não sabe o
  resultado da comparação de senha. Provável divisão: checar bloqueio no `signInAction` antes de
  chamar `signIn`, e registrar falha após o `AuthError`. Confirmar na spec.]
- [PRECISA CLARIFICAR: **parâmetros exatos** — a ADR sugere 5 tentativas / 15 min de janela /
  bloqueio temporário, por e-mail E por IP. Confirmar: (a) o limiar por IP é o mesmo 5 ou maior
  (IP compartilhado acumula rápido)? (b) a duração do **bloqueio** é igual à janela de contagem
  (15 min) ou independente? (c) janela é **deslizante** (últimos 15 min) ou **fixa**?]
- [PRECISA CLARIFICAR: **o que zera o contador em caso de sucesso** — apaga/ignora as falhas do
  e-mail que acabou de logar? E as do IP (que pode ter outros e-mails legítimos)? Definir para
  não penalizar o operador legítimo.]
- [PRECISA CLARIFICAR: **entrada inválida (Zod falha) conta como tentativa** para o rate limit,
  ou só falhas de credencial de verdade contam? Contar entradas inválidas endurece contra bots,
  mas pode acelerar bloqueio por ruído.]
- [PRECISA CLARIFICAR: **comportamento em falha do Postgres** ao checar/gravar tentativas —
  preferimos *fail closed* (recusar login com mensagem genérica, protege mas pode travar o
  operador se o banco oscilar) ou *fail open com log* (deixa passar a checagem para não derrubar
  o login legítimo)? Há tensão real entre segurança e disponibilidade; o operador é hoje
  praticamente o único usuário.]
- [PRECISA CLARIFICAR: **limpeza de registros antigos** — a story precisa entregar já uma rotina
  de expiração/limpeza de `login_attempts`, ou basta a consulta filtrar por janela e a limpeza
  fica como fatia futura (a tabela cresce, mas devagar dado o volume atual)?]

---
> **GATE humano.** Esta story precisa de aprovação do CEO/operador antes de seguir para a spec.
> As perguntas abertas acima devem ser resolvidas aqui — várias mudam o desenho técnico.
