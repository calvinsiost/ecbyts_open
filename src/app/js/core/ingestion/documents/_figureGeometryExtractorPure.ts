// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// VISION-FALLBACK + FIGURE-GEOM — extrator pure-logic de metadados
// geoespaciais de figuras de relatórios ambientais.
//
// Calvin diretiva 2026-06-02:
//   "incluir posicionamento, rotação, extenção para plumas e
//    potenciometricos" + "e outros elementos geograficos".
//
// Pure-logic: regex + heurísticas sobre CAPTION + texto adjacente.
// NÃO toca imagem em si — é o complemento textual ao output do
// vision provider. Output alimenta core/elements/families
// (plume, well, route_flow, blueprint, etc.) + core/interpolation.
//
// SPEC: docs/specs/_archived/SPEC_FIGURE_GEOMETRY_EXTRACTION.md
// PRIOR ART:
//   - src/app/js/core/ingestion/documents/coordinateExtractor.ts
//   - src/app/js/core/ingestion/documents/_reportMetadataExtractorPure.ts (L1)
//   - src/app/js/core/io/geo/crsAdapter.ts (sistemas de coordenadas)

// ===========================================================================
// Tipos
// ===========================================================================

export type GeometryKind =
    | 'point' // 1 ponto (poço individual, fonte de contaminação)
    | 'pointSet' // N pontos (mapa de poços, malha de amostragem)
    | 'line' // 1 linha aberta (cross-section, transect, isolinha individual)
    | 'polygon' // 1 polígono fechado (pluma, bacia, área impactada)
    | 'blueprint' // planta baixa, croqui, layout industrial — alimenta family.blueprint
    | 'raster' // imagem com extent (foto aérea, mapa raster, planta de situação)
    | 'isolineSet' // múltiplas isolinhas (mapa potenciométrico/concentrações)
    | 'unknown';

export type CrsCode = 'WGS84' | 'SIRGAS2000' | 'SAD69' | 'UTM' | 'local' | 'unknown';

export interface GeoPosition {
    readonly lat: number | null;
    readonly lng: number | null;
    readonly altitudeM: number | null;
    readonly localX: number | null; // coordenadas locais (ex: planta de planta industrial)
    readonly localY: number | null;
    readonly crs: CrsCode;
}

export interface GeoExtent {
    readonly widthM: number | null;
    readonly heightM: number | null;
    readonly bboxLatLng: {
        readonly minLat: number;
        readonly maxLat: number;
        readonly minLng: number;
        readonly maxLng: number;
    } | null;
    readonly scaleDenominator: number | null; // ex: 5000 para 1:5000
}

export interface GeoRotation {
    readonly azimuthDeg: number | null; // 0=Norte, 90=Leste, sentido horário
    readonly hasNorthArrow: boolean;
    readonly source: 'caption' | 'symbol' | 'default' | 'unknown';
}

export interface FigureGeometry {
    readonly kind: GeometryKind;
    readonly position: GeoPosition;
    readonly rotation: GeoRotation;
    readonly extent: GeoExtent;
    readonly confidence: number; // 0..1
    readonly evidenceQuotes: ReadonlyArray<string>;
    readonly warnings: ReadonlyArray<string>;
}

// ===========================================================================
// Patterns
// ===========================================================================

// Coords decimais geográficas
const LATLNG_DECIMAL_REGEX =
    /(?:^|[^\d.-])(-?\d{1,2}[.,]\d{2,8})\s*[,;°\s]\s*(-?\d{1,3}[.,]\d{2,8})(?=[^\d]|$)/;

// UTM: "Zona 23K 345678 7654321" / "23S 345.678 mE 7.654.321 mN"
const UTM_REGEX =
    /\b(?:Zona\s+)?(\d{1,2})\s*([KSNkns])\s+(\d{6,7}(?:\.\d+)?)\s*(?:m\s*)?[EeNn]?\s+(\d{7,8}(?:\.\d+)?)/;

// Escala: "1:5.000" / "1/2500" / "Escala 1:20000"
const SCALE_REGEX =
    /(?:escala|scale)\s*[:=]?\s*1\s*[:/]\s*(\d{1,3}(?:\.\d{3})*|\d{3,7})/i;

// Extensão / dimensão: "área de 1500 m²" / "extensão 5 ha" / "raio 250 m"
const AREA_HA_REGEX = /\b(\d{1,5}(?:[.,]\d{1,2})?)\s*(ha|hectares?)/i;
const AREA_M2_REGEX = /\b(\d{1,9}(?:[.,]\d{1,2})?)\s*m[²2]\b/i;
const RADIUS_M_REGEX = /\braio\s+(?:de\s+)?(\d{1,5}(?:[.,]\d{1,2})?)\s*m\b/i;
const DIM_REGEX = /\b(\d{1,5}(?:[.,]\d{1,2})?)\s*m\s*[x×]\s*(\d{1,5}(?:[.,]\d{1,2})?)\s*m\b/i;

