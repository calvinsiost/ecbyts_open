// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/utils/startup/featureFlagsRuntime.js
// Runtime flag override bridge.
//
// CONFIG.FEATURES defaults are the source of truth for disk-shipped
// builds. This module lets admins/users flip flags at runtime WITHOUT
// editing CONFIG - honoring ADR-INTEGRITY-001 §Publish Gate and the
// cheap test in tests/launchpad-v3-decisions.test.mjs that blocks
// hardcode of LAUNCHPAD_V3_* to true.
//
// Sources (applied in order, last wins):
//   1. Query params (per-session, shareable links)
//      ?v3=hero      → LAUNCHPAD_V3_HERO=true
//      ?v3=feed      → LAUNCHPAD_V3_FEED=true
//      ?v3=panels    → LAUNCHPAD_V3_PANELS=true
//      ?v3=all       → HERO + FEED + PANELS = true
//      ?v3=aggregate → LAUNCHPAD_V3_INTEGRITY_AGGREGATE=true (gate!)
//   2. localStorage key 'ecbyts-feature-flags' (JSON object)
//   3. Future: admin-panel remote fetch (ecbyts_admin API)

import { resolveFlag, parseBooleanFlag } from '../helpers/_featureFlagResolverPure.js';
import { SUPABASE_URL } from '../../supabase-config.js';
import type { FlagVerdict } from '../helpers/_featureFlagResolverPure.js';

const STORAGE_KEY = 'ecbyts-feature-flags';
const MANAGED_FLAGS = [
    'LAUNCHPAD_V3_HERO',
    'LAUNCHPAD_V3_FEED',
    'LAUNCHPAD_V3_PANELS',
    'LAUNCHPAD_V3_PERSONAS',
    'LAUNCHPAD_V3_INTEGRITY_AGGREGATE',
    // TAB-MODEL-SWITCH-001: o config promete "Enable with runtime
    // feature-flag override" mas a flag não era gerenciada — rollout
    // via localStorage agora funciona sem rebuild (claude - executor
    // 2026-06-11, validação DoD da spec).
    'TAB_MODEL_SWITCH',
    // FILE-DROP-INTENT-001: rollback hatch operável em runtime — desligar o
    // dialog de intenção de drop sem rebuild (localStorage/query param).
    'FILE_DROP_INTENT',
    // PIPELINE-PACK-CUSTOMIZATION-WORKBENCH: rollback hatch do Workbench novo
    // dentro do editor de Pipelines, gerenciavel sem rebuild.
    'PIPELINE_PACK_WORKBENCH',
    // HUD-CARDS-REDESIGN-2026-06-10#2: config.ts:129 prometia "rollback hatch"
    // (initHudCardTooltips() vira no-op com HUD_TOOLTIPS=false) mas a flag não
    // era gerenciada — o toggle OFF exigia rebuild. Agora rollback opera em
    // runtime via localStorage 'ecbyts-feature-flags' (claude-omni 2026-07-17;
    // teste dos 2 lados: tests/e2e/hud-tooltips-flag-rollback.spec.ts).
    'HUD_TOOLTIPS',
    // EARLY-ADOPTERS-RELEASE-001: interfaces que podem ser pausadas pela
    // central de liberacao sem reconstruir o app. O controle remoto e somente
    // de apresentacao/rollout; permissoes de dados continuam no servidor.
    'BALANCE_BADGE',
    'MARKETPLACE_OWNER_VERIFY',
    'ENABLE_LMS_MODULE',
    'LMS_PPTX_IMPORT',
    'COURSE_AUTHORING',
    'GAC_DD38_NORMATIVE_COVERAGE',
    'GHG_INVENTORY_REPORT',
    'COMMUNITY_ENRICHMENT',
    'ERP_DRE',
    'SCENARIOS',
    'TRL_MATURITY',
    'MRV_VIEW',
    'BROADCAST_SYNC',
];

/**
 * Apply runtime overrides to CONFIG.FEATURES.
 * Called very early in boot (before UI renders).
 *
 * @param config - CONFIG object from ../../config.js
 * @returns list of flags that were flipped
 */
