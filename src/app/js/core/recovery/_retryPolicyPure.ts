// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Offline Queue Retry Policy - pure decision slice extracted from offlineQueue.markFailed.
// Phase 2 of SPEC_ERROR_RECOVERY_JOURNEY (UX-42) / ARCH-MONOLITH-ATOMIZATION-001.
//
// Puro: zero DOM, zero rede, zero IDB, zero side effects. Decide, após uma falha
// de sync, qual o próximo retryCount e status de uma mutation: se ainda há
// tentativas disponíveis (< maxRetries) ela volta para 'pending' para novo retry;
// caso contrário esgota e vira 'failed'. Decisão atômica, separada da máquina de
// estado do queue para ser testável e reusável isoladamente.

/**
 * Resultado da decisão de retry: novo contador e status terminal/retomável.
 */
export interface RetryDecision {
    readonly retryCount: number;
    readonly status: 'pending' | 'failed';
}

/**
 * Decide o próximo estado de uma mutation que acabou de falhar o sync.
 *
 * Regra (idêntica ao comportamento inline anterior de markFailed):
 *   nextRetry = currentRetryCount + 1
 *   status    = nextRetry >= maxRetries ? 'failed' : 'pending'
 *
 * Com maxRetries=0 a primeira falha já esgota (1 >= 0 → 'failed').
 *
 * @param currentRetryCount número de tentativas já consumidas (>= 0, inteiro)
 * @param maxRetries teto de tentativas (>= 0, inteiro)
 * @returns RetryDecision congelado { retryCount, status }
 */
export function decideRetry(currentRetryCount: number, maxRetries: number): RetryDecision {
    if (!Number.isInteger(currentRetryCount) || currentRetryCount < 0) {
        throw new Error('decideRetry: currentRetryCount must be a non-negative integer');
    }
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
        throw new Error('decideRetry: maxRetries must be a non-negative integer');
    }
    const retryCount = currentRetryCount + 1;
    const status: 'pending' | 'failed' = retryCount >= maxRetries ? 'failed' : 'pending';
    return Object.freeze({ retryCount, status });
}

export default { decideRetry };
