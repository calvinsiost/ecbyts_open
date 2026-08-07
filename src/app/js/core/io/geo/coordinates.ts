// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   GEOREFERENCING — Coordinate transformations
   ================================================================

   Converte coordenadas entre o sistema relativo da aplicação (Three.js)
   e sistemas absolutos (UTM, WGS84 lat/lon).

   SISTEMA INTERNO (Three.js):
   - X = easting offset (metros da origem)
   - Y = vertical (elevação, positivo para cima)
   - Z = northing offset (positivo = sul em Three.js, invertido)

   TRANSFORMAÇÕES:
   - Relativo → UTM absoluto (soma offset de origem)
   - UTM → WGS84 lat/lon (fórmulas do elipsoide WGS84)
   - Inversas para importação

   ================================================================ */

import { safeSetItem } from '../../../utils/storage/storageMonitor.js';
import { normalizeUTMInput, normalizeWGS84Input } from './crsAdapter.js';
import { toFiniteNumber } from '../../../utils/helpers/toFiniteNumber.js';

// ----------------------------------------------------------------
// CONSTANTES DO ELIPSOIDE WGS84
// ----------------------------------------------------------------

const WGS84 = {
    a: 6378137.0, // Semi-eixo maior (metros)
    f: 1 / 298.257223563, // Achatamento
    get b() {
        return this.a * (1 - this.f);
    },
    get e() {
        return Math.sqrt(2 * this.f - this.f * this.f);
    },
    get e2() {
        return 2 * this.f - this.f * this.f;
    },
    get ep2() {
        return this.e2 / (1 - this.e2);
    },
};

const K0 = 0.9996; // Fator de escala UTM
const FALSE_EASTING = 500000;
const FALSE_NORTHING_S = 10000000; // Para hemisfério sul

// ----------------------------------------------------------------
// ESTADO - Origem UTM do modelo
// ----------------------------------------------------------------

const ORIGIN_STORAGE_KEY = 'ecbyts-last-origin';

let utmOrigin = {
    easting: 0,
    northing: 0,
    elevation: 0,
    zone: 23,
    hemisphere: 'S',
};

/**
 * Define a origem UTM do modelo.
 * Chamado quando o usuário configura o ponto de referência.
 * Persiste no localStorage para restaurar em sessões futuras.
 *
 * @param {Object} origin - { easting, northing, elevation, zone, hemisphere }
 */
export function setOrigin(origin: any) {
    const oldOrigin = { ...utmOrigin };
    utmOrigin = { ...utmOrigin, ...origin };

    // Persiste origem no localStorage para modo "Último Local"
    _persistOrigin();

    // Re-projeta elementos pré-existentes para o novo referencial UTM
    // (Calvin 2026-05-14: "uma importação (linhas) se deu à esquerda e a
    // de áreas à direita" — quando setOrigin muda sem reproject, elementos
    // anteriores ficam com coords relativas ao origin VELHO, causando split
    // visual entre datasets de timings diferentes).
    //
    // Só re-projeta se: (a) tinha origin antes (oldOrigin não-zero) E (b)
    // mudou de fato (delta > 1m). Skip se vai do (0,0) (default) para algo —
    // nesse caso elementos estavam em coords arbitrárias sem georef.
    const hadOldOrigin = oldOrigin.easting !== 0 || oldOrigin.northing !== 0;
    const dE = Math.abs(utmOrigin.easting - oldOrigin.easting);
    const dN = Math.abs(utmOrigin.northing - oldOrigin.northing);
    if (hadOldOrigin && (dE > 1 || dN > 1)) {
        try {
            reProjectAllElements(oldOrigin, utmOrigin);
        } catch (e) {
            console.debug('[coords] reProject on setOrigin failed:', e instanceof Error ? e.message : e);
        }
    }

    // Notifica HUD do globo e elementos que a origem mudou
    if (typeof window !== 'undefined') {
        window.dispatchEvent(
            new CustomEvent('originChanged', {
                detail: { oldOrigin, newOrigin: { ...utmOrigin } },
            }),
        );
    }
}

/**
 * Persiste a origem atual no localStorage.
 * Salva apenas se a origem é não-trivial (easting ou northing != 0).
 */
function _persistOrigin() {
    if (utmOrigin.easting === 0 && utmOrigin.northing === 0) return;
    safeSetItem(
        ORIGIN_STORAGE_KEY,
        JSON.stringify({
            easting: utmOrigin.easting,
            northing: utmOrigin.northing,
            elevation: utmOrigin.elevation,
            zone: utmOrigin.zone,
            hemisphere: utmOrigin.hemisphere,
        }),
    );
}