export function applyFeatureFlagOverrides(config: Record<string, any>): string[] {
    if (!config?.FEATURES) return [];
    const flipped: string[] = [];

    // 1. Query params
    try {
        const params = new URLSearchParams(window.location.search);
        const v3 = params.get('v3');
        if (v3) {
            const tokens = v3.split(',').map((t) => t.trim().toLowerCase());
            const enable = (flag: any) => {
                if (config.FEATURES[flag] !== true) {
                    config.FEATURES[flag] = true;
                    flipped.push(`${flag} (qs)`);
                }
            };
            for (const tok of tokens) {
                if (tok === 'hero') enable('LAUNCHPAD_V3_HERO');
                else if (tok === 'feed') enable('LAUNCHPAD_V3_FEED');
                else if (tok === 'panels') enable('LAUNCHPAD_V3_PANELS');
                else if (tok === 'personas') enable('LAUNCHPAD_V3_PERSONAS');
                else if (tok === 'aggregate') enable('LAUNCHPAD_V3_INTEGRITY_AGGREGATE');
                else if (tok === 'all') {
                    enable('LAUNCHPAD_V3_HERO');
                    enable('LAUNCHPAD_V3_FEED');
                    enable('LAUNCHPAD_V3_PANELS');
                }
            }
        }
    } catch (e) {
        console.debug('[featureFlagsRuntime] qs parse failed:', (e as any)?.message);
    }

    // 2. localStorage
    try {
        const raw = localStorage.getItem(STORAGE_KEY) || '';
        if (raw) {
            const parsed: Record<string, any> = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                for (const flag of MANAGED_FLAGS) {
                    if (typeof parsed[flag] === 'boolean' && config.FEATURES[flag] !== parsed[flag]) {
                        config.FEATURES[flag] = parsed[flag];
                        flipped.push(`${flag} (ls=${parsed[flag]})`);
                    }
                }
            }
        }
    } catch (e) {
        console.debug('[featureFlagsRuntime] localStorage parse failed:', (e as any)?.message);
    }

    if (flipped.length > 0) {
        console.info('[featureFlagsRuntime] overrides applied:', flipped.join(', '));
    }
    return flipped;
}

/**
 * Get current managed flags snapshot (for debugging + telemetry).
 */
export function getManagedFlagsSnapshot(config: any): Record<string, boolean> {
    const snap: Record<string, boolean> = {};
    if (!config?.FEATURES) return snap;
    for (const flag of MANAGED_FLAGS) {
        snap[flag] = config.FEATURES[flag] === true;
    }
    return snap;
}

/**
 * Resolve a managed flag with full precedence trace via _featureFlagResolverPure.
 * Wire claude - executor 2026-06-05 batch 10 — diagnostic capability sem
 * alterar comportamento existente de applyFeatureFlagOverrides.
 *
 * Útil para debugging: mostra qual source decidiu o valor + por que outros
 * sources foram rejeitados.
 *
 * @param flagName - Nome do flag (deve estar em MANAGED_FLAGS para validação)
 * @param config - CONFIG object
 * @returns FlagVerdict com value, source ('query_param'|'local_storage'|'remote_admin'|'static_default'|'fallback'), trace
 */
