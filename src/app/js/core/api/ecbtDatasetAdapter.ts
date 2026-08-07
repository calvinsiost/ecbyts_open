// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   ECBT UNIVERSAL API — ADAPTADOR RUNTIME model → dataset tabular

   SPEC: docs/specs/arch/SPEC_ECBT_UNIVERSAL_API.md (RF1/RF2 — tier cliente).

   ----------------------------------------------------------------
   O QUE É (e por que existe)

   O resolver PURO (_ecbtKeyResolverPure.ts → resolveEcbtKey) NÃO faz I/O: ele
   espera TRÊS funções INJETADAS pelo runtime:
     - decodeCanonical(key)      → payload (modelo/dataset)
     - decodeBase64UrlJson(key)  → payload (modelo/dataset)
     - loadDatasetById(id)       → payload (dataset remoto)

   Os decoders REAIS já existem mas devolvem um MODELO ECBT (com elements[] /
   observations), NÃO um dataset tabular {columns, rows}. As primitivas
   (_ecbtPrimitivesPure.ts → ecbtTable/ecbtSum/ecbtValue) consomem TABELA.

   Este arquivo é o ADAPTADOR que fecha a lacuna:
     (a) modelToDataset(model) — converte o MODELO num dataset tabular PURO.
     (b) createKeyDecoders()   — factory que liga os decoders REAIS ao resolver,
                                  já aplicando modelToDataset na saída.

   PUREZA: modelToDataset é determinístico, sem DOM/IO. createKeyDecoders devolve
   wrappers; o decoder canônico (decodeKey) é sync e não faz rede — só CPU
   (XOR/checksum/JSON.parse). loadDatasetById É honesto: retorna null até existir
   o tier-server (dataset-id remoto via Supabase/Storage — fora desta slice).

   ----------------------------------------------------------------
   FORMA DO MODELO (derivada do código real — validator.ts/decoder.ts)

   model = {
     elements?: Array<{
       id: string, name?: string, family?: string,
       x?: number, y?: number,                 // posição (quando presente)
       parameters?: Record<string, scalar>,    // achatado em colunas parameters.*
       observations? | data.observations?: [...]// observações por elemento
     }>,
     observations?: [...],                      // observações de nível-modelo
     project?/name?/title?/id?/updatedAt?...
   }

   ESCOLHA DE DESIGN (observations): documentada e honesta.
     - O dataset PRINCIPAL = uma linha por ELEMENT (a unidade física do twin).
     - As observations NÃO são achatadas dentro da linha do element (cardinalidade
       1-para-N quebraria a tabela retangular e inventaria colunas instáveis).
       Em vez disso, modelToDataset expõe um SEGUNDO dataset opcional via
       `modelObservationsToDataset(model)` (uma linha por observação, com
       elementId de referência). A primitiva consome o dataset principal; quem
       precisar das observações pede o secundário explicitamente. NÃO inventamos
       dados nem achatamos N observações numa única célula.
   ================================================================ */

import { decodeKey } from '../io/decoder.js';
import { decodeBase64Url } from '../../utils/sharing/deepLinkParser.js';
import type {
    EcbtDataset,
    EcbtColumn,
    EcbtRow,
    EcbtColumnType,
    DecodedPayload,
    ResolveOptions,
} from './_ecbtKeyResolverPure.js';

// ----------------------------------------------------------------
// TIPOS DO MODELO (mínimos, tolerantes — derivados do código real)
// ----------------------------------------------------------------

/** Valor escalar aceito numa célula (JSON-safe, achatado). */
type Scalar = string | number | boolean | null;

/** Element do modelo ECBT — todos os campos opcionais exceto a presença bruta. */
export interface EcbtModelElement {
    readonly id?: unknown;
    readonly name?: unknown;
    readonly family?: unknown;
    readonly x?: unknown;
    readonly y?: unknown;
    readonly parameters?: unknown;
    readonly observations?: unknown;
    readonly data?: unknown;
    readonly [k: string]: unknown;
}

