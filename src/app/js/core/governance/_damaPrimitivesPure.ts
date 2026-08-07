// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   DAMA PRIMITIVES PURE (Module C extraction)
   ================================================================

   3 primitivos reusáveis extraídos de core/governance/damaQualityEngine.ts:
     - isEmpty: detecta valor "ausente" (null/undefined/'').
     - clamp01: clamp para [0, 1] (scores DAMA).
     - computeQualityGrade: mapeia score [0,1] → grade A/B/C/D/F.

   Reusáveis por outros engines governance que precisem dos mesmos
   primitivos (CVM193, EIS aggregations, etc).
   ================================================================ */

/**
 * Detecta valor "ausente" (data quality completeness).
 * Trata null, undefined, e string vazia como vazio.
 * NÃO trata 0 ou false como vazio (são valores legítimos).
 */
export function isEmpty(value: unknown): boolean {
    return value === null || value === undefined || value === '';
}

/**
 * Clamp para [0, 1] (intervalo padrão DAMA scores).
 * NaN coage para 0 (Math.max trata NaN como menor).
 */
export function clamp01(n: number): number {
    return Math.max(0, Math.min(1, n));
}

/**
 * Mapeia score numérico [0, 1] para grade qualitativa A/B/C/D/F.
 * Thresholds: A ≥ 0.95, B ≥ 0.85, C ≥ 0.75, D ≥ 0.60, F < 0.60.
 *
 * Padrão DAMA-DMBOK v2 — usado em assessDataQuality + dashboards.
 */
export function computeQualityGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 0.95) return 'A';
    if (score >= 0.85) return 'B';
    if (score >= 0.75) return 'C';
    if (score >= 0.6) return 'D';
    return 'F';
}
