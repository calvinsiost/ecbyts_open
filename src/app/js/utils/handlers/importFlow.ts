// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * IMPORT-UX-001 RF-1 — Fluxo unificado de importação.
 *
 * Um único entry point (`unifiedImport`) para toda importação de arquivos.
 * Detecta o tipo via extensão e roteia para o handler específico:
 *
 *   spreadsheet/document → ingestion wizard (modal rico, 3 cartões + formatos)
 *   spatial (.shp/.zip)  → ingestion wizard (shapefile handler)
 *   spatial (.geojson)   → importGeoJSON direto
 *   spatial (.dxf/.kml)  → modal espacial
 *   model (.ecbt/.eco…)  → importFromFile (decoder universal)
 *   unknown              → toast de erro com formatos aceitos
 *
 * O modal rico (ingestion wizard) vira O modal de importação; o modal pobre
 * (#import-modal) é mantido como fallback legado mas não é mais o padrão.
 */

import { detectFileType, resolveImportRoute, extractExtension, buildAcceptAttribute, } from './_importFlowPure.js';
import type { ImportFileType } from './_importFlowPure.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { createLogger } from '../helpers/logger.js';

const log = createLogger('ImportFlow');

/**
 * Roteia um arquivo para o handler de importação adequado.
 *
 * @param {ImportFileType} fileType — tipo detectado por detectFileType()
 * @param {File} file — arquivo selecionado pelo usuário
 * @returns {Promise<void>}
 */
export async function routeToHandler( fileType: any, file: any): Promise<void> {
    const route = resolveImportRoute(fileType);

    switch (route.handler) {
        case 'ingestion': {
            const { handleIngestionDirectFile } = await import('./ingestion.js' as string);
            await handleIngestionDirectFile(file);
            return;
        }

        case 'model': {
            const { importFromFile } = await import('../../core/io/import.js' as string);
            await importFromFile(file);
            showToast(t('modelImported') || 'Modelo importado com sucesso.', 'success');
            return;
        }

        case 'spatial': {
            const ext = extractExtension(file?.name);
            if (ext === '.geojson') {
                const text = await _readFileAsText(file);
                const { importGeoJSON } = await import('../../core/io/formats/geojson.js' as string);
                const result = importGeoJSON(text);
                if (result.warnings?.length > 0) {
                    console.warn('[ImportFlow] GeoJSON warnings:', result.warnings);
                }
                showToast(
                    t('modals.importedElementsFromGeojson', { count: result.elements?.length ?? 0 })
                        || `Importados ${result.elements?.length ?? 0} elementos do GeoJSON.`,
                    'success',
                );
                return;
            }
            if (ext === '.shp' || ext === '.zip') {
                const { handleIngestionDirectFile } = await import('./ingestion.js' as string);
                await handleIngestionDirectFile(file);
                return;
            }
            // .dxf, .kml → modal espacial dedicado
            if (typeof (globalThis as any).window?.handleOpenSpatialModal === 'function') {
                (globalThis as any).window.handleOpenSpatialModal();
                if (file && typeof (globalThis as any).window?.handleSpatialDirectFile === 'function') {
                    await (globalThis as any).window.handleSpatialDirectFile(file);
                }
                return;
            }
            showToast(
                t('importFlow.spatialUnsupported', { ext })
                    || `Formato espacial "${ext}" ainda não suportado pelo fluxo unificado.`,
                'warning',
            );
            return;
        }

        case 'reject':
        default: {
            const ext = extractExtension(file?.name);
            showToast(
                t('importFlow.unknownFormat', { ext })
                    || `Formato "${ext || '?'}" não reconhecido. Formatos aceitos: ${buildAcceptAttribute()}`,
                'error',
            );
            log.warn('Rejected import for unrecognized extension:', ext);
            return;
        }
    }
}

/**
 * Entry point único para toda importação de arquivos.
 * Detecta o tipo e roteia para o handler específico.
 *
 * @param {File} file — arquivo selecionado pelo usuário
 * @returns {Promise<void>}
 */
export async function unifiedImport( file: any): Promise<void> {
    if (!file || typeof file !== 'object' || !(file instanceof File)) {
        showToast(t('importFlow.noFile') || 'Nenhum arquivo selecionado.', 'warning');
        return;
    }

    const fileType = detectFileType(file.name);
    log.debug(`unifiedImport: ${file.name} → ${fileType}`);
    await routeToHandler(fileType, file);
}

/**
 * Abre o modal de importação unificado (modal rico / ingestion wizard).
 * Este é O modal de importação — o botão "Importar" do header deve chamar isto.
 *
 * Fallback encadeado: ingestion wizard → modal pobre legado.
 */
export function openUnifiedImportModal(): void {
    const w = (globalThis as any).window;
    if (typeof w?.handleOpenIngestionModal === 'function') {
        w.handleOpenIngestionModal();
        return;
    }
    if (typeof w?.openImportModal === 'function') {
        w.openImportModal();
        return;
    }
    showToast(t('importFlow.unavailable') || 'Fluxo de importação indisponível no momento.', 'warning');
}

function _readFileAsText(file: any): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e: any) => resolve(String(e.target?.result || ''));
        reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
        reader.readAsText(file);
    });
}

/**
 * Registra os handlers do fluxo unificado no window.
 * Chamado por registerAllHandlers() em index.ts.
 */
export function registerImportFlowHandlers(): void {
    const w = (globalThis as any).window;
    if (!w) return;
    w.handleUnifiedImport = unifiedImport;
    w.openUnifiedImportModal = openUnifiedImportModal;
}
