// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// FIGURE-GEOM-001 F-ext — grid de coordenadas 2D para MAPAS.
//
// Calvin diretiva 2026-06-02: "capturar grid de coordenadas para mapas
// para posicionamento correto dos shapes".
//
// Complementa:
//   - _figureGeometryExtractorPure (pos/rot/ext 1 ponto/extent geral)
//   - _depthRulerExtractorPure (eixo vertical 1D em perfis/seções)
// Este helper cobre o caso de MAPA EM PLANTA com grid 2D de coordenadas
// nos quatro lados (top/bottom/left/right), permitindo conversão
// pixel→georef de SHAPES (polígonos de pluma, pontos de poços, isolinhas).
//
// Pure-logic: regex + heurística sobre caption + adjacent text.
// Vision detecta tick marks visualmente; ESTE helper extrai metadata
// textual (bbox corners, CRS, spacing) para complementar.
//
// PRIOR ART:
//   - _figureGeometryExtractorPure (CRS detection, mesma lista canônica)
//   - core/io/geo/crsAdapter.ts (UTM↔WGS84 conversão; reusa)
//   - core/ingestion/documents/coordinateExtractor.ts (lat/long pontual)

import type { CrsCode } from './_figureGeometryExtractorPure.js';

// ===========================================================================
// Tipos
// ===========================================================================

/**
 * Sistema de coordenadas do grid:
 * - `geographic`: lat/lng em graus (WGS84/SIRGAS/SAD69)
 * - `utm_projected`: easting/northing em metros (UTM)
 * - `local`: x/y em metros locais (planta industrial / projeto)
 * - `unknown`: não detectável
 */
export type GridSystem = 'geographic' | 'utm_projected' | 'local' | 'unknown';

/** Unidades dos eixos do grid. */
export type GridAxisUnit = 'deg' | 'm' | 'km' | 'ft' | 'unknown';

export interface GridCorner {
    readonly x: number; // longitude OR easting OR localX
    readonly y: number; // latitude OR northing OR localY
}

export interface CoordinateGrid {
    readonly system: GridSystem;
    readonly crs: CrsCode;
    readonly unitsX: GridAxisUnit;
    readonly unitsY: GridAxisUnit;
    readonly bbox: {
        readonly minX: number;
        readonly minY: number;
        readonly maxX: number;
        readonly maxY: number;
    } | null;
    readonly tickSpacingX: number | null; // espaço entre ticks em unitsX
    readonly tickSpacingY: number | null;
    readonly cornerTopLeft: GridCorner | null;
    readonly cornerTopRight: GridCorner | null;
    readonly cornerBottomLeft: GridCorner | null;
    readonly cornerBottomRight: GridCorner | null;
    readonly utmZone: number | null;
    readonly utmHemisphere: 'N' | 'S' | null;
    readonly confidence: number; // 0..1
    readonly evidenceQuotes: ReadonlyArray<string>;
    readonly warnings: ReadonlyArray<string>;
}

// ===========================================================================
// Patterns
// ===========================================================================

// Lat/Lng em graus decimais — captura 2 pares (canto NW + SE) na mesma string
const LATLNG_PAIR_REGEX =
    /(?:^|[^\d.-])(-?\d{1,2}[.,]\d{2,8})\s*[,;°\s]\s*(-?\d{1,3}[.,]\d{2,8})/g;

