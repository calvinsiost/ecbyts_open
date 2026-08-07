// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   LOCATION DETECTION HELPERS (pure)
   Utilitarios puros para detectar local conhecido a partir do
   centroide dos pontos importados.
   ================================================================ */

interface KnownLocation {
    readonly id: string;
    readonly label: string;
    readonly labelKey: string;
    readonly city: string;
    readonly cityKey: string;
    readonly lat: number;
    readonly lon: number;
    readonly maxDistanceKm: number;
}

const KNOWN_LOCATIONS: readonly KnownLocation[] = [
    {
        id: 'vila-lobos',
        label: 'Parque Villa-Lobos',
        labelKey: 'locations.vilaLobos.label',
        city: 'Sao Paulo, SP, Brasil',
        cityKey: 'locations.vilaLobos.city',
        lat: -23.5882,
        lon: -46.7234,
        maxDistanceKm: 8,
    },
] as const;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function confidenceFromDistance(distanceKm: number): number {
    if (distanceKm <= 1) return 0.95;
    if (distanceKm <= 3) return 0.85;
    if (distanceKm <= 6) return 0.7;
    if (distanceKm <= 10) return 0.5;
    return 0.2;
}

export interface LocationDetectionResult {
    matched: boolean;
    id: string | null;
    label: string | null;
    labelKey?: string | null;
    city: string | null;
    cityKey?: string | null;
    distanceKm: number | null;
    confidence: number;
    reference: { lat: number; lon: number } | null;
}

export function detectKnownLocation(
    centroid: { lat: number; lon: number; count?: number } | null,
): LocationDetectionResult | null {
    if (!centroid || !Number.isFinite(centroid.lat) || !Number.isFinite(centroid.lon)) return null;

    let best: LocationDetectionResult | null = null;
    for (const loc of KNOWN_LOCATIONS) {
        const distanceKm = haversineKm(centroid.lat, centroid.lon, loc.lat, loc.lon);
        if (!best || distanceKm < (best.distanceKm ?? Infinity)) {
            best = {
                matched: distanceKm <= loc.maxDistanceKm,
                id: loc.id,
                label: loc.label,
                labelKey: loc.labelKey || null,
                city: loc.city,
                cityKey: loc.cityKey || null,
                distanceKm,
                confidence: confidenceFromDistance(distanceKm),
                reference: { lat: loc.lat, lon: loc.lon },
            };
        }
    }

    return best;
}