export function resolveManagedFlagWithTrace(flagName: string, config: any): FlagVerdict<boolean> {
    const isManaged = MANAGED_FLAGS.includes(flagName);
    let queryParamValue: string | null = null;
    let localStorageValue: string | null = null;
    try {
        const params = new URLSearchParams(window.location.search);
        const v3 = params.get('v3');
        if (v3 && isManaged) {
            const tokens = v3.split(',').map((t) => t.trim().toLowerCase());
            const wantsHero = tokens.includes('hero') || tokens.includes('all');
            const wantsFeed = tokens.includes('feed') || tokens.includes('all');
            const wantsPanels = tokens.includes('panels') || tokens.includes('all');
            const wantsPersonas = tokens.includes('personas');
            const wantsAggregate = tokens.includes('aggregate');
            if (flagName === 'LAUNCHPAD_V3_HERO' && wantsHero) queryParamValue = 'true';
            else if (flagName === 'LAUNCHPAD_V3_FEED' && wantsFeed) queryParamValue = 'true';
            else if (flagName === 'LAUNCHPAD_V3_PANELS' && wantsPanels) queryParamValue = 'true';
            else if (flagName === 'LAUNCHPAD_V3_PERSONAS' && wantsPersonas) queryParamValue = 'true';
            else if (flagName === 'LAUNCHPAD_V3_INTEGRITY_AGGREGATE' && wantsAggregate) queryParamValue = 'true';
        }
    } catch (e) {
        console.debug('[featureFlagsRuntime:resolveManagedFlagWithTrace:qs]', (e as any)?.message || e);
    }
    try {
        const raw = localStorage.getItem(STORAGE_KEY) || '';
        if (raw && isManaged) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && typeof parsed[flagName] === 'boolean') {
                localStorageValue = parsed[flagName] ? 'true' : 'false';
            }
        }
    } catch (e) {
        console.debug('[featureFlagsRuntime:resolveManagedFlagWithTrace:ls]', (e as any)?.message || e);
    }
    const staticDefault = !!config?.FEATURES?.[flagName];
    return resolveFlag<boolean>({
        flagName,
        queryParamValue,
        localStorageValue,
        remoteAdminValue: null,
        staticDefault,
        parse: parseBooleanFlag,
    });
}

const REMOTE_CACHE_KEY = 'ecbyts-feature-flags-remote-cache';
const REMOTE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function _canonicalRemoteCacheTarget(runtimeFlagsUrl: string): { sourceUrl: string; sourceOrigin: string } {
    const parsed = new URL(runtimeFlagsUrl);
    return { sourceUrl: parsed.href, sourceOrigin: parsed.origin };
}

type RuntimeFlagsUrlSource = 'local_storage' | 'shipped_config';

function _isLoopbackHostname(hostname: string): boolean {
    const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return (
        normalized === 'localhost' ||
        normalized === '::1' ||
        normalized === '0:0:0:0:0:0:0:1' ||
        /^127(?:\.\d{1,3}){3}$/.test(normalized)
    );
}

function _authorizedStagingHosts(config: any): Set<string> {
    const configured = Array.isArray(config?.RUNTIME_FLAGS_ALLOWED_APP_HOSTS)
        ? config.RUNTIME_FLAGS_ALLOWED_APP_HOSTS
        : [];
    return new Set(
        configured
            .filter((hostname: unknown): hostname is string => typeof hostname === 'string')
            .map((hostname: string) => hostname.trim().toLowerCase())
            .filter(Boolean),
    );
}

/**
 * Custom runtime-flags endpoints are deliberately narrower than generic URL
 * validation. A browser-persisted override is accepted only while the app is
 * running on loopback or on an exact staging hostname shipped by config.
 * Shipped config is trusted in production, but still has to use HTTPS.
 */
export function validateRuntimeFlagsUrl(
    value: unknown,
    options: {
        source: RuntimeFlagsUrlSource;
        appHostname?: string;
        allowedStagingHosts?: Iterable<string>;
        legacyAdminBase?: boolean;
    },
): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;

    let parsed: URL;
    try {
        parsed = new URL(value.trim());
    } catch {
        return null;
    }

    const appHostname = String(options.appHostname || '').toLowerCase();
    const appIsLoopback = _isLoopbackHostname(appHostname);
    const targetIsLoopback = _isLoopbackHostname(parsed.hostname);
    const allowedStagingHosts = new Set(
        Array.from(options.allowedStagingHosts || [], (hostname) => String(hostname).trim().toLowerCase()).filter(
            Boolean,
        ),
    );

    if (options.source === 'local_storage' && !appIsLoopback && !allowedStagingHosts.has(appHostname)) {
        return null;
    }
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && appIsLoopback && targetIsLoopback)) {
        return null;
    }

    const normalized = parsed.href.replace(/\/$/, '');
    return options.legacyAdminBase ? `${normalized}/api/runtime-flags/public` : normalized;
}

