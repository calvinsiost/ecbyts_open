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
 * Groundwater Contaminant Plume Modeling
 *
 * Implements the 1D Advection-Dispersion Equation (ADE) analytical solution
 * for solute transport in saturated porous media.
 *
 * Academic references:
 *   Ogata, A. & Banks, R.B. (1961). A solution of the differential equation
 *     of longitudinal dispersion in porous media. USGS Professional Paper 411-A.
 *   Bear, J. (1972). Dynamics of Fluids in Porous Media. Elsevier, New York.
 *   Domenico, P.A. & Schwartz, F.W. (1998). Physical and Chemical Hydrogeology,
 *     2nd ed. Wiley, New York.
 *
 * Zero external dependencies. All math is pure JS.
 *
 * @module groundwaterContaminantPlume
 */

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

interface TransportParams {
    C0: number;
    x: number;
    t?: number;
    v: number;
    alphaL: number;
    R: number;
    decayRate?: number;
    [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Complementary Error Function (erfc) - Abramowitz & Stegun 7.1.26 approximation
// Erro relativo < 1.5e-7 para todos os argumentos reais
// ---------------------------------------------------------------------------

/**
 * Complementary error function approximation.
 * @param x - Input value
 * @returns erfc(x)
 */
function erfc(x: number): number {
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);

    // Polinômio de aproximação A&S 7.1.26 (p. 299)
    const t = 1 / (1 + 0.3275911 * absX);
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));

    const result = poly * Math.exp(-absX * absX);
    // erfc(-x) = 2 - erfc(x)
    return sign === 1 ? result : 2 - result;
}

// ---------------------------------------------------------------------------
// Retardation Factor
// Fator de retardamento R = 1 + (rho_b * Kd) / n
// ---------------------------------------------------------------------------

/**
 * Compute the retardation factor for a solute in a porous medium.
 * Retardamento: R = 1 + (rho_b * Kd) / n
 *
 * @param bulkDensity    - Bulk density rho_b (g/cm³ or kg/m³, consistent units)
 * @param Kd             - Distribution coefficient (cm³/g or m³/kg)
 * @param porosity       - Effective porosity n (dimensionless, 0 < n < 1)
 * @returns Retardation factor R (>= 1)
 * @throws {RangeError} If porosity is not in (0, 1) or bulkDensity/Kd are negative
 */
export function retardationFactor(bulkDensity: number, Kd: number, porosity: number): number {
    if (typeof bulkDensity !== 'number' || typeof Kd !== 'number' || typeof porosity !== 'number') {
        throw new TypeError('retardationFactor: all arguments must be numbers');
    }
    if (bulkDensity < 0) throw new RangeError('retardationFactor: bulkDensity must be >= 0');
    if (Kd < 0) throw new RangeError('retardationFactor: Kd must be >= 0');
    if (porosity <= 0 || porosity >= 1) {
        throw new RangeError('retardationFactor: porosity must be in (0, 1)');
    }
    return 1 + (bulkDensity * Kd) / porosity;
}

// ---------------------------------------------------------------------------
// 1D ADE Analytical Solution - Ogata & Banks (1961)
// C(x,t) = (C0/2) * { erfc[(Rx - vt) / (2*sqrt(DRt))] +
//             exp(vx/D) * erfc[(Rx + vt) / (2*sqrt(DRt))] }
// onde v = pore velocity (v_seepage), D = hydrodynamic dispersion coefficient
// ---------------------------------------------------------------------------

/**
 * Compute concentration at receptor point using the 1D ADE analytical solution
 * (Ogata & Banks 1961, eq. 3), corrected for retardation.
 *
 * @param params - Transport parameters
 * @returns Relative concentration C/C0 (0 to 1)
 * @throws {TypeError} If params is not an object or required fields are missing
 * @throws {RangeError} If numeric ranges are violated
 */
