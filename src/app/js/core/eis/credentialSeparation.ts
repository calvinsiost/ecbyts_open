// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

interface Author {
    name?: string;
    credential?: string | null;
    registration?: string | null;
    valid?: boolean;
    primary?: boolean;
    role?: string;
    academic_title?: string;
    state?: string | null;
}

interface Observation {
    iso17025_accredited_lab?: boolean;
}

interface GateResult {
    allowed: boolean;
    missingCredentials: string[];
    validSigners: Author[];
    reason?: string;
}

/* ================================================================
   EIS CREDENTIAL SEPARATION — SPEC_EIS_CREDENTIAL_SEPARATION

   Remove credential multiplier do score EIS e realoca em:
   1. Provenance metadata (separado do cálculo)
   2. Regulatory gate (binário: pode emitir ART/CREA/CRQ ou não)
   3. Reputation badge (UI-only, marketplace)

   Novo T axis: 6 variáveis técnicas (ISO 17025/chain-of-custody),
   independentes de quem assinou.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// T-axis new contract - 6 variáveis técnicas (§Q2)
// ──────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Author
 * @property {string} [name]
 * @property {string|null} [credential]
 * @property {string|null} [registration]
 * @property {boolean} [valid]
 * @property {boolean} [primary]
 * @property {string} [role]
 * @property {string} [academic_title]
 * @property {string|null} [state]
 *
 * @typedef {Object} Observation
 * @property {boolean} [iso17025_accredited_lab]
 *
 * @typedef {Object} GateResult
 * @property {boolean} allowed
 * @property {string[]} missingCredentials
 * @property {Author[]} validSigners
 * @property {string} [reason]
 *
 * @typedef {Object} TransparencyResult
 * @property {number} score
 * @property {string[]} present
 * @property {string[]} missing
 * @property {number} completeness
 *
 * @typedef {Object} ProvenanceParams
 * @property {Author[]} [authors]
 * @property {Observation[]} [observations]
 *
 * @typedef {Object} ProvenanceResult
 * @property {Author|null} primaryAuthor
 * @property {Author[]} coAuthors
 * @property {number} totalObservations
 * @property {number} accreditedLabCount
 * @property {number} accreditedLabRate
 *
 * @typedef {Object} BadgeInfo
 * @property {string} label
 * @property {number} tier
 * @property {string} color
 */

/** @type {readonly string[]} */
export const T_AXIS_VARIABLES = Object.freeze([
    'sampling_method_documented',
    'chain_of_custody_traceable',
    'iso17025_accredited_lab',
    'field_blank_and_duplicate',
    'calibrated_equipment',
    'submetric_gps',
]);

// Pesos iguais por default (pode ser customizado via opts)
/** @type {Readonly<Record<string, number>>} */
const DEFAULT_T_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
    sampling_method_documented: 1,
    chain_of_custody_traceable: 1,
    iso17025_accredited_lab: 1.5, // levemente maior — lab acreditado é crítico
    field_blank_and_duplicate: 1,
    calibrated_equipment: 1,
    submetric_gps: 0.5, // nem sempre obrigatório
});

interface TransparencyResult {
    score: number;
    present: string[];
    missing: string[];
    completeness: number;
}

/**
 * Avalia T axis para uma observação usando as 6 variáveis técnicas.
 * @param {Record<string, unknown>|null|undefined} observation
 * @param {{ weights?: Record<string, number> }} [opts]
 * @returns {TransparencyResult}
 */
export function evaluateTransparencyAxis(
    observation: Record<string, unknown> | null | undefined,
    opts: { weights?: Record<string, number> } = {},
): TransparencyResult {
    const weights = opts.weights || DEFAULT_T_WEIGHTS;
    const present: string[] = [];
    const missing: string[] = [];

    if (!observation || typeof observation !== 'object') {
        return { score: 0, present: [], missing: T_AXIS_VARIABLES.slice(), completeness: 0 };
    }

    let weightedPresent = 0;
    let totalWeight = 0;
    for (const variable of T_AXIS_VARIABLES) {
        const w = Number(weights[variable]) || 0;
        totalWeight += w;
        if (observation[variable] === true) {
            present.push(variable);
            weightedPresent += w;
        } else {
            missing.push(variable);
        }
    }

    const completeness = totalWeight > 0 ? weightedPresent / totalWeight : 0;
    // Score escalado 0..5 para compatibilidade com outros eixos EIS
    const score = completeness * 5;
    return { score, present, missing, completeness };
}

