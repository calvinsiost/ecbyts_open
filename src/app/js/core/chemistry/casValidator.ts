// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CAS VALIDATOR - Format validation, checksum, registry lookup,
                   and fuzzy search for CAS Registry Numbers
   Validacao de CAS, checksum, busca e registro das 50 substancias
   mais relevantes para monitoramento ambiental.

   Algoritmo de checksum:
     - Dado o numero CAS XXXXXXX-YY-Z, retire os hifens.
     - Calcule a soma de cada digito (exceto o ultimo) multiplicado
       pela sua posicao da direita, iniciando em 1.
     - O digito verificador Z deve ser igual a soma mod 10.

   Exemplo: 71-43-2
     Digitos sem verificador: 7,1,4,3 (posicoes da direita: 4,3,2,1)
     Soma = 7*4 + 1*3 + 4*2 + 3*1 = 28+3+8+3 = 42
     42 mod 10 = 2 (digito verificador correto)

   Referencia: https://www.cas.org/cas-data/cas-registry
   ================================================================ */

// ----------------------------------------------------------------
// VALIDATION - CAS checksum algorithm
// Validacao do digito verificador CAS
// ----------------------------------------------------------------

export type CASGroup = 'metal' | 'svoc' | 'voc' | 'pesticide' | 'inorganic';

export interface CASRegistryEntry {
    name: string;
    namePt: string;
    group: CASGroup;
}

export interface CASValidationResult {
    valid: boolean;
    error?: string;
}

export interface CASParts {
    registry: string;
    serial: string;
    check: string;
}

export interface CASSearchResult extends CASRegistryEntry {
    cas: string;
}

export interface CASFuzzyResult extends CASSearchResult {
    score: number;
}

/**
 * Validate a CAS number format and checksum.
 * Valida formato e checksum de um numero CAS.
 */
export function validateCasChecksum(cas: unknown): CASValidationResult {
    if (typeof cas !== 'string') {
        return { valid: false, error: 'CAS must be a string' };
    }
    const trimmed = cas.trim();
    if (!/^\d{2,7}-\d{2}-\d$/.test(trimmed)) {
        return { valid: false, error: 'Invalid CAS format (expected XXXXXXX-YY-Z)' };
    }
    const digits = trimmed.replace(/-/g, '');
    const checkDigit = Number.parseInt(digits.charAt(digits.length - 1), 10);
    let sum = 0;
    // Weighted sum: position from right starting at 1 (excluding check digit)
    // Soma ponderada: posicao da direita comecando em 1 (excluindo verificador)
    for (let i = digits.length - 2; i >= 0; i--) {
        const position = digits.length - 1 - i;
        sum += Number.parseInt(digits.charAt(i), 10) * position;
    }
    if (sum % 10 !== checkDigit) {
        return { valid: false, error: 'CAS checksum mismatch' };
    }
    return { valid: true };
}

/**
 * Parse a CAS number string into its structural parts.
 * Analisa um numero CAS nos seus componentes.
 */
export function parseCas(str: unknown): CASParts | null {
    if (typeof str !== 'string') return null;
    const trimmed = str.trim();
    // Accept both dashed (71-43-2) and undashed (71432) forms
    // Aceita forma com e sem hifens
    let normalized = trimmed;
    if (!/^\d{2,7}-\d{2}-\d$/.test(trimmed)) {
        const digits = trimmed.replace(/-/g, '');
        if (!/^\d{4,10}$/.test(digits)) return null;
        if (digits.length < 4) return null;
        const check = digits.slice(-1);
        const serial = digits.slice(-3, -1);
        const registry = digits.slice(0, -3);
        if (!registry) return null;
        normalized = `${registry}-${serial}-${check}`;
    }
    if (!/^\d{2,7}-\d{2}-\d$/.test(normalized)) return null;
    const parts = normalized.split('-');
    const registry = parts[0];
    const serial = parts[1];
    const check = parts[2];
    if (!registry || !serial || !check) return null;
    return { registry, serial, check };
}

/**
 * Normalize a CAS number to canonical format (XXXXXXX-YY-Z).
 * Returns null if the input is invalid or fails checksum.
 * Normaliza para o formato canonico; retorna null se invalido.
 */
export function normalizeCas(str: unknown): string | null {
    const parsed = parseCas(str);
    if (!parsed) return null;
    const canonical = `${parsed.registry}-${parsed.serial}-${parsed.check}`;
    const { valid } = validateCasChecksum(canonical);
    return valid ? canonical : null;
}

// ----------------------------------------------------------------
// EMBEDDED REGISTRY - 50 environmental monitoring compounds
// Registro embutido com 50 compostos de monitoramento ambiental
// Groups: 'metal' | 'svoc' | 'voc' | 'pesticide' | 'inorganic'
// ----------------------------------------------------------------

