// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   RELATIONS COLLAPSE — poda do grafo denso (progressive disclosure)
   RELATIONS-UX-001 F5 (R1). Calvin 2026-06-14.

   O 1º screenshot mostrava dezenas de nós espremidos e ilegíveis na base do
   cone (occlusion). Pesquisa (Tom Sawyer): para grafos densos, colapsar +
   progressive disclosure. Este módulo PODA a árvore por LARGURA: limita o
   número de filhos visíveis por nó; o excedente vira um nó sintético "+N"
   (agregador). Mantém os filhos MAIS GRAVES visíveis (não esconde uma violação
   atrás do "+N") — ordena por severidade antes de cortar.

   A lista CONTAINS (DOM, ao lado) continua mostrando tudo: o grafo fica
   legível, a completude do dado permanece acessível na lista.

   Pure: sem DOM, sem mutação da entrada. Retorna árvore nova frozen.
   ================================================================ */

export type CollapseSeverity = 'intervention' | 'prevention' | 'reference' | null | undefined;

export interface CollapsibleNode {
    readonly id: string;
    readonly name: string;
    readonly family?: string;
    readonly severity?: CollapseSeverity;
    readonly children?: ReadonlyArray<CollapsibleNode>;
    /** Marca de nó agregador sintético "+N" (inserido pela poda). */
    readonly __aggregate?: boolean;
    readonly __hiddenCount?: number;
}

/** Máximo de filhos visíveis por nó antes de agregar em "+N". */
export const DEFAULT_MAX_CHILDREN = 8;

/**
 * Máximo de filhos ADAPTADO à largura do painel (achado da jornada real: em
 * painel estreito ~390px o grafo fica apertado mesmo podado). Painel estreito
 * → menos filhos por nível + mais "+N"; painel largo → o default 8.
 */
export function resolveMaxChildrenForWidth(widthPx: unknown): number {
    const w = typeof widthPx === 'number' && Number.isFinite(widthPx) && widthPx > 0 ? widthPx : 480;
    if (w < 340) return 4;
    if (w < 430) return 6;
    return DEFAULT_MAX_CHILDREN;
}

/** Rank de severidade para priorizar quem fica visível (grave primeiro). */
const SEV_RANK: Readonly<Record<string, number>> = Object.freeze({
    intervention: 3,
    prevention: 2,
    reference: 1,
});
function _sevRank(s: CollapseSeverity): number {
    return s ? SEV_RANK[s] ?? 0 : 0;
}

export interface PruneOptions {
    readonly maxChildrenPerNode?: number;
    /** IDs de nós cujos filhos NÃO são podados (expandidos pelo usuário). */
    readonly expandedIds?: ReadonlyArray<string>;
    /** IDs que SEMPRE ficam visíveis (nunca vão para "+N") — ex: o selecionado. */
    readonly keepIds?: ReadonlyArray<string>;
}

/**
 * Poda recursiva por largura. Cada nó com mais de `maxChildrenPerNode` filhos
 * mantém os (max-1) MAIS GRAVES + um nó "+N" agregando o restante. Nós em
 * `expandedIds` não são podados (mostram todos os filhos). Determinístico:
 * ordena por severidade desc, depois nome (tiebreak estável).
 */
export function pruneTreeForDisplay(
    node: CollapsibleNode,
    opts: PruneOptions = {},
): CollapsibleNode {
    const max = _posInt(opts.maxChildrenPerNode, DEFAULT_MAX_CHILDREN);
    const expanded = new Set((opts.expandedIds || []).map(String));
    const keepSet = new Set((opts.keepIds || []).map(String));

    function walk(n: CollapsibleNode): CollapsibleNode {
        const children = Array.isArray(n.children) ? n.children : [];
        if (children.length === 0) {
            return Object.freeze({ ...n, children: Object.freeze([]) });
        }
        const isExpanded = expanded.has(String(n.id));
        if (isExpanded || children.length <= max) {
            return Object.freeze({ ...n, children: Object.freeze(children.map(walk)) });
        }
        // Ordena: keepIds (selecionado) primeiro, depois gravidade desc, nome
        // asc (estável); mantém os top (max-1) — o selecionado nunca some no "+N".
        const sorted = children
            .slice()
            .sort(
                (a, b) =>
                    (keepSet.has(String(b.id)) ? 1 : 0) - (keepSet.has(String(a.id)) ? 1 : 0) ||
                    _sevRank(b.severity) - _sevRank(a.severity) ||
                    String(a.name).localeCompare(String(b.name)),
            );
        const keepCount = Math.max(1, max - 1);
        const keep = sorted.slice(0, keepCount).map(walk);
        const hidden = children.length - keepCount;
        const aggregate: CollapsibleNode = Object.freeze({
            id: `${n.id}__more`,
            name: `+${hidden}`,
            family: '',
            severity: null,
            __aggregate: true,
            __hiddenCount: hidden,
            children: Object.freeze([]),
        });
        return Object.freeze({ ...n, children: Object.freeze([...keep, aggregate]) });
    }
    return walk(node);
}

/** Conta nós totais de uma árvore (para medir o ganho de poda). */
export function countNodes(node: CollapsibleNode | null | undefined): number {
    if (!node) return 0;
    let total = 1;
    for (const c of node.children || []) total += countNodes(c);
    return total;
}

function _posInt(v: unknown, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : fallback;
}
