// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   SEED RADAR PROFILES — Random Model Phase 8
   SPEC_DATASTUDIO_RADAR_PROFILES.md §2.2 + §2.3

   When a Random Model is generated, 9 stakeholder profile templates
   are inserted into radar_profiles (per-project) as examples. They
   are NOT global templates — they are concrete rows the Data Owner
   can edit, duplicate, or delete freely.

   The mapping below mirrors SPEC §2.2 table exactly:

   | Profile             | billing | tok/s | RBAC                            | pii    | auth_method        |
   |---------------------|---------|-------|---------------------------------|--------|--------------------|
   | Cliente             | tokens  | 100   | read                            | none   | email              |
   | Órgão Ambiental     | free    | 50    | read                            | mask   | cnpj_verify        |
   | Parceiro            | free    | 30    | read+write                      | mask   | invite_link        |
   | Ministério Público  | free    | 20    | read                            | none   | oab_credential     |
   | Comunidade          | free    | 5     | read                            | remove | email              |
   | Interno             | free    | 50    | read+write+sign                 | none   | sso                |
   | Responsável Legal   | free    | 10    | read+sign                       | none   | e_signature        |
   | Responsável Técnico | free    | 30    | read+write+sign                 | none   | crea_credential    |
   | Data Owner          | none    | 9999  | read+write+sign+share+delete    | none   | project_owner      |

   All exported profile arrays are deep-frozen. Inserts via Supabase
   set is_seed=true so the UI can mark them visually. Idempotent: if
   any seed exists for the projectId, the function skips and returns 0.
   ================================================================ */
// ----------------------------------------------------------------
// RBAC PRESETS — frozen, reused across locales
// ----------------------------------------------------------------
const RBAC_READ_ONLY = Object.freeze({
    read: true,
    write: false,
    sign: false,
    share: false,
    delete: false,
});
const RBAC_READ_WRITE = Object.freeze({
    read: true,
    write: true,
    sign: false,
    share: false,
    delete: false,
});
const RBAC_READ_SIGN = Object.freeze({
    read: true,
    write: false,
    sign: true,
    share: false,
    delete: false,
});
const RBAC_READ_WRITE_SIGN = Object.freeze({
    read: true,
    write: true,
    sign: true,
    share: false,
    delete: false,
});
const RBAC_FULL = Object.freeze({
    read: true,
    write: true,
    sign: true,
    share: true,
    delete: true,
});
// ----------------------------------------------------------------
// REDACTION + BILLING PRESETS
// ----------------------------------------------------------------
const REDACTION_NONE = Object.freeze({ pii: 'none', precision_decimals: 6 });
const REDACTION_MASK = Object.freeze({ pii: 'mask', precision_decimals: 6 });
const REDACTION_REMOVE_3 = Object.freeze({ pii: 'remove', precision_decimals: 3 });
const BILLING_TOKENS_REQUIRED = Object.freeze({ required: true, model: 'tokens' });
const BILLING_FREE = Object.freeze({ required: false, model: 'free' });
const BILLING_NONE = Object.freeze({ required: false, model: 'none' });
/**
 * Build a frozen rate limit descriptor.
 * @param {number} ratePerSecond
 * @param {number} [maxPerRequest?]
 * @returns {Readonly<{tokens_per_second: number, max_tokens_per_request: number}>}
 */
function rateLimit(ratePerSecond: any, maxPerRequest?: any) {
    return Object.freeze({
        tokens_per_second: ratePerSecond,
        max_tokens_per_request: maxPerRequest ?? Math.max(100, ratePerSecond * 10),
    });
}
// ----------------------------------------------------------------
// PROFILE FACTORY — shared structure across locales
// ----------------------------------------------------------------
/**
 * @typedef {Object} SeedProfile
 * @property {string} name           Localized free-text display name.
 * @property {string} slug           Stable URL-safe slug (locale-independent).
 * @property {string} icon           Lucide icon name.
 * @property {string} color          Hex color (UI badge).
 * @property {string} auth_method    Auth strategy slug.
 * @property {Readonly<{read:boolean, write:boolean, sign:boolean, share:boolean, delete:boolean}>} rbac
 * @property {Readonly<{pii:string, precision_decimals:number}>} redaction
 * @property {number} audit_retention_days
 * @property {Readonly<{required:boolean, model:string}>} default_billing
 * @property {Readonly<{tokens_per_second:number, max_tokens_per_request:number}>} default_rate_limit
 */
