// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CAS REGISTRY — Chemical Abstracts Service number validation & lookup
   Registro CAS para identificacao de substancias quimicas

   O numero CAS (Chemical Abstracts Service) e o identificador universal
   de substancias quimicas. Formato: XXXXXXX-YY-Z onde Z e o digito
   verificador (checksum mod 10). Este modulo valida, busca e lista
   as 50 substancias mais relevantes para monitoramento ambiental.

   Referencia: CAS Registry (American Chemical Society)
   ================================================================ */

import { createLogger } from '../../utils/helpers/logger.js';
import { SUBSTANCE_DATASET } from './casDataset.js';

const log = createLogger('CASRegistry');

// ----------------------------------------------------------------
// EMBEDDED DATABASE - Top 50 environmental monitoring chemicals
// Base embutida com as 50 substancias mais comuns em monitoramento
// ----------------------------------------------------------------

interface CASEntry {
    /** CAS number (format: XXXXXXX-YY-Z) */
    cas: string;
    /** Common chemical name (English) */
    name: string;
    /** Molecular formula */
    formula: string;
    /** Chemical family/group */
    family: string;
}

const DATABASE: CASEntry[] = [
    // --- BTEX (Benzene, Toluene, Ethylbenzene, Xylenes) ---
    { cas: '71-43-2', name: 'Benzene', formula: 'C6H6', family: 'BTEX' },
    { cas: '108-88-3', name: 'Toluene', formula: 'C7H8', family: 'BTEX' },
    { cas: '100-41-4', name: 'Ethylbenzene', formula: 'C8H10', family: 'BTEX' },
    { cas: '1330-20-7', name: 'Xylenes (mixed)', formula: 'C8H10', family: 'BTEX' },

    // --- Heavy metals / Metais pesados ---
    { cas: '7439-92-1', name: 'Lead', formula: 'Pb', family: 'Heavy Metal' },
    { cas: '7440-38-2', name: 'Arsenic', formula: 'As', family: 'Metalloid' },
    { cas: '7439-97-6', name: 'Mercury', formula: 'Hg', family: 'Heavy Metal' },
    { cas: '7440-43-9', name: 'Cadmium', formula: 'Cd', family: 'Heavy Metal' },
    { cas: '18540-29-9', name: 'Chromium (VI)', formula: 'Cr', family: 'Heavy Metal' },
    { cas: '7440-02-0', name: 'Nickel', formula: 'Ni', family: 'Heavy Metal' },
    { cas: '7440-66-6', name: 'Zinc', formula: 'Zn', family: 'Metal' },
    { cas: '7440-50-8', name: 'Copper', formula: 'Cu', family: 'Metal' },
    { cas: '7440-62-2', name: 'Vanadium', formula: 'V', family: 'Metal' },
    { cas: '7440-48-4', name: 'Cobalt', formula: 'Co', family: 'Metal' },
    { cas: '7782-49-2', name: 'Selenium', formula: 'Se', family: 'Metalloid' },
    { cas: '7440-36-0', name: 'Antimony', formula: 'Sb', family: 'Metalloid' },
    { cas: '7440-28-0', name: 'Thallium', formula: 'Tl', family: 'Heavy Metal' },
    { cas: '7440-47-3', name: 'Chromium (total)', formula: 'Cr', family: 'Metal' },

    // --- Chlorinated solvents / Solventes clorados ---
    { cas: '79-01-6', name: 'Trichloroethylene (TCE)', formula: 'C2HCl3', family: 'Chlorinated Solvent' },
    { cas: '127-18-4', name: 'Tetrachloroethylene (PCE)', formula: 'C2Cl4', family: 'Chlorinated Solvent' },
    { cas: '75-01-4', name: 'Vinyl Chloride', formula: 'C2H3Cl', family: 'Chlorinated Solvent' },
    { cas: '156-59-2', name: 'cis-1,2-Dichloroethylene', formula: 'C2H2Cl2', family: 'Chlorinated Solvent' },
    { cas: '156-60-5', name: 'trans-1,2-Dichloroethylene', formula: 'C2H2Cl2', family: 'Chlorinated Solvent' },
    { cas: '75-35-4', name: '1,1-Dichloroethylene', formula: 'C2H2Cl2', family: 'Chlorinated Solvent' },
    { cas: '67-66-3', name: 'Chloroform', formula: 'CHCl3', family: 'Chlorinated Solvent' },
    { cas: '56-23-5', name: 'Carbon Tetrachloride', formula: 'CCl4', family: 'Chlorinated Solvent' },
    { cas: '75-09-2', name: 'Dichloromethane', formula: 'CH2Cl2', family: 'Chlorinated Solvent' },

    // --- PAHs (Polycyclic Aromatic Hydrocarbons) ---
    { cas: '50-32-8', name: 'Benzo[a]pyrene', formula: 'C20H12', family: 'PAH' },
    { cas: '91-20-3', name: 'Naphthalene', formula: 'C10H8', family: 'PAH' },
    { cas: '120-12-7', name: 'Anthracene', formula: 'C14H10', family: 'PAH' },
    { cas: '206-44-0', name: 'Fluoranthene', formula: 'C16H10', family: 'PAH' },
    { cas: '129-00-0', name: 'Pyrene', formula: 'C16H10', family: 'PAH' },
    { cas: '85-01-8', name: 'Phenanthrene', formula: 'C14H10', family: 'PAH' },
    { cas: '218-01-9', name: 'Chrysene', formula: 'C18H12', family: 'PAH' },

    // --- PCBs ---
    { cas: '11097-69-1', name: 'Aroclor 1254 (PCB)', formula: 'C12H5Cl5', family: 'PCB' },
    { cas: '1336-36-3', name: 'PCBs (total)', formula: 'varies', family: 'PCB' },

    // --- Petroleum / Derivados de petroleo ---
    { cas: '1634-04-4', name: 'MTBE', formula: 'C5H12O', family: 'Fuel Oxygenate' },
    { cas: '108-95-2', name: 'Phenol', formula: 'C6H6O', family: 'Phenol' },
    { cas: '98-82-8', name: 'Isopropylbenzene (Cumene)', formula: 'C9H12', family: 'Aromatic' },
    { cas: '100-42-5', name: 'Styrene', formula: 'C8H8', family: 'Aromatic' },

    // --- Pesticides / Agrotoxicos ---
    { cas: '50-29-3', name: 'DDT', formula: 'C14H9Cl5', family: 'Organochlorine Pesticide' },
    { cas: '309-00-2', name: 'Aldrin', formula: 'C12H8Cl6', family: 'Organochlorine Pesticide' },
    { cas: '60-57-1', name: 'Dieldrin', formula: 'C12H8Cl6O', family: 'Organochlorine Pesticide' },
    { cas: '72-20-8', name: 'Endrin', formula: 'C12H8Cl6O', family: 'Organochlorine Pesticide' },
    { cas: '58-89-9', name: 'Lindane (gamma-HCH)', formula: 'C6H6Cl6', family: 'Organochlorine Pesticide' },
    { cas: '1912-24-9', name: 'Atrazine', formula: 'C8H14ClN5', family: 'Triazine Herbicide' },

    // --- Inorganics / Inorganicos ---
    { cas: '7664-41-7', name: 'Ammonia', formula: 'NH3', family: 'Inorganic' },
    { cas: '7697-37-2', name: 'Nitric Acid', formula: 'HNO3', family: 'Inorganic' },
    { cas: '143-33-9', name: 'Sodium Cyanide', formula: 'NaCN', family: 'Cyanide' },
    { cas: '7681-49-4', name: 'Sodium Fluoride', formula: 'NaF', family: 'Fluoride' },
    { cas: '7439-96-5', name: 'Manganese', formula: 'Mn', family: 'Metal' },
    { cas: '7440-39-3', name: 'Barium', formula: 'Ba', family: 'Metal' },
];

