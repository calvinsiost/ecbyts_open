// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Compliance Preset — Details Modal Content Builder (pure-logic).
 * SPEC_MODEL_BASELINE_COMPLIANCE_PRESET §5.2 + RF20 (modal content).
 * claude - novaspec, 2026-06-05.
 *
 * Constrói a estrutura de conteúdo do modal "Detalhes do Preset" sem tocar
 * DOM. Wire DOM (futuro) consome `DetailsModalContentVM` → renderiza seções
 * + monta botões com data-action.
 *
 * Out of scope:
 *   - HTML rendering (wire DOM consume VM)
 *   - i18n (consome strings provided)
 *   - Network (contentHash, authoritySignature já no preset)
 *
 * Tests: tests/compliance-details-modal-content-pure.test.mjs
 */

import type { CompliancePreset } from './_presetPure.js';

// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------

export interface DetailsModalSection {
    readonly id: string;
    readonly title: string;
    readonly rows: ReadonlyArray<DetailsModalRow>;
}

export interface DetailsModalRow {
    readonly label: string;
    readonly value: string;
    readonly mono?: boolean;
}

export interface DetailsModalAction {
    readonly id: 'change-preset' | 'export-json' | 'view-legal' | 'close';
    readonly label: string;
    readonly variant: 'primary' | 'secondary' | 'danger';
    readonly enabled: boolean;
}

export interface DetailsModalContentVM {
    readonly title: string;
    readonly subtitle: string;
    readonly sections: ReadonlyArray<DetailsModalSection>;
    readonly actions: ReadonlyArray<DetailsModalAction>;
    readonly presetIdForDataAttr: string;
}

export interface DetailsModalInput {
    readonly preset: CompliancePreset;
    readonly i18n: DetailsModalI18n;
    readonly canChangePreset: boolean;
    readonly canExportJson: boolean;
}

export interface DetailsModalI18n {
    readonly titleTemplate: string;
    readonly subtitleTemplate: string;
    readonly sectionIdentity: string;
    readonly sectionLegalBasis: string;
    readonly sectionComponents: string;
    readonly sectionIntegrity: string;
    readonly labelAuthority: string;
    readonly labelJurisdiction: string;
    readonly labelLevel: string;
    readonly labelEffective: string;
    readonly labelGwp: string;
    readonly labelHorizon: string;
    readonly labelEisWeights: string;
    readonly labelContentHash: string;
    readonly labelVersion: string;
    readonly actionChangePreset: string;
    readonly actionExportJson: string;
    readonly actionViewLegal: string;
    readonly actionClose: string;
    readonly effectiveUntil: string;
    readonly effectiveOpenEnded: string;
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

function fmtTemplate(tmpl: string, vars: Record<string, string>): string {
    let out = tmpl;
    for (const [k, v] of Object.entries(vars)) {
        out = out.split('{' + k + '}').join(v);
    }
    return out;
}

function fmtEisWeights(w: CompliancePreset['eisWeights']): string {
    if (!w) return '—';
    return `T=${w.T} A=${w.A} Cp=${w.Cp} Ty=${w.Ty} Cs=${w.Cs} Cm=${w.Cm}`;
}

function fmtEffective(from: string, to: string | undefined, until: string, openEnded: string): string {
    if (!to) return `${from} → ${openEnded}`;
    return `${from} → ${until} ${to}`;
}

function truncateHash(h: string, max = 16): string {
    if (typeof h !== 'string' || h.length <= max) return h || '—';
    return h.slice(0, max) + '…';
}

// ----------------------------------------------------------------
// MAIN
// ----------------------------------------------------------------

export function isValidDetailsModalInput(input: unknown): input is DetailsModalInput {
    if (!isPlainObject(input)) return false;
    const p = input.preset;
    if (!isPlainObject(p)) return false;
    if (typeof (p as Record<string, unknown>).id !== 'string') return false;
    if (typeof (p as Record<string, unknown>).contentHash !== 'string') return false;
    if (!Array.isArray((p as Record<string, unknown>).legalBasis)) return false;
    if (!isPlainObject(input.i18n)) return false;
    return true;
}

export function buildDetailsModalContent(input: DetailsModalInput): DetailsModalContentVM {
    if (!isValidDetailsModalInput(input)) {
        throw new TypeError('buildDetailsModalContent: invalid input');
    }
    const { preset, i18n, canChangePreset, canExportJson } = input;

    const title = fmtTemplate(i18n.titleTemplate, {
        presetId: preset.id,
        authority: preset.publishedBy.authority,
    });
    const subtitle = fmtTemplate(i18n.subtitleTemplate, {
        version: preset.version,
        jurisdiction: preset.publishedBy.jurisdiction,
    });

    const identitySection: DetailsModalSection = {
        id: 'identity',
        title: i18n.sectionIdentity,
        rows: [
            { label: i18n.labelAuthority, value: preset.publishedBy.authority },
            { label: i18n.labelJurisdiction, value: preset.publishedBy.jurisdiction },
            { label: i18n.labelLevel, value: preset.publishedBy.level },
            { label: i18n.labelVersion, value: preset.version, mono: true },
            {
                label: i18n.labelEffective,
                value: fmtEffective(preset.effectiveFrom, preset.effectiveTo, i18n.effectiveUntil, i18n.effectiveOpenEnded),
            },
        ],
    };

    const legalRows: DetailsModalRow[] = preset.legalBasis.map((basis, i) => ({
        label: `[${i + 1}]`,
        value: basis,
    }));
    const legalSection: DetailsModalSection = {
        id: 'legal',
        title: i18n.sectionLegalBasis,
        rows: legalRows,
    };

    const componentRows: DetailsModalRow[] = [];
    if (preset.ghgFactors) {
        componentRows.push({ label: i18n.labelGwp, value: preset.ghgFactors.gwpVersion, mono: true });
        componentRows.push({ label: i18n.labelHorizon, value: `${preset.ghgFactors.timeHorizon}y`, mono: true });
    }
    if (preset.eisWeights) {
        componentRows.push({ label: i18n.labelEisWeights, value: fmtEisWeights(preset.eisWeights), mono: true });
    }
    const componentsSection: DetailsModalSection = {
        id: 'components',
        title: i18n.sectionComponents,
        rows: componentRows,
    };

    const integritySection: DetailsModalSection = {
        id: 'integrity',
        title: i18n.sectionIntegrity,
        rows: [{ label: i18n.labelContentHash, value: truncateHash(preset.contentHash, 16), mono: true }],
    };

    const sections: ReadonlyArray<DetailsModalSection> = Object.freeze([
        identitySection,
        legalSection,
        componentsSection,
        integritySection,
    ]);

    const actions: ReadonlyArray<DetailsModalAction> = Object.freeze([
        {
            id: 'change-preset',
            label: i18n.actionChangePreset,
            variant: 'primary',
            enabled: canChangePreset,
        },
        {
            id: 'export-json',
            label: i18n.actionExportJson,
            variant: 'secondary',
            enabled: canExportJson,
        },
        {
            id: 'view-legal',
            label: i18n.actionViewLegal,
            variant: 'secondary',
            enabled: preset.legalBasis.length > 0,
        },
        {
            id: 'close',
            label: i18n.actionClose,
            variant: 'secondary',
            enabled: true,
        },
    ]);

    return Object.freeze({
        title,
        subtitle,
        sections,
        actions,
        presetIdForDataAttr: preset.id,
    });
}
