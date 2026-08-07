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
 * Soil Liquidity Index - Soil Liquefaction Analysis
 *
 * Implements the simplified procedure for liquefaction susceptibility assessment.
 *
 * Academic references:
 * - Idriss, I.M. & Boulanger, R.W. (2008). Soil Liquefaction During Earthquakes.
 *   Earthquake Engineering Research Institute (EERI), MNO-12. ISBN 978-1-932884-36-2
 * - Iwasaki, T., Tatsuoka, F., Tokida, K. & Yasuda, S. (1978). A practical method
 *   for assessing soil liquefaction potential based on case studies at various sites
 *   in Japan. Proceedings of 2nd International Conference on Microzonation, pp. 885-896.
 * - Seed, H.B. & Idriss, I.M. (1971). Simplified procedure for evaluating soil
 *   liquefaction potential. ASCE J. Soil Mech. Found. Div. 97(SM9):1249-1273.
 * - Youd, T.L. et al. (2001). Liquefaction resistance of soils: Summary report from
 *   the 1996 NCEER and 1998 NCEER/NSF workshops. ASCE J. Geotech. Geoenviron. Eng.
 *   127(10):817-833. DOI: 10.1061/(ASCE)1090-0241(2001)127:10(817)
 *
 * Zero DOM/IDB/Three.js/fetch dependencies. Pure math functions only.
 *
 * @module soilLiquidityIndex
 */

interface FactorOfSafetyParams {
    n1_60: number;
    sigmaV: number;
    sigmaVEff: number;
    amax: number;
    depth: number;
    mw: number;
}

interface FactorOfSafetyResult {
    fs: number;
    csr: number;
    crr75: number;
    msf: number;
    rd: number;
}

interface Layer {
    depth: number;
    thickness: number;
    fs: number;
}

interface LPIResult {
    lpi: number;
    category: string;
}

/**
 * Stress reduction factor (rd) - reduz a tensão cisalhante com a profundidade.
 * Simplified from Idriss (1999) as cited in Youd et al. (2001).
 *
 * @param {number} depth - Profundidade abaixo da superfície (m), >= 0
 * @returns {number} rd - fator de redução de tensão (adimensional, 0–1)
 */
function stressReductionFactor(depth: number): number {
    if (typeof depth !== 'number' || !isFinite(depth)) {
        throw new TypeError('depth must be a finite number');
    }
    if (depth < 0) {
        throw new RangeError('depth must be >= 0 m');
    }
    // Idriss (1999) piecewise linear approximation, valid to ~20 m
    if (depth <= 9.15) {
        return 1.0 - 0.00765 * depth;
    }
    if (depth <= 23.0) {
        return 1.174 - 0.0267 * depth;
    }
    // Abaixo de 23 m a confiança diminui; extrapolação conservadora
    return Math.max(0.0, 1.174 - 0.0267 * depth);
}

/**
 * Cyclic Stress Ratio (CSR) - razão de tensão cíclica induzida pelo sismo.
 * Equação 1 de Youd et al. (2001): CSR = 0.65 * (sigma_v / sigma_v') * (a_max/g) * rd
 *
 * @param {number} sigmaV     - Tensão vertical total (kPa), > 0
 * @param {number} sigmaVEff  - Tensão vertical efetiva (kPa), > 0
 * @param {number} amax       - Aceleração de pico do solo (g), > 0
 * @param {number} depth      - Profundidade (m), >= 0
 * @returns {number} CSR - adimensional
 */
function computeCSR(sigmaV: number, sigmaVEff: number, amax: number, depth: number): number {
    if ([sigmaV, sigmaVEff, amax, depth].some((v) => typeof v !== 'number' || !isFinite(v))) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (sigmaV <= 0) throw new RangeError('sigmaV must be > 0 kPa');
    if (sigmaVEff <= 0) throw new RangeError('sigmaVEff must be > 0 kPa');
    if (amax <= 0) throw new RangeError('amax must be > 0 g');
    if (depth < 0) throw new RangeError('depth must be >= 0 m');

    const rd = stressReductionFactor(depth);
    return 0.65 * (sigmaV / sigmaVEff) * amax * rd;
}

/**
 * Cyclic Resistance Ratio (CRR_7.5) para solos arenosos via SPT (N1)60.
 * Boulanger & Idriss (2004) polynomial fit para Mw = 7.5.
 * Válido para (N1)60 < 30 (acima, considera-se não-liquefiável).
 *
 * @param {number} n1_60 - SPT corrigido (N1)60 (golpes/30cm), 0–37
 * @returns {number} CRR_7.5 - adimensional
 */
function computeCRR75(n1_60: number): number {
    if (typeof n1_60 !== 'number' || !isFinite(n1_60)) {
        throw new TypeError('n1_60 must be a finite number');
    }
    if (n1_60 < 0) throw new RangeError('n1_60 must be >= 0');
    // Valores >= 30 classificados como praticamente não-liquefiáveis
    if (n1_60 >= 30) return Infinity;

    // Idriss & Boulanger (2008) Eq. 2.19 - ajuste polinomial
    const x = n1_60 / 14.1;
    const x2 = n1_60 / 126;
    const x3 = n1_60 / 23.6;
    const x4 = n1_60 / 25.4;
    return Math.exp(x - x2 * x2 - Math.pow(x3, 3) + Math.pow(x4, 4) - 2.8);
}

