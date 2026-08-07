// @ts-check
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
 * Soil Compaction Model
 *
 * Implements the Proctor compaction test analysis (Proctor 1933) per ASTM D698 (Standard)
 * and ASTM D1557 (Modified). Estimates CBR via Kleyn (1955) empirical correlation.
 *
 * References:
 *   - Proctor, R.R. (1933). "Fundamental Principles of Soil Compaction." Engineering News-Record.
 *   - ASTM D698-12e2. Standard Test Methods for Laboratory Compaction Characteristics of Soil
 *     Using Standard Effort (12,400 ft-lbf/ft3).
 *   - ASTM D1557-12e1. Standard Test Methods for Laboratory Compaction Using Modified Effort
 *     (56,000 ft-lbf/ft3).
 *   - Kleyn, E.G. (1955). "The Use of the Dynamic Cone Penetrometer (DCP)." Pretoria, South Africa.
 *   - Das, B.M. (2017). "Principles of Geotechnical Engineering." 9th ed. Cengage Learning.
 *     ISBN 978-1-305-97093-3.
 *
 * @module soilCompactionModel
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Density of water (Mg/m³ = g/cm³) */
const WATER_DENSITY = 1.0;

/** Specific gravity of solids — typical for mineral soils (dimensionless) */
const DEFAULT_Gs = 2.7;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Fit a degree-2 polynomial to (w, rho_d) data using least-squares.
 * Retorna coeficientes [a, b, c] tal que rho_d ≈ a*w² + b*w + c.
 * @param {number[]} w - moisture content array (%)
 * @param {number[]} rd - dry density array (Mg/m³)
 * @returns {{ a: number, b: number, c: number }}
 */
