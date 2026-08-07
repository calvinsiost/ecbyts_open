// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// EIS Completeness Panel View-Model — F3-prep pure-logic
// (SPEC_EIS_COMPLETENESS_BASELINE)
//
// View-model puro consumido pela UI F3 (painel applicability — marcar
// requisitos aplicáveis/NA, ver presença/gaps/criticality). CONSOME
// `computeCompletenessBaseline` (F1) — NÃO recalcula presença,
// applicability ou criticality. Apenas organiza/decora p/ renderização.
//
// Princípios herdados:
// - Sem DOM, sem rede, determinístico.
// - Não-só-cor: badges com ícone+texto distintos por status.
// - NUNCA muta `applicabilityConfig` — operações retornam novo objeto.
// - Audit append-only respeitado: baseline.audit usado read-only.

import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';

/** Status canônicos de requirement (espelha F1 audit values). */
const STATUS = Object.freeze({
    PRESENT: 'present',
    MISSING: 'missing',
    NA: 'na',
});

/** Badge não-só-cor por status. */
const STATUS_BADGES = Object.freeze({
    present: { icon: '✓', labelKey: 'eis.completeness.status.present', tone: 'success' },
    missing: { icon: '○', labelKey: 'eis.completeness.status.missing', tone: 'warn' },
    na: { icon: '—', labelKey: 'eis.completeness.status.na', tone: 'muted' },
    critical: { icon: '!', labelKey: 'eis.completeness.status.critical', tone: 'danger' },
});

/**
 * Resolve badge não-só-cor p/ um status. Critical override missing.
 *
 * @param {string} status  'present' | 'missing' | 'na'
 * @param {boolean} [isCritical=false]
 * @returns {{icon:string, labelKey:string, tone:string}}
 */
export function resolveStatusBadge(status: any, isCritical: any) {
    if (isCritical === true && status === STATUS.MISSING) {
        return STATUS_BADGES.critical;
    }
    return (STATUS_BADGES as Record<string,any>)[status] || STATUS_BADGES.missing;
}

/**
 * Constrói o view-model do painel de completeness a partir do output
 * de `computeCompletenessBaseline`. View organiza entries em lista
 * renderizável + summary + critical gaps destacados.
 *
 * Output:
 * ```
 * {
 *   summary: {
 *     completenessPct: number (0..100, round 1 decimal),
 *     applicableTotal: number,
 *     applicableSatisfied: number,
 *     naExcludedTotal: number,
 *     criticalGapCount: number,
 *     consistency: <passthrough do F1>,
 *   },
 *   entries: Array<{
 *     id: string,
 *     status: 'present' | 'missing' | 'na',
 *     isCritical: boolean,
 *     badge: {icon, labelKey, tone},
 *   }>,
 *   criticalGaps: Array<{requirement:string, reason:string, badge}>,
 * }
 * ```
 *
 * @param {{required:Array, present:Array, missing:Array, naExcluded:Array,
 *   completenessRatio:number, criticalGaps:Array, consistency:Object,
 *   audit:Array}} baseline Output de computeCompletenessBaseline.
 * @returns {{summary:Object, entries:Array, criticalGaps:Array}}
 */
