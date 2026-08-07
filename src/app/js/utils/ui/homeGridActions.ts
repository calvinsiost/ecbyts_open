// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/utils/ui/homeGridActions.js
// Registry formal + validator para SuggestedAction usadas no banner
// "Ações Sugeridas" da página home (V2 G3).
//
// Shape: { id, msg, labelKey?, handler, severity, icon? }
// - id       - unique string identifier
// - msg      - pre-translated text (pode vir de t(labelKey))
// - labelKey - i18n key original (recomendado, preenche `msg` se faltar)
// - handler  - nome do window.handleX para executar ao click
// - severity - 'info' | 'warning' | 'critical'
// - icon     - SVG icon key (default: 'alert-triangle' se warning/critical,
//              'info' caso contrário)

export const SUGGESTED_ACTION_SEVERITIES = Object.freeze(['info', 'warning', 'critical']);

const DEFAULT_ICONS = {
    info: 'info',
    warning: 'alert-triangle',
    critical: 'alert-octagon',
};

/**
 * Validate a SuggestedAction shape. Warn-only (não throw) - consumer
 * decide se filtra inválidas.
 *
 * @param {unknown} action - candidato a SuggestedAction
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSuggestedAction(action: any) {
    const errors = [];
    if (!action || typeof action !== 'object') {
        return { valid: false, errors: ['action must be an object'] };
    }
    const a = (action) as any;
    if (typeof a.id !== 'string' || !a.id) errors.push('id must be non-empty string');
    if (typeof a.msg !== 'string' || !a.msg) errors.push('msg must be non-empty string');
    if (typeof a.handler !== 'string' || !a.handler) errors.push('handler must be non-empty string');
    if (!SUGGESTED_ACTION_SEVERITIES.includes(a.severity)) {
        errors.push(`severity must be one of ${SUGGESTED_ACTION_SEVERITIES.join('|')}`);
    }
    return { valid: errors.length === 0, errors };
}

/**
 * Resolve the icon key for a given action - usa icon explícito se
 * presente, senão default por severity.
 *
 * @param {{ severity: string, icon?: string }} action
 * @returns {string}
 */
export function resolveActionIcon(action: any) {
    if (action && typeof action.icon === 'string' && action.icon) return action.icon;
    return /** @type {Record<string,string>} */ (DEFAULT_ICONS as Record<string,string>)[action?.severity] || DEFAULT_ICONS.info;
}
