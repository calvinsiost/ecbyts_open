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
 * Contaminant Natural Attenuation Model - MNA & Domenico analytical solution
 *
 * Academic references:
 * - US EPA (1999). Use of Monitored Natural Attenuation at Superfund, RCRA
 *   Corrective Action, and Underground Storage Tank Sites. EPA/540/R-99/009.
 * - Domenico, P.A. (1987). An analytical model for multidimensional transport
 *   of a decaying contaminant species. Journal of Hydrology, 91(1-2), 49-58.
 *   DOI:10.1016/0022-1694(87)90127-2
 * - Wiedemeier, T.H. et al. (1999). Natural Attenuation of Fuels and Chlorinated
 *   Solvents in the Subsurface. Wiley. ISBN:978-0-471-19749-7
 * - ASTM E1943-98 (2015). Standard Guide for Remediation of Ground Water by
 *   Natural Attenuation at Petroleum Release Sites.
 * - CONAMA 420/2009 - Qualidade do solo e investigação de áreas contaminadas.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

// eslint-disable-next-line
const SQRT_PI = Math.sqrt(Math.PI);

/**
 * Biodegradation half-life reference values (days) per compound class.
 * Meias-vidas de biodegradação de referência - EPA/600/R-03/072 Appendix C.
 * @type {Record<string, number>}
 */
const HALF_LIFE_DEFAULTS = {
    benzene: 69, // aeróbico
    toluene: 28,
    ethylbenzene: 56,
    xylene: 42,
    tce: 365, // anaeróbico (reductive dechlorination)
    pce: 730,
    vinyl_chloride: 28,
    naphthalene: 84,
    generic: 180,
};

// ─── Math helpers ─────────────────────────────────────────────────────────────

/**
 * Complementary error function approximation (Abramowitz & Stegun 7.1.26).
 * Função erfc - usada na solução analítica de Domenico.
 * @param {number} x
 * @returns {number}
 */
