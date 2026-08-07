// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * core/catalog - Data Catalog Access Groups (SPEC_DATA_CATALOG_ACCESS_GROUPS_9_66)
 *
 * Barrel exports para o módulo de catálogo de dados.
 *
 * Dois sistemas de controle de acesso complementares:
 *   - accessGroups (P1-24): visibilidade pública/restrita/privada + IDB store
 *   - accessGroupSchema + accessGroupManager: permissões de operação (none/read/write/admin)
 */

// P1-24 - visibilidade de catálogo (public / restricted / private)
export * from './accessGroups.js';
export * from './catalogStore.js';

// Permissões de operação (none / read / write / admin)
// Note: ACCESS_LEVELS conflicts - import from './accessGroupSchema.js' directly if needed.
export { GROUP_TYPES, createGroupMembership } from './accessGroupSchema.js';
export { createAccessGroupManager } from './accessGroupManager.js';

// P1-26 - community data enrichment (ENRICHMENT_SOURCES, createEnrichmentRecord, mergeEnrichment)
export { ENRICHMENT_SOURCES, createEnrichmentRecord, mergeEnrichment } from './enrichmentSchema.js';
export * from './enrichmentApi.js';
// P1-26 - IDB-backed enrichment store
export {
    saveEnrichment,
    loadEnrichments,
    getEnrichmentForElement,
    clearEnrichments,
    createEnrichmentStore,
    createLibraryCommunityModerationStore,
    createPersistentLibraryCommunityModerationStore,
    saveLibraryCommunityModerationState,
    loadLibraryCommunityModerationState,
    loadLibraryCommunityModerationStore,
    clearLibraryCommunityModerationState,
} from './enrichmentStore.js';
