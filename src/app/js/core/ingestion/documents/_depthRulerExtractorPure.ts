// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// FIGURE-GEOM-001 F-extension — extrator pure-logic de régua de profundidade
// em perfis de sondagem e seções geológicas.
//
// Calvin pergunta 2026-06-02: "como lidar com regua de profundidade em
// seções e perfis?"
//
// Régua = eixo vertical com tick marks + labels numéricos. Define a
// escala VERTICAL — sem ela, polígonos/linhas detectados não têm
// significado físico.
//
// Pure-logic: regex + heurística sobre CAPTION + texto adjacente.
// Vision detecta tick marks; ESTE helper extrai metadata textual da
// régua (faixa, unidade, direção, referência) para complementar.
//
// SPEC: docs/specs/_archived/SPEC_FIGURE_GEOMETRY_EXTRACTION.md F-ext
// PRIOR ART:
//   - src/app/js/core/geology/wellLithology.ts (consumer da escala)
//   - src/app/js/core/ingestion/documents/_lithologyTextExtractorPure.ts (F2)
//   - src/app/js/core/ingestion/documents/_figureGeometryExtractorPure.ts

// ===========================================================================
// Tipos
// ===========================================================================

/**
 * Quantidade representada pela régua:
 * - `depth_below_surface`: profundidade abaixo do nível do terreno (m, ft) — perfis típicos
 * - `elevation_asl`: cota acima do nível do mar (m a.s.l.) — cross-sections geológicas
 * - `piezometric_head`: nível piezométrico (m a.s.l.) — mapas potenciométricos
 * - `unknown`: não detectável
 */
export type DepthQuantity =
    | 'depth_below_surface'
    | 'elevation_asl'
    | 'piezometric_head'
    | 'unknown';

/** Unidade da escala vertical. */
export type DepthUnit = 'm' | 'cm' | 'ft' | 'unknown';

/**
 * Direção do eixo:
 * - `top_zero_down_positive`: top=0, valores aumentam para baixo (perfil típico)
 * - `top_max_down_zero`: top=máximo, valores diminuem (cota a.s.l.)
 * - `unknown`: não detectável
 */
export type DepthDirection = 'top_zero_down_positive' | 'top_max_down_zero' | 'unknown';

export interface DepthRuler {
    readonly quantity: DepthQuantity;
    readonly unit: DepthUnit;
    readonly direction: DepthDirection;
    readonly minValue: number | null; // valor mínimo da faixa (ex: 0)
    readonly maxValue: number | null; // valor máximo (ex: 30 m)
    readonly tickIntervalM: number | null; // intervalo entre ticks (ex: 5 m)
    readonly verticalExaggeration: number | null; // V:H (ex: 2 para "2x exaggeration")
    readonly verticalScaleDenominator: number | null; // 1:N (ex: 200 para "1:200")
    readonly referenceDatum: string | null; // "Datum vertical: IBGE" / "Referência: nível do terreno"
    readonly confidence: number; // 0..1
    readonly evidenceQuotes: ReadonlyArray<string>;
    readonly warnings: ReadonlyArray<string>;
}

// ===========================================================================
// Patterns
// ===========================================================================

// Faixa explícita: "0,0 a 30,0 m" / "0-50 m" / "de 0 a 25 metros"
const RANGE_REGEX =
    /\b(?:de\s+)?(\d{1,3}(?:[.,]\d{1,3})?)\s*(?:a\s|at[eé]\s|to\s|[-–—]\s*)\s*(\d{1,3}(?:[.,]\d{1,3})?)\s*(m\b|metros?\b|cm\b|ft\b|feet\b)/i;

// Tick interval: "ticks a cada 5 m" / "intervalo de 2 m" / "passo 1 m"
const TICK_REGEX =
    /\b(?:ticks?\s+a\s+cada|intervalo\s+de|passo|step|cada)\s+(\d{1,3}(?:[.,]\d{1,3})?)\s*(m\b|cm\b|ft\b|metros?\b)/i;

