// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/**
 * PhotoLog element-dropdown option label — pure view-model derivation.
 *
 * Derives the visible text of one `<option>` in the "Vinculado a" element
 * selector of the capture modal. Extracted verbatim from
 * `utils/ui/photoLogModal.ts` `_populateElementDropdown()` so the modal keeps
 * no inline label-formatting logic (REFACTOR: behaviour preserved
 * byte-for-byte).
 *
 * Original inline expression (oracle for byte-parity):
 *   `${el.name || el.id} (${el.family})`
 *
 * The `el.name || el.id` fallback handles elements that have no human-readable
 * name yet (freshly created PDPL-U nodes), falling back to the stable id so the
 * option is never blank. `el.family` is appended in parentheses to disambiguate
 * elements that share a name across families.
 *
 * Pure: no DOM, camera, fetch, i18n side-effects. Tests live in
 * `tests/photolog-element-option-label-pure.test.mjs`.
 */

/**
 * Minimal shape consumed from an element view-model. Kept permissive (`any`)
 * fields so the function matches the dynamically-typed elements returned by
 * `core/elements/manager.getAllElements()` without coupling to its full type.
 */
export interface PhotoLogElementLike {
    id?: any;
    name?: any;
    family?: any;
}

/**
 * Returns the dropdown option label for a PhotoLog-linkable element.
 *
 * @param el The element view-model (needs `id`, optional `name`, `family`).
 * @returns The option text, e.g. `"Poço PM-01 (well)"` or `"el-42 (well)"`.
 */
export function photoElementOptionLabel(el: PhotoLogElementLike): string {
    return `${el.name || el.id} (${el.family})`;
}
