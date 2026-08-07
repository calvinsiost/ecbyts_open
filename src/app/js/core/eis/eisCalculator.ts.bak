// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* global require */
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: Environmental Data Governance
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   EIS — Environmental Integrity Score
   Motor de Governança de Dados Ambientais (Framework 3CTA+)
   ================================================================

   Avalia a qualidade de dados ambientais (telemetria, emissões)
   em 6 eixos: Transparência, Acurácia, Completude, Tempestividade,
   Consistência e Comparabilidade.

   REGRA DE OURO: Algoritmo estritamente não-compensatório.
   Média geométrica ponderada — um eixo crítico (nota 1) em alta
   relevância afunda o score global organicamente.
   Médias aritméticas (compensatórias) são expressamente proibidas.

   MODOS:
   - 'geometric': Média Geométrica Ponderada pura
   - 'veto':      Geométrica com Kill-Switch (T≤2 ou A≤2 → EIS=0.0)

   CREDENCIAIS (POR LEITURA):
   Cada observação é carimbada com o nível de credencial do autor
   no momento da inserção. O multiplicador do eixo T é computado
   como a média aritmética dos multiplicadores de todas as leituras
   do modelo, aplicado antes do cálculo com cap em 5.0.

   ================================================================ */

import {
    createUValue,
    propagate,
    aggregateQuality,
    classifyBadge,
    chooseNDMethod,
} from '../uncertainty/index.js';
// EIS-EXT-CRED — pure folha (sem ciclo): import estático direto.
import { eisExternalCredibilityBonus } from './_externalCredibilityPure.js';

// ================================================================
// TIPOS
// ================================================================

export type EisAxis = 'T' | 'A' | 'Cp' | 'Ty' | 'Cs' | 'Cm';
export type EisMode = 'geometric' | 'veto';
export type EisCredentialLevel = 'common' | 'professional' | 'pos_graduado' | 'mestre' | 'doutor';

export type EisScores = Record<EisAxis, number>;
export type EisWeights = Record<EisAxis, number>;

export interface EisResult {
    eis: number;
    scores: Record<string, number>;
    adjustedScores: Record<string, number>;
    weights: Record<string, number>;
    credentialLevel: string;
    credentialMultiplier: number;
    credentialLabel: string;
    verdict: string;
    vetoed: boolean;
}

export interface EisCustomResult {
    eis: number;
    scores: Record<string, number>;
    weights: Record<string, number>;
    verdict: string;
    mode: 'custom';
}

export interface AggregateCredentialResult {
    multiplier: number;
    count: number;
    breakdown: Record<string, number>;
}

export interface CampaignStat {
    planned: number;
    executed: number;
}

export interface CpResult {
    score: number;
    totalPlanned: number;
    totalExecuted: number;
    ratio: number;
}

export interface RadarTransparencyInput {
    ratio: number;
    publicCount?: number | null;
    summaryCount?: number | null;
    total?: number | null;
}

export interface RadarTransparencyBonus {
    ratio: number;
    bonus: number;
    publicCount: number | null;
    summaryCount: number | null;
    total: number | null;
}

export interface TResult {
    score: number;
    aggregateMultiplier: number;
    tracedRatio: number;
    count: number;
    radarTransparencyBonus?: RadarTransparencyBonus | null;
    /** CETESB-RISK-001 Sub-5.2.2 — bônus por cobertura de avaliação de risco CETESB. */
    riskAssessmentBonus?: {
        readonly bonus: number;
        readonly coverage: number;
        readonly tier: 'complete' | 'partial' | 'insufficient' | 'undefined';
    } | null;
    /** EIS-EXT-CRED — bônus por sinais externos verificados (DOI/arXiv/repo). */
    externalCredibilityBonus?: {
        readonly bonus: number;
        readonly cappedAt: number;
        readonly breakdown: ReadonlyArray<{ type: string; contribution: number; evidenceUrl: string | null; verifiedAt: string | null }>;
    } | null;
}

export interface CalibrationBonus {
    status: 'calibrated' | 'expired' | 'uncertain' | 'unknown';
    delta: number;
}

export interface CalibrationMetaLike {
    status?: 'calibrated' | 'expired' | 'uncertain' | 'unknown';
}

export interface AResult {
    score: number;
    sensorsTotal: number;
    sensorsOperational: number;
    validationRatio: number;
    method: 'sensor' | 'validation';
    calibrationBonus?: CalibrationBonus | null;
}

export interface TyResult {
    score: number;
    medianAgeDays: number;
    freshCount: number;
    staleCount: number;
}

export interface CsResult {
    score: number;
    standardCount: number;
    totalCount: number;
    ratio: number;
}

export interface CmResult {
    score: number;
    mappedCount: number;
    defaultUnitCount: number;
    totalCount: number;
}

export interface AxisProblem {
    elementId: string | null | undefined;
    elementName: string | null | undefined;
    parameterId: string | null | undefined;
    field: string;
    current: string;
    fixKey: string;
    campaignId?: string | undefined;
}

export interface AxisProblemsResult {
    problems: AxisProblem[];
    fixCount: number;
}

export interface ImpactResult {
    axis: string;
    currentScore: number;
    targetScore: number;
    currentEIS: number;
    projectedEIS: number;
    delta: number;
}

export interface CostBenchmark {
    id: string;
    reference: number;
    computeActual: (rollup: unknown) => number | null;
}

export interface CostEffectivenessEntry {
    score: number;
    actual: number;
    reference: number;
    ratio: number;
}

interface ObservationLike {
    credentialLevel?: string;
    createdBy?: string | null;
    parameterId?: string;
    unitId?: string;
    value?: number | null;
    date?: string | number | Date;
    uncertainty?: number | null;
    uncertaintyType?: 'absolute' | 'relative';
    _elementId?: string;
    _elementName?: string;
}

interface ElementLike {
    id?: string;
    familyId?: string;
    family?: string;
    data?: {
        name?: string;
        weather?: { operationalStatus?: boolean };
    };
}

interface ParameterLike {
    id: string;
    defaultUnitId?: string;
}

interface UnitLike {
    dimension?: string;
}

interface ValidationLimits {
    [parameterId: string]: { max?: number; min?: number };
}

interface ValueWithUncertainty {
    value?: number;
    u?: number | null;
    k?: number;
    type?: 'absolute' | 'relative';
}

export interface CalculateWithUncertaintyOptions {
    matrix?: string;
    ndMethod?: string;
}