// Escala vertical: "Escala vertical 1:200" / "Vertical 1:50"
const VSCALE_REGEX =
    /\b(?:escala\s+)?vertical\s*[:=]?\s*1\s*[:/]\s*(\d{1,5})\b/i;

// Vertical exaggeration: "Exaggero vertical 2x" / "VE: 5x" / "Vertical exaggeration 10:1"
const VE_REGEX =
    /\b(?:exagero|exaggeration|VE|V\s*[:.]\s*H)\s*[:=]?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:x|:\s*1)/i;

// Quantity hints
const QUANTITY_PATTERNS: ReadonlyArray<{ readonly kind: DepthQuantity; readonly patterns: ReadonlyArray<RegExp> }> = Object.freeze([
    Object.freeze({
        kind: 'piezometric_head' as DepthQuantity,
        patterns: Object.freeze([
            /\b(cota|n[íi]vel)\s+piezom[eé]tric[oa]/i,
            /\bn[íi]vel\s+(d'?[áa]gua|estatic|hidrost[áa]tic)/i,
            /\bcarga\s+hidr[áa]ulica/i,
            /\bhead\s+(piezometric|hydraulic)/i,
        ]),
    }),
    Object.freeze({
        kind: 'elevation_asl' as DepthQuantity,
        patterns: Object.freeze([
            /\bcota\s+(?:absoluta|topogr|do\s+terreno|m\.?\s*a\.?\s*s\.?\s*l)/i,
            /\b(eleva[çc][ãa]o|altitude)\s+(?:absoluta|m\.?\s*a\.?\s*s\.?\s*l)/i,
            /\bm\s*\.?\s*a\.?\s*s\.?\s*l\.?/i,
            /\bn[íi]vel\s+(?:do\s+)?mar/i,
            /\bdatum\s+vertical/i,
        ]),
    }),
    Object.freeze({
        kind: 'depth_below_surface' as DepthQuantity,
        patterns: Object.freeze([
            /\bprofundidade(?:\s+abaixo)?\s+(?:do\s+(?:n[íi]vel\s+do\s+)?(?:terreno|solo))/i,
            /\bprofundidade\s*\(m\)/i,
            /\bperfil\s+(constru|de\s+sondagem|litol)/i,
            /\bdepth\s+below\s+(surface|ground)/i,
        ]),
    }),
]);

// Direction hints
const DIRECTION_DOWN_PATTERNS: ReadonlyArray<RegExp> = Object.freeze([
    /\btop\s*=\s*0/i,
    /\b0\s+(?:no\s+|na\s+)?topo/i,
    /\beixo\s+(?:cresce|aumenta)\s+(?:para\s+)?baixo/i,
]);

const DIRECTION_UP_PATTERNS: ReadonlyArray<RegExp> = Object.freeze([
    /\beixo\s+(?:cresce|aumenta)\s+(?:para\s+)?cima/i,
    /\bcota\s+m[áa]xima\s+(?:no\s+)?topo/i,
]);

// Reference datum
const DATUM_REGEX =
    /(?:datum\s+(?:vertical|geod[eé]sic)|refer[eê]ncia\s+(?:vertical|altim[eé]trica))\s*[:=]?\s*([A-Z][\w\s\-.,()]{2,60})/i;

// ===========================================================================
// Helpers
// ===========================================================================

function normNum(s: string): number {
    if (typeof s !== 'string') return NaN;
    const t = s.trim();
    if (t === '') return NaN;
    const hasDot = t.includes('.');
    const hasComma = t.includes(',');
    let cleaned: string;
    if (hasDot && hasComma) cleaned = t.replace(/\./g, '').replace(',', '.');
    else if (hasComma) cleaned = t.replace(',', '.');
    else cleaned = t;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
}

function normUnit(s: string): DepthUnit {
    const lower = s.toLowerCase().trim();
    if (lower.startsWith('m') && !lower.startsWith('mm') && !lower.startsWith('mi')) return 'm';
    if (lower.startsWith('cm')) return 'cm';
    if (lower.startsWith('ft') || lower.startsWith('feet')) return 'ft';
    return 'unknown';
}

function safeMatch(text: string, regex: RegExp): RegExpMatchArray | null {
    if (!text || typeof text !== 'string') return null;
    try {
        return text.match(regex);
    } catch {
        return null;
    }
}

function detectQuantity(text: string): DepthQuantity {
    for (const { kind, patterns } of QUANTITY_PATTERNS) {
        for (const p of patterns) if (p.test(text)) return kind;
    }
    return 'unknown';
}

function detectDirection(text: string, quantity: DepthQuantity): DepthDirection {
    for (const p of DIRECTION_DOWN_PATTERNS) if (p.test(text)) return 'top_zero_down_positive';
    for (const p of DIRECTION_UP_PATTERNS) if (p.test(text)) return 'top_max_down_zero';
    // Inferência por quantity: profundidade vs cota
    if (quantity === 'depth_below_surface') return 'top_zero_down_positive';
    if (quantity === 'elevation_asl' || quantity === 'piezometric_head') return 'top_max_down_zero';
    return 'unknown';
}

function collectEvidence(text: string, maxQuotes: number = 3): string[] {
    const sentences = text
        .split(/(?<=[.!?])\s+|\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 8);
    const interesting = sentences.filter((s) =>
        /profundidade|cota|n[íi]vel|piezom|m\.?a\.?s\.?l|datum|escala\s+vertical|exagero|tick|intervalo|metros?\b/i.test(s),
    );
    return interesting.slice(0, maxQuotes).map((s) => (s.length > 200 ? s.slice(0, 197) + '…' : s));
}

// ===========================================================================
// API pública
// ===========================================================================

/**
 * Extrai metadata textual de régua de profundidade.
 *
 * @param caption legenda canônica da figura (ex: "Perfil construtivo do PM-03 — 0,0 a 30,0 m")
 * @param adjacentText texto da página/seção que precede ou sucede a figura
 */
export function extractDepthRuler(caption: unknown, adjacentText: unknown = ''): DepthRuler {
    const warnings: string[] = [];

    if (typeof caption !== 'string' || caption.trim() === '') {
        return Object.freeze({
            quantity: 'unknown' as const,
            unit: 'unknown' as const,
            direction: 'unknown' as const,
            minValue: null,
            maxValue: null,
            tickIntervalM: null,
            verticalExaggeration: null,
            verticalScaleDenominator: null,
            referenceDatum: null,
            confidence: 0,
            evidenceQuotes: Object.freeze([] as string[]),
            warnings: Object.freeze(['caption vazio ou tipo inválido']),
        });
    }

    const adjText = typeof adjacentText === 'string' ? adjacentText : '';
    const combinedText = `${caption}\n${adjText}`.slice(0, 50_000);

    const quantity = detectQuantity(combinedText);
    if (quantity === 'unknown') warnings.push('quantity não identificada — usar default por contexto');

    let unit: DepthUnit = 'unknown';
    let minValue: number | null = null;
    let maxValue: number | null = null;

    const rangeMatch = safeMatch(combinedText, RANGE_REGEX);
    if (rangeMatch && rangeMatch[1] && rangeMatch[2] && rangeMatch[3]) {
        const a = normNum(rangeMatch[1]);
        const b = normNum(rangeMatch[2]);
        unit = normUnit(rangeMatch[3]);
        if (Number.isFinite(a) && Number.isFinite(b)) {
            minValue = Math.min(a, b);
            maxValue = Math.max(a, b);
        }
    }

    let tickIntervalM: number | null = null;
    const tickMatch = safeMatch(combinedText, TICK_REGEX);
    if (tickMatch && tickMatch[1]) {
        const v = normNum(tickMatch[1]);
        const u = normUnit(tickMatch[2] || 'm');
        if (Number.isFinite(v)) {
            // Normaliza para metros
            if (u === 'm') tickIntervalM = v;
            else if (u === 'cm') tickIntervalM = v / 100;
            else if (u === 'ft') tickIntervalM = v * 0.3048;
            else tickIntervalM = v;
        }
    }

    let verticalScaleDenominator: number | null = null;
    const vscaleMatch = safeMatch(combinedText, VSCALE_REGEX);
    if (vscaleMatch && vscaleMatch[1]) {
        const v = Number(vscaleMatch[1]);
        if (Number.isFinite(v) && v > 0) verticalScaleDenominator = v;
    }

    let verticalExaggeration: number | null = null;
    const veMatch = safeMatch(combinedText, VE_REGEX);
    if (veMatch && veMatch[1]) {
        const v = normNum(veMatch[1]);
        if (Number.isFinite(v) && v > 0 && v < 1000) verticalExaggeration = v;
    }

    const direction = detectDirection(combinedText, quantity);

    let referenceDatum: string | null = null;
    const datumMatch = safeMatch(combinedText, DATUM_REGEX);
    if (datumMatch && datumMatch[1]) {
        referenceDatum = datumMatch[1].trim().slice(0, 60);
    }

    const evidence = collectEvidence(combinedText);

    // Confidence: combina presença
    let confidence = 0;
    if (quantity !== 'unknown') confidence += 0.2;
    if (unit !== 'unknown') confidence += 0.15;
    if (direction !== 'unknown') confidence += 0.15;
    if (minValue !== null && maxValue !== null) confidence += 0.25;
    if (tickIntervalM !== null) confidence += 0.1;
    if (verticalScaleDenominator !== null) confidence += 0.1;
    if (referenceDatum !== null) confidence += 0.05;
    confidence = Math.min(1, confidence);

    if (confidence < 0.3) warnings.push('régua de profundidade pouco caracterizada — campos mostly null');

    if (minValue !== null && maxValue !== null && minValue === maxValue) {
        warnings.push(`min===max (${minValue}) — faixa degenerada`);
    }

    return Object.freeze({
        quantity,
        unit,
        direction,
        minValue,
        maxValue,
        tickIntervalM,
        verticalExaggeration,
        verticalScaleDenominator,
        referenceDatum,
        confidence: Number.isFinite(confidence) ? confidence : 0,
        evidenceQuotes: Object.freeze(evidence),
        warnings: Object.freeze(warnings),
    });
}

/**
 * Converte pixel-y → valor físico dado uma régua calibrada.
 *
 * @param pixelY coordenada y do pixel (0 = topo da imagem)
 * @param imageHeightPx altura total da imagem em pixels
 * @param ruler régua extraída via extractDepthRuler
 * @returns valor físico no domínio da régua, ou null se incalibrável
 */
export function pixelYToValue(
    pixelY: number,
    imageHeightPx: number,
    ruler: DepthRuler,
): number | null {
    if (
        !Number.isFinite(pixelY) ||
        !Number.isFinite(imageHeightPx) ||
        imageHeightPx <= 0 ||
        ruler.minValue === null ||
        ruler.maxValue === null
    ) {
        return null;
    }
    const yNorm = pixelY / imageHeightPx; // 0=topo, 1=base
    const range = ruler.maxValue - ruler.minValue;
    if (ruler.direction === 'top_zero_down_positive') {
        return ruler.minValue + yNorm * range;
    }
    if (ruler.direction === 'top_max_down_zero') {
        return ruler.maxValue - yNorm * range;
    }
    // Direção desconhecida — default top_zero_down_positive (perfil típico)
    return ruler.minValue + yNorm * range;
}

/** Metadata pública. */
export const DEPTH_RULER_EXTRACTOR_META = Object.freeze({
    supportedQuantities: Object.freeze([
        'depth_below_surface',
        'elevation_asl',
        'piezometric_head',
        'unknown',
    ]),
    supportedUnits: Object.freeze(['m', 'cm', 'ft', 'unknown']),
    supportedDirections: Object.freeze(['top_zero_down_positive', 'top_max_down_zero', 'unknown']),
    maxTextSize: 50_000,
    extractedFields: Object.freeze([
        'quantity',
        'unit',
        'direction',
        'minValue',
        'maxValue',
        'tickIntervalM',
        'verticalExaggeration',
        'verticalScaleDenominator',
        'referenceDatum',
        'confidence',
    ]),
});