export function buildCompletenessPanelVM(baseline: any) {
    if (!baseline || typeof baseline !== 'object') {
        throw new TypeError('buildCompletenessPanelVM: baseline must be object');
    }
    const required = Array.isArray(baseline.required) ? baseline.required : [];
    const present = Array.isArray(baseline.present) ? baseline.present : [];
    // eslint-disable-next-line
    const missing = Array.isArray(baseline.missing) ? baseline.missing : [];
    const naExcluded = Array.isArray(baseline.naExcluded) ? baseline.naExcluded : [];
    const criticalGaps = Array.isArray(baseline.criticalGaps) ? baseline.criticalGaps : [];
    const completenessRatio = toFiniteNumber(baseline.completenessRatio, 0);

    // Index sets p/ O(1) lookup
    const presentSet = new Set(present);
    const naSet = new Set(naExcluded);
    const criticalSet = new Set(criticalGaps.map((g: any) => (g && g.requirement) || ''));

    // Combinar required + naExcluded (sem dup, ordem estável por origem do F1)
    const allIds = [...required, ...naExcluded];
    const seen = new Set();
    const entries = [];
    for (const id of allIds) {
        if (typeof id !== 'string' || seen.has(id)) continue;
        seen.add(id);
        let status;
        if (naSet.has(id)) status = STATUS.NA;
        else if (presentSet.has(id)) status = STATUS.PRESENT;
        else status = STATUS.MISSING;
        const isCritical = status === STATUS.MISSING && criticalSet.has(id);
        entries.push({
            id,
            status,
            isCritical,
            badge: resolveStatusBadge(status, isCritical),
        });
    }

    const applicableTotal = required.length;
    const applicableSatisfied = present.length;
    const round1 = (n: any) => Math.round(n * 1000) / 10;

    return {
        summary: {
            completenessPct: round1(completenessRatio),
            applicableTotal,
            applicableSatisfied,
            naExcludedTotal: naExcluded.length,
            criticalGapCount: criticalGaps.length,
            consistency: baseline.consistency || null,
        },
        entries,
        criticalGaps: criticalGaps.map((g: any) => ({
            requirement: (g && g.requirement) || '',
            reason: (g && g.reason) || '',
            badge: STATUS_BADGES.critical,
        })),
    };
}

/**
 * Marca/desmarca um requirement como aplicável. Operação pura — retorna
 * novo `applicabilityConfig`, NUNCA muta o input. Default-deny: input
 * inválido retorna config inalterado.
 *
 * @param {Object} config Configuration map { [requirementId]: boolean | 'na' | 'applicable' }.
 * @param {string} requirementId
 * @param {boolean} applicable
 * @returns {Object} Novo config.
 */
export function toggleRequirementApplicability(config: any, requirementId: any, applicable: any) {
    const base = config && typeof config === 'object' ? { ...config } : {};
    if (typeof requirementId !== 'string' || requirementId === '') return base;
    // Convenção F1: 'na' marca não-aplicável, qualquer outro valor truthy = applicable.
    if (applicable === false) {
        base[requirementId] = 'na';
    } else {
        // applicable=true → remove entry (defaults to applicable via F1 classifier)
        delete base[requirementId];
    }
    return base;
}

/**
 * Sumariza counts da applicability config (apenas marcações explícitas).
 * Útil p/ painel mostrar "X requisitos marcados NA".
 *
 * @param {Object} config
 * @returns {{naCount:number, applicableExplicitCount:number, total:number}}
 */
export function buildApplicabilitySummary(config: any) {
    if (!config || typeof config !== 'object') {
        return { naCount: 0, applicableExplicitCount: 0, total: 0 };
    }
    let naCount = 0;
    let appCount = 0;
    for (const key of Object.keys(config)) {
        const v = config[key];
        if (v === 'na' || v === false) naCount += 1;
        else if (v === 'applicable' || v === true) appCount += 1;
    }
    return { naCount, applicableExplicitCount: appCount, total: naCount + appCount };
}

/**
 * View-model dos critical gap badges (UI prioritária — ação requerida).
 * Pure passthrough do F1 com badge não-só-cor.
 *
 * @param {{criticalGaps:Array<{requirement:string, reason:string}>}} baseline
 * @returns {Array<{requirement:string, reason:string, badge:Object}>}
 */
export function getCriticalGapBadges(baseline: any) {
    if (!baseline || !Array.isArray(baseline.criticalGaps)) return [];
    return baseline.criticalGaps.map((g: any) => ({
        requirement: (g && g.requirement) || '',
        reason: (g && g.reason) || '',
        badge: STATUS_BADGES.critical,
    }));
}

/** Públicos: status + badges (testes/consumers). */
export const COMPLETENESS_STATUS = STATUS;
export const COMPLETENESS_STATUS_BADGES = STATUS_BADGES;