/**
 * Build a single frozen profile.
 * @param {Partial<SeedProfile> & {name: string, slug: string}} input
 * @returns {Readonly<SeedProfile>}
 */
function makeProfile(input: any) {
    /** @type {SeedProfile} */
    const profile = {
        name: input.name,
        slug: input.slug,
        icon: input.icon || 'user',
        color: input.color || '#6b7280',
        auth_method: input.auth_method || 'email',
        rbac: input.rbac || RBAC_READ_ONLY,
        redaction: input.redaction || REDACTION_NONE,
        audit_retention_days: input.audit_retention_days ?? 365,
        default_billing: input.default_billing || BILLING_FREE,
        default_rate_limit: input.default_rate_limit || rateLimit(10),
    };
    return Object.freeze(profile);
}
// ----------------------------------------------------------------
// SLUG REGISTRY — stable across locales
// ----------------------------------------------------------------
const SLUGS = Object.freeze({
    CLIENTE: 'cliente',
    ORGAO_AMBIENTAL: 'orgao_ambiental',
    PARCEIRO: 'parceiro',
    MINISTERIO_PUBLICO: 'ministerio_publico',
    COMUNIDADE: 'comunidade',
    INTERNO: 'interno',
    RESPONSAVEL_LEGAL: 'responsavel_legal',
    RESPONSAVEL_TECNICO: 'responsavel_tecnico',
    DATA_OWNER: 'data_owner',
});
// ----------------------------------------------------------------
// SHARED DEFAULTS — same across all 3 locales (only names differ)
// ----------------------------------------------------------------
/**
 * Build a localized seed pack. All non-name attributes are identical
 * across locales.
 * @param {Record<keyof typeof SLUGS, string>} names
 * @returns {ReadonlyArray<Readonly<SeedProfile>>}
 */
