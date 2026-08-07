// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/**
 * PhotoLog save-button disabled predicate — pure logic.
 *
 * Decides whether the "Salvar" button of the capture modal is disabled.
 * Extracted verbatim from `utils/ui/photoLogModal.ts` `_updateSaveButton()`
 * so the modal keeps no inline gating logic (REFACTOR: behaviour preserved
 * byte-for-byte).
 *
 * Original inline expression (oracle for byte-parity):
 *   `btn.disabled = !_state.blob || !(select?.value || _state.elementId);`
 *
 * The button is enabled only when BOTH a photo blob exists AND an element is
 * chosen — either via the live dropdown value (`select.value`) or a pre-seeded
 * `_state.elementId` (the modal opened from a specific element, dropdown
 * locked). The dropdown value takes precedence, falling back to the seeded id,
 * matching the `||` short-circuit of the original.
 *
 * Pure: no DOM, camera, fetch, i18n side-effects. The boolean result still
 * reflects truthiness semantics of the original (e.g. an empty-string
 * `selectValue` is falsy, so the seeded `elementId` is consulted). Tests live
 * in `tests/photolog-save-disabled-pure.test.mjs`.
 */

/**
 * Inputs to the save-button gate, mirroring the values the modal reads off the
 * DOM (`select?.value`) and module state (`_state.blob`, `_state.elementId`).
 * Kept permissive so callers can pass through the raw, possibly-falsy values
 * without normalising — preserving the original truthiness behaviour.
 */
export interface PhotoSaveGateInput {
    /** Whether a captured/selected photo blob is present (`_state.blob`). */
    hasBlob: unknown;
    /** Live dropdown value (`select?.value`); empty string when none chosen. */
    selectValue: unknown;
    /** Pre-seeded element id (`_state.elementId`); null when opened generically. */
    elementId: unknown;
}

/**
 * Returns whether the PhotoLog save button must be disabled.
 *
 * @param input The blob presence and element-selection signals.
 * @returns `true` when the button should be disabled (cannot save yet).
 */
export function photoSaveDisabled(input: PhotoSaveGateInput): boolean {
    const { hasBlob, selectValue, elementId } = input;
    return !hasBlob || !(selectValue || elementId);
}
