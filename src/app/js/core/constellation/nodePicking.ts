// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Constellation Node Picking — ARCH-MONOLITH-ATOMIZATION-001
 *
 * Pure pointer hit-testing extraído do monólito utils/scene/constellation.ts
 * (~3445 LOC). A mesma matemática de hit-test circular estava duplicada em 6+
 * sítios inline (handleCanvasClick / handleCanvasDoubleClick / _findNodeAt /
 * handleCanvasMouseMove). Esta fatia consolida o cálculo PURO de "o ponteiro
 * está sobre este nó?" — sem DOM, sem canvas, sem Three.js.
 *
 * PT-BR (explicação leiga): quando o usuário clica/passa o mouse na
 * constelação, o sistema precisa descobrir qual "bolinha" (nó) está sob o
 * cursor. Isso é só geometria: a distância do clique até o centro do nó é
 * menor que o raio do nó (com uma folga de toque). Antes, essa conta vivia
 * copiada em vários lugares; agora mora aqui, testada e reusável.
 */

export const NODE_PICKING_META = Object.freeze({
    spec: 'ARCH-MONOLITH-ATOMIZATION-001',
    slice: 'pointer-hit-test',
    extractedFrom: 'src/app/js/utils/scene/constellation.ts',
    deliveredAt: '2026-06-18',
} as const);

/**
 * Folga de toque (em pixels de espaço-grafo) somada ao raio do nó para o
 * hit-test. Mantém o valor canônico `8` que estava espalhado pelo monólito —
 * facilita acertar nós pequenos com o ponteiro.
 */
export const NODE_HIT_PADDING = 8;

/** Nó mínimo para hit-test: centro (x,y) + raio. Campos extras ignorados. */
export interface PickableNode {
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly [k: string]: unknown;
}

/**
 * Hit-test circular genérico: o ponto (px,py) cai dentro do círculo de centro
 * (cx,cy) e raio `radius`? Usa distância ao quadrado (sem sqrt) — idêntico ao
 * `dx*dx + dy*dy < radius*radius` do monólito. Estritamente menor (`<`), como
 * no código original (borda exata não conta como acerto).
 *
 * @param px coordenada X do ponteiro (espaço-grafo)
 * @param py coordenada Y do ponteiro (espaço-grafo)
 * @param cx coordenada X do centro do círculo
 * @param cy coordenada Y do centro do círculo
 * @param radius raio do círculo
 * @returns true se o ponto está estritamente dentro do círculo
 */
export function isPointInCircle(
    px: number,
    py: number,
    cx: number,
    cy: number,
    radius: number,
): boolean {
    if (!(radius > 0)) return false;
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy < radius * radius;
}

/**
 * O ponto (px,py) está sobre o nó? Equivale a `dx*dx + dy*dy < (radius+pad)^2`
 * do monólito. A folga `padding` (default `NODE_HIT_PADDING`) amplia a área
 * clicável do nó.
 *
 * @param px coordenada X do ponteiro (espaço-grafo)
 * @param py coordenada Y do ponteiro (espaço-grafo)
 * @param node nó com {x,y,radius}
 * @param padding folga de toque somada ao raio (default 8)
 * @returns true se o ponteiro atinge o nó
 */
export function isPointInNode(
    px: number,
    py: number,
    node: PickableNode | null | undefined,
    padding: number = NODE_HIT_PADDING,
): boolean {
    if (!node) return false;
    const hitR = (node.radius || 0) + padding;
    return isPointInCircle(px, py, node.x, node.y, hitR);
}

/**
 * Retorna o PRIMEIRO nó atingido pelo ponteiro, em ordem de iteração — igual ao
 * loop `for...return` do monólito (`_findNodeAt` e os loops de click/hover). Um
 * `predicate` opcional filtra candidatos ANTES do teste geométrico, replicando
 * os guards inline `if (node.isObservation || node.isCenter) continue;`.
 *
 * @param px coordenada X do ponteiro (espaço-grafo)
 * @param py coordenada Y do ponteiro (espaço-grafo)
 * @param nodes lista de nós (ordem = prioridade de acerto)
 * @param predicate filtro opcional; nós que retornam false são pulados
 * @param padding folga de toque (default 8)
 * @returns o primeiro nó atingido, ou null
 */
export function pickNodeAt<T extends PickableNode>(
    px: number,
    py: number,
    nodes: ReadonlyArray<T> | null | undefined,
    predicate?: ((node: T) => boolean) | null,
    padding: number = NODE_HIT_PADDING,
): T | null {
    if (!Array.isArray(nodes)) return null;
    for (const node of nodes) {
        if (!node) continue;
        if (predicate && !predicate(node)) continue;
        if (isPointInNode(px, py, node, padding)) return node;
    }
    return null;
}

export const nodePickingMeta = NODE_PICKING_META;
