// Camada de mocks do redesign visual (frontend, sessao paralela ao backend).
// TUDO aqui e TEMPORARIO: cada funcao documenta, no proprio comentario, qual
// action/campo real ela substitui e o que precisa mudar quando o backend
// (feature/redesign-backend) mergear. NUNCA editar src/db/schema.ts,
// src/lib/actions/*.ts ou src/auth.ts a partir daqui — este arquivo so ORBITA
// essas fronteiras reais, nunca as duplica.
//
// Modulo SEM "server-only" de proposito: e importado tanto por Server
// Components (paginas) quanto por Client Components (ex.: admin-client.tsx,
// settings-form.tsx) — nao pode arrastar `@/auth`/db para o bundle do client.

// --- Papel do usuario (admin/CEO) --------------------------------------------

/**
 * TODO(integração pós-merge): trocar por checagem real de `role === "admin"`
 * assim que src/auth.ts expuser esse campo (users nao tem coluna `role` ainda
 * — ver src/db/schema.ts). O cast temporario que le `session.user.role` vive
 * em `requireUser()` (src/lib/auth-guard.ts) e e passado aqui como `role`.
 * Ate a coluna existir, qualquer usuario autenticado e tratado como admin/CEO
 * (mock) so para permitir visualizar e testar a tela /admin.
 */
export function isAdminUser(role: string | undefined): boolean {
  if (role === "admin") return true;
  return true; // mock: fallback ate a coluna de papel existir de verdade.
}

// --- Onboarding ---------------------------------------------------------------

/**
 * TODO(integração pós-merge): trocar por `settings.onboardingCompletedAt`
 * quando getClientSettings() (src/lib/actions/settings.ts) expuser esse campo.
 * Ate la, tratamos como sempre null (onboarding nunca "completo"): o banner
 * "Complete seu perfil" fica visivel e /onboarding sempre pode ser reaberto.
 */
export function getOnboardingCompletedAtMock(): string | null {
  return null;
}

// --- Conta: troca de senha ------------------------------------------------

/** Resultado da troca de senha (mesma forma que a action real deve devolver). */
export interface ChangePasswordResult {
  ok: true;
}

/**
 * TODO(integração pós-merge): trocar pela server action real `changePassword`
 * (src/lib/actions/settings.ts ou novo arquivo de auth) quando o backend
 * mergear. Por enquanto so simula uma chamada de rede e sempre "sucede" —
 * NAO alcanca o banco, NAO troca senha nenhuma de verdade.
 */
export async function changePasswordMock(
  _currentPassword: string,
  _newPassword: string,
): Promise<ChangePasswordResult> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return { ok: true };
}

// --- Admin: gestao de clientes (multi-usuario) ---------------------------

export interface AdminClientRow {
  id: string;
  name: string;
  handle: string;
  email: string;
  carouselsCount: number;
  status: "ativo" | "suspenso";
}

/**
 * TODO(integração pós-merge): trocar por uma action real de listagem de
 * usuarios/clientes (ainda nao existe no schema — hoje so ha 1 `users` por
 * login, sem conceito de "conta gerenciada por admin"). Dados abaixo sao
 * ESTATICOS e ilustrativos, so para a tela /admin nao ficar vazia.
 */
export function listClientsMock(): AdminClientRow[] {
  return [
    {
      id: "mock-1",
      name: "Octavio",
      handle: "octavio",
      email: "cliente@empresa.com",
      carouselsCount: 128,
      status: "ativo",
    },
    {
      id: "mock-2",
      name: "Marina Costa",
      handle: "marina",
      email: "marina@studio.co",
      carouselsCount: 42,
      status: "ativo",
    },
    {
      id: "mock-3",
      name: "Pedro Alves",
      handle: "pedroalves",
      email: "pedro@agencia.io",
      carouselsCount: 7,
      status: "suspenso",
    },
  ];
}

/**
 * TODO(integração pós-merge): trocar pela action real de criacao de cliente
 * (provavelmente cria `users` + `clients` em transacao). Por enquanto so
 * simula a chamada — NAO cria nada no banco.
 */
export async function createClientMock(
  _email: string,
  _provisionalPassword: string,
): Promise<{ ok: true }> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return { ok: true };
}

/**
 * TODO(integração pós-merge): trocar por tracking real de uso (tokens/custo
 * por cliente). Nao existe nenhuma coleta disso ainda — nunca inventar um
 * numero fixo permanente na UI final; por isso o placeholder e um texto.
 */
export const USAGE_PLACEHOLDER = "Em breve";
