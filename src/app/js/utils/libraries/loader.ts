// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* global require */
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   LIBRARY LOADER — Manifest injector and remover
   Injetor e removedor de conteudo de bibliotecas

   Parseia o manifesto e injeta/remove conteudo nos modulos alvo.
   Cada secao do manifesto (families, units, parameters, agents, etc.)
   tem um par _inject/_remove que sabe conversar com o modulo alvo.

   Retorna injectedIds para rastreamento na desinstalacao.
   ================================================================ */
import { addCustomFamily, deleteFamily } from '../../core/elements/families.js';
import { CONFIG } from '../../config.js';
import { saveUserAgent, deleteUserAgent } from '../../core/llm/agents.js';
import { addUserTool, removeUserTool } from '../../core/llm/chatTools.js';
import { addTickerItem, removeTickerItem } from '../ticker/manager.js';
import { BENCHMARKS, addCustomThreshold, getCustomThresholds, removeCustomThreshold, } from '../../core/validation/rules.js';
import { registerLock, unregisterLibraryLocks } from './locks.js';
import { registerVectorLayer, unregisterVectorLayer, getVectorLayersList, } from '../../core/io/geo/vectorLayerOverlay.js';
import { registerTaxonomy, unregisterTaxonomy, deactivateTaxonomy } from '../../core/taxonomy/manager.js';
// CONSIST-OBS-001 S4 — APIs de extensibilidade library-facing (modelo B1
// declarativo: dados validados, zero code-exec; ver SPEC §15 B1)
import { registerBroadcastPreset, unregisterBroadcastPreset } from '../../core/radar/broadcastProfile.js';
import { registerFieldMetaExtension, unregisterFieldMetaExtension } from '../../core/fieldMeta/schema.js';
import { registerReportTemplate, unregisterReportTemplate } from '../report/manager.js';
import { registerAction as registerLibraryActionAlias, unregisterAction as unregisterLibraryActionAlias } from '../../core/actions/ActionManager.js';
/**
 * @typedef {Record<string, any>} LibraryManifest
 * @typedef {Record<string, any>} LibraryContent
 */
/**
 * @param {unknown} value
 * @returns {[string, any][]}
 */
function _entries(value: any): any[] {
    return Object.entries((value || {})) as any[];
}
// ----------------------------------------------------------------
// MAIN ORCHESTRATION
// Orquestra injecao/remocao de todas as secoes
// ----------------------------------------------------------------
/**
 * Inject all content sections from a library manifest.
 * Injeta todo o conteudo do manifesto nos modulos alvo.
 *
 * @param {LibraryManifest} manifest - Library manifest
 * @returns {Record<string, any>} injectedIds - Tracking object for uninstall
 */
