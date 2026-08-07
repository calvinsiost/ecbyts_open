// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE TAG COVERAGE REPORT - pure readable Markdown report of
   per-tag coverage across the P&ID -> BIM/IFC -> digital twin bridge
   (PIPELINE-PACK-CUSTOMIZATION-001 #12; SPEC_PIPELINE_PACK_CUSTOMIZATION_
   WORKBENCH.md secao 10.4: "gerar relatorio legivel com as tags
   pendentes e o proximo ajuste esperado").

   For every recognized tag the report shows:
   - status: conceitual / candidato / ligado / falta-bim / falta-twin /
     conflito / obsoleto (the 7 lifecycle statuses of spec 10.4);
   - origem: where the tag identity came from (P&ID element, tag
     registry, ...);
   - evidencia: which link identifiers exist (IfcGlobalId, twin id,
     asset id) or an explicit "no evidence" note;
   - proxima acao esperada: the next expected adjustment for that tag.

   A dedicated "tags pendentes" section lists every tag that is not
   `ligado` nor `obsoleto` together with its next adjustment.

   Status precedence per tag: obsoleto (registry lifecycle) > conflito
   (validator findings or divergent duplicate bridge bindings) > bridge
   status mapping (linked/candidate/missing-ifc/missing-twin/needs-
   review) > conceitual (tag known only by the registry).

   Labels are injectable (i18n via t() with pt-BR fallback defaults).
   No DOM, no storage, no network, no Date.now().
   ================================================================ */

import type { PipelinePidDigitalTwinBinding } from './pipelinePidDiagramBridge.js';
import type { PipelineTagIdentityRegistry } from './_pipelineTagIdentityRegistryPure.js';
import type { PipelineTagValidationFinding } from './_pipelineTagValidatorPure.js';

export type PipelineTagCoverageStatus =
    | 'conceitual'
    | 'candidato'
    | 'ligado'
    | 'falta-bim'
    | 'falta-twin'
    | 'conflito'
    | 'obsoleto';

export const PIPELINE_TAG_COVERAGE_STATUSES: PipelineTagCoverageStatus[] = [
    'conceitual',
    'candidato',
    'ligado',
    'falta-bim',
    'falta-twin',
    'conflito',
    'obsoleto',
];

export interface PipelineTagCoverageReportLabels {
    title: string;
    summaryTitle: string;
    tableTitle: string;
    pendingTitle: string;
    columnTag: string;
    columnStatus: string;
    columnOrigin: string;
    columnEvidence: string;
    columnNextAction: string;
    totalLabel: string;
    pendingCountLabel: string;
    noTags: string;
    noPending: string;
    noEvidence: string;
    statusLabels: Record<PipelineTagCoverageStatus, string>;
    nextActions: Record<PipelineTagCoverageStatus, string>;
}

export interface PipelineTagCoverageReportRow {
    tag: string;
    status: PipelineTagCoverageStatus;
    statusLabel: string;
    origin: string;
    evidence: string;
    nextAction: string;
    pending: boolean;
}

export interface PipelineTagCoverageReportCounts {
    total: number;
    pending: number;
    byStatus: Record<PipelineTagCoverageStatus, number>;
}

export interface PipelineTagCoverageReport {
    processLabel: string;
    rows: PipelineTagCoverageReportRow[];
    pendingRows: PipelineTagCoverageReportRow[];
    counts: PipelineTagCoverageReportCounts;
    markdown: string;
}

export interface PipelineTagCoverageReportInput {
    processLabel?: string;
    bindings?: PipelinePidDigitalTwinBinding[] | null;
    registry?: PipelineTagIdentityRegistry | null;
    validationFindings?: PipelineTagValidationFinding[] | null;
    labels?: Partial<PipelineTagCoverageReportLabels>;
}

export const PIPELINE_TAG_COVERAGE_REPORT_DEFAULT_LABELS: PipelineTagCoverageReportLabels = {
    title: 'Relatorio de cobertura por tag',
    summaryTitle: 'Resumo',
    tableTitle: 'Cobertura por tag',
    pendingTitle: 'Tags pendentes e proximo ajuste',
    columnTag: 'Tag',
    columnStatus: 'Status',
    columnOrigin: 'Origem',
    columnEvidence: 'Evidencia',
    columnNextAction: 'Proxima acao',
    totalLabel: 'Total de tags',
    pendingCountLabel: 'Tags pendentes',
    noTags: 'Nenhuma tag reconhecida neste processo.',
    noPending: 'Nenhuma tag pendente: todas ligadas ou encerradas.',
    noEvidence: 'Sem evidencia de vinculo registrada.',
    statusLabels: {
        conceitual: 'Conceitual',
        candidato: 'Candidato',
        ligado: 'Ligado',
        'falta-bim': 'Falta BIM/IFC',
        'falta-twin': 'Falta digital twin',
        conflito: 'Conflito de tag',
        obsoleto: 'Obsoleto',
    },
    nextActions: {
        conceitual: 'Revisar a tag e definir a identidade minima (BIM/IFC e digital twin).',
        candidato: 'Confirmar a tag candidata e promover o vinculo com BIM/IFC e digital twin.',
        ligado: 'Nenhuma acao: manter as evidencias de vinculo atualizadas.',
        'falta-bim': 'Vincular IfcGlobalId ou identificador do elemento BIM a tag.',
        'falta-twin': 'Vincular digitalTwinId ou twinElementId ao ativo.',
        conflito: 'Escolher a tag canonica e resolver a divergencia entre as fontes.',
        obsoleto: 'Nenhuma acao: tag obsoleta; manter apenas o historico.',
    },
};

function _text(value: unknown): string {
    return String(value ?? '').trim();
}

function _normalizeTag(tag: unknown): string {
    return _text(tag).toUpperCase();
}

/** Merges caller-provided label overrides with the pt-BR defaults. */
function _labels(overrides?: Partial<PipelineTagCoverageReportLabels>): PipelineTagCoverageReportLabels {
    const base = PIPELINE_TAG_COVERAGE_REPORT_DEFAULT_LABELS;
    const safe = overrides && typeof overrides === 'object' ? overrides : {};
    return {
        ...base,
        ...safe,
        statusLabels: { ...base.statusLabels, ...(safe.statusLabels || {}) },
        nextActions: { ...base.nextActions, ...(safe.nextActions || {}) },
    };
}

/** Escapes a value for safe use inside a Markdown table cell. */
function _mdCell(value: unknown): string {
    return _text(value).replaceAll('|', '\\|').replaceAll('\r', ' ').replaceAll('\n', ' ') || '-';
}

/** Maps the technical bridge status to the spec 10.4 lifecycle status. */
function _statusFromBinding(binding: PipelinePidDigitalTwinBinding): PipelineTagCoverageStatus {
    if (binding.status === 'linked') return 'ligado';
    if (binding.status === 'candidate') return 'candidato';
    if (binding.status === 'missing-ifc') return 'falta-bim';
    if (binding.status === 'missing-twin') return 'falta-twin';
    return 'conceitual';
}

/** Builds the origin column from the bridge source reference. */
function _originFromBinding(binding: PipelinePidDigitalTwinBinding): string {
    const ref = binding.sourceRef;
    const element = _text(ref?.sourceElementType);
    const tag = _text(ref?.sourceElementTag);
    if (element && tag) return `P&ID (${element} ${tag})`;
    if (tag) return `P&ID (${tag})`;
    return 'P&ID';
}

/** Builds the evidence column listing every link identifier that exists. */
function _evidenceFromBinding(binding: PipelinePidDigitalTwinBinding, noEvidenceLabel: string): string {
    const parts: string[] = [];
    if (_text(binding.ifcGlobalId)) parts.push(`IfcGlobalId ${binding.ifcGlobalId}`);
    if (_text(binding.ifcElementId)) parts.push(`ifcElementId ${binding.ifcElementId}`);
    if (_text(binding.digitalTwinId)) parts.push(`digitalTwinId ${binding.digitalTwinId}`);
    if (_text(binding.twinElementId)) parts.push(`twinElementId ${binding.twinElementId}`);
    if (_text(binding.assetId)) parts.push(`ativo ${binding.assetId}`);
    else if (_text(binding.assetTag)) parts.push(`ativo ${binding.assetTag}`);
    return parts.length ? parts.join('; ') : noEvidenceLabel;
}

/** Returns true when two bindings of the same tag declare divergent identities. */
function _bindingsDiverge(a: PipelinePidDigitalTwinBinding, b: PipelinePidDigitalTwinBinding): boolean {
    const aIfc = _text(a.ifcGlobalId) || _text(a.ifcElementId);
    const bIfc = _text(b.ifcGlobalId) || _text(b.ifcElementId);
    if (aIfc && bIfc && aIfc !== bIfc) return true;
    const aTwin = _text(a.digitalTwinId) || _text(a.twinElementId);
    const bTwin = _text(b.digitalTwinId) || _text(b.twinElementId);
    if (aTwin && bTwin && aTwin !== bTwin) return true;
    return false;
}

/** Collects the normalized tags touched by conflict-type validator findings. */
function _conflictTagsFromFindings(findings: PipelineTagValidationFinding[] | null | undefined): Set<string> {
    const out = new Set<string>();
    const safe = Array.isArray(findings) ? findings : [];
    for (const finding of safe) {
        if (finding?.type !== 'duplicate-canonical-tag' && finding?.type !== 'source-divergence') continue;
        for (const tag of finding.tags || []) {
            const key = _normalizeTag(tag);
            if (key) out.add(key);
        }
    }
    return out;
}

/** Tags not linked nor obsolete are pending and need a next adjustment. */
function _isPending(status: PipelineTagCoverageStatus): boolean {
    return status !== 'ligado' && status !== 'obsoleto';
}

/**
 * Builds the per-tag coverage report from the bridge bindings, an
 * optional tag identity registry and optional validator findings.
 * Fully deterministic: rows follow first-seen tag order.
 */
export function buildPipelineTagCoverageReport(
    input: PipelineTagCoverageReportInput | null | undefined,
): PipelineTagCoverageReport {
    const safe = input && typeof input === 'object' ? input : {};
    const labels = _labels(safe.labels);
    const bindings = Array.isArray(safe.bindings) ? safe.bindings : [];
    const conflictTags = _conflictTagsFromFindings(safe.validationFindings);
    const registryItems = safe.registry && typeof safe.registry === 'object' ? safe.registry.items || {} : {};

    // Group bridge bindings by normalized tag, preserving first-seen order.
    const groups = new Map<string, PipelinePidDigitalTwinBinding[]>();
    for (const binding of bindings) {
        const key = _normalizeTag(binding?.pidTag) || _normalizeTag(binding?.pidElementId);
        if (!key) continue;
        const bucket = groups.get(key) ?? [];
        bucket.push(binding);
        groups.set(key, bucket);
    }

    const rows: PipelineTagCoverageReportRow[] = [];
    const seen = new Set<string>();

    for (const [key, group] of groups) {
        seen.add(key);
        const first = group[0];
        if (!first) continue;
        const registryItem = registryItems[key];
        let status = _statusFromBinding(first);
        let evidence = _evidenceFromBinding(first, labels.noEvidence);

        if (registryItem?.status === 'obsolete') {
            status = 'obsoleto';
        } else if (conflictTags.has(key) || group.some((other, index) => index > 0 && _bindingsDiverge(first, other))) {
            status = 'conflito';
            const divergent = group
                .map((binding) => _evidenceFromBinding(binding, labels.noEvidence))
                .filter((value, index, list) => list.indexOf(value) === index);
            evidence = divergent.join(' | ');
        }

        rows.push({
            tag: _text(first.pidTag) || key,
            status,
            statusLabel: labels.statusLabels[status],
            origin: _originFromBinding(first),
            evidence,
            nextAction: labels.nextActions[status],
            pending: _isPending(status),
        });
    }

    // Tags known only by the registry (no bridge binding): conceitual/obsoleto.
    for (const [key, item] of Object.entries(registryItems)) {
        if (seen.has(key)) continue;
        const status: PipelineTagCoverageStatus = item?.status === 'obsolete' ? 'obsoleto' : 'conceitual';
        const history = Array.isArray(item?.history) ? item.history : [];
        const lastHistory = history.length ? history[history.length - 1] : undefined;
        const lastHistorySource = _text(lastHistory?.source);
        const origin = lastHistorySource
            ? `Registro de tags (${lastHistorySource})`
            : 'Registro de tags';
        rows.push({
            tag: _text(item?.tag) || key,
            status,
            statusLabel: labels.statusLabels[status],
            origin,
            evidence: labels.noEvidence,
            nextAction: labels.nextActions[status],
            pending: _isPending(status),
        });
    }

    const byStatus = {} as Record<PipelineTagCoverageStatus, number>;
    for (const status of PIPELINE_TAG_COVERAGE_STATUSES) byStatus[status] = 0;
    for (const row of rows) byStatus[row.status] += 1;
    const pendingRows = rows.filter((row) => row.pending);

    const report: PipelineTagCoverageReport = {
        processLabel: _text(safe.processLabel) || 'Processo',
        rows,
        pendingRows,
        counts: { total: rows.length, pending: pendingRows.length, byStatus },
        markdown: '',
    };
    report.markdown = renderPipelineTagCoverageReportMarkdown(report, labels);
    return report;
}

/**
 * Renders the coverage report as readable Markdown: summary counts, a
 * per-tag table (status, origin, evidence, next action) and the pending
 * section with the next expected adjustment per pending tag.
 */
export function renderPipelineTagCoverageReportMarkdown(
    report: PipelineTagCoverageReport,
    labels: PipelineTagCoverageReportLabels = PIPELINE_TAG_COVERAGE_REPORT_DEFAULT_LABELS,
): string {
    const safeLabels = _labels(labels);
    const counts = report.counts;
    const summaryLines = [
        `- ${safeLabels.totalLabel}: ${counts.total}`,
        ...PIPELINE_TAG_COVERAGE_STATUSES.map(
            (status) => `- ${safeLabels.statusLabels[status]}: ${counts.byStatus[status]}`,
        ),
        `- ${safeLabels.pendingCountLabel}: ${counts.pending}`,
    ];

    const tableLines = report.rows.length
        ? [
            `| ${safeLabels.columnTag} | ${safeLabels.columnStatus} | ${safeLabels.columnOrigin} | ${safeLabels.columnEvidence} | ${safeLabels.columnNextAction} |`,
            '| --- | --- | --- | --- | --- |',
            ...report.rows.map(
                (row) =>
                    `| ${_mdCell(row.tag)} | ${_mdCell(row.statusLabel)} | ${_mdCell(row.origin)} | ${_mdCell(row.evidence)} | ${_mdCell(row.nextAction)} |`,
            ),
        ]
        : [safeLabels.noTags];

    const pendingLines = report.pendingRows.length
        ? report.pendingRows.map((row) => `- **${_mdCell(row.tag)}** (${_mdCell(row.statusLabel)}): ${_mdCell(row.nextAction)}`)
        : [safeLabels.noPending];

    return [
        `# ${safeLabels.title}: ${_mdCell(report.processLabel)}`,
        '',
        `## ${safeLabels.summaryTitle}`,
        ...summaryLines,
        '',
        `## ${safeLabels.tableTitle}`,
        ...tableLines,
        '',
        `## ${safeLabels.pendingTitle}`,
        ...pendingLines,
        '',
    ].join('\n');
}
