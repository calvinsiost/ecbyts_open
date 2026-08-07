// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PRESET REGISTRY — Catalogo de model presets por tipo de projeto
   Cada preset define familias, parametros, opcoes de geracao,
   thresholds regulatorios e esqueleto de relatorio.

   Usado por: homeGrid.js (cards), generateRandomModel (options).
   Telemetria: preset_usage no Supabase (fire-and-forget).
   ================================================================ */

import { GAC_GAS_STATION } from './gac_gas_station.js';
import { GAC_INDUSTRIAL } from './gac_industrial.js';
import { GHG_INVENTORY } from './ghg_inventory.js';
import { REMEDIATION } from './remediation.js';
import { CAR_RURAL } from './car_rural.js';
import { OHS_WORKPLACE } from './ohs_workplace.js';

// ─── Registry ────────────────────────────────────────────────────

/** @type {Array<any>} */
export const PRESETS = [GAC_GAS_STATION, GAC_INDUSTRIAL, GHG_INVENTORY, REMEDIATION, CAR_RURAL, OHS_WORKPLACE];

/** Lookup rapido por ID. */
export const PRESET_MAP = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

/** Categorias para agrupamento no seletor. */
export const PRESET_CATEGORIES = [
    { id: 'gac', nameKey: 'preset.category.gac', presets: ['gac_gas_station', 'gac_industrial'] },
    { id: 'inventory', nameKey: 'preset.category.inventory', presets: ['ghg_inventory', 'car_rural'] },
    { id: 'remediation', nameKey: 'preset.category.remediation', presets: ['remediation'] },
    { id: 'safety', nameKey: 'preset.category.safety', presets: ['ohs_workplace'] },
];

/**
 * Retorna preset por ID.
 * @param {string} id
 * @returns {any}
 */
export function getPreset(id: any) {
    return PRESET_MAP[id];
}

/**
 * Retorna todos os presets de uma categoria.
 * @param {string} categoryId
 * @returns {Array<any>}
 */
export function getPresetsByCategory(categoryId: any) {
    const cat = PRESET_CATEGORIES.find((c) => c.id === categoryId);
    if (!cat) return [];
    return cat.presets.map((id) => PRESET_MAP[id]).filter(Boolean);
}
