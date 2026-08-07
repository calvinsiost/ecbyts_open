// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   REPORT HANDLERS — Window functions for report tab & overlay
   Funcoes globais para a tab Report do HUD e overlay full-screen

   Handlers registrados em window.* pelo handlers/index.js
   para uso nos onclick do HTML e chamadas da API bridge.
   ================================================================ */
import {
    setReportTitle,
    addReport,
    removeReport,
    duplicateReport,
    setActiveReport,
    moveReport,
    addFolder,
    removeFolder,
    renameFolder,
    getRootFolders,
} from '../report/manager.js';
import { getSceneById } from '../scenes/manager.js';
import { animateCameraState } from '../scene/controls.js';
import { getEditorElement, setReadOnly, isReadOnly } from '../report/editor.js';
import { canDo } from '../auth/permissions.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { isCapabilityEnabled } from '../../config/libraryCategories.js';
import { asyncConfirm } from '../ui/asyncDialogs.js';
import { createLogger } from '../helpers/logger.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
// Registra o kind portável `report_template` (P1-10 + Fase 1.8) — side-effect import.
import './reportTemplatePortable.js';
const log = createLogger('Report');
// ----------------------------------------------------------------
// UI REFRESH INJECTION
// ----------------------------------------------------------------
/** @type {*} */
let requestUIRefresh: any = null;
/**
 * Inject UI refresh function to avoid circular dependency.
 * @param {Function} fn
 */
export function setReportUpdateAllUI(fn: any) {
    requestUIRefresh = fn;
}
function requestReportUIRefresh(reason = 'report.changed') {
    if (typeof requestUIRefresh !== 'function') return;
    const domains = [UI_INVALIDATION_DOMAINS.REPORT, UI_INVALIDATION_DOMAINS.HOME, UI_INVALIDATION_DOMAINS.STATUS];
    for (const domain of domains) {
        requestUIRefresh(domain, reason);
    }
}
// ----------------------------------------------------------------
// EXISTING HANDLERS (backward compat - nomes inalterados)
// ----------------------------------------------------------------
/**
 * Handle report title change.
 * @param {string} value - New title
 */
function handleReportTitleChange(value: any) {
    setReportTitle(value);
}
/**
 * Handle "Insert Scene" button click.
 * Abre o scene picker no editor (delegado ao editor.js via lazy import).
 */
function handleInsertSceneAnchor() {
    // O picker e gerenciado diretamente pelo editor.js toolbar
    // Este handler existe para a API bridge
    import('../report/editor.js' as string)
        .then((m: any) => {
            const scenes = window.getAllScenes?.() || [];
            if (scenes.length > 0) {
                m.insertSceneAnchor(scenes[0].id);
            } else {
                showToast(t('noScenesForAnchor'), 'warning');
            }
        })
        .catch((err: any) => console.warn('[handlers/report] import editor failed:', err));
}
/**
 * Handle click on a scene anchor - animate camera to scene's viewStart.
 * Ao clicar numa ancora, transiciona camera para a vista da cena.
 *
 * @param {string} sceneId
 */
function handleReportAnchorClick(sceneId: any) {
    const scene = getSceneById(sceneId);
    if (!scene) {
        showToast(`Scene "${sceneId}" ${t('sceneDeleted')}`, 'warning');
        return;
    }
    // Aplica visibilidade de elementos da cena (se definida)
    if (scene.elementVisibility) {
        Object.entries(scene.elementVisibility).forEach(([elId, visible]) => {
            (window as any).handleSceneElementFilter?.(sceneId, elId, visible);
        });
    }
    // Aplica campanhas da cena (se definidas)
    const cs = scene.campaignsStart;
    if (cs && cs.length > 0) {
        // Marca campanhas como visiveis/invisiveis
    }
    // Anima camera para viewStart da cena
    if (scene.viewStart) {
        animateCameraState(scene.viewStart, 600) as any;
    } else if (scene.viewEnd) {
        animateCameraState(scene.viewEnd, 600);
    }
}
/**
 * Handle unified report export - shows format/section picker, then exports.
 * Abre dialog de opções, exporta no formato escolhido com seções selecionadas.
 */
async function handleExportReport() {
    if (!canDo('export')) {
        showToast(t('auth.actionDenied') || "You don't have permission to perform this action.", 'error');
        return;
    }
    try {
        const { showExportOptionsDialog } = await import('../report/exportOptions.js' as string);
        const options = await showExportOptionsDialog();
        if (!options) return; // Cancelado
        if (options.format === 'pdf') {
            const { exportReportPDF } = await import('../report/pdfExport.js' as string);
            // P9-9 (FRIEND-SCORE-001): PDF grande "falhava silencioso, sem retry".
            // Feedback de início (mata a sensação de travamento) + 1 retry para
            // falha de carga do jsPDF (CDN/rede transitória) antes de desistir.
            showToast(t('pdf.generating') || 'Generating PDF…', 'info');
            try {
                await exportReportPDF(options);
            } catch (pdfErr: any) {
                const { classifyPdfError } = await import('../report/_pdfExportErrorPure.js' as string);
                const vm = classifyPdfError(pdfErr);
                if (vm.canRetry) {
                    log.warn('PDF export retry after transient failure', pdfErr?.message);
                    showToast(t('pdf.retrying') || 'Retrying PDF export…', 'warning');
                    await exportReportPDF(options); // 2ª e última tentativa
                } else {
                    throw pdfErr; // não-transitório → cai no catch externo classificado
                }
            }
            showToast(t('reportExportedPDF') || 'Report exported as PDF', 'success');
        } else if (options.format === 'docx') {
            const { exportReportDOCX } = await import('../report/docxExport.js' as string);
            const result = await exportReportDOCX(options);
            const okMsg = result?.hadInvalidChars
                ? t('reportExportedDOCXSanitized') ||
                  'Report exported as Word document. Invalid characters were removed automatically.'
                : t('reportExportedDOCX') || 'Report exported as Word document';
            showToast(okMsg, 'success');
        }
    } catch (_err: any) {
        const err = _err as any;
        log.error('Report export failed', (err as any).message);
        if (err?.message === 'DOCX_EXPORT_IN_PROGRESS') {
            showToast(t('reportDocxExportInProgress') || 'A DOCX export is already in progress.', 'warning');
        } else if (err?.message === 'DOCX_EMPTY_CONTENT') {
            showToast(t('reportDocxEmpty') || 'Report is empty.', 'warning');
        } else if (err?.message === 'DOCX_GENERATION_FAILED') {
            showToast(t('reportDocxGenerationFailed') || 'Word export failed. Please try again.', 'error');
        } else {
            // P9-9: erro de PDF classificado em mensagem acionável (não técnica).
            try {
                const { classifyPdfError } = await import('../report/_pdfExportErrorPure.js' as string);
                const vm = classifyPdfError(err);
                showToast(t(vm.i18nKey) || `Export error: ${(err as any).message}`, vm.severity);
            } catch {
                showToast(`Export error: ${(err as any).message}`, 'error');
            }
        }
    }
}
/**
 * Handle PDF export of the report (backward compat / API bridge).
 * Carrega dinamicamente o modulo de export e gera o PDF.
 */
