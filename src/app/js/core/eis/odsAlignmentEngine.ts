// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost

/* ================================================================
   EIS ODS Alignment Engine — P1-54
   Maps EIS TCCCA+T axes to UN Sustainable Development Goals (SDGs).

   Methodology:
   - Each EIS axis (T, A, Cp, Ty, Cs, Cm) contributes to one or more SDGs
     with a declared weight (0–1).
   - SDG contribution = sum(axisScore * weight) over all contributing axes.
   - Normalized to 0–1 by dividing by the maximum possible contribution
     (max axis score = 5, max weight contribution per axis = 1.0 → max = 5).
   - Ranking uses three levels: strong (>=0.7), moderate (>=0.4), weak (<0.4).

   SDG subset covered: SDG3, SDG6, SDG11, SDG13, SDG14, SDG15
   (most directly linked to environmental monitoring and integrity data).

   Reference: UN 2030 Agenda for Sustainable Development (A/RES/70/1)
   ================================================================ */

/**
 * Relevant UN SDG keys mapped to canonical slug labels.
 * Subset of 17 SDGs most aligned with environmental monitoring.
 */
export const UN_SDGS: Readonly<Record<string, string>> = Object.freeze({
    SDG3: 'good_health',
    SDG6: 'clean_water',
    SDG11: 'sustainable_cities',
    SDG13: 'climate_action',
    SDG14: 'life_below_water',
    SDG15: 'life_on_land',
});

/**
 * Mapping from EIS TCCCA+T axes to contributing SDGs with weights.
 * Weights per axis sum to 1.0 for each axis (normalized contribution split).
 *
 * EIS axes:
 *   T  - Traceability (proveniência, rastreabilidade)
 *   A  - Accuracy     (precisão, saúde dos sensores)
 *   Cp - Compliance   (completude de leituras vs planejado)
 *   Ty - Temporality  (atualidade dos dados)
 *   Cs - Consistency  (padronização de unidades SI)
 *   Cm - Community    (comparabilidade, catálogo padrão)
 */
export const EIS_TO_SDG_MAPPING: Readonly<Record<string, ReadonlyArray<{ sdg: string; weight: number }>>> = Object.freeze({
    T: Object.freeze([
        { sdg: 'SDG11', weight: 0.4 },
        { sdg: 'SDG13', weight: 0.3 },
        { sdg: 'SDG15', weight: 0.3 },
    ]),
    A: Object.freeze([
        { sdg: 'SDG3', weight: 0.4 },
        { sdg: 'SDG6', weight: 0.3 },
        { sdg: 'SDG15', weight: 0.3 },
    ]),
    Cp: Object.freeze([
        { sdg: 'SDG6', weight: 0.3 },
        { sdg: 'SDG11', weight: 0.3 },
        { sdg: 'SDG14', weight: 0.2 },
        { sdg: 'SDG15', weight: 0.2 },
    ]),
    Ty: Object.freeze([
        { sdg: 'SDG13', weight: 0.5 },
        { sdg: 'SDG15', weight: 0.3 },
        { sdg: 'SDG11', weight: 0.2 },
    ]),
    Cs: Object.freeze([
        { sdg: 'SDG3', weight: 0.3 },
        { sdg: 'SDG6', weight: 0.3 },
        { sdg: 'SDG14', weight: 0.2 },
        { sdg: 'SDG15', weight: 0.2 },
    ]),
    Cm: Object.freeze([
        { sdg: 'SDG3', weight: 0.3 },
        { sdg: 'SDG11', weight: 0.4 },
        { sdg: 'SDG13', weight: 0.3 },
    ]),
});

/**
 * Maximum possible raw contribution per SDG axis slot.
 * EIS axis scores range 0–5, so max raw = 5 * weight.
 * Total max possible per SDG = sum(5 * weight) over all contributing axes.
 * We normalize by dividing raw contribution by this max.
 *
 * Pre-computed for each SDG from EIS_TO_SDG_MAPPING.
 * @returns map from SDG key to max raw contribution
 */
function computeMaxContributions(): Record<string, number> {
    const maxMap: Record<string, number> = {};
    for (const sdg of Object.keys(UN_SDGS)) {
        maxMap[sdg] = 0;
    }
    for (const entries of Object.values(EIS_TO_SDG_MAPPING)) {
        for (const { sdg, weight } of entries) {
            maxMap[sdg] = (maxMap[sdg] || 0) + 5 * weight;
        }
    }
    return maxMap;
}

