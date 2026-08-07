// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Broadcast presets — pure registry (CONSIST-OBS-001 S4, modelo B1).
 *
 * Extraído de broadcastProfile.ts para ser importável em Node cheap tests
 * (broadcastProfile importa Supabase client — browser-bound). Os PRESETS
 * built-in vivem aqui; broadcastProfile re-exporta tudo.
 *
 * Library extensibility: presets de library são DADOS declarativos
 * (B1: declarativo > executável — zero code-exec), namespaced
 * `lib:<libraryId>:<presetId>` para evitar colisão e permitir remoção limpa.
 */

export const PRESETS: Record<string, any> = {
    compliance: {
        name: 'Compliance',
        families: ['well', 'plume', 'spring', 'lake', 'river', 'sensor'],
        sections: ['elements', 'campaigns', 'observations', 'project'],
    },
    executive: {
        name: 'Executivo',
        families: ['plume', 'remediation', 'building', 'boundary', 'tank'],
        sections: ['elements', 'project'],
    },
    complete: {
        name: 'Completo',
        families: '*',
        sections: '*',
    },
};

/**
 * Register a broadcast preset from a library manifest (declarative JSON only).
 * @param {{ id: string, name: string, families: string[]|'*', sections: string[]|'*' }} preset
 * @param {string} preset
 * @returns {string|null} chave registrada ou null se inválido
 */
export function registerBroadcastPreset(preset: any, libraryId: any) {
    if (!preset || typeof preset.id !== 'string' || !preset.id.trim()) return null;
    if (typeof preset.name !== 'string' || !preset.name.trim()) return null;
    const validList = (v: any) => v === '*' || (Array.isArray(v) && v.every((s: any) => typeof s === 'string'));
    if (!validList(preset.families) || !validList(preset.sections)) return null;
    const key = `lib:${String(libraryId)}:${preset.id.trim()}`;
    PRESETS[key] = Object.freeze({
        name: preset.name.trim(),
        families: preset.families,
        sections: preset.sections,
        libraryId: String(libraryId),
    });
    return key;
}

/** Remove um preset registrado por library (built-ins não removíveis). */
export function unregisterBroadcastPreset(key: any) {
    const entry = PRESETS[key];
    if (!entry || !entry.libraryId) return false;
    delete PRESETS[key];
    return true;
}
