// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * Environmental Green Chemistry Schema - Schema de quimica verde e metricas
 * de processo aplicadas a operacoes industriais ambientais.
 *
 * Avalia processos quimicos contra os 12 Principios da Quimica Verde
 * (Anastas & Warner, 1998) usando metricas operacionais consagradas:
 * E-factor (Sheldon, 1992), atom economy (Trost, 1991), Process Mass
 * Intensity (PMI, GSK), greenness de solventes (CHEM21 / ACS GCI) e
 * eficiencia energetica. Suporta auditoria de operacoes ambientais
 * (remediacao quimica, tratamento de efluentes, sintese de reagentes
 * de campo) sob ABNT NBR ISO 14040 (LCA) e CONAMA 357 (efluentes).
 *
 * Referencias regulatorias e cientificas:
 *  - Anastas, P.T. & Warner, J.C. (1998). Green Chemistry: Theory and
 *    Practice. Oxford University Press, New York. (12 Principles framework)
 *  - Trost, B.M. (1991). The Atom Economy - A Search for Synthetic
 *    Efficiency. Science, 254(5037), 1471-1477. DOI: 10.1126/science.1962206
 *  - Sheldon, R.A. (1992). Organic Synthesis: Past, Present and Future.
 *    Chemistry & Industry, 23, 903-906. (E-factor metric)
 *  - American Chemical Society Green Chemistry Institute (ACS GCI). GCI
 *    Pharmaceutical Roundtable Solvent Selection Guide. Latest edition.
 *  - Jimenez-Gonzalez, C. et al. (2011). Expanding GSK's Solvent Selection
 *    Guide. Green Chemistry, 13, 854-862. DOI: 10.1039/c0gc00918k
 *  - CHEM21 selection guide of classical and less classical solvents
 *    (Prat et al., 2016). Green Chem., 18, 288-296.
 *  - ABNT NBR ISO 14040:2009 (Avaliacao do ciclo de vida - Principios
 *    e estrutura); ABNT NBR ISO 14044:2009 (Requisitos e diretrizes).
 *  - Brasil - CONAMA Resolucao 357/2005 (lancamento de efluentes).
 *  - Brasil - Lei n. 12.305/2010 (Politica Nacional de Residuos Solidos).
 *
 * Zero dependencias DOM/IDB/Three.js/fetch. Pure-logic.
 * @module environmentalGreenChemistrySchema
 */

/** Os 12 Principios canonicos da Quimica Verde (Anastas & Warner, 1998). */
export const GREEN_PRINCIPLE = Object.freeze({
    PREVENTION_WASTE: 'PREVENTION_WASTE',
    ATOM_ECONOMY: 'ATOM_ECONOMY',
    LESS_HAZARDOUS: 'LESS_HAZARDOUS',
    SAFER_DESIGN: 'SAFER_DESIGN',
    SAFER_SOLVENTS: 'SAFER_SOLVENTS',
    ENERGY_EFFICIENCY: 'ENERGY_EFFICIENCY',
    RENEWABLE_FEEDSTOCK: 'RENEWABLE_FEEDSTOCK',
    REDUCE_DERIVATIVES: 'REDUCE_DERIVATIVES',
    CATALYSIS: 'CATALYSIS',
    DESIGN_DEGRADATION: 'DESIGN_DEGRADATION',
    REAL_TIME_ANALYSIS: 'REAL_TIME_ANALYSIS',
    INHERENT_SAFETY: 'INHERENT_SAFETY',
});

/** Tipos de processo industrial avaliaveis pelo schema. */
export const PROCESS_TYPE = Object.freeze({
    BATCH: 'BATCH',
    CONTINUOUS_FLOW: 'CONTINUOUS_FLOW',
    BIOCATALYSIS: 'BIOCATALYSIS',
    PHOTOCATALYSIS: 'PHOTOCATALYSIS',
    ELECTROCHEMICAL: 'ELECTROCHEMICAL',
    MECHANOCHEMICAL: 'MECHANOCHEMICAL',
});

