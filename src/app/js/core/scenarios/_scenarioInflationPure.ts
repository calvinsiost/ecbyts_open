// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO INFLATION / REAL RATE — pure-logic (CFG-14, TEMA E).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-14 — "Inflação / NPV real (hoje só nominal). Adiciona opção de
       DEFLACIONAR por um índice (ex.: IPCA) para NPV real, ALÉM do nominal
       atual (default = nominal). Testável: ligar inflação=4% → NPV real ≠ NPV
       nominal, com fórmula auditável."
     - §5.2 (c) — dimensão econômica em valor presente com desconto.

   O QUE FALTAVA (verificado no código antes de escrever): o ΔNPV S1 descontava
   a série anual por `(1+r)^t` sem NENHUMA noção de índice de preços. Com isso a
   taxa `r` tinha que ser lida como nominal, e o veredito não tinha como
   responder "quanto isso vale em reais de hoje?" — a pergunta que um horizonte
   de 15 anos e um IPCA de 4%/ano tornam obrigatória (a 4%/ano o poder de compra
   quase dobra de erro em 15 anos).

   RELAÇÃO DE FISHER (a fórmula auditável que o CFG-14 pede):

       (1 + r_nominal) = (1 + r_real) × (1 + π)
       ⇒  r_real = (1 + r_nominal) / (1 + π) − 1

   As parcelas anuais deste motor são o DRIVER DE ATIVIDADE crescendo a `g`
   (volume: t/ano, m³/ano — CFG-10/CFG-12), não um índice de preços. Logo elas
   já estão em preços CONSTANTES, e "deflacionar" é descontá-las pela taxa REAL
   em vez da nominal. É a identidade clássica: fluxo nominal a taxa nominal =
   fluxo real a taxa real.

   ─── Por que π = 0 NÃO passa pela fórmula (a garantia bit-a-bit) ───

   Em ponto flutuante `(1 + 0.08) / (1 + 0) − 1` NÃO devolve `0.08`: devolve
   0.08000000000000007, porque `1.08 − 1` cai num double diferente do literal
   `0.08`. Uma taxa "inalterada" que muda o 16º dígito envenenaria toda a série
   de PV. Por isso `active` é falso quando não há inflação utilizável OU quando
   ela é exatamente 0, e `fisherRealRate` devolve a nominal por CURTO-CIRCUITO
   nesse caso — a igualdade é estrutural, não uma coincidência de arredondamento.

   Semanticamente isso também é o certo: com π = 0 a taxa real É a nominal e o
   NPV real É o nominal — não há uma segunda visão para mostrar.

   ─── Faixa validada (guard-rail ESTRUTURAL, declarado como tal) ───

   Piso π = −0.5: a fórmula divide por `(1+π)`, então π ≤ −1 é indefinido; −0.5
   deixa margem larga abaixo de qualquer deflação sustentada já observada e
   mantém `1+π ≥ 0.5`, longe do zero.
   Teto π = 1.0 (100%/ano): acima disso o preço muda dentro do ano e um índice
   ANUAL deixa de descrever o fenômeno — o modelo aqui é de passo anual.

   Com `1+π ≥ 0.5` e `1+r > 0` (garantido pelo motor), `1+r_real > 0` SEMPRE:
   a taxa real nunca sai do domínio do desconto. Fora da faixa é CLAMPADO
   (visível); não-finito cai em "sem inflação" (N3: NaN não vira número).

   ZERO DOM, ZERO IO, determinístico. Objetos retornados congelados.
   ================================================================ */

// ───────────────────────────── Faixa validada ─────────────────────────────

/** Inflação default: 0 — o NPV segue NOMINAL, exatamente como antes do CFG-14. */
export const DEFAULT_INFLATION_RATE = 0;

/** Piso: −50%/ano (deflação). `1+π ≥ 0.5` mantém a divisão de Fisher longe de 0. */
export const MIN_INFLATION_RATE = -0.5;

/** Teto: +100%/ano — acima disso um índice ANUAL não descreve mais o fenômeno. */
export const MAX_INFLATION_RATE = 1.0;

// ───────────────────────────── Tipos ─────────────────────────────

