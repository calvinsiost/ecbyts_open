// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
/**
 * Hazardous Waste Segregation - ABNT NBR 10004:2004 + ADR 2023 + NFPA 400
 *
 * References:
 *   ABNT NBR 10004:2004 - Resíduos Sólidos: Classificação. Tabela A (Anexo A).
 *   ADR 2023 - European Agreement concerning the International Carriage of Dangerous
 *     Goods by Road. UNECE. ISBN:978-92-1-139190-3
 *   NFPA 400 (2022) - Hazardous Materials Code. National Fire Protection Association.
 */

'use strict';

/**
 * Incompatibility matrix for ABNT NBR 10004 waste classes.
 * Classes: OX=oxidiser, FL=flammable liquid, FS=flammable solid, TO=toxic,
 *          CO=corrosive, RE=reactive, IN=infectious, RD=radioactive, GC=general_chemical
 * Value: 'incompatible'|'caution'|'compatible'
 * Source: ABNT NBR 10004:2004 Anexo A + NFPA 400 segregation tables.
 */
/** @type {Record<string, Record<string, string>>} */
const INCOMPATIBILITY = {
    OX: {
        OX: 'compatible',
        FL: 'incompatible',
        FS: 'incompatible',
        TO: 'caution',
        CO: 'caution',
        RE: 'incompatible',
        IN: 'caution',
        RD: 'caution',
        GC: 'caution',
    },
    FL: {
        OX: 'incompatible',
        FL: 'compatible',
        FS: 'caution',
        TO: 'caution',
        CO: 'caution',
        RE: 'incompatible',
        IN: 'compatible',
        RD: 'caution',
        GC: 'compatible',
    },
    FS: {
        OX: 'incompatible',
        FL: 'caution',
        FS: 'compatible',
        TO: 'caution',
        CO: 'caution',
        RE: 'incompatible',
        IN: 'compatible',
        RD: 'caution',
        GC: 'compatible',
    },
    TO: {
        OX: 'caution',
        FL: 'caution',
        FS: 'caution',
        TO: 'compatible',
        CO: 'caution',
        RE: 'caution',
        IN: 'incompatible',
        RD: 'caution',
        GC: 'compatible',
    },
    CO: {
        OX: 'caution',
        FL: 'caution',
        FS: 'caution',
        TO: 'caution',
        CO: 'compatible',
        RE: 'incompatible',
        IN: 'caution',
        RD: 'caution',
        GC: 'compatible',
    },
    RE: {
        OX: 'incompatible',
        FL: 'incompatible',
        FS: 'incompatible',
        TO: 'caution',
        CO: 'incompatible',
        RE: 'compatible',
        IN: 'caution',
        RD: 'caution',
        GC: 'caution',
    },
    IN: {
        OX: 'caution',
        FL: 'compatible',
        FS: 'compatible',
        TO: 'incompatible',
        CO: 'caution',
        RE: 'caution',
        IN: 'compatible',
        RD: 'incompatible',
        GC: 'compatible',
    },
    RD: {
        OX: 'caution',
        FL: 'caution',
        FS: 'caution',
        TO: 'caution',
        CO: 'caution',
        RE: 'caution',
        IN: 'incompatible',
        RD: 'compatible',
        GC: 'caution',
    },
    GC: {
        OX: 'caution',
        FL: 'compatible',
        FS: 'compatible',
        TO: 'compatible',
        CO: 'compatible',
        RE: 'caution',
        IN: 'compatible',
        RD: 'caution',
        GC: 'compatible',
    },
};

const VALID_CLASSES = Object.keys(INCOMPATIBILITY);

/**
 * Checks storage compatibility between two hazardous waste classes.
 *
 * @param {string} waste1_class - Class code (OX|FL|FS|TO|CO|RE|IN|RD|GC).
 * @param {string} waste2_class - Class code.
 * @returns {{compatible: boolean, risk: 'incompatible'|'caution'|'compatible', reason: string}}
 */
