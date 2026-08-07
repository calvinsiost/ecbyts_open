// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Exports - Phase 32 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S32
 *
 * Phase 32 (2026-05-01) - pure-logic exporters de pipelines para
 * formatos de documentação. Suporta:
 *   - Mermaid flowchart
 *   - GraphViz DOT
 *   - JSON-LD schema.org Pipeline
 *   - Markdown human-readable
 *
 * Estratégia:
 *   - Cada exporter é função pura (pipeline → string)
 *   - Sanitização de IDs para syntax-safe output
 *   - Composed steps (sequence/parallel/conditional/retry) renderizados
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

interface FlatNode {
    id: any;
    label: any;
    composed: any;
}

/** Export formats canônicos. */
export const EXPORT_FORMATS = Object.freeze(['mermaid', 'dot', 'jsonld', 'markdown']);

/** Identidade do módulo. */
export const EXPORTS_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 32,
    deliveredAt: '2026-05-01',
    formats: EXPORT_FORMATS,
});

/**
 * Verifica se format é canônico.
 */
export function isValidFormat(f: any): boolean {
    return typeof f === 'string' && EXPORT_FORMATS.includes(f);
}

/**
 * Sanitiza ID para syntax-safe output em mermaid/DOT.
 */
export function sanitizeId(id: any): string {
    if (typeof id !== 'string') return 'unknown';
    return id.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64) || 'unknown';
}

/**
 * Escapa label entre aspas duplas (mermaid/DOT).
 */
export function escapeLabel(label: any): string {
    if (typeof label !== 'string') return '';
    return label.replace(/"/g, '\\"').replace(/\n/g, ' ');
}

/**
 * Achata steps com expansão de composed para nodes lineares numerados.
 *
 * @param steps
 */
export function flattenForExport(steps: Array<object>): Array<FlatNode> {
    if (!Array.isArray(steps)) return [];
    const out: any[] = [];
    let counter = 0;
    function visit(step: any, parentLabel: any = null) {
        if (!step) return;
        if (step.type === 'composed' && Array.isArray(step.children)) {
            const lbl = `[${step.strategy}]`;
            for (const c of step.children) visit(c, lbl);
            return;
        }
        const id = `n${counter++}`;
        out.push(
            Object.freeze({
                id,
                label: step.libraryId || 'unknown',
                composed: parentLabel,
            }),
        );
    }
    for (const s of steps) visit(s);
    return Object.freeze(out) as any;
}

/**
 * Exporta pipeline como Mermaid flowchart.
 *
 * @param steps
 * @param options
 */
export function toMermaid(steps: Array<object>, options: Record<string, any> = {}): string {
    const direction = options.direction === 'LR' ? 'LR' : 'TD';
    const flat = flattenForExport(steps || []);
    if (flat.length === 0) return `flowchart ${direction}\n  empty[Empty pipeline]\n`;
    const lines = [`flowchart ${direction}`];
    for (const node of flat) {
        const label = escapeLabel(node.label);
        const composed = node.composed ? ` ${node.composed}` : '';
        lines.push(`  ${sanitizeId(node.id)}["${label}${composed}"]`);
    }
    for (let i = 0; i < flat.length - 1; i++) {
        lines.push(`  ${sanitizeId(flat[i]!.id)} --> ${sanitizeId(flat[i + 1]!.id)}`);
    }
    return lines.join('\n') + '\n';
}

/**
 * Exporta pipeline como GraphViz DOT.
 *
 * @param steps
 */
export function toDot(steps: Array<object>): string {
    const flat = flattenForExport(steps || []);
    if (flat.length === 0) return 'digraph Pipeline {\n  empty [label="Empty pipeline"];\n}\n';
    const lines = ['digraph Pipeline {', '  rankdir=TB;', '  node [shape=box];'];
    for (const node of flat) {
        const label = escapeLabel(node.label);
        const composed = node.composed ? `\\n${node.composed}` : '';
        lines.push(`  ${sanitizeId(node.id)} [label="${label}${composed}"];`);
    }
    for (let i = 0; i < flat.length - 1; i++) {
        lines.push(`  ${sanitizeId(flat[i]!.id)} -> ${sanitizeId(flat[i + 1]!.id)};`);
    }
    lines.push('}');
    return lines.join('\n') + '\n';
}

/**
 * Exporta pipeline como JSON-LD schema.org-compatible.
 *
 * @param steps
 * @param meta
 */
export function toJsonLd(steps: Array<object>, meta: Record<string, any> = {}): object {
    const flat = flattenForExport(steps || []);
    return Object.freeze({
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: meta.name || 'ECBT Pipeline',
        description: meta.description || '',
        step: flat.map((n, i) =>
            Object.freeze({
                '@type': 'HowToStep',
                position: i + 1,
                name: n.label,
                identifier: n.id,
                isPartOf: n.composed || null,
            }),
        ),
    });
}

/**
 * Exporta pipeline como markdown human-readable.
 *
 * @param steps
 * @param meta
 */
export function toMarkdown(steps: Array<object>, meta: Record<string, any> = {}): string {
    const flat = flattenForExport(steps || []);
    const title = meta.name || 'Pipeline';
    const lines = [`# ${title}`, ''];
    if (meta.description) {
        lines.push(meta.description, '');
    }
    if (flat.length === 0) {
        lines.push('_Empty pipeline_');
        return lines.join('\n') + '\n';
    }
    lines.push(`Total steps: **${flat.length}**`, '');
    lines.push('| # | Step | Composed |');
    lines.push('|---|------|----------|');
    flat.forEach((n, i) => {
        lines.push(`| ${i + 1} | \`${n.label}\` | ${n.composed || '—'} |`);
    });
    return lines.join('\n') + '\n';
}

/**
 * Dispatcher universal por format.
 *
 * @param format
 * @param steps
 * @param options
 */
export function exportPipeline(
    format: string,
    steps: Array<object>,
    options: object = {},
): string | object {
    if (!isValidFormat(format)) {
        throw new TypeError(`exportPipeline: invalid format ${format}`);
    }
    if (format === 'mermaid') return toMermaid(steps, options);
    if (format === 'dot') return toDot(steps);
    if (format === 'jsonld') return toJsonLd(steps, options);
    if (format === 'markdown') return toMarkdown(steps, options);
    return '';
}

/**
 * Sumariza pipeline para qualquer format.
 */
export function summarizeExport(steps: any): any {
    const empty = { stepCount: 0, leafCount: 0, hasComposed: false };
    if (!Array.isArray(steps) || steps.length === 0) return empty;
    const flat = flattenForExport(steps);
    const hasComposed = flat.some((n) => n.composed);
    return Object.freeze({
        stepCount: steps.length,
        leafCount: flat.length,
        hasComposed,
    });
}

/**
 * Module identity export.
 */
export const pipelineExportsMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 32,
    deliveredAt: '2026-05-01',
    formats: EXPORT_FORMATS,
    exports: [
        'EXPORT_FORMATS',
        'EXPORTS_META',
        'isValidFormat',
        'sanitizeId',
        'escapeLabel',
        'flattenForExport',
        'toMermaid',
        'toDot',
        'toJsonLd',
        'toMarkdown',
        'exportPipeline',
        'summarizeExport',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
