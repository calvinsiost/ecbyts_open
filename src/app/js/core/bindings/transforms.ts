// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   BINDING TRANSFORMS — Funcoes de transformacao para bindings
   Aplicam operacoes ao valor resolvido antes de atribuir ao campo.

   Exemplo: profundidade do poco e positiva (20m), mas Three.js usa
   eixo Y negativo para baixo. O transform "negate" inverte o sinal.
   ================================================================ */

export interface TransformArgs {
    readonly secondPath?: string;
    readonly offset?: number;
}

export interface TransformContext {
    readonly targetObj?: unknown;
    readonly resolvePath?: (obj: unknown, path: string) => unknown;
}

export type TransformFn = (
    value: unknown,
    args: TransformArgs,
    context: TransformContext,
) => unknown;

/**
 * Registry of transform functions.
 * Registro das funcoes de transformacao disponiveis.
 */
const TRANSFORMS: Readonly<Record<string, TransformFn>> = {
    /**
     * Identity — returns value as-is.
     * Sem transformacao: retorna o valor exatamente como esta na fonte.
     */
    identity: (value: unknown): unknown => value,

    /**
     * Negate — multiplies numeric value by -1.
     * Inverte o sinal: profundidade positiva → coordenada Z negativa.
     */
    negate: (value: unknown): unknown => (typeof value === 'number' ? -value : value),

    /**
     * Midpoint — average of primary value and a second path value.
     * Calcula ponto medio entre dois valores (ex: topo e base da secao filtrante).
     *
     * Requires transformArgs.secondPath (dot-path resolved on same target object).
     */
    midpoint: (value: unknown, args: TransformArgs, context: TransformContext): unknown => {
        if (typeof value !== 'number') return value;
        const secondPath = args?.secondPath;
        const targetObj = context?.targetObj;
        const resolvePath = context?.resolvePath;
        if (!secondPath || targetObj == null || typeof resolvePath !== 'function') {
            return value;
        }
        const second = resolvePath(targetObj, secondPath);
        if (typeof second !== 'number') {
            return value;
        }
        return (value + second) / 2;
    },

    /**
     * Offset — adds a fixed offset to the value.
     * Soma um deslocamento fixo (ex: ajuste de elevacao).
     *
     * Requires transformArgs.offset (number).
     */
    offset: (value: unknown, args: TransformArgs): unknown => {
        if (typeof value !== 'number') return value;
        const off = args?.offset;
        return value + (typeof off === 'number' ? off : 0);
    },
};

/**
 * Apply a named transform to a value.
 * Aplica a transformacao pelo nome. Se o nome nao existe, usa identity.
 *
 * @param transformId - Transform name ('identity', 'negate', 'midpoint', 'offset')
 * @param value - Raw resolved value
 * @param args? - Transform arguments (from binding.transformArgs)
 * @param context? - Resolution context { targetObj, resolvePath }
 * @returns Transformed value
 */
export function applyTransform(
    transformId: string | null | undefined,
    value: unknown,
    args?: TransformArgs,
    context?: TransformContext,
): unknown {
    const fn = TRANSFORMS[transformId || 'identity'];
    if (!fn) {
        console.warn(`[Bindings] Unknown transform: "${transformId}", using identity`);
        return value;
    }
    return fn(value, args || {}, context || {});
}

/**
 * Get list of available transform IDs.
 * Retorna os nomes dos transforms disponiveis para UI/picker.
 *
 * @returns Array of transform names
 */
export function getAvailableTransforms(): string[] {
    return Object.keys(TRANSFORMS);
}
