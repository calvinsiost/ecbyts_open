// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   TEMPORAL FILTER — Filtragem temporal de elementos por campanha
   Controla visibilidade de elementos na cena 3D com base na
   posicao do slider temporal. Elementos sao associados a campanhas
   por suas observacoes (campaignId).

   Modelo:
   - campaigns ordenadas por startDate
   - t normalizado 0..1 mapeia para indice de campanha
   - Elementos sem observacoes: sempre visiveis
   - Elementos com observacoes: visiveis se alguma obs pertence
     a campanha <= campanha atual no slider
   ================================================================ */

interface CampaignLike {
    id?: string;
    startDate?: string;
}

interface ElementObservation {
    campaignId?: string;
}

interface ElementLike {
    id: string;
    data?: { observations?: ElementObservation[] };
}

interface Vec3 {
    x: number;
    y: number;
    z: number;
}

// ----------------------------------------------------------------
// CAMPAIGN SORTING
// ----------------------------------------------------------------

/**
 * Sort campaigns by startDate ascending.
 * Campanhas sem data ficam no final.
 *
 * @param campaigns - Array of campaign objects with startDate
 * @returns New sorted array (does not mutate original)
 */
export function sortCampaignsByDate(campaigns: CampaignLike[]): CampaignLike[] {
    if (!Array.isArray(campaigns)) return [];
    return [...campaigns].sort((a, b) => {
        const da = a.startDate || '';
        const db = b.startDate || '';
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.localeCompare(db);
    });
}

// ----------------------------------------------------------------
// TIME NORMALIZATION
// ----------------------------------------------------------------

/**
 * Convert campaign index to normalized time (0-1).
 * Com N campanhas, indice 0 -> t=0, indice N-1 -> t=1.
 *
 * @param index - Campaign index (0-based)
 * @param totalCampaigns - Total number of campaigns
 * @returns Normalized time 0..1
 */
export function campaignIndexToNormalized(index: number, totalCampaigns: number): number {
    if (!totalCampaigns || totalCampaigns <= 1) return 0;
    return Math.max(0, Math.min(1, index / (totalCampaigns - 1)));
}

/**
 * Convert normalized time (0-1) to campaign index.
 * Arredonda para o indice de campanha mais proximo.
 *
 * @param t - Normalized time 0..1
 * @param totalCampaigns - Total number of campaigns
 * @returns Campaign index (0-based, integer)
 */
export function normalizedToCampaignIndex(t: number, totalCampaigns: number): number {
    if (!totalCampaigns || totalCampaigns <= 0) return 0;
    if (totalCampaigns === 1) return 0;
    const clamped = Math.max(0, Math.min(1, t));
    return Math.round(clamped * (totalCampaigns - 1));
}

// ----------------------------------------------------------------
// ELEMENT TEMPORAL FILTERING
// ----------------------------------------------------------------

/**
 * Build a Set of campaign IDs that are "active" at the given time.
 * Inclui todas as campanhas do indice 0 ate o indice correspondente a t.
 *
 * @param sortedCampaigns - Campaigns sorted by date
 * @param t - Normalized time 0..1
 * @returns Set of active campaign IDs
 */
export function getActiveCampaignIds(sortedCampaigns: CampaignLike[], t: number): Set<string> {
    const ids = new Set<string>();
    if (!sortedCampaigns || sortedCampaigns.length === 0) return ids;
    const idx = normalizedToCampaignIndex(t, sortedCampaigns.length);
    for (let i = 0; i <= idx; i++) {
        const c = sortedCampaigns[i];
        if (c && typeof c.id === 'string') ids.add(c.id);
    }
    return ids;
}

/**
 * Filter elements by temporal position.
 * Retorna lista de objetos { elementId, visible } indicando se cada
 * elemento deve estar visivel no tempo t.
 *
 * Regras:
 * - Elemento sem observations -> sempre visivel
 * - Elemento com observations -> visivel se alguma observation
 *   tem campaignId que pertence a uma campanha ativa (indice <= t)
 *
 * @param elements - Array of element objects
 * @param t - Normalized time 0..1
 * @param sortedCampaigns - Campaigns sorted by date
 */
export function filterElementsByTime(
    elements: ElementLike[],
    t: number,
    sortedCampaigns: CampaignLike[],
): Array<{ elementId: string; visible: boolean }> {
    if (!Array.isArray(elements)) return [];
    if (!sortedCampaigns || sortedCampaigns.length === 0) {
        return elements.map((el) => ({ elementId: el.id, visible: true }));
    }

    const activeIds = getActiveCampaignIds(sortedCampaigns, t);
    return elements.map((el) => {
        const obs = el.data?.observations;
        if (!Array.isArray(obs) || obs.length === 0) {
            return { elementId: el.id, visible: true };
        }
        const hasActive = obs.some((o) => typeof o.campaignId === 'string' && activeIds.has(o.campaignId));
        return { elementId: el.id, visible: hasActive };
    });
}

// ----------------------------------------------------------------
// MESH VISIBILITY CONTROL
// ----------------------------------------------------------------

/**
 * Set temporal visibility of a single element mesh.
 * Controla mesh.visible diretamente no Three.js.
 *
 * @param elementId - Element ID
 * @param visible - Whether element should be visible
 * @param getMeshFn - Function to get mesh by element ID
 */
export function setElementTemporalVisibility(
    elementId: string,
    visible: boolean,
    getMeshFn: ((id: string) => { visible: boolean } | null | undefined) | null | undefined,
): void {
    if (!getMeshFn) return;
    const mesh = getMeshFn(elementId);
    if (mesh) {
        mesh.visible = !!visible;
    }
}

// ----------------------------------------------------------------
// POSITION INTERPOLATION
// ----------------------------------------------------------------

/**
 * Interpolate position between two points.
 * Usado para elementos que se movem entre campanhas (ex: plumas migrando).
 *
 * @param posA - Position at campaign A
 * @param posB - Position at campaign B
 * @param t - Interpolation factor 0..1 (0=posA, 1=posB)
 * @returns Interpolated position
 */
export function interpolatePosition(
    posA: Vec3 | null | undefined,
    posB: Vec3 | null | undefined,
    t: number,
): Vec3 {
    if (!posA || !posB) return posA || posB || { x: 0, y: 0, z: 0 };
    const clamped = Math.max(0, Math.min(1, t));
    return {
        x: posA.x + (posB.x - posA.x) * clamped,
        y: posA.y + (posB.y - posA.y) * clamped,
        z: posA.z + (posB.z - posA.z) * clamped,
    };
}
