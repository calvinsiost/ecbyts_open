// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Issues BCF Handlers (P1-92)
 * Wires the BCF panel into the global window.* handler registry.
 * Follow-up commit will register this in utils/handlers/index.js.
 */

import { mountIssuesBcfPanel, renderIssuesBcfPanel, getDemoIssues } from '../ui/issuesBcfPanel.js';

/**
 * Opens (mounts + renders) the Issues BCF panel.
 * Uses demo seed when no live issues source is wired yet.
 */
export function handleOpenIssuesBcfPanel(): void {
    const panel = mountIssuesBcfPanel();
    if (!panel) return;
    // Live integration with core/issues/manager will be wired in a follow-up.
    renderIssuesBcfPanel(panel, getDemoIssues());
    panel.removeAttribute('hidden');
}

export const issuesBcfHandlers = { handleOpenIssuesBcfPanel };

/**
 * Registers window.handleOpenIssuesBcfPanel.
 * Idempotent - safe to call multiple times.
 */
export function registerIssuesBcfHandlers(): void {
    if (typeof window === 'undefined') return;
    (window as any).handleOpenIssuesBcfPanel = handleOpenIssuesBcfPanel;
}
