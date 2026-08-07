// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   SLUGIFY (utils/helpers — Module C extraction)
   ================================================================

   Canonical slug generator. Extraído de 5 implementações duplicadas:
     - core/documents/complianceDocIndex.ts (separator='-')
     - core/forum/forumGroupRegistry.ts (separator='-')
     - core/radar/profileRegistry.ts (separator='_')
     - core/radar/sliceManager.ts (separator='_', maxLength=64)
     - utils/ui/radar/profileManagerModal.ts (separator='_', fallback='profile')

   Pipeline:
     1. Defensive: non-string → fallback (default '')
     2. NFD normalize + strip combining marks (acentos PT/ES/FR)
     3. Lowercase + trim
     4. Replace non-[a-z0-9] runs by separator
     5. Strip leading/trailing separators
     6. Truncate to maxLength (default null = unlimited)
     7. Empty result → fallback
   ================================================================ */

export interface SlugifyOptions {
    /** Separator entre tokens (default '-'). Use '_' para id-style. */
    separator?: string;
    /** Truncar a N chars (default null = sem limite). */
    maxLength?: number | null;
    /** String retornada se input non-string OR resultado vazio (default ''). */
    fallback?: string;
}

/**
 * Canoniza string para slug seguro (URLs, ids, file names).
 *
 * Defaults batem com a maioria dos consumers dash-style (compliance,
 * forum). Pass separator='_' para id-style (radar, profile).
 *
 * Acentos PT/ES/FR/etc são removidos via NFD + strip combining marks
 * (range ̀-ͯ). Diacritics CJK preservadas (não cobertas
 * pelo range latin).
 */
export function slugify(input: any, opts: SlugifyOptions = {}): string {
    const separator = opts.separator ?? '-';
    const maxLength = opts.maxLength ?? null;
    const fallback = opts.fallback ?? '';
    if (typeof input !== 'string') return fallback;
    let s = input
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
    // Replace runs of non-[a-z0-9] by separator
    const sepRegex = new RegExp(`[^a-z0-9]+`, 'g');
    s = s.replace(sepRegex, separator);
    // Strip leading/trailing separators (escapando regex)
    const escapedSep = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`^${escapedSep}+|${escapedSep}+$`, 'g'), '');
    if (maxLength && maxLength > 0 && s.length > maxLength) {
        s = s.slice(0, maxLength);
        // re-strip trailing separator se truncou no meio de boundary
        s = s.replace(new RegExp(`${escapedSep}+$`, 'g'), '');
    }
    return s || fallback;
}
