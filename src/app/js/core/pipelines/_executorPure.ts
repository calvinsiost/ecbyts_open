// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   PIPELINES EXECUTOR PURE (Module C extraction)
   ================================================================

   3 helpers algorítmicos extraídos de core/pipelines/executor.ts:
     - nextNodeId: graph navigation BPMN — escolhe próximo nó por branch.
     - interpolatePrevParams: $prev.* substitution em params (pure).
     - evaluateConditionOp: switch de operadores comparison (sem eval).

   Pattern Module C — pure-logic testável sem subir registry/actions/
   network. Crítico para BPMN: testes garantem que pipeline executar
   está com semântica determinística.
   ================================================================ */

type AnyRecord = Record<string, any>;

/**
 * Resolve próximo nodeId dada uma posição atual + edges + branch.
 *
 * Semântica BPMN preservada byte-by-byte:
 *   - Sem outgoing edges → null (terminal).
 *   - branch !== null (vindo de condition): procura edge com branch
 *     matching (string ou ===). Sem match → null.
 *   - branch === null: prefere edge sem branch (simple flow); senão
 *     primeiro outgoing (fallback compat para edges malformadas).
 *
 * @param fromId — node corrente
 * @param edges — array de { from, to, branch? }
 * @param branch — 'true'/'false' do condition, ou null para simple flow
 */
export function nextNodeId(fromId: string, edges: any[], branch: string | null): string | null {
    if (!Array.isArray(edges)) return null;
    const outgoing = edges.filter((e: AnyRecord) => e?.from === fromId);
    if (!outgoing.length) return null;
    if (branch !== null) {
        const matching = outgoing.find((e: AnyRecord) => e.branch === branch || e.branch === String(branch));
        return matching ? matching.to : null;
    }
    const simple = outgoing.find((e: AnyRecord) => !e.branch);
    return simple ? simple.to : outgoing[0]?.to || null;
}

/**
 * Interpola valores `$prev.*` em rawParams, substituindo pelo path
 * correspondente em prevResult. Valores sem prefixo passam intactos.
 *
 * Path simples (sem dot-notation aninhada): `$prev.foo` → prevResult.foo.
 * Resolução nula (prevResult ausente OR path inexistente) → null.
 *
 * Pure: NÃO muta rawParams; retorna objeto novo.
 */
export function interpolatePrevParams(rawParams: AnyRecord, prevResult: AnyRecord | null | undefined): AnyRecord {
    if (!rawParams || typeof rawParams !== 'object') return {};
    const out: AnyRecord = {};
    for (const [key, val] of Object.entries(rawParams)) {
        if (typeof val === 'string' && val.startsWith('$prev.')) {
            const path = val.slice(6);
            out[key] = prevResult?.[path] ?? null;
        } else {
            out[key] = val;
        }
    }
    return out;
}

/**
 * Avalia operador de comparação em valores numéricos. Sem eval — switch
 * explícito sobre os 6 operadores BPMN-supportados.
 *
 * Operators: > < >= <= === !==
 * Throws com mensagem se operator desconhecido (proteção contra config
 * malformada upstream).
 */
export function evaluateConditionOp(operator: string, leftVal: number, rightVal: number): boolean {
    switch (operator) {
        case '>':
            return leftVal > rightVal;
        case '<':
            return leftVal < rightVal;
        case '>=':
            return leftVal >= rightVal;
        case '<=':
            return leftVal <= rightVal;
        case '===':
            return leftVal === rightVal;
        case '!==':
            return leftVal !== rightVal;
        default:
            throw new Error(`Operator inválido: "${operator}"`);
    }
}
