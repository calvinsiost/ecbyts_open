// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   URL SAFETY (utils/helpers — cross-spec pure-logic)
   ================================================================

   SSRF (Server-Side Request Forgery) prevention. Edge functions e
   proxies que fazem outbound requests DEVEM validar URL antes para
   não vazar acesso a:
     - Cloud metadata endpoints (169.254.169.254 AWS/GCP/Azure IMDS)
     - Loopback (127.0.0.0/8, ::1)
     - RFC 1918 private (10/8, 172.16/12, 192.168/16)
     - Link-local (169.254/16, fe80::/10)
     - Internal hostnames (*.local, *.internal, localhost)
     - 0.0.0.0/8 (any-address)
     - IPv6 private (fc00::/7)

   Padrão SSRF attack:
     User-controlled URL → server fetch → 169.254.169.254/latest/
     meta-data/iam/security-credentials/role-name → leak AWS keys.

   Cross-spec consumers:
     - supabase/functions/* (qualquer edge que faz fetch p/ URL externa)
     - utils/helpers/cdnLoader (loadScriptCDN URL validation)
     - core/ingestion/documents/surya/_edgeRequestBuilderPure (proxy)
     - core/recognition/* (vision API endpoints)
     - utils/api/bridge (REST proxy)

   Pure-logic: caller injeta URL string. Sem fetch. Determinístico.

   Reference: OWASP SSRF Prevention Cheat Sheet + cloud metadata
   IPs canônicos (AWS IMDS, GCP, Azure, DigitalOcean, etc.).
   ================================================================ */

export const CLOUD_METADATA_IPS: readonly string[] = Object.freeze([
    '169.254.169.254',
    '100.100.100.200',
    '169.254.170.2',
    'metadata.google.internal',
    'metadata.azure.com',
]);

export const INTERNAL_TLDS: readonly string[] = Object.freeze([
    '.local',
    '.internal',
    '.localhost',
    '.lan',
    '.intranet',
    '.corp',
    '.home',
]);

export const ALLOWED_PROTOCOLS_DEFAULT: readonly string[] = Object.freeze([
    'http:',
    'https:',
]);

export type UrlSafetyAction = 'allow' | 'deny';
export type SafetyReason =
    | 'invalid_url'
    | 'invalid_protocol'
    | 'loopback_address'
    | 'private_rfc1918'
    | 'link_local'
    | 'cloud_metadata'
    | 'any_address'
    | 'internal_tld'
    | 'localhost_hostname'
    | 'ipv6_private'
    | 'allowlist_match'
    | 'blocklist_match'
    | 'denied_default'
    | 'passed_all_checks';

export interface ParsedUrl {
    readonly valid: boolean;
    readonly protocol: string;
    readonly hostname: string;
    readonly port: string;
    readonly pathname: string;
    readonly reason: string;
}

export interface UrlSafetyVerdict {
    readonly action: UrlSafetyAction;
    readonly reason: SafetyReason;
    readonly hostname: string;
    readonly protocol: string;
    readonly origin: string;
}

export interface UrlSafetyOptions {
    readonly allowedProtocols?: readonly string[];
    readonly hostnameAllowlist?: readonly string[];
    readonly hostnameBlocklist?: readonly string[];
    readonly allowPrivateNetwork?: boolean;
}

function safeUrlParse(input: string): URL | null {
    try {
        return new URL(input);
    } catch {
        return null;
    }
}

export function parseUrl(input: unknown): ParsedUrl {
    if (typeof input !== 'string' || input.length === 0) {
        return Object.freeze({
            valid: false,
            protocol: '',
            hostname: '',
            port: '',
            pathname: '',
            reason: 'empty_or_invalid_input',
        });
    }
    const u = safeUrlParse(input);
    if (!u) {
        return Object.freeze({
            valid: false,
            protocol: '',
            hostname: '',
            port: '',
            pathname: '',
            reason: 'unparseable',
        });
    }
    return Object.freeze({
        valid: true,
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port,
        pathname: u.pathname,
        reason: 'parsed',
    });
}

function isIpv4(host: string): boolean {
    return /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(host);
}

function ipv4ToOctets(host: string): number[] | null {
    if (!isIpv4(host)) return null;
    const parts = host.split('.').map(p => parseInt(p, 10));
    return parts;
}

export function isLoopback(host: string): boolean {
    if (typeof host !== 'string') return false;
    const lower = host.toLowerCase();
    if (lower === 'localhost' || lower === 'ip6-localhost') return true;
    if (lower === '::1' || lower === '[::1]') return true;
    const octets = ipv4ToOctets(host);
    if (octets && octets[0] === 127) return true;
    return false;
}