export function injectLibrary(manifest: any) {
    const contents = manifest.contents || {};
    const injectedIds: any = {
        families: [],
        parameters: [],
        units: [],
        agents: [],
        chatTools: [],
        tickerItems: [],
        validationRules: { regulatoryLimits: [], parameterLimits: [], benchmarks: [] },
        lockedFields: [],
        i18n: [],
        imagery: [],
        vectorLayers: [],
        taxonomies: [],
        naturalAssetCatalog: null as null | { libraryId: string },
        // CONSIST-OBS-001 S4 — extensibilidade declarativa (B1)
        broadcastPresets: [] as string[],
        fieldMetaExtension: false,
        reportTemplates: [] as string[],
        aiActions: [] as string[],
    };
    // Order matters: units before parameters (params may reference units)
    if (contents.units) {
        injectedIds.units = _injectUnits(contents.units);
    }
    if (contents.families) {
        injectedIds.families = _injectFamilies(contents.families);
    }
    if (contents.parameters) {
        injectedIds.parameters = _injectParameters(contents.parameters);
    }
    if (contents.validationRules) {
        injectedIds.validationRules = _injectValidationRules(contents.validationRules);
    }
    if (contents.agents) {
        injectedIds.agents = _injectAgents(contents.agents, manifest.id);
    }
    if (contents.chatTools) {
        injectedIds.chatTools = _injectChatTools(contents.chatTools, manifest.id);
    }
    if (contents.tickerItems) {
        injectedIds.tickerItems = _injectTickerItems(contents.tickerItems, manifest.id);
    }
    if (contents.i18n) {
        injectedIds.i18n = _injectI18n(contents.i18n);
    }
    if (contents.lockedFields) {
        injectedIds.lockedFields = _injectLockedFields(contents.lockedFields, manifest.id);
    }
    if (contents.imagery) {
        injectedIds.imagery = _injectImagery(contents.imagery, manifest.id);
    }
    if (contents.vectorLayers) {
        injectedIds.vectorLayers = _injectVectorLayers(contents.vectorLayers, manifest.id);
    }
    if (contents.taxonomies) {
        injectedIds.taxonomies = _injectTaxonomies(contents.taxonomies, manifest.id);
    }
    if (contents.naturalAssetCatalog) {
        const ok = _injectNaturalAssetCatalog(contents.naturalAssetCatalog, manifest.id);
        if (ok) injectedIds.naturalAssetCatalog = { libraryId: manifest.id };
    }
    // CONSIST-OBS-001 S4 — seções declarativas (B1: dados validados nos
    // registries-alvo; entradas inválidas retornam null e são ignoradas)
    if (Array.isArray(contents.broadcastPresets)) {
        injectedIds.broadcastPresets = contents.broadcastPresets
            .map((p: any) => registerBroadcastPreset(p, manifest.id))
            .filter(Boolean);
    }
    if (contents.fieldMetaExtensions) {
        injectedIds.fieldMetaExtension = !!registerFieldMetaExtension(contents.fieldMetaExtensions, manifest.id);
    }
    if (Array.isArray(contents.reportTemplates)) {
        injectedIds.reportTemplates = contents.reportTemplates
            .map((t: any) => registerReportTemplate(t, manifest.id))
            .filter(Boolean);
    }
    if (Array.isArray(contents.aiActions)) {
        injectedIds.aiActions = contents.aiActions
            .map((a: any) => registerLibraryActionAlias(a, manifest.id))
            .filter(Boolean);
    }
    return injectedIds;
}
/**
 * Remove all injected content from a library.
 * Remove todo o conteudo injetado por uma biblioteca.
 *
 * @param {LibraryManifest} manifest - Library manifest
 * @param {Record<string, any>|null|undefined} injectedIds - Tracking object from install
 */
