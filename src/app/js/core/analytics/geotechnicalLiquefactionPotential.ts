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
 * Geotechnical Liquefaction Potential Assessment
 *
 * Potencial de liquefação geotécnica conforme:
 * - Seed & Idriss (1971) simplified procedure - CSR calculation
 * - Youd et al. (2001) - updated simplified procedure
 * - Idriss & Boulanger (2004, 2008) - CRR from SPT N-values
 * - Iwasaki et al. (1978) - Liquefaction Potential Index (LPI)
 *
 * References:
 * - Seed HB, Idriss IM (1971). Simplified procedure for evaluating soil
 *   liquefaction potential. J Geotech Eng Div ASCE 97(9):1249–1273.
 * - Youd TL et al. (2001). Liquefaction resistance of soils: summary from
 *   the 1996 NCEER workshop. J Geotech Geoenviron Eng 127(10):817–833.
 * - Idriss IM, Boulanger RW (2004). Semi-empirical procedures for evaluating
 *   liquefaction potential during earthquakes. Proc 11th ICSDEE.
 * - Iwasaki T et al. (1978). A practical method for assessing soil liquefaction
 *   potential based on case studies at various sites in Japan. Proc 2nd ICMFE.
 *
 * Zero dependências DOM/IDB/Three.js/fetch
 * @module geotechnicalLiquefactionPotential
 */

/**
 * Calcula o fator de redução de stress rd (Youd et al. 2001 Eq. 3).
 * Calculates depth-dependent stress reduction factor.
 *
 * @param {number} depth - Profundidade em metros (0 a 23 m)
 * @returns {number} rd - adimensional (0 < rd ≤ 1)
 */
export function stressReductionFactor(depth: any) {
    if (typeof depth !== 'number' || depth < 0) {
        throw new RangeError('depth must be >= 0');
    }
    if (depth > 23) {
        throw new RangeError('Youd (2001) simplified procedure valid only for depth <= 23 m');
    }
    // Equações lineares por faixa de profundidade (Youd et al. 2001, Eq. 3a-d)
    if (depth <= 9.15) return 1.0 - 0.00765 * depth;
    return 1.174 - 0.0267 * depth;
}

/**
 * Calcula o CSR (Cyclic Stress Ratio) - razão de tensão cíclica.
 * Calculates cyclic stress ratio induced by an earthquake.
 *
 * CSR = 0.65 × (σv / σ'v) × (amax / g) × rd
 *
 * @param {number} totalStress   - Tensão vertical total σv (kPa)
 * @param {number} effectiveStress - Tensão efetiva σ'v (kPa)
 * @param {number} amax          - Aceleração de pico do solo (g), ex: 0.15
 * @param {number} rd            - Fator de redução de stress (adimensional)
 * @returns {number} CSR
 */
export function calculateCSR(totalStress: any, effectiveStress: any, amax: any, rd: any) {
    if (typeof totalStress !== 'number' || totalStress <= 0) {
        throw new RangeError('totalStress must be > 0');
    }
    if (typeof effectiveStress !== 'number' || effectiveStress <= 0) {
        throw new RangeError('effectiveStress must be > 0');
    }
    if (typeof amax !== 'number' || amax <= 0 || amax > 2.0) {
        throw new RangeError('amax must be in (0, 2.0] g');
    }
    if (typeof rd !== 'number' || rd <= 0 || rd > 1.0) {
        throw new RangeError('rd must be in (0, 1.0]');
    }
    return 0.65 * (totalStress / effectiveStress) * amax * rd;
}

/**
 * Corrige o SPT N para N1(60) - energia normalizada e sobrecarga.
 * Corrects SPT N-value to N1(60) - energy ratio 60% and overburden correction.
 *
 * N60 = N × (ER / 60)
 * CN  = min(1.7, sqrt(Pa / σ'v))  onde Pa = 100 kPa (pressão atmosférica)
 * N1(60) = CN × N60
 *
 * @param {number} nField        - Valor SPT de campo (golpes/30cm)
 * @param {number} energyRatio   - ER (%), padrão Brasil ER ≈ 72–78%
 * @param {number} effectiveStress - σ'v em kPa
 * @returns {number} N1_60 (corrigido)
 */
export function correctSPT(nField: any, energyRatio: any, effectiveStress: any) {
    if (typeof nField !== 'number' || nField <= 0) {
        throw new RangeError('nField must be > 0');
    }
    if (typeof energyRatio !== 'number' || energyRatio <= 0 || energyRatio > 100) {
        throw new RangeError('energyRatio must be in (0, 100]');
    }
    if (typeof effectiveStress !== 'number' || effectiveStress <= 0) {
        throw new RangeError('effectiveStress must be > 0');
    }
    const N60 = nField * (energyRatio / 60);
    const Pa = 100; // kPa — pressão atmosférica de referência
    const CN = Math.min(1.7, Math.sqrt(Pa / effectiveStress));
    return CN * N60;
}