/** CAS number -> entry */
const _indexByCAS: Map<string, CASEntry> = new Map();

/** lowercase name -> entry */
const _indexByName: Map<string, CASEntry> = new Map();

// Build indices on module load
// Constroi indices no carregamento do modulo
for (const entry of DATABASE) {
    _indexByCAS.set(entry.cas, entry);
    _indexByName.set(entry.name.toLowerCase(), entry);
}

// ----------------------------------------------------------------
// VALIDATION - CAS checksum algorithm
// Validacao do digito verificador CAS
// ----------------------------------------------------------------

/**
 * Validate a CAS Registry Number using the checksum algorithm.
 * O ultimo digito e a soma ponderada dos demais mod 10.
 *
 * @param casNumber - CAS number (e.g. '71-43-2')
 * @returns True if valid CAS format and checksum
 */
export function validateCAS(casNumber: string): boolean {
    if (typeof casNumber !== 'string') return false;
    const trimmed = casNumber.trim();
    if (!/^\d{2,7}-\d{2}-\d$/.test(trimmed)) return false;

    const digits = trimmed.replace(/-/g, '');
    const checkDigit = parseInt(digits[digits.length - 1]!, 10);
    let sum = 0;
    for (let i = digits.length - 2; i >= 0; i--) {
        sum += parseInt(digits[i]!, 10) * (digits.length - 1 - i);
    }
    return sum % 10 === checkDigit;
}

// ----------------------------------------------------------------
// LOOKUP - Find chemical by CAS number
// Busca substancia pelo numero CAS
// ----------------------------------------------------------------

/**
 * Look up a chemical substance by CAS number in the embedded database.
 * Busca uma substancia no banco embutido pelo numero CAS.
 *
 * @param casNumber - CAS number (e.g. '71-43-2')
 */
