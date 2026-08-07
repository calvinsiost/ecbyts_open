// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

import {
    createTier3CoordinateBindingMap,
    createTier3CoordinatePoint,
    getTier3CoordinateAxesForMatrix,
    getTier3CoordinateUiMode,
    shouldShowTier3CoordinateUi,
} from '../../core/bindings/tier3CoordinateSchema.js';
import { collectTier3CoordinatesFromElements } from '../../core/bindings/tier3CoordinateRuntime.js';
import { escapeHtml } from '../helpers/html.js';

/** @type {Record<string, string>} */
const AXIS_LABELS = Object.freeze({ x: 'X offset', y: 'Y offset', z: 'Z offset' });

/** @param {any} coordinate */
function coordinateLabel(coordinate: any) {
    const offset = coordinate?.position?.offset || coordinate?.offset || {};
    const label = coordinate?.label || coordinate?.id || 'Coordinate';
    return `${label} (${Number(offset.x || 0).toFixed(2)}, ${Number(offset.y || 0).toFixed(2)}, ${Number(
        offset.z || 0,
    ).toFixed(2)} m)`;
}

/** @param {any} [params] */
export function renderTier3CoordinateBindingControl({
    elementId,
    observationIndex,
    observation = {},
    coordinates = [],
    editable = true
}: any = /** @type {any} */ ({})) {
    const matrix = observation.matrix || observation.sampleMatrix || observation.medium;
    if (!shouldShowTier3CoordinateUi(matrix)) return '';

    const axes = getTier3CoordinateAxesForMatrix(matrix);
    const mode = getTier3CoordinateUiMode(matrix);
    const selectedId = observation.coordinateId || observation.position?.coordinateId || '';
    const disabled = editable ? '' : ' disabled';
    const safeElementId = escapeHtml(elementId || '');
    const safeIndex = Number.isFinite(Number(observationIndex)) ? Number(observationIndex) : 0;

    const options = [
        `<option value="">Create local coordinate</option>`,
        .../** @type {any[]} */ (coordinates).map((/** @type {any} */ coordinate: any) => {
            const id = String(coordinate?.id || '');
            const selected = id && id === selectedId ? ' selected' : '';
            return `<option value="${escapeHtml(id)}"${selected}>${escapeHtml(coordinateLabel(coordinate))}</option>`;
        }),
    ].join('');

    const axisInputs = /** @type {any[]} */ (axes)
        .map((/** @type {any} */ axis: any) => {
            const value = observation.position?.offset?.[axis] ?? 0;
            return `<label class="tier3-coordinate-axis">
                <span>${AXIS_LABELS[(axis as keyof typeof AXIS_LABELS)]}</span>
                <input type="number" step="0.01" value="${escapeHtml(value)}"${disabled}
                    data-tier3-coordinate-axis="${axis}"
                    data-cc-call-input="handleTier3CoordinateDraftChange|s:${encodeURIComponent(`${safeElementId}`)}|j:${encodeURIComponent(String(safeIndex))}|s:${encodeURIComponent(`${axis}`)}|v">
            </label>`;
        })
        .join('');

    return `<section class="tier3-coordinate-binding" data-tier3-coordinate-mode="${escapeHtml(mode)}">
        <label class="form-label">Coordinate binding</label>
        <select class="form-input" data-tier3-coordinate-select="true"${disabled}
            data-cc-call-change="handleTier3CoordinateSelect|s:${encodeURIComponent(`${safeElementId}`)}|j:${encodeURIComponent(String(safeIndex))}|v">
            ${options}
        </select>
        <div class="tier3-coordinate-fields">${axisInputs}</div>
    </section>`;
}

