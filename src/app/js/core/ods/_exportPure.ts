// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ODS profile export — pure logic (F7 of SPEC_ODS_IMPACT_RISK; markdown
 * section + rodapé normativo added for RF-5 of SPEC_ODS_IMPACT_PARAMS).
 *
 * Serialises a per-ODS results dict + aggregate VM into an audit-grade
 * artifact. Three output formats:
 *
 *   - JSON: human-readable, full provenance, single object suitable for
 *     `application/json` Storage uploads or report attachments.
 *   - CSV: 1 row per ODS, fixed columns, RFC 4180 + UTF-8 BOM (Excel
 *     pt-BR compat — same pattern as `core/helpers/csvExport`).
 *   - Markdown/text: 1 section per ODS (código oficial + redação ONU +
 *     tier + valor + proveniência) plus a fixed normative footer, for
 *     compliance/ESG reports (RF-5 of SPEC_ODS_IMPACT_PARAMS).
 *
 * RF-5 scope note (verified against code before implementing): the
 * techNote for this micro-activity references `OdsImpactResult` (RF-2,
 * `core/ods/_odsImpactPure.ts`) and ODS stamps (RF-6, `core/ods/_odsStampPure.ts`).
 * Neither exists in the repo yet (RF-1/RF-2/RF-6 are separate, still-pending
 * micro-activities of ODS-IMPACT-PARAMS-001) — confirmed via grep before
 * writing this section. The markdown export below therefore consumes the
 * data that IS available today: the existing `_registryPure` catalog
 * (`officialIndicator` per ODS, one code — the multi-indicator registry is
 * RF-1) and the same per-ODS `{ impact, risk, tier }` results already
 * accepted by `exportOdsProfileJson`/`exportOdsProfileCsv`. When RF-1/RF-2/RF-6
 * land, this section should be extended to cite the full indicator code +
 * verbatim UN wording + stamp trail; until then it degrades honestly (no
 * fabricated multi-indicator detail).
 *
 * Anti-requirements honoured (SPEC §2 of SPEC_ODS_IMPACT_RISK, N3 of the
 * same + RF-5 of SPEC_ODS_IMPACT_PARAMS):
 *   - N1 no fabricated data: missing per-ODS field surfaces as null in JSON,
 *     as empty in CSV, and as "não mensurável aqui" / em branco no markdown;
 *     we never invent a value.
 *   - N3 the report is not a certification — fixed normative footer says so.
 *   - N4 non-compensatory: the aggregate row preserves the geometric ODS-EIS
 *     score from F6 instead of recomputing with a different formula.
 *   - N5 reuse only: imports = `_registryPure` + `_aggregatePure` types only.
 *
 * Tests live in `tests/ods-export-pure.test.mjs`.
 */

import { ODS_REGISTRY, type OdsEntry, type OdsTier } from './_registryPure.js';
import type { OdsAggregateVM } from './_aggregatePure.js';

export interface OdsExportInput {
    /** Per-ODS measurer results keyed by id (1..17). */
    readonly results: Readonly<Record<number, {
        impact: number | null;
        risk: number | null;
        tier: OdsTier;
    }>>;
    /** Aggregate VM from `aggregateOdsProfile` (F6). */
    readonly aggregate: OdsAggregateVM;
    /** ISO timestamp when the export was generated. */
    readonly generatedAt: string;
    /** Optional project identifier for the audit trail. */
    readonly projectId?: string;
    /** Optional ecbyts app version. */
    readonly appVersion?: string;
}

export interface OdsJsonExport {
    readonly version: 1;
    readonly kind: 'ods-profile';
    readonly generatedAt: string;
    readonly projectId: string | null;
    readonly appVersion: string | null;
    readonly aggregate: {
        readonly odsEisImpact: number | null;
        readonly odsEisRisk: number | null;
        readonly coverageCount: number;
        readonly weakest: { id: number; impact: number } | null;
        readonly strongest: { id: number; impact: number } | null;
    };
    readonly perOds: ReadonlyArray<{
        readonly id: number;
        readonly slug: string;
        readonly label_pt: string;
        readonly label_en: string;
        readonly officialIndicator: string | null;
        readonly tier: OdsTier;
        readonly impact: number | null;
        readonly risk: number | null;
        readonly modules: ReadonlyArray<string>;
        readonly bases: ReadonlyArray<string>;
    }>;
}

