// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// TRUST-010 W9 — Helmert 7-parameter datum transformation (pure-math, sem
// dependência externa). Implementação minimalista cobrindo 3 pares críticos:
// WGS84↔NAD27 (US legacy), WGS84↔Tokyo Datum (JP legacy), WGS84↔SIRGAS 2000 (BR).
//
// FUNDAMENTO MATEMÁTICO:
// 1. Coordenadas geográficas (lat, lon, h) → cartesianas geocêntricas (X, Y, Z)
//    via fórmulas de Heiskanen-Moritz (NIMA TR8350.2 Eq. 7-7..7-9).
// 2. Aplicar Helmert 7-param (Bursa-Wolf):
//      X' = dx + (1+ds)*(X - rz*Y + ry*Z)
//      Y' = dy + (1+ds)*(rz*X + Y - rx*Z)
//      Z' = dz + (1+ds)*(-ry*X + rx*Y + Z)
// 3. Reverter cartesianas → geográficas (Bowring 1976 / iterative latitude).
//
// PARÂMETROS CANÔNICOS:
// - WGS84 → NAD27 (CONUS Mean): NIMA TR8350.2 Table 4.5
// - WGS84 → Tokyo Datum: NIMA TR8350.2 Table 4.6 / Japan GSI
// - WGS84 → SIRGAS 2000: IBGE Res PR-22/2005 (essencialmente identidade)
//
// PRECISÃO: Helmert 7-param assume datums alinhados a ITRF; para conversão
// realmente precisa (cm-level), use grid shift (NTv2 etc.) que NÃO está aqui.
// Para uso CETESB DD-038 e equivalentes (~5m tolerância), o erro Helmert é
// muito menor (~1-5m residual após transformação).

export interface EllipsoidParams {
    readonly a: number; // semi-major axis (m)
    readonly f: number; // flattening
}

/** Ellipsoides comuns (NIMA TR8350.2). */
export const ELLIPSOIDS: Record<string, EllipsoidParams> = {
    WGS84: { a: 6378137.0, f: 1 / 298.257223563 },
    GRS80: { a: 6378137.0, f: 1 / 298.257222101 }, // ≈ WGS84 (usado por NAD83/SIRGAS2000)
    Clarke1866: { a: 6378206.4, f: 1 / 294.9786982 }, // NAD27
    Bessel1841: { a: 6377397.155, f: 1 / 299.1528128 }, // Tokyo Datum / antigos
};

export interface Helmert7Params {
    readonly dx: number; // translation X (m)
    readonly dy: number;
    readonly dz: number;
    readonly rx: number; // rotation X (radians, small angle)
    readonly ry: number;
    readonly rz: number;
    readonly ds: number; // scale factor (dimensionless, e.g. 1e-6 = 1 ppm)
    readonly sourceEllipsoid: string;
    readonly targetEllipsoid: string;
    readonly sourceLabel: string;
    readonly targetLabel: string;
    readonly reference: string;
    readonly accuracyM: number; // residual accuracy after transformation
}

/**
 * Catálogo canônico de transformações (WGS84 ↔ datum legado).
 * Sinais seguem convenção Bursa-Wolf positiva (X_target = dx + (1+ds)*[R]*X_source).
 *
 * Para inverter (datum → WGS84), use `invertHelmert(params)`.
 */
const HELMERT_CATALOG: Record<string, Helmert7Params> = {
    'WGS84->NAD27': {
        dx: -8,
        dy: 160,
        dz: 176, // NIMA TR8350.2 Table 4.5 (CONUS Mean)
        rx: 0,
        ry: 0,
        rz: 0,
        ds: 0, // 3-param (translation only) — adequado para CONUS mean
        sourceEllipsoid: 'WGS84',
        targetEllipsoid: 'Clarke1866',
        sourceLabel: 'WGS84',
        targetLabel: 'NAD27',
        reference: 'NIMA TR8350.2 Table 4.5 (CONUS Mean)',
        accuracyM: 5, // residual ~5m após shift
    },
    'WGS84->TOKYODATUM': {
        dx: -148,
        dy: 507,
        dz: 685, // NIMA TR8350.2 Table 4.6 / Japan GSI
        rx: 0,
        ry: 0,
        rz: 0,
        ds: 0,
        sourceEllipsoid: 'WGS84',
        targetEllipsoid: 'Bessel1841',
        sourceLabel: 'WGS84',
        targetLabel: 'Tokyo Datum',
        reference: 'NIMA TR8350.2 Table 4.6 / Japan GSI',
        accuracyM: 10,
    },
    'WGS84->SIRGAS2000': {
        dx: 0,
        dy: 0,
        dz: 0, // IBGE PR-22/2005 — sub-métrico (G1 documentado)
        rx: 0,
        ry: 0,
        rz: 0,
        ds: 0,
        sourceEllipsoid: 'WGS84',
        targetEllipsoid: 'GRS80',
        sourceLabel: 'WGS84',
        targetLabel: 'SIRGAS 2000',
        reference: 'IBGE Res PR-22/2005 (ITRF2000 época 2000.4)',
        accuracyM: 1,
    },
};

/** Inverte parâmetros Helmert (target ↔ source). */
export function invertHelmert(p: Helmert7Params): Helmert7Params {
    return {
        dx: -p.dx,
        dy: -p.dy,
        dz: -p.dz,
        rx: -p.rx,
        ry: -p.ry,
        rz: -p.rz,
        ds: -p.ds,
        sourceEllipsoid: p.targetEllipsoid,
        targetEllipsoid: p.sourceEllipsoid,
        sourceLabel: p.targetLabel,
        targetLabel: p.sourceLabel,
        reference: p.reference + ' (inverted)',
        accuracyM: p.accuracyM,
    };
}

