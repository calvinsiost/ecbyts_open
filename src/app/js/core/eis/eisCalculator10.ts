// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   EIS Calculator 10 — Motor 10 eixos (Core-6 + Progressive-4)
   SPEC_EIS_RADAR_10AXES_PROGRESSIVE_UI.md Fase 1
   ================================================================

   EXTENSÃO do motor EIS para o modo Extended-10.
   NÃO modifica eisCalculator.js — compatibilidade retroativa total.

   ALGORITMO: Média Geométrica Ponderada (idêntico ao motor atual).
   EIS10 = ∏ (score_i)^(weight_i / totalWeight)

   VETO MODE (igual ao motor atual):
   Se T ≤ 2 ou A ≤ 2 → eis10 = 0.0 (kill-switch não-compensatório)

   EIXOS PROGRESSIVOS OPCIONAIS:
   Gc, Bi, Se, Tr — default 0.0 se ausentes no input.
   Score 0 em eixo progressivo puxa o EIS10 para baixo de forma
   orgânica (propriedade da geométrica ponderada).

   IMPORTANTE: EIS10 é um score diagnóstico SEPARADO do EIS Core
   oficial. UI deve rotular claramente "EIS Extended" vs "EIS Core".
   ================================================================ */

import { AXIS_DEFINITIONS, getTotalWeight } from './axisRegistry.js';
import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';

/** Ordem canônica dos 10 eixos para iteração consistente. */
const AXIS_ORDER: Array<'T' | 'A' | 'Cp' | 'Ty' | 'Cs' | 'Cm' | 'Gc' | 'Bi' | 'Se' | 'Tr'> = [
    'T',
    'A',
    'Cp',
    'Ty',
    'Cs',
    'Cm',
    'Gc',
    'Bi',
    'Se',
    'Tr',
];

/**
 * Normaliza scores brutos: clamp de cada valor para [0, 5].
 * Eixos ausentes são completados com 0.
 *
 * @param rawScores - Scores brutos por eixo.
 * @returns Scores normalizados (todos os 10 eixos presentes).
 */
export function normalizeAxisScores(rawScores: Record<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    const raw = (rawScores || {}) as Record<string, any>;
    for (const id of AXIS_ORDER) {
        const v = id in raw ? raw[id] : 0;
        out[id] = toFiniteNumber(v, 0, { min: 0, max: 5 });
    }
    return out;
}

/**
 * Classifica o score EIS10 em veredito padronizado.
 * Usa os mesmos limiares do motor Core (retrocompat).
 *
 * @param score - Score EIS10 (0.00–5.00).
 * @returns Veredito ('🟢 Audit Ready' | '🟡 Management Ready' | '🔴 Critical Data').
 */
function _getVerdict(score: number): string {
    if (score >= 4.5) return '🟢 Audit Ready';
    if (score >= 3.5) return '🟡 Management Ready';
    return '🔴 Critical Data';
}

/**
 * Computa o EIS Extended (10 eixos) via média geométrica ponderada.
 *
 * Os 4 eixos progressivos (Gc, Bi, Se, Tr) são opcionais - valor padrão 0.
 * Veto mode: se T ≤ 2 ou A ≤ 2 (scores originais) → eis10 = 0.0.
 *
 * @param axisScores - Scores por eixo.
 *   Obrigatórios: T, A, Cp, Ty, Cs, Cm (range 0–5).
 *   Opcionais: Gc, Bi, Se, Tr (default 0 se ausentes).
 * @param opts - Opções de cálculo.
 *   veto: se true (default false), aplica kill-switch T≤2/A≤2.
 */
export function computeEIS10(
    axisScores: Record<string, number>,
    opts: { veto?: boolean } = {},
): {
    eis10: number;
    axes: Array<{ id: string; score: number; weight: number; contribution: number }>;
    verdict: string;
    vetoed: boolean;
    totalWeight: number;
} {
    const { veto = false } = opts;

    // Normaliza: preenche ausentes com 0, clamp [0,5]
    const scores = normalizeAxisScores(axisScores);

    // Veto mode: avalia sobre scores originais (sem multiplicador)
    const vetoed = veto && ((scores.T as number) <= 2 || (scores.A as number) <= 2);

    const totalWeight = getTotalWeight();
    let rawProduct = 1;
    const axes: Array<{ id: string; score: number; weight: number; contribution: number }> = [];

    for (const id of AXIS_ORDER) {
        const def = (AXIS_DEFINITIONS as Record<string, any>)[id];
        const score = scores[id] as number;
        const weight = def.weight;

        // Contribuição: expoente normalizado
        // Para score=0 a geométrica colapsaria para 0 - tratar como floor=0.001
        // para preservar sinal sem distorcer score acima de 0.
        const effectiveScore = score > 0 ? score : 1e-9;
        const contribution = Math.pow(effectiveScore, weight / totalWeight);
        rawProduct *= contribution;

        axes.push({
            id,
            score,
            weight,
            contribution: parseFloat(contribution.toFixed(6)),
        });
    }

    const eis10 = vetoed ? 0.0 : parseFloat(rawProduct.toFixed(2));

    return {
        eis10,
        axes,
        verdict: _getVerdict(eis10),
        vetoed,
        totalWeight,
    };
}