function _deriveRuntimeFlagsUrl(config: any): string | null {
    const appHostname = typeof window !== 'undefined' ? window.location?.hostname || '' : '';
    const allowedStagingHosts = _authorizedStagingHosts(config);
    try {
        const directUrl = validateRuntimeFlagsUrl(localStorage.getItem('ecbyts-runtime-flags-url'), {
            source: 'local_storage',
            appHostname,
            allowedStagingHosts,
        });
        if (directUrl) return directUrl;

        // Compatibilidade com a chave local usada antes da Edge Function.
        const legacyAdminUrl = validateRuntimeFlagsUrl(localStorage.getItem('ecbyts-admin-url'), {
            source: 'local_storage',
            appHostname,
            allowedStagingHosts,
            legacyAdminBase: true,
        });
        if (legacyAdminUrl) return legacyAdminUrl;
    } catch (e) {
        console.debug('[feature-flags-runtime] release URL read:', (e as any)?.message || e);
    }

    // Configuracao explicita permite homologacao sem alterar o destino padrao.
    // String vazia e um opt-out util em testes locais.
    if (config?.RUNTIME_FLAGS_URL === '') return null;
    const configuredUrl = validateRuntimeFlagsUrl(config?.RUNTIME_FLAGS_URL, {
        source: 'shipped_config',
        appHostname,
        allowedStagingHosts,
    });
    if (configuredUrl) return configuredUrl;

    const legacyConfiguredUrl = validateRuntimeFlagsUrl(config?.ADMIN_URL, {
        source: 'shipped_config',
        appHostname,
        allowedStagingHosts,
        legacyAdminBase: true,
    });
    if (legacyConfiguredUrl) return legacyConfiguredUrl;

    // ecbyts.com e servido como site estatico. A Edge Function e o caminho
    // publico neutro para Bluehost e Vercel sem expor o ecbytsadmin local.
    const isEcbytsPublicHost = appHostname === 'ecbyts.com' || appHostname === 'www.ecbyts.com';
    if (isEcbytsPublicHost && typeof SUPABASE_URL === 'string' && /^https:\/\//.test(SUPABASE_URL)) {
        return `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/runtime-feature-flags`;
    }
    return null;
}

/**
 * Fetch release flags from the public Edge Function or an explicit test URL.
 * Non-blocking: if admin unreachable, returns cached value (if fresh)
 * or null (no override). Never throws.
 *
 * @param config
 * @param options
 * @returns list of flipped flags
 */
