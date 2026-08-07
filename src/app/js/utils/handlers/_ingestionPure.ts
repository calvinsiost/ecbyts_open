// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic extraction hub for handlers/ingestion.ts (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM).
// Wave KKKK1 — DOM-free document parsing + bbox validation.
// Wave KKKK2 — Ingestion UI labels + progress/chip helpers (MONOLITH-GROWN-001
//              revert: drop ingestion.ts LOC below monolith-ratchet baseline).
//
// Contract: zero document/window/state. All functions are deterministic given
// their args; callers compose deps from their own scope.

/**
 * Validate that a bounding box has finite x0/y0/x1/y1 with positive dimensions.
 *
 * @param {{x0?:number, y0?:number, x1?:number, y1?:number}|null|undefined} bbox
 * @returns {boolean}
 */
export function hasValidSourceBbox( bbox: any) {
    if (!bbox || typeof bbox !== 'object') return false;
    return !!(
        Number.isFinite(bbox.x0) &&
        Number.isFinite(bbox.y0) &&
        Number.isFinite(bbox.x1) &&
        Number.isFinite(bbox.y1) &&
        bbox.x1 > bbox.x0 &&
        bbox.y1 > bbox.y0
    );
}

/**
 * Extract page text from a flat raw document string using "Página N" markers.
 * Returns substring from "Página pageNum" up to "Página pageNum+1" (or 2000 chars).
 *
 * @param {string} rawText - Full document text with page markers
 * @param {number} pageNum - 1-based page number
 * @param {number} [maxLength=2000] - Cap for last page or missing next marker
 * @returns {string}
 */
export function extractPageText( rawText: any, pageNum: any, maxLength: any = 2000) {
    if (!rawText || typeof rawText !== 'string') return '';
    if (!Number.isFinite(pageNum) || pageNum < 1) return '';
    const marker = `Página ${pageNum}`;
    const nextMarker = `Página ${pageNum + 1}`;
    const start = rawText.indexOf(marker);
    if (start === -1) return '';
    const end = rawText.indexOf(nextMarker, start);
    const cap = Number.isFinite(maxLength) && maxLength > 0 ? maxLength : 2000;
    return rawText.substring(start, end === -1 ? start + cap : end);
}

/**
 * Compute bbox area (positive number) for filtered/scored matching.
 *
 * @param {{x0?:number, y0?:number, x1?:number, y1?:number}|null|undefined} bbox
 * @returns {number} area in coordinate units squared, 0 if invalid
 */
export function computeBboxArea( bbox: any) {
    if (!hasValidSourceBbox(bbox)) return 0;
    return (bbox.x1 - bbox.x0) * (bbox.y1 - bbox.y0);
}

/**
 * Check if two bboxes overlap (axis-aligned intersection test).
 *
 * @param {{x0?:number, y0?:number, x1?:number, y1?:number}|null|undefined} a
 * @param {{x0?:number, y0?:number, x1?:number, y1?:number}|null|undefined} b
 * @returns {boolean}
 */
export function bboxesOverlap( a: any, b: any) {
    if (!hasValidSourceBbox(a) || !hasValidSourceBbox(b)) return false;
    if (a.x1 < b.x0 || b.x1 < a.x0) return false;
    if (a.y1 < b.y0 || b.y1 < a.y0) return false;
    return true;
}

