// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   ECBT UNIVERSAL API — INVOKER DO TIER CLIENTE (FASE 2 runtime)

   ADR: docs/specs/arch/ADR_ECBT_API_CLIENT_VS_SERVER.md (TIER CLIENTE aprovado).
   SPEC: docs/specs/arch/SPEC_ECBT_UNIVERSAL_API.md (RF2/RF3/RF9).

   ----------------------------------------------------------------
   O QUE É

   A Fase 1 entregou a "matemática" PURA do namespace (parser, resolver de chave,
   primitivas tabulares, catálogo científico). NENHUMA dessas camadas invoca nada:
   elas classificam, descrevem e resolvem para {module, export} — mas não fazem
   import dinâmico nem chamam a função real.

   Este arquivo é o INVOKER do TIER CLIENTE: o orquestrador de runtime que roda no
   NAVEGADOR do usuário (pure-logic, sem servidor) e EFETIVAMENTE invoca as
   funções, sempre retornando um envelope {ok,...} — NUNCA lança para o caller.

   Roteamento (invokeEcbt):
     (a) primitiva  table/sum/value/meta → resolve a chave (loader injetado em ctx
         via resolveEcbtKey) → adapta o dataset à shape das primitivas → chama
         ecbtTable/ecbtSum/ecbtValue/describeKey.
     (b) função científica → resolveScienceFunction(id) → IMPORT DINÂMICO do .js
         buildado (importer injetável p/ Node-test e browser) → valida arity →
         coage args string→number quando aplicável → chama a função REAL →
         makeApiOk.
     (c) unknown → makeApiError('unknown_function').

   GUARD clientSafe (RF2):
     - Só invoca funções pure/clientSafe. As entradas do manifest científico são
       todas pure:true (resolveScienceFunction já recusa não-pura). As primitivas
       são puras por construção.
     - Hook para um futuro tier server: se o manifest marcar uma entrada como
       server-only (tier !== 'client'/'universal'), o invoker recusa com hint
       'requires server tier'. Hoje nenhuma entrada é server-only — o guard é
       defesa-em-profundidade, não teatro.

   SEGURANÇA:
     - allowlist fechada: só ids do manifest E primitivas conhecidas são roteadas.
     - sanitizeForSpreadsheet aplicado a retornos string (anti CSV/Formula
       injection na planilha do usuário).
     - toda invocação real está dentro de try/catch → erro vira makeApiError
       ('internal'), nunca propaga exceção ao caller.
   ================================================================ */

import {
    ECBT_API_ERROR_CODES,
    makeApiError,
    makeApiOk,
    parseEcbtCall,
    type EcbtApiError,
    type EcbtApiResult,
    type EcbtParsedCall,
} from './_ecbtNamespacePure.js';
import {
    resolveEcbtKey,
    describeKey,
    type EcbtDataset as EcbtResolvedDataset,
    type EcbtKeyDescription,
    type ResolveOptions,
} from './_ecbtKeyResolverPure.js';
import {
    ecbtTable,
    ecbtSum,
    ecbtValue,
    sanitizeForSpreadsheet,
    type AggOp,
    type CellValue,
    type EcbtDataset as EcbtTabularDataset,
    type EcbtTableResult,
    type EcbtSumResult,
    type EcbtValueResult,
} from './_ecbtPrimitivesPure.js';
import {
    resolveScienceFunction,
    type ScienceResolution,
} from './ecbtScienceRegistry.js';
import { createKeyDecoders } from './ecbtDatasetAdapter.js';

// ----------------------------------------------------------------
// TIPOS PÚBLICOS DO INVOKER
// ----------------------------------------------------------------

/** Forma estruturada de uma chamada já parseada (igual ao parseEcbtCall). */
export type EcbtCall = EcbtParsedCall;

/** Entrada aceita por invokeEcbt: forma estruturada OU a string "ecbt.X(...)". */
export type EcbtCallInput = EcbtCall | string;

/**
 * Função que faz o import dinâmico de um módulo .js buildado.
 * Default (browser): `import(spec)`. No teste Node injetamos um importer que
 * mapeia o caminho 'app/js/...' para o file:// URL do .js realmente emitido.
 *
 * Retorna o namespace do módulo (mapa export-name → valor).
 */
export type EcbtModuleImporter = (modulePath: string) => Promise<Record<string, unknown>>;

