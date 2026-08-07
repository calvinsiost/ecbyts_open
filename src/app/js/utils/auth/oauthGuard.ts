// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// OAuth provider contract and local fail-closed checks for Supabase Auth.

export type EcbytsOAuthProvider = 'google' | 'github' | 'microsoft';
export type SupabaseOAuthProvider = 'google' | 'github' | 'azure';

export type OAuthConfigReasonCode =
    | 'missing-url'
    | 'missing-key'
    | 'placeholder-url'
    | 'placeholder-key'
    | 'invalid-url'
    | 'non-https-url'
    | 'publishable-key-too-short';

export type OAuthAuthorizeReasonCode =
    | 'missing-authorize-url'
    | 'invalid-authorize-url'
    | 'placeholder-authorize-url'
    | 'config-url-invalid'
    | 'host-mismatch'
    | 'provider-mismatch'
    | 'redirect-mismatch';

export interface OAuthProviderContract {
    id: EcbytsOAuthProvider;
    label: string;
    supabaseProvider: SupabaseOAuthProvider;
    scopes?: string;
}

export interface OAuthLocationLike {
    origin: string;
    pathname?: string;
}

export interface OAuthSignInRequest {
    provider: SupabaseOAuthProvider;
    options: {
        redirectTo: string;
        scopes?: string;
        skipBrowserRedirect?: boolean;
    };
}

export interface OAuthConfigStatus {
    ok: boolean;
    reasonCodes: OAuthConfigReasonCode[];
}

export interface OAuthAuthorizeStatus {
    ok: boolean;
    reasonCodes: OAuthAuthorizeReasonCode[];
    hasPlaceholder: boolean;
    hostMatchesConfig: boolean;
    providerMatches: boolean;
    redirectMatches: boolean;
}

export const OAUTH_PROVIDER_CONTRACTS: Readonly<Record<EcbytsOAuthProvider, OAuthProviderContract>> = Object.freeze({
    google: Object.freeze({
        id: 'google',
        label: 'Google',
        supabaseProvider: 'google',
    }),
    github: Object.freeze({
        id: 'github',
        label: 'GitHub',
        supabaseProvider: 'github',
    }),
    microsoft: Object.freeze({
        id: 'microsoft',
        label: 'Microsoft',
        supabaseProvider: 'azure',
        scopes: 'email',
    }),
});

const PLACEHOLDER_RE = /placeholder/i;
const MIN_PUBLISHABLE_KEY_LENGTH = 20;

export function getOAuthProviderContract(provider: string): OAuthProviderContract {
    const contract = (OAUTH_PROVIDER_CONTRACTS as Readonly<Record<string, OAuthProviderContract>>)[provider];
    if (!contract) {
        throw new Error(`Unsupported OAuth provider: ${provider}`);
    }
    return contract;
}

export function buildOAuthRedirectTo(locationLike: OAuthLocationLike): string {
    const origin = String(locationLike.origin || '').trim();
    if (!origin) {
        throw new Error('OAuth redirect origin missing');
    }
    const pathname = String(locationLike.pathname || '/');
    return new URL(pathname.startsWith('/') ? pathname : `/${pathname}`, origin).toString();
}

export function buildOAuthSignInRequest(
    provider: EcbytsOAuthProvider,
    locationLike: OAuthLocationLike,
    options: { skipBrowserRedirect?: boolean } = {},
): OAuthSignInRequest {
    const contract = getOAuthProviderContract(provider);
    const request: OAuthSignInRequest = {
        provider: contract.supabaseProvider,
        options: {
            redirectTo: buildOAuthRedirectTo(locationLike),
        },
    };
    if (contract.scopes) {
        request.options.scopes = contract.scopes;
    }
    if (typeof options.skipBrowserRedirect === 'boolean') {
        request.options.skipBrowserRedirect = options.skipBrowserRedirect;
    }
    return request;
}

export function validateSupabaseOAuthConfig(supabaseUrl: string, publishableKey: string): OAuthConfigStatus {
    const reasonCodes: OAuthConfigReasonCode[] = [];
    const url = String(supabaseUrl || '').trim();
    const key = String(publishableKey || '').trim();

    if (!url) {
        reasonCodes.push('missing-url');
    } else if (PLACEHOLDER_RE.test(url)) {
        reasonCodes.push('placeholder-url');
    } else {
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'https:') {
                reasonCodes.push('non-https-url');
            }
        } catch (_e) {
            reasonCodes.push('invalid-url');
        }
    }

    if (!key) {
        reasonCodes.push('missing-key');
    } else {
        if (PLACEHOLDER_RE.test(key)) {
            reasonCodes.push('placeholder-key');
        }
        if (key.length < MIN_PUBLISHABLE_KEY_LENGTH) {
            reasonCodes.push('publishable-key-too-short');
        }
    }

    return { ok: reasonCodes.length === 0, reasonCodes };
}

export function assertSupabaseOAuthConfigReady(supabaseUrl: string, publishableKey: string): void {
    const status = validateSupabaseOAuthConfig(supabaseUrl, publishableKey);
    if (!status.ok) {
        throw new Error(
            `Supabase OAuth config invalid (${status.reasonCodes.join(', ')}). Regenerate app/js/supabase-config.js from .env.local or deployment env.`,
        );
    }
}

export function inspectOAuthAuthorizeUrl(
    authorizeUrl: string,
    supabaseUrl: string,
    provider: EcbytsOAuthProvider,
    expectedRedirectTo: string,
): OAuthAuthorizeStatus {
    const reasonCodes: OAuthAuthorizeReasonCode[] = [];
    const contract = getOAuthProviderContract(provider);
    const hasPlaceholder = PLACEHOLDER_RE.test(String(authorizeUrl || ''));
    let parsedAuthorizeUrl: URL | null = null;
    let parsedSupabaseUrl: URL | null = null;

    if (!authorizeUrl) {
        reasonCodes.push('missing-authorize-url');
    } else {
        try {
            parsedAuthorizeUrl = new URL(authorizeUrl);
        } catch (_e) {
            reasonCodes.push('invalid-authorize-url');
        }
    }

    try {
        parsedSupabaseUrl = new URL(supabaseUrl);
    } catch (_e) {
        reasonCodes.push('config-url-invalid');
    }

    if (hasPlaceholder) {
        reasonCodes.push('placeholder-authorize-url');
    }

    const hostMatchesConfig = Boolean(
        parsedAuthorizeUrl && parsedSupabaseUrl && parsedAuthorizeUrl.host === parsedSupabaseUrl.host,
    );
    if (!hostMatchesConfig) {
        reasonCodes.push('host-mismatch');
    }

    const providerMatches = parsedAuthorizeUrl?.searchParams.get('provider') === contract.supabaseProvider;
    if (!providerMatches) {
        reasonCodes.push('provider-mismatch');
    }

    const redirectMatches = parsedAuthorizeUrl?.searchParams.get('redirect_to') === expectedRedirectTo;
    if (!redirectMatches) {
        reasonCodes.push('redirect-mismatch');
    }

    return {
        ok: reasonCodes.length === 0,
        reasonCodes,
        hasPlaceholder,
        hostMatchesConfig,
        providerMatches,
        redirectMatches,
    };
}
