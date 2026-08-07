// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   SCENARIO CROSS-VALIDATION — pure-logic (SCENARIOS-IMPACT-001, CFG-40).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§2.4
   CFG-40). Validação CRUZADA física das taxas do processo: rejeita
   combinações fisicamente impossíveis (hoje o motor CLAMPAVA em
   silêncio, aceitando yield > recoveryRate). Regras CURADAS
   (guard-rail §2.4.0 — não é validação livre), cada uma com
   mensagem clara em pt-BR citando os valores.

   ZERO DOM, ZERO IO, determinístico.
   ================================================================ */

/** Uma violação de regra cruzada, com mensagem pronta para a UI. */
export interface RateViolation {
    /** Id estável da regra (i18n/telemetria). */
    readonly rule: string;
    /** Mensagem clara (pt-BR) citando os valores rejeitados. */
    readonly message: string;
}

/** Forma mínima das taxas universais do processo. */
export interface RatesLike {
    readonly throughput?: unknown;
    readonly recoveryRate?: unknown;
    readonly yield?: unknown;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Regras cruzadas curadas (CFG-40). Cada regra: id + checagem + mensagem.
 * Extensão futura entra AQUI (fonte única), nunca inline nos callers.
 */
const CROSS_RULES: ReadonlyArray<{
    readonly rule: string;
    readonly check: (rates: RatesLike) => boolean;
    readonly message: (rates: RatesLike) => string;
}> = Object.freeze([
    Object.freeze({
        rule: 'yield-le-recoveryRate',
        check: (r: RatesLike) => !(isFiniteNumber(r.yield) && isFiniteNumber(r.recoveryRate) && r.yield > r.recoveryRate),
        message: (r: RatesLike) =>
            `yield (${r.yield}) não pode ser maior que recoveryRate (${r.recoveryRate}) — ` +
            'combinação fisicamente impossível: o rendimento do produto final não pode ' +
            'superar a taxa de recuperação do processo (CFG-40).',
    }),
]);

/**
 * Valida as taxas contra as regras cruzadas curadas.
 *
 * @param rates  as 3 taxas universais (campos ausentes/não-numéricos são
 *               ignorados — range é validado em outra camada; aqui é CRUZADO).
 * @returns lista de violações (vazia = combinação fisicamente coerente).
 */
export function validateRatesCrossRules(rates: RatesLike): readonly RateViolation[] {
    const violations: RateViolation[] = [];
    for (const rule of CROSS_RULES) {
        if (!rule.check(rates)) {
            violations.push(Object.freeze({ rule: rule.rule, message: rule.message(rates) }));
        }
    }
    return Object.freeze(violations);
}

/**
 * Ativação em callers: lança Error com a mensagem da PRIMEIRA violação
 * (bloqueio com mensagem clara — CFG-40; a UI captura e exibe).
 *
 * @param rates  taxas resultantes da mutação/edição.
 * @param context  rótulo de onde veio a validação (ex.: 'mutateProcess').
 */
export function assertRatesCrossRules(rates: RatesLike, context = 'scenarios'): void {
    const violations = validateRatesCrossRules(rates);
    const first = violations[0];
    if (first) {
        throw new Error(`${context}: ${first.message}`);
    }
}
