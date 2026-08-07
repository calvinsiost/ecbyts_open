// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/**
 * PhotoLog GPS coordinates label — pure view-model derivation.
 *
 * Formats a `{ lat, lng }` GPS object into the single line shown next to
 * "GPS:" in the capture modal. Extracted verbatim from
 * `utils/ui/photoLogModal.ts` `_showGps()` so the modal keeps no inline
 * coordinate-formatting logic (REFACTOR: behaviour preserved byte-for-byte).
 *
 * Original inline expression (oracle for byte-parity):
 *   `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}`
 *
 * The 6-decimal fixed precision matches the EXIF/Geolocation source resolution
 * (~0.11 m at the equator) and keeps the readout stable across capture sources
 * (EXIF parse vs Geolocation API fallback). No DOM: the caller still owns
 * assigning the result to `textContent` and toggling visibility.
 *
 * Pure: no DOM, camera, fetch, i18n side-effects. Tests live in
 * `tests/photolog-gps-coords-label-pure.test.mjs`.
 */

/**
 * Minimal shape consumed from a GPS reading. Numeric `lat`/`lng` are required
 * because `.toFixed(6)` is called on them — matching the original inline code,
 * which assumed both fields were present (the caller guards `if (... && gps)`
 * before invoking, so this function is never reached with a null reading).
 */
export interface PhotoLogGpsLike {
    lat: number;
    lng: number;
}

/**
 * Returns the "lat, lng" coordinate label for a PhotoLog GPS reading.
 *
 * @param gps The GPS reading (`lat`/`lng` in decimal degrees, WGS84).
 * @returns The label, e.g. `"-23.550520, -46.633308"`.
 */
export function photoGpsCoordsLabel(gps: PhotoLogGpsLike): string {
    return `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}`;
}