export function concentrationAtReceptor(params: TransportParams): number {
    if (!params || typeof params !== 'object') {
        throw new TypeError('concentrationAtReceptor: params must be an object');
    }
    const { C0, x, t, v, alphaL, R, decayRate = 0 } = params;

    if ([C0, x, t, v, alphaL, R].some((p) => typeof p !== 'number')) {
        throw new TypeError('concentrationAtReceptor: C0, x, t, v, alphaL, R must be numbers');
    }
    if (C0 < 0) throw new RangeError('concentrationAtReceptor: C0 must be >= 0');
    if (x < 0) throw new RangeError('concentrationAtReceptor: x must be >= 0');
    if (t! <= 0) throw new RangeError('concentrationAtReceptor: t must be > 0');
    if (v <= 0) throw new RangeError('concentrationAtReceptor: v must be > 0');
    if (alphaL <= 0) throw new RangeError('concentrationAtReceptor: alphaL must be > 0');
    if (R < 1) throw new RangeError('concentrationAtReceptor: R must be >= 1');
    if (decayRate < 0) throw new RangeError('concentrationAtReceptor: decayRate must be >= 0');

    // Coeficiente de dispersão hidrodinâmica longitudinal D = alphaL * v
    const D = alphaL * v;

    // Termos da solução de Ogata & Banks com retardamento
    const sqrt4DRt = 2 * Math.sqrt(D * R * t!);
    if (sqrt4DRt === 0) return 0;

    const term1 = erfc((R * x - v * t!) / sqrt4DRt);
    // Quando vx/D é grande, exp→Inf mas erfc→0 exponencialmente mais rápido.
    // Usar identidade log-sum para evitar overflow numérico: se exp overflows, term2→0.
    const vxD = (v * x) / D;
    let term2: number;
    if (vxD > 700) {
        // erfc((Rx+vt)/sqrt4DRt) ≈ 0 muito antes de exp(vx/D) overflow - termo negligenciável
        term2 = 0;
    } else {
        term2 = Math.exp(vxD) * erfc((R * x + v * t!) / sqrt4DRt);
    }

    // Aplicar decaimento de primeira ordem (fator de biodegradação/hidrólise)
    const decayFactor = Math.exp(-decayRate * t!);

    const ratio = 0.5 * (term1 + term2) * decayFactor;

    // Limitar ao intervalo [0, 1] para evitar artefatos numéricos
    return C0 * Math.max(0, Math.min(1, ratio));
}

// ---------------------------------------------------------------------------
// Breakthrough Time
// Tempo de chegada: t_bt = (R * x) / v  (quando C/C0 > threshold)
// ---------------------------------------------------------------------------

/**
 * Estimate breakthrough time - when C/C0 first exceeds a threshold fraction.
 * Estimativa analítica: t_bt ≈ R * x / v (tempo de centro de massa).
 * Para concentração limiar diferente de 0.5, usa busca bissecção.
 *
 * @param params - Same transport parameters as concentrationAtReceptor
 * @param threshold - C/C0 fraction to define breakthrough (0 < threshold <= 1)
 * @returns Breakthrough time in days (Infinity if not reached within 10000 days)
 */
export function breakthroughTime(params: TransportParams, threshold: number = 0.1): number {
    if (!params || typeof params !== 'object') {
        throw new TypeError('breakthroughTime: params must be an object');
    }
    if (threshold <= 0 || threshold > 1) {
        throw new RangeError('breakthroughTime: threshold must be in (0, 1]');
    }

    const { x, v, R } = params;
    if (typeof x !== 'number' || typeof v !== 'number' || typeof R !== 'number') {
        throw new TypeError('breakthroughTime: x, v, R must be numbers');
    }

    // Busca por bissecção: encontrar t tal que C(x,t)/C0 = threshold
    let lo = 0.001;
    let hi = 10000; // dias
    // eslint-disable-next-line
    const C0 = params.C0 || 1;
    const paramsNorm = { ...params, C0: 1 };

    // Verificar se breakthrough ocorre dentro do horizonte
    const hiConc = concentrationAtReceptor({ ...paramsNorm, t: hi }) / 1;
    if (hiConc < threshold) return Infinity;

    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const c = concentrationAtReceptor({ ...paramsNorm, t: mid });
        if (c < threshold) lo = mid;
        else hi = mid;
        if (hi - lo < 0.001) break;
    }

    return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// Compliance Zone Assessment
