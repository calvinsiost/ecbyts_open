// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ODS stamp — pure logic (RF-6 of SPEC_ODS_IMPACT_PARAMS).
 *
 * The link entity → official ODS indicator is NOT a loose editable field: it
 * is an immutable `OdsStamp` appended to the entity's history at the moment
 * of association, following the same model as the existing ecbyts stamps
 * (`utils/stamps/*`, `reporting` category; A5 of SPEC_ENVIRONMENTAL_CONDITIONS
 * already writes draft + stamps). Every linkable entity — condicionante,
 * ação, campanha, elemento — receives an ODS stamp via this helper.
 *
 * Non-negotiable rules (SPEC §RF-6):
 *   - Immutability + full trail: a stamp is written to the entity's history
 *     and NEVER overwritten. Re-stamping (code changed, new evidence, tier
 *     went up/down) = a NEW stamp appended; the previous one stays in the
 *     trail (`stampHistory`). The current link is the most recent stamp; an
 *     audit reads the whole chain.
 *   - Tier of the era: each stamp freezes the evidence `tier` AT THE MOMENT
 *     of stamping (real provenance of the data then). Later staleness does
 *     not rewrite the stamp — it downgrades the *display* (RF-4 §5.3), but
 *     the historical stamp stays faithful.
 *   - `evidenceRef` points to the source that sustained the tier (campaign,
 *     simulation, declaration), allowing the claim to be reconstructed.
 *
 * Anti-false-green alignment: `isClaimedTierHonest` (or an equivalent
 * validator supplied by the caller — see {@link OdsCodeValidator}) is the
 * gate of `createOdsStamp` AND of any render/export of the stamp — a
 * `claimed` stamp is ALWAYS shown as claimed (never promoted in the
 * display), `absent` as absent.
 *
 * Decoupling note: RF-1's registry loader (`core/ods/_indicatorsPure.ts`,
 * reading `data/ods-indicators.json`) is a separate, not-yet-existing
 * module (its own micro-activity). Hard-importing it here would make this
 * pure module depend on unfinished work, so `createOdsStamp`/`validateStamp`
 * accept the code-existence check as an injected {@link OdsCodeValidator}
 * function — any caller (the future RF-1 loader, or a test double) can
 * supply `(code) => boolean`. This keeps `_odsStampPure.ts` importable and
 * testable today, with zero I/O and zero DOM, per the pure-module contract
 * shared by every `_*Pure.ts` in `core/ods/`.
 *
 * Tests live in `tests/ods-stamp-pure.test.mjs`.
 */

/** Evidence tier, same vocabulary as `_registryPure.ts`'s `isClaimedTierHonest` mapping. */
export type OdsStampTier = 'measured' | 'estimated' | 'claimed' | 'absent';

/**
 * Injectable check for "does this official ODS indicator code exist in the
 * registry (RF-1)". Kept as a parameter (not a hard import) so this pure
 * module never depends on RF-1's loader existing yet.
 */
export type OdsCodeValidator = (indicatorCode: string) => boolean;

/**
 * Injectable check for "is `tier` honest given `evidenceRef`" — i.e. does the
 * declared/simulated/measured evidence actually sustain the claimed tier.
 * Defaults to the conservative built-in {@link isClaimedTierHonestDefault}
 * when the caller does not supply one (RF-1's `isClaimedTierHonest` operates
 * per-ODS-id; here the gate is evidence-shape based — see rules below).
 */
export type TierHonestyValidator = (tier: OdsStampTier, evidenceRef: string | null) => boolean;

/** Immutable ODS stamp — RF-6 core data shape. */
export interface OdsStamp {
    /** Official indicator code (e.g. '6.3.2'), validated against the RF-1 registry. */
    readonly odsIndicatorCode: string;
    /** ISO-8601 timestamp of when this stamp was created. */
    readonly stampedAt: string;
    /** Who/what produced the stamp (user id, agent id, 'system', 'legacy-migration'). */
    readonly stampedBy: string;
    /** Evidence tier frozen at stamping time — never rewritten afterwards. */
    readonly tier: OdsStampTier;
    /** Reference to the source sustaining the tier (campaign id, simulation run, declaration text), or null when absent. */
    readonly evidenceRef: string | null;
}

/** Options accepted by {@link createOdsStamp}. */
export interface CreateOdsStampOptions {
    /** Who produced the stamp. Defaults to `'system'`. */
    readonly stampedBy?: string;
    /** ISO timestamp override (defaults to `new Date().toISOString()`). Exposed for deterministic tests. */
    readonly at?: string;
    /** Validator for indicator-code existence (RF-1 registry). Required — no silent bypass. */
    readonly validateCode: OdsCodeValidator;
    /** Optional custom tier-honesty gate; defaults to the conservative built-in rule. */
    readonly isTierHonest?: TierHonestyValidator;
}

/** Result of {@link createOdsStamp}: either the stamp, or a reason it was rejected. */
export type CreateOdsStampResult =
    | { readonly ok: true; readonly stamp: OdsStamp }
    | { readonly ok: false; readonly reason: string };

