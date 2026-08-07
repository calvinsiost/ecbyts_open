// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Well Family - Profile Geometry (PURE-MATH)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   WELL PROFILE GEOMETRY — Matematica determinística do layout SVG.

   Extraído de WellProfileModule.ts (ARCH-MONOLITH-ATOMIZATION-001,
   modo REFACTOR). Contém SOMENTE pure-math (sem DOM, sem THREE.js):
   constantes de layout + cálculos de dimensões, posições de coluna,
   conversão profundidade↔pixel, auto-escala de marcas de profundidade,
   barras de VOC e cota topográfica.

   O renderer (WellProfileModule._buildSVG e helpers _add*) consome
   estas funções para posicionar os elementos SVG. Comportamento
   IDÊNTICO ao código inline original.

   Layout 5-colunas: Descricao | Litologia | Escala | Construtivo | VOC
   ================================================================ */

// ----------------------------------------------------------------
// CONSTANTS - Layout, dimensões (px)
// ----------------------------------------------------------------
/** Pixels por metro de profundidade */
export const PX_PER_M = 8;

/** Largura de cada coluna em pixels */
export const COL = {
    desc: 90, // Descricao do solo
    litho: 50, // Padrao litologico
    scale: 30, // Escala de profundidade
    constr: 40, // Elementos construtivos
    voc: 60, // VOC readings
    gap: 4, // Espaco entre colunas
} as const;

/** Margem superior/inferior/laterais do SVG */
export const MARGIN = { top: 30, bottom: 20, left: 8, right: 8 } as const;

// ----------------------------------------------------------------
// PURE GEOMETRY - cálculos determinísticos (sem DOM)
// ----------------------------------------------------------------

/** Posições X (em px) do início de cada coluna do perfil. */
export interface ColumnXPositions {
    desc: number;
    litho: number;
    scale: number;
    constr: number;
    voc: number;
}

/** Dimensões totais do canvas SVG do perfil. */
export interface ProfileDimensions {
    /** Altura útil da coluna de profundidade (totalDepth * PX_PER_M) */
    h: number;
    /** Largura total do SVG (margens + colunas + gaps) */
    totalW: number;
    /** Altura total do SVG (margem topo + h + margem base) */
    totalH: number;
}

/**
 * Calcula altura útil e dimensões totais do SVG do perfil.
 * @param {number} totalDepth profundidade total do poço (m)
 * @returns {ProfileDimensions}
 */
export function computeProfileDimensions(totalDepth: number): ProfileDimensions {
    const h = totalDepth * PX_PER_M;
    const totalW =
        MARGIN.left +
        COL.desc +
        COL.gap +
        COL.litho +
        COL.gap +
        COL.scale +
        COL.gap +
        COL.constr +
        COL.gap +
        COL.voc +
        MARGIN.right;
    const totalH = MARGIN.top + h + MARGIN.bottom;
    return { h, totalW, totalH };
}

/**
 * Calcula as posições X (px) do início de cada coluna do perfil,
 * cascateando largura + gap da esquerda para a direita.
 * @returns {ColumnXPositions}
 */
export function computeColumnXPositions(): ColumnXPositions {
    return {
        desc: MARGIN.left,
        litho: MARGIN.left + COL.desc + COL.gap,
        scale: MARGIN.left + COL.desc + COL.gap + COL.litho + COL.gap,
        constr: MARGIN.left + COL.desc + COL.gap + COL.litho + COL.gap + COL.scale + COL.gap,
        voc: MARGIN.left + COL.desc + COL.gap + COL.litho + COL.gap + COL.scale + COL.gap + COL.constr + COL.gap,
    };
}

/**
 * Converte uma profundidade (m) para a coordenada Y (px) no SVG,
 * relativa ao topo da área de plotagem (após MARGIN.top).
 * @param {number} depth profundidade (m)
 * @returns {number} Y em px
 */
export function depthToY(depth: number): number {
    return MARGIN.top + depth * PX_PER_M;
}

/**
 * Passo de marcação da escala de profundidade (auto-escala):
 * ≤20m → 1m | ≤50m → 5m | >50m → 10m.
 * @param {number} totalDepth profundidade total (m)
 * @returns {number} passo em metros
 */
