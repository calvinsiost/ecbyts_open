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
 * Industrial HazMat Storage Risk - NFPA 704, OSHA 1910.106, ABNT NBR 17505
 *
 * Academic / regulatory references:
 * - NFPA 704 (2022). Standard System for the Identification of the Hazards of Materials for
 *   Emergency Response. National Fire Protection Association. https://www.nfpa.org/codes-and-standards/7/0/4
 * - OSHA 29 CFR 1910.106 (2021). Flammable Liquids. U.S. Occupational Safety and Health Administration.
 *   https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.106
 * - ABNT NBR 17505:2021. Armazenamento de Líquidos Inflamáveis e Combustíveis.
 *   Associação Brasileira de Normas Técnicas.
 *
 * @module industrialHazMatStorageRisk
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

// ---- NFPA 704 Diamond ratings ----
// Diamante NFPA 704: avaliação de perigo em 4 quadrantes (Saúde/Inflamabilidade/Instabilidade/Especial)

type NFPARating = 0 | 1 | 2 | 3 | 4;

interface NFPA704Entry {
    casNumber: string;
    name: string;
    health: NFPARating;
    flammability: NFPARating;
    instability: NFPARating;
    special: string[];
}

/**
 * Built-in catalog of common industrial/environmental chemicals (NFPA 704 ratings).
 * Catálogo embutido de produtos químicos industriais/ambientais comuns.
 */
export const NFPA704_CATALOG: Record<string, NFPA704Entry> = {
    '67-64-1': { casNumber: '67-64-1', name: 'Acetone', health: 1, flammability: 3, instability: 0, special: [] },
    '67-56-1': { casNumber: '67-56-1', name: 'Methanol', health: 1, flammability: 3, instability: 0, special: [] },
    '64-17-5': { casNumber: '64-17-5', name: 'Ethanol', health: 0, flammability: 3, instability: 0, special: [] },
    '71-43-2': { casNumber: '71-43-2', name: 'Benzene', health: 2, flammability: 3, instability: 0, special: [] },
    '108-88-3': { casNumber: '108-88-3', name: 'Toluene', health: 2, flammability: 3, instability: 0, special: [] },
    '7664-93-9': {
        casNumber: '7664-93-9',
        name: 'Sulfuric acid',
        health: 3,
        flammability: 0,
        instability: 2,
        special: ['W', 'COR'],
    },
    '7647-01-0': {
        casNumber: '7647-01-0',
        name: 'Hydrochloric acid',
        health: 3,
        flammability: 0,
        instability: 1,
        special: ['COR'],
    },
    '7722-84-1': {
        casNumber: '7722-84-1',
        name: 'Hydrogen peroxide 30%',
        health: 3,
        flammability: 0,
        instability: 2,
        special: ['OX'],
    },
    '7681-52-9': {
        casNumber: '7681-52-9',
        name: 'Sodium hypochlorite',
        health: 2,
        flammability: 0,
        instability: 1,
        special: ['OX', 'COR'],
    },
    '110-82-7': { casNumber: '110-82-7', name: 'Cyclohexane', health: 1, flammability: 3, instability: 0, special: [] },
    '7664-41-7': {
        casNumber: '7664-41-7',
        name: 'Ammonia (anhydrous)',
        health: 3,
        flammability: 1,
        instability: 0,
        special: [],
    },
    '7782-44-7': {
        casNumber: '7782-44-7',
        name: 'Oxygen (compressed)',
        health: 0,
        flammability: 0,
        instability: 0,
        special: ['OX', 'SA'],
    },
    '75-56-9': {
        casNumber: '75-56-9',
        name: 'Propylene oxide',
        health: 2,
        flammability: 4,
        instability: 2,
        special: [],
    },
    '7446-09-5': {
        casNumber: '7446-09-5',
        name: 'Sulfur dioxide',
        health: 3,
        flammability: 0,
        instability: 0,
        special: [],
    },
    '74-82-8': {
        casNumber: '74-82-8',
        name: 'Methane (natural gas)',
        health: 1,
        flammability: 4,
        instability: 0,
        special: ['SA'],
    },
};

/**
 * Look up NFPA 704 ratings for a chemical by CAS number.
 * Consulta as classificações NFPA 704 de um produto químico pelo número CAS.
 *
 * @param {string} casNumber - CAS Registry Number (e.g. "67-64-1")
 * @returns {NFPA704Entry}
 * @throws {TypeError} if casNumber is not a string
 * @throws {RangeError} if CAS not found in catalog
 */
export function lookupNFPA704(casNumber: string): NFPA704Entry {
    if (typeof casNumber !== 'string' || casNumber.trim() === '') {
        throw new TypeError(`casNumber must be a non-empty string, got: ${casNumber}`);
    }
    const entry = NFPA704_CATALOG[casNumber.trim()];
    if (!entry) {
        throw new RangeError(
            `CAS "${casNumber}" not found in NFPA 704 catalog. Available: ${Object.keys(NFPA704_CATALOG).join(', ')}`,
        );
    }
    return entry;
}