/** Result of {@link validateStamp}. */
export interface ValidateStampResult {
    readonly ok: boolean;
    readonly reason?: string;
}

const VALID_TIERS: ReadonlyArray<OdsStampTier> = ['measured', 'estimated', 'claimed', 'absent'];

/** Same code shape enforced by RF-1's loader DoD: up to 2-digit goal, alnum target, single trailing digit. */
const CODE_PATTERN = /^\d{1,2}\.\w{1,3}\.\d$/;

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Conservative default tier-honesty gate used when the caller does not
 * supply {@link TierHonestyValidator}: a `measured` or `estimated` claim
 * REQUIRES a non-empty `evidenceRef` (you cannot claim you measured/estimated
 * something with no evidence pointer); `claimed` and `absent` never require
 * evidence (a `claimed` stamp is, by definition, a declaration without
 * lastro — anti-requirement N2 of SPEC_ODS_IMPACT_RISK).
 */
function isClaimedTierHonestDefault(tier: OdsStampTier, evidenceRef: string | null): boolean {
    if (tier === 'measured' || tier === 'estimated') {
        return isNonEmptyString(evidenceRef);
    }
    return true;
}

/**
 * Validates the *shape* of a candidate `OdsStamp` — schema + tier vocabulary
 * + code pattern — WITHOUT touching the registry (that check is
 * `validateCode`, only run by `createOdsStamp`/`validateStamp` when supplied).
 */
function validateStampShape(stamp: Partial<OdsStamp>): ValidateStampResult {
    if (!isNonEmptyString(stamp.odsIndicatorCode)) {
        return { ok: false, reason: 'odsIndicatorCode ausente ou vazio' };
    }
    if (!CODE_PATTERN.test(stamp.odsIndicatorCode)) {
        return { ok: false, reason: `odsIndicatorCode fora do padrão esperado: ${stamp.odsIndicatorCode}` };
    }
    if (!isNonEmptyString(stamp.stampedAt) || Number.isNaN(Date.parse(stamp.stampedAt))) {
        return { ok: false, reason: 'stampedAt ausente ou não é data ISO válida' };
    }
    if (!isNonEmptyString(stamp.stampedBy)) {
        return { ok: false, reason: 'stampedBy ausente ou vazio' };
    }
    if (typeof stamp.tier !== 'string' || !VALID_TIERS.includes(stamp.tier as OdsStampTier)) {
        return { ok: false, reason: `tier inválido: ${String(stamp.tier)}` };
    }
    if (stamp.evidenceRef !== null && stamp.evidenceRef !== undefined && typeof stamp.evidenceRef !== 'string') {
        return { ok: false, reason: 'evidenceRef deve ser string ou null' };
    }
    return { ok: true };
}

/**
 * Creates an immutable `OdsStamp`. Rejects (never throws) when:
 *   - `indicatorCode` does not exist in the RF-1 registry (per `validateCode`);
 *   - `tier` is not a recognised `OdsStampTier`;
 *   - the claimed `tier` is not honestly sustained by `evidenceRef` (gate
 *     `isTierHonest`, default conservative rule — see
 *     {@link isClaimedTierHonestDefault}). A declaration without lastro
 *     CANNOT stamp `measured`.
 *
 * Pure: no I/O, no DOM, no `Date.now()` unless `options.at` is omitted (in
 * which case the current time is read once, deterministically returned in
 * the result — same pattern as `utils/stamps/manager.ts`'s `addStamp`).
 */
export function createOdsStamp(
    indicatorCode: string,
    tier: OdsStampTier,
    evidenceRef: string | null,
    options: CreateOdsStampOptions,
): CreateOdsStampResult {
    if (!isNonEmptyString(indicatorCode)) {
        return { ok: false, reason: 'indicatorCode ausente ou vazio' };
    }
    if (!CODE_PATTERN.test(indicatorCode)) {
        return { ok: false, reason: `indicatorCode fora do padrão esperado: ${indicatorCode}` };
    }
    if (typeof options?.validateCode !== 'function') {
        return { ok: false, reason: 'validateCode (RF-1 registry check) é obrigatório' };
    }
    if (!options.validateCode(indicatorCode)) {
        return { ok: false, reason: `indicatorCode não existe no registry RF-1: ${indicatorCode}` };
    }
    if (!VALID_TIERS.includes(tier)) {
        return { ok: false, reason: `tier inválido: ${String(tier)}` };
    }
    const normalizedEvidenceRef = isNonEmptyString(evidenceRef) ? evidenceRef.trim() : null;
    const honestyGate = options.isTierHonest ?? isClaimedTierHonestDefault;
    if (!honestyGate(tier, normalizedEvidenceRef)) {
        return {
            ok: false,
            reason: `tier '${tier}' não é sustentado pela evidência fornecida (evidenceRef: ${normalizedEvidenceRef ?? 'null'})`,
        };
    }

    const stampedAt = isNonEmptyString(options.at) ? options.at : new Date().toISOString();
    if (Number.isNaN(Date.parse(stampedAt))) {
        return { ok: false, reason: `at não é uma data ISO válida: ${options.at}` };
    }
    const stampedBy = isNonEmptyString(options.stampedBy) ? options.stampedBy : 'system';

    const stamp: OdsStamp = Object.freeze({
        odsIndicatorCode: indicatorCode,
        stampedAt,
        stampedBy,
        tier,
        evidenceRef: normalizedEvidenceRef,
    });

    return { ok: true, stamp };
}