// Rotação / orientação: "Norte para cima" / "rotacionado 30° a leste"
const NORTH_ARROW_REGEX = /\bnorte\s+(?:geográfico|magnético|para\s+cima|verdadeiro)/i;
const AZIMUTH_REGEX = /\b(?:azimute|orientação)\s*[:=]?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*[°º]/i;
const ROTATED_REGEX =
    /\b(?:rotacionad[oa]|girad[oa])\s+(\d{1,3}(?:[.,]\d{1,2})?)\s*[°º]\s*(?:para\s+)?(norte|sul|leste|oeste|n|s|e|w)/i;

// CRS hints
const CRS_PATTERNS: ReadonlyArray<{ readonly code: CrsCode; readonly pattern: RegExp }> = Object.freeze([
    Object.freeze({ code: 'SIRGAS2000' as CrsCode, pattern: /\bSIRGAS\s*200?0\b/i }),
    Object.freeze({ code: 'WGS84' as CrsCode, pattern: /\bWGS\s*[-_]?\s*84\b/i }),
    Object.freeze({ code: 'SAD69' as CrsCode, pattern: /\bSAD\s*[-_]?\s*69\b/i }),
    Object.freeze({ code: 'UTM' as CrsCode, pattern: /\bUTM\b/i }),
]);

// Kind por palavras-chave em caption (heurística PT)
const KIND_KEYWORDS: ReadonlyArray<{ readonly kind: GeometryKind; readonly patterns: ReadonlyArray<RegExp> }> = Object.freeze([
    Object.freeze({
        kind: 'isolineSet' as GeometryKind,
        patterns: Object.freeze([
            /\b(mapa\s+)?potenciom[eé]trico/i,
            /\bisolinhas?\s+de\s+(concentra|cota|piezo)/i,
            /\bcurvas?\s+de\s+(n[íi]vel|concentra)/i,
            /\bpiezom[eé]trico/i,
        ]),
    }),
    Object.freeze({
        kind: 'blueprint' as GeometryKind,
        patterns: Object.freeze([
            /\bcroqui\s+(da\s+)?(área|propriedade|local|empreendimento|planta)?/i,
            /\bplanta\s+(baixa|geral|de\s+situação|de\s+localização|de\s+arranjo)/i,
            /\blayout\s+(industrial|da\s+(área|fábrica|empreendimento))/i,
            /\barranjo\s+(geral|industrial)/i,
            /\bcadastro\s+(industrial|topográfico)/i,
            /\b(planta|desenho)\s+CAD/i,
        ]),
    }),
    Object.freeze({
        kind: 'polygon' as GeometryKind,
        patterns: Object.freeze([
            /\bpluma\s+de\s+(contamina|conce)/i,
            /\b(área|area)\s+impactad[ao]/i,
            /\bbacia\s+hidrográfica/i,
            /\bperímetro\s+(da\s+)?(área|propriedade)/i,
            /\bdelimita\w+\s+(da\s+)?(área|fonte)/i,
        ]),
    }),
    Object.freeze({
        kind: 'line' as GeometryKind,
        patterns: Object.freeze([
            /\b(seção|seçao|corte|cross.section)\s+(geol|hidrogeol|estratigrafica)/i,
            /\b(perfil|seção)\s+\w[\w'-]*\s*[-–]\s*\w[\w'-]*/i, // "Seção AA' "
            /\btransecto\b/i,
        ]),
    }),
    Object.freeze({
        kind: 'pointSet' as GeometryKind,
        patterns: Object.freeze([
            /\bmapa\s+(da\s+)?(rede|malha)\s+de\s+po[çc]os/i,
            /\b(localização|distribuição)\s+(d[eo]s|das)\s+(po[çc]os|amostras|sondagens)/i,
            /\bmapa\s+(de|com)\s+(po[çc]os|amostras|pontos\s+de\s+coleta)/i,
        ]),
    }),
    Object.freeze({
        kind: 'raster' as GeometryKind,
        patterns: Object.freeze([
            /\b(foto|imagem)\s+a[eé]rea/i,
            /\bortofoto\b/i,
            /\bmapa\s+(da\s+)?(localiza|área|topogr|planta)/i,
            /\bplanta\s+(baixa|de\s+situação|geral)/i,
        ]),
    }),
    Object.freeze({
        kind: 'point' as GeometryKind,
        patterns: Object.freeze([
            /\bperfil\s+(constru|de\s+sondagem|litol)/i, // perfil individual de 1 poço
            /\bfonte\s+(potencial\s+)?de\s+contamina/i,
            /\bpo[çc]o\s+(monit|de\s+monitor)/i,
        ]),
    }),
]);

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
    if (hasDot && hasComma) {
        // PT-BR estilo "1.234,56" — ponto milhar, vírgula decimal
        cleaned = t.replace(/\./g, '').replace(',', '.');
    } else if (hasComma) {
        // só vírgula → assume decimal PT
        cleaned = t.replace(',', '.');
    } else {
        // só ponto OU só dígitos → EN/integer
        cleaned = t;
    }
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

