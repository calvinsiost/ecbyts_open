// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   Q2Q WIZARD — SPEC_UNC_STRUCTURAL_001_ANNEX_A_WIZARD_Q2Q

   Pure helpers para wizard de classificação qualitativa de incerteza:
   - 5 Q2Q levels (very_low → very_high)
   - 6 Eurachem 2019 source categories (installation/sampling/analytical/...)
   - Tela 0 validity gate (holding time, compromised sample)
   - Tela 0.5 censored data detection
   - Path tracking (wizard:0.1→1.1→2A.1)
   - Defaults u_rel por Q2Q level

   Combinação de incertezas fica em propagation.js (não agrega aqui).
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants §Níveis Q2Q
// ──────────────────────────────────────────────────────────────────────

export const Q2Q_LEVELS = Object.freeze(['very_low', 'low', 'medium', 'high', 'very_high']);

export const Q2Q_LABELS = Object.freeze({
    very_low: { pt: 'Muito baixa', en: 'Very low' },
    low: { pt: 'Baixa', en: 'Low' },
    medium: { pt: 'Moderada', en: 'Moderate' },
    high: { pt: 'Alta', en: 'High' },
    very_high: { pt: 'Muito alta', en: 'Very high' },
});

// 6 categorias Eurachem/CITAC 2019 §3.2
export const SOURCE_CATEGORIES = Object.freeze([
    'installation', // poço, selo anular, piezômetro
    'sampling', // coleta manual, preservação, COC
    'analytical', // lab + instrumento
    'qualitative', // mapeamento Q2Q textual
    'modeled', // kriging, interpolação, fate & transport
    'inherited', // legacy pré-SPEC
]);

// Default u_rel por Q2Q level (configurável por workspace) §Defaults
export const DEFAULT_U_REL = Object.freeze({
    very_low: 0.05,
    low: 0.1,
    medium: 0.2,
    high: 0.35,
    very_high: 0.6,
});

// QC flags que invalidam dados §Tela 0
export const QC_FLAGS = Object.freeze(['invalid_holding_time', 'compromised_sample']);

// Tipos de censored §Tela 0.5
export const CENSORED_TYPES = Object.freeze(['LD', 'LQ']);

// Origens de dado §Tela 1
export const DATA_ORIGINS = Object.freeze([
    'lab_accredited',
    'lab_not_accredited',
    'field_measurement',
    'estimation_secondary',
    'sensor_continuous',
    'sampling_infrastructure',
    'manual_soil_sample',
    'chemical_agents',
    'occupational_noise',
]);

// Wizard gate outcome
export const GATE_OUTCOMES = Object.freeze(['pass', 'invalid_holding_time', 'compromised_sample']);

// ──────────────────────────────────────────────────────────────────────
// Tela 0 - Validity gate §CETESB DD-007 + EPA SW-846
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {{ holdingTimeOk?: boolean, coldChainOk?: boolean, custodyChainOk?: boolean, preservationOk?: boolean, compromised?: boolean }} input
 * @returns {{ outcome: string, q2q?: string, qc_flag?: string, rejected: boolean }}
 */
export function evaluateValidityGate(input: {
    holdingTimeOk?: boolean;
    coldChainOk?: boolean;
    custodyChainOk?: boolean;
    preservationOk?: boolean;
    compromised?: boolean;
}): { outcome: string; q2q?: string; qc_flag?: string; rejected: boolean } {
    if (!input || typeof input !== 'object') {
        return { outcome: 'pass', rejected: false };
    }

    if (input.holdingTimeOk === false) {
        return {
            outcome: 'invalid_holding_time',
            q2q: 'very_high',
            qc_flag: 'invalid_holding_time',
            rejected: false,
        };
    }

    if (input.custodyChainOk === false || input.preservationOk === false || input.compromised === true) {
        return {
            outcome: 'compromised_sample',
            qc_flag: 'compromised_sample',
            rejected: true, // não entra em cálculos §Tela 0 item 3
        };
    }

    return { outcome: 'pass', rejected: false };
}

// ──────────────────────────────────────────────────────────────────────
// Tela 0.5 - Censored data
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {{ is_censored?: boolean, limit_type?: string, limit_value?: number }} censored
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCensoredInput(censored: {
    is_censored?: boolean;
    limit_type?: string;
    limit_value?: number;
}): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!censored || typeof censored !== 'object') {
        return { valid: false, errors: ['not object'] };
    }
    if (typeof censored.is_censored !== 'boolean') errors.push('is_censored boolean required');
    if (censored.is_censored === true) {
        if (!CENSORED_TYPES.includes(censored.limit_type as string)) {
            errors.push(`limit_type must be one of: ${CENSORED_TYPES.join(', ')}`);
        }
        if (!Number.isFinite(censored.limit_value) || (censored.limit_value as number) <= 0) {
            errors.push('limit_value must be positive number');
        }
    }
    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// Origin → Q2Q mapping (Tela 1 → Tela 2x)
// ──────────────────────────────────────────────────────────────────────

// Baseline Q2Q por origem (pode ser refinado por sub-perguntas Tela 2x)
const ORIGIN_BASELINE_Q2Q = Object.freeze({
    lab_accredited: 'very_low',
    lab_not_accredited: 'medium',
    field_measurement: 'medium',
    estimation_secondary: 'very_high',
    sensor_continuous: 'low',
    sampling_infrastructure: 'medium',
    manual_soil_sample: 'medium',
    chemical_agents: 'medium',
    occupational_noise: 'low',
});

/**
 * @param {string} origin
 * @returns {string} Q2Q level baseline
 */