/**
 * Restaura a última origem salva no localStorage.
 * Retorna null se não houver origem salva.
 *
 * @returns {Object|null} - { easting, northing, elevation, zone, hemisphere } ou null
 */
export function getLastSavedOrigin() {
    try {
        const raw = localStorage.getItem(ORIGIN_STORAGE_KEY) || '';
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed) return null;
        // Valida que os valores são números finitos (protege contra NaN/Infinity/lixo)
        if (!Number.isFinite(parsed.easting) || !Number.isFinite(parsed.northing)) return null;
        if (parsed.easting === 0 && parsed.northing === 0) return null;
        // Garante zona válida (1-60)
        const zone = parseInt(parsed.zone, 10);
        if (!Number.isFinite(zone) || zone < 1 || zone > 60) return null;
        return {
            easting: parsed.easting,
            northing: parsed.northing,
            elevation: toFiniteNumber(parsed.elevation, 0),
            zone,
            hemisphere: parsed.hemisphere === 'N' ? 'N' : 'S',
        };
    } catch {
        return null;
    }
}

/**
 * Obtém a origem UTM atual.
 *
 * @returns {Record<string, any>}
 */
export function getOrigin() {
    return { ...utmOrigin };
}

/**
 * Verifica se a origem foi configurada (diferente de 0,0).
 *
 * @returns {boolean}
 */
export function hasOrigin() {
    return utmOrigin.easting !== 0 || utmOrigin.northing !== 0;
}

/**
 * Retorna origem efetiva para conversões UTM.
 * Quando a origem não está configurada (0,0), usa fallback neutro
 * correspondente a 0°N, 0°E (Equador/Greenwich) - zona UTM 31N.
 *
 * @returns {{ easting: number, northing: number, elevation: number, zone: number, hemisphere: string }} - Origem UTM válida para cálculos
 */
export function getEffectiveOrigin() {
    if (hasOrigin()) {
        return { ...utmOrigin };
    }
    // Fallback: UTM de (0°N, 0°E) - zona 31N
    return {
        easting: 166021,
        northing: 0,
        elevation: 0,
        zone: 31,
        hemisphere: 'N',
    };
}

// ----------------------------------------------------------------
// CONVERSÃO: Relativo → UTM
// ----------------------------------------------------------------

/**
 * Converte coordenadas relativas (Three.js) para UTM absolutas.
 * Three.js Z é invertido em relação ao northing.
 * Usa getEffectiveOrigin() para garantir UTM válido mesmo sem origem configurada.
 *
 * @param {{ x: number, y: number, z: number }} rel - Coordenadas relativas
 * @returns {{ easting: number, northing: number, elevation: number, zone: number, hemisphere: string }}
 */
export function relativeToUTM(rel: any) {
    const origin = getEffectiveOrigin();
    return {
        easting: origin.easting + (rel.x || 0),
        northing: origin.northing - (rel.z || 0),
        elevation: origin.elevation + (rel.y || 0),
        zone: origin.zone,
        hemisphere: origin.hemisphere,
    };
}

// ----------------------------------------------------------------
// CONVERSÃO: UTM → WGS84
// ----------------------------------------------------------------

/**
 * Converte coordenadas UTM para WGS84 (latitude/longitude).
 * Implementação padrão do algoritmo de Karney simplificado.
 *
 * @param {{ easting: number, northing: number, zone: number, hemisphere: string }} utm
 * @returns {{ latitude: number, longitude: number }}
 */
