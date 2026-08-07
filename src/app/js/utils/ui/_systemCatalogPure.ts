// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under AGPL-3.0-only
/* ================================================================
   SYSTEM CATALOG — PURE LOGIC (DOM-free, no dynamic imports).

   Extracted from utils/ui/systemCatalogModal.ts so the deterministic
   parts (dedupe + sort + filter + slice) are unit-testable without a
   browser. Zero document/window/fetch/import() references here — the
   modal keeps the dynamic discovery imports and DOM rendering.

   Strategy: keep `discoverItems` doing the dynamic imports in the modal,
   but delegate the "assemble final list" math to dedupeAndSortItems, and
   delegate "filter the rows the user sees" to filterAndSliceItems (which
   also reports truncation — no silent caps).
   ================================================================ */

export type SystemCatalogKind = 'handler' | 'action' | 'api';

export interface SystemCatalogItem {
    kind: SystemCatalogKind;
    name: string;
    label: string;
    source?: string;
    /** True when the underlying action is destructive (from ACTION_REGISTRY entry.destructive). */
    destructive?: boolean;
    run: () => unknown | Promise<unknown>;
}

/** Result of filtering + capping the catalog for display. */
export interface FilteredRowsResult {
    /** The items to actually render (already capped to `cap`). */
    rows: SystemCatalogItem[];
    /** How many items matched the query (before the cap). */
    total: number;
    /** How many items are actually shown (after the cap). */
    shown: number;
    /** True when `total > cap`, i.e. some matches are hidden by the cap. */
    truncated: boolean;
}

/** Default render cap — was a silent `.slice(0, 500)` inside renderRows. */
export const DEFAULT_RENDER_CAP = 500;

/**
 * Dedupe items by `kind:name` (first occurrence wins) then sort
 * alphabetically by `name` (locale-aware). Pure: no side effects.
 *
 * @param items - Raw discovered items (handlers + actions + apis).
 * @returns A new, deduped + sorted array.
 */
