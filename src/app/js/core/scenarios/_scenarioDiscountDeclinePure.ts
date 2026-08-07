// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO DISCOUNT DECLINE — pure-logic (CFG-13, TEMA E).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-13 — "Coeficiente de declínio da taxa configurável (hoje fixo
       0.02). O 0.02 (taxa declinante de longo prazo) vira PARÂMETRO dentro de
       faixa fundamentada (UK Green Book / CEPAL), com 0.02 como default.
       Testável: coef=0.03 muda a taxa social ao longo do horizonte; default
       reproduz hoje."
     - §5.2 (c) — taxa social/ambiental MENOR e possivelmente DECLINANTE ao
       longo do tempo (a incerteza cresce no futuro; evita justificar
       degradação intergeracional). "A taxa é parâmetro configurável [...]
       NUNCA hardcoded como constante imutável."

   O QUE FALTAVA (verificado no código antes de escrever): a §5.2(c) exige que a
   taxa NÃO seja constante cravada — e a taxa `r` de fato já era parâmetro
   (`ProjectionParams.discountRate`). Mas a VELOCIDADE com que ela declina não
   era: `_scenarioProjectionPure.ts` tinha o literal `0.02` dentro do corpo de
   `discountFactor()`, alcançável só editando o código:

       const effectiveRate = declining ? r / (1 + 0.02 * k) : r;

   Ou seja, o usuário podia escolher a taxa de partida e LIGAR o declínio, mas
   a curva de declínio em si era uma decisão do desenvolvedor. Este módulo tira
   esse último número do corpo da função e o põe onde os outros parâmetros do
   eixo temporal já estão (CFG-09 horizonte, CFG-10 crescimento, CFG-12 curva).

   FORMA HIPERBÓLICA (a de hoje, preservada):  r_k = r / (1 + c·k)
   com `c` = coeficiente de declínio por ano de distância. `c = 0` devolve a
   taxa plana; quanto maior `c`, menos o futuro distante é descontado.

   NÃO é motor: não desconta nem projeta — RESOLVE o parâmetro e devolve o
   fator, mesmo papel de `resolveHorizon` (CFG-09) e `resolveDemandCurve`
   (CFG-12). O motor da projeção passa a consumir daqui.

   ─── Faixa validada (guard-rail ESTRUTURAL, declarado como tal) ───

   Piso `c = 0`: com `c < 0` o denominador `1 + c·k` ZERA em k = −1/c e troca de
   sinal — dentro do horizonte de 100 anos do CFG-09 isso é alcançável (c=−0.01
   estoura em k=100), a taxa explodiria e depois inverteria. Não é uma escolha
   de política, é o ponto onde a fórmula deixa de ser função. `c = 0` já
   significa "sem declínio", então nada abaixo dele é necessário.

   Teto `c = 0.1`: no teto de 100 anos do CFG-09 esse coeficiente já divide a
   taxa por 11 (8%/ano → ~0,7%/ano no ano 100), abaixo do degrau final da escada
   declinante do UK Green Book. Acima disso o parâmetro deixa de modelar
   "desconto declinante" e vira "sem desconto" — escolha diferente, que o
   usuário já expressa diretamente com `discountRate: 0`.

   Fora da faixa é CLAMPADO (visível em `clamped`), nunca rejeitado em silêncio;
   valor não-finito cai no DEFAULT 0.02 (N3: NaN não vira número).

   ZERO DOM, ZERO IO, determinístico. Objetos retornados congelados.
   ================================================================ */

// ───────────────────────────── Faixa validada ─────────────────────────────

/**
 * Coeficiente de declínio default: 0.02 — EXATAMENTE o literal que estava
 * cravado em `discountFactor()`, preservado para reproduzir o comportamento de
 * hoje dígito por dígito.
 */
export const DEFAULT_DECLINE_COEFFICIENT = 0.02;

/** Piso: 0 (= sem declínio). Abaixo disso a fórmula zera o denominador. */
export const MIN_DECLINE_COEFFICIENT = 0;