export function utmToWGS84(utm: any) {
    const norm = normalizeUTMInput(utm);
    if (!norm.valid) {
        return { latitude: NaN, longitude: NaN };
    }
    const { easting, northing, zone, hemisphere } = norm;
    const { a, e2, ep2 } = WGS84;
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

    // Remove false easting/northing
    const x = easting - FALSE_EASTING;
    const y = hemisphere === 'S' ? northing - FALSE_NORTHING_S : northing;

    // Meridiano central da zona
    const lonOrigin = (zone - 1) * 6 - 180 + 3;

    const M = y / K0;
    const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));

    // Latitude do pé (footpoint latitude)
    const phi1 =
        mu +
        ((3 * e1) / 2 - (27 * e1 * e1 * e1) / 32) * Math.sin(2 * mu) +
        ((21 * e1 * e1) / 16 - (55 * e1 * e1 * e1 * e1) / 32) * Math.sin(4 * mu) +
        ((151 * e1 * e1 * e1) / 96) * Math.sin(6 * mu) +
        ((1097 * e1 * e1 * e1 * e1) / 512) * Math.sin(8 * mu);

    const sinPhi1 = Math.sin(phi1);
    const cosPhi1 = Math.cos(phi1);
    const tanPhi1 = Math.tan(phi1);

    const N1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
    const T1 = tanPhi1 * tanPhi1;
    const C1 = ep2 * cosPhi1 * cosPhi1;
    const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
    const D = x / (N1 * K0);

    // Latitude
    const lat =
        phi1 -
        ((N1 * tanPhi1) / R1) *
            ((D * D) / 2 -
                ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D * D * D * D) / 24 +
                ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D * D * D * D * D * D) / 720);

    // Longitude
    const lon =
        (D -
            ((1 + 2 * T1 + C1) * D * D * D) / 6 +
            ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D * D * D * D * D) / 120) /
        cosPhi1;

    return {
        latitude: toDegrees(lat),
        longitude: toDegrees(lon) + lonOrigin,
    };
}

// ----------------------------------------------------------------
// CONVERSÃO: WGS84 → UTM
// ----------------------------------------------------------------

/**
 * Converte WGS84 (lat/lon) para UTM.
 *
 * @param {{ latitude: number, longitude: number }} latLon
 * @param {number} [latLon] - Forçar zona UTM específica
 * @returns {{ easting: number, northing: number, zone: number, hemisphere: string }}
 */
export function wgs84ToUTM(latLon: any, forceZone?: any) {
    const norm = normalizeWGS84Input(latLon);
    if (!norm.valid) {
        return {
            easting: NaN,
            northing: NaN,
            zone: toFiniteNumber(forceZone, 0),
            hemisphere: 'N',
        };
    }

    const { a, e2, ep2 } = WGS84;
    const lat = toRadians(norm.latitude);
    const lon = toRadians(norm.longitude);

    const zone = forceZone || Math.floor((norm.longitude + 180) / 6) + 1;
    const lonOrigin = toRadians((zone - 1) * 6 - 180 + 3);

    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const tanLat = Math.tan(lat);

    const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
    const T = tanLat * tanLat;
    const C = ep2 * cosLat * cosLat;
    const A = cosLat * (lon - lonOrigin);

    const M =
        a *
        ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * lat -
            ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) * Math.sin(2 * lat) +
            ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) * Math.sin(4 * lat) -
            ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * lat));

    const easting =
        K0 *
            N *
            (A + ((1 - T + C) * A * A * A) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A * A * A * A * A) / 120) +
        FALSE_EASTING;

    let northing =
        K0 *
        (M +
            N *
                tanLat *
                ((A * A) / 2 +
                    ((5 - T + 9 * C + 4 * C * C) * A * A * A * A) / 24 +
                    ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A * A * A * A * A * A) / 720));

    if (norm.latitude < 0) {
        northing += FALSE_NORTHING_S;
    }

    return {
        easting,
        northing,
        zone,
        hemisphere: norm.latitude >= 0 ? 'N' : 'S',
    };
}

// ----------------------------------------------------------------
// CONVERSÃO: UTM → Relativo
// ----------------------------------------------------------------

/**
 * Converte UTM absolutas para coordenadas relativas (Three.js).
 * Usa getEffectiveOrigin() para garantir UTM válido mesmo sem origem configurada.
 *
 * @param {{ easting: number, northing: number, elevation?: number }} utm
 * @returns {{ x: number, y: number, z: number }}
 */
export function utmToRelative(utm: any) {
    const origin = getEffectiveOrigin();
    return {
        x: (utm.easting || 0) - origin.easting,
        y: (utm.elevation || 0) - origin.elevation,
        z: -((utm.northing || 0) - origin.northing),
    };
}

// ----------------------------------------------------------------
// ATALHOS COMPOSTOS
// ----------------------------------------------------------------

/**
 * Relativo → WGS84 direto.
 *
 * @param {{ x: number, y: number, z: number }} rel
 * @returns {{ latitude: number, longitude: number, elevation: number }}
 */
export function relativeToWGS84(rel: any) {
    const utm = relativeToUTM(rel);
    const wgs = utmToWGS84(utm);
    return { ...wgs, elevation: utm.elevation };
}

