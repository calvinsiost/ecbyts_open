// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   EIS ODS Overlay — SDG/ISSB monitoring pack (SPEC_EIS_ODS_MONITORING_PACK)

   Computa overlay de 17 ODS (Objetivos de Desenvolvimento Sustentável
   ONU) sobre o EIS Weighted. Cada eixo tem impactScore + coverageScore
   + confidenceScore, combinados em finalAxisScore via pesos 0.50/0.30/0.20.

   ods-v2 (2026-04-15): normalizadores + contrato de retorno com 17 eixos
   ODS implementados. Quando nao ha dados elegiveis para um eixo, retorna
   evidenceLevel='none' + notes explicando o fallback.

   Formula canônica:
     finalAxisScore = 0.50*impactScore + 0.30*coverageScore + 0.20*confidenceScore
     composite = média ponderada dos 17 eixos (peso default 1.0)

   Níveis de evidência:
     none — sem elementos e sem leituras elegíveis
     low — cobertura < 0.25 ou confidenceScore < 2.0
     medium — cobertura entre 0.25 e 0.60
     high — cobertura > 0.60 e confidenceScore >= 3.5
   ================================================================ */

export const ODS_VERSION = 'ods-v2';
export const ODS_KEYS = Object.freeze([
    'ODS1',
    'ODS2',
    'ODS3',
    'ODS4',
    'ODS5',
    'ODS6',
    'ODS7',
    'ODS8',
    'ODS9',
    'ODS10',
    'ODS11',
    'ODS12',
    'ODS13',
    'ODS14',
    'ODS15',
    'ODS16',
    'ODS17',
]);

/** Títulos humanos por ODS (PT-BR). Consumer UI pode usar i18n key ods.<id>.title. */
export const ODS_TITLES_PT = Object.freeze({
    ODS1: 'Erradicação da pobreza',
    ODS2: 'Fome zero e agricultura sustentável',
    ODS3: 'Saúde e bem-estar',
    ODS4: 'Educação de qualidade',
    ODS5: 'Igualdade de gênero',
    ODS6: 'Água potável e saneamento',
    ODS7: 'Energia limpa e acessível',
    ODS8: 'Trabalho decente e crescimento econômico',
    ODS9: 'Indústria, inovação e infraestrutura',
    ODS10: 'Redução das desigualdades',
    ODS11: 'Cidades e comunidades sustentáveis',
    ODS12: 'Consumo e produção responsáveis',
    ODS13: 'Ação climática',
    ODS14: 'Vida na água',
    ODS15: 'Vida terrestre',
    ODS16: 'Paz, justiça e instituições eficazes',
    ODS17: 'Parcerias e meios de implementação',
});

/** Títulos humanos por ODS (EN-US). */
export const ODS_TITLES_EN = Object.freeze({
    ODS1: 'No poverty',
    ODS2: 'Zero hunger',
    ODS3: 'Good health and well-being',
    ODS4: 'Quality education',
    ODS5: 'Gender equality',
    ODS6: 'Clean water and sanitation',
    ODS7: 'Affordable and clean energy',
    ODS8: 'Decent work and economic growth',
    ODS9: 'Industry, innovation and infrastructure',
    ODS10: 'Reduced inequalities',
    ODS11: 'Sustainable cities and communities',
    ODS12: 'Responsible consumption and production',
    ODS13: 'Climate action',
    ODS14: 'Life below water',
    ODS15: 'Life on land',
    ODS16: 'Peace, justice and strong institutions',
    ODS17: 'Partnerships for the goals',
});

/** Títulos humanos por ODS (ES-LA). */
export const ODS_TITLES_ES = Object.freeze({
    ODS1: 'Fin de la pobreza',
    ODS2: 'Hambre cero',
    ODS3: 'Salud y bienestar',
    ODS4: 'Educación de calidad',
    ODS5: 'Igualdad de género',
    ODS6: 'Agua limpia y saneamiento',
    ODS7: 'Energía asequible y no contaminante',
    ODS8: 'Trabajo decente y crecimiento económico',
    ODS9: 'Industria, innovación e infraestructura',
    ODS10: 'Reducción de las desigualdades',
    ODS11: 'Ciudades y comunidades sostenibles',
    ODS12: 'Producción y consumo responsables',
    ODS13: 'Acción por el clima',
    ODS14: 'Vida submarina',
    ODS15: 'Vida de ecosistemas terrestres',
    ODS16: 'Paz, justicia e instituciones sólidas',
    ODS17: 'Alianzas para lograr los objetivos',
});

/**
 * Resolver de título por locale — fallback para PT-BR.
 * @param {string} key
 * @param {string} [locale='pt-BR']
 * @returns {string}
 */
export function getOdsTitle(key: string, locale = 'pt-BR'): string {
    const loc = String(locale || '').toLowerCase();
    /** @type {Record<string, string>} */
    const en = ODS_TITLES_EN as Record<string, string>;
    /** @type {Record<string, string>} */
    const es = ODS_TITLES_ES as Record<string, string>;
    /** @type {Record<string, string>} */
    const pt = ODS_TITLES_PT as Record<string, string>;
    if (loc.startsWith('en')) return en[key] || pt[key] || '';
    if (loc.startsWith('es')) return es[key] || pt[key] || '';
    return pt[key] || '';
}

/** Cores oficiais ONU por ODS (usadas nos cards). */
export const ODS_COLORS = Object.freeze({
    ODS1: '#E5243B',
    ODS2: '#DDA63A',
    ODS3: '#4C9F38',
    ODS4: '#C5192D',
    ODS5: '#FF3A21',
    ODS6: '#26BDE2',
    ODS7: '#FCC30B',
    ODS8: '#A21942',
    ODS9: '#FD6925',
    ODS10: '#DD1367',
    ODS11: '#FD9D24',
    ODS12: '#BF8B2E',
    ODS13: '#3F7E44',
    ODS14: '#0A97D9',
    ODS15: '#56C02B',
    ODS16: '#00689D',
    ODS17: '#19486A',
});

const AXIS_WEIGHTS = Object.freeze({
    impact: 0.5,
    coverage: 0.3,
    confidence: 0.2,
});

/**
 * @typedef {Record<string, any>} OdsRecord
 * @typedef {{
 *   coverage: unknown,
 *   confidenceScore: unknown,
 *   eligibleElements: unknown,
 *   eligibleReadings: unknown
 * }} OdsEvidenceInput
 * @typedef {{
 *   totalElements: number,
 *   totalReadings: number,
 *   totalCampaigns: number,
 *   eligibleElements: number,
 *   eligibleReadings: number,
 *   eligibleCampaigns: number
 * }} OdsTotals
 * @typedef {{
 *   traceabilityRatio?: number,
 *   temporalConsistencyRatio?: number,
 *   uncertaintyQualityRatio?: number
 * }} OdsQualityRatios
 * @typedef {{ impactScore: number, coverageScore: number, confidenceScore: number }} OdsAxisScoreInput
 * @typedef {{
 *   score: number | null,
 *   impactScore: number | null,
 *   coverageScore: number | null,
 *   confidenceScore: number | null,
 *   evidenceLevel: string,
 *   eligibleElements: number,
 *   eligibleReadings: number,
 *   eligibleCampaigns: number,
 *   notes: string[]
 * }} OdsAxisResult
 * @typedef {{
 *   elements: OdsRecord[],
 *   readings: OdsRecord[],
 *   campaigns: OdsRecord[],
 *   totals: OdsTotals,
 *   quality: OdsQualityRatios,
 *   contracts?: OdsRecord[],
 *   costCenters?: OdsRecord[],
 *   training?: OdsRecord[],
 *   demographics?: OdsRecord,
 *   work?: OdsRecord,
 *   governance?: OdsRecord,
 *   partnerships?: OdsRecord
 * }} OdsContext
 * @typedef {{
 *   version: string,
 *   enabled: boolean,
 *   composite: number,
 *   coverage: number,
 *   confidence: { score: number, level: string },
 *   axes: Record<string, any>,
 *   totals: Record<string, any>
 * }} OdsOverlayResultShape
 */

