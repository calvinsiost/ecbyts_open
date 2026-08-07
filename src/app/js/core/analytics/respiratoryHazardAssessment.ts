// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Occupational Respiratory Risk
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

'use strict';

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Particle size cutoffs for fraction classification (ISO 7708:1995)
 * Limites de diâmetro aerodinâmico por fração de poeira (ISO 7708)
 */
const ISO7708_CUTOFFS = {
    INHALABLE_MAX_UM: 100, // partículas < 100 µm entram no trato respiratório
    THORACIC_MAX_UM: 10, // partículas < 10 µm penetram até traqueia/brônquios
    RESPIRABLE_MAX_UM: 4, // partículas < 4 µm atingem alvéolos pulmonares
};

/**
 * Exposure Index thresholds (NIOSH/ACGIH)
 * Limiares do Índice de Exposição: >0.5 = nível de ação; >1.0 = excedido
 */
const EI_THRESHOLDS = {
    ACTION_LEVEL: 0.5,
    EXCEEDED: 1.0,
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface SELResult {
    sel: number;
    unit: string;
    exceedsLimit: boolean;
}

interface Measurement {
    concentration: number;
    duration_h: number;
}

interface EIResult {
    EI: number;
    category: 'acceptable' | 'action_level' | 'exceeded';
}

interface ILOResult {
    ratio: number;
    status: string;
}

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Compute Short-Term Exposure Level (SEL) as concentration × duration product.
 *
 * Calcula o produto concentração × duração (carga de exposição) e compara
 * com o OEL (Occupational Exposure Limit). Útil para exposições de curta
 * duração que diferem do turno completo de 8 h.
 *
 * @param {number} concentration - Measured air concentration (ppm or mg/m³)
 * @param {number} duration      - Exposure duration in hours
 * @param {number} oel           - Occupational Exposure Limit (same unit × 8h)
 * @returns {{ sel: number, unit: string, exceedsLimit: boolean }}
 */
export function computeRespiratorySEL(concentration: number, duration: number, oel: number): SELResult {
    if (typeof concentration !== 'number' || concentration < 0) {
        throw new RangeError('concentration must be a non-negative number');
    }
    if (typeof duration !== 'number' || duration <= 0) {
        throw new RangeError('duration must be a positive number (hours)');
    }
    if (typeof oel !== 'number' || oel <= 0) {
        throw new RangeError('oel must be a positive number');
    }

    // SEL = concentração × duração de exposição (ppm·h ou mg/m³·h)
    const sel = concentration * duration;

    // Limite equivalente para a duração fornecida: OEL × duração / 8h
    // (normaliza o OEL de 8 h para a duração real do turno)
    const adjustedLimit = oel * (duration / 8);
    const exceedsLimit = sel > adjustedLimit;

    return { sel, unit: 'ppm-h', exceedsLimit };
}

/**
 * Classify airborne particulate fraction by aerodynamic diameter (ISO 7708:1995).
 *
 * Classifica fração de poeira conforme o diâmetro aerodinâmico:
 *   - Inalável  (<100 µm): partículas que penetram no sistema respiratório
 *   - Torácica  (<10 µm): atingem traqueia e brônquios
 *   - Respirável(<4 µm) : depositam-se nos alvéolos pulmonares
 *
 * @param {number} diameter_um - Aerodynamic diameter in micrometres (µm)
 * @returns {'inhalable'|'thoracic'|'respirable'|'non-inhalable'}
 */
export function classifyParticulateFraction(diameter_um: number): 'inhalable' | 'thoracic' | 'respirable' | 'non-inhalable' {
    if (typeof diameter_um !== 'number' || diameter_um < 0) {
        throw new RangeError('diameter_um must be a non-negative number');
    }
    if (diameter_um < ISO7708_CUTOFFS.RESPIRABLE_MAX_UM) return 'respirable';
    if (diameter_um < ISO7708_CUTOFFS.THORACIC_MAX_UM) return 'thoracic';
    if (diameter_um < ISO7708_CUTOFFS.INHALABLE_MAX_UM) return 'inhalable';
    return 'non-inhalable';
}

/**
 * Compute Exposure Index (EI) from a set of shift measurements.
 *
 * Calcula o Índice de Exposição (IE = TWA / OEL) a partir das medições do turno.
 * Usa média aritmética ponderada no tempo para estimar o TWA.
 *
 * @param {{ concentration: number, duration_h: number }[]} measurements
 *   Array de objetos com concentração e duração de cada amostra
 * @param {number} oel - Occupational Exposure Limit (same units as concentrations)
 * @returns {{ EI: number, category: 'acceptable'|'action_level'|'exceeded' }}
 */
export function computeExposureIndex(measurements: Measurement[], oel: number): EIResult {
    if (!Array.isArray(measurements) || measurements.length === 0) {
        throw new TypeError('measurements must be a non-empty array');
    }
    if (typeof oel !== 'number' || oel <= 0) {
        throw new RangeError('oel must be a positive number');
    }

    // TWA = Σ(Ci × Ti) / Σ(Ti) - média ponderada no tempo (NIOSH Pub. 77-173)
    let sumCT = 0;
    let sumT = 0;
    for (const m of measurements) {
        if (typeof m.concentration !== 'number' || m.concentration < 0) {
            throw new RangeError('each measurement.concentration must be >= 0');
        }
        if (typeof m.duration_h !== 'number' || m.duration_h <= 0) {
            throw new RangeError('each measurement.duration_h must be > 0');
        }
        sumCT += m.concentration * m.duration_h;
        sumT += m.duration_h;
    }

    const twa = sumCT / sumT;
    const EI = twa / oel;

    let category: 'exceeded' | 'action_level' | 'acceptable';
    if (EI > EI_THRESHOLDS.EXCEEDED) {
        category = 'exceeded';
    } else if (EI > EI_THRESHOLDS.ACTION_LEVEL) {
        category = 'action_level';
    } else {
        category = 'acceptable';
    }

    return { EI, category };
}

/**
 * Apply ILO historical dust model: compare dust count (MPPCM) to limit.
 *
 * Aplica o modelo histórico ILO para partículas totais em MPPCM (millions of
 * particles per cubic meter). Usado em ambientes de mineração e pedreiras onde
 * a contagem de partículas precede a gravimetria.
 *
 * @param {number} particles_mpcm3  - Measured dust count (MPPCM)
 * @param {number} oel_mppcm3       - OEL in MPPCM (from ILO list)
 * @returns {{ ratio: number, status: string }}
 */
export function applyILODustModel(particles_mpcm3: number, oel_mppcm3: number): ILOResult {
    if (typeof particles_mpcm3 !== 'number' || particles_mpcm3 < 0) {
        throw new RangeError('particles_mpcm3 must be non-negative');
    }
    if (typeof oel_mppcm3 !== 'number' || oel_mppcm3 <= 0) {
        throw new RangeError('oel_mppcm3 must be positive');
    }

    // Razão de exposição (ILO Occ. Safety Series No. 37, cap. 3)
    const ratio = particles_mpcm3 / oel_mppcm3;

    let status: string;
    if (ratio <= 0.5) {
        status = 'well_below_limit';
    } else if (ratio <= 1.0) {
        status = 'below_limit';
    } else if (ratio <= 2.0) {
        status = 'above_limit';
    } else {
        status = 'significantly_above_limit';
    }

    return { ratio, status };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const respiratoryHazardAssessmentMeta = {
    name: 'respiratoryHazardAssessment',
    description: 'Occupational Respiratory Risk',
    category: 'analytics',
    familyTags: ['risk'],
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
