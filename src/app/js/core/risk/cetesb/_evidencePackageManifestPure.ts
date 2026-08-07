// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * CETESB Risk — Evidence Package Manifest Builder — pure logic (RF-2.2
 * of SPEC_CETESB_RISK_ASSESSMENT).
 *
 * Builds the canonical list of attachments that must accompany a CETESB
 * DD 038/2017 IC report when the model has computed CMA via the official
 * CETESB Risk Planilhas.
 *
 * Pure: caller passes the model's RA completion summary + report mode;
 * module returns a frozen manifest of REQUIRED + OPTIONAL attachments.
 * Caller is responsible for actually fetching/embedding the files
 * (via PhotoLog / Files manager / Storage).
 *
 * 4 canonical .xlsm + 1 PDF Manual = 5 official CETESB artifacts.
 * Variable count of optional metadata depending on which scenarios
 * were computed.
 *
 * Tests live in `tests/cetesb-evidence-package-manifest-pure.test.mjs`.
 */

export type ReportEvidenceMode = 'strict' | 'standard' | 'draft';

export interface ManifestInput {
    /** Reporting strictness; strict = DD 038/2017 IC formal submission. */
    readonly mode: ReportEvidenceMode;
    /** Scenarios that have CMA computed (subset of canonical 4). */
    readonly scenariosComputed: ReadonlyArray<
        'RES_URB' | 'RES_RUR' | 'TRAB_COM_IND' | 'TRAB_OBRA_CIV'
    >;
    /** Optional flag — true when user wants the Manual PDF embedded. */
    readonly includeManualPdf?: boolean;
}

export interface ManifestAttachment {
    readonly slot: string;
    readonly filename: string;
    readonly category: 'planilha' | 'manual' | 'metadata';
    readonly required: boolean;
    readonly reason: string;
}

export interface ManifestVM {
    readonly mode: ReportEvidenceMode;
    readonly attachments: ReadonlyArray<ManifestAttachment>;
    readonly requiredCount: number;
    readonly optionalCount: number;
    /** True when manifest is complete (all required satisfied by scenariosComputed). */
    readonly complete: boolean;
    readonly missingRequiredSlots: ReadonlyArray<string>;
}

const PLANILHAS: ReadonlyArray<{
    readonly slot: string;
    readonly filename: string;
    readonly scenario: 'RES_URB' | 'RES_RUR' | 'TRAB_COM_IND' | 'TRAB_OBRA_CIV';
}> = Object.freeze([
    {
        slot: 'planilha_res_urb',
        filename: 'CETESBRisk-v4.00–ResUrb-Abr2026-blk.xlsm',
        scenario: 'RES_URB',
    },
    {
        slot: 'planilha_res_rural',
        filename: 'CETESBRisk-v4.00–ResRural-Abr2026-blk.xlsm',
        scenario: 'RES_RUR',
    },
    {
        slot: 'planilha_trab_com_ind',
        filename: 'CETESBRisk-v4.00–TrabComInd-Abr2026-blk.xlsm',
        scenario: 'TRAB_COM_IND',
    },
    {
        slot: 'planilha_trab_obra_civ',
        filename: 'CETESBRisk-v4.00–TrabObraCiv-Abr2026-blk.xlsm',
        scenario: 'TRAB_OBRA_CIV',
    },
]);

const MANUAL_FILE = '6ed57c1c-aa65-411b-865d-c8afb61a45aa.pdf';

function freezeAttachment(a: ManifestAttachment): ManifestAttachment {
    return Object.freeze({ ...a });
}

/**
 * Build the evidence manifest for a CETESB RA report.
 *
 * Rules:
 *   - mode === 'strict' → every planilha for which CMA was computed is
 *     REQUIRED + Manual PDF REQUIRED (DD 038/2017 IC formal).
 *   - mode === 'standard' → planilhas computed are REQUIRED, Manual optional.
 *   - mode === 'draft' → all attachments OPTIONAL (preview / WIP).
 */
export function buildEvidenceManifest(input: ManifestInput | null | undefined): ManifestVM {
    if (!input || typeof input !== 'object') {
        return Object.freeze({
            mode: 'draft' as const,
            attachments: Object.freeze([] as ManifestAttachment[]),
            requiredCount: 0,
            optionalCount: 0,
            complete: true,
            missingRequiredSlots: Object.freeze([]),
        });
    }
    const mode: ReportEvidenceMode =
        input.mode === 'strict' || input.mode === 'standard' || input.mode === 'draft'
            ? input.mode
            : 'draft';
    const scenarios = new Set(
        Array.isArray(input.scenariosComputed) ? input.scenariosComputed.filter(Boolean) : [],
    );

    const attachments: ManifestAttachment[] = [];

    for (const p of PLANILHAS) {
        const isComputed = scenarios.has(p.scenario);
        if (!isComputed && mode !== 'strict') continue;
        const requiredFlag = mode === 'strict' || (mode === 'standard' && isComputed);
        attachments.push(
            freezeAttachment({
                slot: p.slot,
                filename: p.filename,
                category: 'planilha',
                required: requiredFlag,
                reason: isComputed
                    ? `Planilha oficial CETESB do cenário ${p.scenario} (CMA computada)`
                    : `Planilha oficial CETESB do cenário ${p.scenario} (referência regulatória)`,
            }),
        );
    }

    // Manual PDF
    const wantManual = input.includeManualPdf === true || mode === 'strict';
    if (wantManual) {
        attachments.push(
            freezeAttachment({
                slot: 'manual_pdf',
                filename: MANUAL_FILE,
                category: 'manual',
                required: mode === 'strict',
                reason:
                    mode === 'strict'
                        ? 'Manual do Usuário CETESB v4.00 — anexação formal DD 038/2017 IC'
                        : 'Manual do Usuário CETESB (referência opcional)',
            }),
        );
    }

    // Metadata attachment — always optional + auto-generated
    if (mode !== 'draft' && scenarios.size > 0) {
        attachments.push(
            freezeAttachment({
                slot: 'metadata_json',
                filename: 'risk-assessment-metadata.json',
                category: 'metadata',
                required: false,
                reason: 'Metadata JSON dos cenários computados (hash + timestamps)',
            }),
        );
    }

    const requiredAttachments = attachments.filter((a) => a.required);
    const requiredCount = requiredAttachments.length;
    const optionalCount = attachments.length - requiredCount;
    const missing: string[] = [];
    if (mode === 'strict') {
        for (const p of PLANILHAS) {
            if (!scenarios.has(p.scenario)) missing.push(p.slot);
        }
    }
    const complete = missing.length === 0;
    return Object.freeze({
        mode,
        attachments: Object.freeze(attachments),
        requiredCount,
        optionalCount,
        complete,
        missingRequiredSlots: Object.freeze(missing),
    });
}

/**
 * Convenience — returns just the slot ids of REQUIRED attachments for a
 * given manifest VM (caller uses as checklist for upload UI).
 */
export function listRequiredSlots(vm: ManifestVM | null | undefined): ReadonlyArray<string> {
    if (!vm || !Array.isArray(vm.attachments)) return Object.freeze([]);
    return Object.freeze(vm.attachments.filter((a) => a.required).map((a) => a.slot));
}
