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
 * Atmospheric Dispersion Safety Analysis
 *
 * References:
 *   AIHA (2022). Emergency Response Planning Guidelines (ERPG) & Workplace
 *     Environmental Exposure Levels (WEEL). AIHA Press, Fairfax, VA.
 *   AEGL (2019). Acute Exposure Guideline Levels. National Academies Press.
 *     doi:10.17226/25623
 *   Pasquill, F. & Smith, F.B. (1983). Atmospheric Diffusion, 3rd ed.
 *     Ellis Horwood, Chichester. ISBN 978-0-85312-348-7
 *   Turner, D.B. (1994). Workbook of Atmospheric Dispersion Estimates.
 *     Lewis Publishers, Boca Raton. ISBN 978-1-56670-056-1
 *
 * Zero DOM/IDB/fetch/Three.js dependencies - pure math module.
 * Módulo de análise de segurança por dispersão atmosférica - sem dependências de browser.
 */

type StabilityClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

// ─── Pasquill-Gifford sigma coefficients ───────────────────────────────────
// Coeficientes de dispersão de Pasquill-Gifford por classe de estabilidade atmosférica
// Source: Turner (1994), Table 3-2

const PG_SIGMA_Y: Record<StabilityClass, { a: number; b: number }> = {
    // {a, b} → σy = a × x^b  (x in km, σy in m)
    A: { a: 0.22, b: 0.894 },
    B: { a: 0.16, b: 0.894 },
    C: { a: 0.11, b: 0.894 },
    D: { a: 0.08, b: 0.894 },
    E: { a: 0.06, b: 0.894 },
    F: { a: 0.04, b: 0.894 },
};

const PG_SIGMA_Z: Record<StabilityClass, { a: number; b: number }> = {
    // {a, b} → σz = a × x^b  (x in km, σz in m, capped at 5000m for numerical safety)
    A: { a: 0.2, b: 1.41 },
    B: { a: 0.12, b: 1.2 },
    C: { a: 0.08, b: 1.02 },
    D: { a: 0.06, b: 0.82 },
    E: { a: 0.03, b: 0.72 },
    F: { a: 0.016, b: 0.6 },
};

const VALID_STABILITY_CLASSES = new Set(['A', 'B', 'C', 'D', 'E', 'F']);

// ─── ERPG threshold catalog (illustrative, non-exhaustive) ─────────────────
// Catálogo de valores ERPG (mg/m³) para substâncias comuns
// Valores de referência AIHA 2022 - substituir pelos valores oficiais atualizados
const ERPG_CATALOG: Record<string, { erpg1: number; erpg2: number; erpg3: number }> = {
    ammonia: { erpg1: 17, erpg2: 100, erpg3: 750 }, // mg/m³
    chlorine: { erpg1: 1, erpg2: 3, erpg3: 20 },
    hydrogen_sulfide: { erpg1: 0.1, erpg2: 30, erpg3: 50 },
    sulfur_dioxide: { erpg1: 0.25, erpg2: 0.5, erpg3: 15 },
    benzene: { erpg1: 4.9, erpg2: 49, erpg3: 488 },
};

// ─── Gaussian plume concentration at receptor ───────────────────────────────

/**
 * Calculate ground-level centreline concentration at a receptor point
 * using the Gaussian plume model (Pasquill-Gifford).
 * Calcula a concentração ao nível do solo na linha central da pluma gaussiana.
 *
 * C = Q / (π × u × σy × σz) × exp(-0.5 × (y/σy)²) × [exp(-0.5×((z-H)/σz)²) + exp(-0.5×((z+H)/σz)²)]
 * For ground-level centreline: y=0, z=0.
 *
 * @param p.Q - Emission rate (g/s)
 * @param p.u - Wind speed (m/s) at release height
 * @param p.H - Effective stack/release height (m)
 * @param p.xKm - Downwind distance to receptor (km)
 * @param p.yM - Crosswind distance to receptor (m), default 0
 * @param p.stabilityClass - Pasquill-Gifford class
 */
export function calcGaussianGroundConcentration({
    Q,
    u,
    H,
    xKm,
    yM = 0,
    stabilityClass,
}: {
    Q: number;
    u: number;
    H: number;
    xKm: number;
    yM?: number;
    stabilityClass: StabilityClass;
}): { concentration_mg_m3: number; sigmaY: number; sigmaZ: number } {
    if (typeof Q !== 'number' || Q < 0) throw new RangeError('Q (emission rate) must be >= 0');
    if (typeof u !== 'number' || u <= 0) throw new RangeError('u (wind speed) must be > 0');
    if (typeof H !== 'number' || H < 0) throw new RangeError('H (release height) must be >= 0');
    if (typeof xKm !== 'number' || xKm <= 0) throw new RangeError('xKm must be > 0');
    if (!VALID_STABILITY_CLASSES.has(stabilityClass)) {
        throw new RangeError(`stabilityClass must be one of: A, B, C, D, E, F`);
    }

    const sy_coef = PG_SIGMA_Y[stabilityClass];
    const sz_coef = PG_SIGMA_Z[stabilityClass];

    const sigmaY = sy_coef.a * Math.pow(xKm, sy_coef.b); // metres
    const sigmaZRaw = sz_coef.a * Math.pow(xKm, sz_coef.b);
    const sigmaZ = Math.min(sigmaZRaw, 5000); // cap para estabilidade numérica

    if (sigmaY <= 0 || sigmaZ <= 0) {
        return { concentration_mg_m3: 0, sigmaY, sigmaZ };
    }

    const crosswindTerm = Math.exp(-0.5 * Math.pow(yM / sigmaY, 2));
    const verticalPlus = Math.exp(-0.5 * Math.pow((0 - H) / sigmaZ, 2));
    const verticalMinus = Math.exp(-0.5 * Math.pow((0 + H) / sigmaZ, 2));

    // Concentration in g/m³, convert to mg/m³
    const C_g_m3 = (Q / (Math.PI * u * sigmaY * sigmaZ)) * crosswindTerm * (verticalPlus + verticalMinus);
    const concentration_mg_m3 = C_g_m3 * 1000;

    return { concentration_mg_m3, sigmaY, sigmaZ };
}

