// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

export type BiodiversityRiskLevel = 'baixo' | 'moderado' | 'alto' | 'critico';

export interface IntensityParams {
    readonly touceirasPerHa: number;
    readonly polycultureRatio?: number;
    readonly floodplainAreaHa?: number;
}

export interface BiodiversityRiskResult {
    readonly risk: BiodiversityRiskLevel;
    readonly threshold: number;
    readonly mitigation: string;
    readonly intensityRatio: number;
    readonly polycultureEffect: number;
    readonly effectiveDensity: number;
    readonly source: string;
}

export const ECOLOGICAL_THRESHOLD_TOUCEIRAS_PER_HA = 400;
export const MAX_TOUCEIRAS_PER_HA = 1200;
export const POLYCULTURE_MAX_REDUCTION = 0.35;
export const BIODIVERSITY_INDICATOR_VERSION = 1;

const THRESHOLD_SOURCE =
    'Curadoria versionada — Jardim & Anderson (2006) Manejo de acaizais nativos em varzea estuarina; ' +
    'Jardim et al. (2015) Embrapa Amazonia Oriental; Brondizio (2002) acai intensification in Amazon estuary. ' +
    'Limiar 400 touceiras/ha = transicao com >30% perda de riqueza floristica associada (parcelas permanentes).';

const MITIGATION_POLYCULTURE =
    'Policultivo: consorcio acai + especies nativas (andiroba, copaiba, seringueira, palmaceas nao-oleraceae) ' +
    'mantem estratos diversificados e reduz o risco de empobrecimento floristico.';

const MITIGATION_REDUCTION =
    'Reducao da densidade de touceiras para abaixo do limiar ecologico (400/ha) ' +
    'com raleamento seletivo e enriquecimento com especies associadas.';

const MITIGATION_MONITORING =
    'Monitoramento continuo da composicao floristica em parcelas permanentes; ' +
    'manutencao de policultivo acima de 20% da area manejada.';

const MITIGATION_NONE =
    'Densidade dentro da faixa de baixo impacto; manter praticas de manejo sustentavel ' +
    'e monitorar tendencias de densificacao.';

function clampFinite(value: number | null | undefined, min: number, max: number): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return Math.min(max, Math.max(min, value));
}

function riskFromRatio(ratio: number): BiodiversityRiskLevel {
    if (ratio < 0.5) return 'baixo';
    if (ratio < 1.0) return 'moderado';
    if (ratio < 1.5) return 'alto';
    return 'critico';
}

export function assessBiodiversityRisk(params: IntensityParams): BiodiversityRiskResult | null {
    const density = clampFinite(params.touceirasPerHa, 0, MAX_TOUCEIRAS_PER_HA);
    if (density === null) return null;
    const polyRaw = params.polycultureRatio;
    const polycultureRatio = polyRaw === undefined || polyRaw === null ? 0 : clampFinite(polyRaw, 0, 1) ?? 0;
    const polycultureEffect = polycultureRatio * POLYCULTURE_MAX_REDUCTION;
    const effectiveDensity = density * (1 - polycultureEffect);
    const threshold = ECOLOGICAL_THRESHOLD_TOUCEIRAS_PER_HA;
    const intensityRatio = effectiveDensity / threshold;
    const risk = riskFromRatio(intensityRatio);
    const mitigation = risk === 'baixo' ? MITIGATION_NONE : polycultureRatio >= 0.2 ? MITIGATION_POLYCULTURE : risk === 'critico' ? MITIGATION_REDUCTION : MITIGATION_MONITORING;
    return Object.freeze({
        risk, threshold, mitigation,
        intensityRatio: Math.round(intensityRatio * 1000) / 1000,
        polycultureEffect: Math.round(polycultureEffect * 1000) / 1000,
        effectiveDensity: Math.round(effectiveDensity * 100) / 100,
        source: THRESHOLD_SOURCE,
    });
}

export function thresholdStatus(touceirasPerHa: number): { withinThreshold: boolean; margin: number } | null {
    const density = clampFinite(touceirasPerHa, 0, MAX_TOUCEIRAS_PER_HA);
    if (density === null) return null;
    const margin = ECOLOGICAL_THRESHOLD_TOUCEIRAS_PER_HA - density;
    return Object.freeze({ withinThreshold: density <= ECOLOGICAL_THRESHOLD_TOUCEIRAS_PER_HA, margin: Math.round(margin * 100) / 100 });
}