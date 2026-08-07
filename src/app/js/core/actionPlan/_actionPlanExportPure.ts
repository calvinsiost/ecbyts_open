// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Plano de Ação — export PURO (ACTION-PLAN-001 RF-14, FASE 2).
 *
 * Serializa a lista de ações em CSV / JSON / Markdown para relatório/prova de
 * compliance perante o órgão ambiental. Tudo aqui é DETERMINÍSTICO e SEM EFEITO
 * COLATERAL (sem DOM, sem I/O): quem chama decide como baixar/copiar o texto.
 *
 * A paridade com a tela (RF-14: "export bate com a tela") é garantida porque a
 * UI e o export consomem a MESMA lista de `Action[]` de `actionPlanModelState`.
 */

import type { Action } from './_actionPlanPure.js';

/** Colunas exportadas (ordem estável — usada por CSV header e Markdown table). */
const EXPORT_COLUMNS: ReadonlyArray<{ key: keyof Action | 'gut'; header: string }> = [
    { key: 'id', header: 'ID' },
    { key: 'title', header: 'O quê (ação)' },
    { key: 'cause', header: 'Por quê (causa-raiz)' },
    { key: 'location', header: 'Onde (local)' },
    { key: 'dueDate', header: 'Quando (prazo)' },
    { key: 'responsible', header: 'Quem (responsável)' },
    { key: 'method', header: 'Como (método)' },
    { key: 'cost', header: 'Quanto (custo)' },
    { key: 'type', header: 'Tipo' },
    { key: 'severity', header: 'Severidade' },
    { key: 'gut', header: 'GUT' },
    { key: 'priority', header: 'Prioridade' },
    { key: 'status', header: 'Status' },
    { key: 'originType', header: 'Origem' },
    { key: 'originRef', header: 'Ref. origem' },
    { key: 'verifiedBy', header: 'Verificador' },
];

/** Valor textual de uma célula (deriva `gut` do gutScore; trata undefined). */
function cellValue(action: Action, key: keyof Action | 'gut'): string {
    if (key === 'gut') return String(action.gutScore ?? '');
    const raw = (action as unknown as Record<string, unknown>)[key];
    if (raw === undefined || raw === null) return '';
    if (Array.isArray(raw)) return raw.join('; ');
    return String(raw);
}

/** Escapa um campo CSV (aspas se contiver separador, aspas ou quebra de linha). */
function csvEscape(value: string, sep: string): string {
    if (value.includes(sep) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
        return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
}

/**
 * Exporta as ações como CSV (separador `,`, com BOM opcional via chamador).
 * Cabeçalho na primeira linha; uma ação por linha.
 *
 * @param actions - Lista de ações.
 * @returns Texto CSV.
 */
export function exportActionsCsv(actions: readonly Action[]): string {
    const sep = ',';
    const list = Array.isArray(actions) ? actions : [];
    const header = EXPORT_COLUMNS.map((c) => csvEscape(c.header, sep)).join(sep);
    const lines = [header];
    for (const a of list) {
        lines.push(EXPORT_COLUMNS.map((c) => csvEscape(cellValue(a, c.key), sep)).join(sep));
    }
    return lines.join('\n');
}

/**
 * Exporta as ações como JSON (pretty-printed, 2 espaços).
 *
 * @param actions - Lista de ações.
 * @returns Texto JSON.
 */
export function exportActionsJson(actions: readonly Action[]): string {
    const list = Array.isArray(actions) ? actions : [];
    return JSON.stringify({ schemaVersion: 1, actions: list }, null, 2);
}

/** Escapa caracteres de tabela Markdown (`|` e quebras de linha). */
function mdEscape(value: string): string {
    return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * Exporta as ações como tabela Markdown (cabeçalho + separador + linhas).
 *
 * @param actions - Lista de ações.
 * @param title - Título opcional (vira `# título` acima da tabela).
 * @returns Texto Markdown.
 */
export function exportActionsMarkdown(actions: readonly Action[], title?: string): string {
    const list = Array.isArray(actions) ? actions : [];
    const head = `| ${EXPORT_COLUMNS.map((c) => mdEscape(c.header)).join(' | ')} |`;
    const sep = `| ${EXPORT_COLUMNS.map(() => '---').join(' | ')} |`;
    const rows = list.map(
        (a) => `| ${EXPORT_COLUMNS.map((c) => mdEscape(cellValue(a, c.key))).join(' | ')} |`,
    );
    const table = [head, sep, ...rows].join('\n');
    return title ? `# ${title}\n\n${table}\n` : `${table}\n`;
}

export type ActionExportFormat = 'csv' | 'json' | 'markdown';

/**
 * Exporta no formato pedido (despacho central — usado pela UI RF-14).
 *
 * @param actions - Lista de ações.
 * @param format - `'csv' | 'json' | 'markdown'`.
 * @param title - Título opcional (só usado por markdown).
 * @returns `{ text, mime, ext }` para download/cópia.
 */
export function exportActionPlanAs(
    actions: readonly Action[],
    format: ActionExportFormat,
    title?: string,
): { text: string; mime: string; ext: string } {
    switch (format) {
        case 'json':
            return { text: exportActionsJson(actions), mime: 'application/json;charset=utf-8', ext: 'json' };
        case 'markdown':
            return { text: exportActionsMarkdown(actions, title), mime: 'text/markdown;charset=utf-8', ext: 'md' };
        case 'csv':
        default:
            return { text: exportActionsCsv(actions), mime: 'text/csv;charset=utf-8', ext: 'csv' };
    }
}