async function handleExportReportPDF() {
    try {
        const { exportReportPDF } = await import('../report/pdfExport.js' as string);
        await exportReportPDF();
        showToast(t('reportExported'), 'success');
    } catch (_err: any) {
        const err = _err as any;
        log.error('PDF export failed', (err as any).message);
        showToast(`PDF export error: ${(err as any).message}`, 'error');
    }
}
/**
 * Scroll report editor to the anchor for a given scene (bidirectional sync).
 * Chamado ao clicar "Go to Report" no painel de cenas.
 *
 * @param {string} sceneId
 */
function handleScrollToReportAnchor(sceneId: any) {
    // Switch to report tab first
    window.switchConstellationTab?.('report');
    // After tab switch paint and lazy load, scroll to anchor.
    requestAnimationFrame(() => {
        import('../report/editor.js' as string)
            .then((m: any) => {
                m.scrollToAnchor(sceneId);
            })
            .catch((err: any) => console.warn('[handlers/report] import editor failed:', err));
    });
}
// ----------------------------------------------------------------
// NEW HANDLERS - Overlay full-screen, split, read mode
// ----------------------------------------------------------------
/**
 * Open the report overlay in full-screen mode.
 * Carrega overlay.js sob demanda e mostra o editor full-screen.
 */
async function handleOpenReportOverlay() {
    // MOD-LIB-MIG-001 M2 — respeita o toggle do Library Hub. Default = enabled.
    if (!isCapabilityEnabled('report')) {
        showToast(
            t('library.capabilityDisabled') || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    try {
        const { showOverlay } = await import('../report/overlay.js' as string);
        showOverlay();
    } catch (_err: any) {
        const err = _err as any;
        log.error('Report overlay failed to open', (err as any).message);
        showToast('Report overlay error', 'error');
    }
}
/**
 * Close the report overlay and return to embedded mode.
 * Reparenta editor de volta para o HUD Constellation.
 */
async function handleCloseReportOverlay() {
    try {
        const { hideOverlay } = await import('../report/overlay.js' as string);
        hideOverlay();
    } catch (_err: any) {
        const err = _err as any;
        log.error('Report overlay failed to close', (err as any).message);
    }
}
/**
 * Toggle split-screen mode in the report overlay.
 * Alterna entre full-screen e viewport 3D + report lado a lado.
 */
async function handleToggleReportSplit() {
    try {
        const { toggleSplit, isOverlayVisible } = await import('../report/overlay.js' as string);
        if (isOverlayVisible()) {
            toggleSplit();
        } else {
            // Se overlay nao esta aberto, abre primeiro em split
            const { showOverlay } = await import('../report/overlay.js' as string);
            showOverlay();
            requestAnimationFrame(() => requestAnimationFrame(() => toggleSplit()));
        }
    } catch (_err: any) {
        const err = _err as any;
        log.error('Report split toggle failed', (err as any).message);
    }
}
/**
 * Toggle read/edit mode in the report.
 * Alterna entre modo leitura (toolbar escondida, nao editavel) e edicao.
 */
async function handleToggleReportReadMode() {
    const newState = !isReadOnly();
    setReadOnly(newState);
    // Sync overlay button state
    try {
        const { syncReadModeState } = await import('../report/overlay.js' as string);
        syncReadModeState();
    } catch (_e: any) {
        const e = _e as any;
        console.debug('[report] toggleReadMode-syncOverlay:', e?.message || e);
        // Overlay nao carregado - ok em embedded mode
    }
}
/**
 * Placeholder for print preview (future feature).
 */
function handleReportPrintPreview() {
    showToast('Print preview — em breve', 'info');
}
/**
 * Handle technical drawing plate PDF export.
 * Carrega dinamicamente o modulo plateExport e gera a prancha tecnica.
 */
async function handleExportPlatePDF() {
    try {
        const { exportPlatePDF } = await import('../report/plateExport.js' as string);
        await exportPlatePDF();
        showToast(t('plateExported'), 'success');
    } catch (_err: any) {
        const err = _err as any;
        log.error('Plate PDF export failed', (err as any).message);
        showToast(`Plate PDF error: ${(err as any).message}`, 'error');
    }
}
// ----------------------------------------------------------------
// MULTI-REPORT HANDLERS - CRUD de relatorios e pastas
// ----------------------------------------------------------------
/**
 * Add new report in the specified folder.
 * @param {string} [folderId] - Target folder; defaults to first root folder
 */
function handleAddReport(folderId: any) {
    const targetFolder = folderId || getRootFolders()[0]?.id;
    if (!targetFolder) return;
    const report = (addReport as any)(targetFolder);
    if (!report) {
        showToast(t('reportMaxReached') || 'Max reports reached (20)', 'warning');
        return;
    }
    setActiveReport(report.id);
    _syncEditorAndOverlay();
    showToast(t('reportAdd') || 'New report created', 'success');
}
/**
 * Remove a report by ID.
 * @param {string} [id] - Report ID; skips if only 1 report left
 */
async function handleRemoveReport(id: any) {
    if (!id) return;
    if (!(await asyncConfirm(t('reportRemove') + '?'))) return;
    const ok = removeReport(id);
    if (!ok) {
        showToast('Cannot delete the last report', 'warning');
        return;
    }
    _syncEditorAndOverlay();
    showToast(t('reportRemove') || 'Report deleted', 'success');
}
/**
 * Duplicate a report.
 * @param {string} [id] - Source report ID
 */
function handleDuplicateReport(id: any) {
    if (!id) return;
    const dup = duplicateReport(id);
    if (!dup) {
        showToast(t('reportMaxReached') || 'Max reports reached', 'warning');
        return;
    }
    setActiveReport(dup.id);
    _syncEditorAndOverlay();
    showToast(t('reportDuplicate') || 'Report duplicated', 'success');
}
/**
 * Switch to a different report.
 * @param {string} id - Target report ID
 */
async function handleSwitchReport(id: any) {
    if (!id) return;
    setActiveReport(id);
    // Switch editor content
    try {
        const { switchEditorReport } = await import('../report/editor.js' as string);
        switchEditorReport();
    } catch (_e: any) {
        const e = _e as any;
        console.debug('[report] switchReport-editor:', e?.message || e);
        /* editor not loaded yet */
    }
    // Sync overlay title
    try {
        const { syncOverlayTitle } = await import('../report/overlay.js' as string);
        syncOverlayTitle?.();
    } catch (_e: any) {
        const e = _e as any;
        console.debug('[report] switchReport-overlay:', e?.message || e);
        /* overlay not loaded */
    }
    // Open overlay in split if not visible
    window.handleToggleReportSplit?.();
}
/**
 * Move a report to a different folder.
 * @param {string} reportId
 * @param {string} targetFolderId
 */
function handleMoveReport(reportId: any, targetFolderId: any) {
    if (!reportId || !targetFolderId) return;
    moveReport(reportId, targetFolderId);
    showToast(t('reportSwitched') || 'Report moved', 'success');
}
/**
 * Add a new folder.
 * @param {string|null} [parentId=null] - Parent folder; null = root
 */
function handleAddFolder(parentId: any) {
    const name = t('reportFolderDefault') || 'General';
    const folder = addFolder(name, parentId || null);
    if (!folder) {
        showToast(t('reportFolderMaxDepth') || 'Max folder depth reached', 'warning');
        return;
    }
    showToast(t('reportFolderAdd') || 'Folder created', 'success');
}
/**
 * Remove a folder and all its contents.
 * @param {string} id
 */
async function handleRemoveFolder(id: any) {
    if (!id) return;
    if (!(await asyncConfirm(t('reportFolderRemoveConfirm') || 'Delete folder and all its contents?'))) return;
    const ok = removeFolder(id);
    if (!ok) {
        showToast('Cannot delete the last folder', 'warning');
        return;
    }
    _syncEditorAndOverlay();
    showToast(t('reportFolderRemove') || 'Folder deleted', 'success');
}
/**
 * Rename a folder.
 * @param {string} id
 * @param {string} name
 */
function handleRenameFolder(id: any, name: any) {
    if (!id || !name) return;
    renameFolder(id, name);
    showToast(t('reportFolderRename') || 'Folder renamed', 'success');
}
/**
 * Helper: sync editor and overlay after CRUD.
 * @private
 */
async function _syncEditorAndOverlay() {
    try {
        const { switchEditorReport } = await import('../report/editor.js' as string);
        switchEditorReport();
    } catch (_e: any) {
        const e = _e as any;
        console.debug('[report] syncEditorAndOverlay-editor:', e?.message || e);
        /* */
    }
    try {
        const { syncOverlayTitle } = await import('../report/overlay.js' as string);
        syncOverlayTitle?.();
    } catch (_e: any) {
        const e = _e as any;
        console.debug('[report] syncEditorAndOverlay-overlay:', e?.message || e);
        /* */
    }
}
// ----------------------------------------------------------------
// FILTER PRESETS - Abre modal de gerenciamento de filter presets
// ----------------------------------------------------------------
/**
 * Open the filter preset management modal.
 */
async function handleOpenFilterPresets() {
    try {
        const { openFilterPresetModal } = await import('../ui/filterPresetModal.js' as string);
        openFilterPresetModal();
    } catch (_err: any) {
        const err = _err as any;
        log.error('Filter preset modal failed', (err as any).message);
        showToast('Filter preset error', 'error');
    }
}
/**
 * Open the global filter panel popup.
 * Painel de filtragem rapida por familia, campanha e parametro.
 * @param {Event} [event] - Click event para ancorar o popup
 */
export async function handleOpenFilterPanel(event: any) {
    try {
        const { openFilterPanel } = await import('../ui/filterPanel.js' as string);
        await openFilterPanel(event);
    } catch (_err: any) {
        const err = _err as any;
        log.error('Filter panel failed', (err as any).message);
        showToast('Filter panel error', 'error');
    }
}
/**
 * Clear the global filter - restore all elements hidden by the filter.
 * Restaura visibilidade dos elementos ocultados pelo filtro global.
 */
export async function handleClearFilterPanel() {
    try {
        const { clearGlobalFilter } = await import('../ui/filterPanel.js' as string);
        await clearGlobalFilter();
    } catch (_err: any) {
        const err = _err as any;
        log.error('Clear filter failed', (err as any).message);
    }
}
// ----------------------------------------------------------------
// ABNT CHECKER
// Verifica referencias normativas no relatorio ativo
// ----------------------------------------------------------------
/**
 * Run ABNT normative reference checker on the active report content.
 * Executa o verificador de referencias ABNT no conteudo do relatorio ativo.
 * @param {string} [reportId] - Optional report ID (defaults to active report)
 */
async function handleCheckABNTReferences(reportId: any) {
    try {
        const { getReport, getReportById } = await import('../report/manager.js' as string);
        const { checkABNTReferences } = await import('../../core/validation/abntChecker.js' as string);
        const { openAbntPanel } = await import('../ui/abntPanel.js' as string);
        const report = reportId ? getReportById(reportId) : getReport();
        if (!report || !report.content) {
            showToast(t('abntChecker.noContent') || 'Nenhum conteúdo de relatório para verificar.', 'warning');
            return [];
        }
        const findings = checkABNTReferences(report.content);
        // Open the dockable panel with grouped/filterable results + click-to-jump.
        // Even on zero findings, panel renders "no references" empty state with clear messaging.
        openAbntPanel(findings);
        // Short status toast summarizing severity so user notices even if panel is hidden
        if (findings.length === 0) {
            showToast(t('abntChecker.noReferences') || 'Nenhuma referência normativa encontrada.', 'info');
        } else {
            const valid = findings.filter((f: any) => f.status === 'valid').length;
            const issues = findings.length - valid;
            const msg = (
                t('abntChecker.found') ||
                '{total} referência(s) encontrada(s): {valid} válida(s), {issues} com problema.'
            )
                .replace('{total}', String(findings.length))
                .replace('{valid}', String(valid))
                .replace('{issues}', String(issues));
            showToast(msg, issues > 0 ? 'warning' : 'success');
        }
        log.info(`ABNT check: ${findings.length} references in report`);
        return findings;
    } catch (_err: any) {
        const err = _err as any;
        log.error('ABNT checker failed', (err as any).message);
        showToast(t('abntChecker.error') || 'Erro no verificador ABNT', 'error');
        return [];
    }
}
/**
 * Run Document Compliance Validator on active report content and render
 * inline highlights plus side-panel issue navigation.
 *
 * @param {string} [reportId] - Optional report ID (defaults to active report)
 */
async function handleValidateDocumentCompliance(reportId: any) {
    try {
        const { getReport, getReportById, getActiveReportId } = await import('../report/manager.js' as string);
        const { createComplianceCheck } = await import('../../core/documents/complianceValidator.js' as string);
        const { openDocumentCompliancePanel } = await import('../ui/documentCompliancePanel.js' as string);
        const report = reportId ? getReportById(reportId) : getReport();
        const editor =
            getEditorElement?.() || document.querySelector('.report-editor-content, [contenteditable="true"]');
        const html = String(editor?.innerHTML || report?.content || '').trim();
        const text = String(editor?.textContent || _htmlToText(html)).trim();
        if (!text) {
            showToast(t('documentCompliance.noContent') || 'No report content to validate.', 'warning');
            return null;
        }
        const result = createComplianceCheck(_buildDocumentComplianceDescriptor(text, editor));
        openDocumentCompliancePanel(result, { editor });
        _queueDocumentComplianceStatusSync({
            documentId: reportId || report?.id || getActiveReportId?.() || 'active-report',
            report,
            result,
        });
        const issueCount = result.violations.length;
        const msg =
            issueCount === 0
                ? t('documentCompliance.pass') || 'Document compliance check passed.'
                : (t('documentCompliance.found') || '{count} document compliance issue(s) found.').replace(
                      '{count}',
                      String(issueCount),
                  );
        showToast(msg, result.status === 'fail' ? 'warning' : 'success');
        return result;
    } catch (_err: any) {
        const err = _err as any;
        log.error('Document compliance validator failed', (err as any).message);
        showToast(t('documentCompliance.error') || 'Document compliance validation failed', 'error');
        return null;
    }
}
function _queueDocumentComplianceStatusSync({ documentId, report, result }: any) {
    import('../../core/documents/complianceStatusSync.js' as string)
        .then((m: any) =>
            m.syncDocumentComplianceStatus({
                documentId,
                report,
                result,
                source: 'report_editor',
            }),
        )
        .then((syncResult: any) => {
            if (syncResult && !syncResult.ok) {
                log.warn('Document compliance status sync was not queued', syncResult.reason || syncResult.error);
            }
        })
        .catch((err: any) =>
            log.warn('Document compliance status sync failed', err?.message || String(err || 'unknown_error')),
        );
}
/** @param {*} text @param {*} editor */
function _buildDocumentComplianceDescriptor(text: any, editor: any) {
    return {
        sectionTitles: _extractSectionTitles(text, editor),
        references: _extractReferenceLines(text),
        requiredSections: ['Introducao', 'Metodologia', 'Resultados', 'Conclusoes'],
    };
}
/** @param {*} text @param {*} editor */
function _extractSectionTitles(text: any, editor: any) {
    const headings = editor
        ? Array.from(editor.querySelectorAll('h1,h2,h3,h4,h5,h6'))
              .map((el: any) => String(el.textContent || '').trim())
              .filter(Boolean)
        : [];
    if (headings.length > 0) return headings;
    return String(text || '')
        .split(/\r?\n/)
        .map((line: any) => line.trim())
        .filter((line: any) => /^\d+(?:\.\d+){0,5}\s+\S+/.test(line));
}
/** @param {*} text */
function _extractReferenceLines(text: any) {
    return String(text || '')
        .split(/\r?\n/)
        .map((line: any) => line.trim())
        .filter((line: any) =>
            /(?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+,\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]|NBR|CONAMA|CETESB)/i.test(line),
        );
}
/** @param {*} html */
function _htmlToText(html: any) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || '';
}
// ----------------------------------------------------------------
// TRANSLATION ENGINE - C5a: translate report HTML preserving tags
// Traduz conteudo do relatorio preservando HTML, glossario, cache IDB
// ----------------------------------------------------------------
/**
 * Build a translateChunk adapter that wraps core/llm/client.js sendMessage().
 * Used as the injection point for translationEngine.translateReport().
 * Isolating this here keeps the core module free of LLM-client dependency
 * and makes it 100% unit-testable via mock injection.
 *
 * @returns {(chunk: string, sourceLang: string, targetLang: string) => Promise<string>}
 */
