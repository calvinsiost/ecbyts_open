// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

export const PLUME_MATRICES = ['subterranea', 'ar', 'agua_superficial', 'solo'] as const;
export type PlumeMatrix = (typeof PLUME_MATRICES)[number];

export const PLUME_SHAPES_BY_MATRIX = {
    subterranea: ['ellipsoid', 'lens', 'cone'],
    ar: ['cone', 'gaussian', 'ellipsoid'],
    agua_superficial: ['lens', 'ellipsoid'],
    solo: ['ellipsoid', 'lens', 'patch'],
} as const;

export type PlumeShape = (
    | keyof typeof PLUME_SHAPES_BY_MATRIX extends keyof typeof PLUME_SHAPES_BY_MATRIX 
    ? (typeof PLUME_SHAPES_BY_MATRIX)[keyof typeof PLUME_SHAPES_BY_MATRIX][number] 
    : string
);

export const PLUME_DEFAULT_SHAPE_BY_MATRIX = {
    subterranea: 'ellipsoid',
    ar: 'cone',
    agua_superficial: 'lens',
    solo: 'patch',
} as const;

export function normalizePlumeMatrix(value: unknown): PlumeMatrix {
    const raw = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
    if (raw === 'agua') return 'agua_superficial';
    if (raw === 'subsurface') return 'subterranea';
    if (raw === 'air') return 'ar';
    if (raw === 'soil') return 'solo';
    if (PLUME_MATRICES.includes(raw as PlumeMatrix)) return raw as PlumeMatrix;
    return 'subterranea';
}

export function getAllowedPlumeShapes(matrix: unknown): readonly string[] {
    const normalized = normalizePlumeMatrix(matrix);
    const shapes = PLUME_SHAPES_BY_MATRIX;
    return shapes[normalized] || shapes.subterranea;
}

export function getDefaultPlumeShape(matrix: unknown): string {
    const normalized = normalizePlumeMatrix(matrix);
    const defaults = PLUME_DEFAULT_SHAPE_BY_MATRIX;
    return defaults[normalized] || defaults.subterranea;
}

export function isPlumeShapeCompatible(matrix: unknown, shape: unknown): boolean {
    return getAllowedPlumeShapes(matrix).includes(
        String(shape || '')
            .trim()
            .toLowerCase(),
    );
}

export function normalizePlumeShape(matrix: unknown, shape: unknown): string {
    const normalizedShape = String(shape || '')
        .trim()
        .toLowerCase();
    if (isPlumeShapeCompatible(matrix, normalizedShape)) return normalizedShape;
    return getDefaultPlumeShape(matrix);
}

export interface PlumeSubmoduleState {
    matrix: PlumeMatrix;
    shape: string;
    isDirty: boolean;
    lastAppliedAt: number | null;
}

export function buildPlumeSubmoduleState(element: unknown): PlumeSubmoduleState {
    const e = element as { data?: any };
    const data = e?.data || {};
    const matrix = normalizePlumeMatrix(data.matrix || data.plume?.matrix || 'subterranea');
    const shape = normalizePlumeShape(matrix, data.plume?.shape || data.shapePreset || 'ellipsoid');
    return {
        matrix,
        shape,
        isDirty: false,
        lastAppliedAt: Number.isFinite(data.plume?.lastAppliedAt) ? data.plume.lastAppliedAt : null,
    };
}