export function lookupCAS(casNumber: string): { found: boolean; entry?: CASEntry; valid: boolean } {
    const valid = validateCAS(casNumber);
    if (!valid) {
        log.warn('Invalid CAS number', casNumber);
        return { found: false, valid: false };
    }
    const entry = _indexByCAS.get(casNumber.trim());
    if (entry) {
        log.debug('CAS lookup hit', casNumber, entry.name);
        return { found: true, entry, valid: true };
    }
    log.debug('CAS lookup miss', casNumber);
    return { found: false, valid: true };
}

// ----------------------------------------------------------------
// SEARCH - Fuzzy search by chemical name
// Busca aproximada por nome da substancia
// ----------------------------------------------------------------

/**
 * Search for chemicals by name (case-insensitive substring match).
 * Busca substancias por nome (substring, case-insensitive).
 *
 * @param query - Search query
 * @returns Matching entries (max 20)
 */
export function searchByName(query: string): CASEntry[] {
    if (typeof query !== 'string' || query.trim().length === 0) return [];
    const q = query.trim().toLowerCase();
    const results = [];
    for (const entry of DATABASE) {
        if (entry.name.toLowerCase().includes(q)) {
            results.push(entry);
            if (results.length >= 20) break;
        }
    }
    log.debug('Name search', query, `${results.length} results`);
    return results;
}

// ----------------------------------------------------------------
// TOP ENVIRONMENTAL - List of monitored chemicals
// Lista das substancias mais monitoradas ambientalmente
// ----------------------------------------------------------------

/**
 * Return the full list of top environmental monitoring chemicals.
 * Retorna a lista completa de substancias de monitoramento ambiental.
 *
 * @returns All embedded chemicals (50+)
 */
export function getTopEnvironmental(): CASEntry[] {
    return [...DATABASE];
}

/**
 * Get all unique chemical families in the database.
 * Retorna todas as familias quimicas unicas no banco.
 *
 * @returns Sorted family names
 */
export function getFamilies(): string[] {
    const families = new Set(DATABASE.map((e) => e.family));
    return [...families].sort();
}

/**
 * Filter chemicals by family.
 * Filtra substancias por familia quimica.
 *
 * @param family - Family name (e.g. 'BTEX', 'Heavy Metal')
 * @returns Matching entries
 */
export function filterByFamily(family: string): CASEntry[] {
    if (typeof family !== 'string') return [];
    return DATABASE.filter((e) => e.family === family);
}

// ----------------------------------------------------------------
// EXTENDED API - Multilingual lookup, formula search, autoAssociate
// API estendida com suporte a PT/ES, formula e associacao automatica
// ----------------------------------------------------------------

interface LookupResult {
    /** Whether a record was found */
    found: boolean;
    /** Whether the CAS format/checksum is valid */
    valid: boolean;
    /** Matched record */
    entry: import('./casDataset.js').SubstanceRecord | undefined;
}

interface AutoAssociateResult {
    /** CAS number, or null when unresolved */
    cas: string | null;
    /** Score 0..1 (>=0.9 means high confidence) */
    confidence: number;
    /** Matched record */
    entry: import('./casDataset.js').SubstanceRecord | null;
}

// Build multilingual indices over SUBSTANCE_DATASET once
const _datasetByCas = new Map();
const _datasetByFormula = new Map(); // formula (upper) -> first record

for (const rec of SUBSTANCE_DATASET) {
    _datasetByCas.set(rec.cas, rec);
    const fKey = rec.formula.toUpperCase();
    if (!_datasetByFormula.has(fKey)) {
        _datasetByFormula.set(fKey, rec);
    }
}

/**
 * Validate a CAS Registry Number format and checksum.
 * Alias de validateCAS para compatibilidade com a spec.
 * Valida formato e checksum de um numero CAS.
 *
 * @param casNumber - CAS number (e.g. '71-43-2')
 * @returns True if format and checksum are valid
 */
export function validateCasNumber(casNumber: string): boolean {
    return validateCAS(casNumber);
}

/**
 * Look up a substance from the extended multilingual dataset by CAS number.
 * Busca substancia no dataset multilinguee pelo numero CAS.
 *
 * @param cas - CAS number (e.g. '71-43-2')
 * @param dataset? - Override dataset (optional)
 */
export function lookupByCas(
    cas: string,
    dataset?: import('./casDataset.js').SubstanceRecord[],
): LookupResult {
    const valid = validateCAS(cas);
    if (!valid) return { found: false, valid: false, entry: undefined };
    const src = dataset || SUBSTANCE_DATASET;
    const trimmed = (typeof cas === 'string' ? cas : '').trim();
    const entry = src.find((r) => r.cas === trimmed);
    return entry ? { found: true, valid: true, entry } : { found: false, valid: true, entry: undefined };
}

