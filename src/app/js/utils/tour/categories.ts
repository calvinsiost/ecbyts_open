// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   GUIDED TOUR CATEGORIES — Registry for 50 workflow-specific tours
   Registro de 50 tours guiados organizados em 10 categorias

   Cada categoria agrupa tours por area funcional (elementos, dados,
   interpolacao, etc). Tours sao registrados por arquivos individuais
   em tours/ e consultados pelo picker UI.
   ================================================================ */

// ----------------------------------------------------------------
// CATEGORY DEFINITIONS - 10 functional groups
// ----------------------------------------------------------------

export const TOUR_CATEGORIES = [
    {
        id: 'element-management',
        nameKey: 'guidedCatElements',
        descKey: 'guidedCatElementsDesc',
        icon: 'layers',
        color: '#3b82f6',
        order: 1,
    },
    {
        id: 'field-data',
        nameKey: 'guidedCatFieldData',
        descKey: 'guidedCatFieldDataDesc',
        icon: 'database',
        color: '#22c55e',
        order: 2,
    },
    {
        id: 'campaign-management',
        nameKey: 'guidedCatCampaigns',
        descKey: 'guidedCatCampaignsDesc',
        icon: 'calendar',
        color: '#06b6d4',
        order: 3,
    },
    {
        id: 'scene-camera',
        nameKey: 'guidedCatScenes',
        descKey: 'guidedCatScenesDesc',
        icon: 'camera',
        color: '#8b5cf6',
        order: 4,
    },
    {
        id: 'import-export',
        nameKey: 'guidedCatImportExport',
        descKey: 'guidedCatImportExportDesc',
        icon: 'share-2',
        color: '#f59e0b',
        order: 5,
    },
    {
        id: 'spatial-interpolation',
        nameKey: 'guidedCatSpatial',
        descKey: 'guidedCatSpatialDesc',
        icon: 'map',
        color: '#10b981',
        order: 6,
    },
    {
        id: 'analysis-modeling',
        nameKey: 'guidedCatAnalysis',
        descKey: 'guidedCatAnalysisDesc',
        icon: 'bar-chart-2',
        color: '#ef4444',
        order: 7,
    },
    {
        id: 'environmental-workflows',
        nameKey: 'guidedCatWorkflows',
        descKey: 'guidedCatWorkflowsDesc',
        icon: 'git-branch',
        color: '#14b8a6',
        order: 8,
    },
    {
        id: 'ai-neural',
        nameKey: 'guidedCatAI',
        descKey: 'guidedCatAIDesc',
        icon: 'cpu',
        color: '#a855f7',
        order: 9,
    },
    {
        id: 'advanced-features',
        nameKey: 'guidedCatAdvanced',
        descKey: 'guidedCatAdvancedDesc',
        icon: 'settings',
        color: '#64748b',
        order: 10,
    },
];

// ----------------------------------------------------------------
// TOUR REGISTRY - Map<tourId, TourDefinition>
// ----------------------------------------------------------------

const _tours: Map<string, Object> = new Map();

/**
 * Register a guided tour definition.
 * Chamado por cada arquivo em tours/ ao ser importado.
 * @param {Object} tourDef - Tour definition object
 * @param {string} tourDef.id - Unique tour identifier
 * @param {string} tourDef.categoryId - Category this tour belongs to
 * @param {string} tourDef.nameKey - i18n key for tour name
 * @param {string} tourDef.descKey - i18n key for tour description
 * @param {string} tourDef.icon - Feather icon name
 * @param {'beginner'|'intermediate'|'advanced'} tourDef.difficulty
 * @param {number} tourDef.estimatedMinutes - Estimated duration
 * @param {Object} [tourDef.prerequisites] - Required app state
 * @param {number} [tourDef.prerequisites.minElements=0]
 * @param {number} [tourDef.prerequisites.minCampaigns=0]
 * @param {number} [tourDef.prerequisites.minObservations=0]
 * @param {boolean} [tourDef.prerequisites.autoScaffold=false]
 * @param {Array<Object>} tourDef.steps - Step definitions (same schema as onboarding)
 */
export function registerGuidedTour(tourDef: any): void {
    if (!tourDef?.id || !tourDef?.categoryId || !tourDef?.steps?.length) {
        console.warn('[GuidedTours] Invalid tour definition:', tourDef?.id);
        return;
    }
    if (_tours.has(tourDef.id)) {
        console.warn(`[GuidedTours] Duplicate tour ID: "${tourDef.id}" — overwriting`);
    }
    _tours.set(tourDef.id, Object.freeze({ ...tourDef }));
}

/**
 * Get a single tour by ID.
 * @param {string} tourId
 * @returns {Object|undefined}
 */
export function getGuidedTour(tourId: string): Object | undefined {
    return _tours.get(tourId);
}

/**
 * Get all registered tours.
 * @returns {Array<Object>}
 */
export function getAllGuidedTours(): Array<Object> {
    return Array.from(_tours.values());
}

/**
 * Get tours filtered by category.
 * @param {string} categoryId
 * @returns {Array<Object>}
 */
export function getToursByCategory(categoryId: string): Array<Object> {
    return Array.from(_tours.values()).filter((t: any) => t.categoryId === categoryId);
}

/**
 * Get categories with tour counts and completion stats.
 * @param {Record<string, any>} completionState - { toursCompleted: { tourId: true } }
 * @returns {Array<Object>}
 */
export function getCategoriesWithStats(completionState: Record<string, any> = {}): Array<Object> {
    const completed = completionState.toursCompleted || {};
    return TOUR_CATEGORIES.map((cat) => {
        const tours = getToursByCategory(cat.id);
        const doneCount = tours.filter((t: any) => completed[t.id]).length;
        return {
            ...cat,
            tourCount: tours.length,
            completedCount: doneCount,
            progress: tours.length > 0 ? Math.round((doneCount / tours.length) * 100) : 0,
        };
    }).sort((a, b) => a.order - b.order);
}

/**
 * Search tours by name/description text.
 * Busca fuzzy simples por substring no nome e descricao.
 * @param {string} query
 * @param {Function} tFn - Translation function
 * @returns {Array<Object>}
 */
export function searchTours(query: string, tFn: Function): Array<Object> {
    if (!query || query.length < 2) return getAllGuidedTours();
    const q = query.toLowerCase();
    return getAllGuidedTours().filter((tour: any) => {
        const name = (tFn?.(tour.nameKey) || tour.id).toLowerCase();
        const desc = (tFn?.(tour.descKey) || '').toLowerCase();
        const catName = (tFn?.(TOUR_CATEGORIES.find((c) => c.id === tour.categoryId)?.nameKey) || '').toLowerCase();
        return name.includes(q) || desc.includes(q) || catName.includes(q);
    });
}

/**
 * Total tour count.
 * @returns {number}
 */
export function getTourCount(): number {
    return _tours.size;
}
