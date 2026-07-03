import { describe, it, expect } from "vitest";

import {
  MAX_ATTEMPTS,
  WINDOW_MINUTES,
  UNKNOWN_IP,
  normalizeEmail,
  parseClientIp,
  isBlocked,
  windowStart,
} from "@/lib/rate-limit";

// Testes da logica PURA de rate limit no login (spec §"Plano de teste").
// Cobrem os ACs de contagem/limite sem tocar Postgres, headers() ou signIn —
// toda a decisao vive em funcoes puras (src/lib/rate-limit.ts). Determinismo
// total: nenhuma dependencia de relogio real (windowStart recebe o `now`).
// Fixtures sinteticos (regra do projeto: nada de dado real de cliente).

describe("isBlocked — bloqueio por e-mail OU IP", () => {
  it("permite abaixo do limite por e-mail (4 falhas < 5) → false", () => {
    // AC "menos de 5 tentativas → login permitido" (caminho por e-mail).
    expect(isBlocked(4, 0)).toBe(false);
  });

  it("permite abaixo do limite por IP (4 falhas < 5) → false", () => {
    // AC "menos de 5 tentativas → login permitido" (caminho por IP).
    expect(isBlocked(0, 4)).toBe(false);
  });

  it("bloqueia exatamente no limite por e-mail (5 falhas) → true", () => {
    // AC "5 falhas por e-mail → recusa sem validar senha". O 5o ja bloqueia.
    expect(isBlocked(5, 0)).toBe(true);
  });

  it("bloqueia exatamente no limite por IP, e-mail livre (0 e-mail, 5 IP) → true", () => {
    // AC "IP atingiu 5 → recusa mesmo com o e-mail alvo ainda nao bloqueado".
    // Bloqueio por IP e independente do contador de e-mail.
    expect(isBlocked(0, 5)).toBe(true);
  });

  it("bloqueia quando ambos atingem o limite (5 e-mail, 5 IP) → true", () => {
    // Limite e `>=`, nao `==`: as duas chaves no limite continuam bloqueadas.
    expect(isBlocked(5, 5)).toBe(true);
  });

  it("bloqueia acima do limite por e-mail (6 falhas) → true", () => {
    // Confirma que a condicao e `>=` (o 6o nao "escapa" por ser maior que 5).
    expect(isBlocked(6, 0)).toBe(true);
  });

  it("bloqueia acima do limite por IP (0 e-mail, 6 IP) → true", () => {
    // Simetria: acima do limite por IP tambem bloqueia, e-mail irrelevante.
    expect(isBlocked(0, 6)).toBe(true);
  });

  it("permite quando ambas as contagens sao zero → false", () => {
    // Caso base: sem falhas, sem bloqueio.
    expect(isBlocked(0, 0)).toBe(false);
  });

  it("usa MAX_ATTEMPTS como limiar (nao um numero hardcoded no teste)", () => {
    // Prova comportamental: o limite acompanha a constante. Um a menos passa,
    // exatamente no limite bloqueia — mesmo se MAX_ATTEMPTS mudar no futuro.
    expect(isBlocked(MAX_ATTEMPTS - 1, 0)).toBe(false);
    expect(isBlocked(MAX_ATTEMPTS, 0)).toBe(true);
    expect(isBlocked(0, MAX_ATTEMPTS - 1)).toBe(false);
    expect(isBlocked(0, MAX_ATTEMPTS)).toBe(true);
  });
});

describe("MAX_ATTEMPTS / WINDOW_MINUTES — parametros fixados (decisao 3)", () => {
  it("MAX_ATTEMPTS === 5", () => {
    expect(MAX_ATTEMPTS).toBe(5);
  });

  it("WINDOW_MINUTES === 15", () => {
    expect(WINDOW_MINUTES).toBe(15);
  });
});

