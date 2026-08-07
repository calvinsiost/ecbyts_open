// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

interface HazardEntry {
    id?: string;
    agent?: string;
    probability?: number;
    severity?: number;
    controls?: string[];
}

interface ExposureEntry {
    concentration?: number;
    durationHours?: number;
}

/* ================================================================
   OHS RISK MATRIX — SPEC_RECONCILIATION_005_OHS §Mudança 2

   Pure helpers para Occupational Health & Safety:
   - Risk matrix 5×5 (probability × severity) §Q5.4
   - Control hierarchy (elimination > substitution > eng > adm > PPE)
   - TWA 8h weighted exposure calculator §Q5.3
   - Hazard inventory validators
   - RBAC roles (admin/engineer/medical_professional) §Q5.5

   Export PGR + SST XML fica em io/formats/.
   ================================================================ */


// ──────────────────────────────────────────────────────────────────────
// Constants §Q5.4
// ──────────────────────────────────────────────────────────────────────

export const PROBABILITY_LEVELS = Object.freeze([
    Object.freeze({ id: 1, label: 'Rara', description: 'pode ocorrer uma vez por década' }),
    Object.freeze({ id: 2, label: 'Improvável', description: 'pode ocorrer anualmente' }),
    Object.freeze({ id: 3, label: 'Possível', description: 'pode ocorrer mensalmente' }),
    Object.freeze({ id: 4, label: 'Provável', description: 'pode ocorrer semanalmente' }),
    Object.freeze({ id: 5, label: 'Quase certa', description: 'ocorre diariamente' }),
]);

export const SEVERITY_LEVELS = Object.freeze([
    Object.freeze({ id: 1, label: 'Desprezível', description: 'primeiros socorros' }),
    Object.freeze({ id: 2, label: 'Menor', description: 'afastamento < 1 dia' }),
    Object.freeze({ id: 3, label: 'Moderada', description: 'afastamento ≥ 1 dia' }),
    Object.freeze({ id: 4, label: 'Grave', description: 'lesão permanente' }),
    Object.freeze({ id: 5, label: 'Catastrófica', description: 'óbito ou múltiplas vítimas' }),
]);

// Classificação do score (prob × sev):
// 1-4: baixo, 5-9: moderado, 10-14: alto, 15-25: crítico
export const RISK_CLASS_THRESHOLDS = Object.freeze({
    LOW_MAX: 4,
    MODERATE_MAX: 9,
    HIGH_MAX: 14,
    // >14 = crítico
});

// Hierarquia de controles §STOP (elimination first)
export const CONTROL_HIERARCHY = Object.freeze(['elimination', 'substitution', 'engineering', 'administrative', 'ppe']);

// RBAC roles §Q5.5
export const OHS_ROLES = Object.freeze(['admin', 'engineer', 'medical_professional']);

// ──────────────────────────────────────────────────────────────────────
// Risk scoring
// ──────────────────────────────────────────────────────────────────────

/**
 * @param probability - 1..5
 * @param severity - 1..5
 * @returns score 1..25, 0 se inválido
 */
export function riskScore(probability: number, severity: number): number {
    const p = Number(probability);
    const s = Number(severity);
    if (!Number.isInteger(p) || p < 1 || p > 5) return 0;
    if (!Number.isInteger(s) || s < 1 || s > 5) return 0;
    return p * s;
}

/**
 * @param score
 */
export function classifyRisk(score: number): 'low' | 'moderate' | 'high' | 'critical' | 'invalid' {
    const n = Number(score);
    if (!Number.isFinite(n) || n < 1) return 'invalid';
    if (n <= RISK_CLASS_THRESHOLDS.LOW_MAX) return 'low';
    if (n <= RISK_CLASS_THRESHOLDS.MODERATE_MAX) return 'moderate';
    if (n <= RISK_CLASS_THRESHOLDS.HIGH_MAX) return 'high';
    return 'critical';
}

/**
 * @param hazards
 */
export function summarizeRiskInventory(hazards: HazardEntry[]): {
    low: number;
    moderate: number;
    high: number;
    critical: number;
    total: number;
} {
    const out: { low: number; moderate: number; high: number; critical: number; total: number } = {
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
        total: 0,
    };
    if (!Array.isArray(hazards)) return out;
    for (const h of hazards) {
        if (!h) continue;
        const score = riskScore(Number(h.probability), Number(h.severity));
        const cls = classifyRisk(score);
        if (cls === 'invalid') continue;
        out[cls]++;
        out.total++;
    }
    return out;
}

// ──────────────────────────────────────────────────────────────────────
// Control hierarchy §STOP
// ──────────────────────────────────────────────────────────────────────

/**
 * @param controlType
 */
export function isValidControlType(controlType: string): boolean {
    return CONTROL_HIERARCHY.includes(controlType);
}