/**
 * Frozen registry of the top 50 environmental monitoring compounds.
 * Each key is a canonical CAS number string.
 * Registro imutavel com as 50 substancias mais monitoradas.
 */
export const CAS_REGISTRY: Readonly<Record<string, CASRegistryEntry>> = Object.freeze({
    // --- VOCs / Compostos organicos volateis ---
    '71-43-2': { name: 'Benzene', namePt: 'Benzeno', group: 'voc' },
    '108-88-3': { name: 'Toluene', namePt: 'Tolueno', group: 'voc' },
    '100-41-4': { name: 'Ethylbenzene', namePt: 'Etilbenzeno', group: 'voc' },
    '1330-20-7': { name: 'Xylenes (mixed)', namePt: 'Xilenos (mistura)', group: 'voc' },
    '79-01-6': { name: 'Trichloroethylene (TCE)', namePt: 'Tricloroetileno (TCE)', group: 'voc' },
    '127-18-4': { name: 'Tetrachloroethylene (PCE)', namePt: 'Tetracloroetileno (PCE)', group: 'voc' },
    '75-01-4': { name: 'Vinyl Chloride', namePt: 'Cloreto de Vinila', group: 'voc' },
    '156-59-2': { name: 'cis-1,2-Dichloroethylene', namePt: 'cis-1,2-Dicloroetileno', group: 'voc' },
    '156-60-5': { name: 'trans-1,2-Dichloroethylene', namePt: 'trans-1,2-Dicloroetileno', group: 'voc' },
    '75-35-4': { name: '1,1-Dichloroethylene', namePt: '1,1-Dicloroetileno', group: 'voc' },
    '67-66-3': { name: 'Chloroform', namePt: 'Cloroformio', group: 'voc' },
    '56-23-5': { name: 'Carbon Tetrachloride', namePt: 'Tetracloreto de Carbono', group: 'voc' },
    '75-09-2': { name: 'Dichloromethane', namePt: 'Diclorometano', group: 'voc' },
    '1634-04-4': { name: 'MTBE', namePt: 'MTBE', group: 'voc' },

    // --- SVOCs / Compostos organicos semivolateis ---
    '50-32-8': { name: 'Benzo[a]pyrene', namePt: 'Benzo[a]pireno', group: 'svoc' },
    '91-20-3': { name: 'Naphthalene', namePt: 'Naftaleno', group: 'svoc' },
    '120-12-7': { name: 'Anthracene', namePt: 'Antraceno', group: 'svoc' },
    '206-44-0': { name: 'Fluoranthene', namePt: 'Fluoranteno', group: 'svoc' },
    '129-00-0': { name: 'Pyrene', namePt: 'Pireno', group: 'svoc' },
    '85-01-8': { name: 'Phenanthrene', namePt: 'Fenantreno', group: 'svoc' },
    '218-01-9': { name: 'Chrysene', namePt: 'Criseno', group: 'svoc' },
    '108-95-2': { name: 'Phenol', namePt: 'Fenol', group: 'svoc' },
    '98-82-8': { name: 'Isopropylbenzene (Cumene)', namePt: 'Isopropilbenzeno (Cumeno)', group: 'svoc' },
    '100-42-5': { name: 'Styrene', namePt: 'Estireno', group: 'svoc' },
    '11097-69-1': { name: 'Aroclor 1254 (PCB)', namePt: 'Aroclor 1254 (PCB)', group: 'svoc' },
    '1336-36-3': { name: 'PCBs (total)', namePt: 'PCBs (total)', group: 'svoc' },

    // --- Metals / Metais ---
    '7439-92-1': { name: 'Lead', namePt: 'Chumbo', group: 'metal' },
    '7440-38-2': { name: 'Arsenic', namePt: 'Arsenio', group: 'metal' },
    '7439-97-6': { name: 'Mercury', namePt: 'Mercurio', group: 'metal' },
    '7440-43-9': { name: 'Cadmium', namePt: 'Cadmio', group: 'metal' },
    '18540-29-9': { name: 'Chromium (VI)', namePt: 'Cromo (VI)', group: 'metal' },
    '7440-02-0': { name: 'Nickel', namePt: 'Niquel', group: 'metal' },
    '7440-66-6': { name: 'Zinc', namePt: 'Zinco', group: 'metal' },
    '7440-50-8': { name: 'Copper', namePt: 'Cobre', group: 'metal' },
    '7440-62-2': { name: 'Vanadium', namePt: 'Vanadio', group: 'metal' },
    '7440-48-4': { name: 'Cobalt', namePt: 'Cobalto', group: 'metal' },
    '7782-49-2': { name: 'Selenium', namePt: 'Selenio', group: 'metal' },
    '7440-36-0': { name: 'Antimony', namePt: 'Antimonio', group: 'metal' },
    '7440-28-0': { name: 'Thallium', namePt: 'Talio', group: 'metal' },
    '7440-47-3': { name: 'Chromium (total)', namePt: 'Cromo (total)', group: 'metal' },
    '7439-96-5': { name: 'Manganese', namePt: 'Manganes', group: 'metal' },
    '7440-39-3': { name: 'Barium', namePt: 'Bario', group: 'metal' },

    // --- Pesticides / Agrotoxicos ---
    '50-29-3': { name: 'DDT', namePt: 'DDT', group: 'pesticide' },
    '309-00-2': { name: 'Aldrin', namePt: 'Aldrin', group: 'pesticide' },
    '60-57-1': { name: 'Dieldrin', namePt: 'Dieldrin', group: 'pesticide' },
    '72-20-8': { name: 'Endrin', namePt: 'Endrin', group: 'pesticide' },
    '58-89-9': { name: 'Lindane (gamma-HCH)', namePt: 'Lindano (gama-HCH)', group: 'pesticide' },
    '1912-24-9': { name: 'Atrazine', namePt: 'Atrazina', group: 'pesticide' },

    // --- Inorganics / Inorganicos ---
    '7664-41-7': { name: 'Ammonia', namePt: 'Amonia', group: 'inorganic' },
    '7697-37-2': { name: 'Nitric Acid', namePt: 'Acido Nitrico', group: 'inorganic' },
    '143-33-9': { name: 'Sodium Cyanide', namePt: 'Cianeto de Sodio', group: 'inorganic' },
    '7681-49-4': { name: 'Sodium Fluoride', namePt: 'Fluoreto de Sodio', group: 'inorganic' },
});

