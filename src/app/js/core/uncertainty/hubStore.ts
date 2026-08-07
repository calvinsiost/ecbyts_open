// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
import { idbGet, idbSet } from '../../utils/storage/idbStore.js';
import { getModelIdSync } from '../io/modelLink.js';
const HUB_NS = 'uncertainty_hub_state_v1';
function _scope() {
    const modelId = getModelIdSync();
    return `${HUB_NS}:${modelId || 'local-model'}`;
}
export async function loadUncertaintyHubState() {
    const stored = await idbGet(_scope());
    if (stored && typeof stored === 'object')
        return stored;
    return {
        policyDraft: {
            workspace_id: null,
            matrix: 'groundwater',
            project_id: null,
            coverage: 0.95,
            k_default: 2,
            monte_carlo_samples: 2000,
        },
        q2qInput: { label: 'medium', runType: 'exploratory' },
        decisionInput: { exceedanceProb: 0.5, runType: 'exploratory' },
        optimizationInput: {
            seed: 123,
            budget: 100,
            candidatesRaw: 'a,0.8,0.3,0.2,40\nb,0.7,0.2,0.3,35\nc,0.4,0.1,0.5,20',
        },
        rules: [
            {
                id: 'warn-1',
                metric: 'exceedanceProb',
                operator: '>=',
                threshold: 0.6,
                severity: 'warn',
                required: true,
            },
            {
                id: 'block-1',
                metric: 'exceedanceProb',
                operator: '>=',
                threshold: 0.8,
                severity: 'block',
                required: true,
            },
        ],
        policyHistory: [],
        lastResults: null,
        ecbt: { key: null, savedAt: null },
    };
}
export async function saveUncertaintyHubState(state: any) {
    const payload = {
        ...(state || {}),
        updatedAt: new Date().toISOString(),
        scope: _scope(),
    };
    return idbSet(_scope(), payload);
}
/**
 * Online path persists only ECBT key reference in Supabase snapshot table.
 * The full uncertainty payload remains local in IDB.
 */
/**
 * UNC-001 P2 - fetch canonical policies from Supabase + register hash.
 * Graceful degrade quando offline, sem auth ou tabela inexistente.
 * Caller deve importar e invocar em hydrateUncertaintyHub.
 *
 * @returns {Promise<{ok:boolean, policies:any[], source:string}>}
 */
export async function fetchAndRegisterSqlPolicies() {
    try {
        const sessionMod = (await import('../../utils/auth/session.js' as string)) as any;
        const getSupabaseClient = sessionMod.getSupabaseClient;
        const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
        if (!client)
            return { ok: false, policies: [], source: 'no-client' };
        const { data, error } = await client
            .from('uncertainty_policies')
            .select('policy_id, workspace_id, project_id, matrix, coverage, k_default, monte_carlo_samples');
        if (error) {
            console.debug('[hubStore] policies fetch error:', error.message);
            return { ok: false, policies: [], source: 'fetch-error' };
        }
        const policies = (Array.isArray(data) ? data : []).map((p: any) => ({
            policy_id: p.policy_id,
            scope: {
                workspace_id: p.workspace_id || null,
                project_id: p.project_id || null,
                matrix: p.matrix || null,
            },
            coverage: Number(p.coverage) || 0.95,
            k_default: Number(p.k_default) || 2,
            monte_carlo_samples: Number(p.monte_carlo_samples) || 2000,
        }));
        // Register canonical hash para habilitar drift detection.
        const { registerSqlPolicies } = await import('./policyTelemetry.js' as string);
        registerSqlPolicies(policies);
        return { ok: true, policies, source: 'supabase' };
    }
    catch (err: any) {
        console.debug('[hubStore] fetchAndRegisterSqlPolicies skipped:', /** @type {any} */ (err)?.message);
        return { ok: false, policies: [], source: 'exception' };
    }
}
/**
 * UNC-001 P2 slice 2 - Matrix-aware Supabase fetcher (Gemini review 2026-04-17).
 *
 * Diferente de `fetchAndRegisterSqlPolicies()`:
 * - Filtra por `matrix` na query (evita over-fetch quando Hub está em uma matriz específica)
 * - Retorna policies no schema v3 (via migratePolicyToV3) com validação
 * - Inclui campo `mapping_version` e `tier` inferidos
 *
 * @param {string} matrix - uma das: groundwater|soil|surface_water|sediment|air|tissue
 * @returns {Promise<{ok:boolean, policies:any[], source:string, skipped:any[]}>}
 */
