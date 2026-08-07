// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PIPELINE PROVENANCE - pure item-level traceability (PIPELINE-PACK-
   CUSTOMIZATION-001 #43).

   "Falta rastreabilidade/auditoria por item" (SPEC_PIPELINE_PACK_
   CUSTOMIZATION_WORKBENCH.md, secao 10.0): cada atividade, conector, gate
   ou dado do Pipeline Pack precisa mostrar origem, documento/pagina,
   evidencia, responsavel, versao e motivo de alteracao. Um item publicado
   sem origem/evidencia/responsavel vira pendencia - nunca aprovado
   silenciosamente.

   Pure: sem DOM, sem storage, sem clock. Testavel via node:test.
   ================================================================ */

/** Tipo de item do Pipeline Pack coberto por proveniencia (matriz 10.0). */
export type ProvenanceItemKind = 'activity' | 'connector' | 'gate' | 'data';

/** Ciclo de vida do item: rascunho nao bloqueia, publicado exige proveniencia. */
export type ProvenanceItemStatus = 'draft' | 'published';

/**
 * Metadados de proveniencia por item: origem, documento/pagina, evidencia,
 * responsavel, versao e motivo de alteracao (spec 10.0 / 10.11).
 */
export interface ProvenanceMetadata {
    origin?: string;
    document?: string;
    page?: string;
    evidence?: string;
    responsible?: string;
    version?: string;
    reason?: string;
}

/** Item generico do Pipeline Pack (atividade, conector, gate ou dado). */
export interface ProvenanceItem {
    id: string;
    kind: ProvenanceItemKind;
    label?: string;
    status?: ProvenanceItemStatus;
    provenance?: ProvenanceMetadata;
}

export type ProvenanceIssueCode =
    | 'missing-origin'
    | 'missing-evidence'
    | 'missing-responsible'
    | 'missing-version';

export type ProvenanceIssueSeverity = 'error' | 'warning';

export interface ProvenanceIssue {
    code: ProvenanceIssueCode;
    severity: ProvenanceIssueSeverity;
    field: keyof ProvenanceMetadata;
    message: string;
}

/** Resultado da validacao de proveniencia de um unico item. */
export interface ProvenanceValidationResult {
    itemId: string;
    kind: ProvenanceItemKind;
    status: ProvenanceItemStatus;
    ok: boolean;
    pending: boolean;
    issues: ProvenanceIssue[];
    warnings: ProvenanceIssue[];
}

/** Resumo agregado de varios itens (relatorio de auditoria por pack). */
export interface ProvenanceAuditSummary {
    total: number;
    published: number;
    pendingCount: number;
    warningCount: number;
    pendingItemIds: string[];
    results: ProvenanceValidationResult[];
}

function _text(value: unknown): string {
    return String(value ?? '').trim();
}

function _isBlank(value: unknown): boolean {
    return _text(value).length === 0;
}

function _normalizeKind(kind: unknown): ProvenanceItemKind {
    if (kind === 'connector' || kind === 'gate' || kind === 'data') return kind;
    return 'activity';
}

function _normalizeStatus(status: unknown): ProvenanceItemStatus {
    return status === 'published' ? 'published' : 'draft';
}

interface _ProvenanceRule {
    field: keyof ProvenanceMetadata;
    code: ProvenanceIssueCode;
    severity: ProvenanceIssueSeverity;
    message: string;
}

const _PROVENANCE_RULES: _ProvenanceRule[] = [
    { field: 'origin', code: 'missing-origin', severity: 'error', message: 'Origem do item nao informada.' },
    { field: 'evidence', code: 'missing-evidence', severity: 'error', message: 'Evidencia do item nao informada.' },
    {
        field: 'responsible',
        code: 'missing-responsible',
        severity: 'error',
        message: 'Responsavel pelo item nao informado.',
    },
    { field: 'version', code: 'missing-version', severity: 'warning', message: 'Versao do item nao informada.' },
];

/**
 * Build the list of blocking/warning issues for a single item's provenance.
 * Missing origin, evidence or responsible are errors (block publication).
 * Missing version is a warning only (spec does not list version as blocker).
 * @param {ProvenanceMetadata} provenance - metadata bag (may be empty/undefined)
 * @returns {ProvenanceIssue[]}
 */
function _collectIssues(provenance: ProvenanceMetadata | undefined): ProvenanceIssue[] {
    const meta = provenance && typeof provenance === 'object' ? provenance : {};
    return _PROVENANCE_RULES.filter((rule) => _isBlank(meta[rule.field])).map((rule) => ({
        code: rule.code,
        severity: rule.severity,
        field: rule.field,
        message: rule.message,
    }));
}

/**
 * Validate the provenance trail of a single Pipeline Pack item.
 * A published item missing origin, evidence OR responsible becomes a
 * pendency (ok=false, pending=true). Draft items are never blocked -
 * their issues are surfaced but do not fail validation. Missing version
 * is always a warning, never a blocker, regardless of status.
 * @param {ProvenanceItem} item - activity, connector, gate or data item
 * @returns {ProvenanceValidationResult}
 */
export function validateItemProvenance(item: ProvenanceItem): ProvenanceValidationResult {
    if (!item || typeof item !== 'object') {
        throw new Error('validateItemProvenance: item must be an object');
    }
    const itemId = _text(item.id) || 'item-sem-id';
    const kind = _normalizeKind(item.kind);
    const status = _normalizeStatus(item.status);
    const allIssues = _collectIssues(item.provenance);
    const errors = allIssues.filter((issue) => issue.severity === 'error');
    const warnings = allIssues.filter((issue) => issue.severity === 'warning');
    const pending = status === 'published' && errors.length > 0;
    return {
        itemId,
        kind,
        status,
        ok: !pending,
        pending,
        issues: status === 'published' ? errors : [],
        warnings,
    };
}

/**
 * Validate provenance across a list of mixed items (activities, connectors,
 * gates, data) and summarize how many are blocked as pendencies.
 * @param {ProvenanceItem[]} items
 * @returns {ProvenanceAuditSummary}
 */
export function auditPipelineProvenance(items: ProvenanceItem[]): ProvenanceAuditSummary {
    const list = Array.isArray(items) ? items : [];
    const results = list.map((item) => validateItemProvenance(item));
    const published = results.filter((result) => result.status === 'published');
    const pendingItems = published.filter((result) => result.pending);
    return {
        total: results.length,
        published: published.length,
        pendingCount: pendingItems.length,
        warningCount: results.reduce((sum, result) => sum + result.warnings.length, 0),
        pendingItemIds: pendingItems.map((result) => result.itemId),
        results,
    };
}