/**
 * Contexto de runtime injetado no invoker. Tudo opcional: o invoker degrada com
 * honestidade (sem loader → primitivas com chave-id falham com key_not_found).
 */
export interface EcbtInvokeContext {
    /** Opções repassadas a resolveEcbtKey (decoders/loader de dataset injetados). */
    readonly resolve?: ResolveOptions;
    /** Importer de módulo .js para funções científicas. Default: import() nativo. */
    readonly importModule?: EcbtModuleImporter;
    /**
     * Op default de ecbt.sum quando o caller não a fornece (RF3). Default 'sum'.
     */
    readonly defaultSumOp?: AggOp;
}

// ----------------------------------------------------------------
// CONSTANTES / GUARDS
// ----------------------------------------------------------------

/** Primitivas que ESTE invoker roteia (subconjunto invocável de ECBT_PRIMITIVES). */
const INVOKER_PRIMITIVES: ReadonlySet<string> = new Set(['table', 'sum', 'value', 'meta']);

/** Ops de agregação válidas (espelha AggOp do módulo de primitivas). */
const VALID_AGG_OPS: ReadonlySet<string> = new Set(['sum', 'avg', 'min', 'max', 'count', 'p50', 'p75']);

/**
 * Importer default: dynamic import nativo. No browser resolve o .js servido;
 * em ambientes sem `import()` dinâmico cai num erro capturado pelo try/catch.
 */
const defaultImporter: EcbtModuleImporter = (modulePath: string) =>
    import(/* @vite-ignore */ modulePath) as Promise<Record<string, unknown>>;

/**
 * Decoders REAIS (decodeKey + decodeBase64Url + modelToDataset), construídos uma
 * única vez. São os DEFAULTS do tier cliente: ligam o resolver de chave aos
 * decoders reais sem que o caller precise injetá-los. Uma injeção explícita em
 * ctx.resolve SOBRESCREVE cada campo (testes mantêm seu loader-stub via injeção).
 */
const realKeyDecoders = createKeyDecoders();

/**
 * Decide as ResolveOptions efetivas para resolver a chave.
 *
 * CONTRATO (preserva os testes via injeção explícita):
 *  - Caller NÃO injeta nenhum decoder/loader (ctx.resolve ausente ou sem os 3
 *    slots) → usa os decoders REAIS (default do tier cliente). É o caminho de
 *    produção: ecbt.table("ECBT.A...") / ("base64url") decodifica de verdade.
 *  - Caller injeta QUALQUER decoder/loader (decodeCanonical | decodeBase64UrlJson
 *    | loadDatasetById) → respeita EXATAMENTE a injeção (os reais NÃO entram).
 *    Mantém o loader-stub dos testes do invoker intacto (sem decoder real
 *    sombreando o stub via classificação de shape).
 * `maxKeyChars` injetado é sempre preservado.
 */
function resolveOptionsFor(ctx: EcbtInvokeContext): ResolveOptions {
    const injected = ctx.resolve;
    const hasInjectedDecoder =
        !!injected &&
        (typeof injected.decodeCanonical === 'function' ||
            typeof injected.decodeBase64UrlJson === 'function' ||
            typeof injected.loadDatasetById === 'function');

    if (hasInjectedDecoder) {
        // Injeção explícita vence por inteiro (não mistura com os reais).
        return injected as ResolveOptions;
    }

    // Sem injeção de decoder → decoders REAIS; preserva maxKeyChars se fornecido.
    return injected
        ? { ...realKeyDecoders, ...(typeof injected.maxKeyChars === 'number' ? { maxKeyChars: injected.maxKeyChars } : {}) }
        : { ...realKeyDecoders };
}

// ----------------------------------------------------------------
// HELPERS PUROS
// ----------------------------------------------------------------

function isParsedCall(v: unknown): v is EcbtCall {
    return (
        typeof v === 'object' &&
        v !== null &&
        typeof (v as { fn?: unknown }).fn === 'string' &&
        Array.isArray((v as { args?: unknown }).args)
    );
}

/** Normaliza a entrada (string OU {fn,args}) numa EcbtCall, ou devolve erro. */
function normalizeInput(input: EcbtCallInput): EcbtApiResult<EcbtCall> {
    if (typeof input === 'string') {
        return parseEcbtCall(input);
    }
    if (isParsedCall(input)) {
        return makeApiOk<EcbtCall>('parsed_call', { fn: input.fn.trim(), args: input.args });
    }
    return makeApiError(
        ECBT_API_ERROR_CODES.badArgs,
        'invokeEcbt expects a string "ecbt.fn(...)" or a {fn, args} object.',
        'Example: invokeEcbt(\'ecbt.table("KEY")\', ctx)',
    );
}