/** @param {any} value @param {number} [fallback] */
function finiteNumber(value: any, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/** @param {any} observation */
function getObservationMatrix(observation: any) {
    return observation?.matrix || observation?.sampleMatrix || observation?.sample_matrix || observation?.medium;
}

/** @param {any} element @param {any} observationIndex */
function getObservationAt(element: any, observationIndex: any) {
    const index = Number(observationIndex);
    const observations = Array.isArray(element?.data?.observations) ? [...element.data.observations] : [];
    if (!Number.isInteger(index) || index < 0 || !observations[index]) {
        return { observations, observation: null, index: -1 };
    }
    return { observations, observation: { ...observations[index] }, index };
}

/** @param {any} observation @param {any} coordinate */
function withObservationPosition(observation: any, coordinate: any) {
    const offset = coordinate.position?.offset || coordinate.offset || {};
    const position = {
        ...(observation.position || {}),
        coordinateId: coordinate.id,
        coordinateSystem: coordinate.position?.coordinateSystem || coordinate.coordinateSystem || 'local',
        offset: {
            x: finiteNumber(offset.x),
            y: finiteNumber(offset.y),
            z: finiteNumber(offset.z),
        },
    };
    const bindings = {
        ...(observation.bindings || {}),
        ...createTier3CoordinateBindingMap(coordinate.id, getObservationMatrix(observation)),
    };
    return {
        ...observation,
        coordinateId: coordinate.id,
        position,
        bindings,
    };
}

/** @param {any} element @param {any} observation */
function buildCoordinateFromObservation(element: any, observation: any) {
    const matrix = getObservationMatrix(observation);
    return createTier3CoordinatePoint(
        {
            id: observation.coordinateId || observation.position?.coordinateId,
            elementId: element.id,
            observationId: observation.id,
            label: observation.label || observation.name || observation.parameter || observation.parameterId,
            matrix,
            position: observation.position,
            offset: observation.offset,
            coordinateSystem: observation.position?.coordinateSystem || observation.coordinateSystem,
            utm: observation.utm,
            wgs84: observation.wgs84,
        },
        { elementId: element.id, observationId: observation.id, matrix },
    );
}

/** @param {any} element @param {any[]} observations @param {number} index @param {any} observation @param {any} deps */
function saveObservation(element: any, observations: any, index: any, observation: any, deps: any) {
    const nextObservations = [...observations];
    nextObservations[index] = observation;
    deps.updateElement(element.id, {
        data: { ...(element.data || {}), observations: nextObservations },
    });
    deps.updateElementDetails?.(element);
    const legacyRefresh = deps['update' + 'AllUI'];
    (deps.requestUIRefresh || legacyRefresh)?.();
    return { success: true, observation };
}

/** @param {any} [deps] */
export function createTier3CoordinateBindingHandlers(deps = /** @type {any} */ ({})) {
    /** @param {any} elementId @param {any} observationIndex @param {any} axis @param {any} value */
    function handleTier3CoordinateDraftChange(elementId: any, observationIndex: any, axis: any, value: any) {
        if (!['x', 'y', 'z'].includes(axis)) return { success: false, error: 'invalid_axis' };

        const element = (deps as any).getElementById?.(elementId);
        if (!element) return { success: false, error: 'element_not_found' };

        const { observations, observation, index } = getObservationAt(element, observationIndex);
        if (!observation) return { success: false, error: 'observation_not_found' };

        const position = {
            ...(observation.position || {}),
            coordinateSystem: observation.position?.coordinateSystem || observation.coordinateSystem || 'local',
            offset: {
                x: finiteNumber(observation.position?.offset?.x),
                y: finiteNumber(observation.position?.offset?.y),
                z: finiteNumber(observation.position?.offset?.z),
                [axis]: finiteNumber(value),
            },
        };
        let nextObservation = { ...observation, position };
        const coordinate = buildCoordinateFromObservation(element, nextObservation);
        nextObservation = withObservationPosition(nextObservation, coordinate);

        return saveObservation(element, observations, index, nextObservation, deps);
    }

    /** @param {any} elementId @param {any} observationIndex @param {any} coordinateId */
    function handleTier3CoordinateSelect(elementId: any, observationIndex: any, coordinateId: any) {
        const element = (deps as any).getElementById?.(elementId);
        if (!element) return { success: false, error: 'element_not_found' };

        const { observations, observation, index } = getObservationAt(element, observationIndex);
        if (!observation) return { success: false, error: 'observation_not_found' };

        const id = String(coordinateId || '').trim();
        const coordinate =
            id === ''
                ? buildCoordinateFromObservation(element, observation)
                : /** @type {any[]} */ (collectTier3CoordinatesFromElements((deps as any).getAllElements?.() || [])).find((/** @type {any} */ point: any) => point.id === id);

        if (!coordinate) {
            (deps as any).showToast?.('Coordinate not found', 'warning');
            return { success: false, error: 'coordinate_not_found' };
        }

        const nextObservation = withObservationPosition(observation, coordinate);
        return saveObservation(element, observations, index, nextObservation, deps);
    }

    return {
        handleTier3CoordinateDraftChange,
        handleTier3CoordinateSelect,
    };
}