/** Classes de greenness de solventes (CHEM21 / ACS GCI). */
export const SOLVENT_CLASS = Object.freeze({
    PREFERRED: 'PREFERRED',
    USABLE: 'USABLE',
    UNDESIRABLE: 'UNDESIRABLE',
    NOT_RECOMMENDED: 'NOT_RECOMMENDED',
});

/** Faixa categorica de avaliacao final greenness. */
export const GREEN_RATING = Object.freeze({
    EXEMPLARY: 'EXEMPLARY',
    GREEN: 'GREEN',
    ACCEPTABLE: 'ACCEPTABLE',
    NEEDS_IMPROVEMENT: 'NEEDS_IMPROVEMENT',
});

/** Codigos de erro emitidos pelo schema. */
export const GREEN_CHEM_ERROR = Object.freeze({
    INVALID_PROCESS: 'INVALID_PROCESS',
    INVALID_PRINCIPLE: 'INVALID_PRINCIPLE',
    INVALID_VALUE: 'INVALID_VALUE',
});

/**
 * Pesos relativos dos 12 Principios - soma 1.0. Calibrados a partir
 * de Anastas & Warner (1998) com enfase ambiental: PREVENTION + ATOM
 * + LESS_HAZARDOUS + SAFER_SOLVENTS + ENERGY recebem maior peso por
 * impacto direto em LCA (ISO 14040).
 */
export const PRINCIPLE_WEIGHT = Object.freeze({
    PREVENTION_WASTE: 0.15,
    ATOM_ECONOMY: 0.12,
    LESS_HAZARDOUS: 0.1,
    SAFER_DESIGN: 0.08,
    SAFER_SOLVENTS: 0.1,
    ENERGY_EFFICIENCY: 0.1,
    RENEWABLE_FEEDSTOCK: 0.08,
    REDUCE_DERIVATIVES: 0.05,
    CATALYSIS: 0.1,
    DESIGN_DEGRADATION: 0.05,
    REAL_TIME_ANALYSIS: 0.04,
    INHERENT_SAFETY: 0.03,
});

/**
 * Benchmarks E-factor por setor industrial (kg residuo / kg produto)
 * conforme Sheldon (1992, atualizado 2017). Bulk = 1, Fine = 30,
 * Pharma = 100, Consumer = 5.
 */
export const E_FACTOR_BENCHMARK = Object.freeze({
    BULK: 1,
    FINE: 30,
    PHARMA: 100,
    CONSUMER: 5,
});

/**
 * Greenness de solventes selecionados (CHEM21 / GSK Solvent Selection
 * Guide). Lista nao-exaustiva - usar `USABLE` como default seguro.
 */
export const SOLVENT_GREENNESS = Object.freeze({
    water: 'PREFERRED',
    ethanol: 'PREFERRED',
    acetone: 'USABLE',
    methanol: 'USABLE',
    dichloromethane: 'UNDESIRABLE',
    chloroform: 'NOT_RECOMMENDED',
    benzene: 'NOT_RECOMMENDED',
});

/** Target PMI (Process Mass Intensity) para industria farmaceutica (GSK). */
export const PMI_TARGET_PHARMA = 50;

/** Identidade do modulo. */
export const GREEN_CHEMISTRY_META = Object.freeze({
    spec: 'GREEN_CHEMISTRY_SCHEMA_001',
    deliveredAt: '2026-05-02',
    framework: 'Anastas-Warner-Sheldon-Trost',
    principles: Object.values(GREEN_PRINCIPLE),
});