describe("windowStart — corte deterministico da janela deslizante", () => {
  it("retorna now - 15min para um instante fixo", () => {
    // Data fixa (determinismo total, sem depender do relogio do sistema).
    const now = new Date("2026-07-03T12:00:00.000Z");
    const expected = new Date("2026-07-03T11:45:00.000Z");
    expect(windowStart(now).getTime()).toBe(expected.getTime());
  });

  it("subtrai exatamente WINDOW_MINUTES * 60 * 1000 ms", () => {
    // Comportamento independe da data escolhida: sempre a mesma diferenca.
    const now = new Date("2000-01-01T00:00:00.000Z");
    const diffMs = now.getTime() - windowStart(now).getTime();
    expect(diffMs).toBe(WINDOW_MINUTES * 60 * 1000);
  });

  it("nao muta a data de entrada (retorna nova instancia)", () => {
    // Garante que o call site (signInAction) pode reusar `now` sem surpresa.
    const now = new Date("2026-07-03T12:00:00.000Z");
    const before = now.getTime();
    windowStart(now);
    expect(now.getTime()).toBe(before);
  });
});

describe("normalizeEmail — chave consistente (anti-bypass por caixa)", () => {
  it("aplica trim + lowercase ('  User@X.COM ' → 'user@x.com')", () => {
    // AC anti-bypass: `User@x.com` e `user@x.com` tem de virar a mesma chave,
    // senao o atacante contorna o limite alternando maiusculas/espacos.
    expect(normalizeEmail("  User@X.COM ")).toBe("user@x.com");
  });

  it("e idempotente (f(f(x)) === f(x))", () => {
    // Robustez: normalizar duas vezes nao muda o resultado — importante porque
    // a normalizacao roda em 3 pontos (gravar/contar/limpar).
    const once = normalizeEmail("  User@X.COM ");
    expect(normalizeEmail(once)).toBe(once);
  });

  it("preserva string ja normalizada", () => {
    expect(normalizeEmail("user@x.com")).toBe("user@x.com");
  });

  it("nao altera o texto alem de trim+lowercase (mantem pontos/plus)", () => {
    // Nao inventa canonicalizacao de e-mail (ex.: remover '+tag'): so caixa/espaco.
    expect(normalizeEmail("  Foo.Bar+Tag@Example.COM ")).toBe(
      "foo.bar+tag@example.com",
    );
  });
});

describe("parseClientIp — extracao do x-forwarded-for (edge case da story)", () => {
  it("pega o PRIMEIRO IP da cadeia ('1.2.3.4, 5.6.7.8' → '1.2.3.4')", () => {
    // O primeiro e o cliente original; os seguintes sao proxies.
    expect(parseClientIp("1.2.3.4, 5.6.7.8")).toBe("1.2.3.4");
  });

  it("retorna 'unknown' quando o header e null (ausente)", () => {
    // Edge case "IP indisponivel": sentinel, nunca desliga o bloqueio por e-mail.
    expect(parseClientIp(null)).toBe(UNKNOWN_IP);
  });

  it("retorna 'unknown' quando o header e string vazia", () => {
    expect(parseClientIp("")).toBe(UNKNOWN_IP);
  });

  it("faz trim de espacos no IP (' 1.2.3.4 ' → '1.2.3.4')", () => {
    // Header pode vir com espacos ao redor; a chave precisa bater exatamente.
    expect(parseClientIp(" 1.2.3.4 ")).toBe("1.2.3.4");
  });

  it("faz trim do primeiro IP mesmo numa cadeia (' 1.2.3.4 , 5.6.7.8' → '1.2.3.4')", () => {
    expect(parseClientIp(" 1.2.3.4 , 5.6.7.8")).toBe("1.2.3.4");
  });

  it("retorna 'unknown' quando a cadeia comeca com virgula (primeiro campo vazio)", () => {
    // Cadeia malformada ", 5.6.7.8": o primeiro campo e vazio → sentinel.
    expect(parseClientIp(", 5.6.7.8")).toBe(UNKNOWN_IP);
  });

  it("UNKNOWN_IP e o sentinel 'unknown'", () => {
    expect(UNKNOWN_IP).toBe("unknown");
  });
});