export function dedupeAndSortItems(items: readonly SystemCatalogItem[]): SystemCatalogItem[] {
    const seen = new Map<string, SystemCatalogItem>();
    for (const item of items) {
        const key = `${item.kind}:${item.name}`;
        if (!seen.has(key)) seen.set(key, item);
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// ================================================================
// MASTER GATE — quality score visibility (Calvin 2026-06-20)
// ================================================================
// The System Catalog shows a unified-score section ONLY to the MASTER
// (Calvin). The gate is a PURE predicate on the auth session's email so
// it is trivially unit-testable and impossible to leak: a non-master (or
// null) session returns false → the modal renders nothing.
//
// O email do MASTER não vive no fonte (PII — LGPD PIA R4): chega via
// `masterEmail`, que o caller lê do supabase-config.js gerado no build
// (env MASTER_EMAIL — mesmo mecanismo do TRUSTED_BYPASS_EMAILS). Env
// ausente/vazia → gate fechado para todos (fail-closed).

/** Minimal shape we need off the auth session (AuthSession has more). */
export interface MasterUserLike {
    email?: string | null;
}

/**
 * True iff `user` is the MASTER (email === masterEmail, case-insensitive,
 * trimmed). Null/undefined/missing-email → false; masterEmail vazio ou sem
 * '@' → false (fail-closed). Pure, no side effects.
 *
 * @param user - The current auth session (or null when logged out).
 * @param masterEmail - Email configurado do MASTER (supabase-config.js).
 */
export function isMasterUser(user: MasterUserLike | null | undefined, masterEmail: string): boolean {
    const master = typeof masterEmail === 'string' ? masterEmail.trim().toLowerCase() : '';
    if (master === '' || !master.includes('@')) return false;
    const email = user && typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    return email !== '' && email === master;
}

// ---- Quality score report (shape shared by api-server action + modal UI) ----

/** A single pillar of the unified (geral) score. */
export interface ScorePillar {
    key: string;
    label: string;
    score: number;
    grade: string;
    weight: number;
}

/** The overall (geral) unified score. */
export interface ScoreGeral {
    score: number;
    grade: string;
    bottleneck: { key: string; label: string; score: number; grade: string } | null;
}

/** Per-module (per-screen) score row. */
export interface ScoreModuleRow {
    modulo: string;
    score: number;
    code: number | null;
    wcag: number | null;
    ux: number | null;
}

/** Full report returned by the `quality-score-report` action. */
export interface QualityScoreReport {
    geral: ScoreGeral;
    pilares: ScorePillar[];
    porModulo: ScoreModuleRow[];
}

/**
 * Assemble the canonical {@link QualityScoreReport} from the two raw scorer
 * JSON payloads (unified-score.mjs --json and score-screens.mjs --json).
 * PURE: no I/O. Tolerant to missing/partial inputs so a broken scorer never
 * throws in the api-server route — it just yields empty sections.
 *
 * @param unified - Parsed unified-score JSON (geral + pilares).
 * @param screens - Parsed score-screens JSON array (per-module).
 */
export function buildQualityScoreReport(unified: any, screens: any): QualityScoreReport {
    const u = unified && typeof unified === 'object' ? unified : {};
    const components = Array.isArray(u.components) ? u.components : [];
    const pilares: ScorePillar[] = components.map((c: any) => ({
        key: String(c?.key ?? ''),
        label: String(c?.label ?? c?.key ?? ''),
        score: Number(c?.score ?? 0),
        grade: String(c?.grade ?? ''),
        weight: Number(c?.weight ?? 0),
    }));
    const bn = u.bottleneck && typeof u.bottleneck === 'object' ? u.bottleneck : null;
    const geral: ScoreGeral = {
        score: Number(u.score ?? 0),
        grade: String(u.grade ?? ''),
        bottleneck: bn
            ? {
                  key: String(bn.key ?? ''),
                  label: String(bn.label ?? bn.key ?? ''),
                  score: Number(bn.score ?? 0),
                  grade: String(bn.grade ?? ''),
              }
            : null,
    };
    const rows = Array.isArray(screens) ? screens : [];
    const porModulo: ScoreModuleRow[] = rows.map((r: any) => ({
        modulo: String(r?.screen ?? r?.modulo ?? r?.section ?? ''),
        score: Number(r?.composite ?? r?.score ?? 0),
        code: r?.code == null ? null : Number(r.code),
        wcag: r?.wcag == null ? null : Number(r.wcag),
        ux: r?.ux == null ? null : Number(r.ux),
    }));
    return { geral, pilares, porModulo };
}

// ================================================================
// ITEM → MODULE-SCORE MAPPING (Calvin 2026-06-20)
// ================================================================
// The catalog table gains a MASTER-only "Score" column showing the score
// of the MODULE a given item (handler/action/api) belongs to. Most of the
// ~1900 cross-cutting APIs have NO dedicated screen/module, so they map to
// nothing ("—") — that is expected and correct ("Score do módulo quando
// houver"). This heuristic deterministically links the items that DO touch
// one of the ~28 scored screens (porModulo) to that module's score.
//
// Strategy (pure, DOM-free, no I/O):
//   1. Tokenise the item: the api label carries a `[category]` prefix
//      (e.g. "[families] addCustomFamily()") and the name is camelCase
//      (e.g. "handleOpenCommandPalette"). We strip common verb prefixes
//      (handle/toggle/open/render/show/close) and split camelCase + kebab.
//   2. Tokenise each module id ("ui/command-palette" → ["ui","command",
//      "palette"], last segment "command-palette" → ["command","palette"]).
//   3. The LAST segment is the module's identity ("command-palette", "export",
//      "invite-sharing", "photolog"). Coverage requires ALL of its meaningful
//      tokens (stopwords like "panel"/"modal" dropped) present in the item.
//      When the last segment has NO meaningful token (e.g. "training/panel" →
//      "panel" is a stopword), fall back to requiring the PREFIX token
//      ("training") instead — so generic "[ui] openPanel" maps to nothing but
//      "handleTrainingPanel" maps to training/panel.
//   4. A module token is "present" when it matches an item token exactly, OR
//      the item's joined token string contains it (single module token
//      "photolog" ≈ name tokenised to {photo,log}), OR it stem-matches (one is
//      a length-≥4 prefix of the other, "sharing" ≈ "share"). Conservative —
//      a module matches only on FULL coverage (few false positives).
//   5. Specificity = matched meaningful tokens, +1 when the module PREFIX
//      token also appears in the item (more segments matched = more specific).
//      Pick the highest specificity; ties → higher score → lexical order.
//   6. The api label `[category]` prefix is ALSO matched against the module
//      prefix (e.g. "[report] exportPdf" + "report/export") so a category hint
//      links when the name alone is ambiguous.
//
// Returns the most specific match, or null when nothing maps.

/** Verb-ish prefixes stripped from handler/action names before tokenising. */
const _ITEM_VERB_PREFIXES = ['handle', 'toggle', 'open', 'close', 'render', 'show', 'hide', 'get', 'set'];

/** Generic tokens that must never, on their own, drive a module match. */
const _STOPWORD_TOKENS = new Set(['ui', 'core', 'app', 'js', 'panel', 'modal', 'view', 'page', 'screen']);

/**
 * Lowercase, strip a leading verb prefix, then split on camelCase / kebab /
 * snake / slash / non-alphanumerics into a Set of distinct tokens.
 * Pure helper used for both items and module ids.
 */
function _tokenize(raw: string): Set<string> {
    let s = String(raw || '');
    // camelCase / PascalCase → space-separated
    s = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    s = s.toLowerCase();
    // split on any non-alphanumeric boundary
    const parts = s.split(/[^a-z0-9]+/).filter(Boolean);
    const out = new Set<string>();
    let first = true;
    for (const p of parts) {
        // Drop a single leading verb prefix (only when it's the very first token).
        if (first && _ITEM_VERB_PREFIXES.includes(p)) {
            first = false;
            continue;
        }
        first = false;
        out.add(p);
    }
    return out;
}

/** Extract the `[category]` prefix from an item label (api items), or ''. */
function _labelCategory(label: string): string {
    const m = /^\[([^\]]+)\]/.exec(String(label || ''));
    const cap = m && m[1] ? m[1] : '';
    return cap.trim().toLowerCase();
}

/**
 * True when module token `tkn` is "present" given the item's tokens (Set) and
 * the joined item string `joined` (all item tokens concatenated, no spaces).
 * Matches on: exact token, substring of the concatenation (photo+log≈photolog),
 * or a length-≥4 stem prefix overlap (share≈sharing). Pure.
 */
function _moduleTokenPresent(tkn: string, itemTokens: Set<string>, joined: string): boolean {
    if (itemTokens.has(tkn)) return true;
    // Concatenated match: handles modules written as one word ("photolog")
    // vs camelCase names that split ("photo","log") and vice-versa.
    if (tkn.length >= 4 && joined.includes(tkn)) return true;
    // Stem overlap: one token is a >=4-char prefix of the other (share/sharing).
    if (tkn.length >= 4) {
        for (const it of itemTokens) {
            if (it.length >= 4 && (it.startsWith(tkn) || tkn.startsWith(it))) return true;
        }
    }
    return false;
}

/** Result of {@link mapItemToModuleScore}: the matched module + its score. */
export interface ItemModuleScore {
    modulo: string;
    score: number;
}

/**
 * Map a catalog item to the score of the module it belongs to, using the
 * per-module rows from the quality report. PURE, deterministic, DOM-free.
 *
 * @param item - A catalog item ({ kind, name, label, ... }).
 * @param porModulo - The report's per-module rows (modulo + score).
 * @returns { modulo, score } for the most specific matching module, or null.
 */
export function mapItemToModuleScore(
    item: { name?: string; label?: string } | null | undefined,
    porModulo: readonly ScoreModuleRow[] | null | undefined,
): ItemModuleScore | null {
    if (!item || !Array.isArray(porModulo) || porModulo.length === 0) return null;
    const itemTokens = new Set<string>([..._tokenize(item.name || ''), ..._tokenize(item.label || '')]);
    if (itemTokens.size === 0) return null;
    const joined = [...itemTokens].join('');
    const cat = _labelCategory(item.label || '');

    let best: { modulo: string; score: number; specificity: number } | null = null;
    for (const row of porModulo) {
        if (!row || typeof row.modulo !== 'string' || row.modulo === '') continue;
        const segments = row.modulo.toLowerCase().split('/').filter(Boolean);
        if (segments.length === 0) continue;
        const prefix = segments[0] ?? ''; // e.g. "ui", "core", "report", "compliance"
        const lastSeg = segments[segments.length - 1] ?? ''; // e.g. "command-palette", "export"
        const lastTokens: string[] = [...new Set<string>(lastSeg.split(/[^a-z0-9]+/).filter(Boolean))];
        // The last segment is the module identity; drop generic stopwords.
        const lastMeaningful = lastTokens.filter((tkn: string) => !_STOPWORD_TOKENS.has(tkn));
        const prefixMeaningful = prefix !== '' && !_STOPWORD_TOKENS.has(prefix);

        // Required token set = last-segment meaningful tokens, OR (when the last
        // segment is all stopwords, e.g. "panel") the meaningful prefix as a
        // fallback. A module with neither can never match.
        let required: string[];
        if (lastMeaningful.length > 0) {
            required = lastMeaningful;
        } else if (prefixMeaningful) {
            required = [prefix];
        } else {
            continue;
        }

        // Full coverage: every required module token present in the item.
        const covered = required.every((tkn: string) => _moduleTokenPresent(tkn, itemTokens, joined));

        // Category hint (api items): `[cat]` equals the module prefix AND the
        // last-segment tokens are present — links e.g. "[report] exportPdf" to
        // "report/export" when the name alone covers only "export".
        const catHints =
            cat !== '' &&
            cat === prefix &&
            lastMeaningful.length > 0 &&
            lastMeaningful.every((tkn: string) => _moduleTokenPresent(tkn, itemTokens, joined));

        if (!covered && !catHints) continue;

        // Specificity = required tokens matched, +1 when the (meaningful) prefix
        // ALSO appears in the item (more module segments matched ⇒ more specific).
        // Only a boost when the prefix is distinct from the required set (i.e. the
        // last segment carried the identity, not the prefix-fallback case).
        let specificity = covered ? required.length : Math.max(1, lastMeaningful.length);
        if (prefixMeaningful && lastMeaningful.length > 0 && _moduleTokenPresent(prefix, itemTokens, joined)) {
            specificity += 1;
        }
        const candidate = { modulo: row.modulo, score: Number(row.score) || 0, specificity };
        if (
            !best ||
            candidate.specificity > best.specificity ||
            (candidate.specificity === best.specificity && candidate.score > best.score) ||
            (candidate.specificity === best.specificity &&
                candidate.score === best.score &&
                candidate.modulo < best.modulo)
        ) {
            best = candidate;
        }
    }
    return best ? { modulo: best.modulo, score: best.score } : null;
}

/**
 * Filter items by a free-text query (matches `name` OR `label`,
 * case-insensitive) and cap the result, reporting truncation.
 *
 * @param items - The full catalog (assumed already deduped + sorted).
 * @param query - Free-text query; empty/whitespace means "no filter".
 * @param cap - Max rows to return (defaults to DEFAULT_RENDER_CAP).
 * @returns rows + counts so callers can warn about truncation.
 */
export function filterAndSliceItems(
    items: readonly SystemCatalogItem[],
    query: string,
    cap: number = DEFAULT_RENDER_CAP,
): FilteredRowsResult {
    const q = (query || '').trim().toLowerCase();
    const matched = q
        ? items.filter((i) => i.name.toLowerCase().includes(q) || i.label.toLowerCase().includes(q))
        : items.slice();
    const total = matched.length;
    const effectiveCap = cap > 0 ? cap : matched.length;
    const rows = matched.slice(0, effectiveCap);
    return {
        rows,
        total,
        shown: rows.length,
        truncated: total > rows.length,
    };
}
