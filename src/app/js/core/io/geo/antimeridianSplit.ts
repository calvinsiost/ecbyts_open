// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// TRUST-010 W-Antimeridian — pure-logic split de polygon ring cruzando ±180°.
//
// PROBLEMA: GeoJSON RFC 7946 § 3.1.9 exige polígonos não cruzarem antimeridian.
// Datasets reais (Fiji, Russia Far East, Aleutian Islands, Antarctica) VIOLAM
// essa regra. Sem split, operações geométricas (buffer, area, intersect) em
// polygon cruzando 180° dão resultados sem sentido (área inclui meio planeta,
// centroide cai em (0, 0), point-in-polygon retorna inverso).
//
// REFERÊNCIA:
// - RFC 7946 § 3.1.9 — "antimeridian cutting":
//   "Software MUST be able to handle GeoJSON objects whose geometries span
//    the antimeridian by cutting them along it."
// - Greiner-Hormann polygon clipping (1998) — algoritmo de clipping clássico
//
// ABORDAGEM:
// - Itera segmentos do ring (par de vértices consecutivos)
// - Quando |lon1 - lon2| > 180, é cruzamento do antimeridian
// - Calcula latitude da intersecção com ±180 via interpolação linear no
//   espaço modular (great-circle exato seria GeographicLib; linear é OK
//   para latitudes <85° e suficiente para visualização/area approximation)
// - Split em 2 sub-rings: leste (lon ≥ 0) + oeste (lon ≤ 0)

export interface AntimeridianPoint {
    readonly lon: number;
    readonly lat: number;
}

export interface SplitResult {
    readonly crosses: boolean;
    readonly rings: ReadonlyArray<ReadonlyArray<AntimeridianPoint>>;
}

/**
 * Detecta se um segmento (p1→p2) cruza o antimeridian (±180°).
 * Heurística RFC 7946: se |Δlon| > 180°, é cruzamento curto (atravessa antimeridian).
 * @param p1 ponto inicial {lon, lat}
 * @param p2 ponto final {lon, lat}
 * @returns true se cruza antimeridian
 */
export function segmentCrossesAntimeridian(p1: AntimeridianPoint, p2: AntimeridianPoint): boolean {
    if (!p1 || !p2) return false;
    if (!Number.isFinite(p1.lon) || !Number.isFinite(p2.lon)) return false;
    return Math.abs(p1.lon - p2.lon) > 180;
}

/**
 * Calcula latitude da intersecção de um segmento que cruza antimeridian com
 * a linha ±180°. Interpolação linear no espaço modular (offset +360 ao lon
 * negativo antes do lerp). Suficiente para latitudes <85° e RFC 7946 cutting.
 * @param p1 ponto leste ou oeste
 * @param p2 ponto oposto
 * @returns latitude exata da intersecção
 */
export function latitudeAtAntimeridian(p1: AntimeridianPoint, p2: AntimeridianPoint): number {
    // Normalize: trabalha com p1 a leste (lon > 0) e p2 a oeste (lon < 0).
    // Se invertido, swap mantém a fórmula.
    let a = p1;
    let b = p2;
    if (a.lon < 0 && b.lon >= 0) {
        a = p2;
        b = p1;
    }
    // a.lon > 0, b.lon < 0. Para interp linear modular, somar 360 ao b.lon.
    const lonA = a.lon;
    const lonB = b.lon + 360;
    // t = (180 - lonA) / (lonB - lonA): fração de a→b até atingir lon=180
    const denom = lonB - lonA;
    if (denom === 0) return a.lat; // caso degenerado
    const t = (180 - lonA) / denom;
    return a.lat + t * (b.lat - a.lat);
}

/**
 * Detecta se um ring (fechado ou aberto) cruza o antimeridian em algum segmento.
 * @param ring array de pontos {lon, lat}
 * @returns true se algum segmento cruza ±180°
 */
export function ringCrossesAntimeridian(ring: ReadonlyArray<AntimeridianPoint>): boolean {
    if (!Array.isArray(ring) || ring.length < 2) return false;
    for (let i = 0; i < ring.length - 1; i++) {
        if (segmentCrossesAntimeridian(ring[i], ring[i + 1])) return true;
    }
    return false;
}