// Lat/Lng em graus, minutos, segundos: 23°45'30"S 46°34'12"W
const LATLNG_DMS_REGEX =
    /(\d{1,2})\s*[°º]\s*(\d{1,2})\s*[′']\s*(\d{1,2}(?:[.,]\d{1,3})?)\s*[″"]?\s*([NSEW])/gi;

// UTM par: "Zona 23K 345678 7654321"
const UTM_REGEX_GLOBAL =
    /\b(?:Zona\s+)?(\d{1,2})\s*([KSNkns])\s+(\d{6,7})\s*(?:m\s*)?[EeNn]?\s+(\d{7,8})/g;

// Tick spacing: "espaçamento de 1000 m" / "grade de 0,5°" / "células de 100m × 100m"
const TICK_SPACING_GEO_REGEX =
    /(?:espa[çc]amento|grade|gr[íi]d|spacing)\s+(?:de\s+)?(\d+(?:[.,]\d+)?)\s*[°º]/i;
const TICK_SPACING_M_REGEX =
    /(?:espa[çc]amento|grade|gr[íi]d|spacing|c[eé]lulas?)\s+(?:de\s+)?(\d+(?:[.,]\d+)?)\s*(m|km|ft)\b/i;

// CRS hints (mesma do figureGeom)
const CRS_PATTERNS: ReadonlyArray<{ readonly code: CrsCode; readonly pattern: RegExp }> = Object.freeze([
    Object.freeze({ code: 'SIRGAS2000' as CrsCode, pattern: /\bSIRGAS\s*200?0\b/i }),
    Object.freeze({ code: 'WGS84' as CrsCode, pattern: /\bWGS\s*[-_]?\s*84\b/i }),
    Object.freeze({ code: 'SAD69' as CrsCode, pattern: /\bSAD\s*[-_]?\s*69\b/i }),
    Object.freeze({ code: 'UTM' as CrsCode, pattern: /\bUTM\b/i }),
]);

// System hints
const MAP_KEYWORD_REGEX =
    /\b(mapa|map|planta\s+de\s+(localiza|situa|geral)|ortofoto|cadastr|carta\s+topogr|carta\s+geol)/i;

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

function safeMatch(text: string, regex: RegExp): RegExpMatchArray | null {
    if (!text || typeof text !== 'string') return null;
    try {
        return text.match(regex);
    } catch {
        return null;
    }
}

function detectCrs(text: string): CrsCode {
    for (const { code, pattern } of CRS_PATTERNS) {
        if (pattern.test(text)) return code;
    }
    return 'unknown';
}

function dmsToDecimal(deg: number, min: number, sec: number, hemi: string): number {
    const d = Math.abs(deg) + min / 60 + sec / 3600;
    const h = hemi.toUpperCase();
    return h === 'S' || h === 'W' ? -d : d;
}

/**
 * Captura todos pares lat/lng decimais válidos no texto.
 * Filtra: |lat| ≤ 90, |lng| ≤ 180.
 */
function extractLatLngPairs(text: string): Array<[number, number]> {
    const pairs: Array<[number, number]> = [];
    const re = new RegExp(LATLNG_PAIR_REGEX.source, LATLNG_PAIR_REGEX.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const a = normNum(m[1]!);
        const b = normNum(m[2]!);
        if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180) {
            pairs.push([a, b]);
        }
    }
    return pairs.slice(0, 8);
}

function extractDmsPairs(text: string): Array<[number, string]> {
    // Retorna [decimal, hemisphere] para cada DMS encontrado
    const results: Array<[number, string]> = [];
    const re = new RegExp(LATLNG_DMS_REGEX.source, LATLNG_DMS_REGEX.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const deg = parseInt(m[1]!, 10);
        const min = parseInt(m[2]!, 10);
        const sec = normNum(m[3]!);
        const hemi = m[4]!;
        if (Number.isFinite(deg) && Number.isFinite(min) && Number.isFinite(sec)) {
            results.push([dmsToDecimal(deg, min, sec, hemi), hemi.toUpperCase()]);
        }
    }
    return results.slice(0, 8);
}

function extractUtmPoints(text: string): Array<{ zone: number; hemi: 'N' | 'S'; easting: number; northing: number }> {
    const points: Array<{ zone: number; hemi: 'N' | 'S'; easting: number; northing: number }> = [];
    const re = new RegExp(UTM_REGEX_GLOBAL.source, UTM_REGEX_GLOBAL.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const zone = parseInt(m[1]!, 10);
        const hemiLetter = m[2]!.toUpperCase();
        const easting = parseInt(m[3]!, 10);
        const northing = parseInt(m[4]!, 10);
        if (!Number.isFinite(zone) || zone < 1 || zone > 60) continue;
        if (!Number.isFinite(easting) || !Number.isFinite(northing)) continue;
        // Heurística MGRS: letras N-Z → N; A-M → S (com exceções, simplificado)
        let hemi: 'N' | 'S';
        if (hemiLetter === 'N') hemi = 'N';
        else if (hemiLetter === 'S') hemi = 'S';
        else hemi = northing > 6_000_000 ? 'S' : 'N';
        points.push({ zone, hemi, easting, northing });
    }
    return points.slice(0, 8);
}

function collectEvidence(text: string, maxQuotes: number = 3): string[] {
    const sentences = text
        .split(/(?<=[.!?])\s+|\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 8);
    const interesting = sentences.filter((s) =>
        /coord|UTM|SIRGAS|WGS|SAD\s*69|mapa|planta|escala|grade|gr[íi]d|espa[çc]amento|°|′|″/i.test(s),
    );
    return interesting.slice(0, maxQuotes).map((s) => (s.length > 200 ? s.slice(0, 197) + '…' : s));
}

// ===========================================================================
// API pública
// ===========================================================================

/**
 * Extrai grid de coordenadas 2D de caption + texto adjacente de um mapa.
 *
 * @param caption legenda canônica (ex: "Figura 5 — Mapa de poços (SIRGAS 2000)")
 * @param adjacentText texto da página/seção com coordenadas dos cantos
 */