function _buildLlmTranslateChunk() {
    return async (chunk: any, sourceLang: any, targetLang: any) => {
        const { sendMessage, hasApiKey } = await import('../../core/llm/client.js' as string);
        if (!hasApiKey()) {
            throw new Error('LLM not configured');
        }
        const systemPrompt =
            `You are a technical translator for environmental engineering reports. ` +
            `Translate from ${sourceLang} to ${targetLang}. Preserve paragraph breaks. ` +
            `Do NOT translate placeholders in the form {{TERM_N}} — keep them exactly as-is. ` +
            `Return ONLY the translated text, no commentary, no quotes.`;
        const response = await sendMessage(systemPrompt, chunk, { temperature: 0.2, maxTokens: 2000 });
        return (response?.content || '').trim();
    };
}
/**
 * Open the translate modal showing estimate + confirm.
 * Separate from handleTranslateReport so estimation is cheap and user gets
 * a preview before paying LLM cost.
 *
 * @param {string} [targetLang] - Target language code (defaults to en-US)
 */
async function handleOpenTranslateModal(targetLang = 'en-US') {
    try {
        const { getReport } = await import('../report/manager.js' as string);
        const { estimateTranslation } = await import('../../core/report/translationEngine.js' as string);
        const { openTranslateModal } = await import('../ui/translateModal.js' as string);
        const report = getReport();
        if (!report || !report.content) {
            showToast(t('report.translate.noContent') || 'Nenhum conteúdo de relatório para traduzir.', 'warning');
            return;
        }
        // Source lang defaults to current app language; user can override in the modal
        const { getCurrentLanguage } = await import('../i18n/translations.js' as string);
        const sourceLang = getCurrentLanguage() || 'pt-BR';
        const estimate = await estimateTranslation({
            sourceLang,
            targetLang,
            html: report.content,
        });
        openTranslateModal({
            sourceLang,
            targetLang,
            estimate,
            reportId: report.id,
            onConfirm: async (finalTargetLang: any) => {
                await handleTranslateReport(finalTargetLang, sourceLang);
            },
        });
    } catch (_err: any) {
        const err = _err as any;
        log.error('Failed to open translate modal', (err as any).message);
        showToast(t('report.translate.error') || 'Erro ao abrir tradução', 'error');
    }
}
/**
 * Execute the translation of the active report.
 *
 * @param {string} targetLang - e.g. 'en-US'
 * @param {string} [sourceLang] - Defaults to current app language
 */
