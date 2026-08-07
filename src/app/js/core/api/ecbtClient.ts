// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   ECBT UNIVERSAL API — FACHADA PÚBLICA / ENTRY UNIVERSAL (TIER CLIENTE)

   ADR: docs/specs/arch/ADR_ECBT_API_CLIENT_VS_SERVER.md (TIER CLIENTE aprovado).
   SPEC: docs/specs/arch/SPEC_ECBT_UNIVERSAL_API.md (RF2/RF3/RF9).

   ----------------------------------------------------------------
   O QUE É

   A fachada `ecbt.*` que o usuário e o add-in Excel usam. Embrulha o invoker
   (ecbtClientInvoker) numa API ergonômica e EXPÕE `window.ecbt` no browser, de
   modo que fórmulas como `=API(ecbt.table("KEY"))` e o add-in achem o cliente.

   Métodos (todos async → envelope {ok,...}, nunca throw):
     - table(key)              → ecbt.table
     - sum(key, col, op?)      → ecbt.sum (op default 'sum')
     - value(key, field)       → ecbt.value
     - meta(key)               → ecbt.meta (describeKey)
     - call(fnId, ...args)     → função científica genérica (ecbt.computeAQI(...))
     - evaluate(expr)          → parser de "ecbt.X(...)" → invoke
     - listFunctions()         → catálogo (primitivas + 49 científicas)

   PORTABILIDADE (universal):
     - Em Node (sem window) NÃO seta nada global — só retorna o objeto.
     - No browser seta `window.ecbt` UMA vez (guard typeof window).
     - O importer de módulo é injetável: o teste Node mapeia 'app/js/...' → file://
       do .js emitido; o browser usa import() nativo (default do invoker).
   ================================================================ */

import {
    invokeEcbt,
    type EcbtApiResult,
    type EcbtInvokeContext,
    type EcbtModuleImporter,
} from './ecbtClientInvoker.js';
import type { AggOp } from './_ecbtPrimitivesPure.js';
import type { ResolveOptions } from './_ecbtKeyResolverPure.js';
import {
    listPublicScienceFunctions,
    type ScienceCatalogItem,
} from './ecbtScienceRegistry.js';

// ----------------------------------------------------------------
// TIPOS DA FACHADA
// ----------------------------------------------------------------

/** Opções de criação do cliente (tudo injetável p/ portabilidade/teste). */
export interface EcbtClientOptions {
    /** Opções de resolução de chave (decoders/loader de dataset). */
    readonly resolve?: ResolveOptions;
    /** Importer de módulo .js p/ funções científicas. Default: import() nativo. */
    readonly importModule?: EcbtModuleImporter;
    /** Op default de sum quando o caller não a fornece. Default 'sum'. */
    readonly defaultSumOp?: AggOp;
    /**
     * Se false, NÃO seta window.ecbt mesmo em browser (útil p/ múltiplas
     * instâncias ou testes em jsdom). Default true.
     */
    readonly exposeGlobal?: boolean;
}

/** Item de catálogo de descoberta (primitiva OU função científica). */
export interface EcbtCatalogItem {
    readonly id: string;
    readonly kind: 'primitive' | 'science';
    readonly arity: number | 'variadic';
    readonly params: readonly string[];
    readonly description: string;
    readonly category?: string;
}

/** A fachada pública `ecbt`. */
export interface EcbtClient {
    table(key: string): Promise<EcbtApiResult>;
    sum(key: string, column: string, op?: AggOp): Promise<EcbtApiResult>;
    value(key: string, field: string): Promise<EcbtApiResult>;
    meta(key: string): Promise<EcbtApiResult>;
    /** Função científica genérica: ecbt.call('computeAQI', readingsJson). */
    call(fnId: string, ...args: unknown[]): Promise<EcbtApiResult>;
    /** Avalia uma expressão "ecbt.X(...)" (planilha/add-in). */
    evaluate(expr: string): Promise<EcbtApiResult>;
    /** Catálogo p/ descoberta (primitivas + funções científicas). */
    listFunctions(): readonly EcbtCatalogItem[];
}

// ----------------------------------------------------------------
// CATÁLOGO DE PRIMITIVAS (descoberta)
// ----------------------------------------------------------------

const PRIMITIVE_CATALOG: readonly EcbtCatalogItem[] = Object.freeze([
    Object.freeze({
        id: 'table',
        kind: 'primitive' as const,
        arity: 1 as const,
        params: Object.freeze(['key']),
        description: 'Read a resolved dataset as a stable 2D matrix (header + rows).',
        category: 'primitive',
    }),
    Object.freeze({
        id: 'sum',
        kind: 'primitive' as const,
        arity: 'variadic' as const,
        params: Object.freeze(['key', 'column', 'op?']),
        description: 'Scalar aggregation over a column (sum/avg/min/max/count/p50/p75).',
        category: 'primitive',
    }),
    Object.freeze({
        id: 'value',
        kind: 'primitive' as const,
        arity: 2 as const,
        params: Object.freeze(['key', 'field']),
        description: 'Read a single cell/measure ("column" or "rowIndex:column").',
        category: 'primitive',
    }),
    Object.freeze({
        id: 'meta',
        kind: 'primitive' as const,
        arity: 1 as const,
        params: Object.freeze(['key']),
        description: 'Describe a resolved dataset (columns, rowCount, freshness, source).',
        category: 'primitive',
    }),
]);

