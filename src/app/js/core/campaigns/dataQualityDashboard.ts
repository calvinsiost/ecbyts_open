// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost

/* ================================================================
   DATA QUALITY DASHBOARD — Aggregation layer
   ================================================================

   Camada de agregacao pura que transforma o estado de elementos +
   observacoes do projeto em entradas prontas para o
   campaignQualityScorer, agrupando observacoes por campanha.

   - Observacoes vivem dentro de cada elemento (el.observations[]).
   - Cada observacao pode carregar campaignId (vinculo a campanha).
   - O scorer espera { elementId, parameter, value, unit,
     timestamp, uncertainty }; este modulo faz o mapeamento.

   Nenhuma dependencia de DOM/rede — apenas dados de entrada.
   ================================================================ */

import { computeCampaignQuality, gradeScore } from './campaignQualityScorer.js';

/** Mirror of campaignQualityScorer.CampaignObservation (cross-module type alias). */
type CampaignObservation = {
    elementId: string;
    parameter: string;
    value: number | string | null;
    unit: string;
    timestamp: string;
    uncertainty: number | null;
};

export interface RawObservation {
    campaignId?: string;
    parameterId?: string;
    reading?: number | string | null;
    unit?: string;
    date?: string;
    uncertainty?: any;
}

export interface RawElement {
    id?: string;
    observations?: Array<RawObservation>;
}

export interface CampaignQualityRow {
    campaignId: string;
    campaignName: string;
    observationCount: number;
    dimensions: {
        completeness: number;
        consistency: number;
        coverage: number;
        replication: number;
        uncertainty: number;
    };
    compositeScore: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    recommendations: string[];
}

export interface DashboardModel {
    rows: CampaignQualityRow[];
    totalElements: number;
    totalObservations: number;
    overallScore: number;
    overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
}

/**
 * Maps a raw element observation to the scorer-expected shape.
 * Mapeia uma observacao bruta para o formato esperado pelo scorer.
 */
function toScorerObservation(
    obs: RawObservation,
    elementId: string,
): CampaignObservation {
    const uVal = obs?.uncertainty?.value ?? obs?.uncertainty ?? null;
    return {
        elementId,
        parameter: obs?.parameterId || '',
        value: obs?.reading ?? null,
        unit: obs?.unit || '',
        timestamp: obs?.date || '',
        uncertainty: typeof uVal === 'number' ? uVal : null,
    };
}

/**
 * Builds scorer-ready campaign inputs from project elements.
 * Observations without a campaignId are grouped under '__unassigned'.
 *
 * Constroi entradas por campanha a partir dos elementos do projeto.
 */
export function buildCampaignInputs(
    elements: RawElement[],
    campaigns: Array<{ id?: string; name?: string }>,
): Array<{
    id: string;
    name: string;
    elements: Array<{ id: string }>;
    observations: Array<CampaignObservation>;
}> {
    const els = Array.isArray(elements) ? elements : [];
    const camps = Array.isArray(campaigns) ? campaigns : [];

    const grouped: Map<
        string,
        {
            name: string;
            elementIds: Set<string>;
            observations: Array<CampaignObservation>;
        }
    > = new Map();
    const nameById = new Map(camps.map((c) => [c?.id || '', c?.name || c?.id || '']));

    for (const el of els) {
        const elementId = el?.id || '';
        const obsList = Array.isArray(el?.observations) ? el.observations : [];
        for (const obs of obsList) {
            const cid = obs?.campaignId || '__unassigned';
            if (!grouped.has(cid)) {
                grouped.set(cid, {
                    name: nameById.get(cid) || (cid === '__unassigned' ? 'Unassigned' : cid),
                    elementIds: new Set(),
                    observations: [],
                });
            }
            const bucket = grouped.get(cid);
            if (!bucket) continue;
            if (elementId) bucket.elementIds.add(elementId);
            bucket.observations.push(toScorerObservation(obs, elementId));
        }
    }

    return [...grouped.entries()].map(([id, b]) => ({
        id,
        name: b.name,
        elements: [...b.elementIds].map((eid) => ({ id: eid })),
        observations: b.observations,
    }));
}

/**
 * Computes the full data-quality dashboard model for the project.
 * Calcula o modelo completo do painel de qualidade de dados.
 */
export function computeDashboard(
    elements: RawElement[],
    campaigns: Array<{ id?: string; name?: string }>,
): DashboardModel {
    const els = Array.isArray(elements) ? elements : [];
    const totalElements = els.length;
    const inputs = buildCampaignInputs(els, campaigns);

    const rows: CampaignQualityRow[] = [];
    let scoreSum = 0;
    let totalObservations = 0;

    for (const input of inputs) {
        const q = computeCampaignQuality(input, totalElements);
        totalObservations += input.observations.length;
        scoreSum += q.compositeScore;
        rows.push({
            campaignId: input.id,
            campaignName: input.name,
            observationCount: input.observations.length,
            dimensions: q.dimensions,
            compositeScore: q.compositeScore,
            grade: q.grade,
            recommendations: q.recommendations,
        });
    }

    rows.sort((a, b) => b.compositeScore - a.compositeScore);
    const overallScore = rows.length > 0 ? scoreSum / rows.length : 0;

    return {
        rows,
        totalElements,
        totalObservations,
        overallScore,
        overallGrade: gradeScore(overallScore),
    };
}