const CSV_HEADER = [
    'ods_id',
    'slug',
    'label_pt',
    'label_en',
    'official_indicator',
    'tier',
    'impact',
    'risk',
    'modules',
    'bases',
];

function fmtNum(value: number | null | undefined): string {
    if (value === null || value === undefined) return '';
    if (!Number.isFinite(value)) return '';
    return value.toFixed(6);
}

function csvEscape(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '';
    const s = String(value);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

/**
 * Build the JSON export VM. Deterministic + frozen — same input always
 * produces the byte-identical object.
 */
export function exportOdsProfileJson(input: OdsExportInput): OdsJsonExport {
    if (!input || !input.aggregate || typeof input.aggregate !== 'object') {
        throw new TypeError('exportOdsProfileJson: aggregate VM required');
    }
    const results = input.results || {};
    const perOds: OdsJsonExport['perOds'] = ODS_REGISTRY.map((entry: OdsEntry) => {
        const r = results[entry.id];
        return Object.freeze({
            id: entry.id,
            slug: entry.slug,
            label_pt: entry.label_pt,
            label_en: entry.label_en,
            officialIndicator: entry.officialIndicator,
            tier: r?.tier ?? entry.tier,
            impact: r && Number.isFinite(r.impact) ? r.impact : null,
            risk: r && Number.isFinite(r.risk) ? r.risk : null,
            modules: entry.modules,
            bases: entry.bases,
        });
    });

    const aggOut = {
        odsEisImpact: input.aggregate.odsEisImpact,
        odsEisRisk: input.aggregate.odsEisRisk,
        coverageCount: input.aggregate.coverageCount,
        weakest: input.aggregate.weakest ? Object.freeze({ ...input.aggregate.weakest }) : null,
        strongest: input.aggregate.strongest ? Object.freeze({ ...input.aggregate.strongest }) : null,
    };

    const out: OdsJsonExport = {
        version: 1,
        kind: 'ods-profile',
        generatedAt: input.generatedAt,
        projectId: input.projectId ?? null,
        appVersion: input.appVersion ?? null,
        aggregate: Object.freeze(aggOut),
        perOds: Object.freeze(perOds),
    };
    return Object.freeze(out);
}

/**
 * Build the CSV export — RFC 4180 + UTF-8 BOM. 17 rows + 1 header + 1
 * aggregate footer row. Caller is responsible for downloading or storing.
 */
export function exportOdsProfileCsv(input: OdsExportInput): string {
    const json = exportOdsProfileJson(input);
    const rows: string[] = [];
    rows.push(CSV_HEADER.join(','));
    for (const r of json.perOds) {
        rows.push([
            r.id,
            csvEscape(r.slug),
            csvEscape(r.label_pt),
            csvEscape(r.label_en),
            csvEscape(r.officialIndicator),
            r.tier,
            fmtNum(r.impact),
            fmtNum(r.risk),
            csvEscape(r.modules.join(';')),
            csvEscape(r.bases.join(';')),
        ].join(','));
    }
    // Aggregate footer (id=0 = placeholder, slug='__aggregate__')
    rows.push([
        0,
        '__aggregate__',
        'ODS-EIS (geometric, non-compensatory)',
        'ODS-EIS (geometric, non-compensatory)',
        '',
        '',
        fmtNum(json.aggregate.odsEisImpact),
        fmtNum(json.aggregate.odsEisRisk),
        '',
        '',
    ].join(','));
    return '﻿' + rows.join('\r\n') + '\r\n';
}

/** Suggested filename `ods-profile-YYYY-MM-DD.{ext}`. */
export function buildExportFilename(generatedAt: string, ext: 'json' | 'csv' | 'md'): string {
    let date = '2026-01-01';
    if (typeof generatedAt === 'string') {
        const m = /^\d{4}-\d{2}-\d{2}/.exec(generatedAt);
        if (m) date = m[0];
    }
    return `ods-profile-${date}.${ext}`;
}

/**
 * Fixed normative footer (RF-5 of SPEC_ODS_IMPACT_PARAMS): cites the UN
 * Global Indicator Framework source doc and the anti-certification
 * disclaimer (N3 of SPEC_ODS_IMPACT_RISK). Text is fixed/versioned — never
 * user-editable (same principle as CFG-24/CFG-32, NOT N9).
 */
export const ODS_EXPORT_FOOTER =
    'Indicadores conforme Global Indicator Framework (refinamento 2026, E/CN.3/2026/12); ' +
    'este relatório não constitui certificação.';

function tierProvenanceLabel(tier: OdsTier): string {
    switch (tier) {
        case 'T1':
            return 'measured (medido — base aberta + motor determinístico)';
        case 'T2':
            return 'estimated (estimado — dado de campo/modelo)';
        case 'T3':
            return 'claimed (proxy/qualitativo — sem lastro de medição)';
        case 'T0':
        default:
            return 'absent (não mensurável aqui)';
    }
}

/**
 * Build the markdown/plain-text export (RF-5 of SPEC_ODS_IMPACT_PARAMS).
 *
 * One section per ODS: código oficial (from `_registryPure`), redação ONU
 * (label_en, verbatim from the registry), tier + explicit provenance label,
 * impact/risk value (or explicit "não mensurável aqui" when null — N1, never
 * fabricated), and contributing modules/bases. Closes with the aggregate
 * ODS-EIS summary and the fixed normative footer (RF-5, N3).
 *
 * Pure text formatting — no I/O, no DOM. Deterministic: same input always
 * produces the byte-identical string (verified by snapshot tests).
 */
export function exportOdsProfileMarkdown(input: OdsExportInput): string {
    const json = exportOdsProfileJson(input);
    const lines: string[] = [];

    lines.push('# Relatório de Impacto por ODS (Objetivos de Desenvolvimento Sustentável)');
    lines.push('');
    lines.push(`Gerado em: ${json.generatedAt}`);
    if (json.projectId) lines.push(`Projeto: ${json.projectId}`);
    if (json.appVersion) lines.push(`Versão ecbyts: ${json.appVersion}`);
    lines.push('');

    for (const r of json.perOds) {
        lines.push(`## ODS ${r.id} — ${r.label_pt} (${r.label_en})`);
        lines.push('');
        lines.push(`- Código oficial (UN indicator): ${r.officialIndicator ?? 'não mensurável aqui'}`);
        lines.push(`- Tier / proveniência: ${tierProvenanceLabel(r.tier)}`);
        lines.push(`- Impacto: ${r.impact === null ? 'não mensurável aqui' : r.impact.toFixed(6)}`);
        lines.push(`- Risco: ${r.risk === null ? 'não mensurável aqui' : r.risk.toFixed(6)}`);
        lines.push(`- Módulos ecbyts: ${r.modules.length > 0 ? r.modules.join(', ') : 'não mensurável aqui'}`);
        lines.push(`- Bases de dados: ${r.bases.length > 0 ? r.bases.join(', ') : 'não mensurável aqui'}`);
        lines.push('');
    }

    lines.push('## Agregado ODS-EIS (não-compensatório)');
    lines.push('');
    lines.push(
        `- Impacto agregado: ${
            json.aggregate.odsEisImpact === null ? 'não mensurável aqui' : json.aggregate.odsEisImpact.toFixed(6)
        }`,
    );
    lines.push(
        `- Risco agregado: ${
            json.aggregate.odsEisRisk === null ? 'não mensurável aqui' : json.aggregate.odsEisRisk.toFixed(6)
        }`,
    );
    lines.push(`- ODS com cobertura: ${json.aggregate.coverageCount}`);
    lines.push(
        `- ODS mais fraco: ${
            json.aggregate.weakest ? `ODS ${json.aggregate.weakest.id} (${json.aggregate.weakest.impact.toFixed(6)})` : 'não mensurável aqui'
        }`,
    );
    lines.push(
        `- ODS mais forte: ${
            json.aggregate.strongest ? `ODS ${json.aggregate.strongest.id} (${json.aggregate.strongest.impact.toFixed(6)})` : 'não mensurável aqui'
        }`,
    );
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(ODS_EXPORT_FOOTER);
    lines.push('');

    return lines.join('\n');
}