export async function fetchMatrixAwarePolicies(matrix: any) {
    if (!matrix || typeof matrix !== 'string') {
        return { ok: false, policies: [], source: 'missing_matrix', skipped: [] };
    }
    const validMatrices = ['groundwater', 'soil', 'surface_water', 'sediment', 'air', 'tissue'];
    if (!validMatrices.includes(matrix)) {
        return { ok: false, policies: [], source: 'invalid_matrix', skipped: [] };
    }
    try {
        const sessionMod = (await import('../../utils/auth/session.js' as string)) as any;
        const getSupabaseClient = sessionMod.getSupabaseClient;
        const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
        if (!client)
            return { ok: false, policies: [], source: 'no-client', skipped: [] };
        const { data, error } = await client
            .from('uncertainty_policies')
            .select('policy_id, policy_version, mapping_version, workspace_id, project_id, matrix, coverage, k_default, monte_carlo_samples, mc_variables, q2q_overrides, nd_method, updated_at')
            .eq('matrix', matrix);
        if (error) {
            console.debug('[hubStore] matrix-aware fetch error:', error.message);
            return { ok: false, policies: [], source: 'fetch-error', skipped: [] };
        }
        const { migratePolicyToV3, validatePolicyV3 } = await import('./schemas.js' as string);
        const policies = [];
        const skipped = [];
        for (const raw of Array.isArray(data) ? data : []) {
            const v3 = migratePolicyToV3({
                policy_id: raw.policy_id,
                policy_version: raw.policy_version || '1.0.0',
                mapping_version: raw.mapping_version || raw.policy_version || '1.0.0',
                matrix: raw.matrix,
                mc_variables: Array.isArray(raw.mc_variables) ? raw.mc_variables : undefined,
                q2q_overrides: raw.q2q_overrides && typeof raw.q2q_overrides === 'object' ? raw.q2q_overrides : undefined,
                nd_method: raw.nd_method,
                source: 'supabase',
                supabase_source: {
                    workspace_id: raw.workspace_id || null,
                    project_id: raw.project_id || null,
                    updated_at: raw.updated_at || null,
                },
                variables: {
                    coverage: Number(raw.coverage) || 0.95,
                    k_default: Number(raw.k_default) || 2,
                    monte_carlo_samples: Number(raw.monte_carlo_samples) || 2000,
                },
            });
            const validation = validatePolicyV3(v3);
            if (validation.ok) {
                policies.push(v3);
            }
            else {
                skipped.push({ policy_id: raw.policy_id, reason: validation.reason });
                console.debug('[hubStore] skipping invalid policy:', raw.policy_id, validation.reason);
            }
        }
        return { ok: true, policies, source: 'supabase', skipped };
    }
    catch (err: any) {
        console.debug('[hubStore] fetchMatrixAwarePolicies skipped:', /** @type {any} */ (err)?.message);
        return { ok: false, policies: [], source: 'exception', skipped: [] };
    }
}
export async function syncUncertaintyEcbtKeyOnline(ecbtKey: any) {
    if (!ecbtKey || typeof ecbtKey !== 'string') {
        return { ok: false, reason: 'missing_key' };
    }
    try {
        const { autosaveModelSnapshot } = await import('../../utils/cloud/manager.js' as string);
        const scopeKey = `uncertainty-hub:${getModelIdSync() || 'local-model'}`;
        const snapshot = await autosaveModelSnapshot({
            modelData: {
                schemaVersion: 1,
                source: 'uncertainty-hub-ecbt-key',
                modelId: getModelIdSync() || null,
                uncertaintyHub: {
                    ecbtKey,
                    savedAt: new Date().toISOString(),
                },
            },
            modelId: getModelIdSync() || null,
            scopeKey,
            force: true,
        });
        return { ok: true, snapshotId: snapshot?.id || null };
    }
    catch (err: any) {
        return { ok: false, reason: /** @type {any} */ (err)?.message || 'sync_failed' };
    }
}