/** Pre-computed max contributions (frozen singleton). */
const MAX_CONTRIBUTIONS = Object.freeze(computeMaxContributions());

/**
 * Compute SDG contribution scores from EIS axis scores.
 *
 * For each SDG, sums axisScore * weight across all axes that map to it,
 * then normalizes by the maximum possible contribution (axis max = 5).
 *
 * @param eisAxisScores - Map of axis key → score (0–5).
 *   Expected keys: T, A, Cp, Ty, Cs, Cm. Missing keys default to 0.
 * @returns Map of SDG key → normalized score (0–1).
 */
export function computeSdgContributions(eisAxisScores: Record<string, number>): Record<string, number> {
    if (!eisAxisScores || typeof eisAxisScores !== 'object') {
        throw new TypeError('eisAxisScores must be a non-null object');
    }

    const raw: Record<string, number> = {};
    for (const sdg of Object.keys(UN_SDGS)) {
        raw[sdg] = 0;
    }

    for (const [axis, entries] of Object.entries(EIS_TO_SDG_MAPPING)) {
        const axisScore = Number(eisAxisScores[axis] ?? 0);
        const clampedScore = Math.max(0, Math.min(5, axisScore));
        for (const { sdg, weight } of entries) {
            raw[sdg] = (raw[sdg] as number) + clampedScore * weight;
        }
    }

    const normalized: Record<string, number> = {};
    for (const [sdg, rawVal] of Object.entries(raw)) {
        const maxVal = MAX_CONTRIBUTIONS[sdg] as number;
        normalized[sdg] = maxVal > 0 ? Math.min(1, rawVal / maxVal) : 0;
    }

    return normalized;
}

/**
 * Classify a normalized SDG score into an alignment level.
 *
 * @param score - Normalized score (0–1).
 * @returns Alignment level.
 */
function classifyLevel(score: number): 'strong' | 'moderate' | 'weak' {
    if (score >= 0.7) return 'strong';
    if (score >= 0.4) return 'moderate';
    return 'weak';
}

/**
 * Rank SDG alignment from highest to lowest contribution score.
 *
 * @param sdgContributions - Output of computeSdgContributions().
 * @returns Array sorted descending by score.
 */
export function rankSdgAlignment(
    sdgContributions: Record<string, number>,
): Array<{ sdg: string; score: number; level: 'strong' | 'moderate' | 'weak' }> {
    if (!sdgContributions || typeof sdgContributions !== 'object') {
        throw new TypeError('sdgContributions must be a non-null object');
    }

    return Object.entries(sdgContributions)
        .map(([sdg, score]) => ({
            sdg,
            score: Number(score),
            level: classifyLevel(Number(score)),
        }))
        .sort((a, b) => b.score - a.score);
}

/**
 * Return human-readable label for a SDG key.
 * Uses EN-US labels aligned with UN official naming.
 *
 * @param sdg - SDG key (e.g. 'SDG3').
 * @returns Human-readable label or the key itself if not found.
 */
export function getSdgLabel(sdg: string): string {
    const labels: Record<string, string> = {
        SDG3: 'Good Health and Well-Being',
        SDG6: 'Clean Water and Sanitation',
        SDG11: 'Sustainable Cities and Communities',
        SDG13: 'Climate Action',
        SDG14: 'Life Below Water',
        SDG15: 'Life on Land',
    };
    return labels[sdg] || String(sdg);
}

/**
 * Build a full SDG alignment report from EIS axis scores.
 *
 * @param eisAxisScores - Map of axis key → score (0–5).
 * @param number> - Optional project name for the report header.
 * @returns Full SDG alignment report.
 */
export function buildSdgReport(
    eisAxisScores: Record<string, number>,
    projectName: string = 'Unnamed Project',
): {
    projectName: string;
    generatedAt: string;
    contributions: Record<string, number>;
    ranking: Array<{ sdg: string; score: number; level: string }>;
    topSdg: string;
    overallAlignment: number;
} {
    const contributions = computeSdgContributions(eisAxisScores);
    const ranking = rankSdgAlignment(contributions);

    const scores = Object.values(contributions);
    const overallAlignment = scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 0;

    const topSdg = ranking.length > 0 ? (ranking[0] as { sdg: string }).sdg : '';

    return {
        projectName: String(projectName),
        generatedAt: new Date().toISOString(),
        contributions,
        ranking,
        topSdg,
        overallAlignment: Math.round(overallAlignment * 1000) / 1000,
    };
}