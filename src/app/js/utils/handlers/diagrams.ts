// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   DIAGRAM HANDLERS — Window-level handlers for P&ID diagram editor
   Handlers globais para o editor de diagramas P&ID.
   ================================================================ */
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { createLogger } from '../helpers/logger.js';
import { isCapabilityEnabled } from '../../config/libraryCategories.js';
const log = createLogger('DiagramHandlers');
/**
 * Opens the P&ID diagram editor modal.
 * Abre o editor de diagramas P&ID.
 *
 * @param {object} [opts] - Options (initialData for restore)
 */
async function handleOpenDiagramEditor(opts: any) {
    // MOD-LIB-MIG-001 M2 — respeita o toggle do Library Hub. Default = enabled.
    if (!isCapabilityEnabled('pid')) {
        showToast(
            t('library.capabilityDisabled')
                || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    try {
        const { openDiagramEditor } = await import('../ui/diagramEditor.js' as string);
        openDiagramEditor(opts);
    }
    catch (err: any) {
        log.error('Failed to load diagram editor', (err)?.message);
        showToast(t('diagram.loadError') || 'Failed to open diagram editor', 'error');
    }
}
/**
 * Exports the current diagram in the specified format.
 * Exporta o diagrama atual no formato especificado.
 *
 * @param {string} [format='png'] - Export format: 'png' or 'svg'
 */
async function handleExportDiagram(format = 'png') {
    try {
        const { getDiagramEngine } = await import('../ui/diagramEditor.js' as string);
        const engine = getDiagramEngine();
        if (!engine) {
            showToast(t('diagram.noEditor') || 'No diagram editor open', 'warning');
            return;
        }
        if (format === 'svg') {
            const svg = engine.exportSVG();
            const blob = new Blob([svg], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'diagram.svg';
            a.click();
            URL.revokeObjectURL(url);
        }
        else {
            const blob = await engine.exportPNG();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'diagram.png';
            a.click();
            URL.revokeObjectURL(url);
        }
        showToast(t('diagram.exported') || `Diagram exported as ${format.toUpperCase()}`, 'success');
    }
    catch (err: any) {
        log.error(`Export ${format} failed`, (err)?.message);
        showToast(t('diagram.exportError') || 'Export failed', 'error');
    }
}
export const diagramHandlers = {
    handleOpenDiagramEditor,
    handleExportDiagram,
};
