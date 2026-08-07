// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// SPEC_ARTICLE_READINESS_GAPS GAP-1 — Motor de extração documento → TUPLAx.
// SKELETON (v0.1): tipos + lógica pura (metrics/field-mapping) implementadas e
// testáveis HOJE; extractFromPdf/extractFromXlsx são stubs que lançam
// 'not implemented' (precisam dos dados-fonte Volve do Calvin).
//
// BUILD-FREE: este módulo NÃO tem entry em scripts/ts-migration-map.json nem
// mirror em app/js/**. É TS-only sem consumidor no app browser (a extração é
// um driver Node: run-extraction-volve.mjs). Testado via
// `node --experimental-strip-types --test tests/document-extractor.test.mjs`
// (Node 22.14+, sem dep extra). Ver AGENTS.md "Tests that import .ts directly".
// Quando um consumidor browser surgir, mover para ts-migration-map + retarget
// o teste para o .js derivado.

/* ================================================================
   MOTOR DE EXTRAÇÃO DOCUMENTO → TUPLAx
   ================================================================

   OBJETIVO (GAP-1 / R1 do artigo)
   Transformar um documento estruturado (PDF com tabelas, XLSX) em registros
   TUPLAx canônicos com precisão MEDIDA. O codec ECBT (encoder/decoder) só
   transforma modelo↔chave; este motor fecha a lacuna documento→TUPLAx.

   TUPLAx = "TUPLA canônica de observação". 5 campos-âncora:
     P  Ponto      — well/sensor/sample ID (ex: "15/9-F-11", "PM-01")
     T  Timestamp  — ISO-8601 da coleta (ex: "2026-05-01T10:00:00Z")
     A  Atributo   — propriedade medida (ex: "benzeno", "remediation-soil")
     L  Leitura    — valor numérico (ex: 12.5, 6500000)
     U  Unit       — unidade canônica (ex: "mg/L", "BRL")
   + recordId (UUID/hash estável) — identidade de auditoria.

   Este espelha TuplaRecord de core/valuation/_deriveFromGranularPure.ts
   (redefinido localmente para permanecer build-free + sem import runtime
   cross-módulo — ver AGENTS.md "build-free .ts-importing test files").

   PIPELINE (documento → TUPLAx)
     parse → structural segmentation → field detection → dictionary mapping
     → TUPLAx assembly → validation → metrics

   ================================================================ */

// ----------------------------------------------------------------
// TIPOS CANÔNICOS
// ----------------------------------------------------------------

/**
 * Registro TUPLAx canônico — espelha TuplaRecord (core/valuation).
 * Cada campo é string para tolerância a coerção; `value` aceita string
 * BR/EN (decimal) para depois ser normalizado em number.
 */
export interface TUPLAxRecord {
    /** UUID/hash estável da observação (determinístico p/ P+T+A). */
    recordId: string;
    /** Ponto de coleta (well/sensor/sample ID). */
    ponto: string;
    /** Timestamp ISO-8601 da coleta. */
    timestamp: string;
    /** Atributo medido (pH, benzeno, vazão, remediation-soil, etc). */
    atributo: string;
    /** Leitura numérica (number após coerção, ou string BR/EN crua). */
    value: number | string;
    /** Unidade canônica (BRL, mg/L, m³/dia, etc). */
    unit: string;
    /** Custo unitário opcional (BRL por unidade de leitura). */
    unitCostBRL?: number;
}

/** Métricas de precisão por campo e agregadas. */
export interface Metrics {
    /** Precision por campo (TP/(TP+FP)); null se denominador 0. */
    precision: Record<string, number | null>;
    /** Recall por campo (TP/(TP+FN)); null se denominador 0. */
    recall: Record<string, number | null>;
    /** F1 por campo; null se precision+recall = 0. */
    f1: Record<string, number | null>;
    /** Contadores brutos por campo: { tp, fp, fn }. */
    counts: Record<string, { tp: number; fp: number; fn: number }>;
    /** F1 agregado (micro-médio sobre todas as tuplas pareadas). */
    overallF1: number | null;
}

/** Resultado de uma extração. */
export interface ExtractionResult {
    /** TUPLAx records extraídos do documento. */
    tuples: TUPLAxRecord[];
    /** Métricas vs ground truth (null se nenhum gabarito fornecido). */
    metrics: Metrics | null;
    /** Avisos não-fatais durante a extração. */
    warnings: string[];
    /** Metadados do documento-fonte (nome, tipo, páginas/linhas). */
    source: { kind: 'pdf' | 'xlsx'; label: string; units: number };
}