/**
 * Normalize a doc field name (lowercase + strip punctuation/whitespace).
 * Used for fuzzy field matching in EDD ingestion pipeline.
 *
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function normalizeDocFieldName( name: any) {
    if (!name || typeof name !== 'string') return '';
    return name
        .toLowerCase()
        .replace(/[\s\-_.]+/g, '')
        .trim();
}

/**
 * ARCH-MONOLITH-ATOMIZATION-001: pure decision logic for the D13 ingestion
 * validation table (expected-vs-imported counts). Extracted verbatim from the
 * inline match/divergence loop inside _renderIngestionValidationTable() in
 * handlers/ingestion.ts so the verdict can be unit-tested without a DOM and the
 * renderer becomes presentation-only. Behavior is identical:
 *   - exp === '?' OR (exp === 0 && imp === 0)  → match (neutral, ignored in aggregate)
 *   - number vs number → within tolerance (2% for "Observations", exact otherwise),
 *     floor at 1 record via Math.max(1, Math.ceil(exp * tol))
 *   - otherwise → strict String() equality
 * A row only flips allMatch to false when it mismatches AND is not a neutral row.
 *
 * @param {Array<{entity?:string, sheet?:string, expected?:any, imported?:any}>} rows
 * @returns {{
 *   rows: Array<{entity:string, sheet:string, expected:any, imported:any, match:boolean, icon:string, color:string}>,
 *   allMatch: boolean,
 *   statusColor: string,
 *   statusText: string,
 * }}
 */
export function computeIngestionValidationVerdict( rows: any) {
    const list = Array.isArray(rows) ? rows : [];
    let allMatch = true;
    const verdicts = list.map((row: any) => {
        const exp = row.expected;
        const imp = row.imported;
        let match: boolean;
        if (exp === '?' || (exp === 0 && imp === 0)) {
            match = true;
        } else if (typeof exp === 'number' && typeof imp === 'number') {
            // Tolerance de 2% para observacoes
            const tol = row.entity === 'Observations' ? 0.02 : 0;
            match = Math.abs(imp - exp) <= Math.max(1, Math.ceil(exp * tol));
        } else {
            match = String(imp) === String(exp);
        }
        if (!match && exp !== '?' && !(exp === 0 && imp === 0)) allMatch = false;
        return {
            entity: row.entity,
            sheet: row.sheet,
            expected: row.expected,
            imported: row.imported,
            match,
            icon: match ? '&#10003;' : '&#10007;',
            color: match ? 'var(--success)' : 'var(--error)',
        };
    });
    return {
        rows: verdicts,
        allMatch,
        statusColor: allMatch ? 'var(--success)' : 'var(--error)',
        statusText: allMatch
            ? 'OK — todos os registros importados'
            : 'Divergencia detectada — verifique os dados',
    };
}

// ==================================================================
// Wave KKKK2 — Ingestion UI labels + progress/chip helpers
// (MONOLITH-GROWN-001 revert for handlers/ingestion.ts).
// All functions below: DOM-free, state-free, deterministic.
// ==================================================================

import { escapeHtml } from '../helpers/html.js';

// ---- Format labels (renderFormatConfirm) ----

/** Map of ingestion format type → human-readable label (pt-BR). Frozen. */
export const INGESTION_FORMAT_LABELS: Readonly<Record<string, string>> = Object.freeze({
    'edd-r2': 'EPA Region 2 EDD',
    'edd-r3': 'EPA Region 3 EDD',
    'edd-r5': 'EPA Region 5 EDD',
    'edd-br': 'EDD Brasileiro',
    'ecbyts-csv': 'CSV ecbyts nativo',
    'ohs-aiha': 'AIHA IH Data (exposicao ocupacional)',
    'ohs-doehrs': 'DOEHRS-IH EDD (exposicao militar)',
    'ohs-nr15': 'NR-15 Assessment (insalubridade)',
    'ohs-ppra': 'PPRA/PGR (riscos ocupacionais)',
    'ohs-pcmso': 'PCMSO (exames medicos)',
    'ohs-bio': 'LIMS Biomonitoring (bioindicadores)',
    'ohs-generic': 'OHS generico (ocupacional)',
    unknown: 'Formato desconhecido',
});

/**
 * Resolve a human-readable label for an ingestion format type.
 * Falls back to the raw type if not in the canonical map.
 *
 * @param {string | null | undefined} formatType
 * @returns {string}
 */
export function resolveFormatLabel(formatType: string | null | undefined): string {
    if (!formatType || typeof formatType !== 'string') return '';
    return INGESTION_FORMAT_LABELS[formatType] ?? formatType;
}

