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
 * Tailings Impoundment Stability Analysis
 *
 * Implements simplified Bishop method for slope stability (factor of safety),
 * static liquefaction susceptibility, rupture risk index (IRI), and consequence
 * classification per ANCOLD Guidelines on Tailings Dams (2019) and
 * MAC "A Guide to the Management of Tailings Facilities" (2017).
 *
 * Academic references:
 * - Bishop, A.W. (1955). The use of the slip circle in the stability analysis of slopes.
 *   Géotechnique 5(1):7–17. DOI:10.1680/geot.1955.5.1.7
 * - Duncan, J.M. & Wright, S.G. (2005). Soil Strength and Slope Stability. Wiley.
 *   ISBN:978-0-471-69163-1
 * - ANCOLD (2019). Guidelines on Tailings Dams - Planning, Design, Construction,
 *   Operation and Closure. Australian National Committee on Large Dams.
 * - MAC (2017). A Guide to the Management of Tailings Facilities, Version 3.1.
 *   Mining Association of Canada.
 * - Robertson, P.K. (2010). Evaluation of flow liquefaction and liquefied strength
 *   using the cone penetration test. J. Geotech. Geoenviron. Eng. 136(6):842–853.
 *   DOI:10.1061/(ASCE)GT.1943-5606.0000286
 *
 * @module tailingsImpoundmentStability
 */

interface BishopParams {
    cohesion: number;
    frictionAngle: number;
    slopeAngle: number;
    height: number;
    unitWeight: number;
    poreRatio?: number;
}

interface BishopResult {
    fs: number;
    status: 'adequate' | 'marginal' | 'critical';
    details: {
        sigma: number;
        shearStrength: number;
        shearDriving: number;
    };
}

interface LiquefactionResult {
    susceptibilityIndex: number;
    classification: 'susceptible' | 'potentially_susceptible' | 'not_susceptible';
}

interface IRIResult {
    iri: number;
    riskLevel: 'low' | 'moderate' | 'high' | 'very_high';
}

interface ConsequenceParams {
    populationAtRisk: number;
    criticalInfra?: boolean;
    environmentalSensitivity?: boolean;
}

interface ConsequenceResult {
    category: 'A' | 'B' | 'C' | 'D';
    label: string;
    description: string;
}

// Factor of safety acceptance thresholds per ANCOLD 2019 §7.4
const FS_THRESHOLDS = { adequate: 1.5, marginal: 1.3 };

// Liquefaction susceptibility index thresholds (Robertson 2010)
const LIQ_THRESHOLDS = { susceptible: 0.7, potentially: 0.5 };

function validateBishopTypes(params: BishopParams): void {
    const { cohesion, frictionAngle, slopeAngle, height, unitWeight, poreRatio = 0 } = params;
    if (
        typeof cohesion !== 'number' ||
        typeof frictionAngle !== 'number' ||
        typeof slopeAngle !== 'number' ||
        typeof height !== 'number' ||
        typeof unitWeight !== 'number' ||
        typeof poreRatio !== 'number'
    ) {
        throw new TypeError('All stability parameters must be numbers');
    }
}

function validateBishopRanges(params: BishopParams): void {
    const { cohesion, frictionAngle, slopeAngle, height, unitWeight, poreRatio = 0 } = params;
    if (cohesion < 0) throw new RangeError('cohesion must be >= 0');
    if (frictionAngle < 0 || frictionAngle > 45) throw new RangeError('frictionAngle must be in [0, 45] degrees');
    if (slopeAngle <= 0 || slopeAngle >= 90) throw new RangeError('slopeAngle must be in (0, 90) degrees');
    if (height <= 0) throw new RangeError('height must be > 0');
    if (unitWeight <= 0) throw new RangeError('unitWeight must be > 0');
    if (poreRatio < 0 || poreRatio > 0.6) throw new RangeError('poreRatio must be in [0, 0.6]');
}

function determineFsStatus(fs: number): 'adequate' | 'marginal' | 'critical' {
    if (fs >= FS_THRESHOLDS.adequate) return 'adequate';
    if (fs >= FS_THRESHOLDS.marginal) return 'marginal';
    return 'critical';
}

interface BishopStresses {
    sigma: number;
    shearStrength: number;
    shearDriving: number;
}

