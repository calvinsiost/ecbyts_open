// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export const AERIAL_CLASSIFIER_NN_ID = 'aerial-classifier';
export const AERIAL_CLASSIFIER_FAMILIES = Object.freeze([
    'building',
    'tank',
    'lake',
    'river',
    'habitat',
    'well',
    'marker',
]);

type ClassifierNetworkLike = {
    trained?: boolean;
    toJSON?: () => { weights?: unknown };
};

type ExportOptions = {
    getNetwork?: (id: string) => ClassifierNetworkLike | null | undefined;
    paintStrokes?: any[];
};

let aerialClassifierPaintStrokes: any[] = [];

/**
 * Store user paint strokes for model export.
 * Estado leve separado do modulo CV/ML para evitar import pesado no export.
 */
export function setAerialClassifierStrokes(strokes: any): void {
    aerialClassifierPaintStrokes = strokes || [];
}

/**
 * Return current paint stroke state.
 * Mantem compatibilidade: callers recebem a referencia atual.
 */
export function getAerialClassifierStrokes(): any[] {
    return aerialClassifierPaintStrokes;
}

/**
 * Build legacy classifier export payload without importing recognition code.
 * Usa getNetwork injetado para evitar criar a rede durante export simples.
 */
export function exportAerialClassifierState(options: ExportOptions = {}): any {
    const strokes = options.paintStrokes || aerialClassifierPaintStrokes;
    const nn = options.getNetwork?.(AERIAL_CLASSIFIER_NN_ID) || null;
    const trained = Boolean(nn?.trained);

    if (!trained && strokes.length === 0) return null;

    const nnState = trained && typeof nn?.toJSON === 'function' ? nn.toJSON() : null;
    return {
        version: '1.0',
        trained,
        weights: trained ? nnState?.weights ?? null : null,
        strokes,
        families: AERIAL_CLASSIFIER_FAMILIES,
    };
}
