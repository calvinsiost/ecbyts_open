// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/**
 * EIS Drift Check — cloud bridge for the admin alert dashboard.
 *
 * Lê alertas de drift e envia ações de resolução para a Edge Function
 * `eis-drift-monitor` no Supabase. A rotina periódica de cron (server-side)
 * NÃO vive aqui — este módulo é o cliente offline-resiliente: se o backend
 * estiver indisponível, retorna estado vazio + flag `offline` para a UI
 * exibir badge "indisponível" (regra Offline-First do CLAUDE.md).
 */

import { createLogger } from '../helpers/logger.js';
import { getSupabaseClient, getAccessToken } from '../auth/session.js';

const log = createLogger('eisDriftCloud');

/** Edge Function slug (server-side cron + ingest endpoint). */
const DRIFT_FUNCTION = 'eis-drift-monitor';

export interface DriftAlert {
    id: string;
    severity: string;
    parameter_id: string;
    delta_value: number;
    runtime_payload: unknown;
    sql_payload: unknown;
    status: string;
    created_at: string;
}

export interface FetchDriftAlertsResult {
    offline: boolean;
    alerts: DriftAlert[];
}

export interface PostDriftResolutionResult {
    ok: boolean;
    offline?: boolean;
    error?: string;
}

/**
 * Fetch active drift alerts from the backend.
 */
export async function fetchDriftAlerts(): Promise<FetchDriftAlertsResult> {
    const client: any = getSupabaseClient?.();
    if (!client) {
        log.debug('no supabase client — offline');
        return { offline: true, alerts: [] };
    }
    try {
        const { data, error } = await client
            .from('eis_drift_alerts')
            .select('id,severity,parameter_id,delta_value,runtime_payload,sql_payload,status,created_at')
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(200);
        if (error) {
            log.warn('fetchDriftAlerts query failed:', error?.message || error);
            return { offline: true, alerts: [] };
        }
        return { offline: false, alerts: Array.isArray(data) ? data : [] };
    } catch (e: any) {
        log.warn('fetchDriftAlerts threw:', e?.message || e);
        return { offline: true, alerts: [] };
    }
}

function _authHeader(token: string): { Authorization: string } | undefined {
    return token ? { Authorization: `Bearer ${token}` } : undefined;
}

function _errorLogDetail(error: unknown): unknown {
    const message = (error as any)?.message;
    return message || error;
}

function _errorMessage(error: unknown, fallback: string): string {
    const message = (error as any)?.message;
    return message || fallback;
}

/**
 * Resolve a drift alert by posting an action to the Edge Function.
 */
export async function postDriftResolution(
    alertId: string,
    action: 'RECONCILE' | 'IGNORE' | 'INVESTIGATE',
): Promise<PostDriftResolutionResult> {
    const client: any = getSupabaseClient?.();
    if (!client || !alertId) {
        return { ok: false, offline: !client, error: 'offline_or_missing_id' };
    }
    try {
        const token = getAccessToken?.() || '';
        const { data, error } = await client.functions.invoke(DRIFT_FUNCTION, {
            body: { alertId, action },
            headers: _authHeader(token),
        });
        if (error) {
            log.warn('postDriftResolution failed:', _errorLogDetail(error));
            return { ok: false, error: _errorMessage(error, 'edge_invoke_failed') };
        }
        log.debug('drift resolution posted', { alertId, action, data });
        return { ok: true };
    } catch (e: any) {
        log.warn('postDriftResolution threw:', _errorLogDetail(e));
        return { ok: false, error: _errorMessage(e, 'exception') };
    }
}
