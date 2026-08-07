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
// Application: EHS & Mining - Waste Characterization
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

'use strict';

interface EPACharacteristicCode {
    code: string;
    description: string;
}

interface EPACharacteristicCodes {
    [key: string]: EPACharacteristicCode;
}

interface WasteCharacteristics {
    ignitability?: boolean;
    corrosivity?: boolean;
    reactivity?: boolean;
    toxicity?: boolean;
    hasOrganicContaminants?: boolean;
}

interface ClassifyHazardousWasteResult {
    hazardous: boolean;
    codes: string[];
    basis: string[];
    abntClass: string;
}

interface TCLPResult {
    exceeded: string[];
    pass: boolean;
}

interface WasteVolumeResult {
    volume_m3: number;
    compacted_m3: number;
}

interface LifespanResult {
    years: number;
    months: number;
    totalDays: number;
}

/**
 * Mapeamento das características de periculosidade EPA → código D.
 * Cada característica pode ser avaliada por teste ou conhecimento processual.
 */
const EPA_CHARACTERISTIC_CODES: EPACharacteristicCodes = {
    ignitability: { code: 'D001', description: 'Ignitability — flash point < 60°C' },
    corrosivity: { code: 'D002', description: 'Corrosivity — pH ≤ 2 or ≥ 12.5' },
    reactivity: { code: 'D003', description: 'Reactivity — unstable, violent, cyanide/sulfide gas' },
    toxicity: { code: 'D004', description: 'Toxicity (TCLP) — D004 through D043' },
};

/**
 * TCLP regulatory thresholds (mg/L) - 40 CFR 261.24 Table 1.
 * Limites TCLP para metais e orgânicos prioritários.
 */
const TCLP_LIMITS_MG_L: Record<string, number> = {
    arsenic: 5.0,
    barium: 100.0,
    benzene: 0.5,
    cadmium: 1.0,
    chromium: 5.0,
    lead: 5.0,
    mercury: 0.2,
    selenium: 1.0,
    silver: 5.0,
    trichloroethylene: 0.5,
    vinyl_chloride: 0.2,
};

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Classify waste as hazardous or non-hazardous per EPA RCRA and ABNT NBR 10004.
 *
 * Classifica o resíduo com base nas características fornecidas (booleanas).
 * O resultado inclui os códigos D aplicáveis e a base legal de cada um.
 * Classificação ABNT: Classe I = perigoso; II-A = não inerte; II-B = inerte.
 *
 * @param {WasteCharacteristics} characteristics - Waste characteristic flags
 * @returns {ClassifyHazardousWasteResult}
 */
export function classifyHazardousWaste(characteristics: WasteCharacteristics): ClassifyHazardousWasteResult {
    if (typeof characteristics !== 'object' || characteristics === null) {
        throw new TypeError('characteristics must be a non-null object');
    }

    const codes: string[] = [];
    const basis: string[] = [];

    const characteristicsRecord = characteristics as Record<string, boolean | undefined>;

    // Avalia cada característica de periculosidade RCRA
    for (const [key, meta] of Object.entries(EPA_CHARACTERISTIC_CODES)) {
        if (characteristicsRecord[key] === true) {
            codes.push(meta.code);
            basis.push(meta.description);
        }
    }

    const hazardous = codes.length > 0;

    // Classificação ABNT NBR 10004:2004
    // Classe I: perigoso (tóxico, inflamável, reativo, corrosivo, patogênico)
    // Classe II-A: não perigoso, não inerte (tem lixiviável ou solubilizado)
    // Classe II-B: não perigoso, inerte (não apresenta constituintes em dissolução)
    let abntClass: string;
    if (hazardous) {
        abntClass = 'Classe I';
    } else if (characteristics.hasOrganicContaminants === true) {
        abntClass = 'Classe II-A';
    } else {
        abntClass = 'Classe II-B';
    }

    return { hazardous, codes, basis, abntClass };
}

