// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
import { getAllElements, getElementById, updateElement } from '../../core/elements/manager.js';
import { createTier3CoordinateBindingHandlers } from '../ui/tier3CoordinateBindingUi.js';
import { updateElementDetails } from '../ui/lists.js';
import { showToast } from '../ui/toast.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
let _requestUIRefresh: any = null;
/**
 * Inject UI refresh dependency for the tier-3 coordinate binding handlers.
 * @param {(() => void) | null | undefined} fn
 */
export function setTier3CoordinateBindingUpdateAllUI(fn: any) {
    _requestUIRefresh = typeof fn === 'function' ? fn : null;
}
function requestTier3CoordinateUIRefresh(reason = 'tier3-coordinate.changed') {
    if (!_requestUIRefresh)
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.STATUS,
    ];
    for (const domain of domains) {
        _requestUIRefresh(domain, reason);
    }
}
export const tier3CoordinateBindingHandlers = createTier3CoordinateBindingHandlers({
    getElementById,
    getAllElements,
    updateElement,
    updateElementDetails,
    requestUIRefresh: () => requestTier3CoordinateUIRefresh(),
    showToast,
});
