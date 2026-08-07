// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   TAXONOMY MANAGER — Registry, bindings, and persistence
   Gerencia registro de taxonomias, bindings modelo-nivel e persistencia

   Taxonomias sao dicionarios de dados regulatorios (EPA WQX, ABNT, etc.)
   que adicionam campos auxiliares aos elementos conforme o padrao
   escolhido pelo usuario. Instaladas via sistema de bibliotecas.

   Estado:
   - _registry: Map<taxonomyId, TaxonomyDefinition> (todas registradas)
   - _bindings: Map<taxonomyId, { active, appliedAt, libraryId }> (bindings do modelo)
   ================================================================ */

import { validateTaxonomyDefinition } from './schema.js';

// ----------------------------------------------------------------
// MODULE STATE
// Estado do modulo em closure (sem store global)
// ----------------------------------------------------------------

/** @type {Map<string, Object>} taxonomyId → TaxonomyDefinition */
const _registry = new Map();

/** @type {Map<string, { active: boolean, appliedAt: string, libraryId: string }>} */
const _bindings = new Map();

const STORAGE_KEY = 'ecbyts-taxonomy-bindings';

// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------

/**
 * Initialize taxonomy manager. Restores bindings from localStorage.
 * Inicializa gerenciador de taxonomias e restaura bindings salvos.
 */
export function initTaxonomies() {
    _loadBindings();
}

// ----------------------------------------------------------------
// REGISTRY - Registration/removal of taxonomy definitions
// Registro de definicoes de taxonomia (chamado pelo loader.js)
// ----------------------------------------------------------------

/**
 * Register a taxonomy definition (called by library loader on inject).
 * Registra uma definicao de taxonomia no registry.
 *
 * @param {Record<string, any>} taxonomy - Taxonomy definition object
 * @param {string} libraryId - Source library id
 * @returns {boolean} Success
 */
export function registerTaxonomy(taxonomy: any, libraryId: any) {
    const { valid, errors } = validateTaxonomyDefinition(taxonomy);
    if (!valid) {
        console.error('[Taxonomy] Invalid definition:', errors);
        return false;
    }
    _registry.set(taxonomy.id, { ...taxonomy, _libraryId: libraryId });

    // Auto-activate if binding existed from previous session
    const existing = _bindings.get(taxonomy.id);
    if (existing?.active) {
        // Binding already active from restored state - dispatch event
        _dispatchChanged();
    }
    return true;
}

/**
 * Unregister a taxonomy definition (called by library loader on remove).
 * Remove definicao do registry. Dados nos elementos sao preservados.
 *
 * @param {string} taxonomyId
 */
export function unregisterTaxonomy(taxonomyId: any) {
    _registry.delete(taxonomyId);
    // Don't delete binding - data may still exist in elements
    // Mark as inactive if it was active
    const binding = _bindings.get(taxonomyId);
    if (binding?.active) {
        binding.active = false;
        _saveBindings();
        _dispatchChanged();
    }
}

// ----------------------------------------------------------------
// BINDINGS - Activate/deactivate taxonomies for the current model
// Ativar/desativar taxonomias no modelo corrente
// ----------------------------------------------------------------

/**
 * Activate a taxonomy for the current model.
 * Ativa taxonomia - campos aparecem no inspector para familias aplicaveis.
 *
 * @param {string} taxonomyId
 * @returns {boolean} Success
 */
export function activateTaxonomy(taxonomyId: any) {
    if (!_registry.has(taxonomyId)) {
        console.warn(`[Taxonomy] Cannot activate unknown taxonomy: ${taxonomyId}`);
        return false;
    }
    const def = /** @type {any} */ (_registry.get(taxonomyId));
    _bindings.set(taxonomyId, {
        active: true,
        appliedAt: new Date().toISOString(),
        libraryId: def?._libraryId || '',
    });
    _saveBindings();
    _dispatchChanged();
    return true;
}

/**
 * Deactivate a taxonomy. Data in elements is preserved but hidden from UI.
 * Desativa taxonomia - dados preservados, apenas ocultos.
 *
 * @param {string} taxonomyId
 */
export function deactivateTaxonomy(taxonomyId: any) {
    const binding = _bindings.get(taxonomyId);
    if (binding) {
        binding.active = false;
        _saveBindings();
        _dispatchChanged();
    }
}

/**
 * Purge all taxonomy data from elements for a specific taxonomy.
 * Remove dados auxiliares de todos os elementos para a taxonomia.
 * Acao destrutiva - chamada explicitamente pelo usuario.
 *
 * @param {string} taxonomyId
 * @param {Function} getAllElementsFn - Function that returns all elements
 */