/** Inflação resolvida — o que de fato deflaciona a série (auditável). */
export interface ResolvedInflation {
    /**
     * `true` só quando há um índice utilizável E diferente de zero. É o
     * interruptor que mantém o caminho nominal bit-a-bit intocado.
     */
    readonly active: boolean;
    /** Índice já dentro da faixa validada (0 quando inativo). */
    readonly rate: number;
    /** O índice pedido pelo chamador; `null` quando não pediu (auditoria). */
    readonly requested: number | null;
    /** `true` quando o pedido foi trazido para dentro da faixa validada. */
    readonly clamped: boolean;
}

// ───────────────────────────── Resolução ─────────────────────────────

/**
 * Resolve o índice de inflação do cenário (CFG-14).
 *
 * Ausente, não-finito ou exatamente 0 ⇒ `active:false` e `rate:0` — o cenário
 * continua NOMINAL, que é o default da spec. Fora da faixa validada ⇒ clampado,
 * com o ajuste visível.
 *
 * @param rate - Índice anual π (fração/ano), ex.: 0.04 para IPCA 4%/ano.
 * @returns {@link ResolvedInflation} congelado, com o ajuste auditável.
 */
export function resolveInflation(rate?: number | undefined): ResolvedInflation {
    const raw = typeof rate === 'number' && Number.isFinite(rate) ? rate : null;
    if (raw === null) {
        return Object.freeze({ active: false, rate: DEFAULT_INFLATION_RATE, requested: null, clamped: false });
    }
    const clampedRate = Math.min(MAX_INFLATION_RATE, Math.max(MIN_INFLATION_RATE, raw));
    return Object.freeze({
        // π = 0 é "sem deflacionar": a taxa real É a nominal (ver cabeçalho).
        active: clampedRate !== 0,
        rate: clampedRate,
        requested: raw,
        clamped: clampedRate !== raw,
    });
}

// ───────────────────────────── Aplicação ─────────────────────────────

/**
 * Taxa REAL pela relação de Fisher: `(1 + r) / (1 + π) − 1`.
 *
 * Sem inflação ativa devolve a NOMINAL por curto-circuito — o MESMO double, não
 * um recálculo que reintroduz erro de arredondamento (ver cabeçalho: com π=0 a
 * fórmula devolveria 0.08000000000000007 para r=0.08).
 *
 * @param nominalRate - Taxa nominal r (fração/ano, > −1).
 * @param inflation - Inflação já resolvida por {@link resolveInflation}.
 * @returns A taxa real correspondente (fração/ano, > −1).
 */
export function fisherRealRate(nominalRate: number, inflation: ResolvedInflation): number {
    if (!inflation.active) return nominalRate;
    return (1 + nominalRate) / (1 + inflation.rate) - 1;
}

/**
 * Caminho inverso de Fisher: `(1 + r_real) × (1 + π) − 1`. Serve para o
 * chamador que informa a taxa em termos REAIS e precisa da nominal equivalente
 * (e para provar a identidade nos testes).
 *
 * @param realRate - Taxa real (fração/ano, > −1).
 * @param inflation - Inflação já resolvida por {@link resolveInflation}.
 * @returns A taxa nominal correspondente (fração/ano, > −1).
 */
export function fisherNominalRate(realRate: number, inflation: ResolvedInflation): number {
    if (!inflation.active) return realRate;
    return (1 + realRate) * (1 + inflation.rate) - 1;
}

/**
 * Fator de deflação do ano `k`: `(1 + π)^k` — quantos reais nominais do ano `k`
 * equivalem a 1 real de hoje. Não é usado no desconto (o motor usa a taxa real,
 * que é a forma equivalente e com um arredondamento a menos); existe para a
 * tela poder EXIBIR o poder de compra do horizonte de forma auditável.
 *
 * @param k - Distância em anos do ano-base (k = 0 no ano-base).
 * @param inflation - Inflação já resolvida por {@link resolveInflation}.
 * @returns O fator acumulado de preços (1 quando não há inflação ativa).
 */
export function deflationFactor(k: number, inflation: ResolvedInflation): number {
    if (!inflation.active) return 1;
    return Math.pow(1 + inflation.rate, k);
}
