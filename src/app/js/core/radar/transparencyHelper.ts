// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * RADAR TRANSPARENCY HELPER — Calvin diretiva 2026-05-14:
 * "a nota de transparencia no EIS score vira do % da fatia do modelo
 * disponível para todo o público no radar".
 *
 * Carrega slices de um projeto via Supabase + computa o ratio público.
 * Resultado consumido por `EisCalculator.computeTFromObservations(obs, radarTransparency)`.
 */

import { computePublicShareRatio } from './globalDiscovery.js';

/**
 * Lista slices de um projeto/modelo e computa public share ratio.
 *
 * Retorna `null` quando:
 * - Supabase não inicializado (offline / não-autenticado)
 * - Erro de RLS / network
 * - projectId inválido
 *
 * Caller deve tratar null como "sem boost de transparência".
 *
 * @param projectId — uuid do modelo (radar_slices.project_id)
 */
export async function loadRadarTransparencyForProject(
    projectId: string,
): Promise<{ ratio: number; publicCount: number; summaryCount: number; total: number } | null> {
    if (typeof projectId !== 'string' || !projectId) return null;
    try {
        const { getSupabaseClient } = await import('../../utils/auth/session.js');
        const client = getSupabaseClient() as any;
        if (!client) return null;
        const apiClient = typeof client.schema === 'function' ? client.schema('api') : client;

        const { data, error } = await apiClient.rpc('list_radar_slices', {
            p_project_id: projectId,
        });

        if (error) {
            console.debug('[radar:transparency] query error:', error.message || error);
            return null;
        }

        if (!Array.isArray(data) || data.length === 0) {
            return { ratio: 0, publicCount: 0, summaryCount: 0, total: 0 };
        }

        // Inferir tier a partir do redaction (mais permissivo = mais público).
        // Convenção:
        // - sem redaction (null/empty) → 'public'
        // - redaction = { pii: 'mask' } ou { pii: 'redact' } → 'summary' (parcial)
        // - redaction = { hide: true } ou tier explícito → respeita
        const slicesWithTier = data.map((s: any) => {
            if (s.redaction && typeof s.redaction === 'object') {
                if (s.redaction.tier) return { tier: String(s.redaction.tier) };
                if (s.redaction.hide === true) return { tier: 'private' };
                if (s.redaction.pii) return { tier: 'summary' };
            }
            return { tier: 'public' };
        });

        return computePublicShareRatio(slicesWithTier);
    } catch (e) {
        console.debug('[radar:transparency] caught:', (e as any)?.message || e);
        return null;
    }
}