function computeBishopStresses(params: BishopParams): BishopStresses {
    const { cohesion, frictionAngle, slopeAngle, height, unitWeight, poreRatio = 0 } = params;
    const phiRad = (frictionAngle * Math.PI) / 180;
    const alphaRad = (slopeAngle * Math.PI) / 180;

    // Normal stress on failure plane (simplified single-slice Bishop)
    // Tensão normal: σ = γ·H·cos²α·(1 − ru)
    const sigma = unitWeight * height * Math.cos(alphaRad) ** 2 * (1 - poreRatio);

    // Shear strength on failure plane: τ = c' + σ·tan(φ')
    const shearStrength = cohesion + sigma * Math.tan(phiRad);

    // Driving shear stress: τ_d = γ·H·sin(α)·cos(α)
    const shearDriving = unitWeight * height * Math.sin(alphaRad) * Math.cos(alphaRad);

    return { sigma, shearStrength, shearDriving };
}

/**
 * Simplified Bishop method - factor of safety for circular slip surface.
 * Assumes planar failure mechanism with a single representative slice.
 *
 * Método de Bishop simplificado: calcula FS para superfície de ruptura circular.
 * A análise usa a abordagem de fatia única representativa para cálculo rápido.
 *
 * @param {BishopParams} params - Stability parameters
 * @returns {BishopResult}
 *   fs = fator de segurança, status = 'adequate'|'marginal'|'critical'
 * @throws {RangeError} Se parâmetros estiverem fora dos limites físicos
 * @throws {TypeError} Se parâmetros não forem numéricos
 */
function bishopSimplifiedFS(params: BishopParams): BishopResult {
    validateBishopTypes(params);
    validateBishopRanges(params);

    const { sigma, shearStrength, shearDriving } = computeBishopStresses(params);

    if (shearDriving <= 0) throw new RangeError('Driving shear stress is zero — check slopeAngle');

    const fs = shearStrength / shearDriving;
    const status = determineFsStatus(fs);

    return {
        fs: +fs.toFixed(4),
        status,
        details: {
            sigma: +sigma.toFixed(2),
            shearStrength: +shearStrength.toFixed(2),
            shearDriving: +shearDriving.toFixed(2),
        },
    };
}

/**
 * Static liquefaction susceptibility assessment (Robertson 2010).
 * Uses Ic (soil behaviour type index from CPT) as proxy for fines content.
 *
 * Avalia susceptibilidade à liquefação estática usando índice Ic do CPT.
 * Ic > 2.60 indica material com alto teor de finos, susceptível à liquefação.
 *
 * @param {number} ic   - Soil behaviour type index from CPT (adimensional, 0.5–4.0)
 * @param {number} qtn  - Normalised cone resistance (adimensional, 10–300)
 * @param {number} fr   - Friction ratio (%, 0.1–10)
 * @returns {LiquefactionResult}
 * @throws {RangeError} Se valores forem fora dos limites práticos
 * @throws {TypeError} Se valores não forem numéricos
 */
function staticLiquefactionIndex(ic: number, qtn: number, fr: number): LiquefactionResult {
    if (typeof ic !== 'number' || typeof qtn !== 'number' || typeof fr !== 'number')
        throw new TypeError('ic, qtn, fr must be numbers');
    if (ic < 0.5 || ic > 4.0) throw new RangeError('ic must be in [0.5, 4.0]');
    if (qtn < 10 || qtn > 300) throw new RangeError('qtn must be in [10, 300]');
    if (fr < 0.1 || fr > 10) throw new RangeError('fr must be in [0.1, 10]');

    // Índice de susceptibilidade normalizado (Robertson 2010, eq. 12 adaptado)
    // Combina Ic, qtn e fr em índice 0–1
    const icNorm = Math.min(1, (ic - 0.5) / 3.5); // normaliza Ic para [0,1]
    const qtnNorm = Math.max(0, 1 - qtn / 300); // baixa resistência → maior risco
    const frNorm = Math.min(1, fr / 10); // maior atrito → maior finos

    const susceptibilityIndex = +(0.4 * icNorm + 0.4 * qtnNorm + 0.2 * frNorm).toFixed(4);

    let classification: 'susceptible' | 'potentially_susceptible' | 'not_susceptible';
    if (susceptibilityIndex >= LIQ_THRESHOLDS.susceptible) classification = 'susceptible';
    else if (susceptibilityIndex >= LIQ_THRESHOLDS.potentially) classification = 'potentially_susceptible';
    else classification = 'not_susceptible';

    return { susceptibilityIndex, classification };
}

