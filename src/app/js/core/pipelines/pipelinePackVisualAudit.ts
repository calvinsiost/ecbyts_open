// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE PACK VISUAL AUDIT - pure summary helpers for pixel results.

   Accepts JSON already loaded from diagram-pixel-equivalence and turns it into
   a foreground score, worst quadrants and adjustment tasks for the Workbench.
   ================================================================ */

export const PIPELINE_PACK_VISUAL_AUDIT_FOREGROUND_TARGET = 95;
export const PIPELINE_PACK_VISUAL_AUDIT_DEFAULT_WORST_BLOCKS = 4;

export type PipelinePackVisualAuditStatus = 'approved' | 'failed' | 'missing-data';
export type PipelinePackVisualAuditColor = 'red' | 'purple' | 'blue' | 'yellow';
export type PipelinePackVisualAuditSeverityCode =
    | 'visual-different'
    | 'not-editable'
    | 'module-equivalent'
    | 'human-question';

export interface PipelinePackVisualAuditSeverity {
    code: PipelinePackVisualAuditSeverityCode;
    color: PipelinePackVisualAuditColor;
    colorPt: string;
    label: string;
    description: string;
}

export interface PipelinePackVisualAuditQuadrantInput {
    id?: unknown;
    parentId?: unknown;
    parentRow?: unknown;
    parentColumn?: unknown;
    row?: unknown;
    column?: unknown;
    subRow?: unknown;
    subColumn?: unknown;
    agreement?: unknown;
    score?: unknown;
    foregroundScore?: unknown;
    iou?: unknown;
    total?: unknown;
    editable?: unknown;
    locked?: unknown;
    notEditable?: unknown;
    moduleEquivalent?: unknown;
    moduleId?: unknown;
    adapterId?: unknown;
    humanReview?: unknown;
    ambiguous?: unknown;
    severity?: unknown;
    color?: unknown;
    note?: unknown;
    subquadrants?: unknown;
}

export interface PipelinePackVisualAuditInput {
    agreement?: unknown;
    score?: unknown;
    foregroundScore?: unknown;
    foregroundAgreement?: unknown;
    scoreForeground?: unknown;
    threshold?: unknown;
    pass?: unknown;
    focus?: unknown;
    quadrantGrid?: unknown;
    subquadrantGrid?: unknown;
    quadrants?: unknown;
    subquadrants?: unknown;
}

export interface PipelinePackVisualAuditOptions {
    foregroundTarget?: number;
    worstBlockCount?: number;
}

export interface PipelinePackVisualAuditQuadrantSummary {
    id: string;
    parentId: string | null;
    level: 'quadrant' | 'subquadrant';
    row: number;
    column: number;
    subRow: number | null;
    subColumn: number | null;
    label: string;
    score: number | null;
    agreement: number | null;
    iou: number | null;
    gap: number | null;
    total: number | null;
    severity: PipelinePackVisualAuditSeverityCode;
    color: PipelinePackVisualAuditColor;
    colorPt: string;
    title: string;
    description: string;
    taskText: string;
}

export interface PipelinePackVisualAuditTask {
    id: string;
    severity: PipelinePackVisualAuditSeverityCode;
    color: PipelinePackVisualAuditColor;
    colorPt: string;
    text: string;
    quadrantId?: string;
}

export interface PipelinePackVisualAuditSummary {
    status: PipelinePackVisualAuditStatus;
    passed: boolean;
    hasData: boolean;
    foregroundScore: number | null;
    foregroundTarget: number;
    foregroundLabel: string;
    foregroundStatusLabel: string;
    quadrantGridLabel: string;
    subquadrantGridLabel: string;
    worstQuadrants: PipelinePackVisualAuditQuadrantSummary[];
    worstSubquadrants: PipelinePackVisualAuditQuadrantSummary[];
    severityLegend: PipelinePackVisualAuditSeverity[];
    tasks: PipelinePackVisualAuditTask[];
    messages: string[];
}