export function computeDepthScaleStep(totalDepth: number): number {
    return totalDepth <= 20 ? 1 : totalDepth <= 50 ? 5 : 10;
}

/**
 * Gera as profundidades das marcas da escala (0, step, 2·step, …),
 * incluindo todas as marcas <= totalDepth.
 * @param {number} totalDepth profundidade total (m)
 * @returns {number[]} profundidades das marcas (m)
 */
export function computeDepthTicks(totalDepth: number): number[] {
    const step = computeDepthScaleStep(totalDepth);
    const ticks: number[] = [];
    for (let d = 0; d <= totalDepth; d += step) {
        ticks.push(d);
    }
    return ticks;
}

/**
 * Rótulo de uma marca de profundidade: cota topográfica
 * (elevação − profundidade) quando há elevação, senão a profundidade.
 * Preserva exatamente o comportamento de formatação original.
 * @param {number} depth profundidade da marca (m)
 * @param {number|null} surfaceElevation elevação do collar (m) ou null
 * @returns {string}
 */
export function formatScaleLabel(depth: number, surfaceElevation: number | null = null): string {
    return surfaceElevation != null ? String(+(surfaceElevation - depth).toFixed(1)) : `${depth}`;
}

/**
 * Calcula geometria vertical de uma camada/elemento entre topo e base.
 * @param {number} top profundidade do topo (m)
 * @param {number} bottom profundidade da base (m)
 * @returns {{ y1: number, y2: number, height: number }} px (height pode ser ≤0)
 */
export function computeBandGeometry(top: number, bottom: number): { y1: number; y2: number; height: number } {
    const y1 = depthToY(top);
    const y2 = depthToY(bottom);
    return { y1, y2, height: y2 - y1 };
}

/** Geometria de uma barra de leitura VOC. */
export interface VocBarGeometry {
    /** Valor máximo de VOC (mínimo 1 para evitar div/0), usado p/ normalizar */
    maxVOC: number;
    /** Largura máxima de barra (px) */
    barMaxW: number;
}

/**
 * Calcula a escala das barras de VOC: valor máximo (clampeado em 1)
 * e largura máxima de barra. Comportamento idêntico ao inline original.
 * @param {Array<{ value: number }>} readings leituras VOC
 * @returns {VocBarGeometry}
 */
export function computeVocScale(readings: Array<{ value: number }>): VocBarGeometry {
    const maxVOC = Math.max(...readings.map((r) => r.value), 1);
    const barMaxW = COL.voc - 10;
    return { maxVOC, barMaxW };
}

/**
 * Largura (px) de uma barra de VOC para um dado valor, normalizada
 * pelo máximo e limitada por barMaxW.
 * @param {number} value valor de VOC (ppm)
 * @param {number} maxVOC máximo de VOC (já clampeado em 1)
 * @param {number} barMaxW largura máxima de barra (px)
 * @returns {number} largura em px
 */
export function computeVocBarWidth(value: number, maxVOC: number, barMaxW: number): number {
    return (value / maxVOC) * barMaxW;
}

// ----------------------------------------------------------------
// CROSS-SECTION CHAINAGE — geografia → metros + projeção em polilinha
//
// Extraído de WellProfileModule._openCrossSection (ARCH-MONOLITH-
// ATOMIZATION-001, modo REFACTOR). Pure-math determinística usada pelo
// modal de seção geológica para:
//   1) converter lat/lon → metros locais (projeção equiretangular);
//   2) projetar cada poço sobre a linha de seção, obtendo a distância
//      perpendicular (dist) e a quilometragem acumulada (chainage);
//   3) calcular a distância horizontal entre dois poços (auto-distância).
//
// O branch de coordenadas de getWellRelPosition NÃO é puro (depende dos
// adapters wgs84ToRelative/utmToRelative/getOrigin injetados em runtime) e
// permanece no módulo; apenas a fórmula de distância Euclidiana 2D foi
// extraída aqui. Comportamento IDÊNTICO ao código inline original.
// ----------------------------------------------------------------

/** Ponto geográfico (latitude/longitude em graus). */
export interface LatLng {
    lat: number;
    lng: number;
}

