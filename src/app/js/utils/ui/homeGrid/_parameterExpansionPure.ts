// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PARAMETER EXPANSION — drilla um elemento em nós-parâmetro no grafo
   GRAPH-KPI-001 F2 (Calvin 2026-06-14: "abaixo do elemento também deve ser
   possível expandir o gráfico por parâmetro monitorado").

   Recebe as severidades POR PARÂMETRO (computeParameterSeverities) + um resolvedor
   de nome e produz nós-filho sintéticos para o grafo de Relações: cada parâmetro
   vira um nó colorido pela própria severidade (escopada pela campanha + fator
   ativos). Pure: sem DOM, sem mutação. Determinístico (ordena por gravidade).
   ================================================================ */

export type ParamSeverity = 'intervention' | 'prevention' | 'reference' | null | undefined;

export interface ParameterSeverityInput {
    readonly parameterId: string;
    readonly value?: number;
    /** Aceita string genérica (vinda de computeParameterSeverities) — coagida a ParamSeverity. */
    readonly severity?: ParamSeverity | string;
    readonly exceedance?: string | null;
}

export interface ParameterNode {
    readonly id: string;
    readonly name: string;
    readonly family: 'parameter';
    readonly severity: ParamSeverity;
    readonly children: ReadonlyArray<never>;
    readonly __isParameter: true;
    readonly __paramValue: number | null;
    readonly __exceedance: string | null;
}

/** Prefixo do id sintético de nó-parâmetro (estável, não colide com ids reais). */
export const PARAM_NODE_PREFIX = '::p::';

const SEV_RANK: Readonly<Record<string, number>> = Object.freeze({
    intervention: 3,
    prevention: 2,
    reference: 1,
});
function _rank(s: ParamSeverity): number {
    return s ? SEV_RANK[s] ?? 0 : 0;
}

/**
 * Constrói nós-parâmetro para um elemento. Ordena por gravidade desc, depois
 * nome asc (tiebreak estável). `nameOf` resolve parameterId → rótulo legível.
 */
export function buildParameterChildNodes(
    paramSeverities: ReadonlyArray<ParameterSeverityInput>,
    elementId: string,
    opts: { nameOf?: (parameterId: string) => string } = {},
): ReadonlyArray<ParameterNode> {
    const nameOf = typeof opts.nameOf === 'function' ? opts.nameOf : (id: string) => id;
    const list = (paramSeverities || []).filter((p) => p && typeof p.parameterId === 'string' && p.parameterId.length > 0);
    const nodes = list.map((p) =>
        Object.freeze({
            id: `${elementId}${PARAM_NODE_PREFIX}${p.parameterId}`,
            name: String(nameOf(p.parameterId) || p.parameterId),
            family: 'parameter' as const,
            severity: (p.severity ?? null) as ParamSeverity,
            children: Object.freeze([]) as ReadonlyArray<never>,
            __isParameter: true as const,
            __paramValue: typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : null,
            __exceedance: p.exceedance ?? null,
        }),
    );
    nodes.sort(
        (a, b) => _rank(b.severity) - _rank(a.severity) || String(a.name).localeCompare(String(b.name)),
    );
    return Object.freeze(nodes);
}

/** Verdadeiro se o id é um nó-parâmetro sintético (para hit-test/click). */
export function isParameterNodeId(id: unknown): boolean {
    return typeof id === 'string' && id.includes(PARAM_NODE_PREFIX);
}

/** Extrai { elementId, parameterId } de um id sintético de nó-parâmetro. */
export function parseParameterNodeId(id: string): { elementId: string; parameterId: string } | null {
    if (typeof id !== 'string') return null;
    const idx = id.indexOf(PARAM_NODE_PREFIX);
    if (idx < 0) return null;
    return {
        elementId: id.slice(0, idx),
        parameterId: id.slice(idx + PARAM_NODE_PREFIX.length),
    };
}