/** Uma entrada do gabarito (ground truth) para validação. */
export interface GroundTruthEntry {
    ponto: string;
    timestamp: string;
    atributo: string;
    value: number;
    unit: string;
}

/** Gabarito completo de um documento. */
export interface GroundTruth {
    document: string;
    expectedTuples: GroundTruthEntry[];
}

/** Par de tuplas (extraída ↔ esperada) pareadas para auditoria. */
export interface FieldMatchPair {
    extracted: TUPLAxRecord | null;
    expected: GroundTruthEntry | null;
    matchedFields: string[];
    mismatchedFields: string[];
}

// Campos-âncora avaliados nas métricas.
const FIELDS = ['ponto', 'timestamp', 'atributo', 'value', 'unit'] as const;
type FieldName = (typeof FIELDS)[number];

// Tolerância relativa para considerar `value` pareado (1%).
const VALUE_REL_TOLERANCE = 0.01;

// ----------------------------------------------------------------
// Dicionário label→atributo (seed LiabilityKind + AssetKind do valuation)
// ----------------------------------------------------------------

/**
 * Mapa de sinônimos (PT/EN, lowercase, sem acento) → atributo canônico.
 * Seed alinhado a LIABILITY_KINDS + ASSET_KINDS (core/valuation/_types.ts).
 * Extensível: chaves novas não quebram o motor.
 */
const ATTRIBUTE_DICTIONARY: Readonly<Record<string, string>> = Object.freeze({
    // remediation-soil
    'remediacao de solo': 'remediation-soil',
    'remediacao-do-solo': 'remediation-soil',
    'soil remediation': 'remediation-soil',
    'remediacao de solo contaminado': 'remediation-soil',
    // remediation-water
    'remediacao de agua': 'remediation-water',
    'remediacao de agua subterranea': 'remediation-water',
    'groundwater remediation': 'remediation-water',
    // remediation-air
    'remediacao de ar': 'remediation-air',
    'emissoes atmosfericas': 'remediation-air',
    // occupational-health
    'saude ocupacional': 'occupational-health',
    'medicina do trabalho': 'occupational-health',
    'occupational health': 'occupational-health',
    // radiological
    'radiologico': 'radiological',
    'radiological': 'radiological',
    // geotechnical
    'geotecnico': 'geotechnical',
    'geotechnical': 'geotechnical',
    // asset kinds
    'terra valorizada': 'valued-land',
    'servicos ecossistemicos': 'ecosystem-services',
    'credito ambiental': 'environmental-credit',
});

/**
 * Prefixos de moeda → unidade canônica. Detecta "R$" / "$" / "BRL" / "USD".
 */
const CURRENCY_PREFIXES: ReadonlyArray<[string, string]> = Object.freeze([
    ['r$', 'BRL'],
    ['brl', 'BRL'],
    ['us$', 'USD'],
    ['usd', 'USD'],
    ['$', 'USD'],
]);

// ----------------------------------------------------------------
// LÓGICA PURA — coerção de números (BR/EN) e unidades
// ----------------------------------------------------------------

/**
 * Normaliza string BR/EN para number. Extrai o primeiro TOKEN numérico
 * (ignora unidade à direita, ex: "12.5 mg/L" → 12.5).
 *   "6.500.000" → 6500000  (BR: ponto=milhar)
 *   "6,500,000" → 6500000  (EN: vírgula=milhar)
 *   "6.500,00"  → 6500     (BR decimal)
 *   "6,500.50"  → 6500.5   (EN decimal)
 *   "12.5 mg/L" → 12.5
 * Heurística: últimos separadores decidem decimal vs milhar.
 * Retorna null se não houver token numérico válido.
 */
