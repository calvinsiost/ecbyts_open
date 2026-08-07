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
 * Mine Geomechanics Slope Stability Analysis
 * Análise de Estabilidade de Taludes em Mineração
 *
 * References / Referências:
 * - Hoek, E. & Bray, J.W. (1981). Rock Slope Engineering, 3rd ed. IMM, London. ISBN: 978-0419160304
 * - Bishop, A.W. (1955). The use of the slip circle in the stability analysis of slopes.
 *   Géotechnique, 5(1): 7–17. DOI: 10.1680/geot.1955.5.1.7
 * - Rocscience (2023). Slide3 Reference Manual. Toronto, Canada.
 * - ISRM (2007). The Complete ISRM Suggested Methods for Rock Characterization,
 *   Testing and Monitoring: 1974–2006. ISBN: 978-975-93-7006-3
 * - Wyllie, D.C. & Mah, C.W. (2004). Rock Slope Engineering: Civil and Mining, 4th ed.
 *   Spon Press. ISBN: 978-0415280013
 *
 * Zero DOM/IDB/Three.js/fetch dependencies.
 * Sem dependências de DOM, IDB, Three.js ou fetch.
 */

// Local interface (substitui import('../../../../types/app/analytics-library.js'))
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
        citation?: string;
    };
    inputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    library?: { published: boolean; priceECBT?: number; licenseRef?: string };
}

interface BishopSlice {
    width_m: number;
    height_m: number;
    alpha_deg: number;
    unitWeight_kNm3: number;
    cohesion_kPa: number;
    friction_deg: number;
    poreRatio?: number;
}

const DEG2RAD = Math.PI / 180;

/**
 * Validate that value is a finite number in [min, max].
 * Valida se o valor é número finito no intervalo [min, max].
 * @param v
 * @param name
 * @param min
 * @param max
 */
function _check(v: number, name: string, min = -Infinity, max = Infinity): void {
    if (typeof v !== 'number' || !isFinite(v)) {
        throw new TypeError(`${name} must be a finite number, got: ${v}`);
    }
    if (v < min || v > max) {
        throw new RangeError(`${name} must be in [${min}, ${max}], got: ${v}`);
    }
}

/**
 * Kinematic Feasibility Analysis for rock slope failure modes.
 * Análise cinemática de modos de ruptura em taludes rochosos.
 *
 * Evaluates if planar, wedge, or toppling failure is kinematically feasible
 * based on discontinuity dip relative to slope face dip and friction angle.
 * Avalia se a ruptura planar, em cunha ou por tombamento é cinematicamente viável.
 *
 * Planar: ψp > φ (dip of discontinuity > friction angle)
 *         AND ψp < ψf (dip of plane < slope face dip)
 * Wedge: similar logic on intersection plunge
 * Toppling: discontinuity dip ≤ (90° - ψf) + φ
 *
 * @param params
 * @param params.slopeDip_deg         - Slope face dip angle (°), 0–90
 * @param params.discontinuityDip_deg - Discontinuity dip angle (°), 0–90
 * @param params.frictionAngle_deg    - Friction angle of discontinuity (°), 0–90
 * @param params.wedgePlunge_deg      - Intersection plunge for wedge (°), optional
 */
export function kinematicAnalysis({
    slopeDip_deg,
    discontinuityDip_deg,
    frictionAngle_deg,
    wedgePlunge_deg = null,
}: {
    slopeDip_deg: number;
    discontinuityDip_deg: number;
    frictionAngle_deg: number;
    wedgePlunge_deg?: number | null;
}): { planar: boolean; wedge: boolean | null; toppling: boolean; details: object } {
    _check(slopeDip_deg, 'slopeDip_deg', 0, 90);
    _check(discontinuityDip_deg, 'discontinuityDip_deg', 0, 90);
    _check(frictionAngle_deg, 'frictionAngle_deg', 0, 90);

    // Planar failure: ψp > φ AND ψp < ψf
    // Ruptura planar: dip da descontinuidade maior que ângulo de atrito e menor que o talude
    const planar = discontinuityDip_deg > frictionAngle_deg && discontinuityDip_deg < slopeDip_deg;

    // Wedge failure feasibility (requires intersection plunge)
    // Ruptura em cunha (requer mergulho da linha de interseção)
    let wedge: boolean | null = null;
    if (wedgePlunge_deg !== null) {
        _check(wedgePlunge_deg, 'wedgePlunge_deg', 0, 90);
        wedge = wedgePlunge_deg > frictionAngle_deg && wedgePlunge_deg < slopeDip_deg;
    }

    // Toppling: ψd ≤ (90° - ψf) + φ  (Hoek & Bray 1981, Fig. 3.1)
    // Tombamento: dip da descontinuidade dentro da zona cinemática de tombamento
    const topplingLimit = 90 - slopeDip_deg + frictionAngle_deg;
    const toppling = discontinuityDip_deg <= topplingLimit;

    return {
        planar,
        wedge,
        toppling,
        details: { slopeDip_deg, discontinuityDip_deg, frictionAngle_deg, topplingLimit },
    };
}

