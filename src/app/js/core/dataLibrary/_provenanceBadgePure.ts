// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * _provenanceBadgePure — IP-DATA-CONSOL-001 M7
 *
 * Pure-logic builder do badge de proveniência (FAIR landing page UX).
 * Dado o catalog metadata + cache source, retorna ViewModel que o UI
 * consumidor renderiza (DOM separado em M7.1 wire).
 *
 * Honra FAIR principles (research §4 — IPCC AR6 Atlas pattern):
 *  - DOI/version visível
 *  - License badge com cor/label canônica
 *  - Source URL clicável
 *  - Last audit (cached_at) com relative time
 *  - Tier badge (free/pro/enterprise)
 *  - Integrity hash truncated (8 chars) com tooltip full
 */

export type LicenseTier = 'open' | 'attribution' | 'attribution-share-alike' | 'attribution-noncommercial' | 'proprietary';

export interface ProvenanceInput {
    readonly catalog_key: string;
    readonly version: string;
    readonly source_url: string | null;
    readonly source_doi?: string | null;
    readonly version_doi?: string | null;
    readonly license: string;
    readonly tier_required: 'free' | 'pro' | 'enterprise';
    readonly hash_sha256: string;
    readonly signed_by?: string | null;
    readonly cached_at_ms?: number | null;
    readonly fetched_from: 'cache_fresh' | 'cache_stale_offline' | 'remote';
    readonly nowMs: number;
}

export interface ProvenanceBadgeVM {
    readonly title: string;
    readonly version_label: string;
    readonly doi_link: { readonly url: string; readonly label: string } | null;
    readonly source_link: { readonly url: string; readonly label: string } | null;
    readonly license_badge: { readonly label: string; readonly tier: LicenseTier; readonly cssClass: string };
    readonly tier_badge: { readonly label: string; readonly cssClass: string };
    readonly integrity_hash_short: string;
    readonly integrity_hash_full: string;
    readonly signed_by_label: string | null;
    readonly cache_freshness: { readonly label: string; readonly stale: boolean };
    readonly citation_string: string;
}

const LICENSE_DISPLAY: Record<string, { label: string; tier: LicenseTier; cssClass: string }> = Object.freeze({
    CC0: { label: 'CC0 — Public Domain', tier: 'open', cssClass: 'pv-license-open' },
    'CC-BY-4.0': { label: 'CC BY 4.0', tier: 'attribution', cssClass: 'pv-license-attribution' },
    'CC-BY-SA-4.0': { label: 'CC BY-SA 4.0', tier: 'attribution-share-alike', cssClass: 'pv-license-attribution-sa' },
    'CC-BY-NC-4.0': { label: 'CC BY-NC 4.0', tier: 'attribution-noncommercial', cssClass: 'pv-license-attribution-nc' },
    proprietary: { label: 'Proprietary', tier: 'proprietary', cssClass: 'pv-license-proprietary' },
});

const TIER_DISPLAY: Record<string, { label: string; cssClass: string }> = Object.freeze({
    free: { label: 'Free', cssClass: 'pv-tier-free' },
    pro: { label: 'Pro', cssClass: 'pv-tier-pro' },
    enterprise: { label: 'Enterprise', cssClass: 'pv-tier-enterprise' },
});

export function formatRelativeTime(deltaMs: number): { label: string; stale: boolean } {
    const absMs = Math.abs(deltaMs);
    const sec = Math.floor(absMs / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    let label: string;
    if (sec < 60) label = 'agora';
    else if (min < 60) label = `há ${min} min`;
    else if (hr < 24) label = `há ${hr}h`;
    else if (day < 7) label = `há ${day}d`;
    else if (day < 30) label = `há ${Math.floor(day / 7)} sem`;
    else if (day < 365) label = `há ${Math.floor(day / 30)} meses`;
    else label = `há ${Math.floor(day / 365)} ano(s)`;
    // Stale após 24h
    const stale = absMs > 24 * 60 * 60 * 1000;
    return { label, stale };
}

export function buildCitationString(input: ProvenanceInput): string {
    const versionLabel = `v${input.version}`;
    const doi = input.version_doi || input.source_doi;
    const accessedDate = new Date(input.nowMs).toISOString().slice(0, 10);
    const parts = [
        `ecbyts ${input.catalog_key}`,
        versionLabel,
        doi ? `DOI:${doi}` : null,
        `accessed ${accessedDate}`,
    ].filter(Boolean);
    return parts.join('. ');
}

export function buildProvenanceBadgeVM(input: ProvenanceInput): ProvenanceBadgeVM {
    // Fallback keys ('proprietary'/'free') sempre existem no catálogo congelado;
    // `!` evita que o index-access do fallback reintroduza `| undefined`.
    const licenseEntry = LICENSE_DISPLAY[input.license] ?? LICENSE_DISPLAY.proprietary!;
    const tierEntry = TIER_DISPLAY[input.tier_required] ?? TIER_DISPLAY.free!;

    const doi = input.version_doi || input.source_doi;
    const doiLink = doi
        ? Object.freeze({
              url: doi.startsWith('http') ? doi : `https://doi.org/${doi}`,
              label: doi,
          })
        : null;

    const sourceLink = input.source_url
        ? Object.freeze({ url: input.source_url, label: new URL(input.source_url).hostname })
        : null;

    const cacheFreshness = input.cached_at_ms
        ? formatRelativeTime(input.nowMs - input.cached_at_ms)
        : { label: 'sem cache', stale: false };

    const signedByLabel = input.signed_by ? `assinado por ${input.signed_by.slice(0, 12)}…` : null;

    return Object.freeze({
        title: input.catalog_key,
        version_label: `versão ${input.version}`,
        doi_link: doiLink,
        source_link: sourceLink,
        license_badge: Object.freeze({
            label: licenseEntry.label,
            tier: licenseEntry.tier,
            cssClass: licenseEntry.cssClass,
        }),
        tier_badge: Object.freeze({ label: tierEntry.label, cssClass: tierEntry.cssClass }),
        integrity_hash_short: input.hash_sha256.slice(0, 8) + '…',
        integrity_hash_full: input.hash_sha256,
        signed_by_label: signedByLabel,
        cache_freshness: Object.freeze(cacheFreshness),
        citation_string: buildCitationString(input),
    });
}