/**
 * WGS84 → Relativo direto.
 *
 * @param {{ latitude: number, longitude: number, elevation?: number }} latLon
 * @returns {{ x: number, y: number, z: number }}
 */
export function wgs84ToRelative(latLon: any) {
    const origin = getEffectiveOrigin();
    const utm = wgs84ToUTM(latLon, origin.zone);
    return utmToRelative({ ...utm, elevation: latLon.elevation || 0 });
}

/**
 * Calcula código EPSG a partir de zona UTM e hemisfério.
 * Norte: EPSG:326xx, Sul: EPSG:327xx
 *
 * @param {number} zone
 * @param {string} hemisphere - 'N' ou 'S'
 * @returns {number}
 */
export function getEPSG(zone: any, hemisphere: any) {
    return hemisphere === 'N' ? 32600 + zone : 32700 + zone;
}

// ----------------------------------------------------------------
// TRUST-010 W-Norway — Norway + Svalbard UTM zone exceptions
// ----------------------------------------------------------------

/**
 * Resolve zona UTM considerando exceções Norway/Svalbard.
 *
 * REFERÊNCIA: A versão padronizada do UTM (DMA TM 8358.1, NGA) inclui exceções:
 *
 *   - **Zona 31V** (56°N ≤ lat < 64°N, 0°E ≤ lon < 3°E): largura reduzida
 *     (3° em vez de 6°), expandindo a zona vizinha 32V.
 *   - **Zona 32V** (56°N ≤ lat < 64°N, 3°E ≤ lon < 12°E): largura aumentada
 *     (9° em vez de 6°) cobrindo o sul da Noruega.
 *   - **Zonas Svalbard 31X..37X** (72°N ≤ lat < 84°N): apenas 5 zonas em vez
 *     de 6 (zonas 32X, 34X e 36X NÃO existem):
 *       - 31X (0°E ≤ lon < 9°E) — width 9°
 *       - 33X (9°E ≤ lon < 21°E) — width 12°
 *       - 35X (21°E ≤ lon < 33°E) — width 12°
 *       - 37X (33°E ≤ lon < 42°E) — width 9°
 *
 * Cálculo normal (lon+180)/6+1 → falha nesses casos. Este helper retorna o
 * número da zona correto.
 *
 * Opt-in: wgs84ToUTM continua usando o cálculo normal por backward compat.
 * Caller que precisa de precisão Norway/Svalbard chama este helper + passa
 * resultado como `forceZone`.
 *
 * @param latitude latitude em graus decimais
 * @param longitude longitude em graus decimais
 * @returns { zone, isException } com number 1..60 e flag se caiu em exception
 */
export function resolveUTMZoneWithExceptions(
    latitude: number,
    longitude: number,
): { zone: number; isException: boolean } {
    // Norway exception (56°N ≤ lat < 64°N)
    if (latitude >= 56 && latitude < 64) {
        if (longitude >= 0 && longitude < 3) return { zone: 31, isException: true };
        if (longitude >= 3 && longitude < 12) return { zone: 32, isException: true };
    }
    // Svalbard exception (72°N ≤ lat < 84°N): 5 zonas ímpares + larguras irregulares
    if (latitude >= 72 && latitude < 84) {
        if (longitude >= 0 && longitude < 9) return { zone: 31, isException: true };
        if (longitude >= 9 && longitude < 21) return { zone: 33, isException: true };
        if (longitude >= 21 && longitude < 33) return { zone: 35, isException: true };
        if (longitude >= 33 && longitude < 42) return { zone: 37, isException: true };
    }
    // Cálculo normal
    const zone = Math.floor((longitude + 180) / 6) + 1;
    return { zone: Math.max(1, Math.min(60, zone)), isException: false };
}

// ----------------------------------------------------------------
// TRUST-010 G5 + W8 — UTM range validation
// ----------------------------------------------------------------

/** Limite norte do UTM (latitude máxima válida). Acima → UPS necessário. */
export const UTM_NORTH_LIMIT_DEG = 84;
/** Limite sul do UTM (latitude mínima válida). Abaixo → UPS necessário. */
export const UTM_SOUTH_LIMIT_DEG = -80;
/** Largura de cada zona UTM em graus de longitude. */
export const UTM_ZONE_WIDTH_DEG = 6;