export function removeLibrary(manifest: any,injectedIds: any) {
    if (!injectedIds)
        return;
    // Remove in reverse order of injection
    // CONSIST-OBS-001 S4 — extensibilidade declarativa (B1)
    if (injectedIds.aiActions?.length > 0) {
        injectedIds.aiActions.forEach((k: string) => unregisterLibraryActionAlias(k));
    }
    if (injectedIds.reportTemplates?.length > 0) {
        injectedIds.reportTemplates.forEach((k: string) => unregisterReportTemplate(k));
    }
    if (injectedIds.fieldMetaExtension) {
        unregisterFieldMetaExtension(manifest?.id);
    }
    if (injectedIds.broadcastPresets?.length > 0) {
        injectedIds.broadcastPresets.forEach((k: string) => unregisterBroadcastPreset(k));
    }
    if (injectedIds.naturalAssetCatalog?.libraryId) {
        _removeNaturalAssetCatalog(injectedIds.naturalAssetCatalog.libraryId);
    }
    if (injectedIds.taxonomies?.length > 0) {
        _removeTaxonomies(injectedIds.taxonomies);
    }
    if (injectedIds.imagery?.length > 0) {
        _removeImagery(injectedIds.imagery);
    }
    if (injectedIds.vectorLayers?.length > 0) {
        _removeVectorLayers(injectedIds.vectorLayers);
    }
    unregisterLibraryLocks(manifest.id);
    if (injectedIds.i18n?.length > 0) {
        _removeI18n(injectedIds.i18n);
    }
    if (injectedIds.tickerItems?.length > 0) {
        _removeTickerItems(injectedIds.tickerItems);
    }
    if (injectedIds.chatTools?.length > 0) {
        _removeChatTools(injectedIds.chatTools);
    }
    if (injectedIds.agents?.length > 0) {
        _removeAgents(injectedIds.agents);
    }
    if (injectedIds.validationRules) {
        _removeValidationRules(injectedIds.validationRules);
    }
    if (injectedIds.parameters?.length > 0) {
        _removeParameters(injectedIds.parameters);
    }
    if (injectedIds.families?.length > 0) {
        _removeFamilies(injectedIds.families);
    }
    if (injectedIds.units?.length > 0) {
        _removeUnits(injectedIds.units);
    }
}
// ----------------------------------------------------------------
// FAMILIES
// Injeta/remove familias customizadas
// ----------------------------------------------------------------
/** @param {Record<string, any>} families */
function _injectFamilies(families: any) {
    const ids: any[] = [];
    for (const [famId, famDef] of _entries(families)) {
        const result = addCustomFamily(famDef.id || famId, famDef.name || famId, famDef.icon || 'cube');
        if (result) {
            ids.push(result.id);
        }
    }
    return ids;
}
/** @param {string[]} familyIds */
function _removeFamilies(familyIds: any) {
    for (const id of familyIds) {
        deleteFamily(id);
    }
}
// ----------------------------------------------------------------
// PARAMETERS
// Injeta/remove parametros em CONFIG.PARAMETERS
// Mesmo padrao do SAO: merge sem duplicar IDs existentes
// ----------------------------------------------------------------
/** @param {Array<Record<string, any>>} parameters */
function _injectParameters(parameters: any) {
    const configParameters = CONFIG.PARAMETERS;
    const ids: any[] = [];
    for (const param of parameters) {
        if (!param.id)
            continue;
        // Check if already exists - only add sao metadata, don't duplicate
        const existing: any = configParameters.find((p: any) => p.id === param.id);
        if (existing) {
            // Merge library-specific fields without overwriting core fields
            if (param.library)
                existing.library = param.library;
            ids.push(param.id);
        }
        else {
            configParameters.push({ ...param });
            ids.push(param.id);
        }
    }
    return ids;
}
/** @param {string[]} paramIds */
function _removeParameters(paramIds: any) {
    const configParameters = CONFIG.PARAMETERS;
    for (const id of paramIds) {
        const idx = configParameters.findIndex((p: any) => p.id === id);
        // Only remove if it was added by a library (has no sao or existing default)
        if (idx !== -1) {
            configParameters.splice(idx, 1);
        }
    }
}
// ----------------------------------------------------------------
// UNITS
// Injeta/remove unidades em CONFIG.UNITS (array)
// ----------------------------------------------------------------
/** @param {Array<Record<string, any>>} units */
function _injectUnits(units: any) {
    const configUnits = CONFIG.UNITS;
    const ids: any[] = [];
    for (const unit of units) {
        if (!unit.id)
            continue;
        // Skip if already exists
        const existing = configUnits.find((u: any) => u.id === unit.id);
        if (!existing) {
            configUnits.push({ ...unit });
            ids.push(unit.id);
        }
    }
    return ids;
}
/** @param {string[]} unitIds */
function _removeUnits(unitIds: any) {
    const configUnits = CONFIG.UNITS;
    for (const id of unitIds) {
        const idx = configUnits.findIndex((u: any) => u.id === id);
        if (idx !== -1) {
            configUnits.splice(idx, 1);
        }
    }
}
// ----------------------------------------------------------------
// VALIDATION RULES
// Injeta/remove limites regulatorios, parametros e benchmarks
// ----------------------------------------------------------------
/** @param {Record<string, any>} rules */
function _injectValidationRules(rules: any) {
    const injected: any = { regulatoryThresholds: [], parameterThresholds: [], benchmarks: [] };
    if (rules.regulatoryLimits || rules.regulatoryThresholds) {
        const thresholds = rules.regulatoryThresholds || rules.regulatoryLimits;
        for (const [cas, entries] of _entries(thresholds)) {
            // Suporta formato novo (array de ThresholdEntry) e legado (matrixLimits)
            const entryArray = Array.isArray(entries)
                ? entries
                : _entries(entries).map(([matrix, lim]) => ({
                    type: 'vi',
                    value: lim.max,
                    matrix,
                    unit: lim.unit,
                    severity: 'intervention',
                    source: lim.source || 'library',
                    meta: {},
                }));
            for (const entry of entryArray) {
                addCustomThreshold(cas, { ...entry, meta: { ...entry.meta, _libraryInjected: true } });
            }
            injected.regulatoryThresholds.push(cas);
        }
    }
    if (rules.parameterLimits || rules.parameterThresholds) {
        const thresholds = rules.parameterThresholds || rules.parameterLimits;
        for (const [paramId, entries] of _entries(thresholds)) {
            const entryArray = Array.isArray(entries)
                ? entries
                : [
                    {
                        type: 'vi',
                        value: entries.max,
                        matrix: entries.matrix || 'effluent',
                        unit: entries.unit,
                        severity: 'intervention',
                        source: entries.source || 'library',
                        meta: {},
                    },
                ];
            for (const entry of entryArray) {
                addCustomThreshold(paramId, { ...entry, meta: { ...entry.meta, _libraryInjected: true } });
            }
            injected.parameterThresholds.push(paramId);
        }
    }
    if (rules.benchmarks) {
        for (const [indicatorId, benchmark] of _entries(rules.benchmarks)) {
            (BENCHMARKS as Record<string,any>)[indicatorId] = { ...benchmark };
            injected.benchmarks.push(indicatorId);
        }
    }
    return injected;
}
/** @param {Record<string, any>} injectedRules */
function _removeValidationRules(injectedRules: any) {
    if (injectedRules.regulatoryThresholds) {
        for (const cas of injectedRules.regulatoryThresholds) {
            // Remove only library-injected entries
            const customs = getCustomThresholds(cas);
            for (let i = customs.length - 1; i >= 0; i--) {
                if (customs[i].meta?._libraryInjected)
                    removeCustomThreshold(cas, i);
            }
        }
    }
    if (injectedRules.parameterThresholds) {
        for (const paramId of injectedRules.parameterThresholds) {
            const customs = getCustomThresholds(paramId);
            for (let i = customs.length - 1; i >= 0; i--) {
                if (customs[i].meta?._libraryInjected)
                    removeCustomThreshold(paramId, i);
            }
        }
    }
    if (injectedRules.benchmarks) {
        for (const indicatorId of injectedRules.benchmarks) {
            delete (BENCHMARKS as Record<string,any>)[indicatorId];
        }
    }
}
// ----------------------------------------------------------------
// AGENTS
// Injeta/remove agentes de IA como user agents
// ----------------------------------------------------------------
/** @param {Array<Record<string, any>>} agents @param {string} libraryId */
function _injectAgents(agents: any,libraryId: any) {
    const ids: any[] = [];
    for (const agent of agents) {
        const saved = saveUserAgent({
            id: agent.id || `lib-${libraryId}-${Date.now()}`,
            name: agent.name || 'Library Agent',
            description: agent.description || '',
            systemPromptAddition: agent.systemPromptAddition || '',
            icon: agent.icon || 'cpu',
            isLibrary: true,
            libraryId,
        });
        if (saved)
            ids.push(saved.id);
    }
    return ids;
}
/** @param {string[]} agentIds */
function _removeAgents(agentIds: any) {
    for (const id of agentIds) {
        deleteUserAgent(id);
    }
}
// ----------------------------------------------------------------
// CHAT TOOLS
// Injeta/remove ferramentas de chat como user tools
// ----------------------------------------------------------------
/** @param {Array<Record<string, any>>} tools @param {string} libraryId */
function _injectChatTools(tools: any,libraryId: any) {
    const ids: any[] = [];
    for (const tool of tools) {
        const created = addUserTool({
            name: tool.name || 'Library Tool',
            description: tool.description || '',
            prompt: tool.promptAddition || '',
            icon: tool.icon || 'wrench',
        });
        if (created) {
            // Tag with library info for tracking
            const createdTool: any = created;
            createdTool.isLibrary = true;
            createdTool.libraryId = libraryId;
            ids.push(createdTool.id);
        }
    }
    return ids;
}
/** @param {string[]} toolIds */
function _removeChatTools(toolIds: any) {
    for (const id of toolIds) {
        removeUserTool(id);
    }
}
// ----------------------------------------------------------------
// TICKER ITEMS
// Injeta/remove itens na barra de metricas
// ----------------------------------------------------------------
/** @param {Array<Record<string, any>>} items @param {string} libraryId */
function _injectTickerItems(items: any,libraryId: any) {
    /** @type {string[]} */
    const ids: any[] = [];
    items.forEach((itemDef: any, i: any) => {
        const item = addTickerItem({
            id: `lib-${libraryId}-ticker-${i}`,
            label: itemDef.label || '',
            suffix: itemDef.suffix || '',
            filters: itemDef.filters || [],
            calculation: itemDef.calculation || 'average',
            unitId: itemDef.unitId || null,
            precision: itemDef.precision ?? 2,
            color: itemDef.color || '',
            enabled: true,
        });
        if (item)
            ids.push(item.id);
    });
    return ids;
}
/** @param {string[]} itemIds */
function _removeTickerItems(itemIds: any) {
    for (const id of itemIds) {
        removeTickerItem(id);
    }
}
// ----------------------------------------------------------------
// I18N
// Injeta/remove chaves de traducao nos dicionarios carregados
// ----------------------------------------------------------------
/** @param {Record<string, Record<string, unknown>>} i18nData */
function _injectI18n(i18nData: any) {
    const injectedKeys = [];
    // i18nData format: { en: { key: value }, pt: { key: value }, es: { key: value } }
    // We need to merge into the global translations object
    // Since translations.js doesn't export a merge function, we dispatch a custom event
    // that translations.js can listen to, or we use the global _ecbyts_i18n_merge pattern
    for (const [lang, keys] of _entries(i18nData)) {
        if (typeof keys !== 'object')
            continue;
        // Store keys for removal tracking
        injectedKeys.push(...Object.keys(keys).map((k: any) => `${lang}:${k}`));
    }
    // Dispatch event with the i18n data so translations module can merge
    window.dispatchEvent(new CustomEvent('i18nMerge', { detail: i18nData }));
    return injectedKeys;
}
/** @param {string[]} keySpecs */
function _removeI18n(keySpecs: any) {
    // keySpecs format: ["en:key1", "pt:key2", ...]
    // Dispatch event so translations module can remove
    window.dispatchEvent(new CustomEvent('i18nRemove', { detail: keySpecs }));
}
// ----------------------------------------------------------------
// LOCKED FIELDS
// Registra/remove campos travados no motor de locks
// ----------------------------------------------------------------
/** @param {Array<Record<string, any>>} lockedFields @param {string} libraryId */
function _injectLockedFields(lockedFields: any,libraryId: any) {
    const ids: any[] = [];
    for (const lockDef of lockedFields) {
        if (!lockDef.id)
            continue;
        registerLock(lockDef, libraryId);
        ids.push(lockDef.id);
    }
    return ids;
}
// ----------------------------------------------------------------
// IMAGERY
// Registra/remove imagens aereas georreferenciadas
// Armazena referências num catálogo interno; a aplicação
// real no boundary acontece sob demanda pelo inspector.
// ----------------------------------------------------------------
/** @type {Map<string, Object>} id → { ...imgDef, libraryId } */
/** @type {Map<string, Record<string, any>>} */
const _imageryRegistry = new Map();
/**
 * Register imagery entries from a library.
 * @param {Array<Record<string, any>>} imagery - Array of imagery definitions
 * @param {string} libraryId - Source library id
 * @returns {string[]} Injected imagery ids
 */
