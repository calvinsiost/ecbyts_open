// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Provenance Export Metadata — F3-prep pure-logic
// (SPEC_REPORT_AI_HUMAN_PROVENANCE_MASK)
//
// Constrói o payload de metadados machine-readable a ser embutido em
// exports PDF/DOCX (consumer F3 = pdfExport.js/docxExport.js). CONSOME
// `toDisclosureMetadata` do motor (F1) — NÃO recalcula authorship/AI
// system. Apenas estrutura no formato adequado para cada container.
//
// Princípios herdados:
// - Privacy-aware: stripPrompt default true (NUNCA expõe prompt bruto).
// - Append-only: metadados embutidos no export são snapshot, não
//   editáveis pós-fato (audit trail preserved no store original).
// - Standards-aligned: shape compatível com C2PA assertion + IPTC
//   AI Indicator + EU AI Act Art. 50 (machine-readable disclosure).

import { toDisclosureMetadata } from './provenanceModel.js';

/** Versão do schema de export (bump quando shape mudar). */
const EXPORT_SCHEMA_VERSION = '1.0';

/** Presets de export reconhecidos. */
const EXPORT_PRESETS = Object.freeze({
    REVIEW: 'review', // máscara visual ON, max disclosure
    DELIVERY: 'delivery', // máscara visual OFF (corpo), metadata Art. 50 preservada
});

/**
 * Constrói o payload base de metadata p/ embutir em qualquer container
 * de export. Independente de formato — quem consome converte para PDF
 * XMP, DOCX customProperties, etc.
 *
 * Shape:
 * ```
 * {
 *   schemaVersion: '1.0',
 *   generatedAt: <ISO string ou null>,
 *   preset: 'review' | 'delivery',
 *   aiDisclosure: {
 *     present: boolean,           // alguma região com authorship ai/mixed
 *     systems: [{name, version}], // sistemas únicos (dedup)
 *     regionCount: { ai, human, mixed },
 *   },
 *   regions: [{id, authorship, aiSystem, aiVersion}],  // strip-prompt
 *   compliance: {
 *     euAiActArt50: boolean,      // true se disclosure embutida
 *     c2paAligned: true,          // shape C2PA-compatible
 *     iptcAiIndicator: boolean,   // presença flag IPTC
 *   },
 * }
 * ```
 *
 * @param {{regions: Object}} provenanceStore Output de createProvenanceStore.
 * @param {{preset?: 'review'|'delivery', now?: number|string, stripPrompt?: boolean}} [opts]
 * @returns {Object} Payload de export.
 */
export function buildExportMetadata(provenanceStore: any, opts: any) {
    if (!provenanceStore || typeof provenanceStore !== 'object' || !provenanceStore.regions) {
        throw new TypeError('buildExportMetadata: provenanceStore must be object with regions');
    }
    const o = opts || {};
    const preset = o.preset || EXPORT_PRESETS.DELIVERY;
    if (!Object.values(EXPORT_PRESETS).includes(preset)) {
        throw new TypeError(`buildExportMetadata: preset must be one of ${Object.values(EXPORT_PRESETS).join(', ')}`);
    }
    const stripPrompt = o.stripPrompt === undefined ? true : Boolean(o.stripPrompt);
    const disclosure = toDisclosureMetadata(provenanceStore, { stripPrompt });
    const regions = Array.isArray(disclosure.regions) ? disclosure.regions : [];

    // Dedup systems via name+version key (ordem estável).
    const seenKey = new Set();
    const systems = [];
    let aiCount = 0;
    let humanCount = 0;
    let mixedCount = 0;
    for (const r of regions) {
        if (r.authorship === 'ai') aiCount++;
        else if (r.authorship === 'mixed') mixedCount++;
        else humanCount++;
        if (r.aiSystem) {
            const key = `${r.aiSystem}|${r.aiVersion || ''}`;
            if (!seenKey.has(key)) {
                seenKey.add(key);
                systems.push({ name: String(r.aiSystem), version: r.aiVersion != null ? String(r.aiVersion) : null });
            }
        }
    }

    const aiPresent = aiCount > 0 || mixedCount > 0;
    const generatedAt = resolveTimestamp(o.now);

    return {
        schemaVersion: EXPORT_SCHEMA_VERSION,
        generatedAt,
        preset,
        aiDisclosure: {
            present: aiPresent,
            systems,
            regionCount: { ai: aiCount, human: humanCount, mixed: mixedCount },
        },
        regions: regions.map((r: any) => ({
            id: r.id,
            authorship: r.authorship,
            aiSystem: r.aiSystem != null ? String(r.aiSystem) : null,
            aiVersion: r.aiVersion != null ? String(r.aiVersion) : null,
        })),
        compliance: {
            euAiActArt50: aiPresent, // disclosure embutida quando há IA substantiva
            c2paAligned: true, // shape contém assertions per-region (C2PA spec)
            iptcAiIndicator: aiPresent, // mesma flag base
        },
    };
}