async function handleTranslateReport(targetLang: any, sourceLang: any) {
    const started = Date.now();
    const { openAiProgress, updateAiProgress, closeAiProgress, setAiProgressError } = await import(
        '../ui/aiProgressOverlay.js' as string
    );
    try {
        const { getReport, setReportContent } = await import('../report/manager.js' as string);
        const { updateReportEditor } = await import('../report/editor.js' as string);
        const { translateReport } = await import('../../core/report/translationEngine.js' as string);
        const report = getReport();
        if (!report || !report.content) {
            showToast(t('report.translate.noContent') || 'Nenhum conteúdo de relatório para traduzir.', 'warning');
            return;
        }
        if (!sourceLang) {
            const { getCurrentLanguage } = await import('../i18n/translations.js' as string);
            sourceLang = getCurrentLanguage() || 'pt-BR';
        }
        // Open progress overlay - translateReport will report per-segment progress
        openAiProgress({
            title: t('aiProgress.translateTitle') || 'Traduzindo relatório',
            total: 0, // discovered once extractTextSegments runs in the engine
            phase: t('aiProgress.preparing') || 'Preparando requisição',
        });
        const result = await translateReport(
            { sourceLang, targetLang, html: report.content },
            _buildLlmTranslateChunk(),
            {
                onProgress: (event: any) => {
                    // Translate phase labels to pt-BR/en-US
                    /** @type {Record<string, string>} */
                    const phaseLabels: any = {
                        preparing: t('aiProgress.preparing') || 'Preparando',
                        translatingChunk: t('aiProgress.translatingChunk') || 'Traduzindo trecho',
                        finalizing: t('aiProgress.finalizing') || 'Finalizando',
                    };
                    updateAiProgress({
                        current: event.current,
                        total: event.total,
                        phase: phaseLabels[event.phase] || event.phase,
                        detail: event.detail || '',
                    });
                },
            },
        );
        if (result.fromCache) {
            showToast(t('report.translate.fromCache') || 'Tradução carregada do cache', 'success');
        } else {
            const ms = result.durationMs || Date.now() - started;
            const msg = (
                t('report.translate.success') || 'Tradução concluída ({chunks} chunks, {tokens} tokens, {ms}ms)'
            )
                .replace('{chunks}', String(result.chunks))
                .replace('{tokens}', String(result.tokensUsed))
                .replace('{ms}', String(ms));
            showToast(msg, 'success', 5000);
        }
        // Persist translation in report manager + refresh the contenteditable DOM.
        setReportContent(result.html);
        updateReportEditor();
        requestReportUIRefresh('report.translated');
        closeAiProgress();
        log.info(`Translation ${sourceLang}→${targetLang} complete: ${result.chunks} chunks`);
        return result;
    } catch (_err: any) {
        const err = _err as any;
        log.error('Translation failed', (err as any).message);
        setAiProgressError(
            `${t('report.translate.error') || 'Erro ao traduzir'}: ${(err as any).message || 'desconhecido'}`,
        );
        showToast(`${t('report.translate.error') || 'Erro ao traduzir'}: ${(err as any).message}`, 'error', 6000);
    }
}
// ----------------------------------------------------------------
// AI REPORT BOT - C5b: generate report sections via LLM templates
// Gera trechos de relatorio via LLM com templates estruturados + watermark
// ----------------------------------------------------------------
/**
 * Build the sendFn callback for the AI report bot.
 * Mirrors the pattern used by the translation engine - keeps core module
 * free of LLM client dependency and enables mock injection for tests.
 *
 * @returns {(systemPrompt: string, userPrompt: string) => Promise<string>}
 */