// ---- Column target labels (renderColumnMapping) ----

/**
 * Map of ecbyts target field key → pt-BR label for the column-mapping
 * `<select>` options in the ingestion wizard. Frozen.
 */
export const COLUMN_TARGET_LABELS: Readonly<Record<string, string>> = Object.freeze({
    elementName: 'Local (ID)',
    latitude: 'Latitude',
    longitude: 'Longitude',
    datum: 'Datum',
    locType: 'Tipo de local',
    elevation: 'Elevacao',
    sampleCode: 'Codigo amostra',
    sampleDate: 'Data coleta',
    matrix: 'Matriz',
    chemicalName: 'Parametro quimico',
    casNumber: 'CAS Number',
    resultValue: 'Valor resultado',
    resultUnit: 'Unidade',
    detectFlag: 'Flag deteccao',
    detectionLimit: 'Limite deteccao',
    qualifier: 'Qualificador',
    labName: 'Laboratorio',
    method: 'Metodo analitico',
    taskCode: 'Codigo campanha',
    sampleType: 'Tipo amostra',
    fraction: 'Fracao',
    dilution: 'Diluicao',
    samplingMethod: 'Metodo coleta',
    locDescription: 'Descricao local',
    observationDate: 'Data observacao',
    building: 'Edificacao',
    // OHS fields
    workerId: 'Trabalhador ID',
    workerName: 'Nome trabalhador',
    gheId: 'GHE (grupo)',
    jobTitle: 'Cargo/funcao',
    department: 'Setor/departamento',
    exposureAgent: 'Agente de exposicao',
    exposureRoute: 'Via de exposicao',
    sampleTypeOHS: 'Tipo amostra OHS',
    twa8h: 'TWA-8h',
    stel: 'STEL',
    ceilingValue: 'Valor teto',
    oel: 'OEL/TLV/LT',
    bei: 'BEI/IBMP',
    specimen: 'Matriz biologica',
    ppeStatus: 'Status EPI',
    incidentType: 'Tipo acidente',
    severity: 'Severidade',
    probability: 'Probabilidade',
    daysLost: 'Dias perdidos',
    aptitude: 'Aptidao/ASO',
    examType: 'Tipo exame',
    naicsCode: 'CNAE/NAICS',
    durationHours: 'Duracao (h)',
    insalubrityGrade: 'Grau insalubridade',
    riskLevel: 'Nivel de risco',
});

/**
 * Resolve the pt-BR label for a column-mapping target field key.
 * Falls back to the raw key if not in the canonical map.
 *
 * @param {string} key
 * @returns {string}
 */
export function resolveColumnTargetLabel(key: string): string {
    if (!key || typeof key !== 'string') return '';
    return COLUMN_TARGET_LABELS[key] ?? key;
}

// ---- Confidence background (renderColumnMapping table) ----

/**
 * Inline-style background for a column-mapping row based on mapping confidence.
 *   confidence >= 0.8  → ''  (no highlight, deterministic mapping)
 *   confidence > 0     → 'background:var(--warning-50);' (needs review)
 *   else               → ''  (unmapped)
 *
 * @param {number} confidence
 * @returns {string}
 */
export function columnConfidenceBackground(confidence: number): string {
    if (!Number.isFinite(confidence)) return '';
    if (confidence >= 0.8) return '';
    if (confidence > 0) return 'background:var(--warning-50);';
    return '';
}

// ---- Origin label (renderFormatConfirm — D2 origin card) ----

/** Shape of a suggested-origin record produced by the ingestion wizard. */
export interface IngestionOrigin {
    source?: string;
    lat: number;
    lon: number;
    count?: number;
}

/**
 * Format a human-readable label for the suggested geographic origin card.
 *   source === 'manual' → "Origem manual selecionada: <lat>, <lon>"
 *   otherwise           → "Centroide de <count> locais: <lat>, <lon>"
 *
 * Coordinates are formatted with 5 decimal places.
 *
 * @param {IngestionOrigin} origin
 * @returns {string}
 */