/**
 * Simplified Bishop Method for circular slip surface factor of safety.
 * Método de Bishop Simplificado para fator de segurança de superfície circular.
 *
 * Iterative solution: FS = Σ[c'b + (W - u*b)*tanφ'] / (mα * sinα)
 *                              / Σ[W*sinα]
 *
 * where mα = cosα + (sinα*tanφ')/FS  (Bishop 1955, eq. 5)
 *
 * Converges when |FS_new - FS_old| < tol.
 *
 * @param slices - Array of slice objects
 * @param opts
 * @param opts.tol     - Convergence tolerance
 * @param opts.maxIter - Maximum iterations
 */
export function bishopSimplified(
    slices: BishopSlice[],
    { tol = 1e-6, maxIter = 100 }: { tol?: number; maxIter?: number } = {},
): { fs: number; iterations: number; converged: boolean } {
    if (!Array.isArray(slices) || slices.length === 0) {
        throw new TypeError('slices must be a non-empty array');
    }

    // Build computed slice data once
    // Pré-computa dados de cada fatia para eficiência
    const data = slices.map((s, i) => {
        _check(s.width_m, `slices[${i}].width_m`, 1e-9);
        _check(s.height_m, `slices[${i}].height_m`, 0);
        _check(s.alpha_deg, `slices[${i}].alpha_deg`, -90, 90);
        _check(s.unitWeight_kNm3, `slices[${i}].unitWeight_kNm3`, 0);
        _check(s.cohesion_kPa, `slices[${i}].cohesion_kPa`, 0);
        _check(s.friction_deg, `slices[${i}].friction_deg`, 0, 90);
        const ru = s.poreRatio ?? 0;
        _check(ru, `slices[${i}].poreRatio`, 0, 1);

        const alpha = s.alpha_deg * DEG2RAD;
        const phi = s.friction_deg * DEG2RAD;
        const W = s.unitWeight_kNm3 * s.width_m * s.height_m; // kN/m
        const u = ru * s.unitWeight_kNm3 * s.height_m; // pore pressure kPa
        const b = s.width_m;
        const c = s.cohesion_kPa;

        return { alpha, phi, W, u, b, c, sinAlpha: Math.sin(alpha), cosAlpha: Math.cos(alpha) };
    });

    // Driving moment denominator (constant across iterations)
    // Denominador de momento motor (constante entre iterações)
    const driving = data.reduce((sum, d) => sum + d.W * d.sinAlpha, 0);
    if (Math.abs(driving) < 1e-12) {
        throw new RangeError('Sum of W*sinα is near-zero; check slice geometry');
    }

    let fs = 1.5; // Initial guess / estimativa inicial
    let iterations = 0;
    let converged = false;

    for (let iter = 0; iter < maxIter; iter++) {
        iterations++;
        const resisting = data.reduce((sum, d) => {
            const mAlpha = d.cosAlpha + (d.sinAlpha * Math.tan(d.phi)) / fs;
            if (Math.abs(mAlpha) < 1e-12) return sum; // singularity guard / proteção singularidade
            const numerator = d.c * d.b + (d.W - d.u * d.b) * Math.tan(d.phi);
            return sum + numerator / mAlpha;
        }, 0);

        const fsNew = resisting / driving;
        if (Math.abs(fsNew - fs) < tol) {
            fs = fsNew;
            converged = true;
            break;
        }
        fs = fsNew;
    }

    return { fs, iterations, converged };
}

/**
 * Weighted mean friction angle using Hoek-Brown generalized criterion.
 * Ângulo de atrito médio ponderado usando critério generalizado de Hoek-Brown.
 *
 * φ_mean = Σ(φi * Ai) / Σ(Ai)
 * where Ai is the contact area of each discontinuity family.
 * Ai é a área de contato de cada família de descontinuidades.
 *
 * @param families - Array of discontinuity family data
 * @returns Weighted mean friction angle (°)
 */
export function weightedMeanFriction(families: Array<{ friction_deg: number; area_m2: number }>): number {
    if (!Array.isArray(families) || families.length === 0) {
        throw new TypeError('families must be a non-empty array');
    }
    let sumWF = 0,
        sumA = 0;
    families.forEach((f, i) => {
        _check(f.friction_deg, `families[${i}].friction_deg`, 0, 90);
        _check(f.area_m2, `families[${i}].area_m2`, 1e-9);
        sumWF += f.friction_deg * f.area_m2;
        sumA += f.area_m2;
    });
    return sumWF / sumA;
}

/**
 * Classify slope stability by factor of safety.
 * Classifica a estabilidade do talude pelo fator de segurança.
 *
 * Based on Wyllie & Mah (2004) and Hoek & Bray (1981) criteria:
 *   FS >= 1.5  - Stable
 *   1.0 <= FS < 1.5 - Potentially unstable
 *   FS < 1.0  - Unstable (failure expected)
 *
 * @param fs - Factor of safety
 */
export function classifyStability(fs: number): { status: string; statusPT: string; fs: number } {
    _check(fs, 'fs', 0);
    let status, statusPT;
    if (fs >= 1.5) {
        status = 'stable';
        statusPT = 'estável';
    } else if (fs >= 1.0) {
        status = 'potentially unstable';
        statusPT = 'potencialmente instável';
    } else {
        status = 'unstable';
        statusPT = 'instável';
    }
    return { status, statusPT, fs };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineGeomechanicsSlopeMeta: AnalyticsModuleMeta = {
    name: 'mineGeomechanicsSlope',
    description: 'mineGeomechanicsSlope',
    category: 'analytics',
    familyTags: ['mining', 'geotechnical'],
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