// ----------------------------------------------------------------
// CONVERSÃO DE ARGS GENÉRICOS → string[] (contrato do invoker)
// ----------------------------------------------------------------

/**
 * O invoker opera sobre string[] (modelo planilha). `call(fnId, ...args)` aceita
 * args JS arbitrários por ergonomia; serializamos para a forma string que o
 * invoker re-coage. Strings passam intactas; números/booleanos viram String();
 * objetos/arrays viram JSON (o invoker faz JSON.parse de volta).
 */
function argToInvokerString(arg: unknown): string {
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
    if (arg === null || arg === undefined) return '';
    try {
        return JSON.stringify(arg);
    } catch {
        return String(arg);
    }
}

// ----------------------------------------------------------------
// FÁBRICA — createEcbtClient
// ----------------------------------------------------------------

/**
 * Cria a fachada `ecbt`. No browser (e se exposeGlobal !== false) seta
 * `window.ecbt` UMA vez. Em Node não toca em nada global.
 */
export function createEcbtClient(opts: EcbtClientOptions = {}): EcbtClient {
    const ctx: EcbtInvokeContext = {
        ...(opts.resolve !== undefined ? { resolve: opts.resolve } : {}),
        ...(opts.importModule !== undefined ? { importModule: opts.importModule } : {}),
        ...(opts.defaultSumOp !== undefined ? { defaultSumOp: opts.defaultSumOp } : {}),
    };

    const client: EcbtClient = {
        table(key: string): Promise<EcbtApiResult> {
            return invokeEcbt({ fn: 'table', args: [key] }, ctx);
        },
        sum(key: string, column: string, op?: AggOp): Promise<EcbtApiResult> {
            const args = op === undefined ? [key, column] : [key, column, op];
            return invokeEcbt({ fn: 'sum', args }, ctx);
        },
        value(key: string, field: string): Promise<EcbtApiResult> {
            return invokeEcbt({ fn: 'value', args: [key, field] }, ctx);
        },
        meta(key: string): Promise<EcbtApiResult> {
            return invokeEcbt({ fn: 'meta', args: [key] }, ctx);
        },
        call(fnId: string, ...args: unknown[]): Promise<EcbtApiResult> {
            return invokeEcbt({ fn: fnId, args: args.map(argToInvokerString) }, ctx);
        },
        evaluate(expr: string): Promise<EcbtApiResult> {
            return invokeEcbt(expr, ctx);
        },
        listFunctions(): readonly EcbtCatalogItem[] {
            const science: readonly EcbtCatalogItem[] = listPublicScienceFunctions().map(
                (s: ScienceCatalogItem) =>
                    Object.freeze({
                        id: s.id,
                        kind: 'science' as const,
                        arity: s.arity,
                        params: s.params,
                        description: s.description,
                        category: s.category,
                    }),
            );
            return Object.freeze([...PRIMITIVE_CATALOG, ...science]);
        },
    };

    maybeExposeGlobal(client, opts.exposeGlobal !== false);
    return client;
}

// ----------------------------------------------------------------
// EXPOSIÇÃO GLOBAL (browser-only, guarded)
// ----------------------------------------------------------------

/** Shape mínima de globalThis com a propriedade ecbt (sem poluir o tipo Window). */
interface GlobalWithEcbt {
    ecbt?: EcbtClient;
}

/**
 * Seta `window.ecbt` no browser. Guard typeof window: em Node não faz nada.
 * Idempotente: se já existir um ecbt, NÃO sobrescreve (primeira instância vence),
 * evitando que um segundo createEcbtClient derrube o cliente do add-in.
 */
function maybeExposeGlobal(client: EcbtClient, expose: boolean): void {
    if (!expose) return;
    if (typeof window === 'undefined') return;
    const g = window as unknown as GlobalWithEcbt;
    if (g.ecbt === undefined) {
        g.ecbt = client;
    }
}

// ----------------------------------------------------------------
// AUTO-BOOT no browser (default client) — opt-out via flag global.
// ----------------------------------------------------------------

/**
 * No browser, cria automaticamente um cliente default (sem loader injetado —
 * primitivas precisarão de um runtime que registre o loader depois) e o expõe
 * em window.ecbt. Em Node nada acontece (typeof window === 'undefined').
 *
 * Opt-out: setar window.__ECBT_NO_AUTOBOOT = true ANTES de carregar este módulo
 * (ex.: quando o runtime quer criar o cliente com loader/decoders próprios).
 */
function autoBootBrowser(): void {
    if (typeof window === 'undefined') return;
    const flags = window as unknown as { __ECBT_NO_AUTOBOOT?: boolean } & GlobalWithEcbt;
    if (flags.__ECBT_NO_AUTOBOOT === true) return;
    if (flags.ecbt !== undefined) return;
    createEcbtClient();
}

autoBootBrowser();