/**
 * Calcula o CRR baseado em N1(60) - Idriss & Boulanger (2004).
 * Calculates cyclic resistance ratio from corrected SPT blow count.
 *
 * CRR₇.₅ = exp(N1_60/14.1 + (N1_60/126)² − (N1_60/23.6)³ + (N1_60/25.4)⁴ − 2.8)
 * CRR ajustado por MSF = 10^(2.24 / (Mw^2.56)) para magnitudes ≠ 7.5
 *
 * @param {number} n1_60     - SPT corrigido N1(60)
 * @param {number} [mw=7.5]  - Magnitude do sismo (Richter)
 * @returns {{ crr75: number, msf: number, crrAdjusted: number }}
 */
export function calculateCRR(n1_60: any, mw = 7.5) {
    if (typeof n1_60 !== 'number' || n1_60 <= 0 || n1_60 > 60) {
        throw new RangeError('n1_60 must be in (0, 60]');
    }
    if (typeof mw !== 'number' || mw < 5.0 || mw > 9.0) {
        throw new RangeError('mw must be in [5.0, 9.0]');
    }
    const crr75 = Math.exp(n1_60 / 14.1 + (n1_60 / 126) ** 2 - (n1_60 / 23.6) ** 3 + (n1_60 / 25.4) ** 4 - 2.8);
    const msf = 10 ** (2.24 / mw ** 2.56); // Magnitude Scaling Factor
    const crrAdjusted = crr75 * msf;
    return { crr75, msf, crrAdjusted };
}

/**
 * Calcula o Fator de Segurança à Liquefação (FS_L) para uma camada.
 * Calculates factor of safety against liquefaction for a soil layer.
 *
 * FS_L = CRR / CSR
 * FS_L < 1 → liquefação provável; FS_L ≥ 1.2 → sem liquefação
 *
 * @param {number} crr - Cyclic Resistance Ratio
 * @param {number} csr - Cyclic Stress Ratio
 * @returns {{ fsl: number, susceptible: boolean }}
 */
export function safetyFactor(crr: any, csr: any) {
    if (typeof crr !== 'number' || crr <= 0) throw new RangeError('crr must be > 0');
    if (typeof csr !== 'number' || csr <= 0) throw new RangeError('csr must be > 0');
    const fsl = crr / csr;
    return { fsl, susceptible: fsl < 1.0 };
}

/**
 * Calcula o Índice de Potencial de Liquefação (LPI) - Iwasaki et al. (1978).
 * Calculates Liquefaction Potential Index for a soil profile up to 20 m depth.
 *
 * LPI = Σ Fi × Wi × hi
 * Fi = max(0, 1 − FS_L) para FS_L ≤ 1; Fi = 0 para FS_L > 1
 * Wi = 10 − 0.5 × zi (fator de peso por profundidade)
 *
 * @param {Array<{depth: number, thickness: number, fsl: number}>} layers
 *   Camadas com profundidade central zi (m), espessura hi (m) e FS_L
 * @returns {{ lpi: number, severity: string }}
 *   severity: 'very_low'|'low'|'high'|'very_high'
 */
export function calculateLPI(layers: any) {
    if (!Array.isArray(layers) || layers.length === 0) {
        throw new TypeError('layers must be a non-empty array');
    }
    let lpi = 0;
    for (const layer of layers) {
        if (typeof layer.depth !== 'number' || layer.depth < 0 || layer.depth > 20) {
            throw new RangeError('layer depth must be in [0, 20] m');
        }
        if (typeof layer.thickness !== 'number' || layer.thickness <= 0) {
            throw new RangeError('layer thickness must be > 0');
        }
        if (typeof layer.fsl !== 'number' || layer.fsl <= 0) {
            throw new RangeError('layer fsl must be > 0');
        }
        const fi = Math.max(0, 1 - layer.fsl);
        const wi = Math.max(0, 10 - 0.5 * layer.depth);
        lpi += fi * wi * layer.thickness;
    }
    let severity;
    if (lpi < 2) severity = 'very_low';
    else if (lpi < 5) severity = 'low';
    else if (lpi < 15) severity = 'high';
    else severity = 'very_high';
    return { lpi, severity };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const geotechnicalLiquefactionPotentialMeta = {
    name: 'geotechnicalLiquefactionPotential',
    description: 'geotechnicalLiquefactionPotential',
    category: 'analytics',
    familyTags: ['geotechnical'],
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