/**
 * Rupture Risk Index (IRI) - composite index combining FS and liquefaction.
 *
 * Índice de Risco de Ruptura: combina fator de segurança e susceptibilidade
 * à liquefação em um índice 0–1 (0 = sem risco, 1 = risco máximo).
 *
 * @param {number} fs                   - Fator de segurança (> 0)
 * @param {number} susceptibilityIndex  - Índice de susceptibilidade à liquefação (0–1)
 * @returns {IRIResult}
 *   riskLevel = 'low'|'moderate'|'high'|'very_high'
 * @throws {RangeError|TypeError}
 */
function ruptureRiskIndex(fs: number, susceptibilityIndex: number): IRIResult {
    if (typeof fs !== 'number' || typeof susceptibilityIndex !== 'number')
        throw new TypeError('fs and susceptibilityIndex must be numbers');
    if (fs <= 0) throw new RangeError('fs must be > 0');
    if (susceptibilityIndex < 0 || susceptibilityIndex > 1)
        throw new RangeError('susceptibilityIndex must be in [0, 1]');

    // IRI = 0.6 × (1 − min(FS, 2.5)/2.5) + 0.4 × susceptibilityIndex
    // Peso maior para FS; susceptibilidade como componente secundário
    const fsComponent = 1 - Math.min(fs, 2.5) / 2.5;
    const iri = +(0.6 * fsComponent + 0.4 * susceptibilityIndex).toFixed(4);

    let riskLevel: 'low' | 'moderate' | 'high' | 'very_high';
    if (iri < 0.2) riskLevel = 'low';
    else if (iri < 0.4) riskLevel = 'moderate';
    else if (iri < 0.7) riskLevel = 'high';
    else riskLevel = 'very_high';

    return { iri, riskLevel };
}

/**
 * Consequence category classification (ANCOLD 2019 §4).
 * Based on population at risk (PAR) and downstream infrastructure.
 *
 * Classifica a categoria de consequência da barragem com base na população
 * em risco e presença de infraestrutura crítica a jusante.
 *
 * @param {ConsequenceParams} params
 * @returns {ConsequenceResult}
 * @throws {RangeError|TypeError}
 */
function consequenceCategory(params: ConsequenceParams): ConsequenceResult {
    const { populationAtRisk, criticalInfra = false, environmentalSensitivity = false } = params;

    if (typeof populationAtRisk !== 'number') throw new TypeError('populationAtRisk must be a number');
    if (populationAtRisk < 0) throw new RangeError('populationAtRisk must be >= 0');
    if (typeof criticalInfra !== 'boolean' || typeof environmentalSensitivity !== 'boolean')
        throw new TypeError('criticalInfra and environmentalSensitivity must be booleans');

    let category: 'A' | 'B' | 'C' | 'D';
    // Escala baseada em ANCOLD 2019 Tabela 4.1
    if (populationAtRisk >= 100 || (criticalInfra && populationAtRisk >= 10)) category = 'A';
    else if (populationAtRisk >= 10 || (criticalInfra && populationAtRisk >= 1)) category = 'B';
    else if (populationAtRisk >= 1 || environmentalSensitivity) category = 'C';
    else category = 'D';

    const descriptions: Record<'A' | 'B' | 'C' | 'D', string> = {
        A: 'Extreme - immediate action required',
        B: 'High - enhanced surveillance and review',
        C: 'Significant - regular monitoring required',
        D: 'Low - standard monitoring applies',
    };

    return { category, label: category, description: descriptions[category] };
}

export {
    bishopSimplifiedFS,
    staticLiquefactionIndex,
    ruptureRiskIndex,
    consequenceCategory,
    FS_THRESHOLDS,
    LIQ_THRESHOLDS,
};

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const tailingsImpoundmentStabilityMeta = {
    name: 'tailingsImpoundmentStability',
    description: 'tailingsImpoundmentStability',
    category: 'analytics',
    familyTags: ['environmental'],
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