/**
 * Adapta o EcbtDataset rico do resolver (rows: Record<string,unknown>[],
 * columns: EcbtColumn[]) para a shape tabular das primitivas
 * (columns: string[], rows: Record<string, CellValue>[]).
 *
 * PURO: só reprojeta nomes de coluna e força os valores ao tipo CellValue
 * (string|number|boolean|null|undefined). Objetos/arrays aninhados viram string
 * estável (JSON) — uma célula de planilha é escalar por definição.
 */
function toTabularDataset(ds: EcbtResolvedDataset): EcbtTabularDataset {
    const columns = ds.columns.map((c) => c.name);
    const rows = ds.rows.map((row) => {
        const out: Record<string, CellValue> = {};
        for (const name of columns) {
            out[name] = toCellValue(row[name]);
        }
        return out;
    });
    return { columns, rows };
}

/** Coage um valor JSON arbitrário a uma CellValue escalar e estável. */
function toCellValue(v: unknown): CellValue {
    if (v === null || v === undefined) return v;
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') {
        return v as CellValue;
    }
    // objetos/arrays → string JSON determinística (escalar p/ a célula).
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
}

/**
 * Coage um argumento string→number quando o valor parece numérico (planilha
 * sempre manda string). Mantém o resto intacto: a função científica real valida
 * tipos (e lança TypeError, que o invoker captura como 'internal').
 *
 * Regras:
 *  - já-number → passa.
 *  - string numérica finita ("3.14", " 12 ") → Number.
 *  - "true"/"false" → boolean (planilha booleana).
 *  - "[...]"/"{...}" → JSON.parse (arrays/objetos científicos via string).
 *  - resto → string crua.
 */
function coerceScienceArg(raw: unknown): unknown {
    if (typeof raw !== 'string') return raw;
    const s = raw.trim();
    if (s.length === 0) return raw;

    if (s === 'true') return true;
    if (s === 'false') return false;

    // número (não confundir "" com 0: já tratado acima).
    const n = Number(s);
    if (Number.isFinite(n) && /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) {
        return n;
    }

    // JSON estruturado (array/objeto) — útil p/ speciesCounts, pollutantReadings.
    const first = s.charAt(0);
    if (first === '[' || first === '{') {
        try {
            return JSON.parse(s);
        } catch {
            return raw; // não era JSON válido → string crua.
        }
    }

    return raw;
}

/** Sanitiza um retorno para a planilha: strings neutralizadas; resto intacto. */
function sanitizeReturn<T>(value: T): T {
    if (typeof value === 'string') {
        return sanitizeForSpreadsheet(value) as unknown as T;
    }
    return value;
}

// ----------------------------------------------------------------
// GUARD clientSafe — defesa-em-profundidade p/ futuro tier server
// ----------------------------------------------------------------

/**
 * Tier de execução de uma resolução científica. Hoje a ScienceResolution NÃO
 * carrega um campo `tier` — e resolveScienceFunction só retorna não-null para
 * entradas pure:true (a pureza já está garantida na origem). Este tipo é o hook
 * para uma futura fatia server-only sem reabrir o invoker.
 */
type ResolutionWithTier = ScienceResolution & { readonly tier?: 'client' | 'server' | 'universal' };

/**
 * Decide se uma resolução pode rodar no TIER CLIENTE.
 *
 * Invariante de origem: uma ScienceResolution não-null JÁ é pura
 * (resolveScienceFunction recusa entradas não-puras → null, capturado antes).
 * Aqui só barramos uma futura entrada server-only (tier === 'server').
 *
 * - resolução null jamais chega aqui (tratada como unknown_function antes).
 * - tier === 'server' → recusa (requires server tier).
 * - caso contrário (sem tier, 'client' ou 'universal') → ok.
 */
function isClientSafeResolution(resolution: ResolutionWithTier): boolean {
    if (resolution.tier === 'server') return false;
    return true;
}

// ----------------------------------------------------------------
// ROTEAMENTO DE PRIMITIVAS
// ----------------------------------------------------------------

