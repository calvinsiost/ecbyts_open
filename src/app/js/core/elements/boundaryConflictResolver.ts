// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   BOUNDARY CONFLICT RESOLVER — SPEC-BOUNDARY-SAVE-001 (P1-17)

   Pure logic layer for boundary conflict detection and model cloning.
   No side effects — all functions return new values without mutating
   inputs. Node-testable without DOM or browser APIs.
   ================================================================ */

import { createLogger } from '../../utils/helpers/logger.js';

const log = createLogger('boundaryConflictResolver');

// ──────────────────────────────────────────────────────────────────────
// Conflict Detection
// ──────────────────────────────────────────────────────────────────────

/**
 * Detecta se existe boundary em conflito no conjunto de elementos fornecido.
 *
 * Itera o array de elementos e busca o primeiro com familyId === 'boundary'.
 * Retorna hasConflict=true e o elemento existente se encontrado.
 *
 * @param elements - array de elementos do modelo ativo
 */
export function detectBoundaryConflict(elements: Array<Record<string, any>>): {
    hasConflict: boolean;
    existing: Record<string, any> | null;
} {
    if (!Array.isArray(elements) || elements.length === 0) {
        return { hasConflict: false, existing: null };
    }

    const existing = elements.find(
        (el: Record<string, any>) => el && typeof el === 'object' && el.familyId === 'boundary',
    );

    if (existing) {
        log.debug('Boundary conflict detected — element id:', existing.id);
        return { hasConflict: true, existing };
    }

    return { hasConflict: false, existing: null };
}

// ──────────────────────────────────────────────────────────────────────
// Name Generation
// ──────────────────────────────────────────────────────────────────────

/**
 * Gera nome sugerido para um novo modelo derivado com boundary atualizado.
 *
 * Remove sufixo existente " (boundary vN)" antes de renumerar.
 * Sempre resulta em versão ≥2.
 *
 * @param baseName - nome do modelo de origem
 */
export function suggestBoundaryModelName(baseName: string): string {
    const base = (typeof baseName === 'string' ? baseName : 'Modelo').trim() || 'Modelo';
    // Remove sufixo " (boundary vN)" se já presente, para evitar acumulação
    const cleanBase = base.replace(/\s*\(boundary v\d+\)\s*$/i, '').trim();
    return `${cleanBase} (boundary v2)`;
}

// ──────────────────────────────────────────────────────────────────────
// Model Cloning
// ──────────────────────────────────────────────────────────────────────

/**
 * Clona modelo base substituindo o boundary por um novo polígono.
 *
 * Operação pura: cria novo objeto sem mutar baseModel.
 * Preserva todos os elementos não-boundary do modelo original.
 * Atribui novo id ao clone para garantir isolamento.
 *
 * @param baseModel - modelo de origem ({ id, name, elements, ... })
 * @param any> - pontos do novo boundary [{x,y,z}]
 * @param newBoundaryPolygon - nome para o modelo clonado
 * @returns novo modelo com boundary atualizado
 */
export function buildModelWithNewBoundary(
    baseModel: Record<string, any>,
    newBoundaryPolygon: Array<Record<string, any>>,
    newModelName: string,
): Record<string, any> {
    if (!baseModel || typeof baseModel !== 'object') {
        throw new TypeError('buildModelWithNewBoundary: baseModel must be an object');
    }
    if (!Array.isArray(newBoundaryPolygon)) {
        throw new TypeError('buildModelWithNewBoundary: newBoundaryPolygon must be an array');
    }

    const baseElements = Array.isArray(baseModel.elements) ? baseModel.elements : [];
    // Preserva todos os elementos não-boundary
    const nonBoundaryElements = baseElements.filter(
        (el: Record<string, any>) => el && typeof el === 'object' && el.familyId !== 'boundary',
    );

    // Cria elemento boundary novo sem id reutilizado
    const newBoundaryElement = {
        id: `boundary-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        familyId: 'boundary',
        name: 'Boundary',
        polygon: newBoundaryPolygon,
        createdAt: new Date().toISOString(),
    };

    // Novo modelo com id distinto do original
    const newId = `model-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const name = (typeof newModelName === 'string' ? newModelName : '').trim() || 'Novo Modelo';

    const newModel = {
        ...baseModel,
        id: newId,
        name,
        elements: [...nonBoundaryElements, newBoundaryElement],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'boundary_clone',
        sourceModelId: baseModel.id,
    };

    log.debug('Built new model from boundary clone — new id:', newId, 'name:', name);
    return newModel;
}