/** Ponto plano local (metros) a partir da origem da seção. */
export interface MeterXY {
    x: number;
    y: number;
}

/** Resultado da projeção de um poço sobre a linha de seção. */
export interface PolylineProjection {
    /** Distância perpendicular (m) do poço ao ponto mais próximo da linha. */
    dist: number;
    /** Quilometragem acumulada (m) ao longo da linha até o ponto projetado. */
    chain: number;
}

/** Metros por grau de longitude no equador (constante equiretangular). */
export const METERS_PER_DEG_LON_EQUATOR = 111320;

/** Metros por grau de latitude (constante equiretangular). */
export const METERS_PER_DEG_LAT = 110540;

/**
 * Cria um conversor lat/lon → metros locais (projeção equiretangular)
 * ancorado em (lat0, lon0). O fator de longitude é escalado por cos(lat0)
 * para compensar a convergência dos meridianos. Comportamento idêntico ao
 * inline `toMetersXYFactory` original.
 * @param {number} lat0 latitude da origem (graus)
 * @param {number} lon0 longitude da origem (graus)
 * @returns {(lat: number, lon: number) => MeterXY} conversor
 */
export function makeLatLngToMeters(lat0: number, lon0: number): (lat: number, lon: number) => MeterXY {
    const cosLat = Math.cos((lat0 * Math.PI) / 180);
    return (lat: number, lon: number): MeterXY => ({
        x: (lon - lon0) * METERS_PER_DEG_LON_EQUATOR * cosLat,
        y: (lat - lat0) * METERS_PER_DEG_LAT,
    });
}

/**
 * Projeta um poço (wellLL) sobre a polilinha de seção (lineLL), retornando
 * a distância perpendicular (dist) e a quilometragem acumulada (chain) do
 * ponto projetado mais próximo. A origem da projeção em metros é o primeiro
 * vértice da linha. Segmentos degenerados (comprimento² ≤ 1e-6) são
 * ignorados. Retorna null se a entrada for inválida (sem poço, ou linha com
 * menos de 2 vértices). Comportamento idêntico ao inline
 * `projectWellAlongPolyline` original.
 * @param {LatLng|null|undefined} wellLL poço a projetar
 * @param {LatLng[]|null|undefined} lineLL vértices da linha de seção
 * @returns {PolylineProjection|null}
 */
export function projectWellAlongPolyline(
    wellLL: LatLng | null | undefined,
    lineLL: LatLng[] | null | undefined,
): PolylineProjection | null {
    if (!wellLL || !lineLL || lineLL.length < 2) return null;
    const lat0 = lineLL[0]!.lat;
    const lon0 = lineLL[0]!.lng;
    const toXY = makeLatLngToMeters(lat0, lon0);
    const wp = toXY(wellLL.lat, wellLL.lng);
    let best: PolylineProjection = { dist: Infinity, chain: 0 };
    let chainAcc = 0;
    for (let i = 0; i < lineLL.length - 1; i++) {
        const a = toXY(lineLL[i]!.lat, lineLL[i]!.lng);
        const b = toXY(lineLL[i + 1]!.lat, lineLL[i + 1]!.lng);
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const len2 = vx * vx + vy * vy;
        if (len2 <= 1e-6) continue;
        let t = ((wp.x - a.x) * vx + (wp.y - a.y) * vy) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = a.x + t * vx;
        const py = a.y + t * vy;
        const dx = wp.x - px;
        const dy = wp.y - py;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const segLen = Math.sqrt(len2);
        const chain = chainAcc + t * segLen;
        if (dist < best.dist) best = { dist, chain };
        chainAcc += segLen;
    }
    return best;
}

/**
 * Distância horizontal (m) entre dois poços no plano local (X-Z), arredondada
 * ao metro e clampeada em no mínimo 1 m. Equivale ao núcleo puro de
 * `computeAutoDistance` (o eixo Y/elevação é ignorado, conforme original).
 * @param {{ x: number, z: number }} a posição do poço anterior
 * @param {{ x: number, z: number }} b posição do poço atual
 * @returns {number} distância em metros (≥ 1, inteiro)
 */
export function computeHorizontalDistance(a: { x: number; z: number }, b: { x: number; z: number }): number {
    return Math.max(1, Math.round(Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2)));
}