/** Modelo ECBT decodificado (tolerante; só `elements` interessa ao tabular). */
export interface EcbtModel {
    readonly elements?: unknown;
    readonly observations?: unknown;
    readonly [k: string]: unknown;
}

// ----------------------------------------------------------------
// HELPERS PUROS
// ----------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

/** Coage um valor arbitrário a um Scalar estável p/ célula (objeto/array → JSON). */
function toScalar(v: unknown): Scalar {
    if (v === null || v === undefined) return null;
    const t = typeof v;
    if (t === 'number') return Number.isFinite(v as number) ? (v as number) : null;
    if (t === 'string' || t === 'boolean') return v as Scalar;
    // objeto/array aninhado → JSON determinístico (a célula é escalar por def.).
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
}

/** Tipo lógico de uma coluna a partir das suas células (honesto: 'unknown'). */
function inferColumnType(values: readonly Scalar[]): EcbtColumnType {
    let seen = false;
    let t: EcbtColumnType = 'unknown';
    for (const v of values) {
        if (v === null || v === undefined) continue;
        let cur: EcbtColumnType;
        if (typeof v === 'number') cur = 'number';
        else if (typeof v === 'boolean') cur = 'boolean';
        else cur = 'string';
        if (!seen) {
            t = cur;
            seen = true;
        } else if (t !== cur) {
            t = 'string'; // tipos mistos escalares → string é o menor denominador.
        }
    }
    return t;
}

function freezeColumn(name: string, unit: string | null, type: EcbtColumnType): EcbtColumn {
    return Object.freeze({ name, unit, type });
}

/** Campos comuns achatados de cada element, em ordem estável. */
const BASE_FIELDS: readonly string[] = Object.freeze(['id', 'name', 'family', 'x', 'y']);

/**
 * Extrai o mapa `parameters` de um element (achatado para parameters.*).
 * Aceita só objeto-plano; qualquer outra coisa → sem parâmetros.
 */
function elementParameters(el: EcbtModelElement): Record<string, unknown> {
    return isPlainObject(el.parameters) ? el.parameters : {};
}

/**
 * Converte UM element numa linha achatada (campos comuns + parameters.*).
 * NÃO inclui observations (ver decisão de design no cabeçalho).
 */
function elementToRow(el: EcbtModelElement): Record<string, Scalar> {
    const row: Record<string, Scalar> = {
        id: toScalar(el.id),
        name: toScalar(el.name),
        family: toScalar(el.family),
        x: toScalar(el.x),
        y: toScalar(el.y),
    };
    const params = elementParameters(el);
    for (const k of Object.keys(params)) {
        // prefixo parameters.* — evita colisão com campos comuns e é auto-descritivo.
        row[`parameters.${k}`] = toScalar(params[k]);
    }
    return row;
}

// ----------------------------------------------------------------
// 1. modelToDataset — MODELO → dataset tabular PURO
// ----------------------------------------------------------------

/**
 * Converte um modelo ECBT decodificado num dataset tabular {columns, rows}.
 *
 * - 1 linha por ELEMENT.
 * - Colunas = campos comuns (id, name, family, x, y) na ordem fixa + TODAS as
 *   chaves de `parameters` vistas em qualquer element, prefixadas `parameters.`,
 *   em ordem de primeira-ocorrência (determinístico).
 * - Células ausentes → null (linha sempre tem todas as colunas → tabela retangular).
 * - Tipo de coluna inferido das células (honesto: 'unknown' quando não inferível).
 *
 * Determinístico e PURO: mesma entrada → mesma saída; sem DOM/IO.
 * Modelo vazio/sem elements/elements-não-array → dataset VAZIO (não lança).
 *
 * @param model modelo decodificado (qualquer shape; só `elements` é lido).
 * @returns EcbtDataset (rows: EcbtRow[], columns: EcbtColumn[], meta).
 */
