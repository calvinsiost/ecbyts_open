// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Pure-logic presentation helper for EIS spatial-indicator (IS1-IS7 + composite)
// color decision by score band. DOM-free, framework-free, deps-free.
//
// Extracted (ARCH-MONOLITH-ATOMIZATION-001) from the inline `_scoreToColor`
// helper of src/app/js/utils/handlers/eis.ts — the EIS monolito flagged GROWN
// by scripts/monolith-ratchet.mjs. This is the 4-band STEP function used by the
// spatial-indicators panel (hex output), distinct from:
//   - scoreToColor (eis/_internal.ts): continuous 5-stop gradient, rgb() output.
//   - _eisVerdictPure: 3-tier verdict classification, rgb() output, 4.5/3.5 cut.
// Behaviour preserved byte-for-byte from the original inline implementation.

/**
 * Faixas de cor (limiar inferior inclusivo → cor hex) para os indicadores
 * espaciais EIS. Maior limiar primeiro: a primeira faixa cujo limiar o score
 * alcançar vence. Score abaixo de todas as faixas cai no fallback vermelho.
 */
export const EIS_SPATIAL_COLOR_BANDS: ReadonlyArray<readonly [number, string]> = Object.freeze([
    [4.5, '#22c55e'], // green
    [3.5, '#f59e0b'], // amber
    [2.5, '#f97316'], // orange
]) as ReadonlyArray<readonly [number, string]>;

/** Cor de fallback para scores abaixo de todas as faixas (ou inválidos). */
export const EIS_SPATIAL_COLOR_FALLBACK = '#ef4444'; // red

/**
 * Converte um score de indicador espacial EIS (0-5) em cor hex por faixa (step,
 * não gradiente). Score >= 4.5 verde, >= 3.5 âmbar, >= 2.5 laranja, senão vermelho.
 * Entrada inválida (NaN, null, não-finita) cai no fallback vermelho.
 *
 * @param score - Score do indicador espacial (esperado 0.0 a 5.0)
 * @returns Cor CSS hex (#rrggbb)
 */
export function scoreToSpatialColor(score: unknown): string {
    const n = Number(score);
    if (!Number.isFinite(n)) return EIS_SPATIAL_COLOR_FALLBACK;
    for (const band of EIS_SPATIAL_COLOR_BANDS) {
        if (n >= band[0]) return band[1];
    }
    return EIS_SPATIAL_COLOR_FALLBACK;
}