export interface EisResultWithUncertainty extends EisResult {
    qualityMetrics: unknown;
    uncertaintyClass: 'green' | 'yellow' | 'red' | 'grey';
    uncertaintyPolicy: {
        matrix: string;
        ndMethod: unknown;
    };
}

// ================================================================
// CONSTANTES DO FRAMEWORK 3CTA+
// Eixos, pesos padrão e multiplicadores por credencial
// ================================================================

/** Os 6 eixos do framework 3CTA+ */
export const EIS_AXES: EisAxis[] = ['T', 'A', 'Cp', 'Ty', 'Cs', 'Cm'];

/**
 * Pesos Gold Standard para o cálculo EIS.
 * Aceita customização por tenant — estes são os defaults.
 * Soma = 12 (facilita interpretação percentual por eixo).
 */
export const EIS_DEFAULT_WEIGHTS: EisWeights = {
    T: 3, // Transparência / Evidência de origem
    A: 3, // Acurácia / Saúde do sensor
    Cp: 2, // Completude / Uptime de cobertura
    Ty: 2, // Tempestividade / Latência de entrega
    Cs: 1, // Consistência / Unidades SI
    Cm: 1, // Comparabilidade / Taxonomia
};

/**
 * Multiplicadores do eixo T por nível de credencial do autor.
 * Usuários credenciados provam origem mais forte, elevando T antes
 * do cálculo. O resultado é capeado em 5.0.
 */
export const EIS_CREDENTIAL_MULTIPLIERS: Record<string, number> = {
    common: 1.0, // Usuário comum — sem alteração
    professional: 1.2, // Profissional (CREA/CRC) — leve elevação
    pos_graduado: 1.4, // Pós-graduado — elevação moderada
    mestre: 1.6, // Mestre — elevação significativa
    doutor: 2.0, // Doutor — máxima confiança de origem
};

/**
 * Rótulos legíveis dos níveis de credencial.
 */
export const EIS_CREDENTIAL_LABELS: Record<string, string> = {
    common: '—',
    professional: '🏛️ Prof',
    pos_graduado: '🎓 Pós',
    mestre: '🎓🎓 MSc',
    doutor: '🏅 PhD',
};

/**
 * Limiares de classificação do veredito.
 * Escala 0.00–5.00 com 2 casas decimais.
 */
export const EIS_VERDICTS = {
    AUDIT_READY: { min: 4.5, max: 5.0, label: '🟢 Audit Ready', desc: 'Grau de Auditoria Externa' },
    MANAGEMENT_READY: { min: 3.5, max: 4.49, label: '🟡 Management Ready', desc: 'Decisões Internas' },
    CRITICAL_DATA: { min: 0.0, max: 3.49, label: '🔴 Critical Data', desc: 'Risco de Compliance' },
} as const;

// ================================================================
// CLASSE PRINCIPAL
// EisCalculator — motor com os dois modos matemáticos
// ================================================================

/**
 * Motor de cálculo do Environmental Integrity Score (EIS).
 *
 * Implementa o framework 3CTA+ com dois modos matemáticos:
 * - 'geometric': Média Geométrica Ponderada (não-compensatório orgânico)
 * - 'veto':      Geométrica + Kill-Switch binário (para auditorias externas)
 *
 * Suporta pesos customizados por tenant e multiplicadores de credencial.
 *
 * @example
 * const calc = new EisCalculator();
 * const result = calc.calculate({ T:4, A:5, Cp:5, Ty:4, Cs:5, Cm:5 }, 'geometric', 'doutor');
 * console.log(result.eis, result.verdict);
 */
export class EisCalculator {
    public weights: EisWeights;
    private _totalWeight: number;

    /**
     * @param weights - Pesos customizados por tenant.
     *   Se null, usa EIS_DEFAULT_WEIGHTS (Gold Standard).
     *   Deve conter todos os 6 eixos com valores numéricos positivos.
     */
    constructor(weights: Partial<EisWeights> | null = null) {
        this.weights = weights ? ({ ...weights } as EisWeights) : { ...EIS_DEFAULT_WEIGHTS };
        this._validateWeights(this.weights);
        this._totalWeight = (Object.values(this.weights) as number[]).reduce((sum, w) => sum + w, 0);
    }

    // ================================================================
    // MÉTODO PÚBLICO PRINCIPAL
    // ================================================================

    /**
     * Calcula o EIS para um conjunto de notas.
     * Calcula o EIS para as 6 dimensões de qualidade de um dado ambiental.
     *
     * @param scores - Notas por eixo (1-5, inteiros). Deve conter: T, A, Cp, Ty, Cs, Cm
     * @param mode - Modo de cálculo. 'geometric': média geométrica ponderada pura.
     *   'veto': geométrica com kill-switch (T≤2 ou A≤2 → EIS=0.0).
     * @param credentialLevel - Nível de credencial do autor.
     *   Determina o multiplicador aplicado ao eixo T antes do cálculo.
     * @param credentialMultiplierOverride - Multiplicador numérico
     *   computado a partir das leituras do modelo. Se fornecido, sobrepõe o lookup
     *   por credentialLevel. Usado pelo dashboard com dados reais.
     * @returns Objeto com score, veredito e detalhes do cálculo.
     * @throws Se alguma nota estiver fora do range 1-5 ou eixo ausente.
     */
    calculate(
        scores: EisScores,
        mode: EisMode = 'geometric',
        credentialLevel: string = 'common',
        credentialMultiplierOverride: number | null = null,
    ): EisResult {
        this._validateScores(scores);

        let multiplier: number;
        if (credentialMultiplierOverride != null && typeof credentialMultiplierOverride === 'number') {
            multiplier = credentialMultiplierOverride;
        } else {
            this._validateCredentialLevel(credentialLevel);
            multiplier = EIS_CREDENTIAL_MULTIPLIERS[credentialLevel] as number;
        }

        const adjustedScores = this._applyCredentialMultiplier(scores, multiplier);

        if (mode === 'veto') {
            return this._calculateVeto(scores, adjustedScores, credentialLevel, multiplier);
        }
        return this._calculateGeometric(scores, adjustedScores, credentialLevel, multiplier, false);
    }