function buildSeedPack(names: any) {
    return Object.freeze([
        makeProfile({
            name: names.CLIENTE,
            slug: SLUGS.CLIENTE,
            icon: 'briefcase',
            color: '#22c55e',
            auth_method: 'email',
            rbac: RBAC_READ_ONLY,
            redaction: REDACTION_NONE,
            default_billing: BILLING_TOKENS_REQUIRED,
            default_rate_limit: rateLimit(100),
        }),
        makeProfile({
            name: names.ORGAO_AMBIENTAL,
            slug: SLUGS.ORGAO_AMBIENTAL,
            icon: 'shield',
            color: '#0ea5e9',
            auth_method: 'cnpj_verify',
            rbac: RBAC_READ_ONLY,
            redaction: REDACTION_MASK,
            default_billing: BILLING_FREE,
            default_rate_limit: rateLimit(50),
        }),
        makeProfile({
            name: names.PARCEIRO,
            slug: SLUGS.PARCEIRO,
            icon: 'handshake',
            color: '#a855f7',
            auth_method: 'invite_link',
            rbac: RBAC_READ_WRITE,
            redaction: REDACTION_MASK,
            default_billing: BILLING_FREE,
            default_rate_limit: rateLimit(30),
        }),
        makeProfile({
            name: names.MINISTERIO_PUBLICO,
            slug: SLUGS.MINISTERIO_PUBLICO,
            icon: 'gavel',
            color: '#ef4444',
            auth_method: 'oab_credential',
            rbac: RBAC_READ_ONLY,
            redaction: REDACTION_NONE,
            default_billing: BILLING_FREE,
            default_rate_limit: rateLimit(20),
        }),
        makeProfile({
            name: names.COMUNIDADE,
            slug: SLUGS.COMUNIDADE,
            icon: 'users',
            color: '#f59e0b',
            auth_method: 'email',
            rbac: RBAC_READ_ONLY,
            redaction: REDACTION_REMOVE_3,
            default_billing: BILLING_FREE,
            default_rate_limit: rateLimit(5),
        }),
        makeProfile({
            name: names.INTERNO,
            slug: SLUGS.INTERNO,
            icon: 'building',
            color: '#3b82f6',
            auth_method: 'sso',
            rbac: RBAC_READ_WRITE_SIGN,
            redaction: REDACTION_NONE,
            default_billing: BILLING_FREE,
            default_rate_limit: rateLimit(50),
        }),
        makeProfile({
            name: names.RESPONSAVEL_LEGAL,
            slug: SLUGS.RESPONSAVEL_LEGAL,
            icon: 'scroll',
            color: '#8b5cf6',
            auth_method: 'e_signature',
            rbac: RBAC_READ_SIGN,
            redaction: REDACTION_NONE,
            default_billing: BILLING_FREE,
            default_rate_limit: rateLimit(10),
        }),
        makeProfile({
            name: names.RESPONSAVEL_TECNICO,
            slug: SLUGS.RESPONSAVEL_TECNICO,
            icon: 'hard-hat',
            color: '#14b8a6',
            auth_method: 'crea_credential',
            rbac: RBAC_READ_WRITE_SIGN,
            redaction: REDACTION_NONE,
            default_billing: BILLING_FREE,
            default_rate_limit: rateLimit(30),
        }),
        makeProfile({
            name: names.DATA_OWNER,
            slug: SLUGS.DATA_OWNER,
            icon: 'crown',
            color: '#eab308',
            auth_method: 'project_owner',
            rbac: RBAC_FULL,
            redaction: REDACTION_NONE,
            default_billing: BILLING_NONE,
            default_rate_limit: rateLimit(9999, 100000),
        }),
    ]);
}
// ----------------------------------------------------------------
// LOCALIZED PACKS — names only
// ----------------------------------------------------------------
/** @type {Readonly<ReadonlyArray<Readonly<SeedProfile>>>} */
export const SEED_PROFILES_PT_BR = buildSeedPack({
    CLIENTE: 'Cliente',
    ORGAO_AMBIENTAL: 'Órgão Ambiental',
    PARCEIRO: 'Parceiro',
    MINISTERIO_PUBLICO: 'Ministério Público',
    COMUNIDADE: 'Comunidade',
    INTERNO: 'Interno',
    RESPONSAVEL_LEGAL: 'Responsável Legal',
    RESPONSAVEL_TECNICO: 'Responsável Técnico',
    DATA_OWNER: 'Data Owner',
});
/** @type {Readonly<ReadonlyArray<Readonly<SeedProfile>>>} */
export const SEED_PROFILES_EN_US = buildSeedPack({
    CLIENTE: 'Client',
    ORGAO_AMBIENTAL: 'Environmental Agency',
    PARCEIRO: 'Partner',
    MINISTERIO_PUBLICO: 'Public Prosecutor',
    COMUNIDADE: 'Community',
    INTERNO: 'Internal',
    RESPONSAVEL_LEGAL: 'Legal Officer',
    RESPONSAVEL_TECNICO: 'Technical Officer',
    DATA_OWNER: 'Data Owner',
});
/** @type {Readonly<ReadonlyArray<Readonly<SeedProfile>>>} */
export const SEED_PROFILES_ES_LA = buildSeedPack({
    CLIENTE: 'Cliente',
    ORGAO_AMBIENTAL: 'Órgano Ambiental',
    PARCEIRO: 'Socio',
    MINISTERIO_PUBLICO: 'Ministerio Público',
    COMUNIDADE: 'Comunidad',
    INTERNO: 'Interno',
    RESPONSAVEL_LEGAL: 'Responsable Legal',
    RESPONSAVEL_TECNICO: 'Responsable Técnico',
    DATA_OWNER: 'Propietario de Datos',
});
/**
 * Map locale string -> seed pack. Unknown locales fall back to pt-BR.
 * @type {Readonly<Record<string, ReadonlyArray<Readonly<SeedProfile>>>>}
 */