/**
 * Converte payload base p/ PDF XMP namespace. PDF embute via XMP
 * (Adobe XML metadata) — strings simples por chave.
 *
 * @param {Object} payload Output de buildExportMetadata.
 * @returns {Record<string,string>} Map plano `XMPNamespace:Key → value`.
 */
export function toPdfXmpMetadata(payload: any) {
    if (!payload || typeof payload !== 'object') {
        throw new TypeError('toPdfXmpMetadata: payload required');
    }
    const xmp: any = {};
    xmp['ecbyts:Schema'] = String(payload.schemaVersion || '');
    xmp['ecbyts:GeneratedAt'] = String(payload.generatedAt || '');
    xmp['ecbyts:Preset'] = String(payload.preset || '');
    const ai = payload.aiDisclosure || {};
    xmp['ecbyts:AIDisclosurePresent'] = ai.present ? 'true' : 'false';
    xmp['ecbyts:AISystemUsed'] = (ai.systems || []).map((s: any) => s.name).join(',');
    xmp['ecbyts:AISystemVersionUsed'] = (ai.systems || []).map((s: any) => s.version || '').join(',');
    const rc = ai.regionCount || {};
    xmp['ecbyts:RegionCountAI'] = String(rc.ai || 0);
    xmp['ecbyts:RegionCountHuman'] = String(rc.human || 0);
    xmp['ecbyts:RegionCountMixed'] = String(rc.mixed || 0);
    const c = payload.compliance || {};
    xmp['ecbyts:EuAiActArt50'] = c.euAiActArt50 ? 'true' : 'false';
    xmp['ecbyts:IPTCAiIndicator'] = c.iptcAiIndicator ? 'true' : 'false';
    // Regiões como JSON serializado (não-bruto, sem prompt).
    xmp['ecbyts:Regions'] = JSON.stringify(payload.regions || []);
    return xmp;
}

/**
 * Converte payload base p/ DOCX custom properties. DOCX core/custom
 * properties são pares key/value tipados (string/bool/int).
 *
 * @param {Object} payload Output de buildExportMetadata.
 * @returns {Array<{name:string, value:string|number|boolean, type:string}>}
 */
export function toDocxCustomProperties(payload: any) {
    if (!payload || typeof payload !== 'object') {
        throw new TypeError('toDocxCustomProperties: payload required');
    }
    const props = [];
    props.push({ name: 'EcbytsSchema', value: String(payload.schemaVersion || ''), type: 'lpwstr' });
    props.push({ name: 'EcbytsGeneratedAt', value: String(payload.generatedAt || ''), type: 'lpwstr' });
    props.push({ name: 'EcbytsPreset', value: String(payload.preset || ''), type: 'lpwstr' });
    const ai = payload.aiDisclosure || {};
    props.push({ name: 'EcbytsAIDisclosurePresent', value: Boolean(ai.present), type: 'bool' });
    props.push({ name: 'EcbytsAISystemUsed', value: (ai.systems || []).map((s: any) => s.name).join(','), type: 'lpwstr' });
    const rc = ai.regionCount || {};
    props.push({ name: 'EcbytsRegionCountAI', value: Number(rc.ai || 0), type: 'i4' });
    props.push({ name: 'EcbytsRegionCountHuman', value: Number(rc.human || 0), type: 'i4' });
    props.push({ name: 'EcbytsRegionCountMixed', value: Number(rc.mixed || 0), type: 'i4' });
    const c = payload.compliance || {};
    props.push({ name: 'EcbytsEuAiActArt50', value: Boolean(c.euAiActArt50), type: 'bool' });
    props.push({ name: 'EcbytsRegions', value: JSON.stringify(payload.regions || []), type: 'lpwstr' });
    return props;
}

/**
 * Resolve timestamp em ISO string. Aceita number (epoch ms), string
 * (passthrough), Date, ou undefined (usa Date.now()).
 *
 * @param {number|string|Date|undefined} now
 * @returns {string|null}
 */
function resolveTimestamp(now: any) {
    if (now == null) return new Date().toISOString();
    if (typeof now === 'string') return now;
    if (typeof now === 'number') {
        if (!Number.isFinite(now)) return null;
        return new Date(now).toISOString();
    }
    if (now instanceof Date) return now.toISOString();
    return null;
}

/** Constantes públicas. */
export const EXPORT_METADATA_SCHEMA_VERSION = EXPORT_SCHEMA_VERSION;
export const PROVENANCE_EXPORT_PRESETS = EXPORT_PRESETS;