    /**
     * UNC-001 Phase 1 sibling method.
     * Computes EIS + first-order uncertainty quality envelope.
     */
    calculateWithUncertainty(
        axesUValues: Partial<Record<EisAxis, ValueWithUncertainty>>,
        mode: EisMode = 'geometric',
        credentialLevel: string = 'common',
        credentialMultiplierOverride: number | null = null,
        options: CalculateWithUncertaintyOptions = {},
    ): EisResultWithUncertainty {
        const scores = {} as EisScores;
        const uvList: unknown[] = [];
        for (const axis of EIS_AXES) {
            const raw = (axesUValues?.[axis] || {}) as ValueWithUncertainty;
            const uv = createUValue(raw.value ?? 3, raw.u ?? null, {
                k: raw.k ?? 2,
                type: raw.type || 'absolute',
            });
            scores[axis] = uv.value;
            uvList.push(uv);
        }

        const base = this.calculate(scores, mode, credentialLevel, credentialMultiplierOverride);

        const totalWeight =
            EIS_AXES.reduce((acc, axis) => acc + (this.weights?.[axis] || 0), 0) || 1;
        const normWeights = EIS_AXES.map((axis) => (this.weights?.[axis] || 0) / totalWeight);
        const eU = propagate('linear', uvList, normWeights);
        const qualityMetrics = aggregateQuality(uvList, base.eis, eU.u);
        const uncertaintyClass = classifyBadge(qualityMetrics);
        const ndOptions: { matrix: string; detectRate?: number; preferredMethod: string } = {
            matrix: options?.matrix || 'default',
            preferredMethod: options?.ndMethod || 'auto',
        };
        if (typeof qualityMetrics.detectRate === 'number') {
            ndOptions.detectRate = qualityMetrics.detectRate;
        }
        const ndMethod = chooseNDMethod(ndOptions);

        return {
            ...base,
            qualityMetrics,
            uncertaintyClass,
            uncertaintyPolicy: {
                matrix: options?.matrix || 'default',
                ndMethod,
            },
        };
    }

    // ================================================================
    // MÉTODO ESTÁTICO — CREDENCIAL AGREGADA POR LEITURA
    // ================================================================

    /**
     * Computa o multiplicador agregado de credencial a partir das observações do modelo.
     * Média aritmética dos multiplicadores individuais de cada leitura.
     * Observações sem credentialLevel são tratadas como 'common' (1.0×).
     */
    static computeAggregateCredential(observations: ObservationLike[] | null | undefined): AggregateCredentialResult {
        if (!observations || observations.length === 0) {
            return { multiplier: 1.0, count: 0, breakdown: {} };
        }

        const breakdown: Record<string, number> = {};
        let sum = 0;

        for (const obs of observations) {
            const level = obs.credentialLevel || 'common';
            const mult = EIS_CREDENTIAL_MULTIPLIERS[level] ?? 1.0;
            sum += mult;
            breakdown[level] = (breakdown[level] || 0) + 1;
        }

        const multiplier = parseFloat((sum / observations.length).toFixed(4));
        return { multiplier, count: observations.length, breakdown };
    }

    // ================================================================
    // MÉTODO ESTÁTICO — COMPLETUDE (Cp) A PARTIR DAS CAMPANHAS
    // ================================================================

    /**
     * Computa o score Cp (Completude) a partir dos dados de campanha.
     * Mapeia a razao agregada executado/planejado para a escala 1-5 do EIS.
     *
     * Se nenhuma campanha tem plannedReadings, retorna null — fallback para slider manual.
     *
     * Escala:
     *   ratio >= 0.95 → 5 (cobertura total — Audit Ready)
     *   ratio >= 0.80 → 4 (boa cobertura)
     *   ratio >= 0.60 → 3 (cobertura moderada)
     *   ratio >= 0.30 → 2 (cobertura baixa)
     *   ratio <  0.30 → 1 (gap critico)
     */
    static computeCpFromCampaigns(campaignStats: CampaignStat[]): CpResult | null {
        const totalPlanned = campaignStats.reduce((s, c) => s + c.planned, 0);
        const totalExecuted = campaignStats.reduce((s, c) => s + c.executed, 0);

        if (totalPlanned === 0) return null;

        const ratio = totalExecuted / totalPlanned;
        let score: number;
        if (ratio >= 0.95) score = 5;
        else if (ratio >= 0.8) score = 4;
        else if (ratio >= 0.6) score = 3;
        else if (ratio >= 0.3) score = 2;
        else score = 1;

        return {
            score,
            totalPlanned,
            totalExecuted,
            ratio: parseFloat(ratio.toFixed(4)),
        };
    }

    // ================================================================
    // MÉTODO PÚBLICO — MODO CUSTOM
    // ================================================================

    /**
     * Calcula EIS com eixos e pesos definidos pelo usuário.
     * Média geométrica ponderada pura (sem credential multiplier, sem veto).
     *
     * @throws Se menos de 2 eixos, ou notas/pesos inválidos.
     */
    calculateCustom(axisScores: Record<string, number>, axisWeights: Record<string, number>): EisCustomResult {
        const axes = Object.keys(axisScores);
        if (axes.length < 2) {
            throw new Error(`[EIS Custom] Mínimo 2 eixos. Recebido: ${axes.length}`);
        }
        if (axes.length > 12) {
            throw new Error(`[EIS Custom] Máximo 12 eixos. Recebido: ${axes.length}`);
        }

        let totalWeight = 0;
        for (const axis of axes) {
            const s = axisScores[axis];
            if (typeof s !== 'number' || !Number.isFinite(s) || s < 1 || s > 5) {
                throw new Error(`[EIS Custom] Nota inválida para '${axis}': ${s}. Deve ser 1-5.`);
            }
            const w = axisWeights[axis];
            if (w == null || typeof w !== 'number' || !Number.isFinite(w) || w <= 0) {
                throw new Error(`[EIS Custom] Peso inválido para '${axis}': ${w}. Deve ser > 0.`);
            }
            totalWeight += w;
        }

        let rawScore = 1;
        for (const axis of axes) {
            const score = axisScores[axis];
            const weight = axisWeights[axis];
            if (typeof score !== 'number' || typeof weight !== 'number') {
                throw new Error(`[EIS Custom] Eixo '${axis}' sem nota ou peso validado.`);
            }
            rawScore *= Math.pow(score, weight / totalWeight);
        }

        const eis = parseFloat(rawScore.toFixed(2));
        return {
            eis,
            scores: { ...axisScores },
            weights: { ...axisWeights },
            verdict: this._getVerdict(eis),
            mode: 'custom',
        };
    }

    // ================================================================
    // MÉTODOS ESTÁTICOS — AUTO-CÁLCULO DOS EIXOS
    // ================================================================

