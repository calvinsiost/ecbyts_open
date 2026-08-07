// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/**
 * Environment Detector - Item 9.60
 *
 * Pure detection of runtime environment (production / homologation /
 * development / preview) based on hostname, with fallback chain and
 * override via URL parameter. UI integration (title bar badge) is a
 * thin view over detectEnvironment().
 *
 * Reference: docs/IMPLEMENTATION_ROADMAP.md §9.60
 */

// ============================================================================
// Environment profiles - single source of truth
// ============================================================================

export const ENVIRONMENTS = Object.freeze({
    production: Object.freeze({
        name: 'production',
        label: null, // No badge in prod
        color: null,
        showIndicator: false,
        warning: null,
    }),
    homologation: Object.freeze({
        name: 'homologation',
        label: 'HOMOLOGAÇÃO',
        color: '#4A90D9',
        showIndicator: true,
        warning: 'Ambiente de testes — dados podem ser perdidos',
    }),
    development: Object.freeze({
        name: 'development',
        label: 'DEV',
        color: '#F5A623',
        showIndicator: true,
        warning: 'Ambiente local de desenvolvimento',
    }),
    preview: Object.freeze({
        name: 'preview',
        label: 'PREVIEW',
        color: '#9B59B6',
        showIndicator: true,
        warning: 'Preview deployment — não-produção',
    }),
    unknown: Object.freeze({
        name: 'unknown',
        label: 'UNKNOWN',
        color: '#95A5A6',
        showIndicator: true,
        warning: 'Ambiente não identificado',
    }),
});

// Hostname → environment name mapping
const HOSTNAME_MAP = Object.freeze({
    'ecbt.ai': 'production',
    'www.ecbt.ai': 'production',
    'ecbyts.com': 'homologation',
    'www.ecbyts.com': 'homologation',
    localhost: 'development',
    '127.0.0.1': 'development',
    '0.0.0.0': 'development',
});

// Pattern matchers for dynamic hostnames (Vercel preview, etc.)
const HOSTNAME_PATTERNS = Object.freeze([
    { pattern: /\.vercel\.app$/, env: 'preview' },
    { pattern: /^ecbyts-.*\.vercel\.app$/, env: 'preview' },
    { pattern: /\.netlify\.app$/, env: 'preview' },
    { pattern: /^localhost:/, env: 'development' },
]);

// Valid override values from URL param ?env=
const VALID_OVERRIDES = Object.freeze(new Set(['production', 'homologation', 'development', 'preview']));

// ============================================================================
// Detection
// ============================================================================

/**
 * Detect current environment from a hostname (pure, no window access).
 *
 * @param hostname - window.location.hostname equivalent
 * @param options
 * @returns Frozen environment profile from ENVIRONMENTS
 */
export function detectEnvironment(
    hostname: string,
    options: { override?: string | null } = {},
): Readonly<Record<string, any>> {
    const envs: Readonly<Record<string, any>> = ENVIRONMENTS;
    const hostMap: Readonly<Record<string, string>> = HOSTNAME_MAP;

    // 1. URL override (highest priority, for manual debug)
    if (options.override) {
        const override = String(options.override).toLowerCase().trim();
        if (VALID_OVERRIDES.has(override)) {
            return envs[override];
        }
    }

    // 2. Hostname exact match
    if (typeof hostname === 'string' && hostname.length > 0) {
        const normalized = hostname.toLowerCase().split(':')[0]; // strip port
        const direct = normalized !== undefined ? hostMap[normalized] : undefined;
        if (direct && envs[direct]) {
            return envs[direct];
        }

        // 3. Pattern match (Vercel preview, Netlify, etc.)
        for (const { pattern, env } of HOSTNAME_PATTERNS) {
            if (pattern.test(hostname.toLowerCase())) {
                return envs[env];
            }
        }
    }

    return ENVIRONMENTS.unknown;
}

/**
 * Detect environment from window.location (browser-only convenience wrapper).
 * Returns ENVIRONMENTS.unknown if window is not available (Node/tests).
 */
export function detectEnvironmentFromWindow(): Readonly<Record<string, any>> {
    if (typeof window === 'undefined' || !window.location) {
        return ENVIRONMENTS.unknown;
    }
    const hostname = window.location.hostname;
    let override: string | null = null;
    try {
        const params = new URLSearchParams(window.location.search);
        override = params.get('env');
    } catch (e: any) {
        console.debug('[envDetector] urlParams:', e?.message || e);
        /* invalid URL params */
    }
    return detectEnvironment(hostname, { override });
}

/**
 * Check if a given environment is "safe for destructive actions" - i.e.
 * production. Used as a guard in delete/rollback/reset flows to require
 * extra confirmation in production.
 *
 * @param env - Environment profile from detectEnvironment
 * @returns true if production
 */
export function isProduction(env: { name?: string } | null | undefined): boolean {
    return env?.name === 'production';
}

/**
 * Check if environment is non-production (homolog, dev, preview, unknown).
 * Used to enable dev-only features, debug panels, etc.
 *
 * @param env
 */
export function isNonProduction(env: { name?: string } | null | undefined): boolean {
    return !isProduction(env);
}