const SEVERITIES: Record<PipelinePackVisualAuditSeverityCode, PipelinePackVisualAuditSeverity> = {
    'visual-different': {
        code: 'visual-different',
        color: 'red',
        colorPt: 'vermelho',
        label: 'Visual diferente',
        description: 'O foreground ficou abaixo da meta e precisa de ajuste visual.',
    },
    'not-editable': {
        code: 'not-editable',
        color: 'purple',
        colorPt: 'roxo',
        label: 'Nao editavel',
        description: 'A diferenca esta em referencia bloqueada ou area que nao deve ser editada diretamente.',
    },
    'module-equivalent': {
        code: 'module-equivalent',
        color: 'blue',
        colorPt: 'azul',
        label: 'Modulo equivalente',
        description: 'A diferenca pode ser resolvida pelo de-para de modulo equivalente.',
    },
    'human-question': {
        code: 'human-question',
        color: 'yellow',
        colorPt: 'amarelo',
        label: 'Duvida humana',
        description: 'A comparacao nao decide sozinha; precisa de revisao humana.',
    },
};

const SEVERITY_ORDER: PipelinePackVisualAuditSeverityCode[] = [
    'visual-different',
    'not-editable',
    'module-equivalent',
    'human-question',
];

function _asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function _asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function _text(value: unknown): string {
    return String(value ?? '').trim();
}

function _number(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value.replace('%', '').replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function _boolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const raw = value.trim().toLowerCase();
        if (['true', 'sim', 'yes', '1'].includes(raw)) return true;
        if (['false', 'nao', 'no', '0'].includes(raw)) return false;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
    return null;
}

function _round2(value: number): number {
    return Number(value.toFixed(2));
}

