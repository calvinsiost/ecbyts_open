// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   HISTORY HANDLERS — Undo/Redo actions
   Handlers para desfazer e refazer acoes no modelo.
   ================================================================ */

import { undo, redo } from '../history/manager.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';

/**
 * Handle undo action.
 * Desfaz a ultima acao realizada no modelo.
 */
export function handleUndo() {
    if (undo()) {
        showToast(t('undone'), 'info');
    } else {
        showToast(t('nothingToUndo'), 'warning');
    }
}

/**
 * Handle redo action.
 * Refaz a acao desfeita anteriormente.
 */
export function handleRedo() {
    if (redo()) {
        showToast(t('redone'), 'info');
    } else {
        showToast(t('nothingToRedo'), 'warning');
    }
}

export const historyHandlers = {
    handleUndo,
    handleRedo,
};
