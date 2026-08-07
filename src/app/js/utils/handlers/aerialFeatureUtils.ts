// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export interface Position {
    x: number;
    y: number;
    z: number;
}

export interface Rotation {
    x: number;
    y: number;
    z: number;
}

export interface Footprint {
    width: number;
    length: number;
}

export interface Dimensions {
    footprint?: Footprint;
    height?: number;
    type?: string;
    dimensions?: { diameter: number; length: number };
    shape?: { radiusX: number; radiusY: number; depth: number };
    path?: Position[];
    width?: number;
    habitatType?: string;
    protectionStatus?: string;
    area?: number;
}

export interface AerialFeature {
    family: string;
    position: Position;
    rotation?: number;
    dimensions?: Dimensions;
    label?: string;
}

export type AerialElementData =
    | {
          position: { x: number; y: number; z: number };
          footprint: Footprint;
          height: number;
          type: string;
          rotation: Rotation;
          observations: unknown[];
      }
    | {
          position: { x: number; y: number; z: number };
          dimensions: { diameter: number; length: number };
          type: string;
          contents: string;
          rotation: Rotation;
          observations: unknown[];
      }
    | {
          position: { x: number; y: number; z: number };
          shape: { radiusX: number; radiusY: number; depth: number };
          observations: unknown[];
      }
    | {
          path: Position[];
          width: number;
          observations: unknown[];
      }
    | {
          position: { x: number; y: number; z: number };
          habitatType: string;
          protectionStatus: string;
          area: number;
          footprint: Footprint | null;
          observations: unknown[];
      }
    | {
          coordinates: { easting: number; northing: number; elevation: number };
          construction: { totalDepth: number; diameter: number; screenTop: number; screenBottom: number };
          observations: unknown[];
      }
    | {
          position: { x: number; y: number; z: number };
          observations: unknown[];
      };

export function buildAerialElementData(feature: unknown): AerialElementData {
    const f = feature as AerialFeature;
    const pos = f.position;
    const dims = f.dimensions || {};
    const rotYDeg = Math.round((((f.rotation || 0) * 180) / Math.PI) * 10) / 10;

    switch (f.family) {
        case 'building':
            return {
                position: { x: pos.x, y: 0, z: pos.z },
                footprint: dims.footprint || { width: 10, length: 10 },
                height: dims.height || 6,
                type: dims.type || 'industrial',
                rotation: { x: 0, y: rotYDeg, z: 0 },
                observations: [],
            };

        case 'tank':
            return {
                position: { x: pos.x, y: 0, z: pos.z },
                dimensions: dims.dimensions || { diameter: 5, length: 5 },
                type: dims.type || 'aboveground',
                contents: 'unknown',
                rotation: { x: 0, y: rotYDeg, z: 0 },
                observations: [],
            };

        case 'lake':
            return {
                position: { x: pos.x, y: 0, z: pos.z },
                shape: dims.shape || { radiusX: 10, radiusY: 8, depth: 3 },
                observations: [],
            };

        case 'river':
            return {
                path: dims.path || [
                    { x: pos.x - 20, y: 0, z: pos.z },
                    { x: pos.x, y: 0, z: pos.z },
                    { x: pos.x + 20, y: 0, z: pos.z },
                ],
                width: dims.width || 3,
                observations: [],
            };

        case 'habitat':
            return {
                position: { x: pos.x, y: 0, z: pos.z },
                habitatType: dims.habitatType || 'forest',
                protectionStatus: dims.protectionStatus || 'none',
                area: Math.min(dims.area || 100, 500),
                footprint: dims.footprint || null,
                observations: [],
            };

        case 'well':
            return {
                coordinates: { easting: pos.x, northing: pos.z, elevation: 0 },
                construction: { totalDepth: 30, diameter: 4, screenTop: 10, screenBottom: 25 },
                observations: [],
            };

        case 'marker':
        default:
            return {
                position: { x: pos.x, y: 0, z: pos.z },
                observations: [],
            };
    }
}

export function assignSequentialAerialNames(
    features: unknown[],
    familyLabels: Record<string, string> = {},
): void {
    const counters: Record<string, number> = {};
    const labels = familyLabels;
    for (const feature of features as AerialFeature[]) {
        counters[feature.family] = (counters[feature.family] || 0) + 1;
        const baseLabel = labels[feature.family] || feature.family;
        feature.label = `${baseLabel} ${counters[feature.family]}`;
    }
}

export interface Extent {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

export function computeAerialExtent(vertices: unknown[]): Extent {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const vertex of vertices as { x: number; z: number }[]) {
        if (vertex.x < minX) minX = vertex.x;
        if (vertex.x > maxX) maxX = vertex.x;
        if (vertex.z < minZ) minZ = vertex.z;
        if (vertex.z > maxZ) maxZ = vertex.z;
    }

    return { minX, maxX, minZ, maxZ };
}