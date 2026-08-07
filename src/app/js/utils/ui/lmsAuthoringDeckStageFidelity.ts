// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

import { escapeHtml, escapeAttr } from '../helpers/html.js';
import type { DeckWorkbenchImageStats } from './lmsAuthoringDeckWorkbenchTypes.js';

function fidelityAction(stats: DeckWorkbenchImageStats): string {
    if (!stats.missing) return '';
    return `<div class="lms-author-deck-fidelity-actions">
        <button type="button" class="btn btn-secondary lms-author-fidelity-action lms-author-import-faithful-package">
            ${escapeHtml('Importar pacote fiel')}
        </button>
    </div>`;
}

function fidelityTitle(stats: DeckWorkbenchImageStats): string {
    if (stats.missing) return `${stats.missing} slide${stats.missing === 1 ? '' : 's'} sem imagem fiel`;
    return `${stats.linkedOnly} imagem${stats.linkedOnly === 1 ? '' : 'ns'} vinculada${stats.linkedOnly === 1 ? '' : 's'} ao Files`;
}

function fidelityMessage(stats: DeckWorkbenchImageStats): string {
    if (stats.missing) {
        return 'Estes slides ainda aparecem como texto. Reimporte o pacote fiel ou confira a geracao das imagens antes de usar em sala.';
    }
    return 'As imagens existem como referencia externa. Abra Files da aula para confirmar permissao e preview antes de apresentar.';
}

export function renderDeckWorkbenchFidelityNotice(stats: DeckWorkbenchImageStats): string {
    if (!stats.total || (!stats.missing && !stats.linkedOnly)) return '';
    const status = stats.missing ? 'atencao' : 'files';
    return `<div class="lms-author-deck-fidelity lms-author-deck-fidelity--${escapeAttr(status)}"
        role="status" aria-label="${escapeAttr('Fidelidade visual do PowerPoint')}">
        <span>${escapeHtml('Fidelidade PPT')}</span>
        <strong>${escapeHtml(fidelityTitle(stats))}</strong>
        <p>${escapeHtml(fidelityMessage(stats))}</p>
        ${fidelityAction(stats)}
    </div>`;
}
