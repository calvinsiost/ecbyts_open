// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   FORMAT BYTES — Canonical byte-size formatter (consolidação dedup)

   Substitui 4 implementações divergentes pré-existentes:
   - utils/handlers/_librariesPure.formatBytes (B / KB / MB)
   - utils/handlers/libraries.formatBytes (cópia)
   - utils/ui/recoveryDialog.formatBytes (B / KB / MB com '0 B' fallback)
   - core/report/filesIntegration.formatFileSize (B / KB / MB / GB com '—' fallback)

   Cada call site preserva sua saída visual via options (unknownLabel,
   maxUnit, decimal precision per unit). Pure: sem state, sem DOM.
   ================================================================ */

export type ByteUnit = 'B' | 'KB' | 'MB' | 'GB';

export interface FormatBytesOptions {
    /** String returned for invalid/negative input. Default `'-'`. */
    unknownLabel?: string;
    /** Maximum unit to scale to. Default `'MB'` (legacy libraries behavior). */
    maxUnit?: ByteUnit;
    /** Decimals shown for B. Default `0` (integer). */
    bDecimals?: number;
    /** Decimals shown for KB. Default `0` (integer, round). */
    kbDecimals?: number;
    /** Decimals shown for MB. Default `1`. */
    mbDecimals?: number;
    /** Decimals shown for GB. Default `2`. */
    gbDecimals?: number;
    /** When true, `0` returns `unknownLabel` instead of `'0 B'`. Default `false`. */
    zeroAsUnknown?: boolean;
}

const UNIT_RANK: Record<ByteUnit, number> = { B: 0, KB: 1, MB: 2, GB: 3 };

/**
 * Format a byte count as a human-readable size string.
 *
 * Examples:
 *   formatBytes(2_400_000) → "2.3 MB"
 *   formatBytes(3_000_000_000, { maxUnit: 'GB' }) → "2.79 GB"
 *   formatBytes(NaN, { unknownLabel: '—' }) → "—"
 *   formatBytes(0, { zeroAsUnknown: true }) → "-"
 *   formatBytes(0) → "0 B"
 */
export function formatBytes(bytes: unknown, opts: FormatBytesOptions = {}): string {
    const unknownLabel = opts.unknownLabel ?? '-';
    const maxUnit: ByteUnit = opts.maxUnit ?? 'MB';
    const bDec = opts.bDecimals ?? 0;
    const kbDec = opts.kbDecimals ?? 0;
    const mbDec = opts.mbDecimals ?? 1;
    const gbDec = opts.gbDecimals ?? 2;
    const zeroAsUnknown = opts.zeroAsUnknown === true;
    const maxRank = UNIT_RANK[maxUnit];

    if (bytes === null || bytes === undefined) return unknownLabel;
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return unknownLabel;
    if (n === 0) return zeroAsUnknown ? unknownLabel : '0 B';

    // GB
    if (maxRank >= UNIT_RANK.GB && n >= 1024 * 1024 * 1024) {
        return `${(n / (1024 * 1024 * 1024)).toFixed(gbDec)} GB`;
    }
    // MB
    if (maxRank >= UNIT_RANK.MB && n >= 1024 * 1024) {
        return `${(n / (1024 * 1024)).toFixed(mbDec)} MB`;
    }
    // KB
    if (maxRank >= UNIT_RANK.KB && n >= 1024) {
        const v = n / 1024;
        return kbDec === 0 ? `${Math.round(v)} KB` : `${v.toFixed(kbDec)} KB`;
    }
    // B
    return bDec === 0 ? `${Math.round(n)} B` : `${n.toFixed(bDec)} B`;
}
