// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// utils/handlers/productTiersHandler.js
// Wire-up of P1-44 product tiers schema into UI.
// window.handleShowProductTiers() - shows tier features + upgrade path via toast.
import { PRODUCT_TIERS, getTierFeatures, isFeatureAvailable, getUpgradePath, } from '../../core/metering/productTiers.js';
import { summarizeTier3CoordinateRuntime } from '../../core/bindings/tier3CoordinateRuntime.js';
import { showToast } from '../ui/toast.js';
export function handleShowProductTiers() {
    const tiers = Object.values(PRODUCT_TIERS);
    const free = getTierFeatures(PRODUCT_TIERS.FREE as string);
    const premium = getTierFeatures(PRODUCT_TIERS.PREMIUM as string);
    const aiOnFree = isFeatureAvailable(PRODUCT_TIERS.FREE as string, 'aiChat');
    const aiOnPremium = isFeatureAvailable(PRODUCT_TIERS.PREMIUM as string, 'aiChat');
    const upgrade = getUpgradePath(PRODUCT_TIERS.FREE as string);
    const g = globalThis as { getAllElements?: () => unknown[]; getElementsForExport?: () => unknown[]; __ecbyts_elements?: unknown[] };
    const elements = g.getAllElements?.() || g.getElementsForExport?.() || g.__ecbyts_elements || [];
    const tier3Coordinates = summarizeTier3CoordinateRuntime(elements);
    const lines = [
        `Product tiers - ${tiers.length} tiers: ${tiers.join(', ')}`,
        `FREE: maxElements=${free.maxElements}, aiChat=${aiOnFree ? 'YES' : 'NO'}`,
        `PREMIUM: maxElements=${premium.maxElements}, aiChat=${aiOnPremium ? 'YES' : 'NO'}`,
        `Tier3 coordinates: ${tier3Coordinates.coordinateCount} persisted, ${tier3Coordinates.boundObservationCount} bound observations`,
        `Upgrade FREE: ${upgrade}`,
    ];
    showToast(lines.join(' - '), 'info', 7000);
}
export const productTiersHandlers = { handleShowProductTiers };