export function coerceNumber(raw: string | number | null | undefined): number | null {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (raw == null) return null;
    let s = String(raw).trim();
    if (s === '') return null;
    // remove prefixo de moeda (R$, US$, $, BRL, USD)
    s = s.replace(/^(r\$|us\$|u\$|brl|usd|\$)\s*/i, '');
    // extrai o primeiro token numérico (tolera unidade à direita)
    const m = s.match(/[\d][\d.,]*/);
    if (!m) return null;
    let tok = m[0];
    const dots = (tok.match(/\./g) || []).length;
    const commas = (tok.match(/,/g) || []).length;
    if (dots > 0 && commas > 0) {
        // ambos presentes: último separador é o decimal
        if (tok.lastIndexOf(',') > tok.lastIndexOf('.')) {
            // BR: vírgula decimal, ponto milhar
            tok = tok.replace(/\./g, '').replace(',', '.');
        } else {
            // EN: ponto decimal, vírgula milhar
            tok = tok.replace(/,/g, '');
        }
    } else if (dots > 1) {
        // múltiplos pontos, sem vírgula → milhar BR
        tok = tok.replace(/\./g, '');
    } else if (commas > 1) {
        // múltiplas vírgulas, sem ponto → milhar EN
        tok = tok.replace(/,/g, '');
    } else if (commas === 1 && dots === 0) {
        // vírgula única → decimal BR
        tok = tok.replace(',', '.');
    }
    const n = Number(tok);
    return Number.isFinite(n) ? n : null;
}

/**
 * Detecta unidade canônica a partir de um texto de valor.
 * "R$ 6.500.000" → "BRL"; "12.5 mg/L" → "mg/L" (case preservado).
 */
export function detectUnit(valueText: string): string {
    const t = valueText.trim();
    const lower = t.toLowerCase();
    for (const [prefix, unit] of CURRENCY_PREFIXES) {
        if (lower.startsWith(prefix)) return unit;
    }
    // unidade científica após o número (preserva case original do documento)
    const m = t.match(/[\d.,]+\s*([A-Za-z%][A-Za-z0-9/^³²]*)/);
    return m && m[1] !== undefined ? m[1] : '';
}

/**
 * Normaliza texto de rótulo para chave de dicionário (lowercase, sem acento).
 */