// ─── Hazard distance by ERPG level ─────────────────────────────────────────

/**
 * Estimate downwind distance at which concentration falls to an ERPG threshold.
 * Estima a distância até onde a concentração atinge o limiar ERPG (busca iterativa).
 *
 * Uses binary search along the plume centreline (y=0, z=0).
 * Usa busca binária ao longo da linha central da pluma (y=0, z=0).
 *
 * @param p.Q - Emission rate (g/s)
 * @param p.u - Wind speed (m/s)
 * @param p.H - Effective release height (m)
 * @param p.stabilityClass - Pasquill-Gifford class
 * @param p.thresholdMgM3 - ERPG/AEGL threshold (mg/m³)
 * @param p.maxKm - Max search distance (km), default 50
 */
export function calcHazardDistance({
    Q,
    u,
    H,
    stabilityClass,
    thresholdMgM3,
    maxKm = 50,
}: {
    Q: number;
    u: number;
    H: number;
    stabilityClass: StabilityClass;
    thresholdMgM3: number;
    maxKm?: number;
}): { hazardDistanceKm: number; converged: boolean } {
    if (typeof thresholdMgM3 !== 'number' || thresholdMgM3 <= 0) {
        throw new RangeError('thresholdMgM3 must be > 0');
    }
    if (typeof maxKm !== 'number' || maxKm <= 0) {
        throw new RangeError('maxKm must be > 0');
    }

    // Check concentration at 10m (0.01 km) - if below threshold, hazard is negligible
    // Verifica concentração a 10m - se abaixo do limiar, risco é negligenciável
    const nearConc = calcGaussianGroundConcentration({ Q, u, H, xKm: 0.01, stabilityClass });
    if (nearConc.concentration_mg_m3 < thresholdMgM3) {
        return { hazardDistanceKm: 0, converged: true };
    }

    // Binary search: find x where C(x) == threshold
    // Busca binária: encontra x onde C(x) == limiar
    let lo = 0.01,
        hi = maxKm;
    let converged = false;
    for (let iter = 0; iter < 60; iter++) {
        const mid = (lo + hi) / 2;
        const { concentration_mg_m3 } = calcGaussianGroundConcentration({ Q, u, H, xKm: mid, stabilityClass });
        if (concentration_mg_m3 > thresholdMgM3) {
            lo = mid;
        } else {
            hi = mid;
        }
        if (hi - lo < 1e-4) {
            converged = true;
            break;
        }
    }

    return { hazardDistanceKm: Math.round(hi * 1000) / 1000, converged };
}

// ─── ERPG zone classification ───────────────────────────────────────────────

/**
 * Classify receptor zone based on concentration vs ERPG levels.
 * Classifica a zona do receptor baseado na concentração vs níveis ERPG.
 *
 * ERPG-1: mild transient effects (efeitos leves transitórios)
 * ERPG-2: irreversible effects or prevention of protective action (efeitos irreversíveis)
 * ERPG-3: life-threatening effects (risco à vida)
 *
 * @param erpgValues - mg/m³
 */
export function classifyERPGZone(
    concentrationMgM3: number,
    erpgValues: { erpg1: number; erpg2: number; erpg3: number },
): { zone: 'safe' | 'erpg1' | 'erpg2' | 'erpg3'; evacuate: boolean } {
    if (typeof concentrationMgM3 !== 'number' || concentrationMgM3 < 0) {
        throw new RangeError('concentrationMgM3 must be >= 0');
    }
    const { erpg1, erpg2, erpg3 } = erpgValues || {};
    if (typeof erpg1 !== 'number' || typeof erpg2 !== 'number' || typeof erpg3 !== 'number') {
        throw new TypeError('erpgValues must contain numeric erpg1, erpg2, erpg3');
    }
    if (concentrationMgM3 >= erpg3) return { zone: 'erpg3', evacuate: true };
    if (concentrationMgM3 >= erpg2) return { zone: 'erpg2', evacuate: true };
    if (concentrationMgM3 >= erpg1) return { zone: 'erpg1', evacuate: false };
    return { zone: 'safe', evacuate: false };
}

/**
 * Get ERPG thresholds from built-in catalog by substance key.
 * Retorna os limiares ERPG do catálogo interno por chave de substância.
 */
export function getERPGValues(substanceKey: string): { erpg1: number; erpg2: number; erpg3: number } | null {
    return ERPG_CATALOG[substanceKey] ?? null;
}

export { ERPG_CATALOG, VALID_STABILITY_CLASSES };

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const atmosphericDispersionSafetyMeta = {
    name: 'atmosphericDispersionSafety',
    description: 'atmosphericDispersionSafety',
    category: 'analytics',
    familyTags: ['atmosphere', 'risk', 'fate_transport'],
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
