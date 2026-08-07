// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   HEALTH-MON-001 — Motor de avaliação de thresholds (BEI/OEL)
   Referências: ACGIH BEI 2024, SCOEL BLV, NR-15 (Brasil)

   Lógica pura — sem DOM (dispatchBreachEvents é guarded), sem rede.
   ================================================================ */

import { HEALTH_STATUS, HEALTH_EVENTS } from './schema.js';

// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------

export type HealthStatus = 'green' | 'yellow' | 'red' | 'critical' | 'unknown';

export interface BiomarkerReading {
    value: number;
    biomarkerType: string;
    [key: string]: unknown;
}

export interface ThresholdRule {
    biomarkerType: string;
    active: boolean;
    warningValue: number;
    criticalValue: number;
    actionValue: number | null;
    [key: string]: unknown;
}

export interface EvaluationResult {
    readonly status: HealthStatus;
    readonly exceededAt: 'warningValue' | 'criticalValue' | 'actionValue' | null;
    readonly ratio: number;
}

export interface BatchEntry {
    reading: BiomarkerReading;
    rule: ThresholdRule | null;
    result: EvaluationResult;
}

export interface AggregateSummary {
    green: number;
    yellow: number;
    red: number;
    critical: number;
    unknown: number;
    total: number;
    hasAlerts: boolean;
}

// ----------------------------------------------------------------
// Core evaluation
// ----------------------------------------------------------------

/**
 * Evaluate a single reading against a matching threshold rule.
 *
 * Rule precedence:
 *   value >= actionValue   → 'critical' (if actionValue defined)
 *   value >= criticalValue → 'red'
 *   value >= warningValue  → 'yellow'
 *   otherwise              → 'green'
 */
export function evaluateReadingStatus(reading: BiomarkerReading, rule: ThresholdRule): EvaluationResult {
    if (!reading || !rule) throw new TypeError('reading and rule are required');

    const { value } = reading;
    const { warningValue, criticalValue, actionValue } = rule;

    if (typeof value !== 'number' || typeof warningValue !== 'number' || typeof criticalValue !== 'number') {
        throw new TypeError('reading.value, rule.warningValue, rule.criticalValue must be numbers');
    }

    const ratio = criticalValue > 0 ? value / criticalValue : 0;

    let status: HealthStatus = HEALTH_STATUS.green as HealthStatus;
    let exceededAt: EvaluationResult['exceededAt'] = null;

    if (actionValue !== null && actionValue !== undefined && value >= actionValue) {
        status = HEALTH_STATUS.critical as HealthStatus;
        exceededAt = 'actionValue';
    } else if (value >= criticalValue) {
        status = HEALTH_STATUS.red as HealthStatus;
        exceededAt = 'criticalValue';
    } else if (value >= warningValue) {
        status = HEALTH_STATUS.yellow as HealthStatus;
        exceededAt = 'warningValue';
    }

    return Object.freeze({ status, exceededAt, ratio: Number(ratio.toFixed(4)) });
}

/**
 * Find the applicable rule for a given reading from a rule set.
 * Matches on biomarkerType + active flag. Returns null if no rule matches.
 */
export function findApplicableRule(reading: BiomarkerReading, rules: ThresholdRule[]): ThresholdRule | null {
    if (!reading || !Array.isArray(rules)) return null;
    return rules.find((r) => r.active && r.biomarkerType === reading.biomarkerType) || null;
}

/**
 * Evaluate all readings in a batch against a rule set.
 * Readings without a matching rule get status = 'unknown'.
 */
export function evaluateBatch(readings: BiomarkerReading[], rules: ThresholdRule[]): BatchEntry[] {
    if (!Array.isArray(readings)) return [];
    const safeRules: ThresholdRule[] = Array.isArray(rules) ? rules : [];

    return readings.map((reading) => {
        const rule = findApplicableRule(reading, safeRules);
        if (!rule) {
            return {
                reading,
                rule: null,
                result: Object.freeze({
                    status: HEALTH_STATUS.unknown as HealthStatus,
                    exceededAt: null,
                    ratio: 0,
                }),
            };
        }
        const result = evaluateReadingStatus(reading, rule);
        return { reading, rule, result };
    });
}

/**
 * Aggregate batch results to a project-level summary.
 */
export function aggregateHealthStatus(batchResults: BatchEntry[]): AggregateSummary {
    const counts: Record<HealthStatus, number> = {
        green: 0,
        yellow: 0,
        red: 0,
        critical: 0,
        unknown: 0,
    };
    let total = 0;
    for (const entry of batchResults || []) {
        const s: HealthStatus = (entry?.result?.status as HealthStatus) || ('unknown' as HealthStatus);
        counts[s] = (counts[s] || 0) + 1;
        total += 1;
    }
    return {
        green: counts.green,
        yellow: counts.yellow,
        red: counts.red,
        critical: counts.critical,
        unknown: counts.unknown,
        total,
        hasAlerts: counts.red > 0 || counts.critical > 0,
    };
}

/**
 * Find readings that breached their threshold (red or critical).
 */
export function extractBreachedReadings(batchResults: BatchEntry[]): BatchEntry[] {
    return (batchResults || []).filter(
        ({ result }) => result?.status === HEALTH_STATUS.red || result?.status === HEALTH_STATUS.critical,
    );
}

/**
 * Dispatch health events for breached readings via window.dispatchEvent.
 * Safe when window is not available (Node.js context).
 */
export function dispatchBreachEvents(breached: BatchEntry[]): void {
    if (!Array.isArray(breached) || typeof window === 'undefined') return;
    for (const { reading, rule, result } of breached) {
        try {
            window.dispatchEvent(
                new CustomEvent(HEALTH_EVENTS.THRESHOLD_BREACHED, {
                    detail: { reading, rule, result },
                    bubbles: false,
                }),
            );
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.debug('[thresholdEngine] dispatchEvent:', msg);
            /* not in browser — silently skip */
        }
    }
}