export function formatOriginLabel(origin: IngestionOrigin): string {
    if (!origin) return '';
    const lat = Number(origin.lat) || 0;
    const lon = Number(origin.lon) || 0;
    if (origin.source === 'manual') {
        return `Origem manual selecionada: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    }
    const count = Number(origin.count) || 1;
    return `Centroide de ${count} locais: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

// ---- Doc progress phase helpers (_renderDocProgress) ----

/** Clamp+round a raw progress percent to the 0–100 integer range. */
export function clampProgressPercent(raw: unknown): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Return the "next step" hint shown below the phase grid in the doc-progress
 * card, given the current phase key.
 *   prepare → "Proximo: extracao de tabelas."
 *   extract → "Proximo: enriquecimento e validacao."
 *   enrich  → "Proximo: consolidar resumo para revisao."
 *   *       → "Finalizando para abrir a tela de revisao."
 */
export function phaseNextHint(phase: string): string {
    switch (phase) {
        case 'prepare':
            return 'Proximo: extracao de tabelas.';
        case 'extract':
            return 'Proximo: enriquecimento e validacao.';
        case 'enrich':
            return 'Proximo: consolidar resumo para revisao.';
        default:
            return 'Finalizando para abrir a tela de revisao.';
    }
}

/** Shape returned by {@link buildDocPhaseCardStyle}. */
export interface DocPhaseCardStyle {
    bg: string;
    border: string;
    color: string;
    marker: string;
}

/**
 * Compute the per-card styling (background / border / text color / marker
 * glyph) for a doc-process phase card in the progress grid.
 *
 *   done    → success colors + check mark (✓)
 *   active  → accent colors + filled dot (●)
 *   pending → neutral colors + hollow dot (○)
 *
 * @param {number} idx        - index of the phase in DOC_PROCESS_PHASES
 * @param {number} activeIndex - index of the currently-active phase
 * @param {number} safePct     - clamped progress percent (0–100)
 * @returns {DocPhaseCardStyle}
 */
export function buildDocPhaseCardStyle(
    idx: number,
    activeIndex: number,
    safePct: number,
): DocPhaseCardStyle {
    const done = idx < activeIndex || safePct >= 100;
    const active = idx === activeIndex && safePct < 100;
    if (done) {
        return {
            bg: 'var(--success-50,#ecfdf5)',
            border: 'var(--success-300,#86efac)',
            color: 'var(--success-700,#166534)',
            marker: '&#10003;',
        };
    }
    if (active) {
        return {
            bg: 'var(--accent-50,#eff6ff)',
            border: 'var(--accent-300,#93c5fd)',
            color: 'var(--accent-700,#1d4ed8)',
            marker: '&#9679;',
        };
    }
    return {
        bg: 'var(--neutral-50)',
        border: 'var(--neutral-200)',
        color: 'var(--neutral-600)',
        marker: '&#9675;',
    };
}

// ---- Confidence legend tooltips (_renderDocReview summary) ----

/**
 * Map of confidence color → descriptive tooltip (pt-BR) for the legend chips
 * shown in the doc-review summary. Frozen.
 */
export const CONF_TOOLTIPS: Readonly<Record<string, string>> = Object.freeze({
    green: 'Parametro reconhecido automaticamente via dicionario (alias match)',
    yellow: 'Reconhecido por similaridade semantica — revisar nome e valor',
    red: 'Nao reconhecido no dicionario — verificar manualmente ou ignorar',
});

/**
 * Resolve the tooltip for a confidence color key, or '' if unknown.
 *
 * @param {string} color - 'green' | 'yellow' | 'red'
 * @returns {string}
 */
export function resolveConfTooltip(color: string): string {
    if (!color || typeof color !== 'string') return '';
    return CONF_TOOLTIPS[color] ?? '';
}

// ---- Processing-state chips (_renderDocReview processing card) ----

/**
 * Build the budget-mode chip HTML shown in the doc-review processing card.
 *   'hard-stop' → red chip "Budget: hard-stop"
 *   'degraded'  → amber chip "Budget: degradado"
 *   *           → green chip "Budget: normal"
 */
export function buildBudgetModeChip(budgetMode: string): string {
    const base = 'font-size:10px;padding:2px 8px;border-radius:999px;';
    if (budgetMode === 'hard-stop') {
        return `<span style="${base}background:var(--error-50);border:1px solid var(--error-300);color:var(--error-700);">Budget: hard-stop</span>`;
    }
    if (budgetMode === 'degraded') {
        return `<span style="${base}background:var(--warning-50);border:1px solid var(--warning-300);color:var(--warning-700);">Budget: degradado</span>`;
    }
    return `<span style="${base}background:var(--success-50);border:1px solid var(--success-300);color:var(--success-700);">Budget: normal</span>`;
}

/**
 * Build the extractor chip HTML shown in the doc-review processing card.
 *   'pdfplumber' → accent chip "Extrator: pdfplumber (<cache>)" when cache present
 *   *            → neutral chip "Extrator: worker"
 *
 * The cache label is escaped for safe inline embedding.
 *
 * @param {string} extractorPrimary
 * @param {string} [extractorCache]
 * @returns {string}
 */
export function buildExtractorChip(extractorPrimary: string, extractorCache?: string): string {
    const base = 'font-size:10px;padding:2px 8px;border-radius:999px;';
    if (extractorPrimary === 'pdfplumber') {
        const cachePart = extractorCache ? ` (${escapeHtml(extractorCache)})` : '';
        return `<span style="${base}background:var(--accent-50,#eff6ff);border:1px solid var(--accent-300,#93c5fd);color:var(--accent-700,#1d4ed8);">Extrator: pdfplumber${cachePart}</span>`;
    }
    return `<span style="${base}background:var(--neutral-100);border:1px solid var(--neutral-200);color:var(--neutral-700);">Extrator: worker</span>`;
}

// ---- Doc readings table row display (_renderDocReview readings loop) ----

/** Minimal shape of a doc-reading row used by the review table renderer. */
export interface DocReadingRow {
    parameterId?: string | null;
    parameterName?: string | null;
    operator?: string | null;
    value?: string | number | null;
    matchMethod?: string | null;
    matchScore?: number | null;
    warnings?: string[] | null;
    elementName?: string | null;
    source?: {
        page?: number | null;
        bbox?: { x0?: number; y0?: number; x1?: number; y1?: number } | null;
    } | null;
}

/** Precomputed display fields for a doc-review readings table row. */
export interface DocReadingRowDisplay {
    paramDisplay: string;
    valueDisplay: string | number;
    matchInfo: string;
    warningsText: string;
    rowPage: number;
    canShowSource: boolean;
    sourceInfo: string;
    bboxJson: string;
    rowTitle: string;
}

const NO_SOURCE_HINT = 'Sem origem precisa (bbox ausente) — selecione a linha para revisar dados.';

/**
 * Precompute every display-only field for a doc-review readings table row in a
 * single pure pass. Replaces ~21 lines of inline per-row derivation in
 * `_renderDocReview()` (Wave KKKK2 — MONOLITH-GROWN-001 revert).
 *
 *   paramDisplay  → parameterId || parameterName || '?'
 *   valueDisplay  → "<op> <value>" when operator != '=', else bare value
 *   matchInfo     → "<method> (<score>%)" or ''
 *   canShowSource → rowPage > 0 AND bbox is geometrically valid
 *   sourceInfo    → "Pagina N | Match: M | Poco: P" (parts optional)
 *   bboxJson      → quoted JSON of bbox, or 'null'
 *   rowTitle      → warnings/match info, with no-source hint appended when applicable
 *
 * @param {DocReadingRow} r
 * @returns {DocReadingRowDisplay}
 */
export function buildDocReadingRowDisplay(r: DocReadingRow): DocReadingRowDisplay {
    const paramDisplay = r.parameterId || r.parameterName || '?';
    const valueDisplay =
        r.operator && r.operator !== '=' ? `${r.operator} ${r.value ?? ''}` : (r.value ?? '');
    const matchInfo = r.matchMethod
        ? `${r.matchMethod} ${r.matchScore ? `(${(r.matchScore * 100).toFixed(0)}%)` : ''}`
        : '';
    const warningsText = (r.warnings || []).join('; ');
    const rowPage = r.source?.page || 0;
    const rowBbox = r.source?.bbox || null;
    const hasBbox = hasValidSourceBbox(rowBbox);
    const canShowSource = rowPage > 0 && hasBbox;
    const sourceInfo = `Pagina ${rowPage}${r.matchMethod ? ' | Match: ' + r.matchMethod : ''}${r.elementName ? ' | Poco: ' + r.elementName : ''}`;
    const bboxJson = r.source?.bbox ? JSON.stringify(r.source.bbox).replace(/"/g, '&quot;') : 'null';
    const baseRowInfo = warningsText || matchInfo || '';
    const rowTitle = canShowSource ? baseRowInfo : [baseRowInfo, NO_SOURCE_HINT].filter(Boolean).join(' | ');
    return { paramDisplay, valueDisplay, matchInfo, warningsText, rowPage, canShowSource, sourceInfo, bboxJson, rowTitle };
}

// ---- Doc asset filename (_downloadDocAsset) ----

/** Minimal shape of a doc-visual asset reference for filename building. */
export interface DocAssetRef {
    blob?: { type?: string } | null;
    mimeType?: string | null;
}

/** Minimal shape of a doc-visual asset list item for filename building. */
export interface DocAssetItem {
    assetType?: string | null;
    page?: number | null;
    index?: number | null;
    asset?: DocAssetRef | null;
}

/**
 * Slugify a doc-asset label for safe use in a download filename:
 * lowercase + collapse non-alphanumeric runs to '-' + trim leading/trailing '-'.
 * Returns 'asset' when the slug would be empty.
 */
export function slugifyDocAssetLabel(label: string | null | undefined): string {
    const raw = String(label ?? '').toLowerCase();
    const slug = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || 'asset';
}

/**
 * Map a MIME type (or blob.type) to a doc-asset file extension.
 *   image/png  → 'png'
 *   image/jpeg → 'jpg'
 *   *          → 'bin'
 */
export function mimeToDocAssetExt(mime: string | null | undefined): string {
    const m = String(mime ?? '');
    if (/png/i.test(m)) return 'png';
    if (/jpe?g/i.test(m)) return 'jpg';
    return 'bin';
}

/**
 * Build the full download filename for a doc-visual asset:
 *   doc-<slug>-<pageSuffix>.<ext>
 *
 *   pageSuffix = `p<page>` when the item has a page, else `idx<index>`.
 *
 * @param {DocAssetItem} item
 * @param {DocAssetRef}  asset
 * @param {(assetType: string) => string} [labelResolver] - resolves assetType to a display label (defaults to passthrough)
 * @returns {string}
 */
export function buildDocAssetFilename(
    item: DocAssetItem,
    asset: DocAssetRef,
    labelResolver?: (assetType: string) => string,
): string {
    const resolve = typeof labelResolver === 'function' ? labelResolver : (s: string) => s;
    const rawLabel = resolve(String(item?.assetType ?? 'asset'));
    const safeLabel = slugifyDocAssetLabel(rawLabel);
    const pageSuffix = item?.page ? `p${item.page}` : `idx${item?.index ?? 0}`;
    const mime = asset?.blob?.type || asset?.mimeType || '';
    const ext = mimeToDocAssetExt(mime);
    return `doc-${safeLabel}-${pageSuffix}.${ext}`;
}