/**
 * TRUST-010 G5/W8: valida se latitude/longitude estão dentro do range UTM.
 * Acima de 84°N ou abaixo de -80°S, UTM é matematicamente incorreto
 * (deveria usar UPS - Universal Polar Stereographic).
 * Longitude fora da zona declarada (forceZone) causa distorção crescente.
 *
 * Retorna `{ valid, warnings[] }`. valid=false só em casos hard (lat fora de
 * [-90, 90] ou lon fora de [-180, 180]). Warnings são soft (UTM polar, lon
 * out-of-zone) — caller decide bloquear ou apenas avisar.
 *
 * Caller típico: handler de import/save de coordenada UTM forçada por usuário.
 * Não é chamado por `wgs84ToUTM` para evitar regressão silenciosa em todos os
 * callers existentes (chaves ECBT antigas com lat polar não devem quebrar).
 *
 * @param latitude latitude em graus decimais
 * @param longitude longitude em graus decimais
 * @param forceZone? zona UTM declarada (opcional; se ausente, deriva da longitude)
 * @returns { valid, warnings[] }
 */
export function assertUtmRangeValid(
    latitude: number,
    longitude: number,
    forceZone?: number,
): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    // Hard validity
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        return { valid: false, warnings: [`latitude fora de [-90, 90]: ${latitude}`] };
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        return { valid: false, warnings: [`longitude fora de [-180, 180]: ${longitude}`] };
    }
    // Soft warnings (TRUST-010 W8 — polar)
    if (latitude > UTM_NORTH_LIMIT_DEG) {
        warnings.push(
            `latitude ${latitude.toFixed(2)}° > ${UTM_NORTH_LIMIT_DEG}°N — UTM matematicamente incorreto. ` +
                `Deveria usar UPS (Universal Polar Stereographic). TRUST-010 W8 pendente.`,
        );
    } else if (latitude < UTM_SOUTH_LIMIT_DEG) {
        warnings.push(
            `latitude ${latitude.toFixed(2)}° < ${UTM_SOUTH_LIMIT_DEG}°S — UTM matematicamente incorreto. ` +
                `Deveria usar UPS (Universal Polar Stereographic). TRUST-010 W8 pendente.`,
        );
    }
    // TRUST-010 G5 — lon fora da zona declarada
    if (typeof forceZone === 'number' && forceZone >= 1 && forceZone <= 60) {
        const zoneCentralLon = (forceZone - 1) * UTM_ZONE_WIDTH_DEG - 180 + UTM_ZONE_WIDTH_DEG / 2;
        const dLon = Math.abs(longitude - zoneCentralLon);
        // Tolera até 1 zona adjacente (3° de cada lado da zona declarada);
        // além disso = distorção significativa (>0.4% sobre a base 1.000 do K0).
        if (dLon > UTM_ZONE_WIDTH_DEG) {
            warnings.push(
                `longitude ${longitude.toFixed(2)}° fora da zona UTM ${forceZone} ` +
                    `(centro ${zoneCentralLon.toFixed(0)}°, |Δ|=${dLon.toFixed(1)}°). ` +
                    `Use forceZone correto ou deixe automático (deriva da longitude). TRUST-010 G5.`,
            );
        }
    }
    return { valid: true, warnings };
}

// ----------------------------------------------------------------
// UTILIDADES
// ----------------------------------------------------------------

function toRadians(/** @type {number} */ deg: any) {
    return (deg * Math.PI) / 180;
}
function toDegrees(/** @type {number} */ rad: any) {
    return (rad * 180) / Math.PI;
}

/**
 * Extrai posição {x, y, z} de um elemento, independente da família.
 * Diferentes famílias armazenam posição de formas diferentes.
 *
 * @param {Record<string, any>} element - Elemento do modelo
 * @returns {{ x: number, y: number, z: number }}
 */
export function getElementPosition(element: any) {
    const d = element.data || {};

    // Plume: center
    if (d.center) {
        return { x: d.center.x || 0, y: d.center.y || 0, z: d.center.z || 0 };
    }

    // Well: coordinates (easting/northing)
    if (d.coordinates) {
        return {
            x: d.coordinates.easting || 0,
            y: d.coordinates.elevation || 0,
            z: d.coordinates.northing || 0,
        };
    }

    // Generic: position
    if (d.position) {
        return { x: d.position.x || 0, y: d.position.y || 0, z: d.position.z || 0 };
    }

    // River/Path: midpoint
    if (d.path && d.path.length > 0) {
        const mid = d.path[Math.floor(d.path.length / 2)];
        return { x: mid.x || 0, y: mid.y || 0, z: mid.z || 0 };
    }

    // Boundary: centroid
    if (d.vertices && d.vertices.length > 0) {
        const cx =
            d.vertices.reduce((/** @type {number} */ s: any, /** @type {any} */ v: any) => s + (v.x || 0), 0) / d.vertices.length;
        const cy =
            d.vertices.reduce((/** @type {number} */ s: any, /** @type {any} */ v: any) => s + (v.y || 0), 0) / d.vertices.length;
        const cz =
            d.vertices.reduce((/** @type {number} */ s: any, /** @type {any} */ v: any) => s + (v.z || 0), 0) / d.vertices.length;
        return { x: cx, y: cy, z: cz };
    }

    return { x: 0, y: 0, z: 0 };
}