    /**
     * Computa T (Transparência) a partir das observações do modelo.
     * Score baseado no multiplicador agregado de credencial + rastreabilidade.
     *
     * @param radarTransparency Resultado opcional pré-computado de
     *   `computePublicShareRatio(slices)` em `core/radar/globalDiscovery`.
     *   Calvin diretiva 2026-05-14: "a nota de transparencia no EIS score vira do %
     *   da fatia do modelo disponível para todo o público no radar".
     *   Quando provido, soma bônus 0..+1.0 linear ao score base (cap em 5).
     */
    static computeTFromObservations(
        observations: ObservationLike[] | null | undefined,
        radarTransparency?: RadarTransparencyInput | null,
        riskCoverage?: { totalSqis: number; sqisWithCma: number } | null,
        externalCredibilitySignals?: ReadonlyArray<{ type: string; verified: boolean; evidenceUrl?: string | null; verifiedAt?: string | null }> | null,
    ): TResult | null {
        if (!observations || observations.length === 0) return null;

        const credInfo = EisCalculator.computeAggregateCredential(observations);
        const tracedCount = observations.filter((o) => o.createdBy != null && o.createdBy !== '').length;
        const tracedRatio = tracedCount / observations.length;

        // Score pelo multiplicador agregado
        let score: number;
        const m = credInfo.multiplier;
        if (m >= 1.8) score = 5;
        else if (m >= 1.4) score = 4;
        else if (m >= 1.2) score = 3;
        else if (m >= 1.0) score = 2;
        else score = 1;

        // Bônus de rastreabilidade: +0.5 se 90%+ das obs têm autor
        if (tracedRatio >= 0.9) score = Math.min(score + 0.5, 5);

        // Bônus de transparência via radar (Calvin 2026-05-14)
        let radarBonus: RadarTransparencyBonus | null = null;
        if (radarTransparency && typeof radarTransparency.ratio === 'number') {
            const ratio = Math.max(0, Math.min(1, radarTransparency.ratio));
            const baseScore = score;
            score = Math.min(5, score + ratio);
            radarBonus = {
                ratio: parseFloat(ratio.toFixed(4)),
                bonus: parseFloat((score - baseScore).toFixed(2)),
                publicCount: radarTransparency.publicCount ?? null,
                summaryCount: radarTransparency.summaryCount ?? null,
                total: radarTransparency.total ?? null,
            };
        }

        // CETESB-RISK-001 Sub-5.2.2 — bônus por cobertura de avaliação de risco CETESB.
        // Lazy import (avoid circular dependency entre eis<->risk no boot).
        let riskBonus: TResult['riskAssessmentBonus'] = null;
        if (riskCoverage && typeof riskCoverage.totalSqis === 'number') {
            try {
                const { eisRiskAssessmentBonus } = require('./eisRiskAssessmentBonus.js');
                const b = eisRiskAssessmentBonus(riskCoverage);
                if (b && typeof b.bonus === 'number' && b.bonus > 0) {
                    const baseScore = score;
                    score = Math.min(5, score + b.bonus);
                    riskBonus = {
                        bonus: parseFloat((score - baseScore).toFixed(2)),
                        coverage: parseFloat(b.coverage.toFixed(4)),
                        tier: b.tier,
                    };
                } else if (b) {
                    riskBonus = { bonus: 0, coverage: b.coverage, tier: b.tier };
                }
            } catch (e) {
                console.debug('[eis:risk-bonus] lazy import failed:', (e as Error)?.message || e);
            }
        }

        // EIS-EXT-CRED — bônus por sinais externos VERIFICADOS (DOI/arXiv/repo).
        // Mesmo padrão dos demais bônus: aditivo bounded, cap T=5. Avaliação
        // 2026-06-14: refina T sem dominar (teto agregado +1.0 no pure).
        let extCredBonus: TResult['externalCredibilityBonus'] = null;
        if (Array.isArray(externalCredibilitySignals) && externalCredibilitySignals.length > 0) {
            const b = eisExternalCredibilityBonus(externalCredibilitySignals as any);
            if (b && typeof b.bonus === 'number' && b.bonus > 0) {
                const baseScore = score;
                score = Math.min(5, score + b.bonus);
                extCredBonus = {
                    bonus: parseFloat((score - baseScore).toFixed(2)),
                    cappedAt: b.cappedAt,
                    breakdown: b.breakdown,
                };
            }
        }

        return {
            score: parseFloat(score.toFixed(2)),
            aggregateMultiplier: credInfo.multiplier,
            tracedRatio: parseFloat(tracedRatio.toFixed(4)),
            count: observations.length,
            radarTransparencyBonus: radarBonus,
            riskAssessmentBonus: riskBonus,
            externalCredibilityBonus: extCredBonus,
        };
    }

