// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * IMPORT-UX-001 RF-2 — Handler-layer para erros de importação.
 *
 * Contrato: erros do pipeline de importação NUNCA são engolidos silenciosamente.
 * Toda falha passa por formatImportError → showErrorToast antes de qualquer
 * limpeza de estado. Reset silencioso sem mensagem visível é violação de spec.
 */

import { formatIngestionError, shouldKeepFileForRetry } from './_ingestionErrorPure.js';
import type { IngestionErrorInfo } from './_ingestionErrorPure.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';

const log = createLogger('ImportErrors');

export interface ImportErrorResult {
    info: IngestionErrorInfo;
    message: string;
    fileName: string | null;
    keepFile: boolean;
}

function extractMessage(error: unknown): string {
    if (error instanceof Error) return error.message || String(error);
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
        return String((error as Record<string, unknown>).message);
    }
    return String(error ?? 'Erro desconhecido');
}

/**
 * Formata um erro de importação em mensagem legível para o usuário.
 * Inclui o nome do arquivo quando disponível para contexto.
 * Pure no sentido de não tocar DOM — retorna string + metadata.
 */
export function formatImportError(error: unknown, fileName?: string | null): ImportErrorResult {
    const raw = extractMessage(error);
    const info = formatIngestionError(raw);
    const name = fileName || null;
    const prefix = name ? `[${name}] ` : '';
    const message = `${prefix}${info.title}: ${info.detail}`;
    const keepFile = shouldKeepFileForRetry(info);
    return { info, message, fileName: name, keepFile };
}

/**
 * Exibe toast de erro para o usuário. NUNCA usa console.log silencioso.
 * Erros retryable usam duração padrão; erros fatais (canRetry=false) são
 * persistentes (duration=0) para garantir que o usuário leia antes de agir.
 *
 * Retorna o ImportErrorResult para o caller decidir sobre estado (retry/reset).
 */
export function showErrorToast(error: unknown, fileName?: string | null): ImportErrorResult {
    const result = formatImportError(error, fileName);
    log.error('Import error surfaced to user:', result.message);
    const duration = result.info.canRetry ? undefined : 0;
    showToast(result.message, 'error', duration);
    return result;
}

/**
 * Guard: exibe o erro e retorna se o arquivo deve ser mantido para retry.
 * Caller DEVE usar o retorno para decidir sobre reset de estado:
 *   const { keepFile } = surfaceImportError(err, name);
 *   if (!keepFile) cleanupState();
 *
 * Violação: chamar cleanupState() ANTES de surfaceImportError() = reset silencioso.
 */
export function surfaceImportError(error: unknown, fileName?: string | null): ImportErrorResult {
    return showErrorToast(error, fileName);
}