// ----------------------------------------------------------------
// LOOKUP - Exact CAS lookup in registry
// Busca exata no registro pelo numero CAS
// ----------------------------------------------------------------

/**
 * Look up a compound by exact CAS number in the embedded registry.
 * Returns null on invalid CAS or if not found.
 * Busca exata no registro embutido; null se invalido ou nao encontrado.
 */
export function lookupByCas(cas: unknown): CASRegistryEntry | null {
    const normalized = normalizeCas(cas);
    if (!normalized) return null;
    return CAS_REGISTRY[normalized] ?? null;
}

// ----------------------------------------------------------------
// SEARCH - Case-insensitive substring match on name/namePt
// Busca por nome (EN ou PT) com substring case-insensitive
// ----------------------------------------------------------------

/**
 * Search registry compounds by name (EN or PT), case-insensitive substring.
 * Busca por nome ingles ou portugues (substring, case-insensitive).
 */
export function searchByName(query: unknown): CASSearchResult[] {
    if (typeof query !== 'string' || query.trim().length === 0) return [];
    const q = query.trim().toLowerCase();
    const results: CASSearchResult[] = [];
    for (const [cas, entry] of Object.entries(CAS_REGISTRY)) {
        if (entry.name.toLowerCase().includes(q) || entry.namePt.toLowerCase().includes(q)) {
            results.push({ cas, ...entry });
        }
    }
    return results;
}

// ----------------------------------------------------------------
// FUZZY SEARCH - Trigram-based scoring
// Busca fuzzy usando trigramas
// ----------------------------------------------------------------

/**
 * Compute the set of trigrams for a string.
 * Gera o conjunto de trigramas de uma string.
 */
function _trigrams(str: string): Set<string> {
    const s = str.toLowerCase().replace(/\s+/g, ' ').trim();
    const set = new Set<string>();
    for (let i = 0; i <= s.length - 3; i++) {
        set.add(s.slice(i, i + 3));
    }
    return set;
}

/**
 * Compute trigram similarity score between two strings.
 * Score = |intersection| / |union| (Jaccard on trigrams).
 * Pontuacao = trigramas em comum / trigramas no total.
 */
function _trigramScore(a: string, b: string): number {
    const ta = _trigrams(a);
    const tb = _trigrams(b);
    if (ta.size === 0 || tb.size === 0) return 0;
    let intersection = 0;
    for (const t of ta) {
        if (tb.has(t)) intersection++;
    }
    const union = ta.size + tb.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

/**
 * Fuzzy search using trigram similarity against name and namePt.
 * Returns top N results sorted by score descending.
 * Busca fuzzy com trigramas; retorna top N por score decrescente.
 */
export function fuzzyMatchCas(query: unknown, maxResults = 5): CASFuzzyResult[] {
    if (typeof query !== 'string' || query.trim().length === 0) return [];
    const q = query.trim();
    const scored: CASFuzzyResult[] = [];
    for (const [cas, entry] of Object.entries(CAS_REGISTRY)) {
        const scoreEn = _trigramScore(q, entry.name);
        const scorePt = _trigramScore(q, entry.namePt);
        const score = Math.max(scoreEn, scorePt);
        if (score > 0) {
            scored.push({ cas, score, ...entry });
        }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults);
}
