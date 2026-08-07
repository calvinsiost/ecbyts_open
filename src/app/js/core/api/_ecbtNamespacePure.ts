// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   ECBT UNIVERSAL API — NAMESPACE ecbt.* (FASE 1, pure-logic)
   SPEC: docs/specs/arch/SPEC_ECBT_UNIVERSAL_API.md (RF2, RF9)

   Lógica PURA (zero DOM / zero window / zero IO) que sustenta o
   namespace público `ecbt.*`:

     ecbt.table("CHAVE")          → primitiva (leitura tabular)
     ecbt.sum("CHAVE","coluna")   → primitiva (agregação)
     ecbt.handleAddElement(...)   → action pública (ACTION_REGISTRY)

   Três responsabilidades, todas determinísticas e testáveis isoladas:

   1. resolveEcbtFunction(name, registry) — classifica o nome chamado
      em {kind:'primitive'|'action'|'unknown', target}.
      • Primitivas: conjunto fixo hardcoded (table/value/sum/history/meta).
      • Actions: casa contra ACTION_REGISTRY (campo `name`) SE pública.
        NOTA (Calvin pendente): ainda não existe campo `apiPublic` no
        registry; por ora usamos `headlessSafe` como PROXY de apiPublic
        até o Calvin curar a taxonomia (ver registry.ts).
      • Caso contrário → kind:'unknown'.

   2. makeApiError / makeApiOk — envelopes padronizados. O caller NUNCA
      recebe string crua nem exceção: tudo via envelope discriminado.
      Códigos canônicos em ECBT_API_ERROR_CODES (RF9).

   3. parseEcbtCall(expr) — parser leve de `ecbt.fn("a","b")`.
      Tolerante a aspas simples/duplas; malformado → bad_args (envelope).

   ANTI-PATTERN evitado: dependência em runtime (window/DOM). O registry
   é INJETADO — esta camada é a "matemática" do namespace, plugável tanto
   no browser quanto no motor headless / api-server.
   ================================================================ */

// ----------------------------------------------------------------------------
// Tipos do registry (estrutural — não importamos ACTION_REGISTRY para manter
// esta camada pura e sem ciclo; o caller injeta o array de entries).
// ----------------------------------------------------------------------------

/**
 * Subconjunto estrutural de uma entrada do ACTION_REGISTRY relevante para a
 * resolução do namespace. Mantido frouxo de propósito: só exigimos `name` e
 * lemos `headlessSafe`/`apiPublic` quando presentes.
 */
export interface EcbtActionEntry {
    readonly name: string;
    readonly headlessSafe?: boolean;
    /**
     * Campo futuro (Calvin pendente). Quando existir, tem prioridade sobre o
     * proxy `headlessSafe`. Enquanto undefined, caímos no proxy.
     */
    readonly apiPublic?: boolean;
}

// ----------------------------------------------------------------------------
// 1. Primitivas conhecidas (hardcoded set)
// ----------------------------------------------------------------------------

/**
 * Primitivas de leitura do namespace `ecbt.*`. Conjunto FECHADO e versionado:
 * adicionar primitiva é uma decisão de spec, não acidente de runtime.
 */
export const ECBT_PRIMITIVES = ['table', 'value', 'sum', 'history', 'meta'] as const;

export type EcbtPrimitive = (typeof ECBT_PRIMITIVES)[number];

const PRIMITIVE_SET: ReadonlySet<string> = new Set<string>(ECBT_PRIMITIVES);

// ----------------------------------------------------------------------------
// 2. Códigos de erro canônicos (RF9) + envelopes
// ----------------------------------------------------------------------------

/**
 * Códigos de erro canônicos do envelope da API (RF9). Const object em vez de
 * enum para emitir zero runtime extra e funcionar como union de literais.
 */
export const ECBT_API_ERROR_CODES = {
    keyNotFound: 'key_not_found',
    unknownFunction: 'unknown_function',
    unauthorized: 'unauthorized',
    rateLimited: 'rate_limited',
    badArgs: 'bad_args',
    internal: 'internal',
} as const;

export type EcbtApiErrorCode = (typeof ECBT_API_ERROR_CODES)[keyof typeof ECBT_API_ERROR_CODES];

/** Envelope de erro — nunca string crua, nunca throw para o caller. */
export interface EcbtApiError {
    readonly ok: false;
    readonly error: {
        readonly code: EcbtApiErrorCode;
        readonly message: string;
        readonly hint?: string;
    };
}