    /**
     * Computa A (Acurácia) a partir dos elementos do modelo.
     * Usa sensores (operationalStatus) se existirem, senão valida obs vs limites regulatórios.
     */
    static computeAFromModel(
        elements: ElementLike[] | null | undefined,
        observations: ObservationLike[] | null | undefined,
        validationLimits: ValidationLimits | null = null,
        calibrationMeta: CalibrationMetaLike | null = null,
    ): AResult | null {
        // Bônus por calibração documentada (Calvin 2026-05-14/15, FIELD-META-EXT-001).
        //
        // HIERARQUIA DE PENALIDADE (Calvin 2026-05-15 ajuste — uncertain/unknown
        // piores que expired). Embasada em boas práticas internacionais de
        // metrologia:
        // - ISO/IEC 17025 §6.4 — equipment must have unique ID + calibration records
        // - ANSI/NCSL Z540.3 — expired calibration must be flagged but data is still
        //   defensible if used with caution; absence of records = data not auditable
        // - NIST Handbook 150 §5.5 — traceability chain to SI units required
        // - GAGAS (GAO Yellow Book) — "absence of evidence is evidence of weak controls"
        //
        // Racional:
        // - calibrated (+0.5): rastreável até padrão SI, dentro de intervalo
        // - expired (-0.5): documentado vencido, time sabe, recalibração planejável
        // - uncertain (-0.7): zona cinza (acabou de vencer, sem decisão clara),
        //   dado em uso sem ação corretiva = pior que expired explícito
        // - unknown (-1.0): zero rastreabilidade metrológica, viola ISO/IEC 17025,
        //   dado não-auditável externamente = pior cenário possível
        let calibrationBonus: CalibrationBonus | null = null;
        const applyCalibration = (raw: number): number => {
            if (!calibrationMeta || !calibrationMeta.status) return raw;
            let delta = 0;
            if (calibrationMeta.status === 'calibrated') delta = 0.5;
            else if (calibrationMeta.status === 'expired') delta = -0.5;
            else if (calibrationMeta.status === 'uncertain') delta = -0.7;
            else if (calibrationMeta.status === 'unknown') delta = -1.0;
            const adjusted = Math.max(1, Math.min(5, raw + delta));
            // Recalcula delta efetivo após cap
            calibrationBonus = { status: calibrationMeta.status, delta: parseFloat((adjusted - raw).toFixed(2)) };
            return adjusted;
        };

        // Tentar via sensores primeiro
        const sensors = (elements || []).filter((e) => e.familyId === 'sensor' && e.data);
        if (sensors.length > 0) {
            const operational = sensors.filter(
                (s) => s.data?.weather && s.data.weather.operationalStatus === true,
            ).length;
            const ratio = operational / sensors.length;

            let score: number;
            if (ratio >= 0.95) score = 5;
            else if (ratio >= 0.8) score = 4;
            else if (ratio >= 0.6) score = 3;
            else if (ratio >= 0.4) score = 2;
            else score = 1;

            const finalScore = applyCalibration(score);
            return {
                score: finalScore,
                sensorsTotal: sensors.length,
                sensorsOperational: operational,
                validationRatio: ratio,
                method: 'sensor',
                calibrationBonus,
            };
        }

        // Fallback: validação regulatória (com penalização por alta incerteza)
        if (!observations || observations.length === 0) return null;
        if (!validationLimits || Object.keys(validationLimits).length === 0) return null;

        let validCount = 0;
        let checkedCount = 0;
        let lowPrecisionCount = 0;

        for (const obs of observations) {
            const paramId = obs.parameterId;
            const limit = paramId ? validationLimits[paramId] : undefined;
            if (!limit || obs.value == null) continue;
            checkedCount++;
            if (limit.max != null && obs.value <= limit.max) validCount++;
            else if (limit.min != null && obs.value >= limit.min) validCount++;

            // Penalizar observações com alta incerteza relativa (> 50%)
            if (obs.uncertainty != null && obs.uncertainty > 0 && obs.value !== 0) {
                const relUnc =
                    obs.uncertaintyType === 'relative'
                        ? obs.uncertainty
                        : Math.abs((obs.uncertainty as number) / (obs.value as number)) * 100;
                if (relUnc > 50) lowPrecisionCount++;
            }
        }

        if (checkedCount === 0) return null;

        // Observações de baixa precisão contam como meio ponto (penalização suave)
        const adjustedValid = validCount - lowPrecisionCount * 0.5;
        const ratio = Math.max(0, adjustedValid) / checkedCount;
        let score: number;
        if (ratio >= 0.95) score = 5;
        else if (ratio >= 0.8) score = 4;
        else if (ratio >= 0.6) score = 3;
        else if (ratio >= 0.4) score = 2;
        else score = 1;

        const finalScore = applyCalibration(score);
        return {
            score: finalScore,
            sensorsTotal: 0,
            sensorsOperational: 0,
            validationRatio: ratio,
            method: 'validation',
            calibrationBonus,
        };
    }

    /**
     * Computa Ty (Tempestividade) a partir das datas das observações.
     * Usa mediana da idade das obs (mais robusto que média).
     */
    static computeTyFromObservations(
        observations: ObservationLike[] | null | undefined,
        referenceDate: Date = new Date(),
    ): TyResult | null {
        if (!observations || observations.length === 0) return null;

        const refMs = referenceDate.getTime();
        const ages: number[] = [];

        for (const obs of observations) {
            if (!obs.date) continue;
            const obsDate = new Date(obs.date);
            if (isNaN(obsDate.getTime())) continue;
            const ageDays = (refMs - obsDate.getTime()) / (1000 * 60 * 60 * 24);
            ages.push(Math.max(0, ageDays));
        }

        if (ages.length === 0) return null;

        // Mediana
        ages.sort((a, b) => a - b);
        const mid = Math.floor(ages.length / 2);
        const lowerMedian = ages[mid - 1] ?? ages[0] ?? 0;
        const upperMedian = ages[mid] ?? ages[ages.length - 1] ?? lowerMedian;
        const medianAgeDays: number =
            ages.length % 2 === 0 ? (lowerMedian + upperMedian) / 2 : upperMedian;

        let score: number;
        if (medianAgeDays <= 30) score = 5;
        else if (medianAgeDays <= 90) score = 4;
        else if (medianAgeDays <= 180) score = 3;
        else if (medianAgeDays <= 365) score = 2;
        else score = 1;

        const freshCount = ages.filter((a) => a <= 90).length;
        const staleCount = ages.filter((a) => a > 365).length;

        return {
            score,
            medianAgeDays: parseFloat(medianAgeDays.toFixed(1)),
            freshCount,
            staleCount,
        };
    }

    /**
     * Computa Cs (Consistência) verificando unidades contra o catálogo.
     * Obs com unitId catalogado (dimension válida) = padronizada.
     */
    static computeCsFromObservations(
        observations: ObservationLike[] | null | undefined,
        unitCatalog: Record<string, UnitLike> | null | undefined,
    ): CsResult | null {
        if (!observations || observations.length === 0) return null;
        if (!unitCatalog || Object.keys(unitCatalog).length === 0) return null;

        let standardCount = 0;
        let totalCount = 0;

        for (const obs of observations) {
            if (!obs.unitId) continue;
            totalCount++;
            const unit = unitCatalog[obs.unitId];
            if (unit && unit.dimension) standardCount++;
        }

        if (totalCount === 0) return null;

        const ratio = standardCount / totalCount;
        let score: number;
        if (ratio >= 0.95) score = 5;
        else if (ratio >= 0.8) score = 4;
        else if (ratio >= 0.6) score = 3;
        else if (ratio >= 0.4) score = 2;
        else score = 1;

        return {
            score,
            standardCount,
            totalCount,
            ratio: parseFloat(ratio.toFixed(4)),
        };
    }