function _buildLlmReportSendFn() {
    return async (systemPrompt: any, userPrompt: any) => {
        const llmOptions = { temperature: 0.3, maxTokens: 1500 };
        // Engine-aware: local server (Ollama / LM Studio) não exige API key.
        // Chama generateLocal direto (preserva o systemPrompt completo do template;
        // routeMessage usaria buildLitePrompt e descartaria o template).
        const { getEngine, getLocalUrl, getLocalModel } = await import('../../core/llm/router.js' as string);
        const engine = getEngine();
        if (engine === 'local') {
            const localModel = getLocalModel();
            if (!localModel) {
                throw new Error('Engine local selecionada mas nenhum modelo configurado (Settings → LLM → Local)');
            }
            const { generateLocal } = await import('../../core/llm/localEngine.js' as string);
            const response = await generateLocal(getLocalUrl(), localModel, systemPrompt, userPrompt, llmOptions);
            return (response?.content || '').trim();
        }
        // Cloud (default): provider OpenAI/Claude/Google — exige API key.
        const { sendMessage, hasApiKey } = await import('../../core/llm/client.js' as string);
        if (!hasApiKey()) {
            throw new Error('LLM not configured — configure an API key ou selecione a engine Local (Ollama)');
        }
        const response = await sendMessage(systemPrompt, userPrompt, llmOptions);
        return (response?.content || '').trim();
    };
}
/**
 * Build a ReportContext from the current model state.
 * Gathers elements, campaigns, and EIS score from managers without requiring
 * those modules as top-level imports (lazy imports to avoid circular deps).
 *
 * @returns {Promise<Object>} ReportContext snapshot
 */