/**
 * Magnitude Scaling Factor (MSF) - ajusta CRR para magnitudes != 7.5.
 * Idriss (1999) conforme Youd et al. (2001) Eq. 5.
 *
 * @param {number} mw - Magnitude de momento (Mw), 5.0–8.5
 * @returns {number} MSF - adimensional
 */
function magnitudeScalingFactor(mw: number): number {
    if (typeof mw !== 'number' || !isFinite(mw)) {
        throw new TypeError('mw must be a finite number');
    }
    if (mw < 5.0 || mw > 8.5) {
        throw new RangeError('mw must be between 5.0 and 8.5');
    }
    return Math.pow(10, 2.24) / Math.pow(mw, 2.56);
}

/**
 * Factor of Safety against liquefaction (FS_L).
 * FS_L = (CRR_7.5 * MSF) / CSR
 * FS_L < 1.0 → solo provavelmente liquefia; >= 1.2 → seguro
 *
 * @param {object} params
 * @param {number} params.n1_60    - SPT corrigido
 * @param {number} params.sigmaV   - Tensão vertical total (kPa)
 * @param {number} params.sigmaVEff- Tensão vertical efetiva (kPa)
 * @param {number} params.amax     - Aceleração de pico (g)
 * @param {number} params.depth    - Profundidade (m)
 * @param {number} params.mw       - Magnitude de momento
 * @returns {{ fs: number, csr: number, crr75: number, msf: number, rd: number }}
 */
function computeFactorOfSafety({ n1_60, sigmaV, sigmaVEff, amax, depth, mw }: FactorOfSafetyParams): FactorOfSafetyResult {
    const csr = computeCSR(sigmaV, sigmaVEff, amax, depth);
    const crr75 = computeCRR75(n1_60);
    const msf = magnitudeScalingFactor(mw);
    const rd = stressReductionFactor(depth);

    // FS infinito se CRR = Infinity (solo resistente)
    const fs = crr75 === Infinity ? Infinity : (crr75 * msf) / csr;

    return { fs, csr, crr75, msf, rd };
}

/**
 * Liquefaction Potential Index (LPI) - Índice de potencial de liquefação.
 * Iwasaki et al. (1978): LPI = integral de 0 a 20m de F(z)*W(z)*dz
 * Discretizado por camadas de solo.
 *
 * Classificação de Toprak & Holzer (2003):
 *  LPI = 0          → nenhum
 *  0 < LPI <= 5     → baixo
 *  5 < LPI <= 15    → alto
 *  LPI > 15         → muito alto
 *
 * @param {Array<{depth: number, thickness: number, fs: number}>} layers
 *   Camadas de solo ordenadas por profundidade crescente, até 20 m.
 *   depth     - profundidade do centro da camada (m)
 *   thickness - espessura da camada (m), > 0
 *   fs        - fator de segurança contra liquefação para a camada
 * @returns {{ lpi: number, category: string }}
 */
function computeLPI(layers: Layer[]): LPIResult {
    if (!Array.isArray(layers) || layers.length === 0) {
        throw new TypeError('layers must be a non-empty array');
    }

    let lpi = 0;

    for (const layer of layers) {
        const { depth, thickness, fs } = layer;
        if (typeof depth !== 'number' || typeof thickness !== 'number' || typeof fs !== 'number') {
            throw new TypeError('Each layer must have numeric depth, thickness, and fs');
        }
        if (thickness <= 0) throw new RangeError('layer thickness must be > 0');
        if (depth < 0) throw new RangeError('layer depth must be >= 0');

        // Considera apenas camadas dentro de 20 m de profundidade (Iwasaki 1978)
        if (depth > 20) continue;

        // F(z): funciton de liquefabilidade
        const F = fs < 1.0 ? 1.0 - fs : 0.0;

        // W(z): função de peso - maior peso nas camadas superficiais
        const W = 10.0 - 0.5 * depth;
        const Weff = Math.max(0, W);

        lpi += F * Weff * thickness;
    }

    // Classificação de risco sísmico-geotécnico
    let category: string;
    if (lpi === 0) {
        category = 'none';
    } else if (lpi <= 5) {
        category = 'low';
    } else if (lpi <= 15) {
        category = 'high';
    } else {
        category = 'very_high';
    }

    return { lpi, category };
}

/**
 * Seismic risk classification based on FS_L.
 * Classifica o risco de liquefação de um ponto pela relação FS.
 *
 * @param {number} fs - Fator de segurança contra liquefação
 * @returns {string} 'very_high' | 'high' | 'moderate' | 'low' | 'negligible'
 */
function classifyLiquefactionRisk(fs: number): string {
    if (typeof fs !== 'number' || !isFinite(fs) || fs < 0) {
        throw new TypeError('fs must be a non-negative finite number');
    }
    if (fs < 0.8) return 'very_high';
    if (fs < 1.0) return 'high';
    if (fs < 1.2) return 'moderate';
    if (fs < 1.5) return 'low';
    return 'negligible';
}

export {
    stressReductionFactor,
    computeCSR,
    computeCRR75,
    magnitudeScalingFactor,
    computeFactorOfSafety,
    computeLPI,
    classifyLiquefactionRisk,
};

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilLiquidityIndexMeta = {
    name: 'soilLiquidityIndex',
    description: 'soilLiquidityIndex',
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