function erfc(x: any) {
    const t = 1 / (1 + 0.3275911 * Math.abs(x));
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    const result = poly * Math.exp(-(x * x));
    return x >= 0 ? result : 2 - result;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Computes first-order decay of contaminant concentration along a flow path.
 * Decaimento de primeira ordem - modelo mais simples de atenuação natural.
 *
 * C(x) = C0 * exp(-lambda * x / v)
 * where lambda = ln(2) / t_half (day⁻¹), x (m), v = seepage velocity (m/day)
 *
 * @param {object} params
 * @param {number} params.initialConc     - Source concentration C0 (mg/L or µg/L)
 * @param {number} params.distance        - Down-gradient distance x (m)
 * @param {number} params.seepageVelocity - Groundwater seepage velocity (m/day)
 * @param {number} params.halfLifeDays    - First-order biodegradation half-life (days)
 * @returns {{ residualConc: number, attenuationFactor: number, travelTimeDays: number }}
 */
export function calcFirstOrderDecay({
    initialConc,
    distance,
    seepageVelocity,
    halfLifeDays
}: any) {
    if (typeof initialConc !== 'number' || initialConc < 0) throw new RangeError('initialConc must be >= 0');
    if (typeof distance !== 'number' || distance < 0) throw new RangeError('distance must be >= 0');
    if (typeof seepageVelocity !== 'number' || seepageVelocity <= 0)
        throw new RangeError('seepageVelocity must be > 0 (m/day)');
    if (typeof halfLifeDays !== 'number' || halfLifeDays <= 0) throw new RangeError('halfLifeDays must be > 0');

    const lambda = Math.LN2 / halfLifeDays; // decaimento (dia⁻¹)
    const travelTimeDays = distance / seepageVelocity;
    const attenuationFactor = Math.exp(-lambda * travelTimeDays);
    const residualConc = initialConc * attenuationFactor;

    return { residualConc, attenuationFactor, travelTimeDays };
}

/**
 * Domenico (1987) 3-D analytical solution for contaminant plume transport.
 * Solução analítica de Domenico para transporte 3D com decaimento de primeira ordem.
 *
 * Computes steady-state concentration at point (x, y, z) from a finite source.
 *
 * @param {object} params
 * @param {number} params.c0           - Source concentration (mg/L)
 * @param {number} params.x            - Longitudinal distance from source (m)
 * @param {number} params.y            - Transverse horizontal offset from centreline (m)
 * @param {number} params.z            - Vertical offset from source midplane (m)
 * @param {number} params.vx           - Seepage velocity (m/day)
 * @param {number} params.alphaL       - Longitudinal dispersivity (m)
 * @param {number} params.alphaT       - Transverse horizontal dispersivity (m)
 * @param {number} params.alphaV       - Transverse vertical dispersivity (m)
 * @param {number} params.sourceWidth  - Source half-width in y direction (m)
 * @param {number} params.sourceDepth  - Source half-depth in z direction (m)
 * @param {number} [params.halfLifeDays=Infinity] - Biodegradation half-life (days)
 * @returns {{ concentration: number, attenuationFactor: number }}
 */
export function calcDomenicoPlume({
    c0,
    x,
    y,
    z,
    vx,
    alphaL,
    alphaT,
    alphaV,
    sourceWidth,
    sourceDepth,
    halfLifeDays = Infinity
}: any) {
    if (typeof c0 !== 'number' || c0 < 0) throw new RangeError('c0 must be >= 0');
    if (typeof x !== 'number' || x < 0) throw new RangeError('x must be >= 0');
    if (typeof y !== 'number') throw new TypeError('y must be a number');
    if (typeof z !== 'number') throw new TypeError('z must be a number');
    if (typeof vx !== 'number' || vx <= 0) throw new RangeError('vx must be > 0');
    if (typeof alphaL !== 'number' || alphaL <= 0) throw new RangeError('alphaL must be > 0');
    if (typeof alphaT !== 'number' || alphaT <= 0) throw new RangeError('alphaT must be > 0');
    if (typeof alphaV !== 'number' || alphaV <= 0) throw new RangeError('alphaV must be > 0');
    if (typeof sourceWidth !== 'number' || sourceWidth <= 0) throw new RangeError('sourceWidth must be > 0');
    if (typeof sourceDepth !== 'number' || sourceDepth <= 0) throw new RangeError('sourceDepth must be > 0');

    if (x === 0) return { concentration: c0, attenuationFactor: 1 };

    // Coeficientes de dispersão: Dx = alphaL*vx, Dy = alphaT*vx, Dz = alphaV*vx
    const Dx = alphaL * vx;
    const Dy = alphaT * vx;
    const Dz = alphaV * vx;

    // Parâmetro de decaimento
    const lambda = isFinite(halfLifeDays) ? Math.LN2 / halfLifeDays : 0;

    // Fator longitudinal (Domenico 1987, Eq. 13)
    const travelTime = x / vx;
    const sqrtArg = Math.max(0, 1 + (4 * lambda * Dx) / (vx * vx));
    const longFactor = Math.exp(((vx * x) / (2 * Dx)) * (1 - Math.sqrt(sqrtArg)));

    // Fator transversal horizontal
    const sigmaY = Math.sqrt(2 * Dy * travelTime);
    const transY =
        sigmaY > 0
            ? erfc((y - sourceWidth) / (sigmaY * Math.SQRT2)) - erfc((y + sourceWidth) / (sigmaY * Math.SQRT2))
            : Math.abs(y) <= sourceWidth
              ? 2
              : 0;

    // Fator transversal vertical (método de imagem - superfície livre)
    const sigmaZ = Math.sqrt(2 * Dz * travelTime);
    const transZ =
        sigmaZ > 0
            ? erfc((z - sourceDepth) / (sigmaZ * Math.SQRT2)) - erfc((z + sourceDepth) / (sigmaZ * Math.SQRT2))
            : Math.abs(z) <= sourceDepth
              ? 2
              : 0;

    // Concentração no ponto (x, y, z)
    const concentration = Math.max(0, (c0 / 8) * longFactor * transY * transZ);
    const attenuationFactor = c0 > 0 ? concentration / c0 : 0;

    return { concentration, attenuationFactor };
}

/**
 * Returns default biodegradation half-life for known compound classes.
 * Meia-vida padrão de biodegradação por classe de contaminante.
 *
 * @param {string} compound - Compound key (e.g. 'benzene', 'tce', 'generic')
 * @returns {{ halfLifeDays: number, source: string }}
 */
export function getDefaultHalfLife(compound: any) {
    if (typeof compound !== 'string' || compound.trim() === '')
        throw new TypeError('compound must be a non-empty string');
    const key = compound.toLowerCase().trim();
const halfLifeDays = (HALF_LIFE_DEFAULTS as any)[key] ?? HALF_LIFE_DEFAULTS.generic;
    const source = key in HALF_LIFE_DEFAULTS ? 'EPA/600/R-03/072 Appendix C' : 'generic default (180 days)';
    return { halfLifeDays, source };
}

/**
 * Computes the Attenuation Rate Constant (k_atten) from monitoring well data.
 * Taxa de atenuação observada em campo - método EPA MNA (1999) Tier 2.
 *
 * Uses linear regression of ln(C) vs x to derive a field-measured lambda.
 *
 * @param {Array<{distance: number, concentration: number}>} wells
 *   - Array of monitoring wells with down-gradient distance and concentration
 * @param {number} wells - Groundwater velocity (m/day)
 * @returns {{ kAttenPerDay: number, halfLifeDays: number, r2: number }}
 */
export function calcFieldAttenuationRate(wells: any, seepageVelocity: any) {
    if (!Array.isArray(wells) || wells.length < 2)
        throw new TypeError('wells must be an array with at least 2 entries');
    if (typeof seepageVelocity !== 'number' || seepageVelocity <= 0)
        throw new RangeError('seepageVelocity must be > 0');

    // Filtrar poços com concentração positiva
    const validWells = wells.filter(
        (w) =>
            typeof w.distance === 'number' &&
            w.distance >= 0 &&
            typeof w.concentration === 'number' &&
            w.concentration > 0,
    );
    if (validWells.length < 2) throw new RangeError('At least 2 wells with positive concentration are required');

    // Regressão linear: ln(C) = a - b*x → b = lambda/vx
    const xs = validWells.map((w) => w.distance);
    const ys = validWells.map((w) => Math.log(w.concentration));
    const n = xs.length;
    const xMean = xs.reduce((s, v) => s + v, 0) / n;
    const yMean = ys.reduce((s, v) => s + v, 0) / n;
const ssXY = xs.reduce((s, v, i) => s + (v - xMean) * (ys[i]! - yMean), 0);
    const ssXX = xs.reduce((s, v) => s + (v - xMean) ** 2, 0);
    const slope = ssXX > 0 ? ssXY / ssXX : 0; // slope = -lambda/vx (negative = attenuation)

    // Coeficiente de determinação R²
    const ssTot = ys.reduce((s, v) => s + (v - yMean) ** 2, 0);
    const ssRes = ys.reduce((s, v, i) => s + (v - (yMean + slope * (xs[i] - xMean))) ** 2, 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;

    // kAttenPerDay = |slope| * vx (dia⁻¹)
    const kAttenPerDay = Math.abs(slope) * seepageVelocity;
    const halfLifeDays = kAttenPerDay > 0 ? Math.LN2 / kAttenPerDay : Infinity;

    return { kAttenPerDay, halfLifeDays, r2 };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const contaminantAttenuationMeta = {
    name: 'contaminantAttenuation',
    description: 'contaminantAttenuation',
    category: 'analytics',
    familyTags: ['contamination'],
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