function _insertAntimeridianIntersections(ring: ReadonlyArray<AntimeridianPoint>): AntimeridianPoint[] {
    // Insere vértices nos pontos de intersecção. Cada segmento cruzando vira
    // [p1, (intersecção +180 ou -180 conforme lado), p2].
    const enriched: AntimeridianPoint[] = [];
    for (let i = 0; i < ring.length; i++) {
        const p1 = ring[i] as AntimeridianPoint;
        enriched.push(p1);
        const p2 = ring[(i + 1) % ring.length] as AntimeridianPoint;
        if (i < ring.length - 1 && segmentCrossesAntimeridian(p1, p2)) {
            const lat = latitudeAtAntimeridian(p1, p2);
            // Duas inserções: 180 (lado leste) e -180 (lado oeste), preservando
            // a continuidade quando o caller depois fechar cada sub-ring.
            const eastSide = p1.lon > 0 ? 180 : -180;
            const westSide = p1.lon > 0 ? -180 : 180;
            enriched.push({ lon: eastSide, lat });
            enriched.push({ lon: westSide, lat });
        }
    }
    return enriched;
}

function _isBoundaryTransition(p: AntimeridianPoint, next: AntimeridianPoint): boolean {
    return Math.abs(p.lon) === 180 && Math.abs(next.lon) === 180 && p.lon !== next.lon;
}

function _partitionEnrichedRings(enriched: ReadonlyArray<AntimeridianPoint>): AntimeridianPoint[][] {
    // Particiona enriched em sub-rings por hemisfério (sign do lon).
    // Sub-ring quebra quando passa de +180 → -180 (ou inverso) na sequência
    // de intersecções inseridas.
    const subRings: AntimeridianPoint[][] = [];
    let current: AntimeridianPoint[] = [];
    for (let i = 0; i < enriched.length; i++) {
        const p = enriched[i] as AntimeridianPoint;
        current.push(p);
        const next = enriched[i + 1] as AntimeridianPoint | undefined;
        if (next && _isBoundaryTransition(p, next)) {
            subRings.push(current);
            current = [];
        }
    }
    if (current.length > 0) subRings.push(current);
    return subRings;
}

function _filterDegenerateSubRings(subRings: AntimeridianPoint[][]): AntimeridianPoint[][] {
    // Filtra sub-rings degenerados (<3 vértices distintos).
    return subRings.filter((r) => {
        const unique = new Set(r.map((p) => `${p.lon},${p.lat}`));
        return unique.size >= 3;
    });
}

/**
 * Split de ring cruzando antimeridian em sub-rings.
 *
 * Estratégia: insere vértices nos pontos de intersecção com ±180°; depois
 * agrupa segmentos contíguos no hemisfério leste (lon ≥ 0) e oeste (lon ≤ 0).
 *
 * Para um ring com 1 cruzamento (entrada) e 1 cruzamento (saída) — caso típico
 * Fiji/Russia — retorna 2 sub-rings. Casos múltiplos cruzamentos (Antartica,
 * polígono complexo) podem retornar 3+ sub-rings.
 *
 * @param ring array de pontos {lon, lat} (assumido não-fechado; closure não
 *             necessária aqui — caller adiciona se RFC 7946 compliance for needed)
 * @returns SplitResult com crosses=true e rings[] se cruza; crosses=false e
 *          rings=[ring] se não cruza
 */
export function splitPolygonAtAntimeridian(
    ring: ReadonlyArray<AntimeridianPoint>,
): SplitResult {
    if (!Array.isArray(ring) || ring.length < 3) {
        return { crosses: false, rings: [ring || []] };
    }
    if (!ringCrossesAntimeridian(ring)) {
        return { crosses: false, rings: [ring] };
    }

    const enriched = _insertAntimeridianIntersections(ring);
    const subRings = _partitionEnrichedRings(enriched);
    const valid = _filterDegenerateSubRings(subRings);

    if (valid.length === 0) {
        return { crosses: true, rings: [ring] };
    }
    return { crosses: true, rings: valid };
}