    /**
     * Computa Cm (Comparabilidade) verificando parâmetros contra o catálogo.
     * Combina: parameterId mapeado + unitId == defaultUnitId do parâmetro.
     */
    static computeCmFromObservations(
        observations: ObservationLike[] | null | undefined,
        parameterCatalog: ParameterLike[] | null | undefined,
    ): CmResult | null {
        if (!observations || observations.length === 0) return null;
        if (!parameterCatalog || parameterCatalog.length === 0) return null;

        // Mapear para lookup rápido
        const paramMap: Record<string, ParameterLike> = {};
        for (const p of parameterCatalog) {
            paramMap[p.id] = p;
        }

        let mappedCount = 0;
        let defaultUnitCount = 0;
        let totalCount = 0;

        for (const obs of observations) {
            if (!obs.parameterId) continue;
            totalCount++;
            const param = paramMap[obs.parameterId];
            if (param) {
                mappedCount++;
                if (obs.unitId && obs.unitId === param.defaultUnitId) defaultUnitCount++;
            }
        }

        if (totalCount === 0) return null;

        // Score composto: 50% taxonomia + 50% unidade padrão
        const ratio = (mappedCount + defaultUnitCount) / (2 * totalCount);
        let score: number;
        if (ratio >= 0.95) score = 5;
        else if (ratio >= 0.8) score = 4;
        else if (ratio >= 0.6) score = 3;
        else if (ratio >= 0.4) score = 2;
        else score = 1;

        return {
            score,
            mappedCount,
            defaultUnitCount,
            totalCount,
        };
    }

    /**
     * Computa Global Compliance (GC) score from observations.
     * Delegates to globalCompliance.js, returns 1-5 score or null.
     */
    static computeGcFromObservations(
        observations: ObservationLike[],
        matrix: string = 'groundwater',
    ): Promise<{ score: number; detail: unknown } | null> | null {
        try {
            // Dynamic import to avoid circular dependency
            const mod = import('../../core/validation/globalCompliance.js') as Promise<{
                computeGlobalCompliance: (obs: ObservationLike[], m: string) => { score: number } | null;
            }>;
            // Sync fallback — if module already cached, use it
            return mod.then(({ computeGlobalCompliance }) => {
                const result = computeGlobalCompliance(observations, matrix);
                if (!result) return null;
                return { score: result.score, detail: result };
            });
        } catch {
            return null;
        }
    }

    // ================================================================
    // MÉTODO ESTÁTICO — DIAGNÓSTICO: ITENS PROBLEMÁTICOS POR EIXO
    // ================================================================

    /**
     * Coleta itens problemáticos que arrastam o score de um eixo para baixo.
     * Filtro read-only — não computa score, só identifica problemas.
     */
    static collectAxisProblems(
        axis: string,
        observations: ObservationLike[],
        elements: ElementLike[],
        campaignDetails: Array<{ campaignId?: string; details?: Array<{ executed?: boolean; elementId?: string; parameterId?: string }> }>,
        unitsCatalog: Record<string, UnitLike> | null | undefined,
        paramsCatalog: ParameterLike[] | null | undefined,
    ): AxisProblemsResult {
        const problems: AxisProblem[] = [];
        const now = Date.now();

        switch (axis) {
            case 'T':
                for (const obs of observations) {
                    if (!obs.credentialLevel || obs.credentialLevel === 'common') {
                        problems.push({
                            elementId: obs._elementId,
                            elementName: obs._elementName,
                            parameterId: obs.parameterId,
                            field: 'credentialLevel',
                            current: obs.credentialLevel || 'none',
                            fixKey: 'eis.fix_add_credential',
                        });
                    }
                    if (!obs.createdBy) {
                        problems.push({
                            elementId: obs._elementId,
                            elementName: obs._elementName,
                            parameterId: obs.parameterId,
                            field: 'createdBy',
                            current: 'missing',
                            fixKey: 'eis.fix_add_author',
                        });
                    }
                }
                break;

            case 'A': {
                // Sensores offline
                const sensors = (elements || []).filter((e) => e.familyId === 'sensor' || e.family === 'sensor');
                for (const s of sensors) {
                    if (!s.data?.weather?.operationalStatus) {
                        problems.push({
                            elementId: s.id,
                            elementName: s.data?.name || s.id,
                            parameterId: null,
                            field: 'operationalStatus',
                            current: 'offline',
                            fixKey: 'eis.fix_sensor_offline',
                        });
                    }
                }
                // Obs com alta incerteza
                for (const obs of observations) {
                    if (obs.uncertainty != null && obs.uncertainty > 0 && obs.value !== 0) {
                        const relUnc =
                            obs.uncertaintyType === 'relative'
                                ? obs.uncertainty
                                : Math.abs((obs.uncertainty as number) / (obs.value as number)) * 100;
                        if (relUnc > 50) {
                            problems.push({
                                elementId: obs._elementId,
                                elementName: obs._elementName,
                                parameterId: obs.parameterId,
                                field: 'uncertainty',
                                current: `${relUnc.toFixed(0)}%`,
                                fixKey: 'eis.fix_high_uncertainty',
                            });
                        }
                    }
                }
                break;
            }

            case 'Cp':
                // Readings planejados nao executados
                if (Array.isArray(campaignDetails)) {
                    for (const cs of campaignDetails) {
                        if (!cs || !Array.isArray(cs.details)) continue;
                        for (const d of cs.details) {
                            if (!d.executed) {
                                // Encontra nome do elemento
                                const el = (elements || []).find((e) => e.id === d.elementId);
                                const problem: AxisProblem = {
                                    elementId: d.elementId,
                                    elementName: el?.data?.name || d.elementId,
                                    parameterId: d.parameterId,
                                    field: 'reading',
                                    current: 'not executed',
                                    fixKey: 'eis.fix_missing_reading',
                                };
                                if (typeof cs.campaignId === 'string') {
                                    problem.campaignId = cs.campaignId;
                                }
                                problems.push(problem);
                            }
                        }
                    }
                }
                break;

            case 'Ty': {
                const ageThreshold = 180; // dias
                for (const obs of observations) {
                    if (!obs.date) continue;
                    const ageDays = (now - new Date(obs.date).getTime()) / (1000 * 60 * 60 * 24);
                    if (ageDays > ageThreshold) {
                        problems.push({
                            elementId: obs._elementId,
                            elementName: obs._elementName,
                            parameterId: obs.parameterId,
                            field: 'date',
                            current: `${Math.round(ageDays)}d`,
                            fixKey: 'eis.fix_stale_obs',
                        });
                    }
                }
                // Ordenar por idade decrescente (mais antigos primeiro)
                problems.sort((a, b) => parseInt(b.current) - parseInt(a.current));
                break;
            }

            case 'Cs':
                for (const obs of observations) {
                    if (!obs.unitId) continue;
                    const unit = unitsCatalog?.[obs.unitId];
                    if (!unit || !unit.dimension) {
                        problems.push({
                            elementId: obs._elementId,
                            elementName: obs._elementName,
                            parameterId: obs.parameterId,
                            field: 'unitId',
                            current: obs.unitId || 'none',
                            fixKey: 'eis.fix_nonstandard_unit',
                        });
                    }
                }
                break;

            case 'Cm':
                for (const obs of observations) {
                    if (!obs.parameterId) continue;
                    const param = Array.isArray(paramsCatalog)
                        ? paramsCatalog.find((p) => p.id === obs.parameterId)
                        : null;
                    if (!param) {
                        problems.push({
                            elementId: obs._elementId,
                            elementName: obs._elementName,
                            parameterId: obs.parameterId,
                            field: 'parameterId',
                            current: obs.parameterId,
                            fixKey: 'eis.fix_unmapped_param',
                        });
                    }
                }
                break;
        }

        return { problems, fixCount: problems.length };
    }