async function _snapshotModelContext() {
    const projectModPath = '../../core/elements/project.js';
    /** @type {*} */
    const projectMod = await import(/* @vite-ignore */ projectModPath).catch(() => ({ getProjectAreas: () => [] }));
    const [{ getAllElements }, { getAllCampaigns }] = await Promise.all([
        import('../../core/elements/manager.js' as string),
        import('../../core/campaigns/manager.js' as string),
    ]);
    const { getProjectAreas } = projectMod;
    const elements = getAllElements() || [];
    const campaigns = getAllCampaigns() || [];
    const areas = (typeof getProjectAreas === 'function' && getProjectAreas()) || [];
    const siteName = areas[0]?.name || null;
    // Try to get EIS score from the global cache (if computed)
    let eisScore = null;
    try {
        const eisMod = await import('../../core/purpose/snapshotEngine.js' as string);
        if (typeof eisMod.computeSimplifiedEIS === 'function') {
            const result = eisMod.computeSimplifiedEIS();
            eisScore = typeof result?.eis === 'number' ? result.eis : null;
        }
    } catch (_e: any) {
        const e = _e as any;
        console.debug('[report] gatherTemplateData-eis:', e?.message || e);
        // EIS not available - acceptable, template either doesn't need it or will use 'N/A'
    }
    // Data-grounding (Fase 1.5): extrai valores reais + excedências determinísticas do
    // modelo para alimentar o AI report. Anti-alucinação: o LLM passa a receber números
    // reais (não só contagens). Coleta via _reportGroundingGather (fonte única,
    // compartilhada com o seletor de figuras Chart.js). Defensivo — se falhar, o
    // report ainda gera com contagens.
    let grounding: any = {};
    try {
        const [{ gatherGroundingData }, g] = await Promise.all([
            import('../report/_reportGroundingGather.js' as string),
            import('../../core/report/_aiReportDataGroundingPure.js' as string),
        ]);
        const { summary, exceedances } = await gatherGroundingData(elements);
        grounding = {
            observationSummary: g.formatObservationSummaryText(summary),
            dateRange: g.formatDateRange(summary),
            topContaminants: g.formatTopContaminants(exceedances, 8),
            observationTable: g.buildObservationTableHtml(summary),
            exceedanceTable: g.buildExceedanceTableHtml(exceedances),
            groundingBlock: g.buildGroundingBlock(summary, exceedances),
        };
    } catch (ge: any) {
        console.debug('[report:grounding]', ge?.message || ge);
    }
    // CETESB-RISK-001 RF-1.6: placeholder {{cmaTable}} — tabela CMA × SQI
    // (Concentração Máxima Aceitável por receptor). Cenário default RES_URB
    // (criança, mais protetivo). Defensivo: se feature flag CETESB_RISK_ASSESSMENT
    // estiver off OU cálculo falhar, fallback string vazia (template renderiza N/D).
    try {
        const featureFlag: any =
            typeof window !== 'undefined' ? (window as any).CONFIG?.FEATURES?.CETESB_RISK_ASSESSMENT : false;
        if (featureFlag !== false) {
            const cmaMod: any = await import('../../core/risk/cetesb/_cmaTablePure.js' as string);
            const { gatherGroundingData } = await import('../report/_reportGroundingGather.js' as string);
            const { summary } = await gatherGroundingData(elements);
            // Mapeia observações do summary para shape NormalizedObsForCma
            const flatObs: Array<{ parameter: string; value: number; unit: string; matrix: string }> = [];
            for (const stat of Object.values(summary?.byParam || {}) as any[]) {
                const samples: any[] = Array.isArray(stat?.samples) ? stat.samples : [];
                for (const s of samples) {
                    if (Number.isFinite(s?.value)) {
                        flatObs.push({
                            parameter: String(stat?.parameter || ''),
                            value: Number(s.value),
                            unit: String(stat?.unit || ''),
                            matrix: String(s?.matrix || 'groundwater'),
                        });
                    }
                }
            }
            // CAS lookup via CONFIG.PARAMETERS (cada parâmetro pode ter casNumber).
            const config: any = typeof window !== 'undefined' ? (window as any).CONFIG : null;
            const params: any[] = Array.isArray(config?.PARAMETERS) ? config.PARAMETERS : [];
            const casLookup = (name: string): string | null => {
                const p = params.find((x: any) => x?.name === name || x?.id === name || x?.label === name);
                return (p?.casNumber as string) || (p?.cas as string) || null;
            };
            const cmaResult = cmaMod.buildCmaTableFromObservations(flatObs, {
                scenario: 'RES_URB',
                casLookup,
                scenarioLabel: 'Residente Urbano (criança — cenário mais protetivo)',
                now: new Date().toISOString(),
            });
            (grounding as any).cmaTable = cmaResult.html;
            (grounding as any).cmaTableMarkdown = cmaResult.markdown;
        }
    } catch (ce: any) {
        console.debug('[report:grounding:cma]', ce?.message || ce);
    }
    return {
        elements,
        campaigns,
        eisScore,
        siteName,
        regulations: [], // Future: read from project metadata
        ...grounding,
    };
}
/**
 * Open the AI report modal to pick template + tone and preview.
 */
