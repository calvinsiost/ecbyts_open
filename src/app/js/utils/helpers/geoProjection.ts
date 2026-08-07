// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   GEO PROJECTION - Lat/Long to local XYZ coordinates
   Conversao de coordenadas geograficas para o sistema local 3D.

   Usa projecao centroide-relativa: o centro do site vira (0, 0, 0)
   e os pontos sao deslocados em metros usando formula de Haversine.
   ================================================================ */

export interface GeoCoordinate {
    latitude: number;
    longitude: number;
}

export interface GeoLocation extends GeoCoordinate {
    elevation?: number;
}

export interface LocalPoint {
    x: number;
    y: number;
    z: number;
}

export interface ProjectedLocations {
    origin: GeoCoordinate;
    projected: LocalPoint[];
}

/**
 * Converte graus para radianos.
 */
function toRad(deg: number): number {
    return (deg * Math.PI) / 180;
}

/**
 * Calcula distancia em metros entre dois pontos lat/long.
 * Formula de Haversine - precisao suficiente para areas de ate ~50km.
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calcula o centroide (media) de um array de coordenadas.
 */
export function computeCentroid(points: readonly GeoCoordinate[]): GeoCoordinate {
    if (!points.length) return { latitude: 0, longitude: 0 };
    const sum = points.reduce(
        (acc, p) => ({
            latitude: acc.latitude + p.latitude,
            longitude: acc.longitude + p.longitude,
        }),
        { latitude: 0, longitude: 0 },
    );
    return {
        latitude: sum.latitude / points.length,
        longitude: sum.longitude / points.length,
    };
}

/**
 * Projeta um ponto lat/long para coordenadas XYZ locais relativas ao centroide.
 *
 * X = deslocamento Leste-Oeste (longitude) em metros
 * Z = deslocamento Norte-Sul (latitude) em metros (Three.js Z = profundidade)
 * Y = elevacao (default 0)
 */
export function projectToLocal(lat: number, lng: number, origin: GeoCoordinate, elevation = 0): LocalPoint {
    // Deslocamento EW (longitude) - distancia ao longo do paralelo
    const dx = haversineDistance(origin.latitude, origin.longitude, origin.latitude, lng);
    const x = lng >= origin.longitude ? dx : -dx;

    // Deslocamento NS (latitude) - distancia ao longo do meridiano
    const dz = haversineDistance(origin.latitude, origin.longitude, lat, origin.longitude);
    const z = lat >= origin.latitude ? -dz : dz;

    return { x, y: elevation, z };
}

/**
 * Projeta um array de locais com lat/long para coordenadas XYZ.
 * Calcula centroide automaticamente ou usa origem fornecida.
 */
export function projectLocations(
    locations: readonly GeoLocation[],
    customOrigin: GeoCoordinate | null = null,
): ProjectedLocations {
    const origin = customOrigin || computeCentroid(locations);
    const projected = locations.map((loc) => projectToLocal(loc.latitude, loc.longitude, origin, loc.elevation || 0));
    return { origin, projected };
}
