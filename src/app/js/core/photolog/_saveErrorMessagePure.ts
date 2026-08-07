// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/**
 * PhotoLog save-error → user message — pure logic.
 *
 * Maps an `addPhoto()` failure code (see `core/photolog/manager.ts`) to the
 * user-facing message shown by the capture modal toast. Extracted verbatim from
 * `utils/ui/photoLogModal.ts` `_save()` so the modal keeps no inline string
 * mapping (REFACTOR: behaviour preserved byte-for-byte).
 *
 * Known codes from `addPhoto()`: `invalid_element`, `element_not_found`,
 * `invalid_mime_type`, `duplicate_photo`, `storage_full`. Only `storage_full`
 * and `duplicate_photo` get bespoke copy; every other code (known or unknown)
 * falls through to the generic `Erro: {code}` form — matching the original.
 *
 * Pure: no DOM, camera, fetch, i18n side-effects. Tests live in
 * `tests/photolog-save-error-pure.test.mjs`.
 */

/**
 * Returns the toast message for a PhotoLog save error code.
 *
 * Accepts `string | undefined` because the caller reads `result.error` off the
 * `addPhoto()` discriminated union, where TS widens it to possibly-undefined.
 * An undefined code falls through to `Erro: undefined`, matching the original
 * inline template literal byte-for-byte.
 *
 * @param error The `result.error` value returned by `addPhoto()`.
 * @returns The user-facing message string.
 */
export function photoSaveErrorMessage(error: string | undefined): string {
    return error === 'storage_full'
        ? 'Armazenamento cheio — libere espaco'
        : error === 'duplicate_photo'
          ? 'Foto ja existe para este elemento'
          : `Erro: ${error}`;
}