export function extractCoordinateGrid(caption: unknown, adjacentText: unknown = ''): CoordinateGrid {
    const warnings: string[] = [];

    if (typeof caption !== 'string' || caption.trim() === '') {
        return Object.freeze({
            system: 'unknown' as const,
            crs: 'unknown' as const,
            unitsX: 'unknown' as const,
            unitsY: 'unknown' as const,
            bbox: null,
            tickSpacingX: null,
            tickSpacingY: null,
            cornerTopLeft: null,
            cornerTopRight: null,
            cornerBottomLeft: null,
            cornerBottomRight: null,
            utmZone: null,
            utmHemisphere: null,
            confidence: 0,
            evidenceQuotes: Object.freeze([] as string[]),
            warnings: Object.freeze(['caption vazio ou tipo inválido']),
        });
    }

    const adj = typeof adjacentText === 'string' ? adjacentText : '';
    const text = `${caption}\n${adj}`.slice(0, 50_000);
    const crs = detectCrs(text);

    // 1. Tenta UTM (mais comum em mapas técnicos BR)
    const utmPoints = extractUtmPoints(text);
    let system: GridSystem = 'unknown';
    let unitsX: GridAxisUnit = 'unknown';
    let unitsY: GridAxisUnit = 'unknown';
    let bbox: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
    let utmZone: number | null = null;
    let utmHemisphere: 'N' | 'S' | null = null;
    let cornerTopLeft: GridCorner | null = null;
    let cornerTopRight: GridCorner | null = null;
    let cornerBottomLeft: GridCorner | null = null;
    let cornerBottomRight: GridCorner | null = null;

    if (utmPoints.length >= 2) {
        system = 'utm_projected';
        unitsX = 'm';
        unitsY = 'm';
        utmZone = utmPoints[0]!.zone;
        utmHemisphere = utmPoints[0]!.hemi;
        const eastings = utmPoints.map((p) => p.easting);
        const northings = utmPoints.map((p) => p.northing);
        bbox = Object.freeze({
            minX: Math.min(...eastings),
            maxX: Math.max(...eastings),
            minY: Math.min(...northings),
            maxY: Math.max(...northings),
        }) as { minX: number; minY: number; maxX: number; maxY: number };
        // Corners aproximados (assume 2+ pontos do bbox)
        cornerTopLeft = Object.freeze({ x: bbox.minX, y: bbox.maxY });
        cornerTopRight = Object.freeze({ x: bbox.maxX, y: bbox.maxY });
        cornerBottomLeft = Object.freeze({ x: bbox.minX, y: bbox.minY });
        cornerBottomRight = Object.freeze({ x: bbox.maxX, y: bbox.minY });
    } else {
        // 2. Tenta lat/lng decimal
        const llPairs = extractLatLngPairs(text);
        if (llPairs.length >= 2) {
            system = 'geographic';
            unitsX = 'deg';
            unitsY = 'deg';
            const lats = llPairs.map(([a]) => a);
            const lngs = llPairs.map(([, b]) => b);
            bbox = Object.freeze({
                minX: Math.min(...lngs),
                maxX: Math.max(...lngs),
                minY: Math.min(...lats),
                maxY: Math.max(...lats),
            }) as { minX: number; minY: number; maxX: number; maxY: number };
            cornerTopLeft = Object.freeze({ x: bbox.minX, y: bbox.maxY });
            cornerTopRight = Object.freeze({ x: bbox.maxX, y: bbox.maxY });
            cornerBottomLeft = Object.freeze({ x: bbox.minX, y: bbox.minY });
            cornerBottomRight = Object.freeze({ x: bbox.maxX, y: bbox.minY });
        } else {
            // 3. Tenta DMS — usa heurística NSEW para pares
            const dms = extractDmsPairs(text);
            const lats: number[] = [];
            const lngs: number[] = [];
            for (const [val, hemi] of dms) {
                if (hemi === 'N' || hemi === 'S') lats.push(val);
                else if (hemi === 'E' || hemi === 'W') lngs.push(val);
            }
            if (lats.length >= 2 && lngs.length >= 2) {
                system = 'geographic';
                unitsX = 'deg';
                unitsY = 'deg';
                bbox = Object.freeze({
                    minX: Math.min(...lngs),
                    maxX: Math.max(...lngs),
                    minY: Math.min(...lats),
                    maxY: Math.max(...lats),
                }) as { minX: number; minY: number; maxX: number; maxY: number };
                cornerTopLeft = Object.freeze({ x: bbox.minX, y: bbox.maxY });
                cornerTopRight = Object.freeze({ x: bbox.maxX, y: bbox.maxY });
                cornerBottomLeft = Object.freeze({ x: bbox.minX, y: bbox.minY });
                cornerBottomRight = Object.freeze({ x: bbox.maxX, y: bbox.minY });
            }
        }
    }

    // 4. Tick spacing (independente do system)
    let tickSpacingX: number | null = null;
    let tickSpacingY: number | null = null;
    const geoTickMatch = safeMatch(text, TICK_SPACING_GEO_REGEX);
    if (geoTickMatch && geoTickMatch[1]) {
        const v = normNum(geoTickMatch[1]);
        if (Number.isFinite(v) && v > 0) {
            tickSpacingX = v;
            tickSpacingY = v;
        }
    } else {
        const mTickMatch = safeMatch(text, TICK_SPACING_M_REGEX);
        if (mTickMatch && mTickMatch[1] && mTickMatch[2]) {
            const v = normNum(mTickMatch[1]);
            const u = mTickMatch[2].toLowerCase();
            if (Number.isFinite(v) && v > 0) {
                let vM = v;
                if (u === 'km') vM = v * 1000;
                else if (u === 'ft') vM = v * 0.3048;
                tickSpacingX = vM;
                tickSpacingY = vM;
            }
        }
    }

    // Warnings de degradação
    if (!MAP_KEYWORD_REGEX.test(text)) {
        warnings.push('caption não parece descrever mapa — system pode ser inadequado');
    }
    if (system === 'unknown') {
        warnings.push('nenhum par de coordenadas detectado — grid não calibrável');
    }

    // Confidence: combina presença das dimensões
    let confidence = 0;
    if (system !== 'unknown') confidence += 0.3;
    if (crs !== 'unknown') confidence += 0.15;
    if (bbox !== null) confidence += 0.3;
    if (tickSpacingX !== null) confidence += 0.15;
    if (system === 'utm_projected' && utmZone !== null) confidence += 0.1;
    confidence = Math.min(1, confidence);

    const evidence = collectEvidence(text);

    return Object.freeze({
        system,
        crs,
        unitsX,
        unitsY,
        bbox,
        tickSpacingX,
        tickSpacingY,
        cornerTopLeft,
        cornerTopRight,
        cornerBottomLeft,
        cornerBottomRight,
        utmZone,
        utmHemisphere,
        confidence: Number.isFinite(confidence) ? confidence : 0,
        evidenceQuotes: Object.freeze(evidence),
        warnings: Object.freeze(warnings),
    });
}

