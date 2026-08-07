// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { runtimeNow, runtimeRandom } from '../../core/random/runtime.js';

/**
 * Generate a prefixed ID: `${prefix}-${now}-${randomBase36}`.
 * Random chars default 9 (backward-compat com call sites legados).
 *
 * @param prefix
 * @param randomChars — número de chars random (default 9; típico 6-10)
 */
export function generateId(prefix: string | null | undefined, randomChars: number = 9): string {
    const n = randomChars > 0 ? randomChars : 9;
    return `${prefix}-${runtimeNow()}-${runtimeRandom(`id:${prefix || 'generic'}`)
        .toString(36)
        .slice(2, 2 + n)}`;
}
