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
   FILTER PRESETS — Subconjuntos reutilizaveis de dados para relatorios
   Gerenciador de filter presets globais ao modelo

   Cada preset define um conjunto de filtros { dimension, operator, value }
   que reutilizam o padrao do Calculator Engine. Presets podem ser
   referenciados por metric anchors nos relatorios para gerar tabelas
   e figuras filtradas no export PDF/DOCX.

   Persistencia via localStorage + export/import do modelo.
   ================================================================ */
import { safeSetItem } from '../storage/storageMonitor.js';
import { applyFiltersToElements, applyFiltersToObservations } from './_filterPresetMatchPure.js';
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
const STORAGE_KEY = 'ecbyts-filter-presets';
const MAX_PRESETS = 30;
let presets: any[] = [];
let presetCounter = 0;
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Initialize filter presets from localStorage.
 * Carrega presets salvos ou inicia vazio.
 */
export function initFilterPresets() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY) || '';
        if (saved) {
            const parsed = JSON.parse(saved);
            presets = Array.isArray(parsed.presets) ? parsed.presets : [];
            presetCounter = parsed.counter || 0;
        }
    } catch (e: any) {
        console.error('Failed to load filter presets:', e);
    }
}
// ----------------------------------------------------------------
// PERSISTENCE
// ----------------------------------------------------------------
/** @private */
function _persist() {
    safeSetItem(
        STORAGE_KEY,
        JSON.stringify({
            presets,
            counter: presetCounter,
        }),
    );
    window.dispatchEvent(new CustomEvent('filterPresetsChanged'));
}
// ----------------------------------------------------------------
// CRUD
// ----------------------------------------------------------------
/**
 * Get all presets.
 * @returns {Array<any>}
 */
export function getAllPresets() {
    return [...presets];
}
/**
 * Get preset by ID.
 * @param {string} id
 * @returns {Object|undefined}
 */
export function getPresetById(id: any) {
    return presets.find((p: any) => p.id === id);
}
/**
 * Add a new filter preset.
 * @param {any} data - { name, description?, color?, filters: [{dimension, operator, value}] }
 * @returns {Object|null} Created preset or null if limit reached
 */
export function addPreset(data: any) {
    if (presets.length >= MAX_PRESETS) return null;
    presetCounter++;
    const preset = {
        id: `fp-${presetCounter}`,
        name: data.name || 'Filter',
        description: data.description || '',
        color: data.color || '#4CAF50',
        filters: Array.isArray(data.filters) ? data.filters : [],
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
    };
    presets.push(preset);
    _persist();
    return preset;
}
/**
 * Update an existing preset.
 * @param {string} id
 * @param {any} data - Partial update { name?, description?, color?, filters? }
 * @returns {boolean}
 */
export function updatePreset(id: any, data: any) {
    const preset = presets.find((p: any) => p.id === id);
    if (!preset) return false;
    if (data.name !== undefined) preset.name = data.name;
    if (data.description !== undefined) preset.description = data.description;
    if (data.color !== undefined) preset.color = data.color;
    if (Array.isArray(data.filters)) preset.filters = data.filters;
    preset.modified = new Date().toISOString();
    _persist();
    return true;
}
/**
 * Remove a preset.
 * @param {string} id
 * @returns {boolean}
 */
export function removePreset(id: any) {
    const idx = presets.findIndex((p: any) => p.id === id);
    if (idx === -1) return false;
    presets.splice(idx, 1);
    _persist();
    return true;
}
// ----------------------------------------------------------------
// FILTER APPLICATION
// Aplica os filtros de um preset a um conjunto de elementos/observacoes
// ----------------------------------------------------------------
/**
 * Apply preset filters to elements.
 * Reutiliza o padrao do Calculator Engine: { dimension, operator, value }
 *
 * @param {string} presetId
 * @param {Array<any>} elements - Array of elements [{id, family, familyId, ...}]
 * @returns {Array<any>} Filtered elements
 */
export function applyPresetToElements(presetId: any, elements: any) {
    const preset = presets.find((p: any) => p.id === presetId);
    if (!preset || !preset.filters.length) return elements;
    return applyFiltersToElements(elements, preset.filters);
}
/**
 * Apply preset filters to observations.
 * @param {string} presetId
 * @param {Array<any>} observations
 * @returns {Array<any>} Filtered observations
 */
export function applyPresetToObservations(presetId: any, observations: any) {
    const preset = presets.find((p: any) => p.id === presetId);
    if (!preset || !preset.filters.length) return observations;
    return applyFiltersToObservations(observations, preset.filters);
}
/**
 * Count how many elements match a preset.
 * @param {string} presetId
 * @param {Array<any>} elements
 * @returns {number}
 */
export function countPresetMatches(presetId: any, elements: any) {
    return applyPresetToElements(presetId, elements).length;
}
// ----------------------------------------------------------------
// INTERNAL FILTER LOGIC
// Extraído para utils/report/_filterPresetMatchPure.ts (pure-logic)
// — matchByOperator / applyElementFilter / applyObservationFilter /
//   applyFiltersToElements / applyFiltersToObservations.
//   Aqui só fica a casca com estado (presets) + persistência.
// ----------------------------------------------------------------
// ----------------------------------------------------------------
// EXPORT / IMPORT
// ----------------------------------------------------------------
/**
 * Export presets for model serialization.
 * @returns {Object|null}
 */
export function exportPresets() {
    if (presets.length === 0) return null;
    return {
        presets: presets.map((p: any) => ({ ...p })),
        counter: presetCounter,
    };
}
/**
 * Import presets from model data.
 * @param {any} data - { presets, counter }
 */
export function importPresets(data: any) {
    if (!data) return;
    presets = Array.isArray(data.presets)
        ? data.presets.map((p: any) => ({
              ...p,
          }))
        : [];
    presetCounter = data.counter || 0;
    _persist();
}
/**
 * Clear all presets.
 */
export function clearPresets() {
    presets = [];
    presetCounter = 0;
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e: any) {
        console.debug('[filterPresets] clearStorage:', e?.message || e);
        /* ignore */
    }
    window.dispatchEvent(new CustomEvent('filterPresetsChanged'));
}
