// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Environment Badge UI - Item 9.60 wire-up
 *
 * Thin view over core/environment/environmentDetector.js. Reads the
 * detected environment profile from the current hostname and renders
 * a colored badge in the titlebar (#environment-badge element).
 *
 * Production: badge is hidden (no visual noise).
 * Homologation/dev/preview/unknown: badge visible with color + text +
 * tooltip warning.
 *
 * Called once during main.js boot via initEnvironmentBadge().
 *
 * E2E verifiable: DOM element #environment-badge with text content +
 * data-environment attribute for spec assertions.
 */

import { detectEnvironmentFromWindow, isProduction } from '../../core/environment/environmentDetector.js';

/**
 * Initialize the environment badge in the titlebar.
 * Idempotent - safe to call multiple times.
 *
 * @returns the detected environment profile (for callers that
 * want to gate other features on it, e.g. destructive-action guards)
 */
export function initEnvironmentBadge(): object {
    const env = detectEnvironmentFromWindow() as any;
    const badge = document.getElementById('environment-badge');

    if (!badge) {
        // Titlebar not yet mounted - defer to next tick
        return env;
    }

    if (!env || !env.showIndicator || isProduction(env)) {
        // Production or unknown shape → keep hidden
        badge.hidden = true;
        badge.removeAttribute('data-environment');
        badge.textContent = '';
        return env;
    }

    badge.hidden = false;
    badge.dataset.environment = env.name;
    badge.textContent = env.label || env.name.toUpperCase();
    if (env.color) {
        badge.style.backgroundColor = env.color;
    }
    if (env.warning) {
        badge.title = env.warning;
        badge.setAttribute('aria-label', `${env.label}: ${env.warning}`);
    } else {
        badge.title = `Ambiente: ${env.name}`;
        badge.setAttribute('aria-label', `Ambiente: ${env.name}`);
    }
    badge.setAttribute('role', 'status');

    return env;
}

/**
 * Re-evaluate and re-render the badge. Useful when the URL changes
 * via SPA-style navigation (rare in ecbyts but cheap to support).
 */
export function refreshEnvironmentBadge() {
    return initEnvironmentBadge();
}
