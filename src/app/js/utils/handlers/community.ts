// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   COMMUNITY HANDLERS — Open/close community panel
   ================================================================ */

/**
 * Open the community panel as a fullscreen modal overlay.
 * Abre o painel comunitario como modal sobreposto.
 *
 * 2026-04-11: previous implementation tried to import `togglePanel` and
 * `registerTabContent` from panelManager.js but neither is exported there
 * (`registerTabContent` doesn't exist at all, `togglePanel` is internal).
 * Surfaced by click-everything.spec.ts as a TypeError.
 *
 * Fix: render the community panel as a centered overlay modal - same
 * pattern as other "open X panel" handlers that don't have a docked tab.
 */
async function handleOpenCommunityPanel() {
    try {
        const { initCommunityPanel } = await import('../ui/communityPanel.js');

        // Reuse existing overlay if already created - idempotent
        let overlay = document.getElementById('community-modal-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            return;
        }

        // B2 migração 2026-05-29: .modal-overlay → .ecbt-overlay + .ecbt-dialog--2xl.
        // Drena #3: max-width:1100px;width:100%;max-height:85vh inline → tokens.
        overlay = document.createElement('div');
        overlay.id = 'community-modal-overlay';
        overlay.className = 'ecbt-overlay community-overlay';

        const card = document.createElement('div');
        card.className = 'ecbt-dialog ecbt-dialog--2xl community-modal-card';

        // Close button (ecbt-dialog-close, posicionado absolutamente para overlay no card)
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'ecbt-dialog-close community-close';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = 'position:absolute;top:8px;right:12px;';
        closeBtn.addEventListener('click', () => {
            overlay.style.display = 'none';
        });

        // Inner container that initCommunityPanel will populate
        const inner = document.createElement('div');
        inner.id = 'community-panel-inner';

        card.appendChild(closeBtn);
        card.appendChild(inner);
        overlay.appendChild(card);

        // Click outside card to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.style.display = 'none';
        });
        // Escape to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') overlay.style.display = 'none';
        });

        document.body.appendChild(overlay);
        initCommunityPanel(inner);
    } catch (err) {
        console.error('[ecbyts] Failed to open community panel', err);
    }
}

export const communityHandlers = {
    handleOpenCommunityPanel,
};
