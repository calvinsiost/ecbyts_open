// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// utils/handlers/ecbtValidatorHandler.js
// Wire-up of P1-94 ECBT segment validator (commit fb05a1cc) into UI.
// Provides window.handleValidateEcbtKey() - prompts user for ECBT key, validates segments,
// shows result via toast or async confirm.

import { asyncPrompt } from '../ui/asyncDialogs.js';
import { extractFamilyCodeFromKey } from '../../core/io/segmentValidator.js';
import { validateEcbtFormat } from '../../core/io/ecbtVersioning.js';
import { showToast } from '../ui/toast.js';

export async function handleValidateEcbtKey() {
    const key = await asyncPrompt('Validar ECBT Key — Cole a chave ECBT a validar:', '');
    if (!key) return;

    const trimmed = String(key).trim();
    const formatResult = validateEcbtFormat(trimmed);

    if (!formatResult.valid) {
        const errMsg = (formatResult.errors || ['Formato inválido']).join('; ');
        showToast('ECBT inválida: ' + errMsg, 'error');
        return;
    }

    const family = extractFamilyCodeFromKey(trimmed);
    const summary = `Tipo: ${formatResult.type} | Versão: ${formatResult.version} | Segmentos: ${formatResult.segmentCount} | Família: ${family || '?'}`;
    showToast('ECBT válida — ' + summary, 'success');
}

export const ecbtValidatorHandlers = { handleValidateEcbtKey };
