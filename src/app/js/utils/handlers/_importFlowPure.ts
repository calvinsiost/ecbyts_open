// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * IMPORT-UX-001 RF-1 — Pure logic para detecção de tipo de arquivo e
 * decisão de roteamento do fluxo unificado de importação. Sem DOM/window.
 *
 * O fluxo unificado substitui os dois modais desconectados (P1):
 * - modal pobre (#import-modal em modals.ts) — sem formatos, sem drag-drop
 * - modal rico (ingestion wizard em ingestion.ts) — 3 cartões + formatos + templates
 *
 * detectFileType → resolveImportRoute → routeToHandler (importFlow.ts)
 */

export type ImportFileType =
    | 'model'
    | 'spreadsheet'
    | 'document'
    | 'spatial'
    | 'unknown';

export interface ImportRoute {
    type: ImportFileType;
    handler: 'ingestion' | 'model' | 'spatial' | 'reject';
    label: string;
}

const EXTENSION_MAP: Record<string, ImportFileType> = {
    '.ecbt': 'model',
    '.eco': 'model',
    '.ecokey': 'model',
    '.txt': 'model',
    '.json': 'model',
    '.xlsx': 'spreadsheet',
    '.xls': 'spreadsheet',
    '.csv': 'spreadsheet',
    '.tsv': 'spreadsheet',
    '.pdf': 'document',
    '.docx': 'document',
    '.shp': 'spatial',
    '.zip': 'spatial',
    '.geojson': 'spatial',
    '.dxf': 'spatial',
    '.kml': 'spatial',
};

const ROUTE_TABLE: Record<ImportFileType, Omit<ImportRoute, 'type'>> = {
    model: { handler: 'model', label: 'Modelo ECBT' },
    spreadsheet: { handler: 'ingestion', label: 'Planilha de dados' },
    document: { handler: 'ingestion', label: 'Documento / Relatório' },
    spatial: { handler: 'spatial', label: 'Dados espaciais' },
    unknown: { handler: 'reject', label: 'Formato não reconhecido' },
};

/**
 * Extrai a extensão normalizada (lowercase, com ponto) de um nome de arquivo.
 *
 * @param {string} fileName
 * @returns {string} ex: '.xlsx', '.pdf', '' se sem extensão
 */
export function extractExtension( fileName: any): string {
    if (!fileName || typeof fileName !== 'string') return '';
    const dot = fileName.lastIndexOf('.');
    if (dot <= 0) return '';
    return fileName.substring(dot).toLowerCase();
}

/**
 * Detecta o tipo de importação a partir do nome do arquivo.
 *
 * @param {string} fileName — nome do arquivo (ex: 'dados.xlsx', 'laudo.pdf')
 * @returns {ImportFileType}
 */
export function detectFileType( fileName: any): ImportFileType {
    const ext = extractExtension(fileName);
    return EXTENSION_MAP[ext] || 'unknown';
}

/**
 * Decide a rota de importação para um tipo de arquivo detectado.
 *
 * @param {ImportFileType} fileType
 * @returns {ImportRoute}
 */
export function resolveImportRoute( fileType: any): ImportRoute {
    const type: ImportFileType = (typeof fileType === 'string' && fileType in ROUTE_TABLE)
        ? fileType as ImportFileType
        : 'unknown';
    return { type, ...ROUTE_TABLE[type] };
}

/**
 * Lista todas as extensões aceitas pelo fluxo unificado.
 *
 * @returns {string[]} ex: ['.ecbt', '.eco', ...]
 */
export function acceptedExtensions(): string[] {
    return Object.keys(EXTENSION_MAP);
}

/**
 * Verifica se um nome de arquivo tem extensão aceita pelo fluxo unificado.
 *
 * @param {string} fileName
 * @returns {boolean}
 */
export function isAcceptedFile( fileName: any): boolean {
    return detectFileType(fileName) !== 'unknown';
}

/**
 * Monta a string de extensões aceitas para uso em atributo `accept` de input.
 *
 * @returns {string} ex: '.ecbt,.eco,.ecokey,.txt,.json,.xlsx,.xls,.csv,.tsv,.pdf,.docx,.shp,.zip,.geojson,.dxf,.kml'
 */
export function buildAcceptAttribute(): string {
    return acceptedExtensions().join(',');
}