/**
 * Look up substances by name supporting exact match, substring, and
 * Portuguese/Spanish name matching.
 * Busca substancias por nome com suporte a PT/ES e busca fuzzy (substring).
 *
 * @param name - Name to search for
 * @param dataset? - Override dataset
 * @param options
 * @returns Matching records (max 20)
 */
export function lookupByName(
    name: string,
    dataset?: import('./casDataset.js').SubstanceRecord[],
    options: { fuzzy?: boolean; lang?: 'en' | 'pt' | 'es' } = {},
): import('./casDataset.js').SubstanceRecord[] {
    if (typeof name !== 'string' || name.trim().length === 0) return [];
    const q = name.trim().toLowerCase();
    const src = dataset || SUBSTANCE_DATASET;
    const fuzzy = options.fuzzy !== false; // default: fuzzy enabled
    const lang = options.lang; // 'en' | 'pt' | 'es' | undefined (all)
    const results = [];

    for (const rec of src) {
        if (results.length >= 20) break;

        // Collect candidate strings based on requested language(s)
        const candidates: string[] = [];
        if (!lang || lang === 'en') candidates.push(rec.names.en.toLowerCase());
        if (!lang || lang === 'pt') candidates.push(rec.names.pt.toLowerCase());
        if (!lang || lang === 'es') candidates.push(rec.names.es.toLowerCase());
        // Always include synonyms in search
        for (const syn of rec.synonyms) candidates.push(syn.toLowerCase());

        const matched = fuzzy ? candidates.some((c) => c.includes(q)) : candidates.some((c) => c === q);

        if (matched) results.push(rec);
    }

    log.debug('lookupByName', name, `${results.length} results`);
    return results;
}

/**
 * Look up substances by molecular formula (exact match, case-insensitive).
 * Busca substancias pela formula molecular.
 *
 * @param formula - Molecular formula (e.g. 'C6H6', 'Pb')
 * @param dataset? - Override dataset
 * @returns Matching records
 */
export function lookupByFormula(
    formula: string,
    dataset?: import('./casDataset.js').SubstanceRecord[],
): import('./casDataset.js').SubstanceRecord[] {
    if (typeof formula !== 'string' || formula.trim().length === 0) return [];
    const q = formula.trim().toUpperCase();
    const src = dataset || SUBSTANCE_DATASET;
    const results = src.filter((r) => r.formula.toUpperCase() === q);
    log.debug('lookupByFormula', formula, `${results.length} results`);
    return results;
}

/**
 * Attempt to automatically associate a CAS number to a name or formula.
 * Returns a confidence score:
 *   1.0 = exact name match (EN, PT, or ES)
 *   0.95 = exact synonym match
 *   0.80 = single formula match
 *   0.60 = single fuzzy name match
 *   0.0 = no match found
 *
 * Tenta associar automaticamente um numero CAS a partir de nome/formula.
 *
 * @param name - Substance name or partial name
 * @param dataset? - Override dataset
 */
export function autoAssociate(
    name: string,
    dataset?: import('./casDataset.js').SubstanceRecord[],
): AutoAssociateResult {
    if (typeof name !== 'string' || name.trim().length === 0) {
        return { cas: null, confidence: 0, entry: null };
    }
    const q = name.trim().toLowerCase();
    const src = dataset || SUBSTANCE_DATASET;

    // 1. Exact name match (any language)
    for (const rec of src) {
        if (rec.names.en.toLowerCase() === q || rec.names.pt.toLowerCase() === q || rec.names.es.toLowerCase() === q) {
            log.debug('autoAssociate exact name', name, rec.cas);
            return { cas: rec.cas, confidence: 1.0, entry: rec };
        }
    }

    // 2. Exact synonym match
    for (const rec of src) {
        if (rec.synonyms.some((s) => s.toLowerCase() === q)) {
            log.debug('autoAssociate synonym', name, rec.cas);
            return { cas: rec.cas, confidence: 0.95, entry: rec };
        }
    }

    // 3. Formula exact match - only if exactly one record matches
    const formulaHits = lookupByFormula(name, src);
    if (formulaHits.length === 1) {
        log.debug('autoAssociate formula', name, formulaHits[0]!.cas);
        return { cas: formulaHits[0]!.cas, confidence: 0.8, entry: formulaHits[0]! };
    }

    // 4. Fuzzy name match - only if exactly one record matches
    const fuzzyHits = lookupByName(name, src, { fuzzy: true });
    if (fuzzyHits.length === 1) {
        log.debug('autoAssociate fuzzy single', name, fuzzyHits[0]!.cas);
        return { cas: fuzzyHits[0]!.cas, confidence: 0.6, entry: fuzzyHits[0]! };
    }

    log.debug('autoAssociate no match', name);
    return { cas: null, confidence: 0, entry: null };
}
