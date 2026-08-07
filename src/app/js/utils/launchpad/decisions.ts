// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/utils/launchpad/decisions.js
// Launchpad V3 - canonical decisions registry.
//
// Estas constantes são a fonte-de-verdade das decisões arquiteturais
// do Launchpad V3. Cheap tests em tests/launchpad-v3-decisions.test.mjs
// travam cada valor contra drift silencioso.
//
// Para mudar qualquer valor:
//   1. Atualizar a spec correspondente (SPEC_HOME_REDESIGN_3COL_V3)
//   2. Atualizar este arquivo
//   3. Atualizar o cheap test que trava o novo valor
// Nessa ordem. Mudança sem spec = regressão.

export interface CanonicalPersona {
    readonly id: string;
    readonly labelKey: string;
}

// Object.freeze em runtime: `as const` é type-level apenas e não impede
// mutação em runtime. Sentinel launchpad-v3-decisions garante imutabilidade
// real via Object.isFrozen check.
export const CANONICAL_PERSONAS = Object.freeze([
    Object.freeze({ id: 'collector', labelKey: 'persona.collector' }),
    Object.freeze({ id: 'engineer', labelKey: 'persona.engineer' }), // default
    Object.freeze({ id: 'regulator', labelKey: 'persona.regulator' }),
    Object.freeze({ id: 'manager', labelKey: 'persona.manager' }),
    Object.freeze({ id: 'community', labelKey: 'persona.community' }),
] as const);

export type CanonicalPersonaType = (typeof CANONICAL_PERSONAS)[number];

export const DEFAULT_PERSONA_ID = 'engineer';

export interface TelemetryUnlockCriteria {
    readonly minUsers: number;
    readonly minDurationDays: number;
    readonly cancelThresholdTopZonesPct: number;
    readonly cancelThresholdTopZonesCount: number;
}

export const TELEMETRY_UNLOCK_CRITERIA: TelemetryUnlockCriteria = Object.freeze({
    minUsers: 5,
    minDurationDays: 14,
    cancelThresholdTopZonesPct: 80,
    cancelThresholdTopZonesCount: 2,
} as const);

export interface FeatureFlagSource {
    readonly primary: string;
    readonly fallback: string;
    readonly fallbackKey: string;
    readonly expectedEndpoint: string;
    readonly managedFlags: readonly string[];
}

export const FEATURE_FLAG_SOURCE: FeatureFlagSource = {
    primary: 'admin-panel',
    fallback: 'localStorage',
    fallbackKey: 'ecbyts-feature-flags',
    expectedEndpoint: '/api/runtime-flags/public',
    managedFlags: ['LAUNCHPAD_V3_HERO', 'LAUNCHPAD_V3_FEED', 'LAUNCHPAD_V3_PANELS', 'LAUNCHPAD_V3_PERSONAS'],
} as const;

export interface IntegrityAdrRequirements {
    readonly path: string;
    readonly mandatorySections: readonly string[];
    readonly minReferences: number;
    readonly minAlternatives: number;
}

export const INTEGRITY_ADR_REQUIREMENTS: IntegrityAdrRequirements = {
    path: 'app/js/core/integrity/ADR.md',
    mandatorySections: [
        '## Context',
        '## Decision',
        '## Formula',
        '## Weights',
        '## Alternatives Considered',
        '## Academic References',
        '## Calibration Protocol',
        '## Publish Gate',
    ],
    minReferences: 8,
    minAlternatives: 3,
} as const;

export const INTEGRITY_REVIEW_PIPELINE = Object.freeze([
    'author-draft',
    'maintainer-review',
    'academic-peer-review',
] as const);

export interface IntegrityPublishGate {
    readonly target: string;
    readonly conditions: readonly string[];
    readonly preFeatureFlag: string;
}

export const INTEGRITY_PUBLISH_GATE: IntegrityPublishGate = Object.freeze({
    target: 'external-publication',
    conditions: Object.freeze(['academic-peer-review-approved', 'field-site-validation-complete']),
    preFeatureFlag: 'LAUNCHPAD_V3_INTEGRITY_AGGREGATE',
} as const);