async function handleOpenAIReportModal() {
    try {
        const { getReport } = await import('../report/manager.js' as string);
        const { buildReportContext, getAllTemplates, checkRateLimit, getFeedbackStats } = await import(
            '../../core/report/aiReportBot.js' as string
        );
        const { openAIReportModal } = await import('../ui/aiReportModal.js' as string);
        const report = getReport();
        if (!report) {
            showToast(t('aiReport.noReport') || 'Nenhum relatório ativo.', 'warning');
            return;
        }
        const snapshot = await _snapshotModelContext();
        const context = buildReportContext(snapshot);
        const templates = await getAllTemplates();
        const rateLimit = checkRateLimit();
        const feedbackStats = await getFeedbackStats();
        openAIReportModal({
            reportId: report.id,
            context,
            templates,
            rateLimit,
            feedbackStats,
            onGenerate: (templateId: any, tone: any) =>
                handleGenerateAIReport(templateId, tone).then((result: any) => result || {}),
            onFeedback: (templateId: any, thumbs: any) => handleRateAIReport(templateId, thumbs),
        });
    } catch (_err: any) {
        const err = _err as any;
        log.error('Failed to open AI report modal', (err as any).message);
        showToast(t('aiReport.error') || 'Erro ao abrir AI Report', 'error');
    }
}
/**
 * Generate a report section and return the HTML (does NOT auto-insert).
 * The modal shows a preview; user clicks "Insert" to actually add to editor.
 *
 * @param {string} templateId
 * @param {'technical'|'executive'} tone
 * @returns {Promise<{content: string, rawContent: string, templateId: string, tone: string}|null>}
 */
async function handleGenerateAIReport(templateId: any, tone: any) {
    const { openAiProgress, updateAiProgress, closeAiProgress, setAiProgressError } = await import(
        '../ui/aiProgressOverlay.js' as string
    );
    try {
        const { buildReportContext, generateReportSection } = await import(
            '../../core/report/aiReportBot.js' as string
        );
        const snapshot = await _snapshotModelContext();
        const context = buildReportContext(snapshot);
        openAiProgress({
            title: t('aiProgress.aiReportTitle') || 'Gerando seção IA',
            total: 3,
            phase: t('aiProgress.preparing') || 'Preparando',
        });
        /** @type {Record<string, string>} */
        const phaseLabels: any = {
            preparing: t('aiProgress.preparing') || 'Preparando',
            callingLlm: t('aiProgress.callingLlm') || 'Chamando LLM',
            applyingWatermark: t('aiProgress.applyingWatermark') || 'Aplicando marca d’água',
        };
        const result = await generateReportSection({
            templateId,
            context,
            tone,
            sendFn: _buildLlmReportSendFn(),
            onProgress: (event: any) => {
                updateAiProgress({
                    current: event.current,
                    total: event.total,
                    phase: phaseLabels[event.phase] || event.phase,
                    detail: event.detail || '',
                });
            },
        });
        closeAiProgress();
        showToast(t('aiReport.generated') || 'Seção gerada — revise antes de inserir', 'success', 4000);
        return result;
    } catch (_err: any) {
        const err = _err as any;
        log.error('AI report generation failed', (err as any).message);
        setAiProgressError(`${t('aiReport.error') || 'Erro ao gerar'}: ${(err as any).message || 'desconhecido'}`);
        showToast(`${t('aiReport.error') || 'Erro ao gerar'}: ${(err as any).message}`, 'error', 6000);
        return null;
    }
}
/**
 * Record thumbs up/down feedback for a generated section.
 *
 * @param {string} templateId
 * @param {'up'|'down'} thumbs
 */