/**
 * Retorna índice de hierarquia (0=elimination, melhor; 4=ppe, pior).
 * @param controlType
 * @returns -1 se inválido
 */
export function controlRank(controlType: string): number {
    return CONTROL_HIERARCHY.indexOf(controlType);
}

/**
 * Recomenda tipo de controle baseado na classe de risco.
 * Crítico → elimination; alto → substitution/engineering; moderado → admin; baixo → PPE.
 *
 * @param riskClass - low/moderate/high/critical
 * @returns controles recomendados (ordenados por prioridade)
 */
export function recommendControls(riskClass: string): string[] {
    switch (riskClass) {
        case 'critical':
            return ['elimination', 'substitution'];
        case 'high':
            return ['substitution', 'engineering'];
        case 'moderate':
            return ['engineering', 'administrative'];
        case 'low':
            return ['administrative', 'ppe'];
        default:
            return [];
    }
}

// ──────────────────────────────────────────────────────────────────────
// TWA - Time-Weighted Average §Q5.3
// ──────────────────────────────────────────────────────────────────────

export const TWA_DEFAULT_WORKDAY_HOURS = 8;

/**
 * Calcula TWA ponderado por duração.
 * @param exposures
 * @param workdayHours
 */
export function computeTWA(
    exposures: ExposureEntry[],
    workdayHours: number = TWA_DEFAULT_WORKDAY_HOURS,
): { twa: number; totalHours: number; ok: boolean } {
    if (!Array.isArray(exposures) || exposures.length === 0) {
        return { twa: 0, totalHours: 0, ok: false };
    }
    const wd = Number(workdayHours) || TWA_DEFAULT_WORKDAY_HOURS;
    let num = 0;
    let totalHours = 0;
    for (const e of exposures) {
        if (!e) continue;
        const c = Number(e.concentration);
        const h = Number(e.durationHours);
        if (!Number.isFinite(c) || !Number.isFinite(h) || h < 0) continue;
        num += c * h;
        totalHours += h;
    }
    if (totalHours === 0) return { twa: 0, totalHours: 0, ok: false };
    return {
        twa: num / wd,
        totalHours,
        ok: true,
    };
}

/**
 * @param twa
 * @param limit
 */
export function classifyTWACompliance(
    twa: number,
    limit: number,
): { exceedsLimit: boolean; ratio: number; classification: string } {
    const t = Number(twa);
    const l = Number(limit);
    if (!Number.isFinite(t) || !Number.isFinite(l) || l <= 0) {
        return { exceedsLimit: false, ratio: 0, classification: 'unknown' };
    }
    const ratio = t / l;
    let classification = 'compliant';
    if (ratio > 1) classification = 'exceeds_limit';
    else if (ratio > 0.5) classification = 'action_level'; // NIOSH action level
    return { exceedsLimit: ratio > 1, ratio, classification };
}

// ──────────────────────────────────────────────────────────────────────
// RBAC §Q5.5
// ──────────────────────────────────────────────────────────────────────

/**
 * @param role
 */
export function isValidOHSRole(role: string): boolean {
    return OHS_ROLES.includes(role);
}

/**
 * @param role
 * @param fieldPrivacy - 'public' | 'engineer_only' | 'medical_only'
 */
export function canAccessField(role: string, fieldPrivacy: string): boolean {
    if (!isValidOHSRole(role)) return false;
    if (fieldPrivacy === 'public') return true;
    if (fieldPrivacy === 'engineer_only') return role === 'admin' || role === 'engineer';
    if (fieldPrivacy === 'medical_only') return role === 'admin' || role === 'medical_professional';
    return false;
}

// ──────────────────────────────────────────────────────────────────────
// Hazard validators
// ──────────────────────────────────────────────────────────────────────

/**
 * @param hazard
 */
export function validateHazard(hazard: HazardEntry | null | undefined): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!hazard || typeof hazard !== 'object') {
        return { valid: false, errors: ['not object'] };
    }
    if (!hazard.id) errors.push('id required');
    if (!hazard.agent) errors.push('agent required');
    const probability = hazard.probability;
    if (!Number.isInteger(probability) || (probability as number) < 1 || (probability as number) > 5) {
        errors.push('probability must be integer 1..5');
    }
    const severity = hazard.severity;
    if (!Number.isInteger(severity) || (severity as number) < 1 || (severity as number) > 5) {
        errors.push('severity must be integer 1..5');
    }
    if (hazard.controls && !Array.isArray(hazard.controls)) {
        errors.push('controls must be array');
    }
    if (Array.isArray(hazard.controls)) {
        for (const c of hazard.controls) {
            if (!isValidControlType(c)) {
                errors.push(`invalid control: ${c}`);
            }
        }
    }
    return { valid: errors.length === 0, errors };
}
