// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// RICH-DOC-FULL-001 F4 — mapper pure-logic que combina os 4 extractors
// (metadata + status + lithology + chronology) em IngestionAutoPatch que
// o wizard de ingestão consome para pré-preencher D1–D13.
//
// SPEC: docs/specs/_archived/SPEC_RICH_DOC_FULL_EXTRACTION.md RF-5
//
// PRIOR ART:
//   - _reportMetadataExtractorPure (712df3cd) — L1 identidade
//   - _regulatoryStatusExtractorPure (320b51ef) — F1 status CETESB
//   - _lithologyTextExtractorPure (fc406c27) — F2 litologia
//   - _chronologyExtractorPure (esta cycle) — F3 cronologia

import type { ReportMetadata } from './_reportMetadataExtractorPure.js';
import type { RegulatoryStatus } from './_regulatoryStatusExtractorPure.js';
import type { LithologyExtraction, LithologyLayer } from './_lithologyTextExtractorPure.js';
import type { ChronologyExtraction, CampaignEvent } from './_chronologyExtractorPure.js';

// ===========================================================================
// Tipos
// ===========================================================================

export interface ProvenanceRecord {
    readonly source: string; // 'extract:L1' | 'extract:F1' | etc.
    readonly confidence: number; // 0..1
    readonly pageHint?: number | null;
}

export interface ClientPatch {
    readonly name: string | null;
    readonly cnpj: string | null;
}

export interface AreaPatch {
    readonly city: string | null;
    readonly state: string | null;
    readonly coords: { readonly lat: number; readonly lng: number } | null;
}

export interface DocumentPatch {
    readonly type: string | null;
    readonly reference: string | null;
    readonly issuedAt: string | null;
    readonly revision: string | null;
}

export interface StatusPatch {
    readonly classification: string;
    readonly confidence: number;
    readonly evidenceQuotes: ReadonlyArray<string>;
    readonly decreesQuoted: ReadonlyArray<string>;
}

export interface WellLithologyGroup {
    readonly wellId: string;
    readonly layers: ReadonlyArray<LithologyLayer>;
}

export interface IngestionAutoPatch {
    readonly client: ClientPatch;
    readonly area: AreaPatch;
    readonly document: DocumentPatch;
    readonly status: StatusPatch;
    readonly wellsLithology: ReadonlyArray<WellLithologyGroup>;
    readonly campaigns: ReadonlyArray<CampaignEvent>;
    readonly provenance: Readonly<Record<string, ProvenanceRecord>>;
    readonly autoFilledFieldCount: number;
    readonly warnings: ReadonlyArray<string>;
}

// ===========================================================================
// Helpers
// ===========================================================================

function groupLayersByWell(layers: ReadonlyArray<LithologyLayer>): WellLithologyGroup[] {
    const byWell = new Map<string, LithologyLayer[]>();
    for (const layer of layers) {
        const wellId = layer.wellId || '__unassigned__';
        const bucket = byWell.get(wellId) || [];
        bucket.push(layer);
        byWell.set(wellId, bucket);
    }
    const groups: WellLithologyGroup[] = [];
    for (const [wellId, ls] of byWell) {
        groups.push(
            Object.freeze({
                wellId,
                layers: Object.freeze([...ls].sort((a, b) => a.topDepthM - b.topDepthM)),
            }),
        );
    }
    return groups.sort((a, b) => a.wellId.localeCompare(b.wellId));
}

function countFilledFields(patch: {
    client: ClientPatch;
    area: AreaPatch;
    document: DocumentPatch;
    status: StatusPatch;
    wellsLithology: ReadonlyArray<WellLithologyGroup>;
    campaigns: ReadonlyArray<CampaignEvent>;
}): number {
    let count = 0;
    if (patch.client.name) count++;
    if (patch.client.cnpj) count++;
    if (patch.area.city) count++;
    if (patch.area.state) count++;
    if (patch.area.coords) count++;
    if (patch.document.type) count++;
    if (patch.document.reference) count++;
    if (patch.document.issuedAt) count++;
    if (patch.document.revision) count++;
    if (patch.status.classification !== 'undetermined') count++;
    if (patch.status.decreesQuoted.length > 0) count++;
    if (patch.wellsLithology.length > 0) count++;
    if (patch.campaigns.length > 0) count++;
    return count;
}

// ===========================================================================
// API pública
// ===========================================================================

/**
 * Combina output dos 4 extractors em um IngestionAutoPatch que o wizard
 * de ingestão consome para pré-preencher decisões D1–D13.
 *
 * Provenance é registrado por campo com source + confidence para
 * auditabilidade (governance ADR-A1).
 *
 * Nunca throws. Inputs null/undefined são tratados como vazios.
 */
