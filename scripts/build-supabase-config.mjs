#!/usr/bin/env node
/**
 * Build step: generate app/js/supabase-config.js from environment variables.
 *
 * This file is gitignored — must be created at deploy time from env vars.
 * Used by:
 *   - Vercel native integration (env vars set in Vercel Dashboard)
 *   - GitHub Actions workflows (env vars from secrets)
 *   - Local dev (env vars from .env.local — but file is usually created manually)
 *
 * Required env vars:
 *   SUPABASE_URL              — public Supabase project URL
 *   SUPABASE_PUBLISHABLE_KEY  — public anon key (safe for client-side)
 *
 * Fails the build if vars are missing in production environments.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseEnvContent } from './_envPure.mjs';

function loadDotEnvLocal() {
    const envPath = path.resolve(process.env.SUPABASE_CONFIG_ENV_PATH || '.env.local');
    if (!fs.existsSync(envPath)) return;

    // PROCESS-SEAMS-002 N4.3: parse via parser central scripts/_envPure.mjs.
    // BOM removido antes do parse (arquivos salvos com \uFEFF no Windows).
    const raw = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
    for (const [key, value] of Object.entries(parseEnvContent(raw))) {
        if (!process.env[key]) process.env[key] = value;
    }
}

if (!process.env.VERCEL) {
    loadDotEnvLocal();
}

// Trim defensively — env vars can arrive with trailing newlines or whitespace
// depending on how they were added (e.g. `echo "x" | vercel env add` appends \n).
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();

// Guard against values that contain single quotes (would break the string literal)
function safe(v) {
    return v.replace(/'/g, "\\'").replace(/[\r\n]+/g, '');
}
const OUT_PATH = path.resolve(process.env.SUPABASE_CONFIG_OUT_PATH || path.join('app', 'js', 'supabase-config.js'));

const isVercel = !!process.env.VERCEL;
const isProd = process.env.VERCEL_ENV === 'production';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    const msg = '[build-supabase-config] Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY env vars';
    if (isProd) {
        console.error(msg);
        console.error('Set them in Vercel Dashboard → Project → Settings → Environment Variables');
        process.exit(1);
    }
    console.warn(`${msg} — using placeholder for non-prod build`);
}

const urlValue = safe(SUPABASE_URL || 'https://placeholder.supabase.co');
const keyValue = safe(SUPABASE_KEY || 'placeholder-key');

// Emergency-login bypass allowlist (comma-separated emails). Empty in public/CI
// builds — no PII in source. Consumed by config/trustedBypass.ts.
const bypassRaw = (process.env.TRUSTED_BYPASS_EMAILS || '').trim();
const bypassList = bypassRaw
    ? bypassRaw
          .split(',')
          .map((e) =>
              e
                  .trim()
                  .toLowerCase()
                  .replace(/["'\\\r\n]/g, ''),
          )
          .filter(Boolean)
    : [];
const bypassLiteral = JSON.stringify(bypassList);

// MASTER gate do System Catalog (score) — email do MASTER via env MASTER_EMAIL,
// nunca no fonte versionado (LGPD PIA R4). Vazio em builds públicos/CI → gate
// fail-closed (ninguém vê a seção de score).
const masterEmail = (process.env.MASTER_EMAIL || '').trim().replace(/["'\\\r\n]/g, '');

const content = `// AUTO-GENERATED at build time by scripts/build-supabase-config.mjs
// Do not edit manually — values come from environment variables.
// gitignored — never commit this file.

export const SUPABASE_URL = '${urlValue}';
export const SUPABASE_KEY = '${keyValue}';
export const SUPABASE_PUBLISHABLE_KEY = SUPABASE_KEY;
export const TRUSTED_BYPASS_EMAILS = ${bypassLiteral};
export const MASTER_EMAIL = ${JSON.stringify(masterEmail)};
`;

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, content, 'utf8');

const env = isVercel ? `Vercel (${process.env.VERCEL_ENV || 'unknown'})` : 'local/CI';
console.log(`[build-supabase-config] Wrote ${OUT_PATH} (${env})`);
console.log(`[build-supabase-config] SUPABASE_URL: ${SUPABASE_URL ? 'set' : 'placeholder'}`);
console.log(`[build-supabase-config] SUPABASE_PUBLISHABLE_KEY: ${SUPABASE_KEY ? 'set' : 'placeholder'}`);
