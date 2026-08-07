// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// A allowlist NAO e hardcoded: vem da config de runtime (gerada de `.env.local`
// pela var TRUSTED_BYPASS_EMAILS via scripts/build-supabase-config.mjs). Sem PII
// no fonte versionado. Namespace import degrada com graca se o supabase-config
// (ex.: build publico) nao exportar a lista.
import * as runtimeConfig from '../supabase-config.js';

/**
 * trustedBypass.js — Emergency bypass allowlist.
 *
 * Emails listed here can use cached-session emergency login when Supabase auth
 * is offline. NOT secret — gives no access without ALL of:
 *   (a) prior successful Supabase login (cache populated),
 *   (b) email match against this allowlist,
 *   (c) correct password (used to derive the AES key — wrong password = decrypt fails).
 *
 * Rationale: single-developer / small-trusted-team product; Supabase outage
 * (sa-east-1) blocks legitimate access. Allowlist is the gate on cache write,
 * password is the gate on cache read.
 */

const RAW_BYPASS = (runtimeConfig as { TRUSTED_BYPASS_EMAILS?: unknown }).TRUSTED_BYPASS_EMAILS;

/** @type {ReadonlyArray<string>} */
export const TRUSTED_BYPASS_EMAILS: ReadonlyArray<string> = Object.freeze(
    Array.isArray(RAW_BYPASS) ? RAW_BYPASS.map((e) => String(e).trim().toLowerCase()).filter(Boolean) : [],
);

/**
 * Returns true if the given email is in the trusted-bypass allowlist.
 * Compares case-insensitively after trim.
 *
 * @param {unknown} email
 * @returns {boolean}
 */
export function isTrustedBypassEmail(email: unknown): boolean {
    if (!email || typeof email !== 'string') return false;
    return TRUSTED_BYPASS_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * Cache TTL — 7 days. Matches Supabase JWT typical expiry window;
 * within this period a refresh would be allowed normally.
 */
export const EMERGENCY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * PBKDF2 iterations — OWASP 2024 recommendation for PBKDF2-HMAC-SHA256.
 * Higher = slower brute force, but also slower login. 600k is the sweet spot
 * for browsers (~250-500ms on modern hardware).
 */
export const PBKDF2_ITERATIONS = 600_000;
