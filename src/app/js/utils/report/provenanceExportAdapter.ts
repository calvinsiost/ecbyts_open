// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Provenance Export Adapter (F3-wiring slice 2) for SPEC_REPORT_AI_HUMAN_PROVENANCE_MASK.
// Hand-authored R1-safe consumindo provenanceExportMetadata (F3-prep existente).
// Bridges F3-prep ao consumer (pdfExport/docxExport): expõe helpers que
// caller pode invocar sem precisar entender o shape interno do metadata.
//
// Spec NOT:
// - NÃO reimplementar buildExportMetadata (delega F3-prep)
// - NÃO modificar pdfExport/docxExport (caller bind)
// - NÃO emoji em strings
// - NÃO expor prompt bruto (delega filtros)

import {
    buildExportMetadata,
    toPdfXmpMetadata,
    toDocxCustomProperties,
    PROVENANCE_EXPORT_PRESETS,
    EXPORT_METADATA_SCHEMA_VERSION,
} from './provenanceExportMetadata.js';

export interface ReportAdapterInput {
    provenanceStore: any;
    preset?: string;
    stripPrompt?: boolean;
}

/**
 * Resolve preset by name with fallback to first available.
 */
export function resolveExportPreset(presetName?: string): string {
    if (typeof presetName === 'string' && (PROVENANCE_EXPORT_PRESETS as any)?.[presetName]) {
        return presetName;
    }
    const keys = Object.keys(PROVENANCE_EXPORT_PRESETS || {});
    return keys[0] || 'default';
}

/**
 * Builds export metadata + retorna XMP string ready para pdfExport injetar.
 */
export function buildPdfXmpForReport(
    input: ReportAdapterInput,
): { xmp: string; schemaVersion: string; presetUsed: string } | null {
    if (!input?.provenanceStore) return null;
    try {
        const preset = resolveExportPreset(input.preset);
        const payload = buildExportMetadata(input.provenanceStore, {
            preset,
            stripPrompt: input.stripPrompt !== false,
        });
        const xmp = toPdfXmpMetadata(payload);
        return {
            xmp,
            schemaVersion: EXPORT_METADATA_SCHEMA_VERSION,
            presetUsed: preset,
        };
    } catch (e: any) {
        console.debug('[provenanceExportAdapter:pdf]', e?.message || e);
        return null;
    }
}

/**
 * Builds export metadata + retorna DOCX custom properties array.
 */
export function buildDocxPropsForReport(
    input: ReportAdapterInput,
): { properties: Array<any>; schemaVersion: string; presetUsed: string } | null {
    if (!input?.provenanceStore) return null;
    try {
        const preset = resolveExportPreset(input.preset);
        const payload = buildExportMetadata(input.provenanceStore, {
            preset,
            stripPrompt: input.stripPrompt !== false,
        });
        const properties = toDocxCustomProperties(payload);
        return {
            properties,
            schemaVersion: EXPORT_METADATA_SCHEMA_VERSION,
            presetUsed: preset,
        };
    } catch (e: any) {
        console.debug('[provenanceExportAdapter:docx]', e?.message || e);
        return null;
    }
}

/**
 * Lista presets disponíveis para UI picker.
 */
export function listExportPresets(): Array<{ id: string; labelKey: string }> {
    const keys = Object.keys(PROVENANCE_EXPORT_PRESETS || {});
    return keys.map((id) => ({
        id,
        labelKey: `report.provenance.preset.${id}`,
    }));
}

/**
 * Inject metadata em jsPDF doc instance.
 */
export function applyPdfMetadata(pdfDoc: any, input: ReportAdapterInput): boolean {
    const result = buildPdfXmpForReport(input);
    if (!result || !pdfDoc) return false;
    try {
        // jsPDF API: setProperties para PDF info dictionary
        if (typeof pdfDoc.setProperties === 'function') {
            pdfDoc.setProperties({
                creator: 'ecbyts',
                producer: `ecbyts/${result.schemaVersion}`,
                keywords: `provenance:${result.presetUsed}`,
            });
        }
        // XMP metadata via addMetadata se disponível
        if (typeof pdfDoc.addMetadata === 'function') {
            pdfDoc.addMetadata(result.xmp, 'application/xml');
        }
        return true;
    } catch (e: any) {
        console.debug('[provenanceExportAdapter:applyPdf]', e?.message || e);
        return false;
    }
}
