// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Compliance Preset — pure logic (RF1 + RF13 + RF16 of
 * SPEC_MODEL_BASELINE_COMPLIANCE_PRESET, COMPLIANCE-PRESET-001).
 *
 * Scope of this slice (claude-executor 2026-06-03, F1a PoC):
 *   - Single-preset schema with 12 Must Have V1 components (§4.5)
 *   - `PRESET_ID_REGEX` naming convention (RF16, ADR A10)
 *   - 5 canonical presets seeded frozen (§1.3 / §4.2 subset)
 *   - `validatePreset(p)` consistency check (RF13)
 *   - Lookup helpers + `contentHash` placeholder field (B12 cascade
 *     deferred to a later slice once components manager exists)
 *
 * Out of scope (deferred — Calvin decisions D5-D9 pending §15):
 *   - `ModelComplianceState.bindings[]` multi-preset (D7 V1/V2 split)
 *   - `authoritySignature` trust chain (D6 V1 badge vs V2 crypto)
 *   - `componentsHash` cascade (B12 — requires components manager)
 *   - `model.complianceLocked` (D8 — needs UI lock flow)
 *
 * Tests live in `tests/compliance-preset-pure.test.mjs`.
 */

/**
 * Naming convention regex (RF16 / ADR A10):
 *   `{jurisdiction}-{authority}-{instrument}-{version}`
 *
 * Examples:
 *   - `br-conama-420-ar4`
 *   - `br-sp-cetesb-dd256-2016`
 *   - `global-ipcc-ar6`
 *   - `us-epa-mrr-2024`
 *
 * Jurisdiction: ISO country code (2 letters) OR `global` (international
 * standards like IPCC). Optionally followed by 2-3-letter region (e.g.
 * `br-sp`, `us-ca`).
 *
 * NOTE: spec §4.1 prose declared `[a-z]{2}` but listed `global-ipcc-ar6`
 * as a valid example. We follow intent (international standards must be
 * expressible) and relax the first segment to 2-6 chars to admit
 * `global`. Documented in the ADR A10 followup.
 */
export const PRESET_ID_REGEX = /^[a-z]{2,6}(-[a-z0-9]+){2,}$/;

export type GwpVersion = 'SAR' | 'TAR' | 'AR4' | 'AR5' | 'AR6';
export type GwpTimeHorizon = 20 | 100 | 500;
export type UnitSystem = 'SI' | 'imperial' | 'mixed-br-cetesb';
export type AuthorityLevel = 'federal' | 'state' | 'municipal' | 'sectoral' | 'international';

export interface EisWeights {
    readonly T: number;
    readonly A: number;
    readonly Cp: number;
    readonly Ty: number;
    readonly Cs: number;
    readonly Cm: number;
}

export interface GhgFactors {
    readonly gwpVersion: GwpVersion;
    readonly timeHorizon: GwpTimeHorizon;
}

export interface PublishedBy {
    readonly authority: string;
    readonly level: AuthorityLevel;
    readonly jurisdiction: string;
}

export interface CompliancePreset {
    readonly id: string;
    readonly version: string;
    readonly nameKey: string;
    readonly descriptionKey: string;
    readonly publishedBy: PublishedBy;
    readonly legalBasis: ReadonlyArray<string>;
    readonly effectiveFrom: string;
    readonly effectiveTo?: string;
    // 12 Must Have V1 components (§4.5)
    readonly validationProfileId?: string;
    readonly ghgFactors?: GhgFactors;
    readonly emissionFactorsRegistry?: string;
    readonly taxonomyId?: string;
    readonly reportTemplateIds?: ReadonlyArray<string>;
    readonly eisWeights?: EisWeights;
    readonly spatialCrs?: string;
    readonly unitSystem?: UnitSystem;
    readonly auditRetentionDays?: number;
    readonly currencyCode?: string;
    readonly languagePrimary?: string;
    // UX
    readonly bannerColor: string;
    readonly bannerIconKey: string;
    readonly bannerLabelKey: string;
    // Forensic
    readonly contentHash: string;
    // Lifecycle (RF11 supersession + revogação) — opcionais, lidos por
    // _supersessionPure (chain walker) e _bannerStateResolverPure (estados
    // registry-revoked / outdated). Ausência = preset vigente não-revogado.
    readonly revokedAt?: string;
    readonly revokedReason?: string;
    readonly supersededBy?: string;
}

export interface PresetValidationResult {
    readonly valid: boolean;
    readonly errors: ReadonlyArray<string>;
}

