// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * SPEC_FC01_ANALYTICS_MODEL_INDEX (claude - novaspec, 2026-06-02) —
 * primeiro consumidor real do RegistryCatalog (SPEC_REGISTRY_CATALOG).
 *
 * Adaptador FINO (~30 LOC) que mapeia AnalyticsRegistryEntry →
 * RegistryEntry e abre o catálogo genérico. Surfacar, NÃO reconstruir.
 *
 * 490 modelos de cálculo ambiental ficam descobríveis via UI:
 *   - busca textual em nome/description/group
 *   - filtro por familyTag (matriz/método: air, water, soil, mining, etc.)
 *   - export CSV para anexo de relatório/tese
 *
 * Refs:
 *   - SPEC `docs/specs/frontier/SPEC_FC01_ANALYTICS_MODEL_INDEX.md`
 *   - Abstração: `docs/specs/frontier/SPEC_REGISTRY_CATALOG.md`
 *   - Registry fonte: `core/analytics/_registryData.ts` (490 entries)
 *   - FORCE11 Nine Best Practices (arXiv 2012.13117) — metadados citáveis
 */

import { openRegistryCatalog, type RegistryEntry } from './registryCatalog.js';
import { t } from '../i18n/translations.js';

/**
 * Shape canônica do registry de analytics. Auto-gerada por
 * `scripts/generate-analytics-registry.mjs`, fonte da verdade =
 * `<name>Meta` exports em `app/js/core/analytics/*.js`.
 */
export interface AnalyticsRegistryEntry {
    readonly name: string;
    readonly description: string;
    readonly familyTags: ReadonlyArray<string>;
    readonly specRef: string;
    readonly sourcePath: string;
}

/**
 * Adaptador puro: AnalyticsRegistryEntry[] → RegistryEntry[].
 * Sem side-effect, testável em node. Conforme contrato
 * `RegistryAdapter<AnalyticsRegistryEntry[]>` (SPEC_REGISTRY_CATALOG §RF4).
 *
 * Mapeamento:
 *   - id: entry.name (único no registry)
 *   - label: entry.name (humanizar futuramente via i18n)
 *   - group: primeira familyTag (taxonomia auto-derivada do meta exports)
 *           — entries sem tag vão para 'misc'
 *   - meta: { description, familyTags, sourcePath } para detalhes
 *   - ref: entry.specRef (procedência citável FORCE11)
 */
export function analyticsAdapter(
    registry: ReadonlyArray<AnalyticsRegistryEntry>,
): RegistryEntry[] {
    if (!Array.isArray(registry)) return [];
    const out: RegistryEntry[] = [];
    for (const entry of registry) {
        if (!entry || typeof entry.name !== 'string' || entry.name.length === 0) {
            continue;
        }
        const tags = Array.isArray(entry.familyTags) ? entry.familyTags : [];
        const group = (tags[0] && typeof tags[0] === 'string') ? tags[0] : 'misc';
        out.push({
            id: entry.name,
            label: entry.name,
            group,
            meta: {
                description: typeof entry.description === 'string' ? entry.description : '',
                familyTags: tags.slice(),
                sourcePath: typeof entry.sourcePath === 'string' ? entry.sourcePath : '',
            },
            ref: typeof entry.specRef === 'string' && entry.specRef.length > 0 ? entry.specRef : '',
        });
    }
    return out;
}

/**
 * Abre o catálogo de analytics na UI. Lazy-load do registry para
 * evitar custar no boot (490 entries são grandes).
 *
 * Exportado para wire em handlers (window.handleOpenAnalyticsCatalog)
 * + opcionalmente ribbon/menu (delegado a outra sessão UI).
 */
export async function openAnalyticsCatalog(): Promise<void> {
    try {
        const mod = (await import('/js/core/analytics/_libraryRegistry.js' as any)) as any;
        const listFn = mod?.listAnalyticsModules;
        const registry: ReadonlyArray<AnalyticsRegistryEntry> = typeof listFn === 'function'
            ? listFn()
            : [];
        const entries = analyticsAdapter(registry);
        const title = (t ? t('analyticsCatalog.title') : '')
            || `Catálogo de modelos analíticos (${entries.length})`;
        openRegistryCatalog({
            entries,
            title,
            csvFilename: 'analytics-models',
        });
    }
    catch (e: any) {
        console.debug('[analyticsCatalog] open failed', e?.message || e);
    }
}
