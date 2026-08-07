// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   BROADCAST PROFILE — Perfis de visibilidade granular por publico
   CRUD de perfis salvos, presets, filtragem de model_data

   Cada perfil define quais familias, secoes e campos um publico ve.
   ================================================================ */

import { getSupabaseClient, getCurrentUser } from '../../utils/auth/session.js';
import { CONFIG } from '../../config.js';

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

/** Secoes do modelo que podem ser ligadas/desligadas por perfil. */
export const MODEL_SECTIONS = [
    'elements',
    'campaigns',
    'observations',
    'project',
    'contracts',
    'sao',
    'costs',
    'interpolation',
    'report',
];

/**
 * Presets pre-definidos para os casos de uso mais comuns no GAC.
 * Cada preset e um atalho que preenche checkboxes na matriz.
 */
// CONSIST-OBS-001 S4 — PRESETS + library extensibility extraídos para módulo
// PURE (Node-testável; este arquivo importa Supabase = browser-bound).
// Wrappers 1-linha mantêm a API canônica neste módulo (contract test M2).
import {
    PRESETS,
    registerBroadcastPreset as _registerBroadcastPresetPure,
    unregisterBroadcastPreset as _unregisterBroadcastPresetPure,
} from './_broadcastPresetsPure.js';

export { PRESETS };

/** Register a broadcast preset from a library manifest (declarative, B1). */
export function registerBroadcastPreset(preset: any, libraryId: any) {
    return _registerBroadcastPresetPure(preset, libraryId);
}

