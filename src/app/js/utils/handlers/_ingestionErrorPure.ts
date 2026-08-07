// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * IMPORT-UX-001 RF-2 — Pure logic para formatar erros do pipeline de
 * ingestão em mensagens claras para o usuário (pt-BR). Sem DOM/i18n.
 *
 * Princípio: cada tipo de erro recebe (a) um título curto, (b) detalhe
 * com causa raiz em linguagem leiga, (c) uma ação sugerida.
 */

export interface IngestionErrorInfo {
    title: string;
    detail: string;
    canRetry: boolean;
}

/** Mensagens canônicas para erros conhecidos do pipeline. */
const ERROR_PATTERNS: Array<{ test: RegExp; info: IngestionErrorInfo }> = [
    {
        test: /timed?\s*out|timeout/i,
        info: {
            title: 'Tempo esgotado na extração',
            detail:
                'O documento demorou mais de 60 segundos para processar. ' +
                'PDFs muito grandes ou escaneados podem exigir mais tempo.',
            canRetry: true,
        },
    },
    {
        test: /pdfplumber|HTTP 404|not available/i,
        info: {
            title: 'Servidor de extração indisponível',
            detail:
                'O serviço de extração de tabelas (pdfplumber) não respondeu. ' +
                'O sistema tentará usar OCR local como alternativa.',
            canRetry: true,
        },
    },
    {
        test: /tesseract|traineddata|language data/i,
        info: {
            title: 'Pacote de idioma do OCR não encontrado',
            detail:
                'O reconhecedor de texto (OCR) não conseguiu carregar os dados ' +
                'de idioma. Verifique a conexão ou contate suporte.',
            canRetry: true,
        },
    },
    {
        test: /invalid pdf|no tables|empty/i,
        info: {
            title: 'Documento sem conteúdo extraível',
            detail:
                'O arquivo não contém tabelas ou texto reconhecíveis. ' +
                'Verifique se o documento é um PDF/DOCX válido.',
            canRetry: false,
        },
    },
    {
        test: /worker|terminate|transferable/i,
        info: {
            title: 'Erro no processador de documentos',
            detail:
                'O worker de extração falhou durante o processamento. ' +
                'Tente novamente com um arquivo menor.',
            canRetry: true,
        },
    },
];

const FALLBACK: IngestionErrorInfo = {
    title: 'Falha na importação',
    detail: 'Ocorreu um erro inesperado ao processar o documento.',
    canRetry: true,
};

/**
 * Formata um erro raw do pipeline em info legível para o usuário.
 * Pure — sem side-effects, determinístico para mesma entrada.
 */
export function formatIngestionError(rawMessage: string): IngestionErrorInfo {
    if (!rawMessage || typeof rawMessage !== 'string') return { ...FALLBACK };
    for (const { test, info } of ERROR_PATTERNS) {
        if (test.test(rawMessage)) return { ...info };
    }
    return { ...FALLBACK, detail: `${FALLBACK.detail} (${rawMessage.substring(0, 120)})` };
}

/**
 * Define se um erro deve manter o arquivo selecionado para retry.
 * Erros de "documento sem conteúdo" não justificam retry (canRetry=false).
 */
export function shouldKeepFileForRetry(info: IngestionErrorInfo): boolean {
    return info.canRetry;
}