function _injectImagery(imagery: any,libraryId: any) {
    const ids: any[] = [];
    for (const img of imagery) {
        if (!img.id)
            continue;
        _imageryRegistry.set(img.id, { ...img, libraryId });
        ids.push(img.id);
    }
    window.dispatchEvent(new CustomEvent('imageryChanged'));
    return ids;
}
/**
 * Remove imagery entries from registry.
 * Boundary overlay cleanup is handled by the 'imageryChanged' event
 * listener in the handler layer (has access to elements module).
 *
 * @param {string[]} ids - Imagery ids to remove
 */
function _removeImagery(ids: any) {
    for (const id of ids) {
        _imageryRegistry.delete(id);
    }
    window.dispatchEvent(new CustomEvent('imageryChanged', {
        detail: { removed: ids },
    }));
}
/**
 * Get all available imagery from installed libraries.
 * @returns {Array<Record<string, any>>} Array of imagery entries with libraryId
 */
export function getAvailableImagery() {
    return Array.from(_imageryRegistry.values());
}
/**
 * Get a specific imagery entry by id.
 * @param {string} id - Imagery id
 * @returns {Record<string, any>|undefined}
 */
export function getImageryById(id: any) {
    return _imageryRegistry.get(id);
}
// ----------------------------------------------------------------
// VECTOR LAYERS
// Registra/remove camadas vetoriais GeoJSON para overlay espacial
// Similar ao imagery mas para dados vetoriais (bacias, limites, etc)
// ----------------------------------------------------------------
/**
 * Register vector layer entries from a library.
 * Delega para o registry único do vectorLayerOverlay.
 * @param {Array<Record<string, any>>} vectorLayers - Array of vector layer definitions
 * @param {string} libraryId - Source library id
 * @returns {string[]} Injected vector layer ids
 */