// Avaliação de zona de conformidade: verifica se concentração no receptor
// está abaixo do valor de intervenção (VI) em uma distância de conformidade
// ---------------------------------------------------------------------------

/**
 * Assess compliance at a receptor location against an intervention value.
 * Avalia conformidade: C(x,t) vs VI (Valor de Intervencao) - CONAMA 420.
 *
 * @param transportParams  - Parameters for concentrationAtReceptor
 * @param interventionValue - Regulatory threshold (same unit as C0)
 * @param horizon    - Assessment horizon in days (default 10 years)
 * @returns Compliance result
 */
export function complianceZoneAssessment(
    transportParams: TransportParams,
    interventionValue: number,
    horizon: number = 3650,
): { compliant: boolean; peakConcentration: number; peakTime: number; exceedanceFactor: number } {
    if (!transportParams || typeof transportParams !== 'object') {
        throw new TypeError('complianceZoneAssessment: transportParams must be an object');
    }
    if (typeof interventionValue !== 'number' || interventionValue <= 0) {
        throw new RangeError('complianceZoneAssessment: interventionValue must be a positive number');
    }

    // Amostragem temporal para encontrar pico (500 pontos no horizonte)
    const steps = 500;
    let peakConc = 0;
    let peakTime = 0;

    for (let i = 1; i <= steps; i++) {
        const t = (i / steps) * horizon;
        try {
            const c = concentrationAtReceptor({ ...transportParams, t });
            if (c > peakConc) {
                peakConc = c;
                peakTime = t;
            }
        } catch (e: any) {
            console.debug('[groundwaterPlume] peakConc:', e?.message || e);
            // Ignorar erros de domínio em pontos de amostragem
        }
    }

    const exceedanceFactor = peakConc / interventionValue;

    return {
        compliant: peakConc <= interventionValue,
        peakConcentration: peakConc,
        peakTime,
        exceedanceFactor,
    };
}

// ---------------------------------------------------------------------------
// Receptor Risk Index
// Índice de risco por receptor: HQ = C_receptor / RfC (referência de saúde)
// ---------------------------------------------------------------------------

/**
 * Compute the Hazard Quotient (HQ) for a receptor based on peak plume concentration.
 * HQ = C_pico / RfC (Reference Concentration or Dose).
 * HQ > 1 indica risco potencial ao receptor.
 *
 * @param peakConcentration  - Peak concentration at receptor (mg/L or mg/m³)
 * @param referenceDose      - Health-based reference concentration (same unit)
 * @param exposureFraction - Fraction of time receptor is exposed (0-1, default 1)
 * @returns Risk assessment result
 * @throws {RangeError} If any argument is out of expected range
 */
export function receptorRiskIndex(
    peakConcentration: number,
    referenceDose: number,
    exposureFraction: number = 1,
): { HQ: number; riskLevel: string } {
    if (typeof peakConcentration !== 'number' || peakConcentration < 0) {
        throw new RangeError('receptorRiskIndex: peakConcentration must be >= 0');
    }
    if (typeof referenceDose !== 'number' || referenceDose <= 0) {
        throw new RangeError('receptorRiskIndex: referenceDose must be > 0');
    }
    if (exposureFraction <= 0 || exposureFraction > 1) {
        throw new RangeError('receptorRiskIndex: exposureFraction must be in (0, 1]');
    }

    const HQ = (peakConcentration * exposureFraction) / referenceDose;

    let riskLevel: string;
    if (HQ <= 0.1) riskLevel = 'negligible';
    else if (HQ <= 1.0) riskLevel = 'acceptable';
    else if (HQ <= 10) riskLevel = 'elevated';
    else riskLevel = 'high';

    return { HQ, riskLevel };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const groundwaterContaminantPlumeMeta: AnalyticsModuleMeta = {
    name: 'groundwaterContaminantPlume',
    description: 'groundwaterContaminantPlume',
    category: 'analytics',
    familyTags: ['groundwater', 'water', 'contamination', 'fate_transport'],
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