/** Remove um preset registrado por library (built-ins não removíveis). */
export function unregisterBroadcastPreset(key: any) {
    return _unregisterBroadcastPresetPure(key);
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function _ensureClient() {
    const client = (getSupabaseClient()) as any;
    if (!client) throw new Error('Supabase nao inicializado.');
    return client;
}

function _ensureUser() {
    const user = (getCurrentUser()) as any;
    if (!user) throw new Error('Usuario nao autenticado.');
    return user;
}

// ----------------------------------------------------------------
// CRUD
// ----------------------------------------------------------------

/**
 * Cria um novo perfil de broadcast para um modelo.
 *
 * @param {string} modelId - UUID do modelo
 * @param {Object} profile - Dados do perfil
 * @param {string} profile.name - Nome do perfil (ex: "Regulador")
 * @param {'public'|'private'} profile.visibility - Visibilidade
 * @param {string[]} [profile.allowedEmails] - Emails para 'private'
 * @param {string[]} profile.visibleFamilies - IDs de familias visiveis
 * @param {string[]} profile.visibleSections - Secoes visiveis
 * @param {string[]} [profile.hiddenFields] - Campos ocultos
 * @returns {Promise<Object>} - Perfil criado
 */
export async function createProfile(modelId: string, profile: any) {
    const client = _ensureClient();
    const user = _ensureUser();

    const emails = (profile.allowedEmails || []).map((e: any) => e.toLowerCase().trim());

    const { data, error } = await client
        .from('radar_broadcast_profiles')
        .insert({
            model_id: modelId,
            owner_id: user.id,
            name: profile.name,
            visibility: profile.visibility || 'public',
            allowed_emails: emails,
            visible_families: profile.visibleFamilies || [],
            visible_sections: profile.visibleSections || ['elements', 'project'],
            hidden_fields: profile.hiddenFields || [],
        })
        .select(
            'id, model_id, owner_id, name, visibility, allowed_emails, visible_families, visible_sections, hidden_fields, created_at, updated_at',
        )
        .single();

    if (error) throw new Error(`Erro ao criar perfil: ${error.message}`);
    return data;
}

/**
 * Atualiza um perfil de broadcast existente.
 *
 * @param {string} profileId - UUID do perfil
 * @param {Object} changes - Campos a atualizar
 * @returns {Promise<Object>} - Perfil atualizado
 */
export async function updateProfile(profileId: string, changes: any) {
    const client = _ensureClient();
    _ensureUser();

    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    if (changes.name !== undefined) update.name = changes.name;
    if (changes.visibility !== undefined) update.visibility = changes.visibility;
    if (changes.allowedEmails !== undefined) {
        update.allowed_emails = changes.allowedEmails.map((e: any) => e.toLowerCase().trim());
    }
    if (changes.visibleFamilies !== undefined) update.visible_families = changes.visibleFamilies;
    if (changes.visibleSections !== undefined) update.visible_sections = changes.visibleSections;
    if (changes.hiddenFields !== undefined) update.hidden_fields = changes.hiddenFields;

    const { data, error } = await client
        .from('radar_broadcast_profiles')
        .update(update)
        .eq('id', profileId)
        .select(
            'id, model_id, owner_id, name, visibility, allowed_emails, visible_families, visible_sections, hidden_fields, created_at, updated_at',
        )
        .single();

    if (error) throw new Error(`Erro ao atualizar perfil: ${error.message}`);
    return data;
}

/**
 * Deleta um perfil de broadcast.
 * CASCADE desativa broadcasts associados (profile_id -> SET NULL).
 *
 * @param {string} profileId - UUID do perfil
 * @returns {Promise<void>}
 */
export async function deleteProfile(profileId: any) {
    const client = _ensureClient();
    _ensureUser();

    const { error } = await client.from('radar_broadcast_profiles').delete().eq('id', profileId);

    if (error) throw new Error(`Erro ao deletar perfil: ${error.message}`);
}

/**
 * Lista perfis de broadcast salvos para um modelo.
 *
 * @param {string} modelId - UUID do modelo
 * @returns {Promise<Object[]>}
 */
export async function getProfilesForModel(modelId: any) {
    const client = _ensureClient();
    _ensureUser();

    // OPT-1: explicit columns matching createProfile() insert shape + filterModelData consumer
    const { data, error } = await client
        .from('radar_broadcast_profiles')
        .select(
            'id, model_id, owner_id, name, visibility, allowed_emails, visible_families, visible_sections, hidden_fields, created_at, updated_at',
        )
        .eq('model_id', modelId)
        .order('created_at', { ascending: false });

    if (error) throw new Error(`Erro ao listar perfis: ${error.message}`);
    return data || [];
}

// ----------------------------------------------------------------
// UTILITIES
// ----------------------------------------------------------------

/**
 * Retorna familias disponiveis do CONFIG atual.
 * Familias sem elementos podem ser desabilitadas na UI.
 *
 * @returns {{ id: string, name: string }[]}
 */
export function getAvailableFamilies() {
    const cfg = (CONFIG) as any;
    const families = cfg?.FAMILIES || cfg?.DEFAULT_FAMILIES || [];
    return families.map((f: any) => ({ id: f.id, name: f.name || f.nameKey || f.id }));
}

/**
 * Retorna secoes do modelo disponiveis para toggle.
 *
 * @returns {string[]}
 */
export function getAvailableSections() {
    return [...MODEL_SECTIONS];
}

/**
 * Aplica um preset sobre os checkboxes.
 * Retorna os arrays de familias e secoes para preencher a UI.
 *
 * @param {string} presetKey - 'compliance' | 'executive' | 'complete'
 * @returns {{ families: string[], sections: string[] }}
 */
export function applyPreset(presetKey: string) {
    const preset = (PRESETS as Record<string, any>)[presetKey];
    if (!preset) return { families: [], sections: [] };

    const allFamilies = getAvailableFamilies().map((f: any) => f.id);
    const families = preset.families === '*' ? allFamilies : preset.families;
    const sections = preset.sections === '*' ? [...MODEL_SECTIONS] : preset.sections;

    return { families, sections };
}

/** Mapeamento de secoes de perfil para chaves de model_data. */
const SECTION_MAP: Record<string, string | null> = {
    campaigns: 'campaigns',
    observations: null, // filtrado dentro de elements.data.observations
    project: 'project',
    contracts: 'contracts',
    sao: 'sao',
    costs: 'costs',
    interpolation: 'interpolation',
    report: 'report',
};

function _filterElementsByFamily(elements: any[], visibleFamilies: string[]) {
    if (!visibleFamilies.length) return elements;
    return elements.filter((el: any) => visibleFamilies.includes(el.family));
}

function _filterSections(filtered: Record<string, any>, visibleSections: string[]) {
    for (const [section, key] of Object.entries(SECTION_MAP)) {
        if (key && !visibleSections.includes(section)) {
            filtered[key] = undefined;
        }
    }
}

function _filterObservations(elements: any[]) {
    return elements.map((el: any) => {
        if (el?.data?.observations) {
            return { ...el, data: { ...el.data, observations: [] } };
        }
        return el;
    });
}

function _applyHiddenFields(filtered: Record<string, any>, hiddenFields: string[]) {
    for (const field of hiddenFields) {
        if (field in filtered) {
            filtered[field] = undefined;
        }
    }
}

/**
 * Filtra model_data com base no perfil de broadcast.
 * Aplicado no cliente apos carregar o modelo completo.
 *
 * @param {Object} modelData - Modelo completo (JSON do ECBT)
 * @param {Object} profile - Broadcast profile com visibleFamilies/Sections/hiddenFields
 * @returns {Object} - Modelo filtrado (copia, nao modifica original)
 */
export function filterModelData(modelData: any, profile: any) {
    if (!modelData || !profile) return modelData;

    /** @type {Record<string, any>} */
    const filtered = { ...modelData };
    const visibleFamilies = profile.visible_families || profile.visibleFamilies || [];
    const visibleSections = profile.visible_sections || profile.visibleSections || [];
    const hiddenFields = profile.hidden_fields || profile.hiddenFields || [];

    if (filtered.elements && visibleFamilies.length > 0) {
        filtered.elements = _filterElementsByFamily(filtered.elements, visibleFamilies);
    }

    _filterSections(filtered, visibleSections);

    if (!visibleSections.includes('observations') && filtered.elements) {
        filtered.elements = _filterObservations(filtered.elements);
    }

    _applyHiddenFields(filtered, hiddenFields);

    return filtered;
}