/**
 * Validates an existing (e.g. deserialized/legacy) stamp — schema shape +
 * tier vocabulary + code pattern always; registry existence (`validateCode`)
 * and tier-honesty (`isTierHonest`) only when supplied, so this can validate
 * a stamp already produced elsewhere without forcing every caller to carry
 * the registry around.
 */
export function validateStamp(
    stamp: Partial<OdsStamp>,
    options?: { readonly validateCode?: OdsCodeValidator; readonly isTierHonest?: TierHonestyValidator },
): ValidateStampResult {
    const shape = validateStampShape(stamp);
    if (!shape.ok) return shape;

    if (options?.validateCode && !options.validateCode(stamp.odsIndicatorCode as string)) {
        return { ok: false, reason: `odsIndicatorCode não existe no registry RF-1: ${stamp.odsIndicatorCode}` };
    }
    const honestyGate = options?.isTierHonest ?? isClaimedTierHonestDefault;
    if (!honestyGate(stamp.tier as OdsStampTier, (stamp.evidenceRef ?? null) as string | null)) {
        return {
            ok: false,
            reason: `tier '${stamp.tier}' não é sustentado pela evidência (evidenceRef: ${stamp.evidenceRef ?? 'null'})`,
        };
    }
    return { ok: true };
}

/**
 * Appends `newStamp` to `existing` immutably — NEVER mutates or overwrites
 * the previous entries (RF-6 "trilha completa"). Returns a NEW frozen array
 * ordered by `stampedAt` ascending (oldest first, most recent at the end),
 * matching the spec's "mais recente ao fim" contract for `currentStamp` to
 * read the last element.
 *
 * Ties in `stampedAt` are broken by insertion order (stable sort): when two
 * stamps share the exact same timestamp, the one already in `existing`
 * sorts before `newStamp`.
 */
export function stampHistory(
    existing: ReadonlyArray<OdsStamp> | undefined | null,
    newStamp: OdsStamp,
): ReadonlyArray<OdsStamp> {
    const base = Array.isArray(existing) ? existing : [];
    const withNew = [...base, newStamp];
    // Stable sort: Array.prototype.sort is guaranteed stable per spec (ES2019+),
    // so equal-timestamp entries keep their relative (insertion) order.
    const sorted = withNew
        .map((s, idx) => ({ s, idx }))
        .sort((a, b) => {
            const ta = Date.parse(a.s.stampedAt);
            const tb = Date.parse(b.s.stampedAt);
            if (ta !== tb) return ta - tb;
            return a.idx - b.idx;
        })
        .map(({ s }) => Object.freeze({ ...s }));
    return Object.freeze(sorted);
}

/**
 * Returns the currently-valid stamp — the most recent entry in the trail
 * (last element, since `stampHistory` keeps the array ordered oldest→newest).
 * Returns `null` for an empty/missing history (no stamp yet — caller should
 * treat the entity as unstamped, NOT as `absent` tier, which is a data
 * property of a stamp that exists).
 */
export function currentStamp(history: ReadonlyArray<OdsStamp> | undefined | null): OdsStamp | null {
    if (!Array.isArray(history) || history.length === 0) return null;
    return history[history.length - 1];
}

/**
 * Retrocompat bridge (RF-6 §"Retrocompat"): a legacy free-text
 * `odsIndicatorKey` (no stamp trail, no tier, no evidence) is read as an
 * implicit `claimed` stamp — a declaration without lastro — until it is
 * re-stamped through `createOdsStamp` with real evidence. Does NOT write
 * anything; purely a read-time projection so legacy data renders honestly
 * (RF-4 "tier exibido respeita isClaimedTierHonest") without a migration
 * step blocking the UI.
 */
export function legacyKeyAsImplicitStamp(
    odsIndicatorKey: string,
    options?: { readonly stampedAt?: string; readonly stampedBy?: string },
): OdsStamp | null {
    if (!isNonEmptyString(odsIndicatorKey)) return null;
    const trimmed = odsIndicatorKey.trim();
    if (!CODE_PATTERN.test(trimmed)) {
        // Legacy key predates the official-code convention (arbitrary free
        // text) — cannot be projected as a coded stamp; caller keeps showing
        // the raw text as-is (out of scope here; RF-3 territory).
        return null;
    }
    return Object.freeze({
        odsIndicatorCode: trimmed,
        stampedAt: isNonEmptyString(options?.stampedAt) ? (options!.stampedAt as string) : new Date(0).toISOString(),
        stampedBy: isNonEmptyString(options?.stampedBy) ? (options!.stampedBy as string) : 'legacy-migration',
        tier: 'claimed',
        evidenceRef: null,
    });
}