export async function applyRemoteFeatureFlagOverrides(
    config: Record<string, any>,
    options: { timeoutMs?: number } = {},
): Promise<string[]> {
    if (!config?.FEATURES) return [];
    const runtimeFlagsUrl = _deriveRuntimeFlagsUrl(config);
    if (!runtimeFlagsUrl) return [];
    const cacheTarget = _canonicalRemoteCacheTarget(runtimeFlagsUrl);

    // A cached response belongs exclusively to the endpoint that produced it.
    // Invalidate before fetching when an operator switches destinations so an
    // unavailable B can never inherit flags previously returned by A.
    try {
        const raw = localStorage.getItem(REMOTE_CACHE_KEY) || '';
        if (raw) {
            const cached = JSON.parse(raw);
            if (cached?.sourceUrl !== cacheTarget.sourceUrl || cached?.sourceOrigin !== cacheTarget.sourceOrigin) {
                localStorage.removeItem(REMOTE_CACHE_KEY);
            }
        }
    } catch (e) {
        try {
            localStorage.removeItem(REMOTE_CACHE_KEY);
        } catch (removeError) {
            console.debug(
                '[feature-flags-runtime] remote cache target removal:',
                (removeError as any)?.message || removeError,
            );
        }
        console.debug('[feature-flags-runtime] remote cache target validation:', (e as any)?.message || e);
    }

    // 1. Try fresh fetch with short timeout
    let payload = null;
    try {
        const controller = new AbortController();
        const requestedTimeout = Number(options.timeoutMs);
        const timeoutMs = Number.isFinite(requestedTimeout) ? Math.max(100, Math.min(3000, requestedTimeout)) : 3000;
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let res: Response;
        try {
            res = await fetch(runtimeFlagsUrl, {
                method: 'GET',
                credentials: 'omit',
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }
        if (res.ok) {
            payload = await res.json();
            try {
                localStorage.setItem(
                    REMOTE_CACHE_KEY,
                    JSON.stringify({ payload, fetchedAt: Date.now(), ...cacheTarget }),
                );
            } catch (e) {
                console.debug('[feature-flags-runtime] remote cache write:', (e as any)?.message || e);
            }
        }
    } catch (e) {
        console.debug('[featureFlagsRuntime] remote fetch failed:', (e as any)?.message || e);
    }

    // 2. Fallback to cache if fresh fetch failed
    if (!payload) {
        try {
            const raw = localStorage.getItem(REMOTE_CACHE_KEY) || '';
            if (raw) {
                const cached = JSON.parse(raw);
                if (
                    cached?.sourceUrl === cacheTarget.sourceUrl &&
                    cached?.sourceOrigin === cacheTarget.sourceOrigin &&
                    Date.now() - (cached.fetchedAt || 0) < REMOTE_CACHE_TTL_MS
                ) {
                    payload = cached.payload;
                }
            }
        } catch (e) {
            console.debug('[feature-flags-runtime] remote cache read:', (e as any)?.message || e);
        }
    }

    if (!payload?.flags || typeof payload.flags !== 'object') return [];

    const flagsMap: Record<string, any> = payload.flags;
    const flipped: string[] = [];
    for (const flag of MANAGED_FLAGS) {
        const entry = flagsMap[flag];
        if (!entry || typeof entry !== 'object' || typeof entry.enabled !== 'boolean') continue;

        // A valid remote entry is authoritative. Users outside an enabled
        // rollout must receive `false`; otherwise a disk default of `true`
        // would bypass 0% and partial rollouts.
        const rawRolloutPct = Number.isFinite(entry.rolloutPct) ? entry.rolloutPct : 100;
        const rolloutPct = Math.max(0, Math.min(100, rawRolloutPct));
        const remoteValue = entry.enabled === true && _isInRolloutBucket(flag, rolloutPct);
        if (config.FEATURES[flag] !== remoteValue) {
            config.FEATURES[flag] = remoteValue;
            if (remoteValue) flipped.push(`${flag} (remote)`);
            else if (entry.enabled === false) flipped.push(`${flag} (remote=false)`);
            else flipped.push(`${flag} (remote=false, rollout=${rolloutPct}%)`);
        }
    }
    if (flipped.length > 0) {
        console.info('[featureFlagsRuntime] remote overrides applied:', flipped.join(', '));
    }
    return flipped;
}

/**
 * Deterministic rollout bucket: stable per browser session via
 * localStorage 'ecbyts-rollout-seed' (0-99). If within [0, rolloutPct),
 * user is in rollout.
 */
function _isInRolloutBucket(flag: any, rolloutPct: any): boolean {
    try {
        let seed = localStorage.getItem('ecbyts-rollout-seed');
        if (seed == null) {
            seed = String(Math.floor(Math.random() * 100));
            localStorage.setItem('ecbyts-rollout-seed', seed);
        }
        const n = parseInt(seed, 10);
        if (!Number.isFinite(n)) return false;
        // Hash flag name into offset so different flags don't all hit
        // the same user (simple FNV-1a-ish over chars)
        let h = 2166136261;
        for (let i = 0; i < flag.length; i++) {
            h = ((h ^ flag.charCodeAt(i)) * 16777619) >>> 0;
        }
        const bucket = (n + (h % 100)) % 100;
        return bucket < rolloutPct;
    } catch {
        return false;
    }
}