async function handleRateAIReport(templateId: any, thumbs: any) {
    try {
        const { recordFeedback } = await import('../../core/report/aiReportBot.js' as string);
        await recordFeedback({ templateId, thumbs });
        showToast(
            thumbs === 'up'
                ? t('aiReport.thanksUp') || 'Obrigado pelo feedback positivo!'
                : t('aiReport.thanksDown') || 'Feedback registrado — vamos melhorar',
            'info',
            2500,
        );
    } catch (_err: any) {
        const err = _err as any;
        log.warn('Failed to record feedback', (err as any).message);
    }
}
// ----------------------------------------------------------------
// FILE EXPORT - Save report as PDF/DOCX to the Files system
// Salva relatorio como PDF/DOCX no sistema de arquivos
// ----------------------------------------------------------------
/**
 * Export active report as PDF and save to Files system.
 * Exporta relatorio ativo como PDF e salva no gerenciador de arquivos.
 *
 * @param {string} [reportId] - Report ID (active if omitted)
 */
async function handleSaveReportAsPDF(reportId: any) {
    try {
        showToast(t('reportExportSaving') || 'Saving report as PDF...', 'info');
        const { exportAndSaveToFiles } = await import('../report/fileExporter.js' as string);
        const result = await exportAndSaveToFiles(reportId, 'pdf');
        if (result.ok) {
            showToast(t('reportExportSaved') || 'Report saved to Files', 'success');
        } else {
            showToast(t('reportExportError') || 'Failed to save report', 'error');
        }
    } catch (_err: any) {
        const err = _err as any;
        log.error('Save report as PDF failed', (err as any).message);
        showToast(`${t('reportExportError') || 'Export error'}: ${(err as any).message}`, 'error');
    }
}
/**
 * Export active report as DOCX and save to Files system.
 * Exporta relatorio ativo como DOCX e salva no gerenciador de arquivos.
 *
 * @param {string} [reportId] - Report ID (active if omitted)
 */
async function handleSaveReportAsDOCX(reportId: any) {
    try {
        showToast(t('reportExportSaving') || 'Saving report as DOCX...', 'info');
        const { exportAndSaveToFiles } = await import('../report/fileExporter.js' as string);
        const result = await exportAndSaveToFiles(reportId, 'docx');
        if (result.ok) {
            showToast(t('reportExportSaved') || 'Report saved to Files', 'success');
        } else {
            showToast(t('reportExportError') || 'Failed to save report', 'error');
        }
    } catch (_err: any) {
        const err = _err as any;
        log.error('Save report as DOCX failed', (err as any).message);
        if (err?.message === 'DOCX_EXPORT_IN_PROGRESS') {
            showToast(t('reportDocxExportInProgress') || 'A DOCX export is already in progress.', 'warning');
        } else {
            showToast(`${t('reportExportError') || 'Export error'}: ${(err as any).message}`, 'error');
        }
    }
}
/**
 * Save report to Files panel in chosen format.
 * Salva relatorio no painel de arquivos no formato escolhido.
 *
 * @param {string} reportId - Report ID
 * @param {'pdf'|'docx'} format - Target format
 */
async function handleSaveReportToFiles(reportId: any, format: any) {
    const fn = format === 'docx' ? handleSaveReportAsDOCX : handleSaveReportAsPDF;
    return fn(reportId);
}
// ----------------------------------------------------------------
// REGULATORY REPORT GENERATOR — one-click CETESB/CONAMA report
// Abre o modal de configuração e delega ao engine + exportador
// ----------------------------------------------------------------
/**
 * Open the Regulatory Report Generator configuration modal.
 * @param {Event} [event] - click event (used to restore focus on close)
 */
async function handleOpenRegulatoryReport(event: any) {
    try {
        const { openRegulatoryReportModal } = await import('../report/regulatoryReportModal.js' as string);
        const trigger = (event?.currentTarget || event?.target) as any;
        openRegulatoryReportModal(trigger);
    } catch (_err: any) {
        const err = _err as any;
        log.error('Regulatory report modal failed', (err as any).message);
        showToast(t('REPORT_ERR_DATA') || 'Incomplete data for report', 'error');
    }
}
// ----------------------------------------------------------------
// EXPORT
// ----------------------------------------------------------------
export const reportHandlers = {
    handleOpenRegulatoryReport,
    handleReportTitleChange,
    handleInsertSceneAnchor,
    handleReportAnchorClick,
    handleExportReport,
    handleExportReportPDF,
    handleExportPlatePDF,
    handleScrollToReportAnchor,
    handleOpenReportOverlay,
    handleCloseReportOverlay,
    handleToggleReportSplit,
    handleToggleReportReadMode,
    handleReportPrintPreview,
    // Multi-report CRUD
    handleAddReport,
    handleRemoveReport,
    handleDuplicateReport,
    handleSwitchReport,
    handleMoveReport,
    // Folder CRUD
    handleAddFolder,
    handleRemoveFolder,
    handleRenameFolder,
    // Filter presets
    handleOpenFilterPresets,
    // Global filter panel
    handleOpenFilterPanel,
    handleClearFilterPanel,
    // ABNT Checker
    handleCheckABNTReferences,
    handleValidateDocumentCompliance,
    // Translation Engine (C5a)
    handleOpenTranslateModal,
    handleTranslateReport,
    // AI Report Bot (C5b)
    handleOpenAIReportModal,
    handleGenerateAIReport,
    handleRateAIReport,
    // File export - save to Files system
    handleSaveReportAsPDF,
    handleSaveReportAsDOCX,
    handleSaveReportToFiles,
};
