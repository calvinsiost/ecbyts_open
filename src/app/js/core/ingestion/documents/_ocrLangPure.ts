// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// IMPORT-UX-001 RF-3: Pure locale→OCR language mapping.
// Função pura extraída para testabilidade sem acoplamento DOM/i18n.

/**
 * Map app locale to Tesseract OCR language code(s).
 * Mapeia locale do app para código(s) de idioma do Tesseract.
 *
 * Regras:
 * - pt-BR/pt-PT → 'por+eng' (português + inglês como fallback)
 * - en-US/en-GB → 'eng'
 * - es-ES/es-LA → 'spa+eng'
 * - qualquer outro → 'eng' (fallback seguro)
 *
 * @param {string} locale - Locale do app (ex: 'pt-BR', 'en-US')
 * @returns {string} Código de idioma Tesseract (ex: 'por+eng')
 */
export function localeToOCRLang(locale: string): string {
    if (!locale || typeof locale !== 'string') return 'eng';
    const lower = locale.toLowerCase();
    if (lower.startsWith('pt')) return 'por+eng';
    if (lower.startsWith('es')) return 'spa+eng';
    if (lower.startsWith('en')) return 'eng';
    // Fallback seguro: inglês é o universal para dados ambientais
    return 'eng';
}

/**
 * Resolve the local langPath for Tesseract traineddata assets.
 * Resolve o caminho local para os assets de traineddata do Tesseract.
 *
 * Prioridade:
 * 1. Path relativo local (./assets/tesseract/) — empacotado com o app
 * 2. Fallback CDN (jsdelivr) — se o asset local não existir
 *
 * @returns {{ primary: string, fallback: string }}
 */
export function resolveOCRLangPaths(): { primary: string; fallback: string } {
    // Path relativo local — serve tanto em dev quanto em produção
    // (app/assets/ é servido em /assets/ pelo servidor estático)
    const localPath = './assets/tesseract/';
    const cdnFallback = 'https://cdn.jsdelivr.net/npm/tesseract.js-data@5/';
    return { primary: localPath, fallback: cdnFallback };
}

/**
 * List of traineddata files that must be present for the configured languages.
 * Lista os arquivos traineddata necessários para os idiomas suportados.
 *
 * @returns {string[]} Array de nomes de arquivo (ex: ['por.traineddata.gz', 'eng.traineddata.gz'])
 */
export function requiredTraineddataFiles(): string[] {
    return ['por.traineddata.gz', 'eng.traineddata.gz'];
}