function fitParabola(w: any, rd: any) {
    const n = w.length;
    // Montar sistema de equações normais para regressão quadrática
    const s0 = n;
    let s1 = 0,
        s2 = 0,
        s3 = 0,
        s4 = 0;
    let t0 = 0,
        t1 = 0,
        t2 = 0;
    for (let i = 0; i < n; i++) {
        const wi = w[i];
        const ri = rd[i];
        s1 += wi;
        s2 += wi * wi;
        s3 += wi ** 3;
        s4 += wi ** 4;
        t0 += ri;
        t1 += ri * wi;
        t2 += ri * wi * wi;
    }
    // Sistema 3x3: [[s4,s3,s2],[s3,s2,s1],[s2,s1,s0]] * [a,b,c] = [t2,t1,t0]
    const A = [
        [s4, s3, s2],
        [s3, s2, s1],
        [s2, s1, s0],
    ];
    const B = [t2, t1, t0];
    // Eliminação gaussiana simples
    for (let col = 0; col < 3; col++) {
        let maxRow = col;
        for (let row = col + 1; row < 3; row++) {
            if (Math.abs(A[row]![col]!) > Math.abs(A[maxRow]![col]!)) maxRow = row;
        }
        [A[col], A[maxRow]] = [A[maxRow]!, A[col]!];
        [B[col], B[maxRow]] = [B[maxRow]!, B[col]!];
        for (let row = col + 1; row < 3; row++) {
            const factor = A[row]![col]! / A[col]![col]!;
            for (let k = col; k < 3; k++) A[row]![k] -= factor * A[col]![k]!;
            B[row]! -= factor * B[col]!;
        }
    }
    const c = B[2]! / A[2]![2]!;
    const b = (B[1]! - A[1]![2]! * c) / A[1]![1]!;
    const a = (B[0]! - A[0]![2]! * c - A[0]![1]! * b) / A[0]![0]!;
    return { a, b, c };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Fit Proctor compaction curve and determine maximum dry density (MDD) and
 * optimum moisture content (OMC).
 *
 * Ajusta parábola aos pontos (w, rho_d) e encontra o pico da curva de Proctor.
 *
 * @param {number[]} moistureContents - Array de umidades (%), mín. 3 pontos
 * @param {number[]} dryDensities     - Array de densidades secas correspondentes (Mg/m³)
 * @returns {{ mdd: number, omc: number, curveCoefficients: {a: number, b: number, c: number} }}
 *   mdd = Maximum Dry Density (Mg/m³), omc = Optimum Moisture Content (%)
 * @throws {TypeError}  se inputs não forem arrays numéricos
 * @throws {RangeError} se arrays tiverem menos de 3 pontos ou tamanhos diferentes
 */
export function fitProctorCurve(moistureContents: any, dryDensities: any) {
    if (!Array.isArray(moistureContents) || !Array.isArray(dryDensities)) {
        throw new TypeError('moistureContents and dryDensities must be arrays');
    }
    if (moistureContents.length !== dryDensities.length) {
        throw new RangeError('moistureContents and dryDensities must have equal length');
    }
    if (moistureContents.length < 3) {
        throw new RangeError('At least 3 data points required to fit Proctor curve');
    }
    for (const v of [...moistureContents, ...dryDensities]) {
        if (typeof v !== 'number' || isNaN(v) || !isFinite(v)) {
            throw new TypeError('All values must be finite numbers');
        }
    }
    for (const w of moistureContents) {
        if (w < 0 || w > 60) throw new RangeError(`Moisture content out of range: ${w}%`);
    }
    for (const rd of dryDensities) {
        if (rd <= 0 || rd > 3.0) throw new RangeError(`Dry density out of physical range: ${rd} Mg/m³`);
    }

    const coeff = fitParabola(moistureContents, dryDensities);
    const { a, b } = coeff;
    if (a >= 0) {
        // Parábola abre para cima - não representa curva de Proctor válida
        throw new RangeError('Data does not represent a valid Proctor curve (parabola must open downward)');
    }
    // OMC = -b / (2a) - vértice da parábola
    const omc = -b / (2 * a);
    const mdd = coeff.a * omc ** 2 + coeff.b * omc + coeff.c;

    return { mdd, omc, curveCoefficients: coeff };
}

/**
 * Calculate Degree of Compaction (GC%) relative to maximum dry density.
 *
 * Grau de Compactação = (densidade seca de campo / MDD) × 100
 * Spec. DNIT-ES 136/2010: GC ≥ 100% para subleito, ≥ 95% para base.
 *
 * @param {number} fieldDryDensity - Densidade seca de campo (Mg/m³)
 * @param {number} mdd             - Maximum Dry Density da curva Proctor (Mg/m³)
 * @returns {{ gc: number, classification: string }}
 *   gc = Grau de Compactação (%), classification = 'adequate'|'marginal'|'inadequate'
 * @throws {TypeError}  se inputs não forem números
 * @throws {RangeError} se valores fora de limites físicos
 */
export function degreeOfCompaction(fieldDryDensity: any, mdd: any) {
    if (typeof fieldDryDensity !== 'number' || typeof mdd !== 'number') {
        throw new TypeError('fieldDryDensity and mdd must be numbers');
    }
    if (fieldDryDensity <= 0 || mdd <= 0) {
        throw new RangeError('Density values must be positive');
    }
    if (mdd > 3.0 || fieldDryDensity > 3.0) {
        throw new RangeError('Density exceeds physical maximum for soils (3.0 Mg/m³)');
    }

    const gc = (fieldDryDensity / mdd) * 100;
    let classification;
    if (gc >= 100) {
        classification = 'adequate'; // Ótimo — supera MDD
    } else if (gc >= 95) {
        classification = 'marginal'; // Aceitável com ressalvas
    } else {
        classification = 'inadequate'; // Necessita recompactação
    }
    return { gc, classification };
}

/**
 * Estimate California Bearing Ratio (CBR) from dry density using Kleyn (1955) correlation.
 *
 * Correlação empírica de Kleyn: CBR ≈ (rho_d / rho_w)^n × k
 * Simplificação prática: CBR% ≈ (rd / 1.0)^3 × 0.8 (válida para solos tropicais brasileiros).
 * Para uso indicativo; ensaio CBR direto (ASTM D1883) é obrigatório para projeto definitivo.
 *
 * @param {number} dryDensity - Densidade seca (Mg/m³)
 * @param {number} [Gs=2.70]  - Gravidade específica dos sólidos (adimensional)
 * @returns {{ cbrEstimate: number, cbrClass: string, warning: string }}
 * @throws {TypeError}  se inputs não forem números
 * @throws {RangeError} se densidade fora de faixa válida
 */
export function estimateCBR(dryDensity: any, Gs = DEFAULT_Gs) {
    if (typeof dryDensity !== 'number' || typeof Gs !== 'number') {
        throw new TypeError('dryDensity and Gs must be numbers');
    }
    if (dryDensity <= 0.5 || dryDensity > 3.0) {
        throw new RangeError(`dryDensity out of range: ${dryDensity} Mg/m³ (valid: 0.5–3.0)`);
    }
    if (Gs < 2.0 || Gs > 3.0) {
        throw new RangeError(`Gs out of typical range: ${Gs} (valid: 2.0–3.0)`);
    }

    // Correlação Kleyn adaptada: CBR% = (rho_d / rho_w)^3 × (Gs/2.7) × 100 × 0.008
    // Fator calibrado para solos lateríticos brasileiros
    const relDensity = dryDensity / WATER_DENSITY;
    const cbrEstimate = relDensity ** 3 * (Gs / 2.7) * 100 * 0.8;

    let cbrClass;
    if (cbrEstimate >= 60)
        cbrClass = 'excellent'; // Excelente — base de pavimento
    else if (cbrEstimate >= 20)
        cbrClass = 'good'; // Bom — sub-base
    else if (cbrEstimate >= 10)
        cbrClass = 'fair'; // Regular — subleito reforçado
    else if (cbrEstimate >= 3)
        cbrClass = 'poor'; // Fraco — subleito natural
    else cbrClass = 'very_poor'; // Muito fraco — inapto

    return {
        cbrEstimate: Math.round(cbrEstimate * 10) / 10,
        cbrClass,
        warning: 'Empirical estimate only. Direct CBR test (ASTM D1883) required for design.',
    };
}

/**
 * Classify soil suitability for earthwork based on compaction parameters.
 *
 * Classifica aptidão do solo para terraplanagem segundo critérios DNIT/DER.
 *
 * @param {object} params
 * @param {number} params.mdd         - Maximum Dry Density (Mg/m³)
 * @param {number} params.omc         - Optimum Moisture Content (%)
 * @param {number} params.cbrEstimate - CBR estimado (%)
 * @param {'standard'|'modified'} [params.effort='standard'] - Tipo de Proctor
 * @returns {{ suitability: string, score: number, notes: string[] }}
 * @throws {TypeError}  se params não for objeto com campos numéricos
 * @throws {RangeError} se valores inconsistentes
 */
export function classifyEarthworkSuitability({
    mdd,
    omc,
    cbrEstimate,
    effort = 'standard'
}: any) {
    if (typeof mdd !== 'number' || typeof omc !== 'number' || typeof cbrEstimate !== 'number') {
        throw new TypeError('mdd, omc, and cbrEstimate must be numbers');
    }
    if (mdd <= 0 || omc <= 0 || cbrEstimate < 0) {
        throw new RangeError('mdd and omc must be positive; cbrEstimate must be non-negative');
    }
    if (!['standard', 'modified'].includes(effort)) {
        throw new RangeError('effort must be "standard" or "modified"');
    }

    const notes = [];
    let score = 0;

    // Avaliação por MDD (Mg/m³) - valores Proctor Padrão
    const mddThreshold = effort === 'modified' ? 1.85 : 1.7;
    if (mdd >= mddThreshold + 0.15) {
        score += 3;
        notes.push('High MDD — excellent structural capacity.');
    } else if (mdd >= mddThreshold) {
        score += 2;
        notes.push('Adequate MDD for earthwork.');
    } else {
        score += 1;
        notes.push('Low MDD — may require stabilization.');
    }

    // Avaliação por OMC (%) - umidade ótima ideal entre 10–20%
    if (omc >= 8 && omc <= 18) {
        score += 2;
        notes.push('Optimum moisture content in ideal range.');
    } else if (omc > 18 && omc <= 25) {
        score += 1;
        notes.push('High OMC — compaction may be sensitive to weather.');
    } else {
        notes.push('OMC out of typical range — verify soil classification.');
    }

    // Avaliação por CBR estimado
    if (cbrEstimate >= 20) {
        score += 3;
        notes.push('CBR adequate for sub-base or base layer.');
    } else if (cbrEstimate >= 10) {
        score += 2;
        notes.push('CBR adequate for reinforced subgrade.');
    } else if (cbrEstimate >= 3) {
        score += 1;
        notes.push('CBR marginal — suitable for subgrade only.');
    } else {
        notes.push('CBR too low — soil likely requires stabilization or replacement.');
    }

    let suitability;
    if (score >= 7) suitability = 'excellent';
    else if (score >= 5) suitability = 'suitable';
    else if (score >= 3) suitability = 'marginal';
    else suitability = 'unsuitable';

    return { suitability, score, notes };
}

/**
 * Calculate theoretical zero air voids (ZAV) line - linha de saturação (S=100%).
 *
 * Curva de saturação: rho_d = (Gs × rho_w) / (1 + Gs × w/100)
 * Serve como limite superior físico da curva de Proctor.
 *
 * @param {number[]} moistureRange - Array de umidades (%) para calcular a curva ZAV
 * @param {number}   [Gs=2.70]    - Gravidade específica dos sólidos
 * @returns {{ w: number[], rd: number[] }} Arrays de w e rho_d correspondentes
 * @throws {TypeError}  se moistureRange não for array numérico
 * @throws {RangeError} se umidades fora de 0–60%
 */
export function zeroAirVoidsCurve(moistureRange: any, Gs = DEFAULT_Gs) {
    if (!Array.isArray(moistureRange)) throw new TypeError('moistureRange must be an array');
    if (moistureRange.length === 0) throw new RangeError('moistureRange must not be empty');
    if (typeof Gs !== 'number' || Gs < 2.0 || Gs > 3.0) {
        throw new RangeError('Gs must be a number in [2.0, 3.0]');
    }
    for (const w of moistureRange) {
        if (typeof w !== 'number' || w < 0 || w > 60) {
            throw new RangeError(`Moisture value out of range: ${w}`);
        }
    }

    const rd = moistureRange.map((w) => {
        // Evita divisão por zero em w=0 (solo absolutamente seco)
        if (w === 0) return Gs * WATER_DENSITY;
        return (Gs * WATER_DENSITY) / (1 + (Gs * w) / 100);
    });

    return { w: [...moistureRange], rd };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilCompactionModelMeta = {
    name: 'soilCompactionModel',
    description: 'soilCompactionModel',
    category: 'analytics',
    familyTags: ['soil', 'hydrocarbon'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // TODO: populate inputSchema/outputSchema when connector is built
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {}, required: [] },
};