export function normalizeLabel(label: string): string {
    return String(label ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove acentos
        .replace(/[^a-z0-9\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Mapeia um rótulo humano → atributo canônico via dicionário.
 * Retorna o rótulo normalizado se não houver mapeamento (não bloqueia).
 */
export function mapLabelToAttribute(label: string): string {
    const key = normalizeLabel(label);
    return ATTRIBUTE_DICTIONARY[key] || key;
}

// ----------------------------------------------------------------
// LÓGICA PURA — montagem de TUPLAx a partir de célula/linha detectada
// ----------------------------------------------------------------

/** Entrada detectada pelo parser de documento (campo bruto). */
export interface DetectedField {
    label: string;
    valueText: string;
    /** Ponto de contexto (seção do documento / coluna fixa). */
    ponto?: string;
    /** Timestamp de contexto (data do documento / coluna fixa). */
    timestamp?: string;
}

/**
 * Gera recordId determinístico a partir de P+T+A (hash simples e estável).
 * Garante identidade de auditoria reprodutível entre runs.
 */
export function makeRecordId(ponto: string, timestamp: string, atributo: string): string {
    const seed = `${ponto}|${timestamp}|${atributo}`;
    // FNV-1a 32-bit → hex estável, sem dependência externa.
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return `tup-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Monta um TUPLAxRecord a partir de um campo detectado.
 * Pure-logic: nenhuma I/O. Aplica coerção de número, detecção de unidade e
 * mapeamento de atributo. Não lança — retorna null se value não-numérico.
 */
export function assembleTuplax(field: DetectedField, defaults: { ponto: string; timestamp: string }): TUPLAxRecord | null {
    const value = coerceNumber(field.valueText);
    if (value === null) return null; // sem leitura numérica → não é TUPLAx válido
    const atributo = mapLabelToAttribute(field.label);
    const unit = detectUnit(field.valueText);
    const ponto = field.ponto || defaults.ponto || 'unknown';
    const timestamp = field.timestamp || defaults.timestamp || '';
    return {
        recordId: makeRecordId(ponto, timestamp, atributo),
        ponto,
        timestamp,
        atributo,
        value,
        unit,
    };
}

// ----------------------------------------------------------------
// LÓGICA PURA — métricas (precision / recall / F1) por campo
// ----------------------------------------------------------------

/**
 * Decide se um campo individual entre extraído e esperado é pareado (TP).
 * `value` usa tolerância relativa; demais campos exigem igualdade exata
 * (após normalização de rótulo para atributo).
 */
function isFieldMatch(field: FieldName, extracted: TUPLAxRecord, expected: GroundTruthEntry): boolean {
    switch (field) {
        case 'ponto':
            return extracted.ponto === expected.ponto;
        case 'timestamp':
            return extracted.timestamp === expected.timestamp;
        case 'atributo':
            return extracted.atributo === expected.atributo;
        case 'value': {
            const ev = typeof extracted.value === 'number' ? extracted.value : coerceNumber(extracted.value);
            if (ev === null || ev === 0) return ev === expected.value;
            return Math.abs(ev - expected.value) <= Math.abs(expected.value) * VALUE_REL_TOLERANCE;
        }
        case 'unit':
            return extracted.unit === expected.unit;
        default:
            return false;
    }
}

/**
 * Pareia tuplas extraídas e esperadas por chave de identidade (ponto+atributo).
 * Uma tupla extraída casa no máximo UMA esperada (greedy por chave).
 */
export function pairTuples(
    extracted: ReadonlyArray<TUPLAxRecord>,
    expected: ReadonlyArray<GroundTruthEntry>,
): { matched: Array<{ extracted: TUPLAxRecord; expected: GroundTruthEntry }>; unmatchedExtracted: TUPLAxRecord[]; unmatchedExpected: GroundTruthEntry[] } {
    const usedExpected = new Set<number>();
    const matched: Array<{ extracted: TUPLAxRecord; expected: GroundTruthEntry }> = [];
    const unmatchedExtracted: TUPLAxRecord[] = [];
    for (const ex of extracted) {
        let hitIdx = -1;
        for (let i = 0; i < expected.length; i++) {
            if (usedExpected.has(i)) continue;
            const candidate = expected[i];
            if (candidate && ex.ponto === candidate.ponto && ex.atributo === candidate.atributo) {
                hitIdx = i;
                break;
            }
        }
        if (hitIdx >= 0) {
            const hit = expected[hitIdx];
            usedExpected.add(hitIdx);
            if (hit) matched.push({ extracted: ex, expected: hit });
        } else {
            unmatchedExtracted.push(ex);
        }
    }
    const unmatchedExpected = expected.filter((_, i) => !usedExpected.has(i));
    return { matched, unmatchedExtracted, unmatchedExpected };
}

/**
 * Calcula precision/recall/F1 por campo + F1 agregado (micro).
 *
 * Definições por campo c:
 *   TP_c = nº de pares pareados onde c casa
 *   FP_c = (pares pareados onde c NÃO casa) + (extraídos não-pareados)
 *   FN_c = (pares pareados onde c NÃO casa) + (esperados não-pareados)
 *   precision_c = TP_c / (TP_c + FP_c)
 *   recall_c    = TP_c / (TP_c + FN_c)
 *   F1_c        = 2·P·R / (P+R)
 *
 * overallF1 = micro-F1 sobre a pareagem inteira (tupla é TP sse TODOS os 5
 * campos casam; FP = extraídos não-pareados; FN = esperados não-pareados).
 */
export function validateAgainstGroundTruth(
    extracted: ReadonlyArray<TUPLAxRecord>,
    groundTruth: GroundTruth | null,
): Metrics {
    const counts: Record<string, { tp: number; fp: number; fn: number }> = {};
    const precision: Record<string, number | null> = {};
    const recall: Record<string, number | null> = {};
    const f1: Record<string, number | null> = {};
    for (const f of FIELDS) counts[f] = { tp: 0, fp: 0, fn: 0 };

    if (!groundTruth || !Array.isArray(groundTruth.expectedTuples)) {
        // sem gabarito → métricas null, overallF1 null
        for (const f of FIELDS) {
            precision[f] = null;
            recall[f] = null;
            f1[f] = null;
        }
        return { precision, recall, f1, counts, overallF1: null };
    }

    const expected = groundTruth.expectedTuples;
    const { matched, unmatchedExtracted, unmatchedExpected } = pairTuples(extracted, expected);

    for (const f of FIELDS) {
        let tp = 0;
        for (const m of matched) if (isFieldMatch(f, m.extracted, m.expected)) tp++;
        // pares pareados onde o campo NÃO casa contam como FP e FN simultaneamente
        const mismatched = matched.length - tp;
        const fp = mismatched + unmatchedExtracted.length;
        const fn = mismatched + unmatchedExpected.length;
        counts[f] = { tp, fp, fn };
        precision[f] = tp + fp === 0 ? null : tp / (tp + fp);
        recall[f] = tp + fn === 0 ? null : tp / (tp + fn);
        const p = precision[f];
        const r = recall[f];
        // F1 null só se P ou R indefinidos; P+R=0 (ambos definidos) → F1=0
        f1[f] = p === null || r === null ? null : p + r === 0 ? 0 : (2 * p * r) / (p + r);
    }

    // overallF1 (micro): tupla só é TP se TODOS os 5 campos casam.
    // Um par pareado mas imperfeito (algum campo errado) conta como FP + FN.
    let tpAll = 0;
    let imperfect = 0;
    for (const m of matched) {
        const allMatch = FIELDS.every((f) => isFieldMatch(f, m.extracted, m.expected));
        if (allMatch) tpAll++;
        else imperfect++;
    }
    const fpAll = unmatchedExtracted.length + imperfect;
    const fnAll = unmatchedExpected.length + imperfect;
    const pAll = tpAll + fpAll === 0 ? null : tpAll / (tpAll + fpAll);
    const rAll = tpAll + fnAll === 0 ? null : tpAll / (tpAll + fnAll);
    const overallF1 =
        pAll === null || rAll === null ? null : pAll + rAll === 0 ? 0 : (2 * pAll * rAll) / (pAll + rAll);

    return { precision, recall, f1, counts, overallF1 };
}

// ----------------------------------------------------------------
// STUBS DE I/O — extração real (PDF / XLSX)
// ----------------------------------------------------------------
// Estes exigem pdfjs-dist / xlsx + os documentos-fonte Volve (Calvin).
// Os imports são LAZY (dentro da função) para manter o módulo carregável
// sem as deps e 100% pure-logic nos testes (ver header BUILD-FREE).

/**
 * Extrai TUPLAx de um PDF estruturado (texto + tabelas, NÃO OCR).
 *
 * PIPELINE planejado (v0.2.0):
 *  1. pdfjs-dist getDocument(buffer) → iterar páginas
 *  2. getTextContent() → reconstruir linhas/blocos textuais
 *  3. Heurística de tabela: células alinhadas por coordenadas (transform xy)
 *  4. Field detection: classificar cada linha em {label, valueText}
 *  5. assembleTuplax() → TUPLAxRecord[]
 *  6. validateAgainstGroundTruth(result, groundTruth) → métricas
 *
 * @param buffer Buffer do PDF (ArrayBuffer/Uint8Array)
 * @param groundTruth Gabarito opcional p/ cálculo de métricas
 * @returns ExtractionResult com tuples + metrics
 * @throws Error('not implemented') — esqueleto GAP-1, aguarda dados Volve
 */
export async function extractFromPdf(
    buffer: ArrayBuffer | Uint8Array,
    groundTruth?: GroundTruth | null,
): Promise<ExtractionResult> {
    // Lazy import — mantém o módulo build-free/testável sem a dep instalada no
    // caminho de testes. A dep `pdfjs-dist ^5.5.207` JÁ está em devDependencies.
    // const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    // const doc = await pdfjs.getDocument({ data: buffer }).promise;
    void buffer;
    void groundTruth;
    throw new Error(
        'extractFromPdf: not implemented (GAP-1 skeleton). ' +
            'Aguarda dados-fonte Volve (PUD.pdf) do Calvin + driver run-extraction-volve.mjs.',
    );
}

/**
 * Extrai TUPLAx de uma planilha XLSX.
 *
 * PIPELINE planejado (v0.2.0):
 *  1. xlsx (SheetJS) read(buffer) → workbook
 *  2. sheet_to_json({ header: 1 }) → matriz de linhas
 *  3. Detectar linha de cabeçalho → mapear coluna → campo TUPLAx
 *  4. Para cada linha de dados: montar DetectedField + assembleTuplax()
 *  5. validateAgainstGroundTruth() → métricas
 *
 * @param buffer Buffer do XLSX (ArrayBuffer/Uint8Array)
 * @param groundTruth Gabarito opcional p/ cálculo de métricas
 * @returns ExtractionResult com tuples + metrics
 * @throws Error('not implemented') — esqueleto GAP-1
 */
export async function extractFromXlsx(
    buffer: ArrayBuffer | Uint8Array,
    groundTruth?: GroundTruth | null,
): Promise<ExtractionResult> {
    // Lazy import — dep `xlsx ^0.18.5` (SheetJS) já está em devDependencies.
    // const XLSX = await import('xlsx');
    // const wb = XLSX.read(buffer, { type: 'array' });
    void buffer;
    void groundTruth;
    throw new Error(
        'extractFromXlsx: not implemented (GAP-1 skeleton). ' +
            'Aguarda planilha-fonte Volve (produção.xlsx) do Calvin.',
    );
}
