// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

import { normalizedToCampaignIndex } from '../sequencer/temporalFilter.js';

export interface TimeToXOptions {
    mode?: 'campaign' | 'date' | string;
    xScale?: number;
    xOffset?: number;
    campaigns?: Array<unknown>;
}

/**
 * Map temporal timeValue (normalized 0..1) to X coordinate.
 *
 * @param timeValue - Normalized time 0..1
 * @param options - Mapping options
 * @returns X coordinate
 */
export function timeToX(timeValue: number, options: TimeToXOptions = {}): number {
    const { mode = 'date', xScale = 100, xOffset = 0, campaigns = [] } = options;

    if (mode === 'campaign') {
        const n = campaigns.length;
        if (n === 0) return xOffset;
        const index = normalizedToCampaignIndex(timeValue, n);
        return xOffset + index * xScale;
    }

    // Default: Mode 'date' - linear normalized 0..1 mapping
    return xOffset + (timeValue || 0) * xScale;
}