function _injectVectorLayers(vectorLayers: any,libraryId: any) {
    const ids: any[] = [];
    for (const layer of vectorLayers) {
        if (!layer.id)
            continue;
        registerVectorLayer(layer, libraryId);
        ids.push(layer.id);
    }
    window.dispatchEvent(new CustomEvent('vectorLayersChanged'));
    return ids;
}
/**
 * Remove vector layer entries.
 * @param {string[]} ids - Vector layer ids to remove
 */
function _removeVectorLayers(ids: any) {
    for (const id of ids) {
        unregisterVectorLayer(id);
    }
    window.dispatchEvent(new CustomEvent('vectorLayersChanged', {
        detail: { removed: ids },
    }));
}
/**
 * Get all available vector layers from installed libraries.
 * @returns {Array<Record<string, any>>} Array of vector layer metadata
 */
export function getAvailableVectorLayers() {
    return getVectorLayersList();
}
/**
 * Get a specific vector layer entry by id.
 * @param {string} id - Vector layer id
 * @returns {Record<string, any>|undefined}
 */
export function getVectorLayerById(id: any) {
    return getVectorLayersList().find((l: any) => l.id === id);
}
// ----------------------------------------------------------------
// TAXONOMIES
// Injeta/remove dicionarios de dados regulatorios (EPA WQX, ABNT, etc.)
// ----------------------------------------------------------------
/**
 * Inject taxonomy definitions from a library manifest.
 * Registra taxonomias no manager e injeta i18n associado.
 *
 * @param {Array<Record<string, any>>} taxonomies - Array of taxonomy definitions
 * @param {string} libraryId - Source library id
 * @returns {string[]} Injected taxonomy ids
 */