function detectKind(caption: string): GeometryKind {
    if (!caption) return 'unknown';
    for (const { kind, patterns } of KIND_KEYWORDS) {
        for (const p of patterns) {
            if (p.test(caption)) return kind;
        }
    }
    return 'unknown';
}

function extractAzimuth(text: string): { value: number | null; source: GeoRotation['source'] } {
    const explicit = safeMatch(text, AZIMUTH_REGEX);
    if (explicit && explicit[1]) {
        const v = normNum(explicit[1]);
        if (Number.isFinite(v) && v >= 0 && v <= 360) return { value: v, source: 'caption' };
    }
    const rotated = safeMatch(text, ROTATED_REGEX);
    if (rotated && rotated[1] && rotated[2]) {
        const v = normNum(rotated[1]);
        if (Number.isFinite(v) && v >= 0 && v <= 360) return { value: v, source: 'caption' };
    }
    if (NORTH_ARROW_REGEX.test(text)) return { value: 0, source: 'symbol' };
    return { value: null, source: 'unknown' };
}

function _extractDimensions(text: string): { widthM: number | null; heightM: number | null } {
    const dimMatch = safeMatch(text, DIM_REGEX);
    if (dimMatch && dimMatch[1] && dimMatch[2]) {
        return {
            widthM: normNum(dimMatch[1]),
            heightM: normNum(dimMatch[2]),
        };
    }

    const haMatch = safeMatch(text, AREA_HA_REGEX);
    if (haMatch && haMatch[1]) {
        const ha = normNum(haMatch[1]);
        if (Number.isFinite(ha)) {
            const side = Math.sqrt(ha * 10_000);
            return { widthM: side, heightM: side };
        }
    }

    const m2Match = safeMatch(text, AREA_M2_REGEX);
    if (m2Match && m2Match[1]) {
        const m2 = normNum(m2Match[1]);
        if (Number.isFinite(m2)) {
            const side = Math.sqrt(m2);
            return { widthM: side, heightM: side };
        }
    }

    const rMatch = safeMatch(text, RADIUS_M_REGEX);
    if (rMatch && rMatch[1]) {
        const r = normNum(rMatch[1]);
        if (Number.isFinite(r)) {
            return { widthM: r * 2, heightM: r * 2 };
        }
    }

    return { widthM: null, heightM: null };
}

function _extractScale(text: string): number | null {
    const scaleMatch = safeMatch(text, SCALE_REGEX);
    if (scaleMatch && scaleMatch[1]) {
        const denom = normNum(scaleMatch[1].replace(/\./g, ''));
        if (Number.isFinite(denom) && denom > 0) return denom;
    }
    return null;
}

function extractExtent(text: string): GeoExtent {
    const { widthM, heightM } = _extractDimensions(text);
    const scaleDenom = _extractScale(text);

    return Object.freeze({
        widthM: Number.isFinite(widthM as number) ? widthM : null,
        heightM: Number.isFinite(heightM as number) ? heightM : null,
        bboxLatLng: null, // requer 2 pares lat/lng — extensão fase 2
        scaleDenominator: scaleDenom,
    });
}

function _extractLatLng(text: string): { lat: number | null; lng: number | null } {
    const ll = safeMatch(text, LATLNG_DECIMAL_REGEX);
    if (ll && ll[1] && ll[2]) {
        const a = normNum(ll[1]);
        const b = normNum(ll[2]);
        if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180) {
            return { lat: a, lng: b };
        }
    }
    return { lat: null, lng: null };
}

function _extractUtm(text: string): { localX: number | null; localY: number | null } {
    const utm = safeMatch(text, UTM_REGEX);
    if (utm && utm[3] && utm[4]) {
        const e = normNum(utm[3].replace(/\./g, ''));
        const n = normNum(utm[4].replace(/\./g, ''));
        if (Number.isFinite(e) && Number.isFinite(n)) {
            return { localX: e, localY: n };
        }
    }
    return { localX: null, localY: null };
}

function _resolvePositionCrs(crs: CrsCode, lat: number | null, lng: number | null): CrsCode {
    if (lat !== null && lng !== null) {
        return crs === 'unknown' ? 'WGS84' : crs;
    }
    return crs;
}