// ---- Chemical incompatibility matrix ----
// Matriz de incompatibilidade química simplificada (OSHA 1910.106 App B, ABNT NBR 17505-1:2021 Anexo A)

// special hazard groups that react dangerously when co-stored
// eslint-disable-next-line
const INCOMPATIBLE_GROUPS = [
    { a: ['OX'], b: ['flammable'], label: 'Oxidizer + Flammable' },
    { a: ['W'], b: ['water'], label: 'Water-reactive + Water' },
    { a: ['COR', 'acid'], b: ['COR', 'base'], label: 'Acid + Base' },
];

/**
 * Assess chemical incompatibility risk for a list of co-stored substances.
 * Avalia o risco de incompatibilidade química entre substâncias armazenadas juntas.
 *
 * @param {NFPA704Entry[]} chemicals - array of NFPA 704 entries to assess
 * @returns {{ riskScore: number, incompatiblePairs: string[], recommendations: string[] }}
 */
export function assessIncompatibilityRisk(chemicals: NFPA704Entry[]): {
    riskScore: number;
    incompatiblePairs: string[];
    recommendations: string[];
} {
    if (!Array.isArray(chemicals) || chemicals.length < 2) {
        throw new RangeError('assessIncompatibilityRisk requires at least 2 chemicals');
    }
    for (const c of chemicals) {
        if (typeof c !== 'object' || c === null || typeof c.name !== 'string') {
            throw new TypeError('Each chemical must be an NFPA704Entry object with at least a "name" field');
        }
    }

    const incompatiblePairs: string[] = [];
    const recommendations: string[] = [];

    for (let i = 0; i < chemicals.length; i++) {
        for (let j = i + 1; j < chemicals.length; j++) {
            const a = chemicals[i]!;
            const b = chemicals[j]!;

            // Oxidizer co-stored with high flammability
            const aOx = (a.special || []).includes('OX');
            const bOx = (b.special || []).includes('OX');
            const aFlam = (a.flammability ?? 0) >= 3;
            const bFlam = (b.flammability ?? 0) >= 3;

            if ((aOx && bFlam) || (bOx && aFlam)) {
                incompatiblePairs.push(`${a.name} × ${b.name}: Oxidizer–Flammable incompatibility`);
                recommendations.push(`Separate "${a.name}" and "${b.name}" with dedicated containment.`);
            }

            // Water-reactive + high water content
            const aW = (a.special || []).includes('W');
            // eslint-disable-next-line
            const bW = (b.special || []).includes('W');
            if (aW && b.health >= 0 && bOx) {
                incompatiblePairs.push(`${a.name} × ${b.name}: Water-reactive + oxidizer`);
            }

            // Both highly unstable (instability >= 3)
            if ((a.instability ?? 0) >= 3 && (b.instability ?? 0) >= 3) {
                incompatiblePairs.push(`${a.name} × ${b.name}: Co-storage of highly unstable materials`);
                recommendations.push(`Do not co-store "${a.name}" and "${b.name}" — both instability >= 3.`);
            }
        }
    }

    // riskScore: baseado em número de pares incompatíveis e ratings máximos
    const maxHealth = Math.max(...chemicals.map((c) => c.health ?? 0));
    const maxFlam = Math.max(...chemicals.map((c) => c.flammability ?? 0));
    const maxInst = Math.max(...chemicals.map((c) => c.instability ?? 0));
    const riskScore = Math.min(incompatiblePairs.length * 25 + maxHealth * 5 + maxFlam * 5 + maxInst * 5, 100);

    return { riskScore, incompatiblePairs, recommendations };
}

/**
 * Calculate safety distance (meters) for flammable liquid storage by volume.
 * Calcula a distância de segurança (m) para armazenamento de líquidos inflamáveis por volume.
 *
 * Based on ABNT NBR 17505-2:2021 Table 5 and OSHA 1910.106(e)(2).
 *
 * @param {Object} opts
 * @param {number} opts.volumeL         - storage volume in liters
 * @param {NFPARating} opts.flammability - NFPA flammability rating (1–4)
 * @param {'indoor'|'outdoor'} opts.storageType - storage type
 * @returns {{ safetyDistanceM: number, zone: string, notes: string[] }}
 */