async function invokePrimitive(
    fn: string,
    args: readonly string[],
    ctx: EcbtInvokeContext,
): Promise<EcbtApiResult> {
    const key = args[0];
    if (typeof key !== 'string' || key.trim().length === 0) {
        return makeApiError(
            ECBT_API_ERROR_CODES.badArgs,
            `Primitive '${fn}' requires a dataset key as the first argument.`,
            `Example: ecbt.${fn}("KEY")`,
        );
    }

    const resolved = resolveEcbtKey(key, resolveOptionsFor(ctx));
    if (resolved.ok === false) {
        const code =
            resolved.code === 'bad_key' ? ECBT_API_ERROR_CODES.badArgs : ECBT_API_ERROR_CODES.keyNotFound;
        return makeApiError(code, `Could not resolve dataset key (${resolved.code}).`, resolved.detail);
    }

    // ecbt.meta(key) → describeKey (não toca as primitivas tabulares).
    if (fn === 'meta') {
        const desc: EcbtKeyDescription | null = describeKey(resolved);
        if (desc === null) {
            return makeApiError(ECBT_API_ERROR_CODES.internal, 'Failed to describe resolved dataset.');
        }
        return makeApiOk('meta', desc, { source: desc.source });
    }

    const tabular = toTabularDataset(resolved.dataset);

    if (fn === 'table') {
        const r: EcbtTableResult | EcbtError = ecbtTable(tabular);
        if (r.ok === false) {
            return makeApiError(ECBT_API_ERROR_CODES.badArgs, r.message);
        }
        // ecbtTable já sanitiza cada célula; devolvemos a matriz como data.
        return makeApiOk('table', { header: r.header, rows: r.rows, matrix: r.matrix });
    }

    if (fn === 'sum') {
        const column = args[1];
        if (typeof column !== 'string' || column.length === 0) {
            return makeApiError(
                ECBT_API_ERROR_CODES.badArgs,
                "ecbt.sum requires a column name as the second argument.",
                'Example: ecbt.sum("KEY", "benzene", "avg")',
            );
        }
        const opArg = args[2];
        const op: AggOp = (typeof opArg === 'string' && VALID_AGG_OPS.has(opArg)
            ? opArg
            : ctx.defaultSumOp ?? 'sum') as AggOp;
        if (typeof opArg === 'string' && opArg.length > 0 && !VALID_AGG_OPS.has(opArg)) {
            return makeApiError(
                ECBT_API_ERROR_CODES.badArgs,
                `Unsupported aggregation op: ${opArg}`,
                'Valid ops: sum, avg, min, max, count, p50, p75.',
            );
        }
        const r: EcbtSumResult | EcbtError = ecbtSum(tabular, column, op);
        if (r.ok === false) {
            return makeApiError(ECBT_API_ERROR_CODES.badArgs, r.message);
        }
        return makeApiOk('sum', { op: r.op, column: r.column, value: r.value, count: r.count });
    }

    // fn === 'value'
    const field = args[1];
    if (typeof field !== 'string' || field.length === 0) {
        return makeApiError(
            ECBT_API_ERROR_CODES.badArgs,
            'ecbt.value requires a field as the second argument.',
            'Example: ecbt.value("KEY", "benzene") or ecbt.value("KEY", "2:benzene")',
        );
    }
    const r: EcbtValueResult | EcbtError = ecbtValue(tabular, field);
    if (r.ok === false) {
        return makeApiError(ECBT_API_ERROR_CODES.badArgs, r.message);
    }
    // ecbtValue já sanitiza; defensivamente reaplica em string (idempotente).
    return makeApiOk('value', { field: r.field, value: sanitizeReturn(r.value), found: r.found });
}

/** Shape estrutural do erro das primitivas (espelha EcbtError do módulo puro). */
interface EcbtError {
    readonly ok: false;
    readonly code: 'bad_args';
    readonly message: string;
}

// ----------------------------------------------------------------
// ROTEAMENTO DE FUNÇÕES CIENTÍFICAS
// ----------------------------------------------------------------