export function checkCompatibility(waste1_class: any, waste2_class: any) {
    const c1 = String(waste1_class).toUpperCase();
    const c2 = String(waste2_class).toUpperCase();

    if (!VALID_CLASSES.includes(c1))
        throw new RangeError(`checkCompatibility: unknown class '${c1}'. Valid: ${VALID_CLASSES.join(',')}`);
    if (!VALID_CLASSES.includes(c2))
        throw new RangeError(`checkCompatibility: unknown class '${c2}'. Valid: ${VALID_CLASSES.join(',')}`);

const risk = (INCOMPATIBILITY as any)[c1][c2];
    /** @type {Record<string, string>} */
    const reasons = {
        incompatible: `Classes ${c1} e ${c2} não podem ser armazenadas juntas — risco de reação violenta, incêndio ou explosão (ABNT NBR 10004:2004 Tabela A).`,
        caution: `Classes ${c1} e ${c2} requerem medidas de separação física e monitoramento contínuo.`,
        compatible: `Classes ${c1} e ${c2} são compatíveis para armazenamento conjunto conforme ABNT NBR 10004:2004.`,
    };
    return {
        compatible: risk === 'compatible',
        risk: /** @type {'incompatible'|'caution'|'compatible'} */ (risk),
reason: (reasons as any)[risk],
    };
}

/**
 * ADR 2023 UN number lookup table (50+ entries).
 * Covers main classes: 1–9 including divisions.
 * @type {Map<number, {class: string, division: string, label: string}>}
 */
const ADR_UN_TABLE = new Map([
    [1001, { class: '2', division: '2.1', label: 'Acetylene, dissolved' }],
    [1005, { class: '2', division: '2.3', label: 'Ammonia, anhydrous' }],
    [1010, { class: '2', division: '2.1', label: 'Butadienes, stabilized' }],
    [1017, { class: '2', division: '2.3', label: 'Chlorine' }],
    [1023, { class: '2', division: '2.1', label: 'Coal gas, compressed' }],
    [1040, { class: '2', division: '2.3', label: 'Ethylene oxide' }],
    [1049, { class: '2', division: '2.1', label: 'Hydrogen, compressed' }],
    [1072, { class: '2', division: '2.2', label: 'Oxygen, compressed' }],
    [1073, { class: '2', division: '2.2', label: 'Oxygen, refrigerated liquid' }],
    [1090, { class: '3', division: '3', label: 'Acetone' }],
    [1114, { class: '3', division: '3', label: 'Benzene' }],
    [1170, { class: '3', division: '3', label: 'Ethanol solution' }],
    [1203, { class: '3', division: '3', label: 'Gasoline' }],
    [1223, { class: '3', division: '3', label: 'Kerosene' }],
    [1230, { class: '3', division: '3', label: 'Methanol' }],
    [1263, { class: '3', division: '3', label: 'Paint' }],
    [1381, { class: '4', division: '4.2', label: 'Phosphorus, white, dry' }],
    [1428, { class: '4', division: '4.3', label: 'Sodium' }],
    [1510, { class: '5', division: '5.1', label: 'Tetranitromethane' }],
    [1511, { class: '5', division: '5.1', label: 'Urea hydrogen peroxide' }],
    [1547, { class: '6', division: '6.1', label: 'Aniline' }],
    [1548, { class: '6', division: '6.1', label: 'Aniline hydrochloride' }],
    [1580, { class: '6', division: '6.1', label: 'Chloropicrin' }],
    [1593, { class: '6', division: '6.1', label: 'Dichloromethane' }],
    [1648, { class: '6', division: '6.1', label: 'Acetonitrile' }],
    [1689, { class: '6', division: '6.1', label: 'Sodium cyanide, solid' }],
    [1760, { class: '8', division: '8', label: 'Corrosive liquid, n.o.s.' }],
    [1789, { class: '8', division: '8', label: 'Hydrochloric acid' }],
    [1790, { class: '8', division: '8', label: 'Hydrofluoric acid' }],
    [1791, { class: '8', division: '8', label: 'Hypochlorite solution' }],
    [1824, { class: '8', division: '8', label: 'Sodium hydroxide solution' }],
    [1830, { class: '8', division: '8', label: 'Sulfuric acid' }],
    [1848, { class: '8', division: '8', label: 'Propionic acid' }],
    [1866, { class: '3', division: '3', label: 'Resin solution, flammable' }],
    [1897, { class: '6', division: '6.1', label: 'Tetrachloroethylene' }],
    [1941, { class: '9', division: '9', label: 'Dibromodifluoromethane' }],
    [1950, { class: '2', division: '2.1', label: 'Aerosols, flammable' }],
    [1993, { class: '3', division: '3', label: 'Flammable liquid, n.o.s.' }],
    [2014, { class: '5', division: '5.1', label: 'Hydrogen peroxide, aqueous' }],
    [2031, { class: '8', division: '8', label: 'Nitric acid' }],
    [2209, { class: '8', division: '8', label: 'Formaldehyde solution' }],
    [2447, { class: '4', division: '4.2', label: 'Phosphorus, white, molten' }],
    [2491, { class: '8', division: '8', label: 'Ethanolamine' }],
    [2672, { class: '8', division: '8', label: 'Ammonia solution' }],
    [2761, { class: '6', division: '6.1', label: 'Organochlorine pesticide, solid' }],
    [2783, { class: '6', division: '6.1', label: 'Organophosphorus pesticide, solid' }],
    [2814, { class: '6', division: '6.2', label: 'Infectious substance, affecting humans' }],
    [2900, { class: '6', division: '6.2', label: 'Infectious substance, affecting animals' }],
    [2910, { class: '7', division: '7', label: 'Radioactive material, excepted package' }],
    [2912, { class: '7', division: '7', label: 'Radioactive material, low specific activity' }],
    [3077, { class: '9', division: '9', label: 'Environmentally hazardous substance, solid' }],
    [3082, { class: '9', division: '9', label: 'Environmentally hazardous substance, liquid' }],
    [3264, { class: '8', division: '8', label: 'Corrosive liquid, acidic, inorganic' }],
    [3265, { class: '8', division: '8', label: 'Corrosive liquid, acidic, organic' }],
]);

