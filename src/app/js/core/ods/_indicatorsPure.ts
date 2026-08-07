// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ODS Indicators registry — pure logic loader (RF-1 of SPEC_ODS_IMPACT_PARAMS).
 *
 * Validates + freezes the versioned catalog in `data/ods-indicators.json`
 * (UN Global Indicator Framework, post-2026 refinement, E/CN.3/2026/12):
 * 251 indicators across all 17 Goals, of which a curated `domainRelevant`
 * subset (v1 = 23) carries measurement-signal parameters (`direction`,
 * `unit`, `thresholds`, `tierDefault`). The remaining indicators are present
 * but inert — activatable by admin curation (setting the 4 signal fields +
 * `domainRelevant: true`) without a new release (SPEC §2.1, CFG-24/CFG-32).
 *
 * Pure-logic invariants (mirrors `core/dataLibrary/ADR.md` + `_registryPure.ts`):
 *   - NO fs/network/DOM I/O in this module — callers pass in the already
 *     parsed JSON (`unknown`); this module only validates, coerces types and
 *     freezes. The one wire-in that actually reads `data/ods-indicators.json`
 *     off disk lives in the test harness (`tests/ods-indicators-pure.test.mjs`)
 *     today; a future runtime adapter (`utils/ods/*`) can call
 *     `loadIndicatorRegistry(JSON.parse(text))` the same way.
 *   - Defaults de limiar (CFG-32): `thresholds.improve = 0.6`,
 *     `thresholds.worsen = 0.4` — curados por admin, versionados no JSON,
 *     NUNCA input livre do usuário final (NOT N9 do CFG-24).
 *   - Anti-falso-verde: schema inválido é REJEITADO (lança), nunca
 *     silenciosamente coagido; ausência de indicador ≠ indicador inerte.
 *
 * Tests live in `tests/ods-indicators-pure.test.mjs`.
 */

/** `lower_is_better` = decreasing the raw value improves the ODS signal. */
export type OdsIndicatorDirection = 'lower_is_better' | 'higher_is_better';

/** Evidence tier vocabulary shared with RF-2 `computeOdsImpact` / `isClaimedTierHonest`. */
export type OdsIndicatorTier = 'measured' | 'estimated' | 'claimed' | 'absent';

export interface OdsIndicatorThresholds {
    /** Score >= improve → signal reads as "improving" (CFG-32 default 0.6). */
    readonly improve: number;
    /** Score <= worsen → signal reads as "worsening" (CFG-32 default 0.4). */
    readonly worsen: number;
}

/** Indicator present in the framework but not yet curated with signal parameters. */
export interface OdsIndicatorInert {
    readonly code: string;
    readonly goal: number;
    readonly target: string;
    readonly titleEn: string;
    readonly domainRelevant: false;
}

/** Indicator curated by admin with the 4 signal fields (v1 domain subset). */
export interface OdsIndicatorMeasurable {
    readonly code: string;
    readonly goal: number;
    readonly target: string;
    readonly titleEn: string;
    readonly domainRelevant: true;
    readonly direction: OdsIndicatorDirection;
    readonly unit: string;
    readonly thresholds: OdsIndicatorThresholds;
    readonly tierDefault: OdsIndicatorTier;
}

export type OdsIndicator = OdsIndicatorInert | OdsIndicatorMeasurable;

export interface OdsIndicatorRegistry {
    readonly sourceDoc: string;
    readonly sourceTitle: string;
    readonly sourceUrl: string;
    readonly extractedAt: string;
    readonly totalIndicators: number;
    readonly domainRelevantCount: number;
    readonly indicators: ReadonlyArray<OdsIndicator>;
}

/** `^\d{1,2}\.\w{1,3}\.\d$` — e.g. "6.3.2", "12.4.2", "17.16.1". */
const CODE_RE = /^\d{1,2}\.\w{1,3}\.\d$/;
const DIRECTIONS: ReadonlyArray<OdsIndicatorDirection> = ['lower_is_better', 'higher_is_better'];
const TIERS: ReadonlyArray<OdsIndicatorTier> = ['measured', 'estimated', 'claimed', 'absent'];

