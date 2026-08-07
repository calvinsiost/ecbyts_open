// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   RADAR LIBRARY PRESETS — MOD-LIB-MIG-001 consumers wire (radar)
   Calvin 2026-06-11 "seguir" — 4º e último consumer do quadrante.

   Adapta broadcast presets declarados por library modules (registry
   S4, manifests B1-validados) em "pontos de partida" para o form de
   criação de Radar Profile. O preset pré-preenche name/description;
   o usuário revisa RBAC/redaction/billing antes de salvar — preset
   NUNCA cria profile sozinho (criação continua passando pelo flow
   Supabase createProfile com validação completa).
   ================================================================ */

import { getRegisteredBroadcastPresets } from '../libraries/registry.js';

export interface LibraryBroadcastPreset {
    id: string;
    name: string;
    visibility: 'public' | 'restricted';
    description: string;
}

/**
 * List library-declared broadcast presets adapted for the profile
 * creation form. Defensivo: registry indisponível → lista vazia.
 */
export function listLibraryBroadcastPresets(): ReadonlyArray<LibraryBroadcastPreset> {
    try {
        const declared = getRegisteredBroadcastPresets();
        const out: LibraryBroadcastPreset[] = [];
        for (const p of declared) {
            if (typeof p.id !== 'string' || typeof p.label !== 'string') continue;
            const visibility: 'public' | 'restricted' = p.visibility === 'public' ? 'public' : 'restricted';
            out.push(
                Object.freeze({
                    id: String(p.id),
                    name: String(p.label),
                    visibility,
                    description:
                        visibility === 'public'
                            ? 'Preset da Library — divulgação pública (revisar redação antes de salvar)'
                            : 'Preset da Library — acesso restrito a stakeholders autorizados',
                }),
            );
        }
        return Object.freeze(out);
    } catch (e: any) {
        console.debug('[radar:libraryPresets]', e?.message || e);
        return Object.freeze([]);
    }
}

/**
 * Resolve one preset by id (or null).
 */
export function getLibraryBroadcastPresetById(id: string): LibraryBroadcastPreset | null {
    return listLibraryBroadcastPresets().find((p) => p.id === id) || null;
}