const ALLOWED_GWP: ReadonlyArray<GwpVersion> = Object.freeze(['SAR', 'TAR', 'AR4', 'AR5', 'AR6']);
const ALLOWED_TIME_HORIZONS: ReadonlyArray<number> = Object.freeze([20, 100, 500]);

/**
 * Known emission-factor registries and the GWP series they ship with.
 * Inconsistency (e.g. AR6 GWP with a registry that only has AR4) is a
 * fail-fast condition (RF13 / B11).
 */
const EMISSION_REGISTRY_GWP: Readonly<Record<string, ReadonlyArray<GwpVersion>>> = Object.freeze({
    'br-ipcc-2006': Object.freeze(['SAR', 'TAR', 'AR4'] as GwpVersion[]),
    'epa-mrr-2024': Object.freeze(['AR4', 'AR5'] as GwpVersion[]),
    'eu-mrv-2023': Object.freeze(['AR5', 'AR6'] as GwpVersion[]),
    'global-ipcc-ar6': Object.freeze(['AR6'] as GwpVersion[]),
});

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

function isValidIsoDate(v: unknown): v is string {
    if (typeof v !== 'string' || v.length === 0) return false;
    return Number.isFinite(Date.parse(v));
}

/**
 * Validate a preset's internal consistency (RF13). Pure: returns frozen
 * `{valid, errors}` — caller decides how to surface (banner, modal, throw).
 *
 * Checks:
 *   - id matches PRESET_ID_REGEX
 *   - required fields present (nameKey, publishedBy, effectiveFrom, contentHash, banner*)
 *   - effectiveTo (when present) > effectiveFrom
 *   - gwpVersion ∈ ALLOWED_GWP + timeHorizon ∈ ALLOWED_TIME_HORIZONS
 *   - emissionFactorsRegistry ↔ gwpVersion compatibility
 *   - eisWeights all positive numbers
 *   - auditRetentionDays >= 0
 */