function extractPosition(text: string, crs: CrsCode): GeoPosition {
    const { lat, lng } = _extractLatLng(text);
    const { localX, localY } = _extractUtm(text);

    return Object.freeze({
        lat,
        lng,
        altitudeM: null,
        localX,
        localY,
        crs: _resolvePositionCrs(crs, lat, lng),
    });
}

function collectEvidence(text: string, maxQuotes: number = 3): string[] {
    const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 8);
    const interesting = sentences.filter((s) =>
        /coord|escala|área|hect|raio|norte|azimute|UTM|SIRGAS|WGS|isolin|pluma|piezom|potenc/i.test(s),
    );
    return interesting.slice(0, maxQuotes).map((s) => (s.length > 200 ? s.slice(0, 197) + '…' : s));
}

// ===========================================================================
// API pública
// ===========================================================================

/**
 * Extrai metadados geoespaciais (posicionamento + rotação + extensão) de
 * uma figura, baseado em CAPTION + texto adjacente.
 *
 * @param caption legenda canônica da figura (ex: "Figura 5 — Pluma de
 *                Benzeno na zona não saturada")
 * @param adjacentText texto da página/seção que precede ou sucede a figura
 *                     (~1-2 parágrafos), opcional
 */
export function extractFigureGeometry(caption: unknown, adjacentText: unknown = ''): FigureGeometry {
    const warnings: string[] = [];

    if (typeof caption !== 'string' || caption.trim() === '') {
        return Object.freeze({
            kind: 'unknown' as const,
            position: Object.freeze({ lat: null, lng: null, altitudeM: null, localX: null, localY: null, crs: 'unknown' as const }),
            rotation: Object.freeze({ azimuthDeg: null, hasNorthArrow: false, source: 'unknown' as const }),
            extent: Object.freeze({ widthM: null, heightM: null, bboxLatLng: null, scaleDenominator: null }),
            confidence: 0,
            evidenceQuotes: Object.freeze([] as string[]),
            warnings: Object.freeze(['caption vazio ou tipo inválido']),
        });
    }

    const adjText = typeof adjacentText === 'string' ? adjacentText : '';
    const combinedText = `${caption}\n${adjText}`.slice(0, 50_000);

    const kind = detectKind(caption);
    if (kind === 'unknown') warnings.push('kind não identificado por keyword');

    const crs = detectCrs(combinedText);
    const position = extractPosition(combinedText, crs);
    const extent = extractExtent(combinedText);
    const az = extractAzimuth(combinedText);
    const rotation: GeoRotation = Object.freeze({
        azimuthDeg: az.value,
        hasNorthArrow: NORTH_ARROW_REGEX.test(combinedText),
        source: az.source,
    });

    const evidence = collectEvidence(combinedText);

    // Confidence: combina presença de cada dimensão
    let confidence = 0;
    if (kind !== 'unknown') confidence += 0.25;
    if (position.lat !== null || position.localX !== null) confidence += 0.25;
    if (rotation.azimuthDeg !== null || rotation.hasNorthArrow) confidence += 0.2;
    if (extent.widthM !== null || extent.scaleDenominator !== null) confidence += 0.3;
    confidence = Math.min(1, confidence);

    if (confidence < 0.3) warnings.push('cobertura geoespacial insuficiente — campos mostly null');

    return Object.freeze({
        kind,
        position,
        rotation,
        extent,
        confidence: Number.isFinite(confidence) ? confidence : 0,
        evidenceQuotes: Object.freeze(evidence),
        warnings: Object.freeze(warnings),
    });
}

/** Metadata pública para auditoria. */
export const FIGURE_GEOMETRY_EXTRACTOR_META = Object.freeze({
    supportedKinds: Object.freeze([
        'point',
        'pointSet',
        'line',
        'polygon',
        'blueprint',
        'raster',
        'isolineSet',
        'unknown',
    ]),
    supportedCrs: Object.freeze(['WGS84', 'SIRGAS2000', 'SAD69', 'UTM', 'local', 'unknown']),
    rotationSources: Object.freeze(['caption', 'symbol', 'default', 'unknown']),
    extractedFields: Object.freeze([
        'kind',
        'position.lat',
        'position.lng',
        'position.localX',
        'position.localY',
        'position.crs',
        'rotation.azimuthDeg',
        'rotation.hasNorthArrow',
        'extent.widthM',
        'extent.heightM',
        'extent.scaleDenominator',
        'confidence',
    ]),
    maxTextSize: 50_000,
    lgpd: Object.freeze({
        coordsAreLocal: true,
        sendsToTelemetry: false,
        sendsToNetwork: false,
        note: 'Coords de propriedade podem ser PII. Módulo pure-logic não chama fetch/XHR/console.log. Garantia estrutural via meta-shape + grep sentinel.',
    }),
});
