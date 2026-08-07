// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { validateEcbtFormat, extractEcbtMetadata } from '../../core/io/ecbtVersioning.js';

export interface VerifyKeyResult {
    verdict: 'valid_a' | 'valid_b' | 'valid_c' | 'invalid_format' | 'empty';
    label: string;
    type: string | null;
    version: string | null;
    family: string | null;
    segmentCount: number;
    errors: readonly string[];
}

const TYPE_LABELS: Record<string, string> = {
    A: 'Chave simples (tipo A) — formato válido',
    B: 'Chave com cadeia de proveniência (tipo B) — formato válido',
    C: 'Chave comprimida (tipo C) — formato válido',
};

export function verifyKeyFormat(raw: string): VerifyKeyResult {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) {
        return { verdict: 'empty', label: 'Nenhuma chave fornecida', type: null, version: null, family: null, segmentCount: 0, errors: ['empty_key'] };
    }
    const fmt = validateEcbtFormat(trimmed);
    if (!fmt.valid || !fmt.type) {
        return { verdict: 'invalid_format', label: 'Formato inválido', type: fmt.type, version: fmt.version, family: null, segmentCount: fmt.segmentCount, errors: fmt.errors };
    }
    const meta = extractEcbtMetadata(trimmed);
    return {
        verdict: `valid_${fmt.type.toLowerCase()}` as VerifyKeyResult['verdict'],
        label: TYPE_LABELS[fmt.type] ?? 'Formato válido',
        type: fmt.type,
        version: fmt.version,
        family: meta?.family ?? null,
        segmentCount: fmt.segmentCount,
        errors: [],
    };
}

export async function handleVerifyKeyPublic(): Promise<void> {
    const { asyncPrompt } = await import('../ui/asyncDialogs.js' as string);
    const { showToast } = await import('../ui/toast.js' as string);
    const key = await asyncPrompt('Verificar chave ECBT — Cole a chave ECBT:', '');
    if (!key) return;
    const result = verifyKeyFormat(String(key));
    if (result.verdict === 'empty') return;
    if (result.verdict === 'invalid_format') {
        showToast(`ECBT inválida: ${result.errors.join('; ')}`, 'error');
        return;
    }
    showToast(`${result.label} · família ${result.family ?? '?'} · v${result.version}`, 'success');
}

export const verifyKeyHandlers = { handleVerifyKeyPublic };