// ──────────────────────────────────────────────────────────────────────
// Regulatory gate — REMOVIDO (ATTEST-001#remover-gates-regulatorios-mortos)
//
// O gate canônico vivo é REGULATED_ACTS em
// core/attestation/_credentialGatePure.ts (match: 'all'|'any' por ato),
// ligado ao addStamp. O bloco checkRegulatoryGate + REPORT_CREDENTIAL_REQUIREMENTS
// que vivia aqui era um gate rival "any" morto (zero chamadores de produção).
// Ver: docs/specs/features/SPEC_ATTESTATION_MODEL.md
// ──────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────
// Provenance metadata (§3 provenance layer)
// ──────────────────────────────────────────────────────────────────────

interface ProvenanceParams {
    authors?: Author[];
    observations?: Observation[];
}

interface ProvenanceResult {
    primaryAuthor: Author | null;
    coAuthors: Author[];
    totalObservations: number;
    accreditedLabCount: number;
    accreditedLabRate: number;
}

/**
 * Extrai metadata de proveniência de um conjunto de observações/autores.
 * @param {ProvenanceParams|null|undefined} [params]
 * @returns {ProvenanceResult}
 */
export function extractProvenanceMetadata(params: ProvenanceParams | null | undefined = {}): ProvenanceResult {
    const authors = Array.isArray(params?.authors) ? params.authors : [];
    const observations = Array.isArray(params?.observations) ? params.observations : [];

    const primaryAuthor = authors.find((a) => a?.primary === true) || authors[0] || null;
    const coAuthors = authors.filter((a) => a !== primaryAuthor);

    let accreditedLabCount = 0;
    for (const obs of observations) {
        if (obs?.iso17025_accredited_lab === true) accreditedLabCount++;
    }
    const accreditedLabRate = observations.length > 0 ? accreditedLabCount / observations.length : 0;

    return {
        primaryAuthor,
        coAuthors,
        totalObservations: observations.length,
        accreditedLabCount,
        accreditedLabRate,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Reputation badge (§Q4 UI only - nunca entra no score)
// ──────────────────────────────────────────────────────────────────────

interface BadgeInfo {
    label: string;
    tier: number;
    color: string;
}

/** @type {Readonly<Record<string, BadgeInfo>>} */
export const CREDENTIAL_BADGES: Readonly<Record<string, BadgeInfo>> = Object.freeze({
    doutor: { label: 'Doutor', tier: 5, color: '#9333ea' },
    mestre: { label: 'Mestre', tier: 4, color: '#2563eb' },
    pos_graduado: { label: 'Pós-Graduado', tier: 3, color: '#0891b2' },
    professional: { label: 'Profissional', tier: 2, color: '#059669' },
    common: { label: 'Comum', tier: 1, color: '#6b7280' },
});

/**
 * Classifica credencial para badge de marketplace (UI).
 * NUNCA usado no cálculo EIS.
 * @param {string|null|undefined} credential
 * @returns {BadgeInfo|null}
 */
export function classifyCredentialBadge(credential: string | null | undefined): BadgeInfo | null {
    if (!credential || typeof credential !== 'string') return null;
    const key = credential.toLowerCase();
    return CREDENTIAL_BADGES[key] || CREDENTIAL_BADGES.common || null;
}

/**
 * Retorna string para provenance line no PDF (§Q4 provenance in report).
 * @param {Author|null|undefined} author
 * @returns {string|null}
 */
export function formatProvenanceLine(author: Author | null | undefined): string | null {
    if (!author || typeof author !== 'object') return null;
    const parts: string[] = [];
    if (author.role) parts.push(author.role);
    if (author.academic_title) parts.push(author.academic_title);
    if (author.credential && author.registration) {
        const state = author.state ? `-${author.state}` : '';
        parts.push(`${author.credential}${state} ${author.registration}`);
    }
    if (parts.length === 0) return null;
    const name = author.name || '';
    return name ? `${name} — ${parts.join(', ')}` : parts.join(', ');
}