/**
 * Re-projeta todos os elementos apos mudanca de origin.
 * Converte coordenadas relativas (old origin) → absolutas UTM → relativas (new origin).
 * Trata os 5 padroes de posicao: center, coordinates, position, path, vertices.
 *
 * @param {Record<string, any>} oldOrigin - { easting, northing }
 * @param {Record<string, any>} newOrigin - { easting, northing }
 */
export function reProjectAllElements(oldOrigin: any, newOrigin: any) {
    const { getAllElements } = _getElementsManager();
    if (!getAllElements) return;

    // Bug fix 2026-05-14 (Calvin): split visual L/R entre layers de timings
    // diferentes. Z relativo é INVERTIDO em relação a northing:
    //   z_rel = -(northing - origin.northing) = origin.northing - northing
    // Logo, quando origin muda:
    //   z_new - z_old = (origin_new.N - origin_old.N) = -(origin_old.N - origin_new.N)
    // Para X (easting), relação é direta:
    //   x_rel = easting - origin.easting
    //   x_new - x_old = -(origin_new.E - origin_old.E) = origin_old.E - origin_new.E
    // Sinais OPOSTOS! Antes ambos eram (old - new), causando errDz = 2× delta real.
    const dx = oldOrigin.easting - newOrigin.easting; // X: relativo "compensação inversa"
    const dz = newOrigin.northing - oldOrigin.northing; // Z: relativo direto (sinal trocado de antes)
    if (dx === 0 && dz === 0) return;

    // Para d.coordinates (UTM absoluto, não relativo) o delta é diferente:
    // como esses são valores ABSOLUTOS, eles não precisam mudar quando a
    // origem do referencial Three.js muda. Mantemos atualizados aqui só por
    // backward-compat (alguns elementos legacy guardam coordinates como o
    // easting/northing absoluto e podem confiar nessa rigidez).
    const dEasting = oldOrigin.easting - newOrigin.easting; // não usado em rel-coords
    const dNorthing = oldOrigin.northing - newOrigin.northing;

    for (const el of getAllElements()) {
        const d = el.data;
        if (!d) continue;

        if (d.center) {
            d.center.x = (d.center.x || 0) + dx;
            d.center.z = (d.center.z || 0) + dz;
        }
        if (d.coordinates) {
            // UTM absoluto: não muda em re-projeção do referencial relativo
            // Mantém valores absolutos (apenas refresh se faltavam)
            d.coordinates.easting = d.coordinates.easting ?? 0;
            d.coordinates.northing = d.coordinates.northing ?? 0;
            void dEasting;
            void dNorthing;
        }
        if (d.position) {
            d.position.x = (d.position.x || 0) + dx;
            d.position.z = (d.position.z || 0) + dz;
        }
        if (d.path && Array.isArray(d.path)) {
            for (const pt of d.path) {
                pt.x = (pt.x || 0) + dx;
                pt.z = (pt.z || 0) + dz;
            }
        }
        if (d.vertices && Array.isArray(d.vertices)) {
            for (const v of d.vertices) {
                v.x = (v.x || 0) + dx;
                v.z = (v.z || 0) + dz;
            }
        }
    }
}

// Lazy reference para evitar circular dependency com elements/manager.js
// Injetada por main.js apos boot via setElementsGetter()
/** @type {any} */
let _getAllElementsFn: any = null;

/**
 * Registra a funcao getAllElements para uso em reProjectAllElements.
 * Chamada por main.js para evitar circular import.
 * @param {Function} fn - getAllElements do elements/manager.js
 */
export function setElementsGetter(fn: any) {
    _getAllElementsFn = fn;
}

function _getElementsManager() {
    return { getAllElements: _getAllElementsFn || (() => []) };
}
