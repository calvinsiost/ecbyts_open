// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   AI REPORT PUBLISH CLIENT — F2.3 wire stub→RPC bridge

   Wraps the api.publish_ai_report_template facade RPC (autorada em F2.1,
   migration 20260531213000_ai_report_templates_marketplace_f2.sql).

   NÃO ATIVO ainda — aguarda migration deploy via apply-supabase-migration-pg.mjs.
   Até lá, callers podem usar callRpcPublishTemplate() que retorna error
   gracioso "backend não disponível" sem throw.

   Front-first compat: o modal handleAIReportPublishDemo continua usando
   stub local. Quando migration estiver deployada, mudar de demo handler
   para callRpcPublishTemplate via wire em F2.3 step 2 (modal real, não-demo).
   ================================================================ */

import {
    type PublishInput,
    validatePublishInput,
} from './_aiReportPublishPure.js';

/**
 * Lazy Supabase client accessor. Avoids static import of session.ts
 * (which has CDN deps that break Node tests). Caller can inject via opts.
 */
async function _defaultSupabase(): Promise<any> {
    try {
        const mod: any = await import('../../utils/auth/session.js');
        return typeof mod.getSupabaseClient === 'function' ? mod.getSupabaseClient() : null;
    } catch {
        return null;
    }
}

export interface RpcCallOptions {
    /** Override Supabase client (for tests / dependency injection). */
    supabaseClient?: any;
}

export interface PublishRpcResult {
    success: boolean;
    marketplace_id?: string;
    status?: 'pending_review' | 'approved' | 'rejected' | 'archived';
    corr_id?: string;
    error?: string;
    errorCode?: string;
}

function _buildPublishPayload(input: PublishInput): Record<string, unknown> {
    return {
        p_source_template_id: input.template.id,
        p_title: input.template.name,
        p_description: input.template.description || '',
        p_body_json: {
            systemPrompt: input.template.systemPrompt,
            userPromptTemplate: input.template.userPromptTemplate,
            requiredContext: input.template.requiredContext || [],
            defaultTone: input.template.defaultTone || 'Technical',
            sourceTemplateId: input.template.id,
        },
        p_price_ecbt: input.priceEcbt,
        p_royalty_pct: input.royaltyPct,
        p_license: input.license || 'agpl-3.0',
    };
}

function _handlePublishRpcError(error: unknown): PublishRpcResult {
    return {
        success: false,
        error: (error && typeof (error as { message?: string }).message === 'string')
            ? (error as { message: string }).message
            : String(error),
        errorCode: (error && typeof (error as { code?: string }).code === 'string')
            ? (error as { code: string }).code
            : 'RPC_ERROR',
    };
}

function _handlePublishRpcResponse(data: unknown): PublishRpcResult {
    if (data && typeof data === 'object') {
        const d = data as { success?: unknown; marketplace_id?: string; status?: PublishRpcResult['status']; corr_id?: string };
        return {
            success: !!d.success,
            ...(d.marketplace_id !== undefined ? { marketplace_id: d.marketplace_id } : {}),
            ...(d.status !== undefined ? { status: d.status } : {}),
            ...(d.corr_id !== undefined ? { corr_id: d.corr_id } : {}),
        };
    }
    return { success: false, error: 'Unexpected RPC response shape', errorCode: 'BAD_RESPONSE' };
}

function _handleNetworkError(e: unknown): PublishRpcResult {
    const message = e && typeof (e as { message?: string }).message === 'string'
        ? (e as { message: string }).message
        : String(e);
    return { success: false, error: message, errorCode: 'NETWORK_ERROR' };
}

/**
 * Call api.publish_ai_report_template RPC. Pre-validates input via
 * pure validator (defesa em profundidade — server roda mesma validação).
 *
 * Returns structured result instead of throwing:
 *   { success: true, marketplace_id, status, corr_id }
 *   OR
 *   { success: false, error, errorCode }
 *
 * Stub-friendly: se getSupabaseClient() retorna null (offline/test mode),
 * returns { success: false, error: 'supabase-unavailable' }.
 */
export async function callRpcPublishTemplate(
    input: PublishInput,
    opts: RpcCallOptions = {}
): Promise<PublishRpcResult> {
    // Pre-validate via pure (same rules as server-side)
    const validation = validatePublishInput(input);
    if (!validation.valid) {
        return {
            success: false,
            error: `Client validation failed: ${validation.errors[0]}`,
            errorCode: 'CLIENT_VALIDATION_FAILED',
        };
    }

    const supabase = opts.supabaseClient ?? (await _defaultSupabase());
    if (!supabase || typeof supabase.rpc !== 'function') {
        return {
            success: false,
            error: 'Supabase client unavailable (offline or not initialized)',
            errorCode: 'SUPABASE_UNAVAILABLE',
        };
    }

    try {
        const { data, error } = await supabase
            .schema('api')
            .rpc('publish_ai_report_template', _buildPublishPayload(input));

        if (error) return _handlePublishRpcError(error);
        return _handlePublishRpcResponse(data);
    } catch (e: unknown) {
        return _handleNetworkError(e);
    }
}

/**
 * Approve template (admin-only RPC).
 */
export async function callRpcApproveTemplate(
    marketplaceId: string,
    opts: RpcCallOptions = {}
): Promise<PublishRpcResult> {
    const supabase = opts.supabaseClient ?? (await _defaultSupabase());
    if (!supabase || typeof supabase.rpc !== 'function') {
        return { success: false, error: 'Supabase unavailable', errorCode: 'SUPABASE_UNAVAILABLE' };
    }
    try {
        const { data, error } = await supabase
            .schema('api')
            .rpc('approve_ai_report_template', { p_marketplace_id: marketplaceId });
        if (error) return { success: false, error: error.message, errorCode: (error as any).code || 'RPC_ERROR' };
        return data?.success
            ? { success: true, marketplace_id: data.marketplace_id, status: data.status, corr_id: data.corr_id }
            : { success: false, error: 'Approve failed', errorCode: 'BAD_RESPONSE' };
    } catch (e: any) {
        return { success: false, error: e?.message || String(e), errorCode: 'NETWORK_ERROR' };
    }
}

/**
 * Reject template (admin-only RPC, reason ≥10 chars).
 */
export async function callRpcRejectTemplate(
    marketplaceId: string,
    reason: string,
    opts: RpcCallOptions = {}
): Promise<PublishRpcResult> {
    if (typeof reason !== 'string' || reason.trim().length < 10) {
        return {
            success: false,
            error: 'Reason must be ≥10 characters',
            errorCode: 'CLIENT_VALIDATION_FAILED',
        };
    }
    const supabase = opts.supabaseClient ?? (await _defaultSupabase());
    if (!supabase || typeof supabase.rpc !== 'function') {
        return { success: false, error: 'Supabase unavailable', errorCode: 'SUPABASE_UNAVAILABLE' };
    }
    try {
        const { data, error } = await supabase
            .schema('api')
            .rpc('reject_ai_report_template', { p_marketplace_id: marketplaceId, p_reason: reason });
        if (error) return { success: false, error: error.message, errorCode: (error as any).code || 'RPC_ERROR' };
        return data?.success
            ? { success: true, marketplace_id: data.marketplace_id, status: data.status, corr_id: data.corr_id }
            : { success: false, error: 'Reject failed', errorCode: 'BAD_RESPONSE' };
    } catch (e: any) {
        return { success: false, error: e?.message || String(e), errorCode: 'NETWORK_ERROR' };
    }
}
