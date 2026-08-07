// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SENTINEL SPEC_SUNBURST_REDESIGN_001 (Calvin 2026-06-06) — vista alternativa árvore vertical.
//
// Pure-logic layout para hierarquia em nós verticais (estilo legacy constellation
// simplificado). Caller renderiza como UL/LI indentado com conectores L-line.
//
// Pesquisa: WebSearch 2026-06-06 (Obsidian outliner, AFFiNE tree, hierarchy diagrams).
// Best practice: indent constante por depth (12-16px) + severity dot prefix +
// expand/collapse opcional. Sem canvas — DOM puro.

console.debug('[mod:load]', 'app/js/utils/ui/homeGrid/_relationsTreeLayout.ts');

/** Severity canônica (espelha core/elements/complianceOverlay SEVERITY_RANK). */
export type RelationsSeverity = 'intervention' | 'prevention' | 'reference' | null;

/** Nó de entrada para a árvore vertical (recursivo). */
export interface TreeNode {
    readonly id: string;
    readonly name: string;
    readonly family: string;
    readonly severity?: RelationsSeverity;
    readonly children?: ReadonlyArray<TreeNode>;
}

/** Configuração de layout. */
export interface TreeConfig {
    /** Indent em px por nível. Default 16. */
    readonly indentPx?: number;
    /** Profundidade máxima a renderizar. Default 3. */
    readonly maxDepth?: number;
    /** Se true, ordena children alfabético dentro de cada nível. Default true. */
    readonly sortAlpha?: boolean;
}

/** Linha resultante — flat list para o renderer iterar. */
export interface TreeRow {
    readonly nodeId: string;
    readonly name: string;
    readonly family: string;
    readonly severity: RelationsSeverity;
    readonly depth: number;
    readonly indentPx: number;
    readonly isLast: boolean;
    readonly hasChildren: boolean;
    /** Path do root até este nó (inclusivo). Útil para breadcrumb / aria-tree. */
    readonly path: ReadonlyArray<string>;
}

/** Resultado completo. */
export interface TreeLayout {
    readonly rows: ReadonlyArray<TreeRow>;
    readonly totalNodes: number;
    readonly maxDepthReached: number;
    /** Contagem de violações por severity (intervention + prevention). */
    readonly violationCounts: { intervention: number; prevention: number };
}

// ============================================================================
// API
// ============================================================================

/**
 * Computa flat list de TreeRow a partir de uma TreeNode root.
 * DFS pre-order, com indentação proporcional ao depth.
 */
export function computeTreeLayout(root: TreeNode, cfg: TreeConfig = {}): TreeLayout {
    const INDENT = Math.max(8, cfg.indentPx ?? 16);
    const MAX_DEPTH = Math.max(1, Math.min(8, cfg.maxDepth ?? 3));
    const SORT = cfg.sortAlpha !== false;

    const rows: TreeRow[] = [];
    let totalNodes = 0;
    let maxDepthReached = 0;
    const violationCounts = { intervention: 0, prevention: 0 };

    function visit(node: TreeNode, depth: number, path: string[], isLast: boolean): void {
        if (!node) return;
        totalNodes++;
        if (depth > maxDepthReached) maxDepthReached = depth;
        const sev: RelationsSeverity = (node.severity ?? null) as RelationsSeverity;
        if (sev === 'intervention') violationCounts.intervention++;
        else if (sev === 'prevention') violationCounts.prevention++;
        const childrenArr = (node.children ?? []) as ReadonlyArray<TreeNode>;
        const hasChildren = childrenArr.length > 0 && depth < MAX_DEPTH;
        rows.push(
            Object.freeze({
                nodeId: String(node.id),
                name: String(node.name),
                family: String(node.family || ''),
                severity: sev,
                depth,
                indentPx: depth * INDENT,
                isLast,
                hasChildren,
                path: Object.freeze([...path, String(node.id)]),
            }),
        );
        if (!hasChildren) return;
        const kids = SORT
            ? [...childrenArr].sort((a, b) => String(a.name).localeCompare(String(b.name)))
            : [...childrenArr];
        for (let i = 0; i < kids.length; i++) {
            visit(kids[i]!, depth + 1, [...path, String(node.id)], i === kids.length - 1);
        }
    }

    visit(root, 0, [], true);

    return Object.freeze({
        rows: Object.freeze(rows),
        totalNodes,
        maxDepthReached,
        violationCounts: Object.freeze(violationCounts),
    });
}

/**
 * Helper: dot color por severity. Reusado pelo renderer DOM (não pinta canvas).
 * Cores espelham `complianceOverlay.ts:35-39` SEVERITY_COLORS.
 */
export function severityDotColor(sev: RelationsSeverity): string {
    if (sev === 'intervention') return '#ef4444';
    if (sev === 'prevention') return '#fbbf24';
    if (sev === 'reference') return '#60a5fa';
    return 'transparent';
}

/**
 * Helper: severity rank para ordenação (alta primeiro).
 * Reusado se UI quiser "violations on top".
 */
export function severityRank(sev: RelationsSeverity): number {
    if (sev === 'intervention') return 4;
    if (sev === 'prevention') return 3;
    if (sev === 'reference') return 2;
    return 0;
}
