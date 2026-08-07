// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: SpatialBlueprint - CRS Projection & Metric Operations
// ADR: ADR-021

// ================================================================
// projection.js - Projecao CRS e operacoes metricas
// Transforma coordenadas entre sistemas de referencia (proj4),
// simplifica geometrias e calcula areas em CRS metrico (UTM).
//
// REGRA DE OURO #2: NUNCA simplificar ou calcular area em graus.
// Pipeline obrigatorio: fonte -> UTM -> simplificar/area -> WGS84
// ================================================================

import { importCDN } from '../../utils/helpers/cdnLoader.js';

/** @type {any} cache do modulo proj4 */
let _proj4: any = null;

/**
 * Carrega proj4 sob demanda via CDN.
 * @returns {Promise<any>}
 */
async function loadProj4() {
    if (_proj4) return _proj4;
    _proj4 = await importCDN('https://esm.sh/proj4@2.12.1', { name: 'proj4' });
    registerBrazilianCRS(_proj4);
    return _proj4;
}

/**
 * Registra CRS brasileiros comuns no proj4.
 * SIRGAS 2000 / UTM zones usados na maioria dos projetos ambientais no Brasil.
 *
 * @param {any} proj4
 */
function registerBrazilianCRS(proj4: any) {
    // SIRGAS 2000 / UTM zone 22S (RS, SC, PR oeste, MS)
    proj4.defs('EPSG:31982', '+proj=utm +zone=22 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
    // SIRGAS 2000 / UTM zone 23S (SP, MG, RJ, PR leste, GO sul)
    proj4.defs('EPSG:31983', '+proj=utm +zone=23 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
    // SIRGAS 2000 / UTM zone 24S (BA, ES, SE)
    proj4.defs('EPSG:31984', '+proj=utm +zone=24 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
    // SIRGAS 2000 / UTM zone 21S (MT, MS, GO)
    proj4.defs('EPSG:31981', '+proj=utm +zone=21 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
    // SIRGAS 2000 / UTM zone 25S (AL, PE, PB, SE)
    proj4.defs('EPSG:31985', '+proj=utm +zone=25 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
    // SIRGAS 2000 Geographic (lat/lon)
    proj4.defs('EPSG:4674', '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs');
    // SAD69 / UTM zone 23S (legado, ainda encontrado em projetos antigos)
    proj4.defs(
        'EPSG:29183',
        '+proj=utm +zone=23 +south +ellps=aust_SA +towgs84=-66.87,4.37,-38.52,0,0,0,0 +units=m +no_defs',
    );
}

/**
 * Determina a zona UTM apropriada para um conjunto de coordenadas.
 *
 * @param {number} lon - Longitude representativa (centroide)
 * @param {number} lat - Latitude representativa (centroide)
 * @returns {{ zone: number, hemisphere: 'N'|'S', epsg: string, proj4def: string }}
 */
export function determineUTMZone(lon: any, lat: any) {
    const zone = Math.floor((lon + 180) / 6) + 1;
    const hemisphere = lat >= 0 ? 'N' : 'S';
    const epsgBase = hemisphere === 'N' ? 32600 : 32700;
    const epsg = `EPSG:${epsgBase + zone}`;
    const proj4def = `+proj=utm +zone=${zone} ${hemisphere === 'S' ? '+south ' : ''}+datum=WGS84 +units=m +no_defs`;

    return { zone, hemisphere, epsg, proj4def };
}

/**
 * Projeta coordenadas de um CRS fonte para UTM metrico.
 *
 * @param {Array<[number, number]>} coords - Pares [x, y] no CRS fonte
 * @param {string} sourceCRS - Codigo EPSG (ex: 'EPSG:31983')
 * @param {string} [targetCRS?] - CRS alvo (auto-detecta UTM se omitido)
 * @returns {Promise<{coords: Array<[number, number]>, targetCRS: string}>}
 */
export async function projectToUTM(coords: any, sourceCRS: any, targetCRS?: any) {
    const proj4 = await loadProj4();

    // Se nao informou target, primeiro projeta para WGS84 e descobre a zona UTM
    if (!targetCRS) {
        const wgs84Coords = coords.map((c: any) => {
            try {
                return proj4(sourceCRS, 'EPSG:4326', c);
            } catch {
                return c;
            }
        });

        // Centroide para determinar zona UTM
        const centroid = computeCentroid(wgs84Coords);
        const utm = determineUTMZone(centroid[0], centroid[1]);

        // Registra a zona UTM se nao existir
        try {
            proj4.defs(utm.epsg);
        } catch {
            proj4.defs(utm.epsg, utm.proj4def);
        }
        if (!proj4.defs(utm.epsg)) {
            proj4.defs(utm.epsg, utm.proj4def);
        }

        targetCRS = utm.epsg;
    }

    const projected = coords.map((c: any) => proj4(sourceCRS, targetCRS, c));
    return { coords: projected, targetCRS };
}

/**
 * Projeta coordenadas de qualquer CRS para WGS84 (EPSG:4326).
 *
 * @param {Array<[number, number]>} coords - Coordenadas no CRS fonte
 * @param {string} sourceCRS - Codigo EPSG fonte
 * @returns {Promise<Array<[number, number]>>} - Pares [lon, lat]
 */
export async function projectToWGS84(coords: any, sourceCRS: any) {
    const proj4 = await loadProj4();
    return coords.map((c: any) => proj4(sourceCRS, 'EPSG:4326', c));
}

/**
 * Simplifica poligono usando Douglas-Peucker em coordenadas metricas.
 *
 * REGRA DE OURO #2: NUNCA chamar esta funcao com coordenadas em graus.
 * A tolerancia e em metros.
 *
 * @param {Array<[number, number]>} coords - Coordenadas em CRS metrico
 * @param {number} [tolerance=0.5] - Tolerancia em metros
 * @returns {Array<[number, number]>} - Coordenadas simplificadas
 */
export function simplifyMetric(coords: any, tolerance = 0.5) {
    if (coords.length <= 3) return coords;
    return douglasPeucker(coords, tolerance);
}

/**
 * Calcula area de poligono usando formula Shoelace em CRS metrico.
 *
 * REGRA DE OURO #2: NUNCA chamar com coordenadas em graus.
 * O resultado e em metros quadrados.
 *
 * @param {Array<[number, number]>} coords - Anel de coordenadas em CRS metrico
 * @returns {number} - Area em metros quadrados (valor absoluto)
 */
export function calculateAreaMetric(coords: any) {
    if (coords.length < 3) return 0;

    let area = 0;
    const n = coords.length;

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += coords[i][0] * coords[j][1];
        area -= coords[j][0] * coords[i][1];
    }

    return Math.abs(area / 2);
}

// ----------------------------------------------------------------
// FUNCOES AUXILIARES INTERNAS
// ----------------------------------------------------------------

/**
 * Algoritmo Douglas-Peucker para simplificacao de linhas.
 *
 * @param {Array<[number, number]>} points
 * @param {number} epsilon - Tolerancia
 * @returns {Array<[number, number]>}
 */
function douglasPeucker(points: any, epsilon: any): any[] {
    if (points.length <= 2) return points;

    // Encontra ponto com maior distancia perpendicular
    let maxDist = 0;
    let maxIdx = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
        const dist = perpendicularDistance(points[i], first, last);
        if (dist > maxDist) {
            maxDist = dist;
            maxIdx = i;
        }
    }

    // Se distancia maxima > epsilon, recursivamente simplifica
    if (maxDist > epsilon) {
        const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
        const right = douglasPeucker(points.slice(maxIdx), epsilon);
        return left.slice(0, -1).concat(right);
    }

    return [first, last];
}

/**
 * Distancia perpendicular de um ponto a uma reta (segmento).
 *
 * @param {[number, number]} point
 * @param {[number, number]} lineStart
 * @param {[number, number]} lineEnd
 * @returns {number}
 */
function perpendicularDistance(point: any, lineStart: any, lineEnd: any) {
    const dx = lineEnd[0] - lineStart[0];
    const dy = lineEnd[1] - lineStart[1];

    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) {
        // Ponto degenera - distancia ao ponto
        const ddx = point[0] - lineStart[0];
        const ddy = point[1] - lineStart[1];
        return Math.sqrt(ddx * ddx + ddy * ddy);
    }

    // Area do triangulo * 2 / base
    const area = Math.abs(dx * (lineStart[1] - point[1]) - (lineStart[0] - point[0]) * dy);
    return area / Math.sqrt(lengthSq);
}

/**
 * Calcula centroide de um conjunto de coordenadas.
 *
 * @param {Array<[number, number]>} coords
 * @returns {[number, number]}
 */
function computeCentroid(coords: any) {
    if (coords.length === 0) return [0, 0];
    let sumX = 0,
        sumY = 0;
    for (const [x, y] of coords) {
        sumX += x;
        sumY += y;
    }
    return [sumX / coords.length, sumY / coords.length];
}