export function validatePreset(preset: CompliancePreset | null | undefined): PresetValidationResult {
    const errors: string[] = [];
    if (!preset || typeof preset !== 'object') {
        return Object.freeze({ valid: false, errors: Object.freeze(['preset_not_object']) });
    }
    if (!isNonEmptyString(preset.id)) errors.push('id_missing');
    else if (!PRESET_ID_REGEX.test(preset.id)) errors.push('id_regex_mismatch');

    if (!isNonEmptyString(preset.version)) errors.push('version_missing');
    if (!isNonEmptyString(preset.nameKey)) errors.push('nameKey_missing');
    if (!isNonEmptyString(preset.descriptionKey)) errors.push('descriptionKey_missing');
    if (!isNonEmptyString(preset.contentHash)) errors.push('contentHash_missing');
    if (!isNonEmptyString(preset.bannerColor)) errors.push('bannerColor_missing');
    if (!isNonEmptyString(preset.bannerIconKey)) errors.push('bannerIconKey_missing');
    if (!isNonEmptyString(preset.bannerLabelKey)) errors.push('bannerLabelKey_missing');

    if (!preset.publishedBy || typeof preset.publishedBy !== 'object') {
        errors.push('publishedBy_missing');
    } else {
        if (!isNonEmptyString(preset.publishedBy.authority)) errors.push('publishedBy_authority_missing');
        if (!isNonEmptyString(preset.publishedBy.jurisdiction)) errors.push('publishedBy_jurisdiction_missing');
    }

    if (!Array.isArray(preset.legalBasis) || preset.legalBasis.length === 0) {
        errors.push('legalBasis_missing');
    }

    if (!isValidIsoDate(preset.effectiveFrom)) errors.push('effectiveFrom_invalid');
    if (preset.effectiveTo !== undefined) {
        if (!isValidIsoDate(preset.effectiveTo)) {
            errors.push('effectiveTo_invalid');
        } else if (isValidIsoDate(preset.effectiveFrom) && Date.parse(preset.effectiveTo) <= Date.parse(preset.effectiveFrom)) {
            errors.push('effectiveTo_before_effectiveFrom');
        }
    }

    if (preset.ghgFactors) {
        if (!ALLOWED_GWP.includes(preset.ghgFactors.gwpVersion)) errors.push('ghgFactors_gwpVersion_invalid');
        if (!ALLOWED_TIME_HORIZONS.includes(preset.ghgFactors.timeHorizon)) {
            errors.push('ghgFactors_timeHorizon_invalid');
        }
        if (preset.emissionFactorsRegistry && EMISSION_REGISTRY_GWP[preset.emissionFactorsRegistry]) {
            const supported = EMISSION_REGISTRY_GWP[preset.emissionFactorsRegistry];
            if (supported && !supported.includes(preset.ghgFactors.gwpVersion)) {
                errors.push(
                    `ghgFactors_emissionRegistry_mismatch:${preset.emissionFactorsRegistry}_does_not_ship_${preset.ghgFactors.gwpVersion}`,
                );
            }
        }
    }

    if (preset.eisWeights) {
        const w = preset.eisWeights;
        for (const k of ['T', 'A', 'Cp', 'Ty', 'Cs', 'Cm'] as const) {
            if (!isFiniteNumber(w[k]) || w[k] < 0) errors.push(`eisWeights_${k}_invalid`);
        }
    }

    if (preset.auditRetentionDays !== undefined) {
        if (!isFiniteNumber(preset.auditRetentionDays) || preset.auditRetentionDays < 0) {
            errors.push('auditRetentionDays_invalid');
        }
    }

    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

// ---------------------------------------------------------------------------
// 5 canonical presets seeded (§1.3 success criterion). Each is `Object.freeze`d
// + has a deterministic placeholder contentHash slot until a real SHA-256
// helper wires in (separate slice — see B12 hash cascade).
// ---------------------------------------------------------------------------

function freezePreset(p: CompliancePreset): CompliancePreset {
    // Spread condicional dos opcionais (não setar `: undefined` explícito —
    // exactOptionalPropertyTypes rejeita undefined em prop opcional). Ausente
    // em `p` → ausente no frozen; comportamento idêntico.
    const frozen = Object.freeze({
        ...p,
        publishedBy: Object.freeze({ ...p.publishedBy }),
        legalBasis: Object.freeze([...p.legalBasis]),
        ...(p.ghgFactors ? { ghgFactors: Object.freeze({ ...p.ghgFactors }) } : {}),
        ...(p.reportTemplateIds ? { reportTemplateIds: Object.freeze([...p.reportTemplateIds]) } : {}),
        ...(p.eisWeights ? { eisWeights: Object.freeze({ ...p.eisWeights }) } : {}),
    });
    return frozen;
}

const CANONICAL: ReadonlyArray<CompliancePreset> = Object.freeze([
    freezePreset({
        id: 'br-conama-420-ar4',
        version: '2009.0',
        nameKey: 'compliance.preset.brConama420.name',
        descriptionKey: 'compliance.preset.brConama420.description',
        publishedBy: { authority: 'CONAMA', level: 'federal', jurisdiction: 'BR' },
        legalBasis: ['CONAMA Resolução 420/2009', 'CONAMA Resolução 460/2013 (alteração)'],
        effectiveFrom: '2009-12-28',
        validationProfileId: 'br-conama-420-2009',
        ghgFactors: { gwpVersion: 'AR4', timeHorizon: 100 },
        emissionFactorsRegistry: 'br-ipcc-2006',
        taxonomyId: 'abnt-conama',
        eisWeights: { T: 4, A: 3, Cp: 2, Ty: 2, Cs: 1, Cm: 1 },
        spatialCrs: 'EPSG:31983',
        unitSystem: 'SI',
        auditRetentionDays: 1825,
        currencyCode: 'BRL',
        languagePrimary: 'pt-BR',
        bannerColor: '#10b981',
        bannerIconKey: 'flag-br',
        bannerLabelKey: 'compliance.preset.brConama420.banner',
        contentHash: 'sha256-placeholder-br-conama-420-ar4',
    }),
    freezePreset({
        id: 'br-sp-cetesb-dd256-2016',
        version: '2016.1',
        nameKey: 'compliance.preset.brSpCetesbDd256.name',
        descriptionKey: 'compliance.preset.brSpCetesbDd256.description',
        publishedBy: { authority: 'CETESB', level: 'state', jurisdiction: 'BR-SP' },
        legalBasis: ['CETESB Decisão de Diretoria 256/2016/E (Valores Orientadores SP)'],
        effectiveFrom: '2016-11-22',
        validationProfileId: 'br-sp-cetesb-dd256-2016',
        ghgFactors: { gwpVersion: 'AR4', timeHorizon: 100 },
        emissionFactorsRegistry: 'br-ipcc-2006',
        taxonomyId: 'cetesb-nomenclatura',
        eisWeights: { T: 3, A: 4, Cp: 2, Ty: 2, Cs: 1, Cm: 1 },
        spatialCrs: 'EPSG:31983',
        unitSystem: 'SI',
        auditRetentionDays: 1825,
        currencyCode: 'BRL',
        languagePrimary: 'pt-BR',
        bannerColor: '#3b82f6',
        bannerIconKey: 'flag-br-sp',
        bannerLabelKey: 'compliance.preset.brSpCetesbDd256.banner',
        contentHash: 'sha256-placeholder-br-sp-cetesb-dd256-2016',
    }),
    freezePreset({
        id: 'global-ipcc-ar4',
        version: '2007.0',
        nameKey: 'compliance.preset.ipccAr4.name',
        descriptionKey: 'compliance.preset.ipccAr4.description',
        publishedBy: { authority: 'IPCC', level: 'international', jurisdiction: 'GLOBAL' },
        legalBasis: ['IPCC Fourth Assessment Report (AR4) 2007'],
        effectiveFrom: '2007-11-17',
        ghgFactors: { gwpVersion: 'AR4', timeHorizon: 100 },
        emissionFactorsRegistry: 'br-ipcc-2006',
        eisWeights: { T: 3, A: 3, Cp: 2, Ty: 2, Cs: 1, Cm: 1 },
        spatialCrs: 'EPSG:4326',
        unitSystem: 'SI',
        bannerColor: '#a855f7',
        bannerIconKey: 'globe',
        bannerLabelKey: 'compliance.preset.ipccAr4.banner',
        contentHash: 'sha256-placeholder-global-ipcc-ar4',
    }),
    freezePreset({
        id: 'global-ipcc-ar6',
        version: '2021.0',
        nameKey: 'compliance.preset.ipccAr6.name',
        descriptionKey: 'compliance.preset.ipccAr6.description',
        publishedBy: { authority: 'IPCC', level: 'international', jurisdiction: 'GLOBAL' },
        legalBasis: ['IPCC Sixth Assessment Report (AR6) WGI 2021'],
        effectiveFrom: '2021-08-09',
        ghgFactors: { gwpVersion: 'AR6', timeHorizon: 100 },
        emissionFactorsRegistry: 'global-ipcc-ar6',
        eisWeights: { T: 3, A: 3, Cp: 3, Ty: 2, Cs: 1, Cm: 1 },
        spatialCrs: 'EPSG:4326',
        unitSystem: 'SI',
        bannerColor: '#7c3aed',
        bannerIconKey: 'globe',
        bannerLabelKey: 'compliance.preset.ipccAr6.banner',
        contentHash: 'sha256-placeholder-global-ipcc-ar6',
    }),
    freezePreset({
        id: 'us-epa-mrr-2024',
        version: '2024.0',
        nameKey: 'compliance.preset.usEpaMrr.name',
        descriptionKey: 'compliance.preset.usEpaMrr.description',
        publishedBy: { authority: 'EPA', level: 'federal', jurisdiction: 'US' },
        legalBasis: ['EPA Mandatory Reporting Rule (40 CFR Part 98) — 2024 update'],
        effectiveFrom: '2024-01-01',
        ghgFactors: { gwpVersion: 'AR5', timeHorizon: 100 },
        emissionFactorsRegistry: 'epa-mrr-2024',
        taxonomyId: 'epa-wqx',
        eisWeights: { T: 3, A: 3, Cp: 2, Ty: 2, Cs: 1, Cm: 1 },
        spatialCrs: 'EPSG:4269',
        unitSystem: 'imperial',
        auditRetentionDays: 1095,
        currencyCode: 'USD',
        languagePrimary: 'en-US',
        bannerColor: '#ef4444',
        bannerIconKey: 'flag-us',
        bannerLabelKey: 'compliance.preset.usEpaMrr.banner',
        contentHash: 'sha256-placeholder-us-epa-mrr-2024',
    }),
]);

/**
 * Get all 5 canonical presets (frozen, deterministic order).
 */
export function getCanonicalPresets(): ReadonlyArray<CompliancePreset> {
    return CANONICAL;
}

/**
 * Lookup preset by id. Returns `null` when not found — never throws.
 */
export function getPresetById(id: string | null | undefined): CompliancePreset | null {
    if (typeof id !== 'string' || id.length === 0) return null;
    const hit = CANONICAL.find((p) => p.id === id);
    return hit ?? null;
}

/**
 * Filter presets by jurisdiction (`'BR'`, `'BR-SP'`, `'US'`, `'GLOBAL'`).
 * Returns frozen array — empty when none match.
 */
export function getPresetsByJurisdiction(jurisdiction: string | null | undefined): ReadonlyArray<CompliancePreset> {
    if (typeof jurisdiction !== 'string' || jurisdiction.length === 0) {
        return Object.freeze([]);
    }
    const filtered = CANONICAL.filter((p) => p.publishedBy.jurisdiction === jurisdiction);
    return Object.freeze(filtered);
}