/** Envelope de sucesso. `kind` ecoa a categoria resolvida; `data` é o payload. */
export interface EcbtApiOk<TData = unknown, TMeta = unknown> {
    readonly ok: true;
    readonly kind: string;
    readonly data: TData;
    readonly meta?: TMeta;
}

export type EcbtApiResult<TData = unknown, TMeta = unknown> = EcbtApiOk<TData, TMeta> | EcbtApiError;

/**
 * Constrói um envelope de erro padronizado.
 * `hint` é opcional e só é incluído quando fornecido (respeita
 * exactOptionalPropertyTypes — não emitimos `hint: undefined`).
 */
export function makeApiError(code: EcbtApiErrorCode, message: string, hint?: string): EcbtApiError {
    const error =
        hint === undefined
            ? { code, message }
            : { code, message, hint };
    return { ok: false, error };
}

/**
 * Constrói um envelope de sucesso padronizado.
 * `meta` é opcional e omitido quando undefined.
 */
export function makeApiOk<TData, TMeta = unknown>(
    kind: string,
    data: TData,
    meta?: TMeta,
): EcbtApiOk<TData, TMeta> {
    if (meta === undefined) {
        return { ok: true, kind, data };
    }
    return { ok: true, kind, data, meta };
}

// ----------------------------------------------------------------------------
// 1 (cont). resolveEcbtFunction — classificação primitive|action|unknown
// ----------------------------------------------------------------------------

export type EcbtResolutionKind = 'primitive' | 'action' | 'unknown';

export interface EcbtResolution {
    readonly kind: EcbtResolutionKind;
    /**
     * Nome resolvido quando reconhecido (primitiva ou handler da action);
     * `null` quando kind === 'unknown'.
     */
    readonly target: string | null;
}

/**
 * Decide se uma action é exposta no namespace público `ecbt.*`.
 * Hoje: `apiPublic` se definido, senão PROXY via `headlessSafe`.
 * (Calvin pendente: curar `apiPublic` no ACTION_REGISTRY e remover o proxy.)
 */
function isActionApiPublic(entry: EcbtActionEntry): boolean {
    if (entry.apiPublic !== undefined) {
        return entry.apiPublic === true;
    }
    return entry.headlessSafe === true;
}

function resolvePrimitive(name: string): EcbtResolution | null {
    if (PRIMITIVE_SET.has(name)) {
        return { kind: 'primitive', target: name };
    }
    return null;
}

function resolveAction(name: string, registry: readonly EcbtActionEntry[]): EcbtResolution | null {
    const entry = registry.find((e) => e.name === name);
    if (entry !== undefined && isActionApiPublic(entry)) {
        return { kind: 'action', target: entry.name };
    }
    return null;
}

/**
 * Resolve o nome chamado contra o conjunto de primitivas e o registry.
 *
 * @param name     Nome chamado (ex.: 'table', 'sum', 'xpto', 'handleGetIssues').
 * @param registry Lista de actions (ACTION_REGISTRY ou subconjunto estrutural).
 * @returns {kind, target}. Primitiva e action pública resolvem; demais → unknown.
 *
 * Determinístico, sem efeitos colaterais. Nomes vazios/whitespace → unknown.
 */
export function resolveEcbtFunction(
    name: string,
    registry: readonly EcbtActionEntry[],
): EcbtResolution {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (trimmed.length === 0) {
        return { kind: 'unknown', target: null };
    }

    // Primitivas têm prioridade — namespace reservado.
    const primitive = resolvePrimitive(trimmed);
    if (primitive !== null) return primitive;

    // Action: casa por nome E precisa ser pública.
    const action = resolveAction(trimmed, registry);
    if (action !== null) return action;

    // Nome existe no registry mas NÃO é público → tratado como unknown
    // (não vazamos a existência de actions privadas pelo namespace público).
    return { kind: 'unknown', target: null };
}

// ----------------------------------------------------------------------------
// 3. parseEcbtCall — parser leve de "ecbt.fn(\"a\",\"b\")"
// ----------------------------------------------------------------------------

export interface EcbtParsedCall {
    readonly fn: string;
    readonly args: readonly string[];
}

/**
 * Casa: opcional `ecbt.` + identificador + `(` ... `)`. Captura o miolo dos
 * parênteses para tokenização posterior dos argumentos.
 */
const CALL_SHAPE = /^(?:ecbt\.)?([A-Za-z_$][\w$]*)\s*\(([\s\S]*)\)$/;

function isSupportedQuote(ch: string): ch is '"' | "'" {
    return ch === '"' || ch === "'";
}