export function modelToDataset(model: unknown, source = 'ecbt-model'): EcbtDataset {
    const root: EcbtModel = isPlainObject(model) ? model : {};
    const rawElements = Array.isArray(root.elements) ? root.elements : [];

    // Constrói as linhas e descobre a ordem das colunas de parâmetros.
    const rows: Record<string, Scalar>[] = [];
    const paramColumns: string[] = [];
    const seenParam = new Set<string>();

    for (const rawEl of rawElements) {
        if (!isPlainObject(rawEl)) continue; // element não-objeto → ignorado (não inventa).
        const row = elementToRow(rawEl);
        for (const key of Object.keys(row)) {
            if (key.startsWith('parameters.') && !seenParam.has(key)) {
                seenParam.add(key);
                paramColumns.push(key);
            }
        }
        rows.push(row);
    }

    const columnNames: string[] = [...BASE_FIELDS, ...paramColumns];

    // Normaliza cada linha para conter TODAS as colunas (retangular).
    const normalizedRows: EcbtRow[] = rows.map((r) => {
        const out: Record<string, Scalar> = {};
        for (const name of columnNames) {
            const cell = r[name];
            out[name] = cell === undefined ? null : cell;
        }
        return Object.freeze(out);
    });

    // Constrói os descritores de coluna com inferência de tipo das células.
    // Modelo vazio → columns vazias também (honesto: nada a descrever).
    const columns: readonly EcbtColumn[] =
        rawElements.length === 0
            ? Object.freeze([])
            : Object.freeze(
                  columnNames.map((name) => {
                      const vals = normalizedRows.map((r) => r[name] as Scalar);
                      return freezeColumn(name, null, inferColumnType(vals));
                  }),
              );

    // Meta honesta: freshness null (o modelo não declara frescor tabular aqui).
    const id = isNonEmptyString(root.id) ? root.id : undefined;
    const title = pickTitle(root);

    return Object.freeze({
        rows: Object.freeze(normalizedRows),
        columns,
        meta: Object.freeze({
            columns,
            freshness: null,
            source,
            ...(id ? { id } : {}),
            ...(title ? { title } : {}),
        }),
    });
}

function pickTitle(root: EcbtModel): string | undefined {
    if (isNonEmptyString(root.title)) return root.title;
    if (isNonEmptyString(root.name)) return root.name;
    if (isPlainObject(root.project) && isNonEmptyString(root.project.name)) {
        return root.project.name;
    }
    return undefined;
}

// ----------------------------------------------------------------
// 1b. modelObservationsToDataset — observações como 2º dataset (opt-in)
// ----------------------------------------------------------------

/**
 * Achata as observações do modelo num SEGUNDO dataset tabular (1 linha por obs).
 *
 * Fonte das observações (em ordem): element.observations[] →
 * element.data.observations[] (compat validator.ts) → model.observations[].
 * Cada linha referencia o elementId de origem (null para obs nível-modelo).
 *
 * Decisão (ver cabeçalho): observations NÃO são achatadas na linha do element —
 * são expostas aqui, sob demanda, para preservar a tabela principal retangular.
 *
 * PURO/determinístico. Sem observações → dataset vazio (não lança).
 */
