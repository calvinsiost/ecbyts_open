// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

import {
    createTier3CoordinateBindingMap,
    createTier3CoordinatePoint,
    shouldShowTier3CoordinateUi,
} from './tier3CoordinateSchema.js';

function hasOffset(value: any): boolean {
    const offset = value?.position?.offset || value?.offset;
    return !!offset && ['x', 'y', 'z'].some((axis) => offset[axis] !== undefined && offset[axis] !== null);
}

function normalizeCoordinate(
    input: any,
    fallback: Record<string, any> = {},
): Record<string, any> | null {
    if (!input || typeof input !== 'object') return null;
    const point = createTier3CoordinatePoint({ ...input, ...fallback, ...input }, fallback);
    return point.id ? point : null;
}

function findCoordinateForObservation(
    coordinates: Array<Record<string, any>>,
    elementId: any,
    observation: any,
): Record<string, any> | null {
    const coordinateId = observation?.coordinateId || observation?.position?.coordinateId;
    if (coordinateId) {
        return coordinates.find((coordinate) => coordinate.id === coordinateId) || null;
    }

    const observationId = observation?.id || observation?.observationId || null;
    if (!observationId) return null;

    return (
        coordinates.find(
            (coordinate) =>
                coordinate.observationId === observationId &&
                (!coordinate.elementId || coordinate.elementId === elementId),
        ) || null
    );
}

export function collectTier3CoordinatesFromElements(
    elements: any[] = [],
    explicitCoordinates: any[] = [],
): Array<Record<string, any>> {
    const byId = new Map<string, Record<string, any>>();

    for (const coordinate of explicitCoordinates || []) {
        const point = normalizeCoordinate(coordinate);
        if (point) byId.set(point.id, point);
    }

    for (const element of elements || []) {
        const observations = element?.data?.observations;
        if (!Array.isArray(observations)) continue;

        for (const observation of observations) {
            const matrix = observation?.matrix || observation?.sampleMatrix || observation?.medium;
            if (!shouldShowTier3CoordinateUi(matrix) || !hasOffset(observation)) continue;

            const point = createTier3CoordinatePoint(
                {
                    id: observation.coordinateId || observation.position?.coordinateId,
                    elementId: element.id,
                    observationId: observation.id,
                    label: observation.label || observation.name || observation.parameter,
                    matrix,
                    position: observation.position,
                    offset: observation.offset,
                    coordinateSystem: observation.position?.coordinateSystem || observation.coordinateSystem,
                    utm: observation.utm,
                    wgs84: observation.wgs84,
                },
                { elementId: element.id, observationId: observation.id, matrix },
            );
            byId.set(point.id, point);
        }
    }

    return [...byId.values()];
}

export function attachTier3CoordinatesToModel(model: any): {
    coordinates: Array<Record<string, any>>;
    count: number;
} {
    if (!model || typeof model !== 'object') return { coordinates: [], count: 0 };
    const coordinates = collectTier3CoordinatesFromElements(
        model.elements || [],
        model.tier3Coordinates || model.coordinates || [],
    );
    if (coordinates.length > 0) {
        model.tier3Coordinates = coordinates;
    } else {
        delete model.tier3Coordinates;
    }
    return { coordinates, count: coordinates.length };
}

export function rehydrateTier3CoordinateBindings(model: any): {
    coordinates: Array<Record<string, any>>;
    observationsBound: number;
    bindingsAdded: number;
} {
    if (!model || typeof model !== 'object') return { coordinates: [], observationsBound: 0, bindingsAdded: 0 };

    const coordinates = collectTier3CoordinatesFromElements(
        model.elements || [],
        model.tier3Coordinates || model.coordinates || [],
    );
    const byId = new Map(coordinates.map((coordinate) => [coordinate.id, coordinate]));
    let observationsBound = 0;
    let bindingsAdded = 0;

    for (const element of model.elements || []) {
        const observations = element?.data?.observations;
        if (!Array.isArray(observations)) continue;

        for (const observation of observations) {
            const matrix = observation?.matrix || observation?.sampleMatrix || observation?.medium;
            if (!shouldShowTier3CoordinateUi(matrix)) continue;

            const coordinate = findCoordinateForObservation(coordinates, element.id, observation);
            if (!coordinate) continue;

            observation.coordinateId = coordinate.id;
            observation.position =
                observation.position && typeof observation.position === 'object' ? observation.position : {};
            observation.position.coordinateId = coordinate.id;
            observation.position.coordinateSystem =
                coordinate.position?.coordinateSystem || coordinate.coordinateSystem || 'local';
            observation.position.offset = {
                ...(coordinate.position?.offset || coordinate.offset || {}),
                ...(observation.position.offset || {}),
            };

            const bindingMap = createTier3CoordinateBindingMap(coordinate.id, matrix);
            observation.bindings = { ...(observation.bindings || {}) };
            for (const [path, binding] of Object.entries(bindingMap)) {
                if (!observation.bindings[path]) {
                    observation.bindings[path] = binding;
                    bindingsAdded++;
                }
            }
            observationsBound++;
        }
    }

    model.tier3Coordinates = [...byId.values()];
    return { coordinates: model.tier3Coordinates, observationsBound, bindingsAdded };
}

export function summarizeTier3CoordinateRuntime(
    elements: any[] = [],
    explicitCoordinates: any[] = [],
): { coordinateCount: number; boundObservationCount: number; byMatrix: Record<string, number> } {
    const coordinates = collectTier3CoordinatesFromElements(elements, explicitCoordinates);
    const byMatrix: Record<string, number> = {};
    for (const coordinate of coordinates) {
        const key = coordinate.matrix || 'unknown';
        byMatrix[key] = (byMatrix[key] || 0) + 1;
    }
    return {
        coordinateCount: coordinates.length,
        boundObservationCount: coordinates.filter((coordinate) => coordinate.observationId).length,
        byMatrix,
    };
}
