// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Core Tours Registry - P1-33
 * Registry of the 5 essential product tours.
 * Each tour is referenced by ID - steps are lazy-loaded by the tour engine.
 *
 * Persistência: localStorage `ecbyts-tour-{id}-seen` = '1'
 */

export const CORE_TOUR_IDS = {
    WELCOME: 'welcome',
    ADD_ELEMENT: 'add_element',
    IMPORT_DATA: 'import_data',
    EIS_SCORE: 'eis_score',
    EXPORT_MODEL: 'export_model',
} as const;

export type CoreTourId = (typeof CORE_TOUR_IDS)[keyof typeof CORE_TOUR_IDS];

export interface TourMetadata {
    id: string;
    titleKey: string;
    stepCount: number;
    priority: number;
}

/**
 * Metadata dos tours core.
 * titleKey: chave i18n para o título do tour.
 * stepCount: número de passos (informativo, para progresso visual).
 * priority: ordem de exibição quando múltiplos tours estão pendentes (menor = primeiro).
 */
export const CORE_TOURS_METADATA: readonly TourMetadata[] = [
    { id: CORE_TOUR_IDS.WELCOME, titleKey: 'tour.welcome.title', stepCount: 5, priority: 0 },
    { id: CORE_TOUR_IDS.ADD_ELEMENT, titleKey: 'tour.addElement.title', stepCount: 4, priority: 1 },
    { id: CORE_TOUR_IDS.IMPORT_DATA, titleKey: 'tour.importData.title', stepCount: 4, priority: 2 },
    { id: CORE_TOUR_IDS.EIS_SCORE, titleKey: 'tour.eisScore.title', stepCount: 3, priority: 3 },
    { id: CORE_TOUR_IDS.EXPORT_MODEL, titleKey: 'tour.exportModel.title', stepCount: 3, priority: 4 },
];

/**
 * Retorna a chave localStorage para o estado "visto" de um tour.
 */
const _seenKey = (id: string): string => `ecbyts-tour-${id}-seen`;

/**
 * Verifica se um tour já foi visto pelo usuário.
 * Retorna true em caso de erro (falha silenciosa = não bloquear UI).
 */
export function hasTourBeenSeen(tourId: string): boolean {
    try {
        return localStorage.getItem(_seenKey(tourId)) === '1';
    } catch (e) {
        console.debug('[coreToursRegistry] hasSeen:', (e instanceof Error ? e.message : e));
        return true;
    }
}

/**
 * Marca um tour como visto.
 * Falha silenciosamente em caso de quota excedida.
 */
export function markTourSeen(tourId: string): void {
    try {
        localStorage.setItem(_seenKey(tourId), '1');
    } catch (e) {
        console.debug('[coreToursRegistry] markSeen:', (e instanceof Error ? e.message : e));
        // quota exceeded - não bloquear
    }
}

/**
 * Retorna os tours pendentes (não vistos), ordenados por prioridade crescente.
 */
export function getPendingTours(): TourMetadata[] {
    return [...CORE_TOURS_METADATA].filter((t) => !hasTourBeenSeen(t.id)).sort((a, b) => a.priority - b.priority);
}

/**
 * Retorna o metadata de um tour por ID.
 */
export function getTourMetadata(tourId: string): TourMetadata | null {
    return CORE_TOURS_METADATA.find((t) => t.id === tourId) ?? null;
}