    /**
     * Simula o impacto no EIS se um eixo melhorar em 1 ponto.
     * Calcula o delta entre EIS atual e EIS com o eixo incrementado.
     */
    static computeImpactIfImproved(
        scores: EisScores,
        weights: EisWeights | null,
        targetAxis: EisAxis,
        credMultiplier: number = 1.0,
        mode: EisMode = 'geometric',
    ): ImpactResult {
        const calc = new EisCalculator(weights);
        const currentScore = scores[targetAxis] || 3;
        const targetScore = Math.min(
            5,
            Math.ceil(currentScore) === currentScore ? currentScore + 1 : Math.ceil(currentScore),
        );

        // Calcula EIS atual
        let currentEIS: number;
        try {
            currentEIS = calc.calculate(scores, mode, 'common', credMultiplier).eis;
        } catch {
            currentEIS = 0;
        }

        // Calcula EIS com eixo melhorado
        const improved: EisScores = { ...scores, [targetAxis]: targetScore };
        let projectedEIS: number;
        try {
            projectedEIS = calc.calculate(improved, mode, 'common', credMultiplier).eis;
        } catch {
            projectedEIS = currentEIS;
        }

        return {
            axis: targetAxis,
            currentScore,
            targetScore,
            currentEIS,
            projectedEIS,
            delta: parseFloat((projectedEIS - currentEIS).toFixed(2)),
        };
    }

    /**
     * Computa scores de custo-efetividade a partir do rollup de custos e benchmarks.
     * Cada eixo compara valor real vs referência setorial.
     *
     * Score: ratio actual/benchmark → 1-5
     *   ≤0.80x → 5 (muito abaixo do benchmark = excelente)
     *   ≤1.00x → 4 (dentro do benchmark)
     *   ≤1.20x → 3 (levemente acima)
     *   ≤1.50x → 2 (acima)
     *   >1.50x → 1 (muito acima = crítico)
     */
    static computeCostEffectiveness(
        costRollup: unknown,
        benchmarks: CostBenchmark[],
    ): Record<string, CostEffectivenessEntry | null> {
        const results: Record<string, CostEffectivenessEntry | null> = {};
        if (!costRollup || !benchmarks) return results;

        for (const bm of benchmarks) {
            const actual = typeof bm.computeActual === 'function' ? bm.computeActual(costRollup) : null;
            if (actual == null || !Number.isFinite(actual) || bm.reference <= 0) {
                results[bm.id] = null;
                continue;
            }

            const ratio = actual / bm.reference;
            let score: number;
            if (ratio <= 0.8) score = 5;
            else if (ratio <= 1.0) score = 4;
            else if (ratio <= 1.2) score = 3;
            else if (ratio <= 1.5) score = 2;
            else score = 1;

            results[bm.id] = {
                score,
                actual: parseFloat(actual.toFixed(2)),
                reference: bm.reference,
                ratio: parseFloat(ratio.toFixed(4)),
            };
        }
        return results;
    }

    // ================================================================
    // MÉTODOS PRIVADOS — LÓGICA MATEMÁTICA
    // ================================================================

    /**
     * Aplica o multiplicador de credencial ao eixo T, com cap em 5.0.
     * Os demais eixos não são alterados.
     */
    private _applyCredentialMultiplier(scores: EisScores, multiplier: number): EisScores {
        const adjusted: EisScores = { ...scores };
        adjusted.T = Math.min(scores.T * multiplier, 5.0);
        return adjusted;
    }

    /**
     * Modo 'geometric': Média Geométrica Ponderada.
     * Calcula EIS = ∏ (Nota_i)^(Peso_i / SomaPesos)
     */
    private _calculateGeometric(
        scores: EisScores,
        adjustedScores: EisScores,
        credentialLevel: string,
        multiplier: number,
        vetoed: boolean,
    ): EisResult {
        let rawScore = 1;
        for (const axis of EIS_AXES) {
            const note = adjustedScores[axis];
            const weight = this.weights[axis];
            rawScore *= Math.pow(note, weight / this._totalWeight);
        }

        // Kill-switch pode ter zerado o score antes de chegar aqui
        const eis = vetoed ? 0.0 : parseFloat(rawScore.toFixed(2));
        return this._buildResult(eis, scores, adjustedScores, credentialLevel, multiplier, vetoed);
    }

    /**
     * Modo 'veto': Geométrica com Kill-Switch binário.
     * Avalia T e A sobre as notas ORIGINAIS (sem multiplicador).
     * Se T≤2 ou A≤2, EIS = 0.0 independente de tudo.
     */
    private _calculateVeto(
        scores: EisScores,
        adjustedScores: EisScores,
        credentialLevel: string,
        multiplier: number,
    ): EisResult {
        const vetoed = scores.T <= 2 || scores.A <= 2;
        return this._calculateGeometric(scores, adjustedScores, credentialLevel, multiplier, vetoed);
    }

    // ================================================================
    // MÉTODOS PRIVADOS — RESULTADO E CLASSIFICAÇÃO
    // ================================================================

    /**
     * Monta o objeto de retorno padronizado.
     */
    private _buildResult(
        eis: number,
        scores: EisScores,
        adjustedScores: EisScores,
        credentialLevel: string,
        multiplier: number,
        vetoed: boolean,
    ): EisResult {
        return {
            eis,
            scores: { ...scores },
            adjustedScores: { ...adjustedScores },
            weights: { ...this.weights },
            credentialLevel,
            credentialMultiplier: multiplier,
            credentialLabel: EIS_CREDENTIAL_LABELS[credentialLevel] || '—',
            verdict: this._getVerdict(eis),
            vetoed,
        };
    }

    /**
     * Classifica o score EIS em categoria de veredito.
     */
    private _getVerdict(score: number): string {
        if (score >= 4.5) return EIS_VERDICTS.AUDIT_READY.label;
        if (score >= 3.5) return EIS_VERDICTS.MANAGEMENT_READY.label;
        return EIS_VERDICTS.CRITICAL_DATA.label;
    }