/** Teto: 0.1 (no ano 100 a taxa já é ~1/11 da inicial). */
export const MAX_DECLINE_COEFFICIENT = 0.1;

// ───────────────────────────── Tipos ─────────────────────────────

/** Declínio resolvido — o que de fato governa a taxa no horizonte (auditável). */
export interface ResolvedDiscountDecline {
    /** `true` quando a taxa declina ao longo do horizonte (o switch de hoje). */
    readonly active: boolean;
    /** Coeficiente já dentro da faixa validada; só se aplica com `active`. */
    readonly coefficient: number;
    /** O coeficiente pedido pelo chamador; `null` quando não pediu (auditoria). */
    readonly requested: number | null;
    /** `true` quando o pedido foi trazido para dentro da faixa validada. */
    readonly clamped: boolean;
}

// ───────────────────────────── Resolução ─────────────────────────────

/**
 * Resolve o par (liga/desliga, coeficiente) do declínio da taxa (CFG-13).
 *
 * O SWITCH continua sendo `declining` — um coeficiente informado sem ligar o
 * declínio é REGISTRADO (`requested`) mas não aplicado, e isso fica visível em
 * `active:false`. A alternativa (ligar sozinho ao ver o coeficiente) esconderia
 * uma mudança de comportamento atrás de um parâmetro novo; aqui não há
 * ativação implícita.
 *
 * @param declining - Liga o declínio (o mesmo `discountDeclining` de sempre).
 * @param coefficient - Coeficiente `c` de `r/(1+c·k)`; ausente = 0.02 (hoje).
 * @returns {@link ResolvedDiscountDecline} congelado, com o ajuste auditável.
 */
export function resolveDiscountDecline(
    declining?: boolean | undefined,
    coefficient?: number | undefined,
): ResolvedDiscountDecline {
    const raw =
        typeof coefficient === 'number' && Number.isFinite(coefficient) ? coefficient : null;
    // N3: valor não-finito não vira número — cai no default declarado.
    const resolved =
        raw === null
            ? DEFAULT_DECLINE_COEFFICIENT
            : Math.min(MAX_DECLINE_COEFFICIENT, Math.max(MIN_DECLINE_COEFFICIENT, raw));
    return Object.freeze({
        active: declining === true,
        coefficient: resolved,
        requested: raw,
        clamped: raw !== null && resolved !== raw,
    });
}

// ───────────────────────────── Aplicação ─────────────────────────────

/**
 * Taxa efetiva no ano relativo `k`: `r / (1 + c·k)` (§5.2 c). Com `c = 0`, ou
 * com o declínio desligado, devolve a própria `r` — o mesmo double, sem
 * arredondamento intermediário.
 *
 * @param rate - Taxa de partida r (fração/ano).
 * @param k - Distância em anos do ano-base (k = 0 no ano-base).
 * @param decline - Declínio já resolvido por {@link resolveDiscountDecline}.
 * @returns A taxa que desconta o ano `k`.
 */
export function decliningRateAt(rate: number, k: number, decline: ResolvedDiscountDecline): number {
    if (!decline.active) return rate;
    return rate / (1 + decline.coefficient * k);
}

/**
 * Fator de desconto `(1 + r_k)^k` do ano relativo `k` (§5.2 c) — o ponto único
 * onde a taxa (plana ou declinante) vira divisor do fluxo econômico.
 *
 * @param rate - Taxa de partida r (fração/ano).
 * @param k - Distância em anos do ano-base (k = 0 no ano-base).
 * @param decline - Declínio já resolvido por {@link resolveDiscountDecline}.
 * @returns O fator pelo qual o valor nominal do ano `k` é dividido.
 */
export function declineDiscountFactor(
    rate: number,
    k: number,
    decline: ResolvedDiscountDecline,
): number {
    return Math.pow(1 + decliningRateAt(rate, k, decline), k);
}
