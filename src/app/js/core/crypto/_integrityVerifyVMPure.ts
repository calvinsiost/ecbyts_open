// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   INTEGRITY VERIFY VM — view-model da verificação de integridade
   FRIEND-SCORE-001 P3-2 (Calvin loop 2026-06-14). A verificação
   blockchain (Merkle/hash-chain) já existe em core/crypto; faltava o
   BOTÃO óbvio na UI para o regulador/auditor confirmar que o dado não
   foi adulterado. Este pure mapeia o RESULTADO da verificação → VM de
   apresentação (verdict + tom + chaves i18n). Sem DOM, sem rede.
   ================================================================ */

export type IntegrityVerdict = 'verified' | 'tampered' | 'sealed' | 'empty' | 'error';
export type IntegrityTone = 'green' | 'red' | 'blue' | 'neutral';

export interface IntegrityVerifyInput {
    /** Merkle root recomputado dos elementos atuais. */
    readonly root?: string | null;
    /** Nº de elementos no modelo. */
    readonly elementsCount?: number;
    /** Root esperado (de uma chave ECBT Type B importada), se houver. */
    readonly expectedRoot?: string | null;
    /** Erro ocorrido na recomputação, se houver. */
    readonly error?: string | null;
}

export interface IntegrityVerifyVM {
    readonly verdict: IntegrityVerdict;
    readonly tone: IntegrityTone;
    readonly titleKey: string;
    readonly messageKey: string;
    /** Root abreviado para exibição (primeiros 16 chars). */
    readonly rootShort: string;
    readonly elementsCount: number;
    /** True se o usuário deve comparar o selo com uma cópia externa. */
    readonly isSeal: boolean;
}

const TONE: Readonly<Record<IntegrityVerdict, IntegrityTone>> = Object.freeze({
    verified: 'green',
    tampered: 'red',
    sealed: 'blue',
    empty: 'neutral',
    error: 'red',
});

/** Abrevia um hash para exibição (16 chars + reticências). */
export function shortenRoot(root: unknown): string {
    const s = typeof root === 'string' ? root : '';
    return s.length > 16 ? s.slice(0, 16) + '…' : s;
}

/**
 * Decide o veredito da verificação de integridade.
 * - error: falha ao recomputar.
 * - empty: modelo sem elementos (nada a verificar).
 * - expectedRoot presente → verified (confere) | tampered (diverge).
 * - sem expectedRoot → sealed: exibe o selo atual para comparação externa.
 */
export function buildIntegrityVerifyVM(input: IntegrityVerifyInput): IntegrityVerifyVM {
    const root = typeof input?.root === 'string' ? input.root : '';
    const elementsCount = typeof input?.elementsCount === 'number' && input.elementsCount >= 0 ? input.elementsCount : 0;
    const expected = typeof input?.expectedRoot === 'string' && input.expectedRoot ? input.expectedRoot : null;

    let verdict: IntegrityVerdict;
    if (input?.error) verdict = 'error';
    else if (!root || elementsCount === 0) verdict = 'empty';
    else if (expected) verdict = expected === root ? 'verified' : 'tampered';
    else verdict = 'sealed';

    return Object.freeze({
        verdict,
        tone: TONE[verdict],
        titleKey: `integrity.verify.${verdict}.title`,
        messageKey: `integrity.verify.${verdict}.message`,
        rootShort: shortenRoot(root),
        elementsCount,
        isSeal: verdict === 'sealed',
    });
}