async function invokeScience(
    fn: string,
    args: readonly string[],
    ctx: EcbtInvokeContext,
): Promise<EcbtApiResult> {
    const resolution: ScienceResolution | null = resolveScienceFunction(fn);
    if (resolution === null) {
        return makeApiError(
            ECBT_API_ERROR_CODES.unknownFunction,
            `Unknown ecbt function: ${fn}`,
            'Use ecbt.listFunctions() to discover available functions.',
        );
    }

    // GUARD clientSafe (defesa-em-profundidade; resolveScienceFunction já recusa
    // não-pura, mas rechecamos o tier futuro server-only).
    if (!isClientSafeResolution(resolution as ResolutionWithTier)) {
        return makeApiError(
            ECBT_API_ERROR_CODES.unauthorized,
            `Function '${fn}' is not available in the client tier.`,
            'requires server tier',
        );
    }

    // Validação de arity ANTES de invocar (defesa contra under/over-application).
    if (args.length !== resolution.arity) {
        return makeApiError(
            ECBT_API_ERROR_CODES.badArgs,
            `Function '${fn}' expects ${resolution.arity} argument(s), got ${args.length}.`,
            `Expected params: ${resolution.params.join(', ') || '(none)'}`,
        );
    }

    // Coerção de args (planilha manda string → number/boolean/JSON onde cabe).
    const coerced = args.map((a) => coerceScienceArg(a));

    // IMPORT DINÂMICO do .js buildado (importer injetável p/ Node-test).
    const importer = ctx.importModule ?? defaultImporter;
    let ns: Record<string, unknown>;
    try {
        ns = await importer(resolution.module);
    } catch (e) {
        return makeApiError(
            ECBT_API_ERROR_CODES.internal,
            `Failed to load module for '${fn}'.`,
            truncate(errMessage(e)),
        );
    }

    const target = ns[resolution.export];
    if (typeof target !== 'function') {
        return makeApiError(
            ECBT_API_ERROR_CODES.internal,
            `Resolved export '${resolution.export}' is not callable in ${resolution.module}.`,
        );
    }

    // CHAMADA REAL — dentro de try/catch: nunca propaga exceção ao caller.
    try {
        const fnReal = target as (...fnArgs: unknown[]) => unknown;
        const result = fnReal(...coerced);
        const safe = deepSanitize(result);
        return makeApiOk('science', safe, { id: fn, category: resolution.category });
    } catch (e) {
        return makeApiError(ECBT_API_ERROR_CODES.internal, `Execution error in '${fn}'.`, truncate(errMessage(e)));
    }
}

/**
 * Sanitiza retornos string de funções científicas (resultado costuma ser objeto
 * numérico, mas alguns retornam classificações em string — ex.: status, level,
 * iucnCategory). Aplica sanitizeForSpreadsheet a toda string, recursivamente,
 * sem tocar números/booleanos.
 */
function deepSanitize(value: unknown): unknown {
    if (typeof value === 'string') {
        return sanitizeForSpreadsheet(value);
    }
    if (Array.isArray(value)) {
        return value.map((v) => deepSanitize(v));
    }
    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = deepSanitize(v);
        }
        return out;
    }
    return value;
}

function errMessage(e: unknown): string {
    if (e instanceof Error && typeof e.message === 'string') return e.message;
    return String(e);
}

function truncate(s: string, max = 200): string {
    return s.length > max ? `${s.slice(0, max)}…` : s;
}

// ----------------------------------------------------------------
// ENTRY — invokeEcbt
// ----------------------------------------------------------------

/**
 * Invoca uma chamada do namespace `ecbt.*` no TIER CLIENTE.
 *
 * @param call Forma estruturada {fn,args} OU a string "ecbt.X(...)".
 * @param ctx  Contexto injetado (resolver/loader, importer de módulo, defaults).
 * @returns SEMPRE um envelope {ok,...}. NUNCA lança.
 *
 * Roteamento: primitiva (table/sum/value/meta) → función científica → unknown.
 */
export async function invokeEcbt(
    call: EcbtCallInput,
    ctx: EcbtInvokeContext = {},
): Promise<EcbtApiResult> {
    try {
        const normalized = normalizeInput(call);
        if (normalized.ok === false) {
            return normalized;
        }
        const { fn, args } = normalized.data;

        if (INVOKER_PRIMITIVES.has(fn)) {
            return await invokePrimitive(fn, args, ctx);
        }

        // Não-primitiva: tenta ciência (allowlist do manifest). Desconhecido cai
        // em unknown_function dentro de invokeScience.
        return await invokeScience(fn, args, ctx);
    } catch (e) {
        // Rede de segurança final: jamais propaga exceção ao caller.
        return makeApiError(ECBT_API_ERROR_CODES.internal, 'Unexpected invoker error.', truncate(errMessage(e)));
    }
}

// Re-export de tipos úteis ao consumidor da fachada.
export type { EcbtApiResult, EcbtApiError };