export function modelObservationsToDataset(model: unknown, source = 'ecbt-model-observations'): EcbtDataset {
    const root: EcbtModel = isPlainObject(model) ? model : {};
    const flat: Array<{ elementId: string | null; obs: Record<string, unknown> }> = [];

    const pushObs = (elementId: string | null, list: unknown): void => {
        if (!Array.isArray(list)) return;
        for (const o of list) {
            if (isPlainObject(o)) flat.push({ elementId, obs: o });
        }
    };

    if (Array.isArray(root.elements)) {
        for (const el of root.elements) {
            if (!isPlainObject(el)) continue;
            const elementId = isNonEmptyString(el.id) ? el.id : null;
            pushObs(elementId, el.observations);
            if (isPlainObject(el.data)) pushObs(elementId, el.data.observations);
        }
    }
    pushObs(null, root.observations);

    if (flat.length === 0) {
        return Object.freeze({
            rows: Object.freeze([]),
            columns: Object.freeze([]),
            meta: Object.freeze({ columns: Object.freeze([]), freshness: null, source }),
        });
    }

    // Colunas: elementId + união (ordem de primeira-ocorrência) das chaves das obs.
    const columnNames: string[] = ['elementId'];
    const seen = new Set<string>(['elementId']);
    for (const { obs } of flat) {
        for (const k of Object.keys(obs)) {
            if (!seen.has(k)) {
                seen.add(k);
                columnNames.push(k);
            }
        }
    }

    const rows: EcbtRow[] = flat.map(({ elementId, obs }) => {
        const out: Record<string, Scalar> = { elementId: elementId };
        for (const name of columnNames) {
            if (name === 'elementId') continue;
            out[name] = name in obs ? toScalar(obs[name]) : null;
        }
        return Object.freeze(out);
    });

    const columns: readonly EcbtColumn[] = Object.freeze(
        columnNames.map((name) => {
            const vals = rows.map((r) => r[name] as Scalar);
            return freezeColumn(name, null, inferColumnType(vals));
        }),
    );

    return Object.freeze({
        rows: Object.freeze(rows),
        columns,
        meta: Object.freeze({ columns, freshness: null, source }),
    });
}

// ----------------------------------------------------------------
// 2. createKeyDecoders — liga os decoders REAIS ao resolver
// ----------------------------------------------------------------

/**
 * Subconjunto de ResolveOptions que esta factory preenche (os 3 decoders/loader).
 */
export type EcbtKeyDecoders = Pick<
    ResolveOptions,
    'decodeCanonical' | 'decodeBase64UrlJson' | 'loadDatasetById'
>;

/**
 * Factory que devolve os decoders REAIS já adaptados à shape do resolver.
 *
 *  - decodeCanonical(key): decoder.decodeKey(key) (sync; tipo A/B) → modelToDataset.
 *      decodeKey LANÇA p/ chave corrompida/tipo C/D — o resolver captura como bad_key.
 *  - decodeBase64UrlJson(key): deepLinkParser.decodeBase64Url(key) → JSON.parse →
 *      modelToDataset. base64url inválido → null (decodeBase64Url já devolve null);
 *      JSON inválido → throw (resolver → bad_key).
 *  - loadDatasetById(id): HONESTO — retorna null. Dataset-id remoto é tier-server
 *      (Supabase/Storage), fora desta slice. Quando o tier-server existir, este
 *      wrapper passa a chamar o loader real e adapta a saída.
 *
 * O resultado é injetado em resolveEcbtKey(key, decoders) pelo runtime/invoker.
 */
export function createKeyDecoders(): EcbtKeyDecoders {
    const decodeCanonical = (key: string): DecodedPayload => {
        // decodeKey é sync p/ tipo A/B; lança p/ C/D/corrompida → resolver=bad_key.
        const model = decodeKey(key) as unknown;
        return modelToDataset(model, 'ecbt-key') as unknown as DecodedPayload;
    };

    const decodeBase64UrlJson = (key: string): DecodedPayload => {
        const json = decodeBase64Url(key);
        if (json === null) return null; // base64url inválido → não-resolvido.
        // JSON.parse pode lançar → resolver captura como bad_key.
        const model = JSON.parse(json) as unknown;
        return modelToDataset(model, 'deep-link') as unknown as DecodedPayload;
    };

    // HONESTO: dataset-id remoto = tier-server futuro. Sem loader real → null.
    const loadDatasetById = (_id: string): DecodedPayload => null;

    return { decodeCanonical, decodeBase64UrlJson, loadDatasetById };
}
