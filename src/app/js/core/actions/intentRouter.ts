// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   INTENT ROUTER — SPEC_ACTIONS_INTEGRATION_EXPANDED_DEFAULT_UX P1-42

   Maps natural-language intent strings to canonical catalog actions.
   Estratégia em dois estágios:
     1. Lookup direto no INTENT_MAP (O(1))
     2. Fallback: searchCatalog fuzzy para correspondências parciais
   ================================================================ */

// @ts-ignore
import { CORE_CATALOG_ACTIONS } from './coreCatalog.js';
// @ts-ignore
import { searchCatalog } from './actionCatalog.js';

interface CatalogAction {
    id: string;
    category: string;
    labelKey: string;
    handler: string;
    tags: readonly string[];
    requiresPremium: boolean;
    priority: number;
}

// ──────────────────────────────────────────────────────────────────────
// Intent map - intenções canônicas → action ID
// Permite que frases naturais disparem ações diretas sem busca fuzzy
// ──────────────────────────────────────────────────────────────────────
export const INTENT_MAP = Object.freeze({
    // Import
    import: 'import-edd',
    upload: 'import-edd',
    edd: 'import-edd',
    xlsx: 'import-edd',
    manual: 'import-manual',
    'add observation': 'import-manual',
    // Export
    export: 'export-key',
    download: 'export-key',
    report: 'export-report',
    pdf: 'export-report',
    // Analyze
    eis: 'analyze-eis',
    score: 'analyze-eis',
    stats: 'analyze-stats',
    analytics: 'analyze-stats',
    // Visualize
    random: 'viz-random',
    demo: 'viz-random',
    constellation: 'viz-constellation',
    graph: 'viz-constellation',
    // Collaborate
    share: 'collab-share',
    broadcast: 'collab-share',
    // Configure
    config: 'configure-eis',
    dashboard: 'configure-eis',
});

/**
 * Resolve intenção para ação do catalog.
 *
 * Estágio 1: lookup direto no INTENT_MAP pelo termo normalizado (lowercase, trim).
 * Estágio 2: fallback searchCatalog fuzzy - retorna primeiro resultado.
 *
 * @param intent - Texto de intenção do usuário (natural language)
 * @param catalog - Injetável para testes
 */
export function resolveIntent(
    intent: string,
    catalog: CatalogAction[] = CORE_CATALOG_ACTIONS as CatalogAction[],
): { action: CatalogAction | null; source: 'intent_map' | 'search' | 'none' } {
    if (!intent?.trim()) return { action: null, source: 'none' };
    const key = intent.trim().toLowerCase();

    // Estágio 1 - lookup direto no INTENT_MAP
    const directId = (INTENT_MAP as Record<string, string>)[key];
    if (directId) {
        const action = catalog.find((a) => a.id === directId) ?? null;
        if (action) return { action, source: 'intent_map' };
    }

    // Estágio 2 - busca fuzzy por id, handler e tags
    const results = searchCatalog(catalog, key) as CatalogAction[];
    if (results.length > 0) return { action: results[0] as CatalogAction, source: 'search' };

    return { action: null, source: 'none' };
}

/**
 * Retorna top-N sugestões para uma intenção parcial.
 * Usado para completar input enquanto o usuário digita.
 *
 * Returns top-N suggestions for a partial intent string.
 *
 * @param partialIntent - Texto parcial digitado pelo usuário
 * @param catalog
 * @param limit
 */
export function suggestActions(
    partialIntent: string,
    catalog: CatalogAction[] = CORE_CATALOG_ACTIONS as CatalogAction[],
    limit: number = 5,
): CatalogAction[] {
    if (!partialIntent?.trim()) return catalog.slice(0, limit);
    return searchCatalog(catalog, partialIntent.trim()).slice(0, limit);
}
