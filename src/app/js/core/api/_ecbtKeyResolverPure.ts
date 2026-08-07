// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   ECBT UNIVERSAL API — RESOLVER DE CHAVE ECBT (FASE 1, pure-logic)

   SPEC alvo: docs/specs/arch/SPEC_ECBT_UNIVERSAL_API.md (RF1, RF3 parte meta).
   NOTA DE HONESTIDADE: no momento desta slice o arquivo de SPEC nomeado não
   existe no repositório (somente specs ECBT relacionadas em docs/specs/**).
   As suposições de formato abaixo foram derivadas do CÓDIGO REAL existente —
   ver bloco "FORMATO DA CHAVE ECBT" — e não de prosa de SPEC.

   ----------------------------------------------------------------
   FORMATO DA CHAVE ECBT (entendido a partir do código)

   A "chave ECBT" encoda um estado de modelo/dataset em UMA das duas formas:

   1) CHAVE-ECBT-CANÔNICA (core/io/decoder.ts):
        ECBT.{A|B|C|D}{7hex}-...-{sufixo}   (tipo A simples / B blockchain /
        C comprimido / D criptografado), OU o legado ECO{n}-...
        decoder.decodeKey/decodeKeyUniversal → objeto MODELO (JSON).

   2) DEEP-LINK base64url (utils/sharing/deepLinkParser.ts):
        payload base64url → JSON.parse → objeto de ESTADO.
        decodeBase64Url() é a função pura reaproveitada aqui.

   3) ID-DE-DATASET: string curta sem prefixo ECBT/ECO e não-base64url-JSON;
        tratada como referência (id) a ser resolvida pelo loader injetado.

   PUREZA / INJEÇÃO:
   Esta função NÃO faz I/O. O runtime injeta:
     - `decodeCanonical?(key)` — wrapper de decoder.decodeKey (sync) p/ chaves ECBT/ECO
     - `decodeBase64UrlJson?(key)` — wrapper de deepLinkParser.decodeBase64Url + JSON.parse
     - `loadDatasetById?(id)`     — loader real (Supabase/Storage), resolve um id

   A função pura apenas: normaliza a string, CLASSIFICA a forma, chama o decoder/
   loader injetado apropriado, e VALIDA+NORMALIZA o resultado num Dataset estável.

   Cheap test: tests/ecbt-key-resolver-pure.test.mjs (loader-stub via injeção).
   ================================================================ */

// ----------------------------------------------------------------
// TIPOS DO DATASET / META (estilo ecbt.meta)
// ----------------------------------------------------------------

/** Tipo lógico de uma coluna (honesto: 'unknown' quando não inferível). */
export type EcbtColumnType = 'number' | 'string' | 'boolean' | 'date' | 'unknown';

/** Descritor de coluna — base do meta estilo ecbt.meta. */
export interface EcbtColumn {
    readonly name: string;
    /** Unidade física (ex.: 'mg/L', 'm'); null quando adimensional/desconhecida. */
    readonly unit: string | null;
    readonly type: EcbtColumnType;
}

/** Uma linha = mapa coluna→valor (JSON-safe). */
export type EcbtRow = Readonly<Record<string, unknown>>;

/** Meta do dataset (subconjunto persistido na chave, quando presente). */
export interface EcbtDatasetMeta {
    readonly columns: readonly EcbtColumn[];
    /** ISO-8601 de quando os dados foram capturados/computados; null se ausente. */
    readonly freshness: string | null;
    /** Origem legível (ex.: 'ecbt-key:A', 'deep-link', 'dataset-id', loader). */
    readonly source: string;
    /** id do dataset/modelo, quando a chave o carrega. */
    readonly id?: string;
    /** título/nome legível, quando presente. */
    readonly title?: string;
}

/** Dataset normalizado retornado pelo resolver. */
export interface EcbtDataset {
    readonly rows: readonly EcbtRow[];
    readonly columns: readonly EcbtColumn[];
    readonly meta: EcbtDatasetMeta;
}

// ----------------------------------------------------------------
// RESULTADO DO describeKey (RF3 — parte meta)
// ----------------------------------------------------------------

export interface EcbtKeyDescription {
    readonly columns: readonly EcbtColumn[];
    readonly rowCount: number;
    /** ISO-8601 ou null quando o dataset não declara frescor (honesto). */
    readonly freshness: string | null;
    readonly source: string;
    readonly id?: string;
    readonly title?: string;
}

// ----------------------------------------------------------------
// RESULTADO DO resolveEcbtKey
// ----------------------------------------------------------------

export type EcbtResolveErrorCode = 'key_not_found' | 'bad_key';

export interface EcbtResolveSuccess {
    readonly ok: true;
    readonly dataset: EcbtDataset;
}

export interface EcbtResolveFailure {
    readonly ok: false;
    readonly code: EcbtResolveErrorCode;
    /** Detalhe não-fatal p/ telemetry; nunca vaza a chave inteira. */
    readonly detail?: string;
}

export type EcbtResolveResult = EcbtResolveSuccess | EcbtResolveFailure;

// ----------------------------------------------------------------
// INJEÇÃO (loaders/decoders fornecidos pelo runtime)
// ----------------------------------------------------------------

/**
 * Resultado bruto de um decoder/loader injetado. Pode ser:
 *  - um objeto "dataset-like" (rows/columns/meta), OU
 *  - um objeto "modelo/estado" arbitrário (será normalizado heuristicamente).
 * `null`/`undefined` = não-resolvido (→ key_not_found).
 */
export type DecodedPayload = Readonly<Record<string, unknown>> | null | undefined;

export interface ResolveOptions {
    /** Decodifica chave canônica ECBT.{A|B}.. / ECO.. → modelo (sync). */
    readonly decodeCanonical?: (key: string) => DecodedPayload;
    /** Decodifica base64url → JSON (deep-link). Retorna objeto ou null. */
    readonly decodeBase64UrlJson?: (key: string) => DecodedPayload;
    /** Resolve um id de dataset via storage real (injetado). */
    readonly loadDatasetById?: (id: string) => DecodedPayload;
    /**
     * Limite defensivo de tamanho da chave (anti-DOS). Default 1MB de chars.
     */
    readonly maxKeyChars?: number;
}

const DEFAULT_MAX_KEY_CHARS = 1_000_000;

// ----------------------------------------------------------------
// HELPERS PUROS
// ----------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

/**
 * Normaliza a string-chave: remove espaços nas pontas e aspas envolventes
 * (simples/duplas) que copy-paste costuma adicionar.
 */
export function normalizeKey(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    let s = raw.trim();
    // Remove aspas envolventes repetidas (ex.: '"ECBT.A..."' ou "'id'").
    while (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
        s = s.slice(1, -1).trim();
    }
    return s;
}

/** Classifica a forma da chave normalizada (não decodifica). */
export type KeyShape = 'canonical' | 'base64url-json' | 'dataset-id' | 'empty';

const CANONICAL_PREFIX = /^(ECBT\.|ECO\d)/;
const BASE64URL_CHARS = /^[A-Za-z0-9_-]+$/;

export function classifyKeyShape(key: string): KeyShape {
    if (key.length === 0) return 'empty';
    if (CANONICAL_PREFIX.test(key)) return 'canonical';
    // base64url-json heurística: só chars base64url E comprimento plausível p/ JSON.
    // ids de dataset costumam ser curtos (uuid/slug); base64url-json é maior.
    if (BASE64URL_CHARS.test(key) && key.length >= 8) return 'base64url-json';
    return 'dataset-id';
}

function isoOrNull(v: unknown): string | null {
    if (typeof v !== 'string' || v.length === 0) return null;
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : v;
}

function inferColumnType(values: readonly unknown[]): EcbtColumnType {
    let seen = false;
    let t: EcbtColumnType = 'unknown';
    for (const v of values) {
        if (v === null || v === undefined) continue;
        let cur: EcbtColumnType;
        if (typeof v === 'number') cur = 'number';
        else if (typeof v === 'boolean') cur = 'boolean';
        else if (typeof v === 'string') cur = isoOrNull(v) ? 'date' : 'string';
        else cur = 'unknown';
        if (!seen) {
            t = cur;
            seen = true;
        } else if (t !== cur) {
            // tipos mistos → string é o menor denominador seguro (exceto unknown)
            t = cur === 'unknown' || t === 'unknown' ? 'unknown' : 'string';
        }
    }
    return t;
}

function freezeColumn(c: EcbtColumn): EcbtColumn {
    return Object.freeze({ name: c.name, unit: c.unit, type: c.type });
}

/**
 * Constrói descritores de coluna a partir de rows + (opcional) meta de colunas
 * declarado na própria chave. Quando a chave declara columns com unit/type,
 * eles têm precedência; caso contrário inferimos type das rows e unit=null.
 */
function buildColumns(rows: readonly EcbtRow[], declared: unknown): readonly EcbtColumn[] {
    // 1) colunas declaradas explicitamente na chave (estilo ecbt.meta)
    if (Array.isArray(declared)) {
        const out: EcbtColumn[] = [];
        for (const d of declared) {
            if (isNonEmptyString(d)) {
                out.push(freezeColumn({ name: d, unit: null, type: 'unknown' }));
            } else if (isPlainObject(d) && isNonEmptyString(d.name)) {
                const unit = isNonEmptyString(d.unit) ? d.unit : null;
                const type = isColumnType(d.type) ? d.type : 'unknown';
                out.push(freezeColumn({ name: d.name, unit, type }));
            }
        }
        if (out.length > 0) {
            // se rows existem mas declared não trouxe type, refina por inferência
            return Object.freeze(
                out.map((c) => {
                    if (c.type !== 'unknown') return c;
                    const vals = rows.map((r) => r[c.name]);
                    return freezeColumn({ ...c, type: inferColumnType(vals) });
                }),
            );
        }
    }
    // 2) deriva das keys das rows
    const names: string[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
        for (const k of Object.keys(r)) {
            if (!seen.has(k)) {
                seen.add(k);
                names.push(k);
            }
        }
    }
    return Object.freeze(
        names.map((name) =>
            freezeColumn({
                name,
                unit: null,
                type: inferColumnType(rows.map((r) => r[name])),
            }),
        ),
    );
}

function isColumnType(v: unknown): v is EcbtColumnType {
    return v === 'number' || v === 'string' || v === 'boolean' || v === 'date' || v === 'unknown';
}

function asRows(v: unknown): readonly EcbtRow[] | null {
    if (!Array.isArray(v)) return null;
    const out: EcbtRow[] = [];
    for (const r of v) {
        if (isPlainObject(r)) out.push(Object.freeze({ ...r }));
        else return null; // linha não-objeto → não é um dataset tabular válido
    }
    return Object.freeze(out);
}

/**
 * Normaliza um payload decodificado (dataset-like OU modelo arbitrário) num
 * EcbtDataset estável. Determinístico: mesma entrada → mesma saída.
 *
 * Reconhece (em ordem):
 *   - { rows, columns?, meta? }      (dataset-like canônico)
 *   - { dataset: {...} }             (wrapper)
 *   - { data: [...] } / [...]        (array de linhas direto)
 * Quando nenhuma forma tabular é encontrada, retorna dataset vazio (rows: [])
 * preservando meta honesta (source + freshness:null) — NÃO inventa dados.
 */
export function normalizeDataset(payload: DecodedPayload, source: string): EcbtDataset {
    const root: Record<string, unknown> = isPlainObject(payload) ? payload : {};

    // localizar rows
    let rows: readonly EcbtRow[] | null = null;
    let declaredColumns: unknown = undefined;
    let metaObj: Record<string, unknown> | null;
    let id: unknown = root.id;
    let title: unknown = root.title ?? root.name;
    let freshness: unknown = root.freshness ?? root.updatedAt ?? root.timestamp;

    if (Array.isArray(payload)) {
        rows = asRows(payload);
    } else if (isPlainObject(payload)) {
        const ds = isPlainObject(payload.dataset) ? payload.dataset : null;
        const target = ds ?? payload;
        rows = asRows(target.rows) ?? asRows(target.data);
        declaredColumns = target.columns;
        if (isPlainObject(target.meta)) {
            metaObj = target.meta;
            declaredColumns = declaredColumns ?? metaObj.columns;
            id = id ?? metaObj.id;
            title = title ?? metaObj.title ?? metaObj.name;
            freshness = freshness ?? metaObj.freshness ?? metaObj.updatedAt;
        }
        if (ds) {
            id = id ?? ds.id;
            title = title ?? ds.title ?? ds.name;
            freshness = freshness ?? ds.freshness ?? ds.updatedAt;
        }
    }

    const safeRows: readonly EcbtRow[] = rows ?? Object.freeze([]);
    const columns = buildColumns(safeRows, declaredColumns);

    const meta: EcbtDatasetMeta = Object.freeze({
        columns,
        freshness: isoOrNull(freshness),
        source,
        ...(isNonEmptyString(id) ? { id } : {}),
        ...(isNonEmptyString(title) ? { title } : {}),
    });

    return Object.freeze({
        rows: safeRows,
        columns,
        meta,
    });
}

// ----------------------------------------------------------------
// RF1 — resolveEcbtKey
// ----------------------------------------------------------------

/**
 * Resolve uma string-chave ECBT para um dataset normalizado.
 *
 * PURE: não faz I/O. Decoders/loaders são injetados via `opts`.
 *
 * Contrato de erro:
 *   - chave vazia/whitespace/aspas-vazias  → { ok:false, code:'key_not_found' }
 *   - decoder/loader retorna null/undefined → { ok:false, code:'key_not_found' }
 *   - decoder/loader LANÇA, ou chave malformada que parece chave mas não decodifica
 *                                            → { ok:false, code:'bad_key' }
 */
export function resolveEcbtKey(key: unknown, opts: ResolveOptions = {}): EcbtResolveResult {
    const maxChars =
        typeof opts.maxKeyChars === 'number' && opts.maxKeyChars > 0 ? opts.maxKeyChars : DEFAULT_MAX_KEY_CHARS;

    const normalized = normalizeKey(key);
    if (normalized.length === 0) {
        return Object.freeze({ ok: false, code: 'key_not_found', detail: 'empty key after normalization' });
    }
    if (normalized.length > maxChars) {
        return Object.freeze({ ok: false, code: 'bad_key', detail: 'key exceeds max length' });
    }

    const shape = classifyKeyShape(normalized);

    let decoded: DecodedPayload;
    let source: string;

    try {
        if (shape === 'canonical') {
            source = 'ecbt-key';
            if (typeof opts.decodeCanonical !== 'function') {
                return Object.freeze({ ok: false, code: 'key_not_found', detail: 'no canonical decoder injected' });
            }
            decoded = opts.decodeCanonical(normalized);
        } else if (shape === 'base64url-json') {
            source = 'deep-link';
            if (typeof opts.decodeBase64UrlJson === 'function') {
                decoded = opts.decodeBase64UrlJson(normalized);
            } else if (typeof opts.loadDatasetById === 'function') {
                // sem decoder de deep-link → trata como id
                source = 'dataset-id';
                decoded = opts.loadDatasetById(normalized);
            } else {
                return Object.freeze({ ok: false, code: 'key_not_found', detail: 'no decoder/loader injected' });
            }
        } else {
            // dataset-id
            source = 'dataset-id';
            if (typeof opts.loadDatasetById !== 'function') {
                return Object.freeze({ ok: false, code: 'key_not_found', detail: 'no dataset loader injected' });
            }
            decoded = opts.loadDatasetById(normalized);
        }
    } catch (e) {
        return Object.freeze({
            ok: false,
            code: 'bad_key',
            detail: (e as Error)?.message ? String((e as Error).message).slice(0, 200) : 'decoder threw',
        });
    }

    if (decoded === null || decoded === undefined) {
        return Object.freeze({ ok: false, code: 'key_not_found', detail: `${shape} not resolved` });
    }
    if (!isPlainObject(decoded) && !Array.isArray(decoded)) {
        return Object.freeze({ ok: false, code: 'bad_key', detail: 'decoded payload is not an object/array' });
    }

    const dataset = normalizeDataset(decoded, source);
    return Object.freeze({ ok: true, dataset });
}

// ----------------------------------------------------------------
// RF3 (parte meta) — describeKey
// ----------------------------------------------------------------

/**
 * Descreve o meta de um resultado resolvido (estilo ecbt.meta).
 * Aceita um EcbtResolveResult OU um EcbtDataset diretamente.
 * Para resultados de erro retorna null (nada a descrever).
 *
 * freshness honesto: null quando o dataset não declara frescor (não inventa).
 */
export function describeKey(resolved: EcbtResolveResult | EcbtDataset | null | undefined): EcbtKeyDescription | null {
    if (!resolved) return null;

    let dataset: EcbtDataset | null = null;
    if ('ok' in resolved) {
        if (resolved.ok === false) return null;
        dataset = resolved.dataset;
    } else if ('rows' in resolved && 'meta' in resolved) {
        dataset = resolved;
    }
    if (!dataset) return null;

    const { meta, rows, columns } = dataset;
    return Object.freeze({
        columns,
        rowCount: rows.length,
        freshness: meta.freshness ?? null,
        source: meta.source,
        ...(meta.id ? { id: meta.id } : {}),
        ...(meta.title ? { title: meta.title } : {}),
    });
}