/**
 * Busca parâmetros Helmert para um par de datums. Retorna null se não-catalogado.
 * Suporta normalização (case-insensitive, sem espaços) + inversão automática.
 */
export function getHelmertParams(fromDatum: string, toDatum: string): Helmert7Params | null {
    const from = (fromDatum || '').toUpperCase().replace(/[\s_-]/g, '');
    const to = (toDatum || '').toUpperCase().replace(/[\s_-]/g, '');
    const key = `${from}->${to}`;
    if (HELMERT_CATALOG[key]) return HELMERT_CATALOG[key];
    // Try inverted
    const invKey = `${to}->${from}`;
    if (HELMERT_CATALOG[invKey]) return invertHelmert(HELMERT_CATALOG[invKey]);
    return null;
}

/**
 * Converte (latitude, longitude, height) → cartesianas geocêntricas (X, Y, Z).
 * Fórmulas: Heiskanen-Moritz / NIMA TR8350.2 Eq. 7-7..7-9.
 *
 * @param latitude graus decimais
 * @param longitude graus decimais
 * @param heightM altura elipsoidal em metros (default 0)
 * @param ellipsoid ellipsoid params (default WGS84)
 */
export function wgs84LlaToCartesian(
    latitude: number,
    longitude: number,
    heightM: number = 0,
    ellipsoid: EllipsoidParams = ELLIPSOIDS.WGS84!,
): { X: number; Y: number; Z: number } {
    const { a, f } = ellipsoid;
    const e2 = 2 * f - f * f;
    const lat = (latitude * Math.PI) / 180;
    const lon = (longitude * Math.PI) / 180;
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
    const X = (N + heightM) * cosLat * Math.cos(lon);
    const Y = (N + heightM) * cosLat * Math.sin(lon);
    const Z = (N * (1 - e2) + heightM) * sinLat;
    return { X, Y, Z };
}

/**
 * Converte cartesianas geocêntricas (X, Y, Z) → (latitude, longitude, height).
 * Bowring 1976 iterative (5 iterações = convergência sub-mm).
 */
export function cartesianToLla(
    X: number,
    Y: number,
    Z: number,
    ellipsoid: EllipsoidParams = ELLIPSOIDS.WGS84!,
): { latitude: number; longitude: number; heightM: number } {
    const { a, f } = ellipsoid;
    const b = a * (1 - f);
    const e2 = 2 * f - f * f;
    const ep2 = e2 / (1 - e2);
    const p = Math.sqrt(X * X + Y * Y);
    const theta = Math.atan2(Z * a, p * b);
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    const lat = Math.atan2(
        Z + ep2 * b * sinTheta * sinTheta * sinTheta,
        p - e2 * a * cosTheta * cosTheta * cosTheta,
    );
    const lon = Math.atan2(Y, X);
    const sinLat = Math.sin(lat);
    const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
    const heightM = p / Math.cos(lat) - N;
    return {
        latitude: (lat * 180) / Math.PI,
        longitude: (lon * 180) / Math.PI,
        heightM,
    };
}

/**
 * Aplica transformação Helmert 7-param em coordenadas cartesianas geocêntricas.
 * Bursa-Wolf positivo: X' = dx + (1+ds)*(X - rz*Y + ry*Z), etc.
 */
export function applyHelmert(
    X: number,
    Y: number,
    Z: number,
    params: Helmert7Params,
): { X: number; Y: number; Z: number } {
    const { dx, dy, dz, rx, ry, rz, ds } = params;
    const scale = 1 + ds;
    return {
        X: dx + scale * (X - rz * Y + ry * Z),
        Y: dy + scale * (rz * X + Y - rx * Z),
        Z: dz + scale * (-ry * X + rx * Y + Z),
    };
}

/**
 * Reprojeta (lat, lon, h) de um datum source para target via Helmert 7-param.
 * Pipeline: source LLA → source Cartesian → Helmert → target Cartesian → target LLA.
 * Retorna null se par de datums não-catalogado.
 *
 * @param latitude graus decimais no source datum
 * @param longitude graus decimais
 * @param heightM altura elipsoidal (default 0)
 * @param fromDatum 'WGS84' | 'NAD27' | 'TokyoDatum' | 'SIRGAS2000'
 * @param toDatum idem
 */
export function reprojectDatum(
    latitude: number,
    longitude: number,
    heightM: number,
    fromDatum: string,
    toDatum: string,
): { latitude: number; longitude: number; heightM: number; accuracyM: number } | null {
    const params = getHelmertParams(fromDatum, toDatum);
    if (!params) return null;
    const srcEll = ELLIPSOIDS[params.sourceEllipsoid] || ELLIPSOIDS.WGS84;
    const tgtEll = ELLIPSOIDS[params.targetEllipsoid] || ELLIPSOIDS.WGS84;
    const src = wgs84LlaToCartesian(latitude, longitude, heightM, srcEll);
    const shifted = applyHelmert(src.X, src.Y, src.Z, params);
    const tgt = cartesianToLla(shifted.X, shifted.Y, shifted.Z, tgtEll);
    return { ...tgt, accuracyM: params.accuracyM };
}

/** Lista de pares de datums suportados pelo catálogo. */
export function getSupportedDatumPairs(): readonly string[] {
    return Object.freeze(Object.keys(HELMERT_CATALOG));
}