export function baselineQ2QForOrigin(origin: string): string {
    return (ORIGIN_BASELINE_Q2Q as Record<string, string>)[origin] || 'medium';
}

/**
 * Ajusta Q2Q baseado em respostas de sub-tela.
 *
 * @param {string} baseline - Q2Q vindo de baselineQ2QForOrigin
 * @param {{ hasReplicas?: boolean, hasQCCertificates?: boolean, hasCalibration?: boolean, holdingTimeExceeded?: boolean }} [answers]
 * @returns {string} Q2Q final
 */
export function refineQ2QWithAnswers(
    baseline: string,
    answers: {
        hasReplicas?: boolean;
        hasQCCertificates?: boolean;
        hasCalibration?: boolean;
        holdingTimeExceeded?: boolean;
    } = {},
): string {
    if (!Q2Q_LEVELS.includes(baseline)) return 'medium';
    let idx = Q2Q_LEVELS.indexOf(baseline);

    // Sub-answers melhoram (diminuem idx) ou pioram (aumentam)
    if (answers.hasReplicas === true) idx = Math.max(0, idx - 1);
    if (answers.hasQCCertificates === true) idx = Math.max(0, idx - 1);
    if (answers.hasCalibration === false) idx = Math.min(Q2Q_LEVELS.length - 1, idx + 1);
    if (answers.holdingTimeExceeded === true) return 'very_high';

    return Q2Q_LEVELS[idx] as string;
}

// ──────────────────────────────────────────────────────────────────────
// Path tracking §Princípio 6
// ──────────────────────────────────────────────────────────────────────

/**
 * Gera string codificada para provenance.note.
 * @param {Array<string>} steps - ['0.1', '0.5.2', '1.1', '2A.1']
 * @returns {string}
 */
export function encodeWizardPath(steps: string[]): string {
    if (!Array.isArray(steps) || steps.length === 0) return '';
    return `wizard:${steps.join('→')}`;
}

/**
 * Decodifica path.
 * @param {string} encoded
 * @returns {Array<string>}
 */
export function decodeWizardPath(encoded: string): string[] {
    if (typeof encoded !== 'string' || !encoded.startsWith('wizard:')) return [];
    return encoded.slice(7).split('→').filter(Boolean);
}

// ──────────────────────────────────────────────────────────────────────
// Run wizard (end-to-end from answers to Q2Q + sources)
// ──────────────────────────────────────────────────────────────────────

/**
 * Consolida respostas do wizard em Q2Q + sources + provenance.
 *
 * @param {Record<string, any>} answers - { validity, censored, origin, subAnswers, path }
 * @returns {{ q2q: string|null, rejected: boolean, qc_flag: string|null, sources: Array<string>, note: string }}
 */
export function runWizard(answers: Record<string, any>): {
    q2q: string | null;
    rejected: boolean;
    qc_flag: string | null;
    sources: string[];
    note: string;
} {
    if (!answers || typeof answers !== 'object') {
        return { q2q: null, rejected: false, qc_flag: null, sources: ['inherited'], note: '' };
    }

    // Gate
    const gate = evaluateValidityGate(answers.validity || {});
    if (gate.rejected) {
        return {
            q2q: null,
            rejected: true,
            qc_flag: gate.qc_flag || null,
            sources: [],
            note: encodeWizardPath(answers.path || ['0.3']),
        };
    }
    if (gate.q2q) {
        return {
            q2q: gate.q2q,
            rejected: false,
            qc_flag: gate.qc_flag || null,
            sources: inferSourcesForOrigin(answers.origin),
            note: encodeWizardPath(answers.path || ['0.2']),
        };
    }

    // Origin → Baseline → Refine
    const origin = answers.origin;
    if (!DATA_ORIGINS.includes(origin)) {
        return { q2q: 'medium', rejected: false, qc_flag: null, sources: ['inherited'], note: '' };
    }
    const baseline = baselineQ2QForOrigin(origin);
    const final = refineQ2QWithAnswers(baseline, answers.subAnswers || {});
    return {
        q2q: final,
        rejected: false,
        qc_flag: null,
        sources: inferSourcesForOrigin(origin),
        note: encodeWizardPath(answers.path || []),
    };
}

/**
 * Mapeia origem → lista de source categories.
 * @param {string} origin
 * @returns {Array<string>}
 */
export function inferSourcesForOrigin(origin: string): string[] {
    const map: Record<string, string[]> = {
        lab_accredited: ['analytical'],
        lab_not_accredited: ['analytical'],
        field_measurement: ['sampling', 'analytical'],
        estimation_secondary: ['modeled'],
        sensor_continuous: ['analytical'],
        sampling_infrastructure: ['installation', 'sampling'],
        manual_soil_sample: ['sampling'],
        chemical_agents: ['sampling', 'analytical'],
        occupational_noise: ['analytical'],
    };
    return map[origin] || ['qualitative'];
}

// ──────────────────────────────────────────────────────────────────────
// Defaults u_rel lookup
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {string} q2qLevel
 * @param {Record<string, number>} [workspaceOverrides?]
 * @returns {number}
 */
export function uRelForQ2Q(q2qLevel: string, workspaceOverrides?: Record<string, number>): number {
    const overrides = workspaceOverrides && typeof workspaceOverrides === 'object' ? workspaceOverrides : {};
    if (Number.isFinite(overrides[q2qLevel])) return overrides[q2qLevel] as number;
    return (DEFAULT_U_REL as Record<string, number>)[q2qLevel] ?? DEFAULT_U_REL.medium;
}