function _injectTaxonomies(taxonomies: any,libraryId: any) {
    const ids: any[] = [];
    for (const tax of taxonomies) {
        if (!tax.id)
            continue;
        // Inject taxonomy-specific i18n if present
        if (tax.i18n && typeof tax.i18n === 'object') {
            window.dispatchEvent(new CustomEvent('i18nMerge', { detail: tax.i18n }));
        }
        const ok = registerTaxonomy(tax, libraryId);
        if (ok)
            ids.push(tax.id);
    }
    return ids;
}
/**
 * Remove taxonomy definitions.
 * Desativa e desregistra taxonomias. Dados nos elementos sao preservados.
 *
 * @param {string[]} taxonomyIds - Taxonomy ids to remove
 */
function _removeTaxonomies(taxonomyIds: any) {
    for (const id of taxonomyIds) {
        deactivateTaxonomy(id);
        unregisterTaxonomy(id);
    }
}

// ----------------------------------------------------------------
// NATURAL ASSET CATALOG (Calvin D1 2026-06-08)
// Registra catálogo de R$/m² por família em registry global, consumido
// por ecbtScorePanel.ts via resolveEffectiveCatalog({libraries: [...]}).
// ----------------------------------------------------------------

/**
 * Injeta naturalAssetCatalog em window.__ecbtNaturalAssetCatalogLibraries
 * (Map<libraryId, NaturalAssetCatalog>) e dispara evento p/ painel reagir.
 *
 * Retorna true se OK, false se payload inválido (loga warning).
 */
function _injectNaturalAssetCatalog(catalog: any, libraryId: string): boolean {
    try {
        // Validate via pure-logic loader
        const loader = require('../../core/ecbtScore/_naturalAssetCatalogLoaderPure.js');
        const result = loader.validateCatalogPayload(catalog);
        if (!result.valid) {
            console.warn('[libraries:naturalAssetCatalog]', libraryId, 'invalid payload', result.issues);
            return false;
        }
        const w = window as any;
        if (!w.__ecbtNaturalAssetCatalogLibraries) {
            w.__ecbtNaturalAssetCatalogLibraries = new Map<string, any>();
        }
        w.__ecbtNaturalAssetCatalogLibraries.set(libraryId, result.normalized);
        window.dispatchEvent(
            new CustomEvent('ecbt:natural-asset-catalog-changed', {
                detail: { libraryId, action: 'installed' },
            }),
        );
        return true;
    } catch (e) {
        console.debug('[libraries:naturalAssetCatalog:inject]', (e as Error)?.message || e);
        return false;
    }
}

/**
 * Remove catálogo registrado por uma library específica.
 */
function _removeNaturalAssetCatalog(libraryId: string): void {
    try {
        const w = window as any;
        if (w.__ecbtNaturalAssetCatalogLibraries instanceof Map) {
            w.__ecbtNaturalAssetCatalogLibraries.delete(libraryId);
            window.dispatchEvent(
                new CustomEvent('ecbt:natural-asset-catalog-changed', {
                    detail: { libraryId, action: 'removed' },
                }),
            );
        }
    } catch (e) {
        console.debug('[libraries:naturalAssetCatalog:remove]', (e as Error)?.message || e);
    }
}
