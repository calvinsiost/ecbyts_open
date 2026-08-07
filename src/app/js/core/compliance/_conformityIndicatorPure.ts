// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CONFORMITY INDICATOR — auto-cálculo de conformidade no banner (P1-7)
   FRIEND-SCORE-001 R1/R2 (Calvin aprovou "auto calcular" 2026-06-14).

   Antes o banner mostrava "Conformidade: não calculada" ESTÁTICO — o
   usuário precisava achar um botão. R1: com preset ativo, calcular
   automaticamente. R2: o resultado guia a decisão.

   SEMÂNTICA HONESTA (anti-N, RF9 "preset ≠ veredito"): _computeViolations
   é heurística MVP, NÃO conformidade regulatória rigorosa. Por isso o
   indicador diz "N violações detectadas" / "Sem violações detectadas"
   (factual sobre a detecção) — NUNCA "Conforme" (afirmação forte que
   exigiria avaliação completa). Pure: sem DOM, sem rede.
   ================================================================ */

export type ConformityState = 'no_preset' | 'calculating' | 'clean' | 'violations';
export type ConformityTone = 'neutral' | 'muted' | 'green' | 'red';

export interface ConformityIndicatorVM {
    readonly state: ConformityState;
    readonly tone: ConformityTone;
    readonly i18nKey: string;
    readonly params: Readonly<Record<string, number>>;
}

const TONE: Readonly<Record<ConformityState, ConformityTone>> = Object.freeze({
    no_preset: 'neutral',
    calculating: 'muted',
    clean: 'green',
    violations: 'red',
});

/**
 * VM do indicador de conformidade. `hasPreset` false → pede preset. Sem
 * `violationCount` (null) com preset → 'calculating' (cálculo em voo). Com
 * preset e contagem → clean (0) ou violations (>0).
 */
export function buildConformityIndicator(
    hasPreset: boolean,
    violationCount: number | null | undefined,
): ConformityIndicatorVM {
    let state: ConformityState;
    let params: Record<string, number> = {};
    if (!hasPreset) {
        state = 'no_preset';
    } else if (violationCount == null || !Number.isFinite(violationCount)) {
        state = 'calculating';
    } else if (violationCount <= 0) {
        state = 'clean';
    } else {
        state = 'violations';
        params = { n: Math.trunc(violationCount) };
    }
    const keyByState: Record<ConformityState, string> = {
        no_preset: 'compliance.banner.indicator.notCalculated',
        calculating: 'compliance.banner.indicator.calculating',
        clean: 'compliance.banner.indicator.clean',
        violations: 'compliance.banner.indicator.violations',
    };
    return Object.freeze({
        state,
        tone: TONE[state],
        i18nKey: keyByState[state],
        params: Object.freeze(params),
    });
}

/** Cor CSS por tom (para o span do indicador no banner). */
export function conformityToneColor(tone: ConformityTone): string {
    switch (tone) {
        case 'green':
            return '#22c55e';
        case 'red':
            return '#ef4444';
        case 'muted':
            return 'rgba(148,163,184,0.7)';
        default:
            return 'rgba(255,255,255,0.8)';
    }
}