export function buildIngestionPatch(
    metadata: ReportMetadata | null | undefined,
    status: RegulatoryStatus | null | undefined,
    lithology: LithologyExtraction | null | undefined,
    chronology: ChronologyExtraction | null | undefined,
): IngestionAutoPatch {
    const warnings: string[] = [];
    const provenance: Record<string, ProvenanceRecord> = {};

    // ----- Client (L1) -----
    const client: ClientPatch = Object.freeze({
        name: metadata?.client.name ?? null,
        cnpj: metadata?.client.cnpj ?? null,
    });
    if (client.name) {
        provenance['client.name'] = Object.freeze({
            source: 'extract:L1',
            confidence: metadata?.client.nameConfidence ?? 0.5,
        });
    }
    if (client.cnpj) {
        provenance['client.cnpj'] = Object.freeze({
            source: 'extract:L1',
            confidence: 1.0, // CNPJ regex é determinístico
        });
    }

    // ----- Area (L1) -----
    const area: AreaPatch = Object.freeze({
        city: metadata?.location.city ?? null,
        state: metadata?.location.state ?? null,
        coords:
            metadata &&
            metadata.coordinates.latitude !== null &&
            metadata.coordinates.longitude !== null
                ? Object.freeze({
                      lat: metadata.coordinates.latitude,
                      lng: metadata.coordinates.longitude,
                  })
                : null,
    });
    if (area.city) provenance['area.city'] = Object.freeze({ source: 'extract:L1', confidence: 0.9 });
    if (area.state) provenance['area.state'] = Object.freeze({ source: 'extract:L1', confidence: 0.95 });
    if (area.coords) provenance['area.coords'] = Object.freeze({ source: 'extract:L1', confidence: 0.85 });

    // ----- Document (L1) -----
    const document: DocumentPatch = Object.freeze({
        type: metadata?.document.type ?? null,
        reference: metadata?.document.reference ?? null,
        issuedAt: metadata?.document.issuedAt ?? null,
        revision: metadata?.document.revision ?? null,
    });
    if (document.type) provenance['document.type'] = Object.freeze({ source: 'extract:L1', confidence: 0.85 });
    if (document.reference) provenance['document.reference'] = Object.freeze({ source: 'extract:L1', confidence: 0.95 });
    if (document.issuedAt) provenance['document.issuedAt'] = Object.freeze({ source: 'extract:L1', confidence: 0.9 });
    if (document.revision) provenance['document.revision'] = Object.freeze({ source: 'extract:L1', confidence: 0.95 });

    // ----- Status (F1) -----
    const statusPatch: StatusPatch = Object.freeze({
        classification: status?.classification ?? 'undetermined',
        confidence: status?.confidence ?? 0,
        evidenceQuotes: Object.freeze([...(status?.evidenceQuotes || [])]),
        decreesQuoted: Object.freeze([...(status?.cetesbDecreesQuoted || [])]),
    });
    if (statusPatch.classification !== 'undetermined') {
        provenance['status.classification'] = Object.freeze({
            source: 'extract:F1',
            confidence: statusPatch.confidence,
        });
    }
    if (statusPatch.decreesQuoted.length > 0) {
        provenance['status.decrees'] = Object.freeze({
            source: 'extract:F1',
            confidence: 0.95,
        });
    }

    // ----- Lithology (F2) -----
    const wellsLithology = lithology
        ? Object.freeze(groupLayersByWell(lithology.layers))
        : Object.freeze([] as WellLithologyGroup[]);
    if (wellsLithology.length > 0) {
        provenance['wells.lithology'] = Object.freeze({
            source: 'extract:F2',
            confidence: 0.8, // determinístico mas pode perder camadas
        });
    }

    // ----- Chronology (F3) -----
    const campaigns: ReadonlyArray<CampaignEvent> = Object.freeze([
        ...(chronology?.events || []),
    ]);
    if (campaigns.length > 0) {
        provenance['campaigns'] = Object.freeze({
            source: 'extract:F3',
            confidence: 0.85,
        });
    }

    // ----- Accumular warnings -----
    if (metadata?.extractionWarnings) {
        for (const w of metadata.extractionWarnings) warnings.push(`L1: ${w}`);
    }
    if (status?.warnings) {
        for (const w of status.warnings) warnings.push(`F1: ${w}`);
    }
    if (lithology?.warnings) {
        for (const w of lithology.warnings) warnings.push(`F2: ${w}`);
    }
    if (chronology?.warnings) {
        for (const w of chronology.warnings) warnings.push(`F3: ${w}`);
    }

    const autoFilledFieldCount = countFilledFields({
        client,
        area,
        document,
        status: statusPatch,
        wellsLithology,
        campaigns,
    });

    return Object.freeze({
        client,
        area,
        document,
        status: statusPatch,
        wellsLithology,
        campaigns,
        provenance: Object.freeze(provenance),
        autoFilledFieldCount,
        warnings: Object.freeze(warnings),
    });
}

/** Metadata pública. */
export const EXTRACTION_TO_WIZARD_META = Object.freeze({
    supportedSources: Object.freeze(['extract:L1', 'extract:F1', 'extract:F2', 'extract:F3']),
    fieldGroups: Object.freeze(['client', 'area', 'document', 'status', 'wellsLithology', 'campaigns']),
    maxAutoFilledFields: 13,
});