/** Erro tipado lancado pelo schema. */
export class GreenChemError extends Error {
    code: string;
    /**
     * @param {string} code
     * @param {string} [message?]
     */
    constructor(code: string, message?: string) {
        super(message || code);
        this.name = 'GreenChemError';
        this.code = code;
    }
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** @param {any} v */
function isPositiveFinite(v: any) {
    return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** @param {any} v */
function isNonNegativeFinite(v: any) {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/** @param {any} v */
function isInRange0to100(v: any) {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
}

/** Valida campos de entrada de createProcessMetrics. */
function _validateProcessInput(input: any) {
    const {
        processId,
        type,
        productMassKg,
        totalInputsMassKg,
        theoreticalMassKg,
        energyKWh,
        solvent,
        principleScores,
    } = input;
    if (typeof processId !== 'string' || processId.trim().length === 0) {
        throw new GreenChemError(GREEN_CHEM_ERROR.INVALID_PROCESS, 'processId must be non-empty string');
    }
    if (!((Object.values(PROCESS_TYPE) as any[]).includes(type))) {
        throw new GreenChemError(GREEN_CHEM_ERROR.INVALID_PROCESS, `unknown type: ${type}`);
    }
    if (!isPositiveFinite(productMassKg)) {
        throw new GreenChemError(GREEN_CHEM_ERROR.INVALID_VALUE, 'productMassKg must be > 0');
    }
    if (!isPositiveFinite(totalInputsMassKg)) {
        throw new GreenChemError(GREEN_CHEM_ERROR.INVALID_VALUE, 'totalInputsMassKg must be > 0');
    }
    if (!isPositiveFinite(theoreticalMassKg)) {
        throw new GreenChemError(GREEN_CHEM_ERROR.INVALID_VALUE, 'theoreticalMassKg must be > 0');
    }
    if (!isNonNegativeFinite(energyKWh)) {
        throw new GreenChemError(GREEN_CHEM_ERROR.INVALID_VALUE, 'energyKWh must be >= 0');
    }
    if (typeof solvent !== 'string' || solvent.trim().length === 0) {
        throw new GreenChemError(GREEN_CHEM_ERROR.INVALID_VALUE, 'solvent must be non-empty string');
    }
    if (!principleScores || typeof principleScores !== 'object') {
        throw new GreenChemError(GREEN_CHEM_ERROR.INVALID_PRINCIPLE, 'principleScores must be object');
    }
    for (const [k, v] of Object.entries(principleScores)) {
        if (!((Object.values(GREEN_PRINCIPLE) as any[]).includes(k))) {
            throw new GreenChemError(GREEN_CHEM_ERROR.INVALID_PRINCIPLE, `unknown principle: ${k}`);
        }
        if (!isInRange0to100(v)) {
            throw new GreenChemError(GREEN_CHEM_ERROR.INVALID_VALUE, `principleScores.${k} must be in [0,100]`);
        }
    }
}

/** Resolve classe de greenness do solvente. */
function _resolveSolventClass(solvent: string): { solventKey: string; solventClass: string } {
    const solventKey = String(solvent).toLowerCase();
    const solventClass = (SOLVENT_GREENNESS as Record<string, string>)[solventKey] || SOLVENT_CLASS.USABLE;
    return { solventKey, solventClass };
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Cria registro frozen de metricas de processo quimico. Computa derivados
 * E-factor, atom economy, PMI e classe de solvente automaticamente.
 *
 * Formulas:
 *  - E-factor = (totalInputsMassKg - productMassKg) / productMassKg
 *  - atomEconomy = (theoreticalMassKg / totalInputsMassKg) * 100
 *  - PMI = totalInputsMassKg / productMassKg
 *
 * @param {Object} input
 * @param {string} input.processId
 * @param {string} input.type - valor de PROCESS_TYPE
 * @param {number} input.productMassKg - massa de produto (>0)
 * @param {number} input.totalInputsMassKg - soma de todas as entradas (>0)
 * @param {number} input.theoreticalMassKg - massa teorica esperada (>0)
 * @param {number} input.energyKWh - energia total consumida (>=0)
 * @param {string} [input.solvent='water'] - nome do solvente principal
 * @param {Record<string, number>} [input.principleScores] - map GREEN_PRINCIPLE -> [0,100]
 * @returns {Object} frozen process metrics
 */
export function createProcessMetrics(input: any = {}) {
    const {
        processId,
        type,
        productMassKg,
        totalInputsMassKg,
        theoreticalMassKg,
        energyKWh,
        solvent = 'water',
        principleScores = {},
    } = input;

    _validateProcessInput(input);

    const eFactor = (totalInputsMassKg - productMassKg) / productMassKg;
    const atomEconomy = (theoreticalMassKg / totalInputsMassKg) * 100;
    const pmi = totalInputsMassKg / productMassKg;
    const { solventKey, solventClass } = _resolveSolventClass(solvent);

    return Object.freeze({
        processId,
        type,
        productMassKg,
        totalInputsMassKg,
        theoreticalMassKg,
        energyKWh,
        solvent: solventKey,
        solventClass,
        eFactor,
        atomEconomy,
        pmi,
        principleScores: Object.freeze({ ...principleScores }),
    });
}

/**
 * Avalia greenness composta de um processo. Score = soma ponderada
 * dos PRINCIPLE_WEIGHT * principleScores[principle]. Principios ausentes
 * recebem default neutro 50.
 *
 * Faixas: >=85 EXEMPLARY, >=70 GREEN, >=50 ACCEPTABLE, else NEEDS_IMPROVEMENT.
 *
 * @param {any} metrics - saida de createProcessMetrics
 * @returns {Object} frozen { score, rating }
 */
export function assessGreenness(metrics: any): Object {
    if (!metrics || typeof metrics !== 'object') {
        throw new GreenChemError(GREEN_CHEM_ERROR.INVALID_PROCESS, 'metrics must be object');
    }
    const scores = metrics.principleScores || {};
    let score = 0;
    for (const principle of Object.values(GREEN_PRINCIPLE)) {
        const weight = PRINCIPLE_WEIGHT[principle];
        const raw = Object.prototype.hasOwnProperty.call(scores, principle) ? scores[principle] : 50;
        score += weight * raw;
    }
    score = Math.max(0, Math.min(100, score));

    let rating;
    if (score >= 85) rating = GREEN_RATING.EXEMPLARY;
    else if (score >= 70) rating = GREEN_RATING.GREEN;
    else if (score >= 50) rating = GREEN_RATING.ACCEPTABLE;
    else rating = GREEN_RATING.NEEDS_IMPROVEMENT;

    return Object.freeze({ score, rating });
}

/**
 * Compara metricas a benchmark setorial.
 *
 * @param {any} metrics
 * @param {string} [sector='FINE'] - chave de E_FACTOR_BENCHMARK
 * @returns {Object} frozen comparison
 */
export function compareToBenchmark(metrics: any, sector: string = 'FINE'): Object {
    if (!metrics || typeof metrics !== 'object') {
        throw new GreenChemError(GREEN_CHEM_ERROR.INVALID_PROCESS, 'metrics must be object');
    }
    if (!Object.prototype.hasOwnProperty.call(E_FACTOR_BENCHMARK, sector)) {
        throw new GreenChemError(GREEN_CHEM_ERROR.INVALID_VALUE, `unknown sector: ${sector}`);
    }
    const benchmark = (E_FACTOR_BENCHMARK as Record<string, number>)[sector] ?? 0;
    const eFactorVsBenchmark = metrics.eFactor / benchmark;
    const passesEFactor = metrics.eFactor < benchmark;
    const passesPMI = metrics.pmi < PMI_TARGET_PHARMA;
    const isGreenSolvent =
        metrics.solventClass === SOLVENT_CLASS.PREFERRED || metrics.solventClass === SOLVENT_CLASS.USABLE;

    return Object.freeze({
        sector,
        benchmark,
        eFactorVsBenchmark,
        passesEFactor,
        passesPMI,
        isGreenSolvent,
    });
}

/**
 * Sugere acoes de melhoria baseadas em red flags detectadas.
 *
 * @param {any} metrics - saida de createProcessMetrics
 * @returns {Array<string>} lista de recomendacoes
 */
export function recommendImprovements(metrics: any): Array<string> {
    if (!metrics || typeof metrics !== 'object') return [];
    const recs = [];
    if (metrics.type === PROCESS_TYPE.BATCH) {
        recs.push('switch to flow chemistry');
    }
    if (metrics.solventClass === SOLVENT_CLASS.NOT_RECOMMENDED) {
        recs.push(`replace ${metrics.solvent}`);
    }
    if (metrics.solventClass === SOLVENT_CLASS.UNDESIRABLE) {
        recs.push(`replace ${metrics.solvent}`);
    }
    // Energia: heuristica simples - > 100 kWh por kg de produto considerado intenso
    if (metrics.energyKWh > 100 * metrics.productMassKg) {
        recs.push('reduce energy consumption');
    }
    // Atom economy abaixo de 50% sinaliza investigar biocatalise
    if (metrics.atomEconomy < 50) {
        recs.push('investigate biocatalysis');
    }
    return recs;
}

/**
 * Constroi relatorio agregado frozen sobre um conjunto de processos.
 *
 * @param {Array<any>} processes - saidas de createProcessMetrics
 * @returns {Object} frozen report
 */
type ReportAccumulator = {
    totalProductMassKg: number;
    weightedEFactorNum: number;
    weightedPMINum: number;
    weightedAtomEconomyNum: number;
    ratingBreakdown: Record<string, number>;
    solventClassBreakdown: Record<string, number>;
};

function _createEmptyAccumulator(): ReportAccumulator {
    return {
        totalProductMassKg: 0,
        weightedEFactorNum: 0,
        weightedPMINum: 0,
        weightedAtomEconomyNum: 0,
        ratingBreakdown: {
            [GREEN_RATING.EXEMPLARY]: 0,
            [GREEN_RATING.GREEN]: 0,
            [GREEN_RATING.ACCEPTABLE]: 0,
            [GREEN_RATING.NEEDS_IMPROVEMENT]: 0,
        },
        solventClassBreakdown: {
            [SOLVENT_CLASS.PREFERRED]: 0,
            [SOLVENT_CLASS.USABLE]: 0,
            [SOLVENT_CLASS.UNDESIRABLE]: 0,
            [SOLVENT_CLASS.NOT_RECOMMENDED]: 0,
        },
    };
}

function _accumulateProcess(acc: ReportAccumulator, p: any) {
    if (!isPositiveFinite(p.productMassKg)) return;
    acc.totalProductMassKg += p.productMassKg;
    if (Number.isFinite(p.eFactor)) acc.weightedEFactorNum += p.eFactor * p.productMassKg;
    if (Number.isFinite(p.pmi)) acc.weightedPMINum += p.pmi * p.productMassKg;
    if (Number.isFinite(p.atomEconomy)) acc.weightedAtomEconomyNum += p.atomEconomy * p.productMassKg;
    if (p.solventClass && acc.solventClassBreakdown[p.solventClass] !== undefined) {
        acc.solventClassBreakdown[p.solventClass] = (acc.solventClassBreakdown[p.solventClass] ?? 0) + 1;
    }
    const { rating } = (assessGreenness(p) as any);
    if (acc.ratingBreakdown[rating] !== undefined) acc.ratingBreakdown[rating] = (acc.ratingBreakdown[rating] ?? 0) + 1;
}

function _computeWeightedAverages(acc: ReportAccumulator) {
    const div = acc.totalProductMassKg > 0 ? acc.totalProductMassKg : 0;
    return {
        weightedAvgEFactor: div > 0 ? acc.weightedEFactorNum / div : 0,
        weightedAvgPMI: div > 0 ? acc.weightedPMINum / div : 0,
        weightedAvgAtomEconomy: div > 0 ? acc.weightedAtomEconomyNum / div : 0,
    };
}

export function buildGreenChemistryReport(processes: Array<any>): Object {
    const safe = Array.isArray(processes) ? processes.filter((p) => p && typeof p === 'object') : [];
    const acc = _createEmptyAccumulator();

    for (const p of safe) {
        _accumulateProcess(acc, p);
    }

    const { weightedAvgEFactor, weightedAvgPMI, weightedAvgAtomEconomy } = _computeWeightedAverages(acc);

    return Object.freeze({
        totalProcesses: safe.length,
        totalProductMassKg: acc.totalProductMassKg,
        weightedAvgEFactor,
        weightedAvgPMI,
        weightedAvgAtomEconomy,
        ratingBreakdown: Object.freeze({ ...acc.ratingBreakdown }),
        solventClassBreakdown: Object.freeze({ ...acc.solventClassBreakdown }),
        exemplaryCount: acc.ratingBreakdown[GREEN_RATING.EXEMPLARY],
        criticalCount: acc.ratingBreakdown[GREEN_RATING.NEEDS_IMPROVEMENT],
    });
}
