// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// DEEP-LINK-TOOLS-001 Sprint 2 - EIS Dashboard share button wire.
//
// Keeps the EIS monolith small: the handler only calls this idempotent helper.
import { createDeepLinkShareButton } from '../sharing/_deepLinkShareButton.js';
import { showToast } from '../ui/toast.js';

/**
 * Wire the canonical "Compartilhar" button into the EIS modal header.
 * Injeta o botao no header real do modal sem duplicar em reaberturas.
 */
export function wireEisShareButton(modal: HTMLElement | null): void {
    if (!modal) return;
    try {
        const actions = modal.querySelector('.eis-header-actions');
        const close = modal.querySelector('.eis-close-btn');
        if (!actions || !close || actions.querySelector('[data-tool-id="eis"]')) return;

        const shareButton = createDeepLinkShareButton({
            toolId: 'eis',
            getPayload: () => null,
            toast: showToast,
        });
        actions.insertBefore(shareButton, close);
    } catch (e) {
        console.debug('[eisShareButton] wire failed', (e as Error)?.message || e);
    }
}