/**
 * Evaluate TCLP leaching test results against EPA regulatory limits.
 *
 * Compara as concentrações extraídas pelo TCLP com os limites da 40 CFR 261.24.
 * Qualquer exceedance classifica o resíduo como D-coded hazardous waste.
 *
 * @param {Record<string, number>} concentrations - TCLP extract (mg/L)
 * @param {Record<string, number>} [number>] - Override limits (mg/L);
 *   defaults to built-in TCLP_LIMITS_MG_L
 * @returns {TCLPResult}
 */
export function computeTCLPLeaching(concentrations: Record<string, number>, regulatoryLimits?: Record<string, number>): TCLPResult {
    if (typeof concentrations !== 'object' || concentrations === null) {
        throw new TypeError('concentrations must be a non-null object');
    }

    const limits = regulatoryLimits ?? TCLP_LIMITS_MG_L;
    const exceeded: string[] = [];

    for (const [analyte, measured] of Object.entries(concentrations)) {
        if (typeof measured !== 'number') continue;
        const limit = limits[analyte];
        // Analitos sem limite definido são ignorados (sem base TCLP)
        if (typeof limit !== 'number') continue;
        if (measured > limit) {
            exceeded.push(analyte);
        }
    }

    return { exceeded, pass: exceeded.length === 0 };
}

/**
 * Estimate waste volume from mass and density, with compaction.
 *
 * Estima o volume bruto e compactado de um resíduo a partir da massa e
 * densidade. O fator de compactação representa a redução volumétrica por
 * compressão mecânica (típico 2–6× para RSU).
 *
 * @param {number} density          - Bulk density (kg/m³)
 * @param {number} mass_kg          - Total waste mass (kg)
 * @param {number} compaction_factor - Dimensionless volume reduction factor (≥1)
 * @returns {WasteVolumeResult}
 */
export function estimateWasteVolume(density: number, mass_kg: number, compaction_factor: number): WasteVolumeResult {
    if (typeof density !== 'number' || density <= 0) {
        throw new RangeError('density must be positive (kg/m³)');
    }
    if (typeof mass_kg !== 'number' || mass_kg < 0) {
        throw new RangeError('mass_kg must be non-negative');
    }
    if (typeof compaction_factor !== 'number' || compaction_factor < 1) {
        throw new RangeError('compaction_factor must be >= 1');
    }

    // Volume bruto = massa / densidade
    const volume_m3 = mass_kg / density;
    // Volume compactado = volume bruto / fator de compactação
    const compacted_m3 = volume_m3 / compaction_factor;

    return { volume_m3, compacted_m3 };
}

/**
 * Estimate remaining landfill lifespan based on capacity and daily intake.
 *
 * Estima a vida útil remanescente de um aterro a partir da capacidade
 * disponível e da taxa diária de recebimento. O fator de compactação in-situ
 * aumenta a vida útil do aterro (Tchobanoglous et al., 1993, Cap. 11).
 *
 * @param {number} capacity_m3       - Available airspace (m³)
 * @param {number} daily_intake_m3   - Uncompacted daily waste volume (m³/day)
 * @param {number} compaction_factor - In-situ compaction factor (≥1)
 * @returns {LifespanResult}
 */
export function computeLandfillLifespan(capacity_m3: number, daily_intake_m3: number, compaction_factor: number): LifespanResult {
    if (typeof capacity_m3 !== 'number' || capacity_m3 <= 0) {
        throw new RangeError('capacity_m3 must be positive');
    }
    if (typeof daily_intake_m3 !== 'number' || daily_intake_m3 <= 0) {
        throw new RangeError('daily_intake_m3 must be positive');
    }
    if (typeof compaction_factor !== 'number' || compaction_factor < 1) {
        throw new RangeError('compaction_factor must be >= 1');
    }

    // Volume diário compactado in-situ = intake / fator de compactação
    const compactedDailyVolume = daily_intake_m3 / compaction_factor;

    // Dias restantes = capacidade / volume diário compactado
    const totalDays = capacity_m3 / compactedDailyVolume;

    const years = Math.floor(totalDays / 365);
    const months = Math.floor((totalDays % 365) / 30);

    return { years, months, totalDays };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const wasteCharacterizationEPAMeta = {
    name: 'wasteCharacterizationEPA',
    description: 'Waste Characterization',
    category: 'analytics',
    familyTags: ['waste'],
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
