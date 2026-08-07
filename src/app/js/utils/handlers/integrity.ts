// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   INTEGRITY HANDLER — botão "Verificar integridade" (P3-2)
   FRIEND-SCORE-001 (Calvin loop 2026-06-14). A verificação Merkle/
   hash-chain já existe em core/crypto; este handler a torna ACESSÍVEL
   ao regulador/auditor: recomputa o selo de integridade do modelo
   atual e mostra o veredito num diálogo claro.
   ================================================================ */

import { getAllElements } from '../../core/elements/manager.js';
import { computeMerkleRoot } from '../../core/crypto/merkle.js';
import {
    buildIntegrityVerifyVM,
    type IntegrityVerifyVM,
} from '../../core/crypto/_integrityVerifyVMPure.js';
import { asyncConfirm } from '../ui/asyncDialogs.js';
import { t } from '../i18n/translations.js';

function _tr(key: string, params?: any): string {
    try {
        const v = t(key, params);
        return v && v !== key ? v : '';
    } catch {
        return '';
    }
}

async function _computeIntegrityVM(expectedRoot: string | null): Promise<IntegrityVerifyVM> {
    try {
        const elements = getAllElements() || [];
        const root = elements.length ? await computeMerkleRoot({ elements }) : '';
        return buildIntegrityVerifyVM({ root, elementsCount: elements.length, expectedRoot });
    } catch (e: any) {
        return buildIntegrityVerifyVM({ error: e?.message || String(e) });
    }
}

function _buildIntegrityMessage(vm: IntegrityVerifyVM) {
    const title = _tr(vm.titleKey) || 'Integridade';
    const message = _tr(vm.messageKey, { count: vm.elementsCount, root: vm.rootShort }) || '';
    const sealLine = vm.isSeal && vm.rootShort
        ? `\n\n${_tr('integrity.verify.seal') || 'Selo (Merkle root)'}: ${vm.rootShort}  ·  ${vm.elementsCount} ${_tr('integrity.verify.elements') || 'elementos'}`
        : '';
    return { title, message, sealLine };
}

async function _showIntegrityDialog(title: string, message: string, sealLine: string): Promise<void> {
    try {
        await asyncConfirm(`${title}\n\n${message}${sealLine}`, {
            confirmLabel: _tr('common.ok') || 'OK',
            cancelLabel: _tr('common.close') || 'Fechar',
        });
    } catch (e: any) {
        console.debug('[integrity:verify:dialog]', e?.message || e);
    }
}

/**
 * Verifica a integridade do modelo atual: recomputa o Merkle root dos
 * elementos e apresenta o selo (ou confronta com um root esperado, se um
 * modelo Type B importado fornecer um). Acessível via menu Exibição.
 */
export async function handleVerifyModelIntegrity(expectedRoot: string | null = null): Promise<void> {
    const vm = await _computeIntegrityVM(expectedRoot);
    const { title, message, sealLine } = _buildIntegrityMessage(vm);
    await _showIntegrityDialog(title, message, sealLine);
}

export const integrityHandlers = { handleVerifyModelIntegrity };

if (typeof window !== 'undefined' && typeof (window as any).handleVerifyModelIntegrity !== 'function') {
    (window as any).handleVerifyModelIntegrity = handleVerifyModelIntegrity;
}