function _formatPercent(value: number | null): string {
    if (value == null) return 'sem dados';
    const rounded = _round2(value);
    return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(2)}%`;
}

function _foregroundScore(raw: Record<string, unknown>): number | null {
    for (const key of ['foregroundScore', 'foregroundAgreement', 'scoreForeground', 'agreement', 'score']) {
        const value = _number(raw[key]);
        if (value != null) return value;
    }
    return null;
}

function _foregroundTarget(raw: Record<string, unknown>, options: PipelinePackVisualAuditOptions): number {
    const optionTarget = _number(options.foregroundTarget);
    if (optionTarget != null && optionTarget > 0) return optionTarget;
    const threshold = _number(raw.threshold);
    if (threshold != null && threshold > 0) return threshold;
    return PIPELINE_PACK_VISUAL_AUDIT_FOREGROUND_TARGET;
}

function _worstBlockCount(options: PipelinePackVisualAuditOptions): number {
    const count = _number(options.worstBlockCount);
    if (count == null) return PIPELINE_PACK_VISUAL_AUDIT_DEFAULT_WORST_BLOCKS;
    return Math.max(1, Math.min(16, Math.floor(count)));
}

function _validGridPair(columns: number | null, rows: number | null): boolean {
    return columns != null && rows != null && columns > 0 && rows > 0;
}

function _parseGridText(value: unknown): { columns: number; rows: number } | null {
    const text = _text(value);
    const match = /^(\d+)(?:x(\d+))?$/i.exec(text);
    if (!match) return null;
    const parsedColumns = Number(match[1]);
    const parsedRows = Number(match[2] || match[1]);
    if (!_validGridPair(parsedColumns, parsedRows)) return null;
    return { columns: Math.floor(parsedColumns), rows: Math.floor(parsedRows) };
}

function _gridFromQuadrants(quadrants: PipelinePackVisualAuditQuadrantInput[]): { columns: number; rows: number } | null {
    if (quadrants.length === 0) return null;
    const columns = quadrants.map((q) => _number(q.column)).filter((n): n is number => n != null);
    const rows = quadrants.map((q) => _number(q.row)).filter((n): n is number => n != null);
    const maxColumn = Math.max(...columns);
    const maxRow = Math.max(...rows);
    if (Number.isFinite(maxColumn) && Number.isFinite(maxRow)) {
        return { columns: Math.floor(maxColumn) + 1, rows: Math.floor(maxRow) + 1 };
    }
    const side = Math.sqrt(quadrants.length);
    if (Number.isInteger(side) && side > 0) return { columns: side, rows: side };
    return null;
}

function _normalizeGrid(value: unknown, quadrants: PipelinePackVisualAuditQuadrantInput[]): { columns: number; rows: number } | null {
    const obj = _asObject(value);
    const columns = _number(obj.columns);
    const rows = _number(obj.rows);
    if (_validGridPair(columns, rows)) {
        return { columns: Math.floor(columns as number), rows: Math.floor(rows as number) };
    }
    return _parseGridText(value) ?? _gridFromQuadrants(quadrants);
}

function _quadrantScore(q: PipelinePackVisualAuditQuadrantInput): number | null {
    return _number(q.score) ?? _number(q.foregroundScore) ?? _number(q.agreement);
}

function _explicitSeverity(value: unknown): PipelinePackVisualAuditSeverityCode | null {
    const raw = _text(value).toLowerCase();
    if (!raw) return null;
    if (['red', 'vermelho', 'visual-different', 'visual diferente', 'different'].includes(raw)) return 'visual-different';
    if (['purple', 'roxo', 'not-editable', 'nao editavel', 'locked'].includes(raw)) return 'not-editable';
    if (['blue', 'azul', 'module-equivalent', 'modulo equivalente', 'module'].includes(raw)) return 'module-equivalent';
    if (['yellow', 'amarelo', 'human-question', 'duvida humana', 'human'].includes(raw)) return 'human-question';
    return null;
}

function _severityFromLockedFlags(q: PipelinePackVisualAuditQuadrantInput): PipelinePackVisualAuditSeverityCode | null {
    if (_boolean(q.locked) === true || _boolean(q.notEditable) === true || _boolean(q.editable) === false) {
        return 'not-editable';
    }
    return null;
}

function _severityFromModuleFlags(q: PipelinePackVisualAuditQuadrantInput): PipelinePackVisualAuditSeverityCode | null {
    if (_boolean(q.moduleEquivalent) === true || _text(q.moduleId) || _text(q.adapterId)) {
        return 'module-equivalent';
    }
    return null;
}

function _severityFromHumanFlags(q: PipelinePackVisualAuditQuadrantInput): PipelinePackVisualAuditSeverityCode | null {
    if (_boolean(q.humanReview) === true || _boolean(q.ambiguous) === true) {
        return 'human-question';
    }
    return null;
}

function _severityFromScore(score: number | null, target: number): PipelinePackVisualAuditSeverityCode {
    return score != null && score < target ? 'visual-different' : 'human-question';
}

function _severityForQuadrant(
    q: PipelinePackVisualAuditQuadrantInput,
    score: number | null,
    target: number,
): PipelinePackVisualAuditSeverityCode {
    return (
        _explicitSeverity(q.severity) ||
        _explicitSeverity(q.color) ||
        _severityFromLockedFlags(q) ||
        _severityFromModuleFlags(q) ||
        _severityFromHumanFlags(q) ||
        _severityFromScore(score, target)
    );
}

function _quadrantLabel(
    id: string,
    row: number,
    column: number,
    subRow: number | null = null,
    subColumn: number | null = null,
    parentId: string | null = null,
): string {
    if (parentId) {
        const subText = subRow != null && subColumn != null ? `, sublinha ${subRow + 1}, subcoluna ${subColumn + 1}` : '';
        return `${id} dentro de ${parentId} (linha ${row + 1}, coluna ${column + 1}${subText})`;
    }
    return `${id} (linha ${row + 1}, coluna ${column + 1})`;
}

function _taskTextForQuadrant(q: PipelinePackVisualAuditQuadrantSummary): string {
    if (q.severity === 'visual-different') {
        return `Ajustar o desenho no ${q.label}: reduzir a diferenca visual ate atingir a meta de foreground.`;
    }
    if (q.severity === 'not-editable') {
        return `Nao editar diretamente o ${q.label}: registrar o limite e separar o que depende da referencia bloqueada.`;
    }
    if (q.severity === 'module-equivalent') {
        return `Validar o modulo equivalente no ${q.label}: revisar o de-para antes de alterar o desenho.`;
    }
    return `Revisar com humano o ${q.label}: confirmar se a diferenca e aceitavel ou exige ajuste.`;
}

function _normalizeQuadrants(
    input: PipelinePackVisualAuditQuadrantInput[],
    target: number,
    grid: { columns: number; rows: number } | null,
): PipelinePackVisualAuditQuadrantSummary[] {
    const columns = grid?.columns || Math.max(1, Math.ceil(Math.sqrt(input.length || 1)));
    return input.map((q, index) => {
        const id = _text(q.id) || `Q${index + 1}`;
        const parentId = _text(q.parentId) || null;
        const row = Math.max(0, Math.floor(_number(q.row) ?? Math.floor(index / columns)));
        const column = Math.max(0, Math.floor(_number(q.column) ?? index % columns));
        const subRow = parentId ? Math.max(0, Math.floor(_number(q.subRow) ?? 0)) : null;
        const subColumn = parentId ? Math.max(0, Math.floor(_number(q.subColumn) ?? 0)) : null;
        const score = _quadrantScore(q);
        const agreement = _number(q.agreement);
        const iou = _number(q.iou);
        const total = _number(q.total);
        const gap = score == null ? null : _round2(target - score);
        const severity = _severityForQuadrant(q, score, target);
        const sev = SEVERITIES[severity];
        const label = _quadrantLabel(id, row, column, subRow, subColumn, parentId);
        const title = `${sev.label}: ${label}`;
        const description = score == null
            ? `${label} sem score de foreground.`
            : `${label} com ${_formatPercent(score)} foreground contra meta ${_formatPercent(target)}.`;
        const taskText = _taskTextForQuadrant({
            id,
            parentId,
            level: parentId ? 'subquadrant' : 'quadrant',
            row,
            column,
            subRow,
            subColumn,
            label,
            score,
            agreement,
            iou,
            gap,
            total,
            severity,
            color: sev.color,
            colorPt: sev.colorPt,
            title,
            description,
            taskText: '',
        });
        return {
            id,
            parentId,
            level: parentId ? 'subquadrant' : 'quadrant',
            row,
            column,
            subRow,
            subColumn,
            label,
            score,
            agreement,
            iou,
            gap,
            total,
            severity,
            color: sev.color,
            colorPt: sev.colorPt,
            title,
            description,
            taskText,
        };
    });
}

function _sortWorstQuadrants(
    quadrants: PipelinePackVisualAuditQuadrantSummary[],
    target: number,
): PipelinePackVisualAuditQuadrantSummary[] {
    return quadrants.slice().sort((a, b) => {
        const scoreA = a.score ?? Number.POSITIVE_INFINITY;
        const scoreB = b.score ?? Number.POSITIVE_INFINITY;
        if (scoreA !== scoreB) return scoreA - scoreB;
        const gapA = a.gap == null ? Number.NEGATIVE_INFINITY : Math.max(0, a.gap);
        const gapB = b.gap == null ? Number.NEGATIVE_INFINITY : Math.max(0, b.gap);
        if (gapA !== gapB) return gapB - gapA;
        const severityA = SEVERITY_ORDER.indexOf(a.severity);
        const severityB = SEVERITY_ORDER.indexOf(b.severity);
        if (severityA !== severityB) return severityA - severityB;
        return a.id.localeCompare(b.id);
    }).map((q) => ({
        ...q,
        gap: q.score == null ? null : _round2(Math.max(0, target - q.score)),
    }));
}

function _taskFromQuadrant(q: PipelinePackVisualAuditQuadrantSummary, target: number): PipelinePackVisualAuditTask | null {
    if (q.severity === 'human-question' && q.score != null && q.score >= target) return null;
    return {
        id: `quadrant-${q.id}`,
        severity: q.severity,
        color: q.color,
        colorPt: q.colorPt,
        text: q.taskText,
        quadrantId: q.id,
    };
}

function _collectSubquadrants(
    rawQuadrants: PipelinePackVisualAuditQuadrantInput[],
    rawFlatSubquadrants: unknown[],
): PipelinePackVisualAuditQuadrantInput[] {
    const out: PipelinePackVisualAuditQuadrantInput[] = [];
    for (const [parentIndex, parent] of rawQuadrants.entries()) {
        const parentId = _text(parent.id) || `Q${parentIndex + 1}`;
        const nested = _asArray(parent.subquadrants) as PipelinePackVisualAuditQuadrantInput[];
        for (const [subIndex, sub] of nested.entries()) {
            out.push({
                ...sub,
                id: _text(sub.id) || `${parentId}.${subIndex + 1}`,
                parentId: _text(sub.parentId) || parentId,
                parentRow: _number(sub.parentRow) ?? _number(parent.row),
                parentColumn: _number(sub.parentColumn) ?? _number(parent.column),
            });
        }
    }
    for (const sub of rawFlatSubquadrants as PipelinePackVisualAuditQuadrantInput[]) {
        if (!_asObject(sub).id && !_asObject(sub).parentId) continue;
        const id = _text(sub.id);
        if (id && out.some((item) => _text(item.id) === id)) continue;
        out.push(sub);
    }
    return out;
}

export function getPipelinePackVisualAuditSeverityLegend(): PipelinePackVisualAuditSeverity[] {
    return SEVERITY_ORDER.map((code) => ({ ...SEVERITIES[code] }));
}

function _foregroundTasksAndMessages(
    score: number | null,
    target: number,
    hasData: boolean,
    passed: boolean,
): { tasks: PipelinePackVisualAuditTask[]; messages: string[] } {
    const tasks: PipelinePackVisualAuditTask[] = [];
    const messages: string[] = [];
    if (!hasData) {
        const sev = SEVERITIES['human-question'];
        tasks.push({
            id: 'visual-audit-run-foreground',
            severity: sev.code,
            color: sev.color,
            colorPt: sev.colorPt,
            text: 'Executar comparacao visual com focus foreground, quadrantes 4x4 e subquadrantes 2x2 antes de fechar o Pipeline Pack.',
        });
        messages.push('Sem dados de foreground para auditar.');
    } else if (!passed) {
        const sev = SEVERITIES['visual-different'];
        tasks.push({
            id: 'visual-audit-adjust-foreground',
            severity: sev.code,
            color: sev.color,
            colorPt: sev.colorPt,
            text: `Ajustar o foreground global: ${_formatPercent(score)} esta abaixo da meta ${_formatPercent(target)}.`,
        });
        messages.push(`Foreground reprovado: ${_formatPercent(score)} abaixo da meta ${_formatPercent(target)}.`);
    } else {
        messages.push(`Foreground aprovado: ${_formatPercent(score)} atingiu a meta ${_formatPercent(target)}.`);
    }
    return { tasks, messages };
}

function _statusLabel(status: PipelinePackVisualAuditStatus): string {
    if (status === 'approved') return 'Aprovado';
    if (status === 'failed') return 'Reprovado';
    return 'Sem dados';
}

export function summarizePipelinePackVisualAudit(
    result: unknown,
    options: PipelinePackVisualAuditOptions = {},
): PipelinePackVisualAuditSummary {
    const raw = _asObject(result);
    const target = _foregroundTarget(raw, options);
    const score = _foregroundScore(raw);
    const hasData = score != null;
    const passed = hasData ? score >= target : false;
    const status: PipelinePackVisualAuditStatus = hasData ? (passed ? 'approved' : 'failed') : 'missing-data';
    const rawQuadrants = _asArray(raw.quadrants) as PipelinePackVisualAuditQuadrantInput[];
    const rawSubquadrants = _collectSubquadrants(rawQuadrants, _asArray(raw.subquadrants));
    const grid = _normalizeGrid(raw.quadrantGrid, rawQuadrants);
    const subgrid = _normalizeGrid(raw.subquadrantGrid, rawSubquadrants);
    const normalizedQuadrants = _normalizeQuadrants(rawQuadrants, target, grid);
    const normalizedSubquadrants = _normalizeQuadrants(rawSubquadrants, target, subgrid);
    const worstQuadrants = _sortWorstQuadrants(normalizedQuadrants, target).slice(0, _worstBlockCount(options));
    const worstSubquadrants = _sortWorstQuadrants(normalizedSubquadrants, target).slice(0, _worstBlockCount(options));
    const { tasks, messages } = _foregroundTasksAndMessages(score, target, hasData, passed);

    const taskQuadrants = worstSubquadrants.length > 0 ? worstSubquadrants : worstQuadrants;
    for (const q of taskQuadrants) {
        const task = _taskFromQuadrant(q, target);
        if (task) tasks.push(task);
    }

    const quadrantGridLabel = grid ? `${grid.columns}x${grid.rows}` : 'sem quadrantes';
    const subquadrantGridLabel = subgrid ? `${quadrantGridLabel} com ${subgrid.columns}x${subgrid.rows} em cada parte` : 'sem subquadrantes';
    const foregroundLabel = hasData
        ? `${_formatPercent(score)} foreground / meta ${_formatPercent(target)}`
        : `Sem dados de foreground / meta ${_formatPercent(target)}`;

    return {
        status,
        passed,
        hasData,
        foregroundScore: score == null ? null : _round2(score),
        foregroundTarget: _round2(target),
        foregroundLabel,
        foregroundStatusLabel: _statusLabel(status),
        quadrantGridLabel,
        subquadrantGridLabel,
        worstQuadrants,
        worstSubquadrants,
        severityLegend: getPipelinePackVisualAuditSeverityLegend(),
        tasks,
        messages,
    };
}