export function isPrivateRfc1918(host: string): boolean {
    const octets = ipv4ToOctets(host);
    if (!octets) return false;
    const [a, b] = octets;
    if (a === 10) return true;
    if (a === 172 && b! >= 16 && b! <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
}

export function isLinkLocal(host: string): boolean {
    const octets = ipv4ToOctets(host);
    if (octets && octets[0] === 169 && octets[1] === 254) return true;
    if (typeof host === 'string' && /^fe[89ab][0-9a-f]:/i.test(host)) return true;
    return false;
}

export function isCloudMetadata(host: string): boolean {
    if (typeof host !== 'string') return false;
    const lower = host.toLowerCase();
    return CLOUD_METADATA_IPS.some(ip => lower === ip.toLowerCase());
}

export function isAnyAddress(host: string): boolean {
    const octets = ipv4ToOctets(host);
    if (octets && octets[0] === 0) return true;
    if (host === '::' || host === '[::]') return true;
    return false;
}

export function isInternalTld(host: string): boolean {
    if (typeof host !== 'string') return false;
    const lower = host.toLowerCase();
    return INTERNAL_TLDS.some(suffix => lower.endsWith(suffix));
}

export function isIpv6Private(host: string): boolean {
    if (typeof host !== 'string') return false;
    const lower = host.toLowerCase().replace(/^\[|\]$/g, '');
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
    if (lower === '::1') return true;
    return false;
}

export function isPrivateOrInternal(host: string): boolean {
    return (
        isLoopback(host) ||
        isPrivateRfc1918(host) ||
        isLinkLocal(host) ||
        isCloudMetadata(host) ||
        isAnyAddress(host) ||
        isInternalTld(host) ||
        isIpv6Private(host)
    );
}

function dedupeStrings(list: readonly string[] | undefined): string[] {
    if (!Array.isArray(list)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of list) {
        if (typeof v !== 'string' || v.length === 0) continue;
        const lower = v.toLowerCase();
        if (!seen.has(lower)) {
            seen.add(lower);
            out.push(lower);
        }
    }
    return out;
}

function originOf(parsed: ParsedUrl): string {
    if (!parsed.valid) return '';
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.protocol}//${parsed.hostname}${port}`;
}

export function decideUrlSafety(input: unknown, options?: UrlSafetyOptions): UrlSafetyVerdict {
    const parsed = parseUrl(input);
    if (!parsed.valid) {
        return Object.freeze({
            action: 'deny' as const,
            reason: 'invalid_url' as SafetyReason,
            hostname: '',
            protocol: '',
            origin: '',
        });
    }
    const allowedProtocols =
        options?.allowedProtocols && options.allowedProtocols.length > 0
            ? options.allowedProtocols.map(p => p.toLowerCase())
            : ALLOWED_PROTOCOLS_DEFAULT;
    if (!allowedProtocols.includes(parsed.protocol.toLowerCase())) {
        return Object.freeze({
            action: 'deny' as const,
            reason: 'invalid_protocol' as SafetyReason,
            hostname: parsed.hostname,
            protocol: parsed.protocol,
            origin: originOf(parsed),
        });
    }
    const allowlist = dedupeStrings(options?.hostnameAllowlist);
    const blocklist = dedupeStrings(options?.hostnameBlocklist);
    const lowerHost = parsed.hostname.toLowerCase();
    if (blocklist.includes(lowerHost)) {
        return Object.freeze({
            action: 'deny' as const,
            reason: 'blocklist_match' as SafetyReason,
            hostname: parsed.hostname,
            protocol: parsed.protocol,
            origin: originOf(parsed),
        });
    }
    if (allowlist.length > 0 && allowlist.includes(lowerHost)) {
        return Object.freeze({
            action: 'allow' as const,
            reason: 'allowlist_match' as SafetyReason,
            hostname: parsed.hostname,
            protocol: parsed.protocol,
            origin: originOf(parsed),
        });
    }
    if (!options?.allowPrivateNetwork) {
        if (isCloudMetadata(parsed.hostname)) {
            return makeDeny(parsed, 'cloud_metadata');
        }
        if (isLoopback(parsed.hostname)) {
            return makeDeny(parsed, 'loopback_address');
        }
        if (isPrivateRfc1918(parsed.hostname)) {
            return makeDeny(parsed, 'private_rfc1918');
        }
        if (isLinkLocal(parsed.hostname)) {
            return makeDeny(parsed, 'link_local');
        }
        if (isAnyAddress(parsed.hostname)) {
            return makeDeny(parsed, 'any_address');
        }
        if (isIpv6Private(parsed.hostname)) {
            return makeDeny(parsed, 'ipv6_private');
        }
        if (isInternalTld(parsed.hostname)) {
            return makeDeny(parsed, 'internal_tld');
        }
        if (lowerHost === 'localhost') {
            return makeDeny(parsed, 'localhost_hostname');
        }
    }
    if (allowlist.length > 0) {
        return Object.freeze({
            action: 'deny' as const,
            reason: 'denied_default' as SafetyReason,
            hostname: parsed.hostname,
            protocol: parsed.protocol,
            origin: originOf(parsed),
        });
    }
    return Object.freeze({
        action: 'allow' as const,
        reason: 'passed_all_checks' as SafetyReason,
        hostname: parsed.hostname,
        protocol: parsed.protocol,
        origin: originOf(parsed),
    });
}

function makeDeny(parsed: ParsedUrl, reason: SafetyReason): UrlSafetyVerdict {
    return Object.freeze({
        action: 'deny' as const,
        reason,
        hostname: parsed.hostname,
        protocol: parsed.protocol,
        origin: originOf(parsed),
    });
}

export function normalizeOrigin(input: unknown): string {
    const parsed = parseUrl(input);
    return originOf(parsed);
}