export function purgeTaxonomyData(taxonomyId: any, getAllElementsFn: any) {
    const elements = getAllElementsFn();
    for (const el of elements) {
        if (el.data?.taxonomy?.[taxonomyId]) {
            delete el.data.taxonomy[taxonomyId];
            // Clean up empty taxonomy object
            if (Object.keys(el.data.taxonomy).length === 0) {
                delete el.data.taxonomy;
            }
        }
    }
    _bindings.delete(taxonomyId);
    _saveBindings();
    _dispatchChanged();
}

// ----------------------------------------------------------------
// QUERIES - Read active taxonomies
// Consultas de taxonomias ativas
// ----------------------------------------------------------------

/**
 * Get all active taxonomy definitions.
 * Retorna definicoes completas das taxonomias ativas.
 *
 * @returns {Object[]} Array of TaxonomyDefinition
 */
export function getActiveTaxonomies() {
    /** @type {Object[]} */
    const active = [];
    for (const [id, binding] of _bindings) {
        if (binding.active && _registry.has(id)) {
            const def = _registry.get(id);
            if (def) active.push(def);
        }
    }
    return active;
}

/**
 * Get active taxonomies applicable to a specific family.
 * Retorna taxonomias ativas que se aplicam a uma familia.
 *
 * @param {string} familyId - Element family ID
 * @returns {Object[]} Array of TaxonomyDefinition
 */
export function getTaxonomiesForFamily(familyId: any) {
    return getActiveTaxonomies().filter((/** @type {any} */ tax) => Array.isArray(tax.families) && tax.families.includes(familyId));
}

/**
 * Get a taxonomy definition by ID (active or not).
 * Busca definicao de taxonomia por ID.
 *
 * @param {string} taxonomyId
 * @returns {Object|undefined}
 */
export function getTaxonomyById(taxonomyId: any) {
    return _registry.get(taxonomyId);
}

/**
 * Get all registered taxonomies (for picker UI).
 * Retorna todas as taxonomias registradas (ativas e inativas).
 *
 * @returns {Object[]} Array of { definition, binding }
 */
export function getAllRegistered() {
    const result = [];
    for (const [id, def] of _registry) {
        const _def = (def as any);
        result.push({
            definition: def,
            binding: _bindings.get(id) || { active: false, appliedAt: null, libraryId: _def._libraryId },
        });
    }
    return result;
}

/**
 * Check if a taxonomy is currently active.
 * @param {string} taxonomyId
 * @returns {boolean}
 */
export function isTaxonomyActive(taxonomyId: any) {
    const binding = _bindings.get(taxonomyId);
    return !!(binding?.active && _registry.has(taxonomyId));
}

// ----------------------------------------------------------------
// EXPORT/IMPORT - Model serialization
// Serializacao para buildModel() / applyModel()
// ----------------------------------------------------------------

/**
 * Export taxonomy bindings for model serialization.
 * Exporta bindings para inclusao no buildModel().
 *
 * @returns {Object} Map of taxonomyId → binding
 */
export function exportTaxonomyBindings() {
    /** @type {Record<string, any>} */
    const out: Record<string, any> = {};
    for (const [id, binding] of _bindings) {
        out[id] = { ...binding };
    }
    return out;
}

/**
 * Import taxonomy bindings from a model.
 * Restaura bindings de um modelo importado.
 *
 * @param {Object} bindings - Map of taxonomyId → binding
 */
export function importTaxonomyBindings(bindings: any) {
    _bindings.clear();
    if (bindings && typeof bindings === 'object') {
        for (const [id, binding] of Object.entries(bindings)) {
            const _b = (binding as any);
            _bindings.set(id, {
                active: _b.active ?? false,
                appliedAt: _b.appliedAt || null,
                libraryId: _b.libraryId || '',
            });
        }
    }
    _saveBindings();
    _dispatchChanged();
}

// ----------------------------------------------------------------
// PERSISTENCE - localStorage
// Persistencia via localStorage (leve, Category A)
// ----------------------------------------------------------------

function _saveBindings() {
    try {
        /** @type {Record<string, any>} */
        const data: Record<string, any> = {};
        for (const [id, binding] of _bindings) {
            data[id] = binding;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('[Taxonomy] Failed to save bindings:', (e as any)?.message);
    }
}

function _loadBindings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY) || '';
        if (!raw) return;
        const data = JSON.parse(raw);
        for (const [id, binding] of Object.entries(data)) {
            _bindings.set(id, (binding as any));
        }
    } catch (e) {
        console.warn('[Taxonomy] Failed to load bindings:', (e as any)?.message);
    }
}

// ----------------------------------------------------------------
// EVENTS
// Eventos para notificar mudancas (inspector re-render, etc.)
// ----------------------------------------------------------------

function _dispatchChanged() {
    window.dispatchEvent(new CustomEvent('taxonomyChanged'));
}