/**
 * Classifies a substance by ADR 2023 UN number.
 *
 * @param {number} UNnumber - UN number (integer).
 * @returns {{UNnumber: number, class: string, division: string, label: string}|null} Classification or null if unknown.
 */
export function classifyADRHazmat(UNnumber: any) {
    if (!Number.isInteger(UNnumber) || UNnumber <= 0) {
        throw new RangeError('classifyADRHazmat: UNnumber must be a positive integer');
    }
    const entry = ADR_UN_TABLE.get(UNnumber);
    if (!entry) return null;
    return { UNnumber, ...entry };
}

/**
 * Calculates a composite storage risk score for a mixed waste inventory.
 * Score 0–100: proportion of incompatible pairs weighted by count.
 *
 * @param {Array<{id: string, class: string, quantity_kg: number}>} inventory - Waste items.
 * @returns {{score: number, incompatible_pairs: number, caution_pairs: number, total_pairs: number}}
 */
export function calcStorageRisk(inventory: any) {
    if (!Array.isArray(inventory) || inventory.length === 0) {
        throw new RangeError('calcStorageRisk: inventory must be a non-empty array');
    }

    let incompatible = 0;
    let caution = 0;
    let total = 0;

    for (let i = 0; i < inventory.length; i++) {
        for (let j = i + 1; j < inventory.length; j++) {
            const c1 = String(inventory[i].class).toUpperCase();
            const c2 = String(inventory[j].class).toUpperCase();
            if (!VALID_CLASSES.includes(c1) || !VALID_CLASSES.includes(c2)) continue;
const risk = (INCOMPATIBILITY as any)[c1][c2];
            total++;
            if (risk === 'incompatible') incompatible++;
            else if (risk === 'caution') caution++;
        }
    }

    const score = total === 0 ? 0 : Math.round(((incompatible + 0.5 * caution) / total) * 100);
    return { score, incompatible_pairs: incompatible, caution_pairs: caution, total_pairs: total };
}

/**
 * Generates an N×N compatibility matrix for a list of waste items.
 *
 * @param {Array<{id: string, class: string}>} wastes - Waste items with id and class.
 * @returns {{ids: string[], matrix: string[][]}} ids array + NxN compatibility matrix.
 */
export function generateSegregationMatrix(wastes: any) {
    if (!Array.isArray(wastes) || wastes.length === 0) {
        throw new RangeError('generateSegregationMatrix: wastes must be a non-empty array');
    }

    const ids = wastes.map((w) => w.id);
    const matrix = wastes.map((w1) =>
        wastes.map((w2) => {
            if (w1.id === w2.id) return 'self';
            const c1 = String(w1.class).toUpperCase();
            const c2 = String(w2.class).toUpperCase();
            if (!VALID_CLASSES.includes(c1) || !VALID_CLASSES.includes(c2)) return 'unknown';
return (INCOMPATIBILITY as any)[c1][c2];
        }),
    );

    return { ids, matrix };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const hazardousWasteSegregationMeta = {
    name: 'hazardousWasteSegregation',
    description: 'hazardousWasteSegregation',
    category: 'analytics',
    familyTags: ['waste', 'risk'],
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