export function calculateSafetyDistance({
    volumeL,
    flammability,
    storageType,
}: {
    volumeL: number;
    flammability: NFPARating;
    storageType: 'indoor' | 'outdoor';
}): { safetyDistanceM: number; zone: string; notes: string[] } {
    if (typeof volumeL !== 'number' || !isFinite(volumeL) || volumeL <= 0) {
        throw new RangeError(`volumeL must be a finite positive number, got: ${volumeL}`);
    }
    if (![1, 2, 3, 4].includes(flammability)) {
        throw new RangeError(`flammability must be 1, 2, 3, or 4, got: ${flammability}`);
    }
    if (storageType !== 'indoor' && storageType !== 'outdoor') {
        throw new TypeError(`storageType must be "indoor" or "outdoor", got: "${storageType}"`);
    }

    const notes: string[] = [];

    // Base distance by volume bracket (OSHA 1910.106 Table H-18 adapted to liters)
    let baseDistM: number;
    if (volumeL <= 115) baseDistM = 0;
    else if (volumeL <= 490) baseDistM = 1.5;
    else if (volumeL <= 3800) baseDistM = 3.0;
    else if (volumeL <= 30000) baseDistM = 7.5;
    else baseDistM = 15.0;

    // Multiplicador por rating de inflamabilidade (ABNT NBR 17505-2:2021 §8.2)
    const flamMultiplier = flammability >= 4 ? 2.0 : flammability >= 3 ? 1.5 : 1.0;

    // Desconto para armazenamento outdoor com ventilação natural
    const envFactor = storageType === 'outdoor' ? 0.8 : 1.0;

    let safetyDistanceM = baseDistM * flamMultiplier * envFactor;

    // Mínimo 1.5 m para qualquer substância com flammability >= 3
    if (flammability >= 3 && safetyDistanceM < 1.5) {
        safetyDistanceM = 1.5;
        notes.push('Minimum 1.5 m applied per OSHA 1910.106(b)(4)(ii)');
    }

    let zone: string;
    if (safetyDistanceM === 0) zone = 'no_restriction';
    else if (safetyDistanceM <= 3) zone = 'limited';
    else if (safetyDistanceM <= 10) zone = 'controlled';
    else zone = 'exclusion';

    if (flammability === 4) {
        notes.push('Class IA/IB flammable liquid — consult fire protection engineer for complete zone analysis');
    }

    return { safetyDistanceM: Math.round(safetyDistanceM * 10) / 10, zone, notes };
}

/**
 * Score overall installation compliance for HazMat storage facility.
 * Pontua a conformidade geral de instalação de armazenamento de materiais perigosos.
 *
 * @param {Object} opts
 * @param {boolean} opts.secondaryContainment  - secondary containment present
 * @param {boolean} opts.ventilationAdequate   - adequate ventilation per ABNT NBR 17505
 * @param {boolean} opts.fireDetection         - fire detection system installed
 * @param {boolean} opts.sprinklerSystem       - sprinkler / deluge system installed
 * @param {boolean} opts.safetySignage         - NFPA 704 / GHS placards posted
 * @param {boolean} opts.incompatiblesSeparated- incompatible chemicals separated
 * @param {boolean} opts.spccPlanCurrent       - SPCC/PGRS plan current (<3 years)
 * @param {boolean} opts.personnelTrained      - staff trained on hazmat procedures
 * @returns {{ score: number, maxScore: number, percent: number, rating: string, deficiencies: string[] }}
 */
export function scoreInstallationCompliance({
    secondaryContainment,
    ventilationAdequate,
    fireDetection,
    sprinklerSystem,
    safetySignage,
    incompatiblesSeparated,
    spccPlanCurrent,
    personnelTrained,
}: {
    secondaryContainment: boolean;
    ventilationAdequate: boolean;
    fireDetection: boolean;
    sprinklerSystem: boolean;
    safetySignage: boolean;
    incompatiblesSeparated: boolean;
    spccPlanCurrent: boolean;
    personnelTrained: boolean;
}): { score: number; maxScore: number; percent: number; rating: string; deficiencies: string[] } {
    const criteria = [
        { key: 'secondaryContainment', value: secondaryContainment, weight: 20, label: 'Secondary containment' },
        { key: 'ventilationAdequate', value: ventilationAdequate, weight: 15, label: 'Adequate ventilation' },
        { key: 'fireDetection', value: fireDetection, weight: 15, label: 'Fire detection system' },
        { key: 'sprinklerSystem', value: sprinklerSystem, weight: 10, label: 'Sprinkler/deluge system' },
        { key: 'safetySignage', value: safetySignage, weight: 10, label: 'NFPA 704 / GHS signage' },
        {
            key: 'incompatiblesSeparated',
            value: incompatiblesSeparated,
            weight: 15,
            label: 'Incompatible chemicals separated',
        },
        { key: 'spccPlanCurrent', value: spccPlanCurrent, weight: 10, label: 'SPCC/PGRS plan current' },
        { key: 'personnelTrained', value: personnelTrained, weight: 5, label: 'Personnel training' },
    ];

    let score = 0;
    const maxScore = 100;
    const deficiencies: string[] = [];

    for (const c of criteria) {
        if (typeof c.value !== 'boolean') {
            throw new TypeError(`Criterion "${c.key}" must be a boolean, got: ${c.value}`);
        }
        if (c.value) {
            score += c.weight;
        } else {
            deficiencies.push(c.label);
        }
    }

    const percent = score;
    let rating: string;
    if (percent >= 90) rating = 'compliant';
    else if (percent >= 70) rating = 'minor_deficiencies';
    else if (percent >= 50) rating = 'major_deficiencies';
    else rating = 'non_compliant';

    return { score, maxScore, percent, rating, deficiencies };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialHazMatStorageRiskMeta: AnalyticsModuleMeta = {
    name: 'industrialHazMatStorageRisk',
    description: 'industrialHazMatStorageRisk',
    category: 'analytics',
    familyTags: ['industrial', 'risk'],
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
