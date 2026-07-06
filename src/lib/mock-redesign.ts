// Camada de placeholders do redesign (ADR 0004). Após a integração pós-merge do
// backend (role, onboarding, admin, changePassword), só resta um placeholder
// real aqui: uso de tokens/custo por cliente, que não tem tracking implementado
// ainda (fatia futura — ver ADR 0004 §2.3/§5). NUNCA inventar um número fixo
// permanente na UI final; por isso é um texto, não um valor calculado.

export const USAGE_PLACEHOLDER = "Em breve";