function readStringLiteral(input: string, start: number, quote: '"' | "'"): { value: string; nextIndex: number } | null {
    let i = start;
    let value = '';
    const n = input.length;
    while (i < n) {
        const ch = input.charAt(i);
        if (ch === '\\' && i + 1 < n) {
            // escape simples: preserva o próximo char literalmente
            value += input.charAt(i + 1);
            i += 2;
            continue;
        }
        if (ch === quote) {
            return { value, nextIndex: i + 1 };
        }
        value += ch;
        i++;
    }
    return null; // aspas não fechadas
}

function readArgument(input: string, start: number): { value: string; nextIndex: number } | null {
    let i = start;
    const n = input.length;
    while (i < n && /\s/.test(input.charAt(i))) i++;
    if (i >= n) return null;

    const quote = input.charAt(i);
    if (!isSupportedQuote(quote)) return null; // Fase 1: só literais de string.

    const result = readStringLiteral(input, i + 1, quote);
    if (result === null) return null;

    // pula espaços após o argumento
    i = result.nextIndex;
    while (i < n && /\s/.test(input.charAt(i))) i++;

    return { value: result.value, nextIndex: i };
}

/**
 * Tokeniza a lista de argumentos string-literais separados por vírgula.
 * Tolera aspas simples e duplas. Suporta strings vazias ("").
 * Retorna null se algum token não for um literal de string bem-formado
 * (ex.: número cru, identificador, aspas não fechadas) — mantemos a Fase 1
 * estritamente string-args (RF2) e rejeitamos o resto como bad_args.
 */
function tokenizeArgs(inner: string): string[] | null {
    const trimmed = inner.trim();
    if (trimmed.length === 0) {
        return [];
    }

    const args: string[] = [];
    let i = 0;
    const n = trimmed.length;

    // expectArg começa true: SEMPRE esperamos ao menos um argumento aqui
    // (o caso vazio já retornou acima). Após uma vírgula, volta a true — assim
    // uma vírgula pendurada (ex.: "a", ) cai no `return null` final.
    let expectArg = true;

    while (i < n) {
        const argument = readArgument(trimmed, i);
        if (argument === null) {
            return expectArg ? null : args; // trailing comma → null; espaços no fim → ok
        }

        args.push(argument.value);
        expectArg = false;
        i = argument.nextIndex;

        if (i >= n) {
            break; // fim normal
        }
        if (trimmed.charAt(i) !== ',') {
            return null; // lixo entre argumentos
        }
        i++; // consome a vírgula e segue para o próximo arg
        expectArg = true; // após vírgula, exigimos mais um argumento
    }

    // Se saímos do laço ainda esperando um argumento, havia uma vírgula
    // pendurada (ex.: 'ecbt.sum("a", )') → malformado.
    if (expectArg) {
        return null;
    }

    return args;
}

/**
 * Parser leve de uma chamada do namespace.
 *   parseEcbtCall('ecbt.table("WELL_PH")')        → ok {fn:'table', args:['WELL_PH']}
 *   parseEcbtCall("sum('K','col')")               → ok {fn:'sum', args:['K','col']}
 *   parseEcbtCall('ecbt.table(')                  → bad_args
 *
 * @returns Envelope: ok com {fn,args} ou erro bad_args. NUNCA lança.
 */
export function parseEcbtCall(expr: string): EcbtApiResult<EcbtParsedCall> {
    if (typeof expr !== 'string') {
        return makeApiError(
            ECBT_API_ERROR_CODES.badArgs,
            'Expression must be a string.',
            'Example: ecbt.table("KEY")',
        );
    }

    const match = CALL_SHAPE.exec(expr.trim());
    if (match === null) {
        return makeApiError(
            ECBT_API_ERROR_CODES.badArgs,
            'Malformed call expression.',
            'Expected form: ecbt.fn("arg", "arg")',
        );
    }

    // match[1]/match[2] são garantidos pelos grupos da regex, mas
    // noUncheckedIndexedAccess exige a checagem explícita.
    const fn = match.at(1);
    const inner = match.at(2);
    if (fn === undefined || inner === undefined) {
        return makeApiError(ECBT_API_ERROR_CODES.badArgs, 'Malformed call expression.');
    }

    const args = tokenizeArgs(inner);
    if (args === null) {
        return makeApiError(
            ECBT_API_ERROR_CODES.badArgs,
            'Arguments must be quoted string literals separated by commas.',
            'Example: ecbt.sum("KEY", "column")',
        );
    }

    return makeApiOk<EcbtParsedCall>('parsed_call', { fn, args });
}