const SEED_PACKS_BY_LOCALE = Object.freeze({
    'pt-BR': SEED_PROFILES_PT_BR,
    'pt': SEED_PROFILES_PT_BR,
    'en-US': SEED_PROFILES_EN_US,
    'en': SEED_PROFILES_EN_US,
    'es-LA': SEED_PROFILES_ES_LA,
    'es': SEED_PROFILES_ES_LA,
});
/**
 * Resolve a locale string to a seed pack, falling back to pt-BR.
 * @param {string} locale
 * @returns {ReadonlyArray<Readonly<SeedProfile>>}
 */
export function resolveSeedPack(locale: any) {
    return (SEED_PACKS_BY_LOCALE as Record<string,any>)[locale] || SEED_PROFILES_PT_BR;
}
// ----------------------------------------------------------------
// SUPABASE SEED — idempotent insert
// ----------------------------------------------------------------
/**
 * Lazy-load the Supabase client when no override is injected.
 * @returns {Promise<any|null>}
 */
async function _resolveSupabaseClient() {
    try {
        const mod = await import('../../../utils/auth/session.js' as string);
        return typeof mod.getSupabaseClient === 'function' ? mod.getSupabaseClient() : null;
    }
    catch (e: any) {
        console.debug('[seedRadarProfiles] getSupabaseClient unavailable:', e?.message || e);
        return null;
    }
}
/**
 * Convert a frozen SeedProfile to a row ready for INSERT.
 * @param {Readonly<SeedProfile>} profile
 * @param {string} projectId
 * @returns {Record<string, any>}
 */
function _profileToRow(profile: any, projectId: any) {
    return {
        project_id: projectId,
        name: profile.name,
        slug: profile.slug,
        icon: profile.icon,
        color: profile.color,
        auth_method: profile.auth_method,
        rbac: profile.rbac,
        redaction: profile.redaction,
        audit_retention_days: profile.audit_retention_days,
        default_billing: profile.default_billing,
        default_rate_limit: profile.default_rate_limit,
        is_seed: true,
    };
}

function _apiSchemaClient(client: any) {
    return client && typeof client.schema === 'function' ? client.schema('api') : client;
}

/**
 * Seed the 9 stakeholder profile templates for a given project. Idempotent:
 * if any seed already exists for `projectId`, this function returns 0 without
 * inserting.
 *
 * @param {string} projectId Project UUID owning the profiles.
 * @param {string} [locale='pt-BR'] Locale for profile display names.
 * @param {any} [supabaseClient=null] Optional injected Supabase client for tests.
 * @returns {Promise<number>} Number of rows inserted (0 if already seeded).
 */
export async function seedRadarProfilesForProject(projectId: any, locale: any = "pt-BR", supabaseClient: any = null) {
    if (!projectId || typeof projectId !== 'string') {
        throw new Error('[seedRadarProfiles] projectId required (string).');
    }
    const client = supabaseClient || (await _resolveSupabaseClient());
    if (!client || typeof client.rpc !== 'function') {
        throw new Error('[seedRadarProfiles] Supabase client unavailable.');
    }
    // 1. Resolve seed pack by locale (fallback pt-BR).
    const pack = resolveSeedPack(locale);
    // 2. Let the API RPC handle idempotency and insert as one server-side unit.
    const rows = pack.map((p: any) => _profileToRow(p, projectId));
    const { data, error } = await _apiSchemaClient(client).rpc('seed_radar_profiles_for_project', {
        p_project_id: projectId,
        p_profiles: rows,
    });
    if (error) {
        throw new Error(`[seedRadarProfiles] seed failed: ${error.message || error}`);
    }
    return Number(data || 0);
}