function fail(reason: string): never {
    throw new Error(`[ods/_indicatorsPure] invalid registry: ${reason}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/** Goal 1..17 must match the numeric prefix of `code` (e.g. code "6.3.2" → goal 6). */
function codeGoalPrefix(code: string): number {
    const prefix = code.split('.', 1)[0] ?? '';
    return Number.parseInt(prefix, 10);
}

function validateThresholds(raw: unknown, code: string): OdsIndicatorThresholds {
    if (!isPlainObject(raw)) fail(`${code}: thresholds must be an object`);
    const { improve, worsen } = raw;
    if (!isFiniteNumber(improve)) fail(`${code}: thresholds.improve must be a finite number`);
    if (!isFiniteNumber(worsen)) fail(`${code}: thresholds.worsen must be a finite number`);
    if (improve <= worsen) fail(`${code}: thresholds.improve must be > thresholds.worsen`);
    return Object.freeze({ improve, worsen });
}

function validateIndicator(raw: unknown, index: number): OdsIndicator {
    if (!isPlainObject(raw)) fail(`indicators[${index}] is not an object`);

    const { code, goal, target, titleEn, domainRelevant } = raw;
    if (typeof code !== 'string' || !CODE_RE.test(code)) {
        fail(`indicators[${index}]: code "${String(code)}" fails ${CODE_RE}`);
    }
    if (!isFiniteNumber(goal) || goal < 1 || goal > 17 || Math.trunc(goal) !== goal) {
        fail(`${code}: goal must be an integer 1..17`);
    }
    if (goal !== codeGoalPrefix(code)) {
        fail(`${code}: goal ${goal} does not match code prefix`);
    }
    if (typeof target !== 'string' || target.length === 0) {
        fail(`${code}: target must be a non-empty string`);
    }
    if (typeof titleEn !== 'string' || titleEn.length === 0) {
        fail(`${code}: titleEn must be a non-empty string`);
    }
    if (typeof domainRelevant !== 'boolean') {
        fail(`${code}: domainRelevant must be a boolean`);
    }

    if (!domainRelevant) {
        return Object.freeze({ code, goal, target, titleEn, domainRelevant: false });
    }

    const { direction, unit, thresholds, tierDefault } = raw;
    if (typeof direction !== 'string' || !DIRECTIONS.includes(direction as OdsIndicatorDirection)) {
        fail(`${code}: direction must be one of ${DIRECTIONS.join('|')}`);
    }
    if (typeof unit !== 'string' || unit.length === 0) {
        fail(`${code}: unit must be a non-empty string`);
    }
    if (typeof tierDefault !== 'string' || !TIERS.includes(tierDefault as OdsIndicatorTier)) {
        fail(`${code}: tierDefault must be one of ${TIERS.join('|')}`);
    }

    return Object.freeze({
        code,
        goal,
        target,
        titleEn,
        domainRelevant: true,
        direction: direction as OdsIndicatorDirection,
        unit,
        thresholds: validateThresholds(thresholds, code),
        tierDefault: tierDefault as OdsIndicatorTier,
    });
}

/**
 * Validates the raw parsed JSON (as loaded from `data/ods-indicators.json`)
 * and returns a deeply frozen, typed registry. Throws on any schema
 * violation — an invalid registry NEVER loads silently-degraded
 * (anti-falso-verde: fail loud, not fail quiet).
 */
export function loadIndicatorRegistry(raw: unknown): OdsIndicatorRegistry {
    if (!isPlainObject(raw)) fail('root must be an object');

    const { sourceDoc, sourceTitle, sourceUrl, extractedAt, totalIndicators, domainRelevantCount, indicators } = raw;

    if (typeof sourceDoc !== 'string' || sourceDoc.length === 0) fail('sourceDoc must be a non-empty string');
    if (typeof sourceTitle !== 'string' || sourceTitle.length === 0) fail('sourceTitle must be a non-empty string');
    if (typeof sourceUrl !== 'string' || sourceUrl.length === 0) fail('sourceUrl must be a non-empty string');
    if (typeof extractedAt !== 'string' || extractedAt.length === 0) fail('extractedAt must be a non-empty string');
    if (!isFiniteNumber(totalIndicators) || totalIndicators <= 0) fail('totalIndicators must be a positive number');
    if (!isFiniteNumber(domainRelevantCount) || domainRelevantCount < 0) {
        fail('domainRelevantCount must be a non-negative number');
    }
    if (!Array.isArray(indicators)) fail('indicators must be an array');

    const parsed = indicators.map((entry, index) => validateIndicator(entry, index));

    if (parsed.length !== totalIndicators) {
        fail(`totalIndicators=${totalIndicators} but indicators.length=${parsed.length}`);
    }

    const codes = new Set(parsed.map((e) => e.code));
    if (codes.size !== parsed.length) {
        fail('duplicate indicator codes detected');
    }

    const actualDomainRelevant = parsed.filter((e) => e.domainRelevant).length;
    if (actualDomainRelevant !== domainRelevantCount) {
        fail(
            `domainRelevantCount=${domainRelevantCount} but ${actualDomainRelevant} entries have domainRelevant:true`,
        );
    }

    return Object.freeze({
        sourceDoc,
        sourceTitle,
        sourceUrl,
        extractedAt,
        totalIndicators,
        domainRelevantCount,
        indicators: Object.freeze(parsed),
    });
}

/** Type guard: narrows an `OdsIndicator` to the curated, measurable shape. */
export function isMeasurableIndicator(indicator: OdsIndicator): indicator is OdsIndicatorMeasurable {
    return indicator.domainRelevant === true;
}

/**
 * The `domainRelevant:true` indicators declared under a given ODS Goal
 * (1..17), in registry order — e.g. `getIndicatorsForOds(registry, 6)`
 * returns 6.3.1/6.3.2/6.4.1/6.4.2/6.6.1 (SPEC §2.1 DoD). Non-domainRelevant
 * indicators of the same Goal exist in the full framework but carry no
 * signal parameters, so they are excluded here; use `registry.indicators`
 * directly (or filter by `goal` without the `domainRelevant` guard) to
 * inspect the inert entries.
 */
export function getIndicatorsForOds(
    registry: OdsIndicatorRegistry,
    goal: number,
): ReadonlyArray<OdsIndicatorMeasurable> {
    if (!Number.isFinite(goal)) return Object.freeze([]);
    const truncated = Math.trunc(goal);
    return Object.freeze(registry.indicators.filter(isMeasurableIndicator).filter((i) => i.goal === truncated));
}

/** Only the curated `domainRelevant:true` indicators (v1 = 23, admin-activatable). */
export function getMeasurableIndicators(registry: OdsIndicatorRegistry): ReadonlyArray<OdsIndicatorMeasurable> {
    return Object.freeze(registry.indicators.filter(isMeasurableIndicator));
}

/** Lookup a single indicator by its official UN code (e.g. "6.3.2"). Undefined if absent. */
export function getIndicatorByCode(registry: OdsIndicatorRegistry, code: string): OdsIndicator | undefined {
    if (typeof code !== 'string' || !code) return undefined;
    return registry.indicators.find((i) => i.code === code);
}