/**
 * Converte pixel (x, y) em coordenada do CRS do grid.
 *
 * @param pixelX coluna do pixel (0 = esquerda)
 * @param pixelY linha do pixel (0 = topo)
 * @param imageWidthPx largura total da imagem em pixels
 * @param imageHeightPx altura total da imagem em pixels
 * @param grid grid extraído via extractCoordinateGrid
 * @returns { x: longitude ou easting, y: latitude ou northing } OU null se incalibrável
 */
export function pixelXYToGeo(
    pixelX: number,
    pixelY: number,
    imageWidthPx: number,
    imageHeightPx: number,
    grid: CoordinateGrid,
): { x: number; y: number } | null {
    if (
        !Number.isFinite(pixelX) ||
        !Number.isFinite(pixelY) ||
        !Number.isFinite(imageWidthPx) ||
        !Number.isFinite(imageHeightPx) ||
        imageWidthPx <= 0 ||
        imageHeightPx <= 0 ||
        grid.bbox === null
    ) {
        return null;
    }
    const xNorm = pixelX / imageWidthPx; // 0=esq, 1=dir
    const yNorm = pixelY / imageHeightPx; // 0=topo, 1=base
    const rangeX = grid.bbox.maxX - grid.bbox.minX;
    const rangeY = grid.bbox.maxY - grid.bbox.minY;
    // Convenção: top=maxY (latitude norte é maior), base=minY
    const x = grid.bbox.minX + xNorm * rangeX;
    const y = grid.bbox.maxY - yNorm * rangeY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
}

/** Metadata pública. */
export const COORDINATE_GRID_EXTRACTOR_META = Object.freeze({
    supportedSystems: Object.freeze(['geographic', 'utm_projected', 'local', 'unknown']),
    supportedUnits: Object.freeze(['deg', 'm', 'km', 'ft', 'unknown']),
    supportedCoordFormats: Object.freeze([
        'decimal_lat_lng',
        'dms_lat_lng',
        'utm_zone_easting_northing',
    ]),
    maxTextSize: 50_000,
    maxCornerPoints: 8,
});