    // ================================================================
    // MÉTODOS PRIVADOS — VALIDAÇÃO
    // ================================================================

    /**
     * Valida que as notas fornecidas são inteiros no range 1-5
     * e que todos os 6 eixos obrigatórios estão presentes.
     */
    private _validateScores(scores: EisScores): void {
        for (const axis of EIS_AXES) {
            if (!(axis in scores)) {
                throw new Error(
                    `[EIS] Eixo ausente nas notas: '${axis}'. Forneça todos os 6 eixos: ${EIS_AXES.join(', ')}`,
                );
            }
            const v = scores[axis];
            if (typeof v !== 'number' || !Number.isFinite(v) || v < 1 || v > 5) {
                throw new Error(`[EIS] Nota inválida para '${axis}': ${v}. Deve ser número entre 1 e 5 (inclusive).`);
            }
        }
    }

    /**
     * Valida que os pesos fornecidos cobrem todos os eixos
     * e contêm valores numéricos positivos.
     */
    private _validateWeights(weights: EisWeights): void {
        for (const axis of EIS_AXES) {
            if (!(axis in weights)) {
                throw new Error(`[EIS] Peso ausente para eixo: '${axis}'. Forneça todos os 6 eixos.`);
            }
            const w = weights[axis];
            if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) {
                throw new Error(`[EIS] Peso inválido para '${axis}': ${w}. Deve ser número positivo.`);
            }
        }
    }

    /**
     * Valida que o nível de credencial é reconhecido.
     */
    private _validateCredentialLevel(level: string): void {
        if (!(level in EIS_CREDENTIAL_MULTIPLIERS)) {
            const valid = Object.keys(EIS_CREDENTIAL_MULTIPLIERS).join(', ');
            throw new Error(`[EIS] Nível de credencial desconhecido: '${level}'. Valores válidos: ${valid}`);
        }
    }
}

// ================================================================
// TEMPLATES DE PERFIS CUSTOM
// ================================================================

export interface EisCustomTemplateAxis {
    id: string;
    name: string;
    weight: number;
    description: string;
    benchmark?: { reference: number; unit: string; source: string };
}

export interface EisCustomTemplate {
    id: string;
    name: string;
    isTemplate: boolean;
    axes: EisCustomTemplateAxis[];
}

/**
 * Templates pré-configurados para o modo Custom.
 * Não editáveis diretamente — o usuário pode duplicar e customizar.
 */
export const EIS_CUSTOM_TEMPLATES: EisCustomTemplate[] = [
    {
        id: 'template_global_compliance',
        name: 'Global Regulatory Compliance',
        isTemplate: true,
        axes: [
            {
                id: 'gc_jurisdiction',
                name: 'Jurisdiction Pass Rate',
                weight: 3,
                description: 'Fraction of global jurisdictions where all measured substances pass regulatory limits',
            },
            {
                id: 'gc_margin',
                name: 'Safety Margin',
                weight: 2,
                description: 'Average ratio of measured value to most stringent threshold worldwide (lower = safer)',
            },
            {
                id: 'gc_coverage',
                name: 'Assessment Coverage',
                weight: 1,
                description: 'Fraction of measured substances that have international threshold data available',
            },
        ],
    },
    {
        id: 'template_cost_effectiveness',
        name: 'Custo-Efetividade Ambiental',
        isTemplate: true,
        axes: [
            {
                id: 'ce_cost_meter',
                name: 'Custo/metro',
                weight: 3,
                description: 'Custo de perfuração por metro vs benchmark setorial',
                benchmark: { reference: 350, unit: 'BRL/m', source: 'ABAS 2024' },
            },
            {
                id: 'ce_cost_obs',
                name: 'Custo/observação',
                weight: 2,
                description: 'Custo médio por observação analítica',
                benchmark: { reference: 150, unit: 'BRL/obs', source: 'Catálogo interno' },
            },
            {
                id: 'ce_capex_opex',
                name: 'Ratio CAPEX:OPEX',
                weight: 2,
                description: 'Proporção investimento vs operação (ideal 60:40 a 70:30)',
                benchmark: { reference: 1.5, unit: 'ratio', source: 'FRTR 2023' },
            },
            {
                id: 'ce_coverage',
                name: 'Cobertura/custo',
                weight: 1,
                description: 'Nº de parâmetros monitorados por R$1000 investido',
                benchmark: { reference: 5, unit: 'params/kBRL', source: 'Estimativa' },
            },
        ],
    },
];

/**
 * Definições de benchmark para o template custo-efetividade.
 * Cada entry mapeia um eixo custom a uma função que extrai o valor real do rollup.
 */
export const EIS_COST_BENCHMARKS: CostBenchmark[] = [
    {
        id: 'ce_cost_meter',
        reference: 350,
        computeActual: (rollup: unknown) => {
            const r = rollup as {
                byFamily?: { well?: { capex?: unknown } };
                byCategory?: { capex?: { drilling?: number } };
                kpis?: { totalWellDepthMeters?: number };
            };
            const wellData = r.byFamily?.well;
            if (!wellData || !wellData.capex) return null;
            const drillingCost = r.byCategory?.capex?.drilling || 0;
            const totalDepth = r.kpis?.totalWellDepthMeters || 0;
            return totalDepth > 0 ? drillingCost / totalDepth : null;
        },
    },
    {
        id: 'ce_cost_obs',
        reference: 150,
        computeActual: (rollup: unknown) => {
            const r = rollup as { totalObservationCost?: number; kpis?: { observationCount?: number } };
            const obsCost = r.totalObservationCost || 0;
            const obsCount = r.kpis?.observationCount || 0;
            return obsCount > 0 ? obsCost / obsCount : null;
        },
    },
    {
        id: 'ce_capex_opex',
        reference: 1.5,
        computeActual: (rollup: unknown) => {
            const r = rollup as { totalCapex?: number; totalOpex?: number };
            const capex = r.totalCapex || 0;
            const opex = r.totalOpex || 0;
            return opex > 0 ? capex / opex : null;
        },
    },
    {
        id: 'ce_coverage',
        reference: 5,
        computeActual: (rollup: unknown) => {
            const r = rollup as { grandTotal?: number; kpis?: { uniqueParameterCount?: number } };
            const grandTotal = r.grandTotal || 0;
            const uniqueParams = r.kpis?.uniqueParameterCount || 0;
            return grandTotal > 0 ? uniqueParams / (grandTotal / 1000) : null;
        },
    },
];