// ─── Normalizadores ──────────────────────────────────────────────

/**
 * @param {unknown} x
 * @returns {number}
 */
export function clamp01(x: unknown): number {
    const n = Number(x);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

/**
 * @param {unknown} x
 * @returns {number}
 */
export function to5(x: unknown): number {
    return 5 * clamp01(x);
}

/**
 * @param {unknown} n
 * @param {unknown} d
 * @returns {number}
 */
export function ratioPos(n: unknown, d: unknown): number {
    return Number(n) / Math.max(1, Number(d));
}

/**
 * @param {unknown} n
 * @param {unknown} d
 * @returns {number}
 */
export function ratioInv(n: unknown, d: unknown): number {
    return 1 - ratioPos(n, d);
}

/**
 * @param {unknown} curr
 * @param {unknown} prev
 * @returns {number}
 */
export function trendImprove(curr: unknown, prev: unknown): number {
    const p = Number(prev);
    const c = Number(curr);
    if (!Number.isFinite(p) || !Number.isFinite(c)) return 0;
    return clamp01((p - c) / Math.max(Math.abs(p), 1e-6));
}

// ─── Evidence-level classifier ───────────────────────────────────

interface EvidenceInput {
    coverage: unknown;
    confidenceScore: unknown;
    eligibleElements: unknown;
    eligibleReadings: unknown;
}

/**
 * @param {OdsEvidenceInput} param0
 * @returns {string}
 */
export function classifyEvidenceLevel({ coverage, confidenceScore, eligibleElements, eligibleReadings }: EvidenceInput): string {
    if ((eligibleElements || 0) === 0 && (eligibleReadings || 0) === 0) return 'none';
    const cov = clamp01(coverage);
    const conf = Number(confidenceScore) || 0;
    if (cov < 0.25 || conf < 2.0) return 'low';
    if (cov > 0.6 && conf >= 3.5) return 'high';
    return 'medium';
}

// ─── Axis computation helpers ────────────────────────────────────

interface Totals {
    totalElements: number;
    totalReadings: number;
    totalCampaigns: number;
    eligibleElements: number;
    eligibleReadings: number;
    eligibleCampaigns: number;
}

/**
 * @param {OdsTotals} totals
 * @returns {number}
 */
function _coverageScore(totals: Totals): number {
    const e = ratioPos(totals.eligibleElements, totals.totalElements);
    const r = ratioPos(totals.eligibleReadings, totals.totalReadings);
    const c = ratioPos(totals.eligibleCampaigns, totals.totalCampaigns);
    return to5(0.5 * e + 0.3 * r + 0.2 * c);
}

interface QualityRatios {
    traceabilityRatio: number;
    temporalConsistencyRatio: number;
    uncertaintyQualityRatio: number;
}

/**
 * @param {OdsQualityRatios} param0
 * @returns {number}
 */
function _confidenceScore({ traceabilityRatio = 0, temporalConsistencyRatio = 0, uncertaintyQualityRatio = 0 }: Partial<QualityRatios>): number {
    return to5(0.35 * traceabilityRatio + 0.35 * temporalConsistencyRatio + 0.3 * uncertaintyQualityRatio);
}

interface AxisScoreInput {
    impactScore: number;
    coverageScore: number;
    confidenceScore: number;
}

/**
 * @param {OdsAxisScoreInput} param0
 * @returns {number}
 */
function _finalAxisScore({ impactScore, coverageScore, confidenceScore }: AxisScoreInput): number {
    const v =
        AXIS_WEIGHTS.impact * (impactScore || 0) +
        AXIS_WEIGHTS.coverage * (coverageScore || 0) +
        AXIS_WEIGHTS.confidence * (confidenceScore || 0);
    return Number(v.toFixed(3));
}

interface BlankAxis {
    score: number | null;
    impactScore: number | null;
    coverageScore: number | null;
    confidenceScore: number | null;
    evidenceLevel: string;
    eligibleElements: number;
    eligibleReadings: number;
    eligibleCampaigns: number;
    notes: string[];
}

/**
 * @param {string} [note?]
 * @returns {OdsAxisResult}
 */
function _blankAxis(note?: string): BlankAxis {
    return {
        score: null,
        impactScore: null,
        coverageScore: null,
        confidenceScore: null,
        evidenceLevel: 'none',
        eligibleElements: 0,
        eligibleReadings: 0,
        eligibleCampaigns: 0,
        notes: note ? [note] : [],
    };
}

// ─── Eixos piloto (3 dos 17) ─────────────────────────────────────

interface OdsCtx {
    elements: Array<Record<string, unknown>>;
    readings: Array<Record<string, unknown>>;
    campaigns: Array<Record<string, unknown>>;
    totals: Totals;
    quality: Partial<QualityRatios>;
    contracts?: Array<Record<string, unknown>>;
    costCenters?: Array<Record<string, unknown>>;
    training?: Array<Record<string, unknown>>;
    demographics?: Record<string, unknown> | undefined;
    work?: Record<string, unknown> | undefined;
    governance?: Record<string, unknown> | undefined;
    partnerships?: Record<string, unknown> | undefined;
}

/**
 * @param {OdsContext} ctx
 * @returns {OdsAxisResult}
 */
function _computeODS6(ctx: OdsCtx): BlankAxis {
    const elements = ctx.elements;
    const readings = ctx.readings;
    const campaigns = ctx.campaigns;
    const totals = ctx.totals;
    const quality = ctx.quality;
    // ODS6 Água potável - elementos water_well + groundwater obs
    const waterElements = elements.filter((e) => /well|water|aquifer/i.test(String(e.family || '')));
    const waterReadings = readings.filter((r) => /water|groundwater|gw/i.test(String(r.matrix || '')));
    const eligibleElements = waterElements.length;
    const eligibleReadings = waterReadings.length;
    const eligibleCampaigns = campaigns.filter((c) => waterReadings.some((r) => r.campaignId === c.id)).length;

    if (eligibleElements === 0 && eligibleReadings === 0) {
        return _blankAxis('Nenhum elemento de água ou leitura groundwater elegível.');
    }

    const axisTotals: Totals = {
        totalElements: totals.totalElements,
        totalReadings: totals.totalReadings,
        totalCampaigns: totals.totalCampaigns,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
    };

    // impactScore: proxy - frequência de não-conformidade decrescente é bom
    const ncRatio = ratioPos(
        waterReadings.filter((r) => r.nonConformity === true).length,
        Math.max(1, eligibleReadings),
    );
    const impactScore = to5(1 - ncRatio);
    const coverageScore = _coverageScore(axisTotals);
    const confidenceScore = _confidenceScore(quality);
    const score = _finalAxisScore({ impactScore, coverageScore, confidenceScore });
    const cov = ratioPos(eligibleReadings, totals.totalReadings);
    const evidenceLevel = classifyEvidenceLevel({
        coverage: cov,
        confidenceScore,
        eligibleElements,
        eligibleReadings,
    });

    return {
        score,
        impactScore,
        coverageScore,
        confidenceScore,
        evidenceLevel,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
        notes: [],
    };
}

/**
 * @param {OdsContext} ctx
 * @returns {OdsAxisResult}
 */
function _computeODS13(ctx: OdsCtx): BlankAxis {
    const readings = ctx.readings;
    const totals = ctx.totals;
    const quality = ctx.quality;
    const elements = ctx.elements;
    const campaigns = ctx.campaigns;
    // ODS13 Ação climática - ghg/emissões/temperatura
    const ghgReadings = readings.filter((r) => /co2|ghg|emission|temperature/i.test(String(r.parameter || '')));
    const eligibleReadings = ghgReadings.length;
    const eligibleElements = elements.filter((e) => ghgReadings.some((r) => r.elementId === e.id)).length;
    const eligibleCampaigns = campaigns.filter((c) => ghgReadings.some((r) => r.campaignId === c.id)).length;

    if (eligibleReadings === 0) {
        return _blankAxis('Nenhuma leitura de GHG/emissões/temperatura.');
    }

    const axisTotals: Totals = {
        totalElements: totals.totalElements,
        totalReadings: totals.totalReadings,
        totalCampaigns: totals.totalCampaigns,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
    };

    // impact: tendência de redução nas leituras (trend_improve)
    const values = ghgReadings.map((r) => Number(r.value)).filter(Number.isFinite);
    let impactScore = 2.5; // neutro quando não há histórico
    if (values.length >= 2) {
        const prev = values[0]!;
        const curr = values[values.length - 1]!;
        impactScore = to5(trendImprove(curr, prev));
    }

    const coverageScore = _coverageScore(axisTotals);
    const confidenceScore = _confidenceScore(quality);
    const score = _finalAxisScore({ impactScore, coverageScore, confidenceScore });
    const cov = ratioPos(eligibleReadings, totals.totalReadings);
    const evidenceLevel = classifyEvidenceLevel({
        coverage: cov,
        confidenceScore,
        eligibleElements,
        eligibleReadings,
    });

    return {
        score,
        impactScore,
        coverageScore,
        confidenceScore,
        evidenceLevel,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
        notes: [],
    };
}

/**
 * @param {OdsContext} ctx
 * @returns {OdsAxisResult}
 */
function _computeODS15(ctx: OdsCtx): BlankAxis {
    const elements = ctx.elements;
    const readings = ctx.readings;
    const totals = ctx.totals;
    const quality = ctx.quality;
    const campaigns = ctx.campaigns;
    // (was destructured above)
    void 0;
    // ODS15 Vida terrestre - solo, biodiversidade, cobertura vegetal
    const soilElements = elements.filter((e) => /soil|boundary|vegetation/i.test(String(e.family || '')));
    const soilReadings = readings.filter((r) => /soil|solo/i.test(String(r.matrix || '')));
    const eligibleElements = soilElements.length;
    const eligibleReadings = soilReadings.length;
    const eligibleCampaigns = campaigns.filter((c) => soilReadings.some((r) => r.campaignId === c.id)).length;

    if (eligibleElements === 0 && eligibleReadings === 0) {
        return _blankAxis('Sem elementos de solo ou leituras de matriz soil.');
    }

    const axisTotals: Totals = {
        totalElements: totals.totalElements,
        totalReadings: totals.totalReadings,
        totalCampaigns: totals.totalCampaigns,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
    };

    const ncRatio = ratioPos(
        soilReadings.filter((r) => r.nonConformity === true).length,
        Math.max(1, eligibleReadings),
    );
    const impactScore = to5(1 - ncRatio);
    const coverageScore = _coverageScore(axisTotals);
    const confidenceScore = _confidenceScore(quality);
    const score = _finalAxisScore({ impactScore, coverageScore, confidenceScore });
    const cov = ratioPos(eligibleReadings, totals.totalReadings);
    const evidenceLevel = classifyEvidenceLevel({
        coverage: cov,
        confidenceScore,
        eligibleElements,
        eligibleReadings,
    });

    return {
        score,
        impactScore,
        coverageScore,
        confidenceScore,
        evidenceLevel,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
        notes: [],
    };
}

// ODS3 - Saúde e bem-estar.
// Readings com regulatoryExceedance=true OU nonConformity=true em parâmetros
// toxicológicos (metais, BTEX, PAHs, TPH) sinalizam risco sanitário.
/**
 * @param {OdsContext} ctx
 * @returns {OdsAxisResult}
 */
function _computeODS3(ctx: OdsCtx): BlankAxis {
    const elements = ctx.elements;
    const readings = ctx.readings;
    const campaigns = ctx.campaigns;
    const totals = ctx.totals;
    const quality = ctx.quality;
    const toxParamRx = /benzene|toluene|xylene|lead|mercury|cadmium|arsenic|tph|pah|btex|nickel|chromium/i;
    const toxReadings = readings.filter((r) => toxParamRx.test(String(r.parameter || '')));
    const eligibleReadings = toxReadings.length;
    const eligibleElements = elements.filter((e) => toxReadings.some((r) => r.elementId === e.id)).length;
    const eligibleCampaigns = campaigns.filter((c) => toxReadings.some((r) => r.campaignId === c.id)).length;

    if (eligibleReadings === 0) {
        return _blankAxis('Sem leituras de parâmetros toxicológicos (metais pesados, BTEX, PAH, TPH).');
    }

    const axisTotals: Totals = {
        totalElements: totals.totalElements,
        totalReadings: totals.totalReadings,
        totalCampaigns: totals.totalCampaigns,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
    };

    // impact: quanto menos exceedances/NC, melhor (ratio_inv)
    const exceedRatio = ratioPos(
        toxReadings.filter((r) => r.regulatoryExceedance === true || r.nonConformity === true).length,
        Math.max(1, eligibleReadings),
    );
    const impactScore = to5(1 - exceedRatio);
    const coverageScore = _coverageScore(axisTotals);
    const confidenceScore = _confidenceScore(quality);
    const score = _finalAxisScore({ impactScore, coverageScore, confidenceScore });
    const cov = ratioPos(eligibleReadings, totals.totalReadings);
    const evidenceLevel = classifyEvidenceLevel({
        coverage: cov,
        confidenceScore,
        eligibleElements,
        eligibleReadings,
    });

    return {
        score,
        impactScore,
        coverageScore,
        confidenceScore,
        evidenceLevel,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
        notes: [],
    };
}

// ODS12 - Consumo e produção responsáveis.
// Proxy: elementos de waste/remediation + taxa de fechamento de passivos
// (remediation com status=completed sobre total de waste).
/**
 * @param {OdsContext} ctx
 * @returns {OdsAxisResult}
 */
function _computeODS12(ctx: OdsCtx): BlankAxis {
    const elements = ctx.elements;
    const campaigns = ctx.campaigns;
    const readings = ctx.readings;
    const totals = ctx.totals;
    const quality = ctx.quality;
    void 0;
    const wasteElements = elements.filter((e) => /waste|landfill|disposal/i.test(String(e.family || '')));
    const remediationElements = elements.filter((e) => /remediation|cleanup|treatment/i.test(String(e.family || '')));
    const eligibleElements = wasteElements.length + remediationElements.length;
    const eligibleCampaigns = campaigns.filter((c) =>
        readings.some(
            (r) =>
                r.campaignId === c.id && [...wasteElements, ...remediationElements].some((e) => e.id === r.elementId),
        ),
    ).length;
    const eligibleReadings = readings.filter((r) =>
        [...wasteElements, ...remediationElements].some((e) => e.id === r.elementId),
    ).length;

    if (eligibleElements === 0) {
        return _blankAxis('Sem elementos de waste ou remediation no modelo.');
    }

    const axisTotals: Totals = {
        totalElements: totals.totalElements,
        totalReadings: totals.totalReadings,
        totalCampaigns: totals.totalCampaigns,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
    };

    // impact: fração de remediation completed / waste total (maior = melhor)
    const completedRemediation = remediationElements.filter((e) =>
        /completed|closed|done/i.test(String((e.data as Record<string, unknown>)?.status || e.status || '')),
    ).length;
    const closureRatio = wasteElements.length > 0 ? completedRemediation / Math.max(1, wasteElements.length) : 0;
    const impactScore = to5(closureRatio);
    const coverageScore = _coverageScore(axisTotals);
    const confidenceScore = _confidenceScore(quality);
    const score = _finalAxisScore({ impactScore, coverageScore, confidenceScore });
    const cov = ratioPos(eligibleElements, totals.totalElements);
    const evidenceLevel = classifyEvidenceLevel({
        coverage: cov,
        confidenceScore,
        eligibleElements,
        eligibleReadings,
    });

    return {
        score,
        impactScore,
        coverageScore,
        confidenceScore,
        evidenceLevel,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
        notes: [],
    };
}

// ODS14 - Vida na água (recursos hídricos superficiais).
// Elementos river/lake/spring + readings matrix=surface_water.
/**
 * @param {OdsContext} ctx
 * @returns {OdsAxisResult}
 */
function _computeODS14(ctx: OdsCtx): BlankAxis {
    const elements = ctx.elements;
    const readings = ctx.readings;
    const campaigns = ctx.campaigns;
    const totals = ctx.totals;
    const quality = ctx.quality;
    void 0;
    const surfaceElements = elements.filter((e) => /river|lake|spring|surface/i.test(String(e.family || '')));
    const surfaceReadings = readings.filter((r) => /surface_water|river|lake/i.test(String(r.matrix || '')));
    const eligibleElements = surfaceElements.length;
    const eligibleReadings = surfaceReadings.length;
    const eligibleCampaigns = campaigns.filter((c) => surfaceReadings.some((r) => r.campaignId === c.id)).length;

    if (eligibleElements === 0 && eligibleReadings === 0) {
        return _blankAxis('Sem corpos de água superficial (river/lake/spring) ou matrix=surface_water.');
    }

    const axisTotals: Totals = {
        totalElements: totals.totalElements,
        totalReadings: totals.totalReadings,
        totalCampaigns: totals.totalCampaigns,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
    };

    const ncRatio = ratioPos(
        surfaceReadings.filter((r) => r.nonConformity === true || r.regulatoryExceedance === true).length,
        Math.max(1, eligibleReadings),
    );
    const impactScore = to5(1 - ncRatio);
    const coverageScore = _coverageScore(axisTotals);
    const confidenceScore = _confidenceScore(quality);
    const score = _finalAxisScore({ impactScore, coverageScore, confidenceScore });
    const cov = ratioPos(eligibleReadings, totals.totalReadings);
    const evidenceLevel = classifyEvidenceLevel({
        coverage: cov,
        confidenceScore,
        eligibleElements,
        eligibleReadings,
    });

    return {
        score,
        impactScore,
        coverageScore,
        confidenceScore,
        evidenceLevel,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
        notes: [],
    };
}

// ODS7 - Energia limpa e acessível.
// Proxy: elementos com energia declarada (renewable/fossil). Impact por
// fração de renewable sobre total de fontes de energia.
/**
 * @param {OdsContext} ctx
 * @returns {OdsAxisResult}
 */
function _computeODS7(ctx: OdsCtx): BlankAxis {
    const elements = ctx.elements;
    const readings = ctx.readings;
    const campaigns = ctx.campaigns;
    const totals = ctx.totals;
    const quality = ctx.quality;
    void 0;
    const energyElements = elements.filter((e) =>
        /energy|power|solar|wind|hydro|generator|fossil|turbine/i.test(String(e.family || '')),
    );
    if (energyElements.length === 0) {
        return _blankAxis('Sem elementos de energia (solar/wind/hydro/fossil/generator).');
    }
    const renewableElements = energyElements.filter((e) =>
        /solar|wind|hydro|renewable|green/i.test(`${e.family || ''} ${(e.data as Record<string, unknown>)?.source || ''}`),
    );
    const eligibleElements = energyElements.length;
    const eligibleReadings = readings.filter((r) => energyElements.some((e) => e.id === r.elementId)).length;
    const eligibleCampaigns = campaigns.filter((c) =>
        readings.some((r) => r.campaignId === c.id && energyElements.some((e) => e.id === r.elementId)),
    ).length;

    const axisTotals: Totals = {
        totalElements: totals.totalElements,
        totalReadings: totals.totalReadings,
        totalCampaigns: totals.totalCampaigns,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
    };

    const renewRatio = renewableElements.length / Math.max(1, energyElements.length);
    const impactScore = to5(renewRatio);
    const coverageScore = _coverageScore(axisTotals);
    const confidenceScore = _confidenceScore(quality);
    const score = _finalAxisScore({ impactScore, coverageScore, confidenceScore });
    const cov = ratioPos(eligibleElements, totals.totalElements);
    const evidenceLevel = classifyEvidenceLevel({
        coverage: cov,
        confidenceScore,
        eligibleElements,
        eligibleReadings,
    });

    return {
        score,
        impactScore,
        coverageScore,
        confidenceScore,
        evidenceLevel,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
        notes: [],
    };
}

// ODS9 - Indústria, inovação e infraestrutura.
// Proxy: fração de elementos com telemetria IoT / sensor ativo, sobre total.
/**
 * @param {OdsContext} ctx
 * @returns {OdsAxisResult}
 */
function _computeODS9(ctx: OdsCtx): BlankAxis {
    const elements = ctx.elements;
    const readings = ctx.readings;
    const campaigns = ctx.campaigns;
    const totals = ctx.totals;
    const quality = ctx.quality;
    if (elements.length === 0) return _blankAxis('Sem elementos no modelo.');
    const iotElements = elements.filter(
        (e) =>
            (e.data as Record<string, unknown>)?.iot === true ||
            (e.data as Record<string, unknown>)?.hasSensor === true ||
            e.sensor === true ||
            /sensor|iot|telemetry/i.test(String(e.family || '')),
    );
    if (iotElements.length === 0) {
        return _blankAxis('Nenhum elemento com telemetria IoT / sensor ativo.');
    }
    const eligibleElements = iotElements.length;
    const eligibleReadings = readings.filter((r) => iotElements.some((e) => e.id === r.elementId)).length;
    const eligibleCampaigns = campaigns.filter((c) =>
        readings.some((r) => r.campaignId === c.id && iotElements.some((e) => e.id === r.elementId)),
    ).length;

    const axisTotals: Totals = {
        totalElements: totals.totalElements,
        totalReadings: totals.totalReadings,
        totalCampaigns: totals.totalCampaigns,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
    };

    const iotFraction = ratioPos(iotElements.length, Math.max(1, elements.length));
    const impactScore = to5(iotFraction);
    const coverageScore = _coverageScore(axisTotals);
    const confidenceScore = _confidenceScore(quality);
    const score = _finalAxisScore({ impactScore, coverageScore, confidenceScore });
    const cov = ratioPos(eligibleElements, totals.totalElements);
    const evidenceLevel = classifyEvidenceLevel({
        coverage: cov,
        confidenceScore,
        eligibleElements,
        eligibleReadings,
    });

    return {
        score,
        impactScore,
        coverageScore,
        confidenceScore,
        evidenceLevel,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
        notes: [],
    };
}

// ODS11 - Cidades e comunidades sustentáveis.
// Proxy: elementos residenciais/urbanos (building/residence/school/hospital)
// + air quality. Impact via ratio_inv(exceedance air) quando há dados urbanos.
/**
 * @param {OdsContext} ctx
 * @returns {OdsAxisResult}
 */
function _computeODS11(ctx: OdsCtx): BlankAxis {
    const elements = ctx.elements;
    const readings = ctx.readings;
    const campaigns = ctx.campaigns;
    const totals = ctx.totals;
    const quality = ctx.quality;
    void 0;
    const urbanElements = elements.filter((e) =>
        /building|residence|school|hospital|urban|community|housing/i.test(String(e.family || '')),
    );
    const airReadings = readings.filter((r) =>
        /air|ambient|pm10|pm2\.?5|no2|so2|ozone/i.test(`${r.matrix || ''} ${r.parameter || ''}`),
    );
    const eligibleElements = urbanElements.length;
    const eligibleReadings = airReadings.length;
    const eligibleCampaigns = campaigns.filter((c) => airReadings.some((r) => r.campaignId === c.id)).length;

    if (eligibleElements === 0 && eligibleReadings === 0) {
        return _blankAxis('Sem elementos urbanos (building/school/hospital) nem leituras de ar ambiente.');
    }

    const axisTotals: Totals = {
        totalElements: totals.totalElements,
        totalReadings: totals.totalReadings,
        totalCampaigns: totals.totalCampaigns,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
    };

    const exceedRatio = ratioPos(
        airReadings.filter((r) => r.regulatoryExceedance === true || r.nonConformity === true).length,
        Math.max(1, eligibleReadings || 1),
    );
    const impactScore = to5(1 - exceedRatio);
    const coverageScore = _coverageScore(axisTotals);
    const confidenceScore = _confidenceScore(quality);
    const score = _finalAxisScore({ impactScore, coverageScore, confidenceScore });
    const cov = ratioPos(eligibleReadings, totals.totalReadings || 1);
    const evidenceLevel = classifyEvidenceLevel({
        coverage: cov,
        confidenceScore,
        eligibleElements,
        eligibleReadings,
    });

    return {
        score,
        impactScore,
        coverageScore,
        confidenceScore,
        evidenceLevel,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
        notes: [],
    };
}

// ODS1 - Erradicação da pobreza (SPEC §5.ODS1).
// KPIs materiais:
//   social_invest_ratio = social_investment / total_investment
//   vulnerable_area_coverage = actions_in_vulnerable_areas / total_actions
//   impactScore = to5(0.6*social_invest + 0.4*vulnerable_coverage)
// Sinais: cost_centers/contracts com socialClassification, elements em áreas vulneráveis.
/**
 * @param {OdsContext} ctx
 * @returns {OdsAxisResult}
 */
function _computeODS1(ctx: OdsCtx): BlankAxis {
    const elements = ctx.elements;
    const readings = ctx.readings;
    const campaigns = ctx.campaigns;
    const totals = ctx.totals;
    const quality = ctx.quality;
    const contracts = ctx.contracts || [];
    const costCenters = ctx.costCenters || [];
    void 0;
    const safeContracts = Array.isArray(contracts) ? contracts : [];
    const safeCostCenters = Array.isArray(costCenters) ? costCenters : [];
    const socialContracts = safeContracts.filter(
        (c) =>
            c?.social === true || /social|community|vulnerable/i.test(String(c?.classification || c?.category || '')),
    );
    const socialCostCenters = safeCostCenters.filter(
        (c) => c?.social === true || /social|community/i.test(String(c?.category || c?.classification || '')),
    );

    const totalInvestment =
        safeContracts.reduce((s, c) => s + (Number(c?.value || c?.amount) || 0), 0) +
        safeCostCenters.reduce((s, c) => s + (Number(c?.budget || 0) || 0), 0);
    const socialInvestment =
        socialContracts.reduce((s, c) => s + (Number(c?.value || c?.amount) || 0), 0) +
        socialCostCenters.reduce((s, c) => s + (Number(c?.budget || 0) || 0), 0);
    const socialInvestRatio = totalInvestment > 0 ? socialInvestment / totalInvestment : 0;

    const vulnElements = elements.filter(
        (e) =>
            (e.data as Record<string, unknown>)?.vulnerable === true ||
            /vulnerable|low_income|community/i.test(String((e.area as Record<string, unknown>)?.classification || (e.data as Record<string, unknown>)?.areaClass || '')),
    );
    const vulnerableCoverage = elements.length > 0 ? vulnElements.length / elements.length : 0;

    const hasAnySignal = socialContracts.length + socialCostCenters.length + vulnElements.length > 0;
    if (!hasAnySignal) {
        return _blankAxis('Sem classificação social em contratos/cost centers nem elementos em áreas vulneráveis.');
    }

    const eligibleElements = vulnElements.length;
    const eligibleReadings = readings.filter((r) => vulnElements.some((e) => e.id === r.elementId)).length;
    const eligibleCampaigns = campaigns.filter((c) =>
        readings.some((r) => r.campaignId === c.id && vulnElements.some((e) => e.id === r.elementId)),
    ).length;

    const axisTotals: Totals = {
        totalElements: totals.totalElements,
        totalReadings: totals.totalReadings,
        totalCampaigns: totals.totalCampaigns,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
    };

    const impactScore = to5(0.6 * socialInvestRatio + 0.4 * vulnerableCoverage);
    const coverageScore = _coverageScore(axisTotals);
    const confidenceScore = _confidenceScore(quality);
    const score = _finalAxisScore({ impactScore, coverageScore, confidenceScore });
    const cov = ratioPos(eligibleElements, totals.totalElements || 1);
    const evidenceLevel = classifyEvidenceLevel({
        coverage: cov,
        confidenceScore,
        eligibleElements: Math.max(eligibleElements, socialContracts.length),
        eligibleReadings,
    });

    return {
        score,
        impactScore,
        coverageScore,
        confidenceScore,
        evidenceLevel,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
        notes: [],
    };
}

// ODS2 - Fome zero e agricultura sustentável (SPEC §5.ODS2).
// KPIs:
//   water_compliance = ratio_pos(readings_in_range, critical_readings)
//   soil_quality = ratio_pos(soil_readings_in_range, soil_readings_total)
//   impactScore = to5(0.5*water + 0.5*soil)
/**
 * @param {OdsContext} ctx
 * @returns {OdsAxisResult}
 */
function _computeODS2(ctx: OdsCtx): BlankAxis {
    const elements = ctx.elements;
    const readings = ctx.readings;
    const campaigns = ctx.campaigns;
    const totals = ctx.totals;
    const quality = ctx.quality;
    void 0;
    const agriElements = elements.filter(
        (e) =>
            (e.data as Record<string, unknown>)?.agricultural === true ||
            /agri|crop|farm|cultivation|pasture/i.test(String((e.data as Record<string, unknown>)?.landUse || e.family || '')),
    );
    if (agriElements.length === 0) {
        return _blankAxis('Nenhum elemento com classificação agrícola (data.agricultural ou landUse agri/crop/farm).');
    }

    const agriIds = new Set(agriElements.map((e) => e.id));
    const agriReadings = readings.filter((r) => agriIds.has(r.elementId as string));
    const waterReadings = agriReadings.filter((r) => /water|groundwater|surface_water/i.test(String(r.matrix || '')));
    const soilReadings = agriReadings.filter((r) => /soil|solo/i.test(String(r.matrix || '')));

    const waterCompliance =
        waterReadings.length > 0
            ? waterReadings.filter((r) => !(r.regulatoryExceedance === true || r.nonConformity === true)).length /
              waterReadings.length
            : 0;
    const soilCompliance =
        soilReadings.length > 0
            ? soilReadings.filter((r) => !(r.regulatoryExceedance === true || r.nonConformity === true)).length /
              soilReadings.length
            : 0;

    const eligibleElements = agriElements.length;
    const eligibleReadings = agriReadings.length;
    const eligibleCampaigns = campaigns.filter((c) => agriReadings.some((r) => r.campaignId === c.id)).length;

    const axisTotals: Totals = {
        totalElements: totals.totalElements,
        totalReadings: totals.totalReadings,
        totalCampaigns: totals.totalCampaigns,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
    };

    const impactScore = to5(0.5 * waterCompliance + 0.5 * soilCompliance);
    const coverageScore = _coverageScore(axisTotals);
    const confidenceScore = _confidenceScore(quality);
    const score = _finalAxisScore({ impactScore, coverageScore, confidenceScore });
    const cov = ratioPos(eligibleReadings, totals.totalReadings || 1);
    const evidenceLevel = classifyEvidenceLevel({
        coverage: cov,
        confidenceScore,
        eligibleElements,
        eligibleReadings,
    });

    return {
        score,
        impactScore,
        coverageScore,
        confidenceScore,
        evidenceLevel,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
        notes: [],
    };
}

// ODS4 - Educação de qualidade (SPEC §5.ODS4).
// KPIs:
//   training_hours_ratio = trained_hours / planned_training_hours
//   training_completion = completed_trainings / planned_trainings
//   impactScore = to5(0.5*hours + 0.5*completion)
// Sinais: training em input.training = [{plannedHours, trainedHours, status}]
/**
 * @param {OdsContext} ctx
 * @returns {OdsAxisResult}
 */
function _computeODS4(ctx: OdsCtx): BlankAxis {
    const totals = ctx.totals;
    const quality = ctx.quality;
    const training = ctx.training || [];
    void 0;
    const safeTraining = Array.isArray(training) ? training : [];
    if (safeTraining.length === 0) {
        return _blankAxis('Sem registros de treinamento (input.training vazio — SPEC §5.ODS4).');
    }

    const plannedHours = safeTraining.reduce((s, t) => s + (Number(t?.plannedHours) || 0), 0);
    const trainedHours = safeTraining.reduce((s, t) => s + (Number(t?.trainedHours) || 0), 0);
    const plannedCount = safeTraining.length;
    const completedCount = safeTraining.filter((t) => /completed|done|closed/i.test(String(t?.status || ''))).length;

    const hoursRatio = plannedHours > 0 ? Math.min(1, trainedHours / plannedHours) : 0;
    const completionRatio = plannedCount > 0 ? completedCount / plannedCount : 0;

    // Eligibility proxy: cada training conta como 1 "elemento" de treinamento
    const eligibleElements = safeTraining.length;
    const eligibleReadings = 0; // treinamento não gera reading de matriz ambiental
    const eligibleCampaigns = 0;

    const axisTotals: Totals = {
        totalElements: Math.max(totals.totalElements, eligibleElements),
        totalReadings: totals.totalReadings,
        totalCampaigns: totals.totalCampaigns,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
    };

    const impactScore = to5(0.5 * hoursRatio + 0.5 * completionRatio);
    const coverageScore = _coverageScore(axisTotals);
    const confidenceScore = _confidenceScore(quality);
    const score = _finalAxisScore({ impactScore, coverageScore, confidenceScore });
    const cov = ratioPos(eligibleElements, Math.max(1, totals.totalElements || eligibleElements));
    const evidenceLevel = classifyEvidenceLevel({
        coverage: cov,
        confidenceScore,
        eligibleElements,
        eligibleReadings: eligibleElements, // usa training count como proxy
    });

    return {
        score,
        impactScore,
        coverageScore,
        confidenceScore,
        evidenceLevel,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
        notes: [],
    };
}

// ODS5 - Igualdade de gênero (SPEC §5.ODS5).
// KPIs: representation_balance + progress (trend).
// Sinais: input.demographics = { targetRatio, observedRatio, gapPrev? }
/**
 * @param {OdsContext} ctx
 * @returns {OdsAxisResult}
 */
function _computeODS5(ctx: OdsCtx): BlankAxis {
    const totals = ctx.totals;
    const quality = ctx.quality;
    const demographics = ctx.demographics;
    void 0;
    const demo = demographics || {};
    const obs = Number(demo.observedRatio);
    const tgt = Number(demo.targetRatio ?? 0.5); // paridade default 50/50
    if (!Number.isFinite(obs)) {
        return _blankAxis('Sem dado demográfico (input.demographics.observedRatio ausente).');
    }
    const balance = 1 - Math.min(1, Math.abs(tgt - obs));
    const progress = Number.isFinite(demo.gapPrev)
        ? trendImprove(Math.abs(tgt - obs), Math.abs(tgt - Number(demo.gapPrev)))
        : 0;
    const impactScore = to5(0.7 * balance + 0.3 * progress);
    const coverageScore = _coverageScore({
        ...totals,
        eligibleElements: 1,
        eligibleReadings: 0,
        eligibleCampaigns: 0,
    });
    const confidenceScore = _confidenceScore(quality);
    const score = _finalAxisScore({ impactScore, coverageScore, confidenceScore });
    const evidenceLevel = classifyEvidenceLevel({
        coverage: 0.5, // demografia é amostral, não correlaciona com readings de matriz
        confidenceScore,
        eligibleElements: 1,
        eligibleReadings: 1,
    });
    return {
        score,
        impactScore,
        coverageScore,
        confidenceScore,
        evidenceLevel,
        eligibleElements: 1,
        eligibleReadings: 0,
        eligibleCampaigns: 0,
        notes: [],
    };
}

// ODS8 - Trabalho decente e crescimento econômico (SPEC §5.ODS8).
// KPIs: productivity + safe_work + cost_efficiency.
// Sinais: input.work = { outputDelivered, outputPlanned, criticalIncidents,
//                        workforceSize, actualCost, budgetCost }
/**
 * @param {OdsContext} ctx
 * @returns {OdsAxisResult}
 */
function _computeODS8(ctx: OdsCtx): BlankAxis {
    const totals = ctx.totals;
    const quality = ctx.quality;
    const work = ctx.work;
    void 0;
    const w = (work || {}) as Record<string, unknown>;
    const hasAnySignal =
        Number.isFinite(w.outputDelivered) || Number.isFinite(w.criticalIncidents) || Number.isFinite(w.actualCost);
    if (!hasAnySignal) {
        return _blankAxis('Sem input.work (productivity, incidents, cost).');
    }
    const prod =
        Number.isFinite(w.outputDelivered) && Number.isFinite(w.outputPlanned)
            ? ratioPos(Number(w.outputDelivered), Math.max(1, Number(w.outputPlanned)))
            : 0;
    const safe =
        Number.isFinite(w.criticalIncidents) && Number.isFinite(w.workforceSize)
            ? ratioInv(Number(w.criticalIncidents), Math.max(1, Number(w.workforceSize)))
            : 0;
    const costEff =
        Number.isFinite(w.actualCost) && Number.isFinite(w.budgetCost) && Number(w.budgetCost) > 0
            ? clamp01(1 - Number(w.actualCost) / Number(w.budgetCost) + 1) - 0 // higher budget compliance = better
            : 0;
    const impactScore = to5(0.4 * clamp01(prod) + 0.3 * clamp01(safe) + 0.3 * clamp01(costEff));
    const coverageScore = _coverageScore({
        ...totals,
        eligibleElements: 1,
        eligibleReadings: 0,
        eligibleCampaigns: totals.totalCampaigns,
    });
    const confidenceScore = _confidenceScore(quality);
    const score = _finalAxisScore({ impactScore, coverageScore, confidenceScore });
    const evidenceLevel = classifyEvidenceLevel({
        coverage: 0.5,
        confidenceScore,
        eligibleElements: 1,
        eligibleReadings: 1,
    });
    return {
        score,
        impactScore,
        coverageScore,
        confidenceScore,
        evidenceLevel,
        eligibleElements: 1,
        eligibleReadings: 0,
        eligibleCampaigns: totals.totalCampaigns,
        notes: [],
    };
}

// ODS10 - Redução das desigualdades (SPEC §5.ODS10).
// KPIs: coverage_equity + investment_equity via gini.
// Sinais: elements com data.area = identificador territorial.
/**
 * @param {OdsContext} ctx
 * @returns {OdsAxisResult}
 */
function _computeODS10(ctx: OdsCtx): BlankAxis {
    const elements = ctx.elements;
    const readings = ctx.readings;
    const campaigns = ctx.campaigns;
    const totals = ctx.totals;
    const quality = ctx.quality;
    const costCenters = ctx.costCenters || [];
    void 0;
    const areas = new Set(elements.map((e) => (e.data as Record<string, unknown>)?.area || (e.area as Record<string, unknown>)?.id).filter(Boolean));
    if (areas.size < 2) {
        return _blankAxis('Sem taxonomia territorial (elements[].data.area ausente ou única).');
    }
    // Readings por área
    /** @type {Record<string, number>} */
    const readingsPerArea: Record<string, number> = {};
    for (const a of areas) readingsPerArea[a as string] = 0;
    for (const r of readings) {
        const el = elements.find((e) => e.id === r.elementId);
        const a = (el?.data as Record<string, unknown>)?.area || (el?.area as Record<string, unknown>)?.id;
        if (a && readingsPerArea[a as string] != null) readingsPerArea[a as string] = (readingsPerArea[a as string] || 0) + 1;
    }
    // Investment per area (cost centers carregam area?)
    /** @type {Record<string, number>} */
    const investPerArea: Record<string, number> = {};
    for (const a of areas) investPerArea[a as string] = 0;
    for (const cc of Array.isArray(costCenters) ? costCenters : []) {
        const a = (cc as Record<string, unknown>)?.area || ((cc as Record<string, unknown>)?.data as Record<string, unknown>)?.area;
        if (a && investPerArea[a as string] != null) investPerArea[a as string] = (investPerArea[a as string] || 0) + Number((cc as Record<string, unknown>)?.budget || 0);
    }

    const coverageEquity = 1 - _gini(Object.values(readingsPerArea));
    const investmentEquity = 1 - _gini(Object.values(investPerArea));
    const impactScore = to5(0.5 * coverageEquity + 0.5 * investmentEquity);

    const eligibleElements = elements.filter((e) => (e.data as Record<string, unknown>)?.area || (e.area as Record<string, unknown>)?.id).length;
    const eligibleReadings = readings.filter((r) => {
        const el = elements.find((e) => e.id === r.elementId);
        return (el?.data as Record<string, unknown>)?.area || (el?.area as Record<string, unknown>)?.id;
    }).length;
    const eligibleCampaigns = campaigns.filter((c) => readings.some((r) => r.campaignId === c.id)).length;

    const coverageScore = _coverageScore({
        ...totals,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
    });
    const confidenceScore = _confidenceScore(quality);
    const score = _finalAxisScore({ impactScore, coverageScore, confidenceScore });
    const cov = ratioPos(eligibleElements, totals.totalElements || 1);
    const evidenceLevel = classifyEvidenceLevel({
        coverage: cov,
        confidenceScore,
        eligibleElements,
        eligibleReadings,
    });
    return {
        score,
        impactScore,
        coverageScore,
        confidenceScore,
        evidenceLevel,
        eligibleElements,
        eligibleReadings,
        eligibleCampaigns,
        notes: [],
    };
}

// Gini coefficient (0 = equidade perfeita, 1 = desigualdade máxima).
/**
 * @param {unknown[]} values
 * @returns {number}
 */
function _gini(values: unknown[]): number {
    const v = (values || [])
        .map(Number)
        .filter(Number.isFinite)
        .filter((x) => x >= 0);
    if (v.length === 0) return 0;
    const n = v.length;
    const sum = v.reduce((s, x) => s + x, 0);
    if (sum === 0) return 0;
    v.sort((a, b) => a - b);
    let num = 0;
    for (let i = 0; i < n; i++) num += (2 * (i + 1) - n - 1) * v[i]!;
    return Math.abs(num) / (n * sum);
}

// ODS16 - Paz, justiça e instituições (SPEC §5.ODS16).
// KPIs: traceability + governance_incidents.
// Sinais: input.governance = { recordsWithAudit, recordsTotal, unresolvedIncidents, incidentsTotal }
/**
 * @param {OdsContext} ctx
 * @returns {OdsAxisResult}
 */
function _computeODS16(ctx: OdsCtx): BlankAxis {
    const totals = ctx.totals;
    const quality = ctx.quality;
    const governance = ctx.governance;
    void 0;
    const g = (governance || {}) as Record<string, unknown>;
    const hasAnySignal = Number.isFinite(g.recordsTotal) || Number.isFinite(g.incidentsTotal);
    if (!hasAnySignal) {
        return _blankAxis('Sem input.governance (audit trail, incidentes).');
    }
    const traceability =
        Number.isFinite(g.recordsWithAudit) && Number.isFinite(g.recordsTotal) && Number(g.recordsTotal) > 0
            ? ratioPos(Number(g.recordsWithAudit), Number(g.recordsTotal))
            : 0;
    const govHealth =
        Number.isFinite(g.unresolvedIncidents) && Number.isFinite(g.incidentsTotal) && Number(g.incidentsTotal) > 0
            ? ratioInv(Number(g.unresolvedIncidents), Number(g.incidentsTotal))
            : 1; // sem incidentes reportados = bom
    const impactScore = to5(0.7 * clamp01(traceability) + 0.3 * clamp01(govHealth));
    const coverageScore = _coverageScore({
        ...totals,
        eligibleElements: 1,
        eligibleReadings: 0,
        eligibleCampaigns: 0,
    });
    const confidenceScore = _confidenceScore(quality);
    const score = _finalAxisScore({ impactScore, coverageScore, confidenceScore });
    const evidenceLevel = classifyEvidenceLevel({
        coverage: 0.5,
        confidenceScore,
        eligibleElements: 1,
        eligibleReadings: 1,
    });
    return {
        score,
        impactScore,
        coverageScore,
        confidenceScore,
        evidenceLevel,
        eligibleElements: 1,
        eligibleReadings: 0,
        eligibleCampaigns: 0,
        notes: [],
    };
}

// ODS17 - Parcerias e meios de implementação (SPEC §5.ODS17).
// KPIs: partnership_execution + interoperability.
// Sinais: input.partnerships = { sharedDeliverablesCompleted, sharedDeliverablesTotal,
//                                integrationsActive, integrationsExpected }
/**
 * @param {OdsContext} ctx
 * @returns {OdsAxisResult}
 */
function _computeODS17(ctx: OdsCtx): BlankAxis {
    const totals = ctx.totals;
    const quality = ctx.quality;
    const partnerships = ctx.partnerships;
    void 0;
    const p = (partnerships || {}) as Record<string, unknown>;
    const hasAnySignal = Number.isFinite(p.sharedDeliverablesTotal) || Number.isFinite(p.integrationsExpected);
    if (!hasAnySignal) {
        return _blankAxis('Sem input.partnerships (entregáveis compartilhados, integrações).');
    }
    const execution =
        Number.isFinite(p.sharedDeliverablesCompleted) &&
        Number.isFinite(p.sharedDeliverablesTotal) &&
        Number(p.sharedDeliverablesTotal) > 0
            ? ratioPos(Number(p.sharedDeliverablesCompleted), Number(p.sharedDeliverablesTotal))
            : 0;
    const interop =
        Number.isFinite(p.integrationsActive) && Number.isFinite(p.integrationsExpected) && Number(p.integrationsExpected) > 0
            ? ratioPos(Number(p.integrationsActive), Number(p.integrationsExpected))
            : 0;
    const impactScore = to5(0.5 * clamp01(execution) + 0.5 * clamp01(interop));
    const coverageScore = _coverageScore({
        ...totals,
        eligibleElements: 1,
        eligibleReadings: 0,
        eligibleCampaigns: 0,
    });
    const confidenceScore = _confidenceScore(quality);
    const score = _finalAxisScore({ impactScore, coverageScore, confidenceScore });
    const evidenceLevel = classifyEvidenceLevel({
        coverage: 0.5,
        confidenceScore,
        eligibleElements: 1,
        eligibleReadings: 1,
    });
    return {
        score,
        impactScore,
        coverageScore,
        confidenceScore,
        evidenceLevel,
        eligibleElements: 1,
        eligibleReadings: 0,
        eligibleCampaigns: 0,
        notes: [],
    };
}

/** @type {Readonly<Record<string, (ctx: OdsContext) => OdsAxisResult>>} */
const PILOT_COMPUTERS = Object.freeze({
    ODS1: _computeODS1,
    ODS2: _computeODS2,
    ODS3: _computeODS3,
    ODS4: _computeODS4,
    ODS5: _computeODS5,
    ODS6: _computeODS6,
    ODS7: _computeODS7,
    ODS8: _computeODS8,
    ODS9: _computeODS9,
    ODS10: _computeODS10,
    ODS11: _computeODS11,
    ODS12: _computeODS12,
    ODS13: _computeODS13,
    ODS14: _computeODS14,
    ODS15: _computeODS15,
    ODS16: _computeODS16,
    ODS17: _computeODS17,
});

// ─── Public API ──────────────────────────────────────────────────

interface OdsOverlayResult {
    version: string;
    enabled: boolean;
    composite: number;
    coverage: number;
    confidence: { score: number; level: string };
    axes: Record<string, unknown>;
    totals: Record<string, unknown>;
}

/**
 * Computa overlay ODS sobre entrada normalizada do modelo.
 * @param {any} [input={}]
 * @param {any} [arg2]
 * @param {any} [arg3]
 * @param {any} [arg4]
 * @returns {OdsOverlayResultShape}
 */
export function computeOdsOverlay(
    input: unknown = {},
    arg2?: unknown,
    arg3?: unknown,
    arg4?: unknown,
): OdsOverlayResult {
    // Backward-compat: aceitar assinatura posicional (elements, readings, campaigns [, opts])
    // usada por snapshotEngine legado. Detectamos pela forma do input.
    let elements: Array<Record<string, unknown>>;
    let readings: Array<Record<string, unknown>>;
    let campaigns: Array<Record<string, unknown>>;
    let quality: Partial<QualityRatios>;
    let weights: Record<string, number>;
    let contracts: Array<Record<string, unknown>> = [];
    let costCenters: Array<Record<string, unknown>> = [];
    let training: Array<Record<string, unknown>> = [];
    let demographics: Record<string, unknown> | null = null;
    let work: Record<string, unknown> | null = null;
    let governance: Record<string, unknown> | null = null;
    let partnerships: Record<string, unknown> | null = null;
    if (Array.isArray(input)) {
        elements = input;
        readings = Array.isArray(arg2) ? arg2 as Array<Record<string, unknown>> : [];
        campaigns = Array.isArray(arg3) ? arg3 as Array<Record<string, unknown>> : [];
        quality = (arg4 && (arg4 as Record<string, unknown>).quality) as Partial<QualityRatios> || {};
        weights = (arg4 && (arg4 as Record<string, unknown>).weights) as Record<string, number> || {};
    } else {
        const opts = (arg2 || {}) as Record<string, unknown>;
        elements = Array.isArray((input as Record<string, unknown>).elements) ? (input as Record<string, unknown>).elements as Array<Record<string, unknown>> : [];
        readings = Array.isArray((input as Record<string, unknown>).readings)
            ? (input as Record<string, unknown>).readings as Array<Record<string, unknown>>
            : Array.isArray((input as Record<string, unknown>).observations)
              ? (input as Record<string, unknown>).observations as Array<Record<string, unknown>>
              : [];
        campaigns = Array.isArray((input as Record<string, unknown>).campaigns) ? (input as Record<string, unknown>).campaigns as Array<Record<string, unknown>> : [];
        quality = ((input as Record<string, unknown>).quality as Partial<QualityRatios>) || {};
        weights = (opts.weights as Record<string, number>) || {};
        // Sinais adicionais para ODS1/ODS4 (SPEC §5)
        contracts = Array.isArray((input as Record<string, unknown>).contracts) ? (input as Record<string, unknown>).contracts as Array<Record<string, unknown>> : [];
        costCenters = Array.isArray((input as Record<string, unknown>).costCenters) ? (input as Record<string, unknown>).costCenters as Array<Record<string, unknown>> : [];
        training = Array.isArray((input as Record<string, unknown>).training) ? (input as Record<string, unknown>).training as Array<Record<string, unknown>> : [];
        demographics = (input as Record<string, unknown>).demographics as Record<string, unknown> || null;
        work = (input as Record<string, unknown>).work as Record<string, unknown> || null;
        governance = (input as Record<string, unknown>).governance as Record<string, unknown> || null;
        partnerships = (input as Record<string, unknown>).partnerships as Record<string, unknown> || null;
    }

    const totals: Totals = {
        totalElements: elements.length,
        totalReadings: readings.length,
        totalCampaigns: campaigns.length,
        eligibleElements: 0,
        eligibleReadings: 0,
        eligibleCampaigns: 0,
    };

    /** @type {Record<string, OdsAxisResult>} */
    const rawAxes: Record<string, unknown> = {};
    /** @type {Record<string, any>} */
    const axes: Record<string, unknown> = {};
    const ctx: OdsCtx = {
        elements,
        readings,
        campaigns,
        totals,
        quality,
        contracts,
        costCenters,
        training,
        ...(demographics ? { demographics } : {}),
        ...(work ? { work } : {}),
        ...(governance ? { governance } : {}),
        ...(partnerships ? { partnerships } : {}),
    };
    /** @type {Record<string, (ctx: OdsContext) => OdsAxisResult>} */
    const computers = PILOT_COMPUTERS as Record<string, (ctx: OdsCtx) => BlankAxis>;
    /** @type {Record<string, string>} */
    const titlesPt = ODS_TITLES_PT as Record<string, string>;
    /** @type {Record<string, string>} */
    const titlesEn = ODS_TITLES_EN as Record<string, string>;
    /** @type {Record<string, string>} */
    const titlesEs = ODS_TITLES_ES as Record<string, string>;
    /** @type {Record<string, string>} */
    const colors = ODS_COLORS as Record<string, string>;
    for (const key of ODS_KEYS) {
        const base = computers[key]
            ? computers[key](ctx)
            : _blankAxis(`Eixo ${key} aguardando implementação de KPIs materiais (SPEC §5).`);
        // Enriquece com id + title + color para UI consumers (Dashboard cards).
        axes[key] = {
            id: key,
            title: titlesPt[key],
            titleEn: titlesEn[key],
            titleEs: titlesEs[key],
            color: colors[key],
            ...base,
        };
        rawAxes[key] = base;
    }

    // Totais agregados (eligível por axis → somatório)
    for (const key of ODS_KEYS) {
        totals.eligibleElements = Math.max(totals.eligibleElements, (axes[key] as BlankAxis).eligibleElements);
        totals.eligibleReadings += (axes[key] as BlankAxis).eligibleReadings;
        totals.eligibleCampaigns = Math.max(totals.eligibleCampaigns, (axes[key] as BlankAxis).eligibleCampaigns);
    }

    // Composite: média ponderada de eixos com score numérico
    let numerator = 0;
    let denominator = 0;
    const confidenceAccum: number[] = [];
    for (const key of ODS_KEYS) {
        const w = Number(weights[key] ?? 1.0);
        const s = (axes[key] as BlankAxis).score;
        if (s != null) {
            numerator += w * s;
            denominator += w;
        }
        if ((axes[key] as BlankAxis).confidenceScore != null) confidenceAccum.push((axes[key] as BlankAxis).confidenceScore!);
    }
    const composite = denominator > 0 ? Number((numerator / denominator).toFixed(3)) : 0;
    const coverage = Math.min(
        1,
        totals.totalReadings > 0 ? totals.eligibleReadings / Math.max(1, totals.totalReadings * ODS_KEYS.length) : 0,
    );
    const confidenceScore =
        confidenceAccum.length > 0
            ? Number((confidenceAccum.reduce((s, v) => s + v, 0) / confidenceAccum.length).toFixed(3))
            : 0;
    const confidenceLevel = confidenceScore < 2.0 ? 'low' : confidenceScore < 3.5 ? 'medium' : 'high';

    return {
        version: ODS_VERSION,
        enabled: true,
        composite,
        coverage: Number(coverage.toFixed(3)),
        confidence: { score: confidenceScore, level: confidenceLevel },
        axes,
        totals: totals as any,
    };
}

/**
 * Helper: extrai `odsSummary` para persistência em snapshot.
 * Contrato do SPEC: { version, composite, coverage, confidenceScore }.
 * @param {Record<string, any> | null | undefined} overlay
 * @returns {Record<string, unknown> | null}
 */
export function buildOdsSummary(overlay: unknown): Record<string, unknown> | null {
    if (!overlay) return null;
    const o = overlay as Record<string, unknown>;
    return {
        version: o.version,
        composite: o.composite,
        coverage: o.coverage,
        confidenceScore: (o.confidence as Record<string, unknown>)?.score ?? 0,
    };
}
