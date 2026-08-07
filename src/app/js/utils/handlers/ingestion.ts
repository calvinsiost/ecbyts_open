// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   INGESTION HANDLERS — Wizard modal for spreadsheet & document import
   Handlers para o modal wizard de ingestao de dados ambientais.

   Conecta a UI do modal com o pipeline core/ingestion/:
   Spreadsheets: parser → mapper → validator → wizard → ingester
   Documents:    documentWorker → staging → human review → ingester
   ================================================================ */
import { parseFile, detectFormat } from '../../core/ingestion/parser.js';
import { mapDeterministic, mapWithAI, COLUMN_ALIASES } from '../../core/ingestion/mapper.js';
import { validateMappedData, transformData } from '../../core/ingestion/validator.js';
import { createWizard, advanceWizard, goBackWizard, getWizardStep, buildIngestionPlan, } from '../../core/ingestion/wizard.js';
import { ingest, buildVirtualModel } from '../../core/ingestion/ingester.js';
import { buildModel } from '../../core/io/export.js';
import { ingestDocument, getStagingSummary, isLLMAvailable, analyzeDocumentImages, classifyTableFamily, aggregateDetectedFamilies, // v0.2: Rich Document Ingestion (track logic in documentTracks.js)
isOCRSupported, isOCRReady, initOCR, terminateOCR, detectPII, redactPII, detectDocumentLocale,
// CONSENSUS-MATRIX-001 F2 wire — modal "Revisão final"
renderConsensusModal, shouldRenderModal, } from '../../core/ingestion/documents/index.js';
import { processTrackB, processTrackC, processTrackD, processScannedPages, convertImagesToBlobUrls, cleanupBlobUrls, } from './documentTracks.js';
import { wireIngestionDropzone } from './ingestionDropzone.js';
import { t } from '../i18n/translations.js';
import { DEFAULT_FAMILIES } from '../../config.js';
import { getAllElements, getElementById, addElement, updateElement } from '../../core/elements/manager.js';
import { showToast } from '../ui/toast.js';
import { isCapabilityEnabled } from '../../config/libraryCategories.js';
import { asyncConfirm, asyncPrompt } from '../ui/asyncDialogs.js';
import { showLoading, hideLoading, setLoadingMessage } from '../ui/loadingOverlay.js';
import { startBgLoading, stopBgLoading } from '../ui/backgroundLoadingBadge.js';
import { escapeHtml } from '../helpers/html.js';
import { computeDocHighlightRect } from '../helpers/docHighlight.js';
import { buildDocMatrixKey, isDocMatrixAmbiguous, normalizeDocMatrixValue } from '../helpers/docDecisions.js';
import { showMoreObservations, showAllObservations, toggleObsCampaign, expandObservation } from '../ui/lists.js';
import { registerFromIngestion } from '../files/fileManager.js';
import { getFileRegisterMode } from '../files/fileConstants.js';
import { mergeHandlers } from './merge.js';
import { DOC_VISUAL_FAMILIES, buildDefaultDocDecisions, collectDocVisualAssets, ensureDocDecisions, getDocVisualAssetLabel, } from './ingestionDocDecisions.js';
import { autoMatchWells, getScatterPosition, renderMappingModal, setDocFieldToggle, setDocMappingAction, setDocMappingTarget, } from './ingestionDocMappingUi.js';
import { applyDocVisualActions, renderDocVisualWizard as renderPostVisualWizard, setDocVisualAction, setDocVisualActionFamily, } from './ingestionDocPostVisual.js';
import { commitDocImportFlow, prepareDocIngestFlow } from './ingestionDocImportFlow.js';
import { buildDocReviewState } from './ingestionDocReviewState.js';
import { renderDomainDecisions as renderDomainDecisionsExt, renderOHSDomainDecisions as renderOHSDomainDecisionsExt, renderEnvironmentalDomainDecisions as renderEnvironmentalDomainDecisionsExt, } from './ingestionDomainDecisions.js';
import { renderAssessmentCard, openDocAssessmentReview, closeDocAssessmentReview, applyDocAssessmentConfig, createElementsFromAssessment, } from '../ui/documentAssessmentPanel.js';
import { importCDN } from '../helpers/cdnLoader.js';
import { createLogger } from '../helpers/logger.js';
import { purposeMicroFeedback } from '../../core/purpose/actionImpact.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
// Import pure constants and helpers extracted to _internal.js (ARCH-MONO-001 Phase 6b)
import { S_CARD, S_LABEL, S_TITLE, S_MUTED, S_TABLE_HEADER, S_TABLE_ROW, S_SAMPLE, CONF_COLORS, DOC_PROCESS_PHASES, PDF_SCALE, VALID_DECISIONS, detectDocProcessPhase, formatDocElapsed, } from './ingestion/_internal.js';
// ARCH-MONOLITH-ATOMIZATION-001 + Wave KKKK2 (MONOLITH-GROWN-001 revert): pure
// helpers canonical in _ingestionPure.ts (bbox/doc parsing + labels + progress/
// chip + asset filename) and _ingestionValidationPure.ts (error→message alias).
import {
    hasValidSourceBbox, extractPageText, computeIngestionValidationVerdict,
    resolveFormatLabel, resolveColumnTargetLabel, columnConfidenceBackground,
    formatOriginLabel, clampProgressPercent, phaseNextHint, buildDocPhaseCardStyle,
    resolveConfTooltip, buildBudgetModeChip, buildExtractorChip, buildDocAssetFilename,
    buildDocReadingRowDisplay,
} from './_ingestionPure.js';
// IMPORT-UX-001 RF-2 (fix 2026-07-10): estas duas funções eram USADAS no catch do
// pipeline (linhas ~536/540) mas NUNCA importadas → ReferenceError dentro do
// próprio catch → handler de erro quebrava → toast/banner/re-render não rodavam
// → "reset silencioso sem mensagem" (exato sintoma do P4). O hotfix 89169b688
// cobriu só o handleClearPipelineError (boot); este import cobre o runtime.
import { formatIngestionError, shouldKeepFileForRetry } from './_ingestionErrorPure.js';
import { errorToShortMessage } from './_ingestionValidationPure.js';
const log = createLogger('Ingestion');
/** @typedef {Record<string, any>} AnyRecord */
const _errorMessage: (err: unknown) => string = errorToShortMessage; // Wave KKKK2: alias over canonical helper
let _requestUIRefresh: any = null;
let _wizardState: any = null;
/** State for document ingestion (PDF/DOCX) — separate from spreadsheet wizard */
let _docState: any = null;
// IMPORT-UX-001 RF-2: erro persistente do pipeline (não-reset silencioso).
// Quando não-null, o upload form exibe a mensagem em vez de sumir com o erro.
let _lastPipelineError: { title: string; detail: string; canRetry: boolean } | null = null;
// IMPORT-UX-001 RF-6: true enquanto o modal esta minimizado (escondido, mas o
// processamento em background/_docState continuam vivos). Reset ao abrir/
// fechar o modal de verdade.
let _ingestionMinimized = false;
const INGESTION_BG_TASK_ID = 'ingestion-processing';
// IMPORT-UX-001 RF-6: AbortController para cancelamento pelo usuário durante
// processamento em background. Criado no início do pipeline de documento,
// verificado entre estágios pesados (Track B/C/D, PII, assessment).
let _ingestionAbortController: AbortController | null = null;
/**
 * Injeta referencia ao refresh de UI (chamado pelo registerAllHandlers).
 */
/** @param {any} fn */
export function setUpdateAllUI( fn: any) {
    _requestUIRefresh = fn;
}
function requestIngestionUIRefresh(reason = 'ingestion.changed') {
    if (!_requestUIRefresh)
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.INGESTION,
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.STATUS,
        UI_INVALIDATION_DOMAINS.HOME,
    ];
    for (const domain of domains)
        _requestUIRefresh(domain, reason);
}
export function handleIngestionRefreshUI() {
    requestIngestionUIRefresh('ingestion.manual-refresh');
}
// ----------------------------------------------------------------
// MODAL OPEN/CLOSE
// ----------------------------------------------------------------
/**
 * Abre o modal de ingestao de planilha.
 * Reseta o estado do wizard.
 */
export function handleOpenIngestionModal() {
    // MOD-LIB-MIG-001 M2 — respeita o toggle do Library Hub. Default = enabled.
    if (!isCapabilityEnabled('ingestion')) {
        showToast(
            t('library.capabilityDisabled')
                || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    // IMPORT-UX-001 RF-6: restaurando de um minimize — NÃO resetar o estado
    // (a ingestão continua de onde estava); só o cold-open zera tudo.
    const restoringFromMinimize = _ingestionMinimized;
    if (!restoringFromMinimize) {
        _wizardState = null;
        _docState = null;
    }
    _ingestionMinimized = false;
    stopBgLoading(INGESTION_BG_TASK_ID);
    const modal = document.getElementById('ingestion-modal');
    if (modal) {
        // INGEST-MODAL-VISIBILITY (2026-06-02, Calvin AI vision finding):
        // Algum init code seta inline `display: none` no modal. Especificidade
        // inline > class, então `.modal-overlay.active { display: flex }` não
        // aplica e o modal fica invisível mesmo após classList.add('active').
        // Fix: limpar display inline ANTES de adicionar .active.
        if (modal.style.display === 'none') {
            modal.style.removeProperty('display');
        }
        modal.classList.add('active');
        if (restoringFromMinimize && _docState) _renderDocReview();
        else renderIngestionStep();
    }
}

/**
 * IMPORT-UX-001 RF-6: minimiza o modal (esconde, mas NÃO reseta _docState/
 * _pdfDoc — o processamento em background continua). Mostra um chip
 * persistente no statusbar (bg-loading-badge) que reabre o modal ao clicar.
 * Chamado pelo botão de minimizar do modal enquanto uma ingestão de
 * documento está em andamento (fileType pdf/docx).
 */
export function handleMinimizeIngestionModal() {
    const modal = document.getElementById('ingestion-modal');
    if (modal) modal.classList.remove('active');
    _ingestionMinimized = true;
    const label = _docState?.fileName
        ? t('ingestion.minimizedLabel', { fileName: _docState.fileName }) || `Importando ${_docState.fileName}…`
        : t('ingestion.minimizedLabelGeneric') || 'Importando documento…';
    startBgLoading(INGESTION_BG_TASK_ID, label, handleOpenIngestionModal);
}
/**
 * IMPORT-UX-001 RF-6: cancela o processamento de documento em andamento.
 * Aborta o AbortController (verificado entre estágios do pipeline), limpa
 * o estado e fecha o modal. O usuário pode recomeçar com o mesmo arquivo.
 */
export function handleCancelIngestion() {
    if (_ingestionAbortController) {
        _ingestionAbortController.abort();
        _ingestionAbortController = null;
    }
    stopBgLoading(INGESTION_BG_TASK_ID);
    _ingestionMinimized = false;
    const fileName = _docState?.fileName || '';
    _cleanupDocState();
    _lastPipelineError = null;
    const modal = document.getElementById('ingestion-modal');
    if (modal) modal.classList.remove('active');
    showToast(
        fileName
            ? t('ingestion.cancelledWithFile', { fileName }) || `Importação de "${fileName}" cancelada.`
            : t('ingestion.cancelled') || 'Importação cancelada.',
        'info',
    );
}
/**
 * Lab Data Wizard alias - opens the ingestion modal for lab data results.
 * Wired from index.html toolbar dropdown ((window as any).handleStartLabIngestion).
 * 2026-05-01 wakeup-tick #47: closes CT-5 handler registration gate failure.
 * Same backend as handleOpenIngestionModal - wizard already supports lab data
 * via auto-detect identityResolver + edd-mapper.
 */
export function handleStartLabIngestion() {
    return handleOpenIngestionModal();
}
/**
 * Fecha o modal de ingestao.
 */
export function handleCloseIngestionModal() {
    const modal = document.getElementById('ingestion-modal');
    if (modal) {
        modal.classList.remove('active');
        // Reset fullscreen styles from split view
        modal.style.cssText = modal.style.cssText.replace(/position:fixed[^;]*;|inset:[^;]*;|z-index:[^;]*;|width:100vw[^;]*;|height:100vh[^;]*;|max-width:[^;]*;|max-height:[^;]*;|border-radius:0[^;]*;/g, '');
    }
    // IMPORT-UX-001 RF-6: fechar o modal durante processamento cancela a ingestão.
    if (_ingestionAbortController) {
        _ingestionAbortController.abort();
        _ingestionAbortController = null;
    }
    stopBgLoading(INGESTION_BG_TASK_ID);
    _ingestionMinimized = false;
    // Cleanup PDF preview
    if (_pdfDoc) {
        try {
            _pdfDoc.destroy();
        }
        catch (e: any) {
            console.debug('[ingestion] pdfDestroy1:', _errorMessage(e) || e);
        }
        _pdfDoc = null;
    }
    _pageCache.clear();
    _pageRenderJobs.clear();
    _wizardState = null;
    _cleanupDocState();
}
// ----------------------------------------------------------------
// FILE UPLOAD
// ----------------------------------------------------------------
/**
 * Handler do file input - faz parse e inicia o wizard.
 */
/** @param {any} input */
export async function handleIngestionFileUpload( input: any) {
    const file = input?.files?.[0];
    if (!file)
        return;
    await handleIngestionDirectFile(file);
}
/** @param {any} file */
export async function handleIngestionDirectFile( file: any) {
    if (!(file instanceof File))
        return;
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'pdf') {
        const proceed = await _runPdfPreAnalysis(file);
        if (!proceed) return;
    }
    _wizardState = null;
    _docState = null;
    await _startIngestionForFile(file);
}

/**
 * RF-7 (IMPORT-UX-001) — pré-análise ao selecionar um PDF: conta páginas via
 * pdf.js (leve, sem extrair conteúdo), mostra tamanho + estimativa de tempo, e
 * se o documento for grande (> LARGE_DOCUMENT_PAGE_THRESHOLD páginas) avisa e
 * oferece um intervalo de páginas antes de prosseguir. Retorna false se o
 * usuário cancelar o aviso — o caller então NÃO deve iniciar a ingestão.
 * @param {File} file
 * @returns {Promise<boolean>}
 */
async function _runPdfPreAnalysis(file: File): Promise<boolean> {
    let pageCount = 0;
    try {
        const pdfjsLib = (await importCDN('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs', {
            name: 'pdfjs-dist',
        })) as any;
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        pageCount = pdf.numPages;
    }
    catch (err: any) {
        log.warn('RF-7 pre-analysis: page count failed, skipping', _errorMessage(err));
        return true; // falha na pré-análise não deve bloquear a ingestão
    }
    const { buildPdfPreAnalysis, formatEstimatedTime, formatFileSize } = await import('../../core/ingestion/documents/_pdfPreAnalysisPure.js' as string);
    const analysis = buildPdfPreAnalysis(pageCount, file.size);
    if (!analysis.isLarge) {
        showToast(
            t('ingestion.preAnalysisSummary', {
                pages: analysis.pageCount,
                size: formatFileSize(analysis.fileSizeBytes),
                time: formatEstimatedTime(analysis.estimatedSeconds),
            }) ||
                `${analysis.pageCount} páginas · ${formatFileSize(analysis.fileSizeBytes)} · ${formatEstimatedTime(analysis.estimatedSeconds)}`,
            'info',
        );
        return true;
    }
    return await asyncConfirm(
        t('ingestion.preAnalysisLargeWarning', {
            pages: analysis.pageCount,
            time: formatEstimatedTime(analysis.estimatedSeconds),
        }) ||
            `Documento grande: ${analysis.pageCount} páginas, estimativa ${formatEstimatedTime(analysis.estimatedSeconds)}. Processar tudo mesmo assim?`,
        {
            confirmLabel: t('ingestion.preAnalysisProceedAll') || 'Processar tudo',
            cancelLabel: t('ingestion.preAnalysisCancel') || 'Cancelar',
        },
    );
}
/** @param {any} file */
async function _startIngestionForFile( file: any) {
    const ext = file.name.toLowerCase().split('.').pop();
    const isDocument = ext === 'pdf' || ext === 'docx';
    const isShapefile = ext === 'shp' || ext === 'zip';
    const container = document.getElementById('ingestion-content');
    if (container) {
        container.innerHTML = `<p style="color:var(--neutral-500);font-size:12px;padding:20px;text-align:center;">${t('ingestion.analyzingFile')}</p>`;
    }
    // Route: Shapefile (.shp, .zip) → shapefile import
    if (isShapefile) {
        try {
            showLoading('Importing shapefile...');
            const { importShapefile } = await import('../../core/io/formats/shapefile.js' as string);
            const result = await importShapefile(file);
            let added = 0;
            for (const el of result.elements) {
                try {
                    addElement(el.family, el.id, el.name, el.data, {
                        iconClass: `icon-${el.family}`,
                        color: el.color || '',
                        label: el.name,
                    });
                    added++;
                }
                catch (err: any) {
                    log.warn(`Shapefile element add failed: ${el.name}`, _errorMessage(err));
                }
            }
            showToast(t('ingestion.shapefileImported', { added }), 'success');
            if (result.warnings.length > 0) {
                log.warn('Shapefile import warnings', result.warnings);
            }
            handleCloseIngestionModal();
            requestIngestionUIRefresh('ingestion.shapefile-imported');
            // Auto-fit camera para englobar todos os elementos importados
            if (typeof window.fitAllElements === 'function')
                window.fitAllElements();
        }
        catch (err: any) {
            log.error('Shapefile import failed', _errorMessage(err));
            showToast(t('ingestion.shapefileError', { message: _errorMessage(err) }), 'error');
            if (container) {
                container.innerHTML = renderUploadForm();
                wireIngestionDropzone(container, (file: File) => handleIngestionDirectFile(file));
            }
        }
        finally {
            hideLoading();
        }
        return;
    }
    // Route: PDF/DOCX → document ingestion pipeline v0.2
    if (isDocument) {
        showLoading('Processing document...');
        _ingestionAbortController = new AbortController();
        const _abortSignal = _ingestionAbortController.signal;
        try {
            _docState = {
                step: 'extracting',
                fileName: file.name,
                fileType: ext,
                _sourceFile: file,
                _processing: {
                    startedAt: Date.now(),
                    phase: 'prepare',
                    percent: 0,
                    message: 'Iniciando...',
                    history: [],
                },
            };
            _renderDocProgress(0, 'Iniciando...');
            // ── Pre-init OCR in background (SP-2) ──
            if (isOCRSupported() && !isOCRReady()) {
                initOCR({
                    onProgress: (pct: any, msg: any) => _renderDocProgress(pct * 0.05, msg),
                }).catch((err: any) => log.warn('OCR pre-init failed', _errorMessage(err)));
            }
            // ── Worker extraction ──
            const result: any = await ingestDocument(file, {
                minConfidence: 0.6,
                onProgress: (pct: any, msg: any) => {
                    _renderDocProgress(pct * 0.6, msg); // Worker gets 0-60% of progress bar
                    setLoadingMessage(msg || 'Processing document...');
                },
            });
            const { readings, images, rawText, textItems, htmlContent, pageCount, isScanned } = result;
            // ── RF-6: yield to UI thread + abort check between stages ──
            await new Promise((r) => setTimeout(r, 0));
            if (_abortSignal.aborted) throw new DOMException('Aborted', 'AbortError');
            // ── Convert images to Blob URLs (SP-31: memory optimization) ──
            const blobImages = _convertImagesToBlobUrls(images || []);
            // ── Scanned PDF: full-page OCR → assemble rawText ──
            let scannedRawText = rawText || '';
            let scannedTextItems = textItems;
            let scannedTables = result.tables || [];
            if (isScanned && result.pageImages && result.pageImages.length > 0) {
                _renderDocProgress(62, 'OCR em páginas escaneadas...');
                const pageOcrResult = await _processScannedPages(result.pageImages);
                scannedRawText = pageOcrResult.rawText;
                scannedTextItems = pageOcrResult.textItems;
                scannedTables = pageOcrResult.tables;
            }
            // ── Track A: Tables → staging (existing pipeline) ── (already done in ingestDocument)
            // ── Track B: Images → OCR → classify → document_assets ──
            await new Promise((r) => setTimeout(r, 0));
            if (_abortSignal.aborted) throw new DOMException('Aborted', 'AbortError');
            let documentAssets: any[] = [];
            let assetClassifications: any[] = [];
            if (blobImages.length > 0 && isOCRSupported()) {
                const trackBResult = await _processTrackB(blobImages, scannedTextItems, pageCount);
                documentAssets = trackBResult.assets;
                assetClassifications = trackBResult.classifications;
            }
            // ── Track C: Prose → NER → cross-references ──
            await new Promise((r) => setTimeout(r, 0));
            if (_abortSignal.aborted) throw new DOMException('Aborted', 'AbortError');
            let proseResult: any = null;
            let crossRefs: any = null;
            if (scannedRawText && scannedRawText.length > 20) {
                _renderDocProgress(92, 'Analisando texto...');
                const trackCResult = await _processTrackC(scannedRawText, documentAssets, assetClassifications, result.tables || scannedTables);
                proseResult = trackCResult.proseResult;
                crossRefs = trackCResult.crossRefs;
            }
            // ── Track D: Georeferencing (maps only) ──
            await new Promise((r) => setTimeout(r, 0));
            if (_abortSignal.aborted) throw new DOMException('Aborted', 'AbortError');
            let mapResults: any[] = [];
            let suggestedOriginCoord: any = null;
            const mapAssets = documentAssets.filter((_: any, i: any) => assetClassifications[i]?.assetType === 'map');
            if (mapAssets.length > 0) {
                _renderDocProgress(95, 'Georeferenciando mapas...');
                const trackDResult = await _processTrackD(mapAssets, assetClassifications, documentAssets);
                mapResults = trackDResult.mapResults;
                suggestedOriginCoord = trackDResult.suggestedOrigin;
            }
            // ── PII detection (SP-32) ──
            await new Promise((r) => setTimeout(r, 0));
            if (_abortSignal.aborted) throw new DOMException('Aborted', 'AbortError');
            let piiDetection: any = null;
            if (scannedRawText) {
                piiDetection = detectPII(scannedRawText);
                if (piiDetection.detected) {
                    console.info('[ingestion] PII detected:', piiDetection.types);
                }
            }
            // ── F1e: Detect document locale from raw text ──
            const detectedLocale = scannedRawText ? detectDocumentLocale(scannedRawText) : null;
            // ── ASSESS-001: Document assessment auto-config ──
            let assessment: any = null;
            if (scannedRawText) {
                try {
                    const { assessDocumentV2 } = await import('../../core/assessment/documentAssessor.js' as string);
                    assessment = assessDocumentV2(scannedRawText);
                }
                catch (err: any) {
                    log.warn('Document assessment failed', _errorMessage(err));
                }
            }
            // ── RICH-DOC-FULL-001: extração 70% não-tabular (identidade + status + litologia + cronologia) ──
            // Reusa scannedRawText já populado pelo Worker/pdfplumber.
            // Additive ao pipeline existente — não bloqueia se falhar.
            // Não modifica ingestDocument nem os Tracks A/B/C/D.
            let autoExtractedMetadata: any = null;
            let consensusMatrix: any = null;
            if (scannedRawText && scannedRawText.length > 20) {
                try {
                    const { extractFullMetadata } = await import('../../core/ingestion/documents/index.js' as string);
                    autoExtractedMetadata = extractFullMetadata(scannedRawText);
                    log.debug(
                        'RICH-DOC-FULL: autoFilled',
                        autoExtractedMetadata?.autoFilledFieldCount ?? 0,
                        'fields',
                    );
                    // CONSENSUS-MATRIX-001 F6 — build matrix a partir do RICH-DOC outputs.
                    // Hoje apenas T0 (heurística baseline) por campo; quando T1/T3/T4
                    // forem adicionados (regex paralelo, visão, LLM), a matriz vai
                    // detectar conflitos automaticamente.
                    try {
                        const { buildConsensusFromRichDoc } = await import(
                            '../../core/ingestion/documents/index.js' as string
                        );
                        consensusMatrix = buildConsensusFromRichDoc(autoExtractedMetadata);
                        log.debug(
                            'CONSENSUS-MATRIX: verdicts',
                            consensusMatrix?.verdicts?.length ?? 0,
                            'critical',
                            consensusMatrix?.summary?.criticalCount ?? 0,
                        );
                    } catch (e: any) {
                        log.debug('[consensus-matrix:build-failed]', e?.message || e);
                    }
                }
                catch (err: any) {
                    log.warn('Full metadata extraction failed', _errorMessage(err));
                }
            }

            // ── VISION-FALLBACK-001 RF-5 — wire defensive (instrumentation) ──
            // claude - novaspec 2026-06-10: gate decide se vision deveria ativar;
            // provider real (gemma4/doclayout) NÃO está wired ainda — esse wire
            // apenas instrumenta (log + audit + merge no-op com array vazio) para
            // futuramente plugar jobs entre `gate.shouldActivate=true` e `merge`.
            // **Fail-safe**: qualquer erro NUNCA bloqueia pipeline existente.
            let visionMergerResult: any = null;
            try {
                if (autoExtractedMetadata) {
                    const { shouldActivateVisionFallback } = await import(
                        '../../core/ingestion/documents/vision/_visionFallbackGatePure.js' as string
                    );
                    const { mergeVisionResults } = await import(
                        '../../core/ingestion/documents/vision/_visionResultMergerPure.js' as string
                    );
                    const gateDecision = shouldActivateVisionFallback({
                        autoFilledFieldCount: Number(autoExtractedMetadata?.autoFilledFieldCount ?? 0),
                        wellsLithology: Array.isArray(autoExtractedMetadata?.wellsLithology)
                            ? autoExtractedMetadata.wellsLithology
                            : [],
                        pageCount: Number(pageCount ?? 0),
                    });
                    if (gateDecision.shouldActivate) {
                        log.info(
                            '[VISION-FALLBACK] gate ACTIVATED — provider not wired yet (instrumentation only).',
                            'regions=' + gateDecision.suggestedRegions.join(','),
                            'reason=' + gateDecision.reason,
                        );
                        // Provider real: enfileirar VisionRequests aqui (Web Worker / Edge).
                        // Por ora, results=[] → merge no-op + audit trail.
                        visionMergerResult = mergeVisionResults(autoExtractedMetadata, []);
                        autoExtractedMetadata = {
                            ...autoExtractedMetadata,
                            ...visionMergerResult.patch,
                            __visionGateActivated: true,
                            __visionSuggestedRegions: gateDecision.suggestedRegions,
                        };
                    } else {
                        log.debug(
                            '[VISION-FALLBACK] gate SKIPPED — reason=' + gateDecision.reason,
                        );
                    }
                }
            } catch (err: any) {
                log.debug('[VISION-FALLBACK] wire failed (non-blocking)', _errorMessage(err));
            }

            // ── FIGURE-GEOM-001 F3+F4: metadata geoespacial + régua + grid + family specs ──
            // Itera documentAssets (output do Track B) com caption presente.
            // Pure-logic — não toca imagem; usa caption + ocrText como adjacente.
            // Additive — falha em uma figura não bloqueia as outras.
            // F4: gera family specs prontos para addElement opcional (após review usuário).
            const figuresGeometry: any[] = [];
            const figureFamilySpecs: any[] = [];
            if (documentAssets && documentAssets.length > 0) {
                try {
                    const { extractFigureWithGeometry, figureBundleToFamilySpecs } = await import('../../core/ingestion/documents/index.js' as string);
                    for (let i = 0; i < documentAssets.length; i++) {
                        const asset = documentAssets[i];
                        if (!asset) continue;
                        const caption = asset.caption || '';
                        const adjacent = asset.ocrText || '';
                        if (!caption && !adjacent) continue;
                        try {
                            const bundle = extractFigureWithGeometry(caption, adjacent);
                            figuresGeometry.push({
                                figureIndex: i,
                                captionExcerpt: String(caption).slice(0, 100),
                                geometry: bundle.geometry,
                                depthRuler: bundle.depthRuler,
                                coordinateGrid: bundle.coordinateGrid,
                                combinedConfidence: bundle.combinedConfidence,
                            });
                            // F4: tenta gerar family specs prontos para addElement
                            try {
                                const familyResult = figureBundleToFamilySpecs(bundle, caption, i);
                                if (!familyResult.skipped && familyResult.specs.length > 0) {
                                    for (const spec of familyResult.specs) {
                                        figureFamilySpecs.push(spec);
                                    }
                                }
                            }
                            catch (famErr: any) {
                                log.debug('FIGURE-GEOM F4: skip family for figure', i, _errorMessage(famErr));
                            }
                        }
                        catch (innerErr: any) {
                            log.debug('FIGURE-GEOM: skip figure', i, _errorMessage(innerErr));
                        }
                    }
                    log.debug(
                        'FIGURE-GEOM: processed',
                        figuresGeometry.length,
                        'figures,',
                        figureFamilySpecs.length,
                        'family specs',
                    );
                }
                catch (err: any) {
                    log.warn('Figure geometry extraction failed', _errorMessage(err));
                }
            }
            // ── Merge into _docState ──
            const processingState = _docState?._processing || null;
            _docState = {
                step: 'review',
                fileName: result.fileName,
                fileType: result.fileType,
                _detectedLocale: detectedLocale,
                // Track A (existing)
                readings: readings || [],
                images: blobImages,
                imageAnalysis: null,
                summary: result.summary || getStagingSummary(readings || []),
                quarantinedTables: result.quarantinedTables || [],
                stats: result.stats || {},
                selected: new Set(),
                disclaimerVisible: false,
                // Track B (v0.2)
                documentAssets,
                assetClassifications,
                // Track C (v0.2)
                rawText: scannedRawText,
                textItems: scannedTextItems,
                htmlContent,
                pageCount: pageCount || 0,
                proseResult,
                crossRefs,
                // Track D (v0.2)
                mapResults,
                suggestedOrigin: suggestedOriginCoord,
                // PII (v0.2)
                _piiDetection: piiDetection,
                _piiConsentGiven: false,
                _decisions: buildDefaultDocDecisions(),
                // ASSESS-001
                _assessment: assessment,
                // RICH-DOC-FULL-001 — patch pré-preenchido (identidade + status + litologia + cronologia)
                _autoExtractedMetadata: autoExtractedMetadata,
                // CONSENSUS-MATRIX-001 F6 — matriz multi-tier (hoje só T0, expande com T1/T3/T4)
                _consensusMatrix: consensusMatrix,
                // FIGURE-GEOM-001 — geometria geoespacial + régua de profundidade por figura
                _figuresGeometry: figuresGeometry,
                // FIGURE-GEOM-001 F4 — family specs prontos para addElement opcional após review
                _figureFamilySpecs: figureFamilySpecs,
                // Scanned info
                isScanned: !!isScanned,
                // BUG-6: Buffer copy for PDF preview in split view
                _bufferCopy: result._bufferCopy || null,
                _postImportVisualAssets: null,
                _importSummary: null,
                _processing: processingState
                    ? {
                        ...processingState,
                        finishedAt: Date.now(),
                        percent: 100,
                        phase: 'complete',
                        message: 'Concluido',
                    }
                    : null,
            };
            // IMPORT-UX-001 RF-6: se o usuário minimizou o modal, notifica a
            // conclusão em vez de renderizar dentro do modal escondido — o
            // clique no chip (agora "Concluído") reabre e mostra a revisão.
            if (_ingestionMinimized) {
                stopBgLoading(INGESTION_BG_TASK_ID);
                startBgLoading(
                    INGESTION_BG_TASK_ID,
                    t('ingestion.minimizedDone', { fileName: _docState.fileName })
                        || `${_docState.fileName} pronto para revisão`,
                    handleOpenIngestionModal,
                );
                showToast(
                    t('ingestion.minimizedDoneToast', { fileName: _docState.fileName })
                        || `Importação de "${_docState.fileName}" concluída — clique para revisar.`,
                    'success',
                );
            } else {
                _renderDocReview();
            }
        }
        catch (err: any) {
            // IMPORT-UX-001 RF-6: cancelamento pelo usuário — não é erro.
            if (err?.name === 'AbortError') {
                log.info('Document pipeline cancelled by user');
                return;
            }
            // IMPORT-UX-001 RF-2: erros do pipeline VISÍVEIS — nunca reset silencioso.
            // Formata o erro em mensagem clara (pt-BR) e mantém persistente no modal.
            log.error('Document pipeline failed', _errorMessage(err));
            const errorInfo = formatIngestionError(_errorMessage(err));
            _lastPipelineError = errorInfo;
            // Se o erro permite retry, preserva o nome do arquivo para o usuário
            // saber qual arquivo falhou (não zera a seleção silenciosamente).
            if (!shouldKeepFileForRetry(errorInfo) && _docState?._sourceFile) {
                _cleanupDocState();
            } else {
                // Mantém _sourceFile referenciado mas limpa o resto do state
                const failedFile = _docState?._sourceFile;
                _cleanupDocState();
                if (failedFile) {
                    _docState = { _sourceFile: failedFile, fileName: failedFile.name };
                }
            }
            showToast(`${errorInfo.title}: ${errorInfo.detail}`, 'error');
            renderIngestionStep();
        }
        finally {
            hideLoading();
            _ingestionAbortController = null;
            // Release OCR engine WASM memory
            terminateOCR().catch((err: any) => log.debug('OCR terminate ignored', _errorMessage(err)));
        }
        return;
    }
    // Route: Spreadsheet → existing pipeline
    showLoading('Analyzing spreadsheet...');
    try {
        // 1. Parse
        const parsed = await parseFile(file);
        if (!parsed.sheets.length) {
            showToast(t('ingestion.emptyOrUnsupported'), 'error');
            return;
        }
        // 2. Detecta formato
        const format = detectFormat(parsed);
        // 3. Mapeia colunas (deterministico - IA e opcao do usuario no proximo step)
        const mapping = mapDeterministic(parsed, format);
        // 4. Transforma e valida
        const transformed = transformData((parsed), (mapping));
        const validation = validateMappedData((transformed), (mapping));
        // 5. Cria wizard
        // validateMappedData é um módulo ainda não-tipado (stats: AnyRecord); o cast
        // no boundary documenta o contrato esperado por createWizard sem propagar
        // estruturas soltas para dentro do wizard tipado.
        _wizardState = createWizard(parsed, format, mapping, validation as unknown as Parameters<typeof createWizard>[3]);
        // Injeta dados transformados no state para preview "de → para"
        _wizardState._transformed = transformed;
        _wizardState._sourceFile = file;
        renderIngestionStep();
    }
    catch (err: any) {
        log.error('Spreadsheet parse failed', _errorMessage(err));
        showToast(t('ingestion.parseError', { message: _errorMessage(err) }), 'error');
    }
    finally {
        hideLoading();
    }
}
// ----------------------------------------------------------------
// WIZARD NAVIGATION
// ----------------------------------------------------------------
/**
 * Avanca para o proximo step do wizard.
 * Coleta decisoes do step atual e avanca.
 */
export function handleIngestionNext() {
    if (!_wizardState)
        return;
    const decisions = collectCurrentDecisions();
    const prev = _wizardState;
    _wizardState = advanceWizard(_wizardState, decisions);
    // Preserva dados internos
    _wizardState._transformed = prev._transformed;
    renderIngestionStep();
}
/**
 * Volta para o step anterior.
 */
export function handleIngestionBack() {
    if (!_wizardState)
        return;
    const prev = _wizardState;
    _wizardState = goBackWizard(_wizardState);
    _wizardState._transformed = prev._transformed;
    renderIngestionStep();
}
/**
 * Executa a ingestao final.
 * Constroi modelo virtual e abre o Diff/Merge para revisao do usuario.
 */
let _isExecuting = false;
export async function handleIngestionExecute() {
    if (!_wizardState || _isExecuting)
        return;
    _isExecuting = true;
    try {
        await _executeIngestion();
    }
    finally {
        _isExecuting = false;
    }
}
async function _executeIngestion() {
    const decisions = collectCurrentDecisions();
    _wizardState = { ..._wizardState, decisions: { ..._wizardState.decisions, ...decisions, formatConfirmed: true } };
    const plan = buildIngestionPlan(_wizardState);
    // OHS domain: merge-based flow nao suportado ainda - usa pipeline direto
    if (plan.domain === 'ohs') {
        _renderIngestionProgressBar();
        try {
            const report = await ingest(plan);
            if (report.success) {
                showToast(t('ingestion.ohsCompleted', {
                    elements: report.created.elements,
                    observations: report.created.observations,
                    duration: report.duration,
                }), 'success');
                handleCloseIngestionModal();
                requestIngestionUIRefresh('ingestion.ohs-completed');
                purposeMicroFeedback('handleIngestionExecute');
            }
            else {
                showToast(t('ingestion.ohsError', { messages: report.errors.join('; ') }), 'error');
            }
        }
        catch (err: any) {
            log.error('OHS ingestion failed', _errorMessage(err));
            showToast(t('ingestion.ohsGenericError', { message: _errorMessage(err) }), 'error');
        }
        return;
    }
    // Domain validator engine: run active domain validators on mapped data
    try {
        const { runActiveDomainValidation } = await import('../../core/validation/engine/ecbtAdapter.js' as string);
        const domainResult: any = await runActiveDomainValidation((plan as any).records || []);
        if (domainResult.totalViolations > 0) {
            const errorCount = domainResult.domainResults.reduce((sum: any, r: any) => sum + r.violations.filter((v: any) => v.severity === 'error').length, 0);
            if (errorCount > 0) {
                const warnCount = domainResult.totalViolations - errorCount;
                const proceed = await asyncConfirm(`Validação de domínio encontrou ${errorCount} erro(s) e ${warnCount} aviso(s). Prosseguir com ingestão?`, ({
                    confirmLabel: 'Prosseguir mesmo assim',
                    cancelLabel: 'Revisar',
                    destructive: true,
                } as any));
                if (!proceed) {
                    _isExecuting = false;
                    return;
                }
            }
            log.warn('Domain validation found violations', domainResult);
        }
    }
    catch (err: any) {
        // Domain validation is optional - never block ingestion
        log.warn('Domain validation skipped', _errorMessage(err));
    }
    // D9: renderiza overlay de progresso durante construcao do modelo virtual
    let progress: any = null;
    try {
        const { showProgressOverlay } = await import('../ui/progressOverlay.js' as string);
        progress = showProgressOverlay(t('ingesting') || 'Ingerindo dados...');
    }
    catch (e: any) {
        console.debug('[ingestion] progressOverlay:', _errorMessage(e) || e);
        // Fallback: barra inline se overlay nao carregar
        _renderIngestionProgressBar();
    }
    // D11: exportar backup ECO1 antes de limpar (se solicitado)
    if (plan.decisions.exportBeforeClear && plan.decisions.clearStrategy !== 'none') {
        if (progress)
            progress.addInfo(t('creatingBackup') || 'Creating backup...');
        await handleDownloadECO1Backup();
    }
    /* @type any */
    let result;
    try {
        // Constroi modelo virtual (side-effect free) em vez de injetar diretamente
        result = await buildVirtualModel(plan, {
            onProgress: (phase: any, current: any, total: any) => {
                if (progress) {
                    progress.update(phase, current, total);
                }
                else {
                    const progressBar = (document.querySelector('.ingestion-progress-bar'));
                    if (progressBar) {
                        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
                        progressBar.style.width = `${pct}%`;
                        progressBar.textContent = t('ingestion.progressPhase', { phase, current, total });
                    }
                }
            },
        });
        // Surfacea warnings no overlay (antes escondidos no console)
        if (result.warnings.length > 0) {
            log.warn('buildVirtualModel warnings', result.warnings);
            for (const w of result.warnings) {
                if (progress)
                    progress.addWarning(w);
            }
        }
    }
    catch (err: any) {
        if (progress) {
            progress.addError(_errorMessage(err));
            progress.finish({ errors: 1 });
        }
        showToast(t('ingestion.modelBuildError', { message: _errorMessage(err) }), 'error');
        log.error('buildVirtualModel failed', _errorMessage(err));
        handleCloseIngestionModal();
        return;
    }
    // Dismiss overlay - merge modal assume daqui
    if (progress) {
        progress.finish({
            elements: result.stats.elements,
            campaigns: result.stats.campaigns,
            observations: result.stats.observations,
            warnings: result.warnings.length,
        });
        // Auto-dismiss apos 2s para nao bloquear merge modal
        setTimeout(() => {
            if (progress)
                progress.dismiss();
        }, 2000);
    }
    // Registra arquivo no file manager - fire-and-forget, NUNCA bloqueia o fluxo
    try {
        const sourceFile = _wizardState?._sourceFile;
        if (sourceFile) {
            const mode = getFileRegisterMode();
            registerFromIngestion(sourceFile, { mode, source: 'import' }).catch((regErr: any) => {
                log.warn('File register failed (non-blocking)', _errorMessage(regErr));
            });
        }
    }
    catch (err: any) {
        log.debug('File register ignored', _errorMessage(err));
    }
    // Captura modelo atual ANTES de fechar o wizard
    const currentModel = buildModel();
    // Gap 3: salvar virtual model para retry se merge for cancelado
    window._lastVirtualModel = result.model;
    window._lastCurrentModel = currentModel;
    // Fecha wizard e abre merge modal com modelos pre-carregados
    handleCloseIngestionModal();
    purposeMicroFeedback('handleIngestionExecute');
    showToast(t('ingestion.virtualModelBuilt', {
        elements: result.stats.elements,
        campaigns: result.stats.campaigns,
        observations: result.stats.observations,
    }), 'info');
    // Abre merge modal e pre-carrega modelos (handleOpenMergeModal reseta state e limpa _postMergeActions)
    mergeHandlers.handleOpenMergeModal();
    // D18/D19: salvar decisoes pos-merge APOS handleOpenMergeModal (que faz delete (window as any)._postMergeActions)
    if (plan.decisions.generateTerrain) {
        window._postMergeActions = {
            generateTerrain: true,
            generateAerial: plan.decisions.generateAerial !== false,
        };
    }
    mergeHandlers.preloadMergeModels(currentModel, result.model);
}
/**
 * D11: Baixa backup ECBT do modelo atual antes de limpar.
 * Gera chave ECBT e faz download automatico como arquivo .ecbt
 */
export async function handleDownloadECO1Backup() {
    try {
        const { generateKeySimple } = await import('../../core/io/export.js' as string);
        const key = await generateKeySimple();
        // D11: marcar backup como baixado para habilitar o botao "Ingerir Dados"
        if (_wizardState)
            _wizardState.backupDownloaded = true;
        const blob = new Blob([key], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `ecbyts-backup-${new Date().toISOString().slice(0, 10)}.ecbt`;
        a.click();
        URL.revokeObjectURL(a.href);
        showToast(t('ingestion.backupSuccess'), 'success');
        // Re-renderiza o step para habilitar o botao "Ingerir Dados"
        renderIngestionStep();
    }
    catch (err: any) {
        log.error('ECBT backup generation failed', _errorMessage(err));
        showToast(t('ingestion.backupError', { message: _errorMessage(err) }), 'error');
    }
}
/**
 * Atualiza override de mapeamento de coluna.
 */
/** @param {any} sheetName @param {any} sourceColumn @param {any} targetField */
export function handleIngestionColumnOverride( sheetName: any, sourceColumn: any, targetField: any) {
    if (!_wizardState)
        return;
    const key = `${sheetName}:${sourceColumn}`;
    _wizardState.decisions.columnOverrides[key] = targetField;
}
/**
 * Resolve ambiguidade.
 */
/** @param {any} ambiguityKey @param {any} resolution */
export function handleIngestionResolveAmbiguity( ambiguityKey: any, resolution: any) {
    if (!_wizardState)
        return;
    _wizardState.decisions.ambiguityResolutions[ambiguityKey] = resolution;
}
/**
 * Chama o mapeamento por IA para as colunas ainda nao mapeadas.
 * So executado quando o usuario clica explicitamente no botao "Mapear com IA".
 */
export async function handleIngestionMapWithAI() {
    if (!_wizardState)
        return;
    const btn = (document.querySelector('[data-action="map-with-ai"]'));
    if (btn) {
        btn.disabled = true;
        btn.textContent = t('ingestion.mappingWithAI');
    }
    try {
        const { hasApiKey, sendMessage } = await import('../../core/llm/client.js' as string);
        if (!hasApiKey()) {
            showToast(t('ingestion.apiKeyNotConfigured'), 'warning');
            if (typeof window.openLLMConfig === 'function')
                window.openLLMConfig();
            return;
        }
        showToast(t('ingestion.sendingColumnsToAI'), 'info');
        const aiClient = { sendMessage: (prompt: any) => sendMessage('', prompt) };
        const aiMapping = await mapWithAI(_wizardState.parsed, aiClient);
        // Merge: IA preenche gaps onde deterministico falhou
        const mapping = _wizardState.mapping;
        let applied = 0;
        for (const aiCol of aiMapping.columns || []) {
            const existing = (mapping.columns || []).find((c: any) => c.sourceSheet === aiCol.sourceSheet && c.sourceColumn === aiCol.sourceColumn);
            if (existing && !existing.targetField && aiCol.targetField) {
                existing.targetField = aiCol.targetField;
                existing.confidence = aiCol.confidence;
                existing.method = 'ai';
                existing.needsHumanReview = aiCol.confidence < 0.8;
                applied++;
            }
        }
        if ((mapping.sheetMappings || []).length === 0 && (aiMapping.sheetMappings || []).length > 0) {
            mapping.sheetMappings = aiMapping.sheetMappings;
        }
        // Atualiza wizard state e re-renderiza
        _wizardState = { ..._wizardState, mapping };
        renderIngestionStep();
        showToast(t('ingestion.aiMappedColumns', { applied }), applied > 0 ? 'success' : 'warning');
    }
    catch (err: any) {
        log.error('AI column mapping failed', _errorMessage(err));
        showToast(t('ingestion.aiMappingError', { message: _errorMessage(err) }), 'error');
        if (btn) {
            btn.disabled = false;
            btn.textContent = t('ingestion.mapWithAI');
        }
    }
}
/**
 * Handlers de lazy-load de observacoes (chamados do lists.js).
 */
/** @param {any} elementId @param {any} increment */
export function handleShowMoreObservations( elementId: any, increment: any) {
    showMoreObservations(elementId, increment);
}
/** @param {any} elementId @param {any} total */
export function handleShowAllObservations( elementId: any, total: any) {
    showAllObservations(elementId, total);
}
/**
 * Toggle campanha colapsavel na lista hierarquica de observacoes.
 */
/** @param {any} elementId @param {any} campaignId */
export function handleToggleObsCampaign( elementId: any, campaignId: any) {
    toggleObsCampaign(elementId, campaignId);
}
/**
 * Expande/colapsa detalhes de uma observacao individual.
 */
/** @param {any} elementId @param {any} obsIndex */
export function handleExpandObservation( elementId: any, obsIndex: any) {
    expandObservation(elementId, obsIndex);
}
// ----------------------------------------------------------------
// RENDER WIZARD STEPS
// ----------------------------------------------------------------
/**
 * Renderiza o step atual do wizard no modal.
 */
function renderIngestionStep() {
    const container = document.getElementById('ingestion-content');
    if (!container)
        return;
    if (!_wizardState) {
        container.innerHTML = renderUploadForm();
        wireIngestionDropzone(container, (file: File) => handleIngestionDirectFile(file));
        return;
    }
    const step = getWizardStep(_wizardState);
    // Step progress bar
    const pct = Math.round((step.stepNumber / step.totalSteps) * 100);
    let html = `
        <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-size:10px;${S_MUTED}">Etapa ${step.stepNumber} de ${step.totalSteps}</span>
                <span style="font-size:10px;${S_MUTED}">${pct}%</span>
            </div>
            <div style="height:3px;background:var(--neutral-200);border-radius:2px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:var(--accent-500);border-radius:2px;transition:width .3s;"></div>
            </div>
            <h3 style="margin:8px 0 2px;font-size:14px;color:var(--neutral-800);">${escapeHtml(step.title)}</h3>
            <p style="font-size:11px;${S_MUTED}margin:0;">${escapeHtml(step.subtitle)}</p>
        </div>
    `;
    // Aviso se modelo ja tem elementos
    if (step.stepNumber === 1) {
        const existing = getAllElements();
        if (existing.length > 0) {
            html += `
                <div style="background:var(--warning-50);border:1px solid var(--warning-300);border-radius:6px;padding:8px;margin-bottom:10px;font-size:11px;color:var(--neutral-800);">
                    <strong>Modelo existente:</strong> ${existing.length} elementos ja carregados.
                    Os dados importados serao adicionados ao modelo atual.
                    Se as coordenadas forem distantes, use <em>View &gt; Fit All</em> apos a ingestao.
                </div>
            `;
        }
    }
    switch (step.stepId) {
        case 'FORMAT_CONFIRM':
            html += renderFormatConfirm(step);
            break;
        case 'COLUMN_MAPPING':
            html += renderColumnMapping(step);
            break;
        case 'AMBIGUITY_RESOLUTION':
            html += renderAmbiguityResolution(step);
            break;
        case 'DOMAIN_DECISIONS':
            html += renderDomainDecisions(step);
            break;
        case 'REVIEW_AND_CONFIRM':
            html += renderReviewConfirm(step);
            break;
    }
    // Navigation buttons
    html += `
        <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;border-top:1px solid var(--neutral-200);padding-top:12px;">
            ${step.canGoBack ? '<button class="btn btn-secondary" data-cc-action="cc-b2f2959b">Voltar</button>' : ''}
            ${step.isLastStep
        ? (() => {
            // D11: se exportBeforeClear=true e backup nao foi baixado ainda, desabilitar botao
            const needsBackup = _wizardState?.decisions?.exportBeforeClear &&
                _wizardState?.decisions?.clearStrategy !== 'none' &&
                !_wizardState?.backupDownloaded;
            return needsBackup
                ? `<button class="btn btn-primary" disabled title="${t('ingestion.downloadBackupFirst')}" style="opacity:0.5;cursor:not-allowed;">${t('ingestion.ingestData')}</button>`
                : `<button class="btn btn-primary" data-cc-action="cc-dfb24f25">${t('ingestion.ingestData')}</button>`;
        })()
        : `<button class="btn btn-primary" data-cc-action="cc-830ef731">${t('common.next')}</button>`}
        </div>
    `;
    container.innerHTML = html;
}
/** @param {any} group */
function _templateLinks( group: any) {
    const S_LINK = 'color:var(--accent-500);text-decoration:none;cursor:pointer;';
    return Object.entries(TEMPLATES)
        .filter(([, t]) => t.group === group)
        .map(([id, t]) => `<a href="#" data-cc-call-click="handleDownloadTemplate|s:${encodeURIComponent(`${id}`)}" data-cc-prevent="1" style="${S_LINK}" title="${escapeHtml(t.filename)}">${escapeHtml(t.label)}</a>`)
        .join(' &middot; ');
}
// IMPORT-UX-001 RF-2 (HOTFIX 2026-07-09): fecha o aviso persistente de erro do
// pipeline. A função era EXPORTADA sem existir → ReferenceError que quebrava o
// boot inteiro do app (pego em teste de usuário real no browser; estava em prod).
function handleClearPipelineError() {
    _lastPipelineError = null;
    renderIngestionStep();
}
function renderUploadForm() {
    // IMPORT-UX-001 RF-2: erro persistente do pipeline (não-reset silencioso)
    const errorBanner = _lastPipelineError
        ? `
        <div style="background:var(--error-50,#fef2f2);border:1px solid var(--error-300,#fca5a5);border-radius:8px;padding:12px 16px;margin-bottom:16px;text-align:left;">
            <div style="display:flex;align-items:flex-start;gap:8px;">
                <span style="font-size:18px;color:var(--error-600,#dc2626);flex-shrink:0;">&#9888;</span>
                <div style="flex:1;">
                    <strong style="display:block;font-size:13px;color:var(--error-700,#b91c1c);margin-bottom:4px;">
                        ${escapeHtml(_lastPipelineError.title)}
                    </strong>
                    <p style="font-size:11px;color:var(--neutral-700);margin:0 0 8px;line-height:1.4;">
                        ${escapeHtml(_lastPipelineError.detail)}
                    </p>
                    ${_lastPipelineError.canRetry
                        ? `<p style="font-size:10px;color:var(--neutral-600);margin:0;">
                              Selecione o arquivo novamente para tentar de novo.
                           </p>`
                        : ''}
                </div>
                <button type="button" data-cc-action="cc-f3a2c901"
                        style="background:transparent;border:none;color:var(--neutral-400);cursor:pointer;font-size:14px;padding:0;line-height:1;"
                        title="Fechar aviso">&#215;</button>
            </div>
        </div>
    `
        : '';
    return `
        <div style="text-align:center;padding:24px;">
            ${errorBanner}
            <div style="display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:8px;max-width:860px;margin:0 auto 12px;">
                <button class="btn btn-secondary" type="button" data-cc-action="cc-a6dde696"
                        style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:10px 12px;text-align:left;">
                    <strong>Importar Modelo</strong>
                    <span style="${S_MUTED}font-size:10px;">.ecbt, .eco, .txt</span>
                    <span style="${S_MUTED}font-size:10px;">Abre o fluxo de modelo completo</span>
                </button>
                <button class="btn btn-primary" type="button" data-cc-action="cc-7502ee7f"
                        style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:10px 12px;text-align:left;">
                    <strong>Importar Dados</strong>
                    <span style="${S_MUTED}font-size:10px;">.xlsx, .csv, .pdf, .docx</span>
                    <span style="${S_MUTED}font-size:10px;">Wizard de dados (recomendado)</span>
                </button>
                <button class="btn btn-secondary" type="button" data-cc-action="cc-8d27c5bf"
                        style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:10px 12px;text-align:left;">
                    <strong>Importar Espacial</strong>
                    <span style="${S_MUTED}font-size:10px;">.shp, .zip, .dxf, .kml, .geojson</span>
                    <span style="${S_MUTED}font-size:10px;">Abre o fluxo geoespacial</span>
                </button>
            </div>
            <div id="ingestion-dropzone" style="border:2px dashed var(--neutral-300);border-radius:8px;padding:28px;margin-bottom:16px;">
                <p style="font-size:13px;color:var(--neutral-800);margin:0 0 12px;font-weight:500;">
                    Importar Dados (Planilha/Relatorio)
                </p>
                <p style="font-size:11px;${S_MUTED}margin:0 0 12px;">
                    Use este atalho para dados tabulares e relatorios. Para modelo/espacial, use os botoes acima.
                </p>
                <input id="ingestion-data-file-input" type="file" accept=".xlsx,.xls,.csv,.tsv,.pdf,.docx"
                       data-cc-change="cc-036550d7"
                       style="font-size:11px;color:var(--neutral-800);">
            </div>
            <div id="ingestion-import-queue"></div>
            <div style="font-size:10px;text-align:left;display:inline-block;line-height:1.7;margin-bottom:8px;">
                <div style="margin-bottom:4px;">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--primary-100);margin-right:4px;vertical-align:middle;"></span>
                    <strong>Planilha</strong> <span style="${S_MUTED}">(.xlsx, .csv) &#8594; wizard 5 etapas com mapeamento</span>
                </div>
                <div style="margin-bottom:4px;">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--warning-100);margin-right:4px;vertical-align:middle;"></span>
                    <strong>Relatorio</strong> <span style="${S_MUTED}">(.pdf, .docx) &#8594; extracao automatica de tabelas com revisao</span>
                </div>
                <div style="margin-bottom:4px;">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--success-100);margin-right:4px;vertical-align:middle;"></span>
                    <strong>Shapefile</strong> <span style="${S_MUTED}">(.shp, .zip) &#8594; importa geometrias como elementos</span>
                </div>
            </div>
            <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">Baixar modelo de exemplo (planilha):</p>
            <div style="font-size:10px;text-align:left;display:inline-block;line-height:1.7;">
                <div><span style="${S_MUTED}">Ambiental:</span> ${_templateLinks('env')}</div>
                <div><span style="${S_MUTED}">Ocupacional:</span> ${_templateLinks('ohs')}</div>
                <div><span style="${S_MUTED}">Referencia:</span> ${_templateLinks('ref')}</div>
                <div><span style="${S_MUTED}">GHG/ESG:</span> ${_templateLinks('ghg')}</div>
            </div>
        </div>
    `;
}
/** @param {any} mode */
function _openModalImportMode( mode: any) {
    if (typeof window.openImportModal !== 'function' || typeof window.setImportMode !== 'function') {
        showToast('Fluxo de importacao indisponivel no momento.', 'warning');
        return;
    }
    handleCloseIngestionModal();
    window.openImportModal();
    window.setImportMode(mode);
}
function handleIngestionRouteModel() {
    _openModalImportMode('model');
}
function handleIngestionRouteSpatial() {
    _openModalImportMode('spatial');
}
function handleIngestionRouteData() {
    const input = document.getElementById('ingestion-data-file-input');
    if (input && typeof input.click === 'function')
        input.click();
}
/** @param {any} step */
function renderFormatConfirm( step: any) {
    const f = step.format;
    const s = step.stats;
    // Wave KKKK2: format label lookup extraiu p/ _ingestionPure.resolveFormatLabel
    const formatName = resolveFormatLabel(f.type);
    let html = `
        <div style="${S_CARD}">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <p style="${S_TITLE}font-size:13px;">${escapeHtml(formatName)} ${f.version ? `<span style="${S_MUTED}font-weight:400;">v${f.version}</span>` : ''}</p>
                </div>
                <span style="font-size:12px;font-weight:600;color:${f.confidence >= 0.8 ? 'var(--success)' : f.confidence >= 0.5 ? 'var(--warning)' : 'var(--error)'};">
                    ${Math.round(f.confidence * 100)}%
                </span>
            </div>
        </div>

        <div style="${S_CARD}">
            <p style="${S_TITLE}font-size:11px;">Abas encontradas</p>
            <ul style="margin:0;padding-left:16px;font-size:11px;color:var(--neutral-800);">
                ${step.sheetsFound.map((s: any) => `<li>${escapeHtml(s.name)} <span style="${S_MUTED}">(${s.rowCount} linhas)</span></li>`).join('')}
            </ul>
        </div>
    `;
    if (s) {
        html += `
        <div style="${S_CARD}">
            <p style="${S_TITLE}font-size:11px;">Resumo dos dados</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;">
                <div><strong>${s.locations}</strong> locais</div>
                <div><strong>${s.samples}</strong> amostras</div>
                <div><strong>${s.results}</strong> resultados</div>
                <div><strong>${s.campaigns}</strong> campanha(s)</div>
                <div style="color:var(--success);"><strong>${s.detected}</strong> detectados</div>
                <div style="${S_MUTED}"><strong>${s.nonDetect}</strong> &lt;LQ (nao detectados)</div>
            </div>
            ${s.chemicals.length > 0
            ? `
            <p style="margin:6px 0 0;font-size:10px;${S_MUTED}">
                Parametros: ${escapeHtml(s.chemicals.slice(0, 8).join(', '))}${s.chemicals.length > 8 ? ` (+${s.chemicals.length - 8})` : ''}
            </p>`
            : ''}
            ${s.dateRange.min
            ? `
            <p style="margin:4px 0 0;font-size:10px;${S_MUTED}">
                Periodo: ${s.dateRange.min} a ${s.dateRange.max}
            </p>`
            : ''}
        </div>
        `;
        // Preview de dados: primeiras linhas de cada entidade
        if (_wizardState?._transformed) {
            const t = _wizardState._transformed;
            html += renderDataPreview(t);
        }
    }
    // D8: tabela de abas com mapeamento para entidades
    if (step.sheetMappingInfo?.length > 0) {
        html += `
        <div style="${S_CARD}">
            <p style="${S_TITLE}font-size:11px;">Mapeamento de abas</p>
            <table style="width:100%;font-size:10px;border-collapse:collapse;color:var(--neutral-800);">
                <thead>
                    <tr style="${S_TABLE_HEADER}">
                        <th style="text-align:left;padding:3px 6px;">Aba</th>
                        <th style="text-align:left;padding:3px 6px;">Entidade</th>
                        <th style="text-align:right;padding:3px 6px;">Registros</th>
                    </tr>
                </thead>
                <tbody>
                    ${step.sheetMappingInfo
            .map((si: any) => `
                    <tr data-testid="sheet-mapping-row" style="${S_TABLE_ROW}">
                        <td style="padding:3px 6px;font-weight:500;">${escapeHtml(si.name)}</td>
                        <td style="padding:3px 6px;${S_MUTED}">${si.entity ? escapeHtml(si.entity) : '—'}</td>
                        <td style="padding:3px 6px;text-align:right;">${si.count}</td>
                    </tr>`)
            .join('')}
                </tbody>
            </table>
        </div>`;
    }
    // D3: aviso e opcao de limpeza se modelo ja tem elementos
    if (step.existingModelWarning) {
        const { count, families } = step.existingModelWarning;
        html += `
        <div style="${S_CARD}border:1px solid var(--warning-300);">
            <p style="${S_TITLE}font-size:11px;color:var(--warning-700);">Modelo existente: ${count} elementos (${escapeHtml(families.join(', '))})</p>
            <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">Como tratar elementos existentes?</p>
            <label style="${S_LABEL}">
                <input data-field-meta="true" data-field-meta-key="auto-name:clearstrat" type="radio" name="clearstrat" value="none" ${(_wizardState?.decisions?.clearStrategy || 'none') === 'none' ? 'checked' : ''}
                       data-cc-change="cc-2c50f375">
                Manter tudo — adicionar ao modelo existente <span style="${S_MUTED}">(padrao)</span>
            </label>
            <label style="${S_LABEL}">
                <input data-field-meta="true" data-field-meta-key="auto-name:clearstrat" type="radio" name="clearstrat" value="all" ${_wizardState?.decisions?.clearStrategy === 'all' ? 'checked' : ''}
                       data-cc-change="cc-e2da4b46">
                Substituir — limpar modelo inteiro antes de importar
            </label>
            ${families.includes('well')
            ? `
            <label style="${S_LABEL}">
                <input data-field-meta="true" data-field-meta-key="auto-name:clearstrat" type="radio" name="clearstrat" value="family:well" ${_wizardState?.decisions?.clearStrategy === 'family:well' ? 'checked' : ''}
                       data-cc-change="cc-29d68907">
                Limpar apenas pocos de monitoramento
            </label>`
            : ''}
            ${step.showExportBeforeClear
            ? `
            <div style="margin-top:6px;padding:6px;background:var(--neutral-50);border-radius:4px;">
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto:export-before-clear" type="checkbox" id="export-before-clear"
                           ${_wizardState?.decisions?.exportBeforeClear ? 'checked' : ''}
                           data-cc-change="cc-d13fa186">
                    Exportar backup ECBT antes de limpar
                </label>
                <button class="btn btn-secondary btn-sm" style="margin-top:4px;font-size:10px;"
                        data-cc-action="cc-e2ee0fda">
                    Baixar backup agora
                </button>
            </div>`
            : ''}
        </div>`;
    }
    // D2: aplicar origem geografica como ponto zero do mapa
    if (step.suggestedOrigin) {
        const o = step.suggestedOrigin;
        const applyChecked = (_wizardState?.decisions?.applyOrigin ?? step.applyOriginDefault) ? 'checked' : '';
        const originLabel = formatOriginLabel(o);
        html += `
        <div style="${S_CARD}">
            <p style="${S_TITLE}font-size:11px;">Origem do mapa (coordenadas)</p>
            <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">
                ${originLabel}
            </p>
            <label style="${S_LABEL}">
                <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L1250" type="checkbox" ${applyChecked}
                       data-cc-call-change="_ingestionDecisionApplyOrigin|c|s:${encodeURIComponent(JSON.stringify(o))}">
                Definir centroide como origem do mapa (aplica coordenadas UTM)
            </label>
        </div>`;
        // Garante suggestedOrigin na decision sem sobrescrever escolha manual
        if (_wizardState &&
            (!_wizardState.decisions?.suggestedOrigin ||
                !Number.isFinite(_wizardState.decisions?.suggestedOrigin?.lat) ||
                !Number.isFinite(_wizardState.decisions?.suggestedOrigin?.lon))) {
            _wizardState.decisions.suggestedOrigin = o;
        }
    }
    // VILA LOBOS: card de deteccao de local conhecido
    if (step.locationDetection) {
        const ld = step.locationDetection;
        const conf = Math.round((ld.confidence || 0) * 100);
        const okColor = ld.matched ? 'var(--success-700,#15803d)' : 'var(--warning-700,#a16207)';
        const locLabel = ld.labelKey ? t(ld.labelKey) : escapeHtml(ld.label || t('ingestion.wizard.unidentified'));
        const locCity = ld.cityKey ? t(ld.cityKey) : ld.city ? escapeHtml(ld.city) : '';
        html += `
        <div style="${S_CARD}border:1px solid ${ld.matched ? 'var(--success-300,#86efac)' : 'var(--warning-300,#fcd34d)'};" data-testid="location-detection-card">
            <p style="${S_TITLE}font-size:11px;">${t('ingestion.wizard.locationDetectedTitle')}</p>
            <p style="font-size:11px;margin:0 0 4px;">
                <strong>${locLabel}</strong>${locCity ? ` <span style="${S_MUTED}">${locCity}</span>` : ''}
            </p>
            <p style="font-size:10px;margin:0;color:${okColor};">
                ${ld.matched ? t('ingestion.wizard.locationMatchOk') : t('ingestion.wizard.locationMatchFar')}
                ${ld.distanceKm != null ? ` ${t('ingestion.wizard.distanceKm', { km: ld.distanceKm.toFixed(2) })}` : ''}
                ${t('ingestion.wizard.confidencePct', { pct: conf })}.
            </p>
            <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
                <button class="btn btn-secondary btn-sm" data-cc-action="cc-ea0427cc">
                    ${t('ingestion.wizard.validateOnMap')}
                </button>
            </div>
        </div>`;
    }
    // VILA LOBOS: preview georreferenciamento (CRS + cobertura)
    if (step.georefPreview) {
        const gp = step.georefPreview;
        const datumOk = gp.detectedDatum && !gp.datumWarning;
        const datumColor = datumOk
            ? 'var(--success-700,#15803d)'
            : gp.datumWarning
                ? 'var(--warning-700,#a16207)'
                : 'var(--neutral-500)';
        html += `
        <div style="${S_CARD}${gp.datumWarning ? 'border:1px solid var(--warning-300,#fcd34d);' : ''}" data-testid="georef-preview-card">
            <p style="${S_TITLE}font-size:11px;">${t('ingestion.wizard.georefPreviewTitle')}</p>
            <p style="font-size:10px;margin:0 0 4px;">
                ${t('ingestion.wizard.validCoordinates', { valid: gp.withCoordinates, total: gp.totalLocations })}.
            </p>
            <p style="font-size:10px;margin:0;color:${datumColor};">
                ${t('ingestion.wizard.detectedDatum', { datum: gp.detectedDatum ? escapeHtml(gp.detectedDatum) : t('ingestion.wizard.notProvided') })}
                ${gp.datumWarning
            ? `<br><span style="color:var(--warning-700,#a16207);">${t('ingestion.wizard.datumWarning')}</span>`
            : ''}
            </p>
        </div>`;
    }
    // D12: aviso de coordenadas distantes
    if (step.distanceWarning) {
        const dw = step.distanceWarning;
        html += `
        <div style="${S_CARD}border:1px solid var(--error);background:rgba(184,68,68,0.05);">
            <p style="${S_TITLE}font-size:11px;color:var(--error);">Aviso: coordenadas distantes (${dw.km} km)</p>
            <p style="font-size:10px;${S_MUTED}margin:0;">
                Modelo existente centrado em ${dw.existingCentroid.lat.toFixed(3)}, ${dw.existingCentroid.lon.toFixed(3)}.
                Dados importados centrados em ${dw.newCentroid.lat.toFixed(3)}, ${dw.newCentroid.lon.toFixed(3)}.
                Considere usar "Substituir" ou "Limpar familia" acima.
            </p>
        </div>`;
    }
    if (f.evidence.length > 0) {
        html += `
        <details style="margin-top:4px;font-size:10px;${S_MUTED}">
            <summary style="cursor:pointer;">Evidencias de deteccao</summary>
            <ul style="padding-left:16px;margin:4px 0;">
                ${f.evidence.map((e: any) => `<li>${escapeHtml(e)}</li>`).join('')}
            </ul>
        </details>`;
    }
    // D8: Quick Import - banner quando elegivel
    if (step.quickImportEligible) {
        const isOn = _wizardState?.decisions?.quickImport || false;
        html += `
        <div style="${S_CARD}border:1px solid var(--success-300, #86efac);background:var(--success-50, #f0fdf4);">
            <div style="display:flex;align-items:center;gap:8px;">
                <label style="${S_LABEL}font-weight:500;color:var(--success-700, #15803d);flex:1;">
                    <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L1347" type="checkbox" ${isOn ? 'checked' : ''}
                           data-cc-change="cc-45cf6dfe">
                    Quick Import (pular configuracao)
                </label>
            </div>
            <p style="font-size:10px;color:var(--neutral-600);margin:4px 0 0;padding-left:22px;">
                Formato reconhecido com ${Math.round(f.confidence * 100)}% de confianca.
                Mapeamento automatico aplicado. Avanca direto para revisao final.
            </p>
        </div>`;
    }
    return html;
}
/**
 * Renderiza preview "de → para" dos dados transformados.
 * Mostra primeiras 2 linhas de locations, samples e results.
 */
/** @param {any} transformed */
function renderDataPreview( transformed: any) {
    let html = `<div style="${S_CARD}">
        <p style="${S_TITLE}font-size:11px;">Preview de dados (primeiras linhas)</p>`;
    if (transformed.locations.length > 0) {
        const loc = transformed.locations[0];
        html += `
        <div style="margin-bottom:6px;">
            <span style="font-size:10px;font-weight:600;color:var(--neutral-800);">Local:</span>
            <div style="${S_SAMPLE}margin-top:2px;">
                ${loc.elementName ? `<strong>${escapeHtml(String(loc.elementName))}</strong>` : '—'}
                ${loc.latitude != null ? ` | lat: ${loc.latitude}` : ''}
                ${loc.longitude != null ? ` | long: ${loc.longitude}` : ''}
                ${loc.locType ? ` | tipo: ${escapeHtml(String(loc.locType))}` : ''}
            </div>
        </div>`;
    }
    if (transformed.samples.length > 0) {
        const sam = transformed.samples[0];
        html += `
        <div style="margin-bottom:6px;">
            <span style="font-size:10px;font-weight:600;color:var(--neutral-800);">Amostra:</span>
            <div style="${S_SAMPLE}margin-top:2px;">
                ${sam.sampleCode ? `<strong>${escapeHtml(String(sam.sampleCode))}</strong>` : '—'}
                ${sam.elementName ? ` | local: ${escapeHtml(String(sam.elementName))}` : ''}
                ${sam.sampleDate ? ` | data: ${sam.sampleDate}` : ''}
                ${sam.matrix ? ` | matriz: ${escapeHtml(String(sam.matrix))}` : ''}
            </div>
        </div>`;
    }
    if (transformed.results.length > 0) {
        const res = transformed.results[0];
        html += `
        <div>
            <span style="font-size:10px;font-weight:600;color:var(--neutral-800);">Resultado:</span>
            <div style="${S_SAMPLE}margin-top:2px;">
                ${res.chemicalName ? `<strong>${escapeHtml(String(res.chemicalName))}</strong>` : '—'}
                ${res.resultValue != null ? ` = ${res.resultValue}` : ''}
                ${res.resultUnit ? ` ${escapeHtml(String(res.resultUnit))}` : ''}
                ${res.detectFlag ? ` | flag: ${escapeHtml(String(res.detectFlag))}` : ''}
                ${res.casNumber ? ` | CAS: ${escapeHtml(String(res.casNumber))}` : ''}
            </div>
        </div>`;
    }
    html += '</div>';
    return html;
}
/** @param {any} step */
function renderColumnMapping( step: any) {
    // Wave KKKK2: target-label dict extraída p/ _ingestionPure.COLUMN_TARGET_LABELS.
    const targetOptions = Object.keys(COLUMN_ALIASES)
        .map((k: any) => `<option value="${k}">${escapeHtml(resolveColumnTargetLabel(k))}</option>`)
        .join('');
    // Agrupar por sheet para melhor visualizacao
    const colsBySheet: any = {};
    for (const col of step.columns) {
        if (!col.sourceColumn)
            continue;
        const sheet = col.sourceSheet || '?';
        if (!colsBySheet[sheet])
            colsBySheet[sheet] = [];
        colsBySheet[sheet].push(col);
    }
    // Preview de valores para cada coluna - pegar da parsed data
    const sampleValues: any = {};
    if (_wizardState?.parsed?.sheets) {
        for (const sheet of _wizardState.parsed.sheets) {
            for (const row of sheet.rows.slice(0, 3)) {
                for (const [col, val] of Object.entries(row)) {
                    const key = `${sheet.name}:${col}`;
                    if (!sampleValues[key] && val != null && String(val).trim()) {
                        sampleValues[key] = String(val).slice(0, 25);
                    }
                }
            }
        }
    }
    // Conta colunas nao mapeadas no total
    const allCols = Object.values(colsBySheet).flat();
    const totalUnmapped = allCols.filter((c: any) => !c.targetField).length;
    let html = '';
    for (const [sheetName, cols] of Object.entries(colsBySheet) as [string, any[]][]) {
        const mapped = cols.filter((c: any) => c.targetField);
        html += `
        <div style="margin-bottom:10px;">
            <p style="font-size:10px;font-weight:600;color:var(--neutral-800);margin:0 0 4px;">
                ${escapeHtml(sheetName)} <span style="${S_MUTED}font-weight:400;">(${mapped.length}/${cols.length} mapeadas)</span>
            </p>
            <div style="max-height:200px;overflow-y:auto;border:1px solid var(--neutral-200);border-radius:4px;">
                <table style="width:100%;font-size:11px;border-collapse:collapse;color:var(--neutral-800);">
                    <thead>
                        <tr style="${S_TABLE_HEADER}">
                            <th style="text-align:left;padding:4px 6px;">Coluna</th>
                            <th style="text-align:left;padding:4px 6px;">Exemplo</th>
                            <th style="text-align:left;padding:4px 6px;">Campo ecbyts</th>
                            <th style="text-align:center;padding:4px 6px;width:40px;">Conf.</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cols
            .map((col: any) => {
            const key = `${sheetName}:${col.sourceColumn}`;
            const sample = sampleValues[key] || '';
            const bg = columnConfidenceBackground(col.confidence);
            return `
                            <tr style="${bg}${S_TABLE_ROW}">
                                <td style="padding:3px 6px;font-weight:500;">${escapeHtml(col.sourceColumn)}</td>
                                <td style="padding:3px 6px;"><span style="${S_SAMPLE}">${escapeHtml(sample)}</span></td>
                                <td style="padding:3px 6px;">
                                    <select data-field-meta="true" data-field-meta-key="auto-pos:ingestion:select:L1539" class="form-input form-input-sm" style="font-size:10px;"
                                            data-cc-call-change="handleIngestionColumnOverride|s:${encodeURIComponent(`${escapeHtml(sheetName)}`)}|s:${encodeURIComponent(`${escapeHtml(col.sourceColumn)}`)}|v">
                                        <option value="">-- ignorar --</option>
                                        ${targetOptions.replace(`value="${col.targetField}"`, `value="${col.targetField}" selected`)}
                                    </select>
                                </td>
                                <td style="text-align:center;padding:3px 6px;font-size:10px;font-weight:600;color:${col.confidence >= 0.8 ? 'var(--success)' : col.confidence > 0 ? 'var(--warning)' : 'var(--error)'};">
                                    ${Math.round(col.confidence * 100)}%
                                </td>
                            </tr>`;
        })
            .join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    }
    // Botao IA - aparece so se houver colunas nao mapeadas
    if (totalUnmapped > 0) {
        html += `
        <div style="margin-top:8px;padding:8px;background:var(--neutral-50);border:1px solid var(--neutral-200);border-radius:6px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span style="font-size:11px;color:var(--neutral-500);">
                ${totalUnmapped} coluna(s) sem mapeamento automatico.
            </span>
            <button class="btn btn-secondary btn-sm" data-action="map-with-ai"
                    data-cc-action="cc-888d97a6"
                    style="font-size:11px;white-space:nowrap;">
                Mapear com IA
            </button>
        </div>`;
    }
    return html;
}
/** @param {any} step */
function renderAmbiguityResolution( step: any) {
    return `
        <div style="margin-top:4px;">
            ${step.ambiguities
        .map((amb: any, _i: any) => `
                <div style="${S_CARD}">
                    <p style="font-size:11px;margin:0 0 4px;color:var(--neutral-800);">
                        <strong>${escapeHtml(amb.type)}:</strong> '${escapeHtml(amb.sourceValue)}'
                    </p>
                    <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">
                        ${escapeHtml(amb.context)}
                    </p>
                    <div style="display:flex;gap:6px;align-items:center;">
                        ${amb.suggestedTarget
        ? `
                            <button class="btn btn-sm btn-primary"
                                    data-cc-call-click="handleIngestionResolveAmbiguity|s:${encodeURIComponent(`${amb.type}:${escapeHtml(amb.sourceValue)}`)}|s:${encodeURIComponent(`${escapeHtml(amb.suggestedTarget)}`)}">
                                ${escapeHtml(amb.suggestedTarget)}
                            </button>`
        : ''}
                        <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L1601" type="text" class="form-input form-input-sm" placeholder="Outro..."
                               style="width:120px;font-size:10px;"
                               data-cc-call-change="handleIngestionResolveAmbiguity|s:${encodeURIComponent(`${amb.type}:${escapeHtml(amb.sourceValue)}`)}|v">
                    </div>
                </div>
            `)
        .join('')}
        </div>
    `;
}
/** @param {any} step */
function renderDomainDecisions( step: any) {
    return renderDomainDecisionsExt(step, { wizardState: _wizardState });
}
/** @param {any} step */
function renderReviewConfirm( step: any) {
    const d = step.decisions || {};
    // D6: selecao de estrategia de duplicatas
    const dupBlock = step.duplicateWarning
        ? `
        <div style="${S_CARD}border:1px solid var(--warning-300);">
            <p style="${S_TITLE}font-size:11px;color:var(--warning-700);">
                ${step.duplicateWarning.count} elementos ja existem no modelo
                <span style="${S_MUTED}font-weight:400;"> (ex: ${step.duplicateWarning.examples.map(escapeHtml).join(', ')})</span>
            </p>
            <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">Como tratar duplicatas?</p>
            <label style="${S_LABEL}">
                <input data-field-meta="true" data-field-meta-key="auto-name:dupstrat" type="radio" name="dupstrat" value="replace" ${(d.duplicateStrategy || 'replace') === 'replace' ? 'checked' : ''}
                       data-cc-change="cc-c6a118ad">
                Substituir elementos existentes pelos importados <span style="${S_MUTED}">(recomendado)</span>
            </label>
            <label style="${S_LABEL}">
                <input data-field-meta="true" data-field-meta-key="auto-name:dupstrat" type="radio" name="dupstrat" value="append" ${d.duplicateStrategy === 'append' ? 'checked' : ''}
                       data-cc-change="cc-4224e1e7">
                Adicionar mesmo se duplicado
            </label>
            <label style="${S_LABEL}">
                <input data-field-meta="true" data-field-meta-key="auto-name:dupstrat" type="radio" name="dupstrat" value="skip" ${d.duplicateStrategy === 'skip' ? 'checked' : ''}
                       data-cc-change="cc-3bed0a54">
                Ignorar elementos duplicados
            </label>
        </div>`
        : '';
    return `
        <div style="margin-top:4px;">
            ${dupBlock}
            <div style="${S_CARD}font-size:11px;line-height:1.6;">
                ${step.summary.map((l: any) => `<div>${escapeHtml(l)}</div>`).join('')}
            </div>
            ${step.warnings.length > 0
        ? `
            <details style="margin-top:6px;">
                <summary style="font-size:11px;color:var(--warning);cursor:pointer;font-weight:500;">
                    ${step.warnings.length} warning(s)
                </summary>
                <ul style="font-size:10px;${S_MUTED}padding-left:16px;max-height:150px;overflow-y:auto;">
                    ${step.warnings
            .slice(0, 20)
            .map((w: any) => `<li>${escapeHtml(w.message)}</li>`)
            .join('')}
                    ${step.warnings.length > 20 ? `<li>... e mais ${step.warnings.length - 20}</li>` : ''}
                </ul>
            </details>`
        : ''}
            ${step.errors.length > 0
        ? `
            <div style="margin-top:6px;padding:8px;background:rgba(184,68,68,0.1);border:1px solid var(--error);border-radius:6px;">
                <p style="font-size:11px;color:var(--error);margin:0;font-weight:500;">${step.errors.length} erro(s) — corrigir antes de ingerir</p>
                <ul style="font-size:10px;${S_MUTED}padding-left:16px;">
                    ${step.errors
            .slice(0, 10)
            .map((e: any) => `<li>${escapeHtml(_errorMessage(e))}</li>`)
            .join('')}
                </ul>
            </div>`
        : ''}
        </div>
    `;
}
// ----------------------------------------------------------------
// D9: PROGRESS BAR
// ----------------------------------------------------------------
/**
 * D9: Renderiza barra de progresso de ingestao no modal.
 * Exibe feedback visual durante processamento de grandes datasets.
 */
function _renderIngestionProgressBar() {
    const container = document.getElementById('ingestion-content');
    if (!container)
        return;
    container.innerHTML = `
        <div style="padding:24px;text-align:center;">
            <p style="font-size:13px;color:var(--neutral-800);margin:0 0 12px;font-weight:500;">Ingerindo dados...</p>
            <div style="height:12px;background:var(--neutral-200);border-radius:6px;overflow:hidden;margin-bottom:8px;">
                <div class="ingestion-progress-bar"
                     style="height:100%;width:0%;background:var(--accent-500);border-radius:6px;transition:width .2s;font-size:10px;color:#fff;display:flex;align-items:center;justify-content:center;min-width:30px;">
                    0%
                </div>
            </div>
            <p style="font-size:10px;color:var(--neutral-500);">Aguarde...</p>
        </div>
    `;
}
// ----------------------------------------------------------------
// D7/D13: VALIDATION TABLE + QAQC
// ----------------------------------------------------------------
/**
 * D7: Renderiza tabela de validacao pos-importacao no modal.
 * Compara contagens esperadas (parser) com contagens reais pos-import.
 * D13: Renderiza aba QAQC com estatisticas por parametro.
 *
 * @param {{ rows: Array<any>, qaqcRows: Array<any> }} data
 */
function _renderIngestionValidationTable( data: any) {
    const container = document.getElementById('ingestion-content');
    if (!container)
        return;
    // ARCH-MONOLITH-ATOMIZATION-001: status/match decision is pure logic now
    // (computeIngestionValidationVerdict in _ingestionPure.ts). Renderer is
    // presentation-only: map the precomputed verdict rows to <tr> cells.
    const verdict = computeIngestionValidationVerdict(data.rows);
    const { allMatch, statusColor, statusText } = verdict;
    const rowsHtml = verdict.rows
        .map((row: any) => `<tr style="${S_TABLE_ROW}">
            <td style="padding:4px 6px;font-weight:500;">${escapeHtml(row.entity)}</td>
            <td style="padding:4px 6px;${S_MUTED}">${escapeHtml(row.sheet)}</td>
            <td style="padding:4px 6px;text-align:right;">${row.expected}</td>
            <td style="padding:4px 6px;text-align:right;">${row.imported}</td>
            <td style="padding:4px 6px;text-align:center;font-weight:700;color:${row.color};">${row.icon}</td>
        </tr>`)
        .join('');
    // D13: tabela QAQC
    let qaqcHtml = '';
    if (data.qaqcRows && data.qaqcRows.length > 0) {
        qaqcHtml = `
        <details style="margin-top:8px;" open>
            <summary data-testid="qaqc-tab" style="font-size:11px;font-weight:600;color:var(--neutral-800);cursor:pointer;padding:4px 0;">
                QAQC por parametro (top ${data.qaqcRows.length})
            </summary>
            <div style="overflow-x:auto;margin-top:4px;">
            <table style="width:100%;font-size:10px;border-collapse:collapse;color:var(--neutral-800);">
                <thead>
                    <tr style="${S_TABLE_HEADER}">
                        <th style="text-align:left;padding:3px 6px;">Parametro</th>
                        <th style="text-align:right;padding:3px 6px;">N obs</th>
                        <th style="text-align:right;padding:3px 6px;">N &lt;LQ (%)</th>
                        <th style="text-align:right;padding:3px 6px;">Media det.</th>
                        <th style="text-align:right;padding:3px 6px;">Maximo</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.qaqcRows
            .map((r: any) => `
                    <tr data-testid="qaqc-param-row" style="${S_TABLE_ROW}">
                        <td style="padding:3px 6px;" title="${escapeHtml(r.parameterId)}">${escapeHtml(r.parameterName.slice(0, 22))}</td>
                        <td style="padding:3px 6px;text-align:right;">${r.nObs}</td>
                        <td style="padding:3px 6px;text-align:right;">${r.nND} (${r.pctND}%)</td>
                        <td style="padding:3px 6px;text-align:right;">${r.meanDet != null ? r.meanDet.toFixed(2) : '—'}</td>
                        <td style="padding:3px 6px;text-align:right;">${r.maxDet != null ? r.maxDet.toFixed(2) : '—'}</td>
                    </tr>`)
            .join('')}
                </tbody>
            </table>
            </div>
        </details>`;
    }
    container.innerHTML = `
        <div style="padding:12px 4px;">
            <div style="padding:8px 10px;border-radius:6px;background:${allMatch ? 'rgba(45,168,78,0.1)' : 'rgba(184,68,68,0.1)'};border:1px solid ${statusColor};margin-bottom:10px;">
                <span style="font-size:12px;font-weight:700;color:${statusColor};">${statusText}</span>
            </div>
            <div data-testid="ingestion-validation-table" style="${S_CARD}">
                <p style="${S_TITLE}font-size:11px;">Contagens de importacao</p>
                <table style="width:100%;font-size:11px;border-collapse:collapse;color:var(--neutral-800);">
                    <thead>
                        <tr style="${S_TABLE_HEADER}">
                            <th style="text-align:left;padding:4px 6px;">Entidade</th>
                            <th style="text-align:left;padding:4px 6px;">Origem</th>
                            <th style="text-align:right;padding:4px 6px;">Esperado</th>
                            <th style="text-align:right;padding:4px 6px;">Importado</th>
                            <th style="text-align:center;padding:4px 6px;">Status</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
            ${qaqcHtml}
            <div style="display:flex;justify-content:flex-end;margin-top:12px;padding-top:10px;border-top:1px solid var(--neutral-200);">
                <button class="btn btn-primary" data-cc-action="cc-0ddbfda8">Fechar</button>
            </div>
        </div>
    `;
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
function collectCurrentDecisions() {
    return { ..._wizardState?.decisions };
}
/** @param {any} field @param {any} value */
export function _ingestionDecision( field: any, value: any) {
    if (!_wizardState)
        return;
    if (!VALID_DECISIONS.has(field)) {
        log.warn('Rejected invalid decision field', field);
        return;
    }
    _wizardState.decisions[field] = value;
}

/**
 * CC-S1 B3 artesanal (CCC-001 Fase 11) — wrapper do checkbox "aplicar origem
 * sugerida": grava o flag E a origem sugerida numa só chamada (era dupla
 * _ingestionDecision inline). originJson chega serializado do template.
 */
export function _ingestionDecisionApplyOrigin(checked: any, originJson: any) {
    _ingestionDecision('applyOrigin', !!checked);
    try {
        _ingestionDecision('suggestedOrigin', JSON.parse(String(originJson)));
    } catch (e: any) {
        log.warn('applyOrigin: suggestedOrigin JSON inválido', e?.message || e);
    }
}
/**
 * Abre mapa interativo para validar/ajustar origem geográfica da importação.
 * Reutiliza mapPicker (MapLibre/Leaflet fallback) e persiste em suggestedOrigin.
 */
export async function handleIngestionValidateGeo() {
    if (!_wizardState)
        return;
    try {
        const step: any = getWizardStep(_wizardState);
        const start = step?.suggestedOrigin || _wizardState?.decisions?.suggestedOrigin || null;
        const { openMapPickerModal } = await import('../ui/mapPicker.js' as string);
        const result = await openMapPickerModal({
            mode: 'point',
            initialCenter: start && Number.isFinite(start.lat) && Number.isFinite(start.lon)
                ? { latitude: start.lat, longitude: start.lon }
                : null,
            initialZoom: start ? 15 : 12,
        });
        if (result && Number.isFinite(result.latitude) && Number.isFinite(result.longitude)) {
            _wizardState.decisions.suggestedOrigin = {
                lat: Number(result.latitude),
                lon: Number(result.longitude),
                count: Number(start?.count || 1),
                source: 'manual',
            };
            _wizardState.decisions.applyOrigin = true;
            showToast('Origem geografica atualizada no mapa.', 'success');
            renderIngestionStep();
        }
    }
    catch (err: any) {
        log.warn('Geo validation map failed', _errorMessage(err) || err);
        showToast(`Falha ao abrir mapa de validacao: ${_errorMessage(err) || err}`, 'warning');
    }
}
import { TEMPLATES } from './ingestionTemplates.js';
/**
 * Baixa um template CSV de exemplo para o formato selecionado.
 * @param {string} templateId - ID do template (ex: 'edd', 'ohs-aiha')
 */
export function handleDownloadTemplate( templateId: any) {
    const tmpl = (TEMPLATES)[templateId];
    if (!tmpl)
        return;
    const csv = tmpl.csv.join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tmpl.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
// ----------------------------------------------------------------
// DOCUMENT INGESTION (PDF/DOCX) - Rendering + Handlers
// ----------------------------------------------------------------
// ---------------------------------------------------------------------------
// v0.2: Track Helper Functions (delegated to documentTracks.js - Fix B2)
// ---------------------------------------------------------------------------
/** @see documentTracks.js - convertImagesToBlobUrls */
/** @param {any} images */
function _convertImagesToBlobUrls( images: any) {
    return convertImagesToBlobUrls(images);
}
/** Cleanup: revoke all Blob URLs in _docState on modal close. */
function _cleanupDocState() {
    if (_docState?.observer) {
        try {
            _docState.observer.disconnect();
        }
        catch (e: any) {
            console.debug('[ingestion] observerCleanup:', _errorMessage(e) || e);
            /* ignore */
        }
    }
    if (_docState?._keyHandler) {
        document.removeEventListener('keydown', _docState._keyHandler);
    }
    if (_docState?.images) {
        cleanupBlobUrls(_docState.images);
    }
    _pageRenderJobs.clear();
    _docState = null;
}
/** @see documentTracks.js - processScannedPages */
/** @param {any} pageImages */
async function _processScannedPages( pageImages: any) {
    return processScannedPages(pageImages, _renderDocProgress);
}
/** @see documentTracks.js - processTrackB */
/** @param {any} blobImages @param {any} textItems @param {any} pageCount */
async function _processTrackB( blobImages: any, textItems: any, pageCount: any) {
    return processTrackB(blobImages, textItems, pageCount, _renderDocProgress);
}
/** @see documentTracks.js - processTrackC */
/** @param {any} rawText @param {any} documentAssets @param {any} assetClassifications @param {any} tables */
async function _processTrackC( rawText: any, documentAssets: any, assetClassifications: any, tables: any) {
    return processTrackC(rawText, documentAssets, assetClassifications, tables);
}
/** @see documentTracks.js - processTrackD */
/** @param {any} mapAssets @param {any} allClassifications @param {any} allAssets */
async function _processTrackD( mapAssets: any, allClassifications: any, allAssets: any) {
    return processTrackD(mapAssets, allClassifications, allAssets);
}
/**
 * Renderiza barra de progresso durante extracao de documento.
 */
/** @param {any} pct @param {any} msg */
function _renderDocProgress( pct: any, msg: any) {
    const container = document.getElementById('ingestion-content');
    const safePct = clampProgressPercent(pct);
    // IMPORT-UX-001 RF-6: quando minimizado, atualiza o chip do statusbar com
    // progresso vivo (percentual + mensagem curta) em vez de label estático.
    if (_ingestionMinimized) {
        const shortMsg = (msg || '').slice(0, 60);
        const label = _docState?.fileName
            ? `${_docState.fileName} — ${safePct}% ${shortMsg}`
            : `${safePct}% ${shortMsg}`;
        startBgLoading(INGESTION_BG_TASK_ID, label, handleOpenIngestionModal);
    }
    if (!container)
        return;
    const phase = detectDocProcessPhase(safePct, msg);
    const now = Date.now();
    if (_docState) {
        if (!_docState._processing) {
            _docState._processing = { startedAt: now, history: [] };
        }
        const st = _docState._processing;
        st.percent = safePct;
        st.phase = phase;
        st.message = msg || '';
        st.lastUpdateAt = now;
        if (!Array.isArray(st.history))
            st.history = [];
        const last = st.history[st.history.length - 1];
        if (!last || last.msg !== (msg || '') || last.phase !== phase) {
            st.history.push({ at: now, phase, msg: msg || '' });
            if (st.history.length > 5)
                st.history.shift();
        }
    }
    const st = _docState?._processing || { startedAt: now, history: [], phase, percent: safePct, message: msg || '' };
    const elapsed = formatDocElapsed(now - (st.startedAt || now));
    const activeIndex = Math.max(0, DOC_PROCESS_PHASES.findIndex((p: any) => p.key === phase));
    const nextHint = phaseNextHint(phase);
    container.innerHTML = `
        <div style="padding:22px 20px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
                <p style="font-size:13px;color:var(--neutral-800);margin:0;font-weight:600;">
                    Processando documento
                </p>
                <span style="display:flex;align-items:center;gap:6px;">
                    <span style="font-size:10px;color:var(--neutral-600);background:var(--neutral-100);border:1px solid var(--neutral-200);padding:2px 8px;border-radius:999px;">
                        Tempo: ${elapsed}
                    </span>
                    <button type="button" class="btn btn-secondary" style="font-size:10px;padding:2px 8px;" data-handler="handleMinimizeIngestionModal" title="${escapeHtml(t('ingestion.minimizeTitle') || 'Minimizar e continuar usando o app')}">
                        ${escapeHtml(t('ingestion.minimize') || 'Minimizar')}
                    </button>
                    <button type="button" class="btn btn-secondary" style="font-size:10px;padding:2px 8px;color:var(--error-600,#dc2626);" data-handler="handleCancelIngestion" title="${escapeHtml(t('ingestion.cancelTitle') || 'Cancelar importação')}">
                        ${escapeHtml(t('ingestion.cancel') || 'Cancelar')}
                    </button>
                </span>
            </div>
            <div style="height:6px;background:var(--neutral-200);border-radius:3px;overflow:hidden;margin-bottom:6px;">
                <div style="height:100%;width:${safePct}%;background:linear-gradient(90deg,var(--accent-500),var(--accent-400));border-radius:3px;transition:width .25s ease;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;">
                <p style="font-size:11px;color:var(--neutral-700);margin:0;font-weight:500;">${escapeHtml(msg || 'Aguardando atualizacao...')}</p>
                <span style="font-size:10px;color:var(--neutral-600);">${safePct}%</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(120px,1fr));gap:6px;margin-bottom:10px;">
                ${DOC_PROCESS_PHASES.map((p: any, idx: any) => {
        const { bg, border, color, marker } = buildDocPhaseCardStyle(idx, activeIndex, safePct);
        return `<div style="border:1px solid ${border};background:${bg};border-radius:6px;padding:6px 8px;font-size:10px;color:${color};">
                        <span style="margin-right:6px;">${marker}</span>${escapeHtml(p.label)}
                    </div>`;
    }).join('')}
            </div>
            <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">${escapeHtml(nextHint)}</p>
            <p style="font-size:10px;${S_MUTED}margin:0;">${(st.history || []).map((h: any) => escapeHtml(`${formatDocElapsed(now - h.at)}: ${h.msg || h.phase}`)).join(' | ')}</p>
        </div>
    `;
}
/**
 * Renderiza a tela de revisao humana com classificacao por cores.
 */
function _renderDocReview() {
    const container = document.getElementById('ingestion-content');
    if (!container || !_docState || _docState.step !== 'review')
        return;
    const { readings, images, imageAnalysis, summary, quarantinedTables, fileName, selected, disclaimerVisible } = _docState;
    const hideRed = _docState._hideRed || false;
    // Build family options HTML for dropdowns
    const familyKeys = Object.keys(DEFAULT_FAMILIES);
    const { sortedIndices, uniqueWells, _docLocale, localeLabel, localeSignal, browserLang, localeMismatch, processingStats, processingDurationMs, extractorPrimary, extractorCache, budgetMode, decisions, matrixBuckets, visualAssets, piiDetected, selectedCount, unresolvedMatrixSelected, isLgpdBlocked, isConfirmBlocked, matchedParams, docType, }: any = (buildDocReviewState(_docState, navigator.language || 'en-US'));
    // FA: Fullscreen + Split View
    const modal = document.getElementById('ingestion-modal');
    if (modal) {
        modal.style.cssText +=
            ';position:fixed;inset:0;z-index:8900;width:100vw;height:100vh;max-width:100vw;max-height:100vh;border-radius:0;';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', 'Revisao de documento extraido');
    }
    const hasPdfPreview = _docState._bufferCopy && _docState.fileType === 'pdf';
    const _currentPage = _docState._currentPage || 1;
    let html = '';
    // Split view container
    if (hasPdfPreview) {
        const totalPages = _docState.pageCount || 1;
        html += `<div style="display:grid;grid-template-columns:2fr 3fr;gap:12px;height:calc(100vh - 140px);overflow:hidden;">`;
        // Left panel: Continuous scroll PDF preview
        html += `<div id="doc-pdf-scroll" style="overflow-y:auto;background:var(--neutral-100);border-radius:6px;padding:8px;">`;
        // Render a placeholder for each page
        for (let p = 1; p <= totalPages; p++) {
            const pageReadings = readings.filter((r: any) => (r.source?.page || 0) === p);
            const borderColor = pageReadings.some((r: any) => r.confidence === 'green')
                ? '#10b981'
                : pageReadings.some((r: any) => r.confidence === 'yellow')
                    ? '#f59e0b'
                    : pageReadings.length > 0
                        ? '#ef4444'
                        : 'var(--neutral-200)';
            html += `<div class="doc-page-wrapper" data-page="${p}" style="position:relative;margin-bottom:8px;border:2px solid ${borderColor};border-radius:4px;min-height:200px;background:var(--neutral-50);display:flex;align-items:center;justify-content:center;">
                <canvas data-page-canvas="${p}" style="max-width:100%;display:none;"></canvas>
                <span class="doc-page-placeholder" style="font-size:12px;color:var(--neutral-400);">Pagina ${p}</span>
            </div>`;
        }
        html += `</div>`;
        // Right panel: readings
        html += `<div style="overflow-y:auto;">`;
    }
    html += `
        <div style="margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;">
                <h3 style="margin:0;font-size:14px;color:var(--neutral-800);">Resultados da Extracao</h3>
                <span style="font-size:9px;padding:2px 6px;border-radius:8px;background:var(--neutral-100);border:1px solid var(--neutral-200);color:var(--neutral-600);"
                      title="${t('ingestion.numericFormatTooltip', { localeSignal: localeSignal ? ': ' + escapeHtml(localeSignal) : '' })}">
                    Formato: ${escapeHtml(localeLabel)}
                </span>
            </div>
            <p style="font-size:11px;${S_MUTED}margin:2px 0 0;">${escapeHtml(fileName)}${images.length > 0 ? ` &#8212; ${images.length} imagem(ns)` : ''}${uniqueWells.length > 0 ? ` &#8212; ${uniqueWells.length} ponto(s)` : ''}</p>
            ${localeMismatch ? `<p style="font-size:10px;color:var(--warning-600);margin:4px 0 0;">Formato do documento (${escapeHtml(localeLabel)}) difere do browser (${escapeHtml(browserLang)})</p>` : ''}
        </div>
    `;
    // ── RICH-DOC-FULL-001 badge ── reusa _docState._autoExtractedMetadata
    const _auto: any = (_docState as any)._autoExtractedMetadata;
    if (_auto && _auto.autoFilledFieldCount > 0) {
        const _bits: string[] = [];
        if (_auto.client?.name) _bits.push(`Cliente: ${escapeHtml(String(_auto.client.name))}`);
        if (_auto.client?.cnpj) _bits.push(`CNPJ: ${escapeHtml(String(_auto.client.cnpj))}`);
        if (_auto.area?.city && _auto.area?.state) _bits.push(`${escapeHtml(_auto.area.city)} / ${escapeHtml(_auto.area.state)}`);
        if (_auto.document?.reference) _bits.push(`Ref: ${escapeHtml(String(_auto.document.reference))}`);
        if (_auto.status?.classification && _auto.status.classification !== 'undetermined') {
            const pct = Math.round((Number(_auto.status.confidence) || 0) * 100);
            _bits.push(`Status: ${escapeHtml(String(_auto.status.classification))} (${pct}%)`);
        }
        if (Array.isArray(_auto.wellsLithology) && _auto.wellsLithology.length > 0) {
            _bits.push(`${_auto.wellsLithology.length} poço(s) com litologia`);
        }
        if (Array.isArray(_auto.campaigns) && _auto.campaigns.length > 0) {
            _bits.push(`${_auto.campaigns.length} campanha(s) datada(s)`);
        }
        html += `
            <div role="status" aria-live="polite"
                 style="margin:0 0 12px;padding:8px 10px;border-radius:6px;background:var(--info-50,#eef6ff);border:1px solid var(--info-200,#b9d6ff);font-size:11px;color:var(--neutral-800);">
                <div style="font-weight:600;margin-bottom:4px;">
                    &#129302; ${_auto.autoFilledFieldCount} campo(s) auto-preenchido(s) do PDF
                </div>
                ${_bits.length > 0 ? `<div style="font-size:10px;color:var(--neutral-700);">${_bits.join(' &middot; ')}</div>` : ''}
                ${Array.isArray(_auto.warnings) && _auto.warnings.length > 0
                    ? `<details style="margin-top:4px;font-size:9px;color:var(--neutral-500);"><summary>${_auto.warnings.length} aviso(s)</summary><ul style="margin:4px 0 0 12px;padding:0;">${_auto.warnings.slice(0, 8).map((w: any) => `<li>${escapeHtml(String(w))}</li>`).join('')}</ul></details>`
                    : ''}
            </div>
        `;
    }
    // ── FIGURE-GEOM-001 F5 badge ── reusa _docState._figureFamilySpecs + _figuresGeometry
    const _figSpecs: any[] = Array.isArray((_docState as any)._figureFamilySpecs)
        ? (_docState as any)._figureFamilySpecs
        : [];
    const _figGeo: any[] = Array.isArray((_docState as any)._figuresGeometry)
        ? (_docState as any)._figuresGeometry
        : [];
    if (_figSpecs.length > 0) {
        const _famCounts: Record<string, number> = {};
        for (const spec of _figSpecs) {
            const fam = String(spec?.family || 'unknown');
            _famCounts[fam] = (_famCounts[fam] || 0) + 1;
        }
        const _famBits: string[] = [];
        for (const fam of ['plume', 'boundary', 'well', 'blueprint']) {
            const n = _famCounts[fam] || 0;
            if (n > 0) _famBits.push(`${n} ${escapeHtml(fam)}`);
        }
        html += `
            <div role="status" aria-live="polite"
                 style="margin:0 0 12px;padding:8px 10px;border-radius:6px;background:var(--success-50,#ecfdf5);border:1px solid var(--success-200,#a7f3d0);font-size:11px;color:var(--neutral-800);">
                <div style="font-weight:600;margin-bottom:4px;">
                    &#128507; ${_figSpecs.length} figura(s) geo-localizada(s) prontas para virar elementos 3D
                </div>
                ${_famBits.length > 0 ? `<div style="font-size:10px;color:var(--neutral-700);">${_famBits.join(' &middot; ')}</div>` : ''}
                <details style="margin-top:4px;font-size:9px;color:var(--neutral-600);">
                    <summary style="cursor:pointer;">Detalhar ${_figSpecs.length} figura(s)</summary>
                    <ul style="margin:4px 0 0 12px;padding:0;list-style:disc;">
                        ${_figSpecs.slice(0, 20).map((spec: any, idx: number) => {
                            const geo = _figGeo[idx] || {};
                            const kind = escapeHtml(String(geo?.geometry?.kind || '?'));
                            const conf = Number(geo?.combinedConfidence || 0);
                            const pct = Math.round(conf * 100);
                            const name = escapeHtml(String(spec?.name || spec?.id || '(sem nome)').slice(0, 60));
                            return `<li>${escapeHtml(String(spec?.family || '?'))} &middot; ${kind} &middot; ${pct}% &middot; ${name}</li>`;
                        }).join('')}
                        ${_figSpecs.length > 20 ? `<li style="font-style:italic;">+${_figSpecs.length - 20} adicional(is)</li>` : ''}
                    </ul>
                </details>
            </div>
        `;
    }
    // ── CONSENSUS-MATRIX-001 F6 badge ── sempre visível quando há matriz
    try {
        const _consensus: any = (_docState as any)._consensusMatrix;
        if (_consensus && Array.isArray(_consensus.verdicts) && _consensus.verdicts.length > 0) {
            const s = _consensus.summary || {};
            const assertPct = Math.round((s.assertiveness || 0) * 100);
            html += `
                <div role="status" aria-live="polite"
                     style="margin:0 0 12px;padding:8px 10px;border-radius:6px;background:var(--neutral-100,#f3f4f6);border:1px solid var(--neutral-300,#d1d5db);font-size:11px;color:var(--neutral-800);">
                    <div style="font-weight:600;margin-bottom:4px;">
                        &#9878; Matriz de Consenso &mdash; ${_consensus.verdicts.length} campo(s), ${assertPct}% assertividade
                    </div>
                    <div style="font-size:10px;color:var(--neutral-700);">
                        &#10003; ${s.unanimousCount || 0} unânime(s) &middot;
                        &#9650; ${s.majorityCount || 0} maioria(s) &middot;
                        <span style="color:${(s.criticalCount || 0) > 0 ? 'var(--error-700,#b91c1c)' : 'var(--neutral-600)'};font-weight:${(s.criticalCount || 0) > 0 ? '600' : '400'};">
                            &#9888; ${s.criticalCount || 0} crítica(s)
                        </span>
                    </div>
                    ${(s.criticalCount || 0) === 0 ? '<div style="font-size:9px;color:var(--success-700);margin-top:2px;font-style:italic;">Hoje apenas T0 (heurística). Modal aparece quando T1/T3/T4 forem adicionados e divergirem.</div>' : ''}
                </div>
            `;
        }
    } catch (e: any) {
        log.debug('[ingestion:consensus-badge:render-failed]', e?.message || e);
    }
    // ── CONSENSUS-MATRIX-001 F2 wire ── modal "Revisão final" quando há críticas
    try {
        const _consensus: any = (_docState as any)._consensusMatrix;
        if (_consensus && shouldRenderModal(_consensus)) {
            html += renderConsensusModal(_consensus);
        }
    } catch (e: any) {
        log.debug('[ingestion:consensus-modal:render-failed]', e?.message || e);
    }
    const budgetChip = buildBudgetModeChip(budgetMode);
    const extractorChip = buildExtractorChip(extractorPrimary, extractorCache || '');
    const timingLabel = processingDurationMs != null ? formatDocElapsed(processingDurationMs) : '-';
    html += `
        <div style="background:var(--neutral-50);border:1px solid var(--neutral-200);border-radius:6px;padding:8px 10px;margin-bottom:10px;">
            <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px;">
                <strong style="font-size:11px;color:var(--neutral-800);">Estado do processamento</strong>
                ${extractorChip}
                ${budgetChip}
                <span style="font-size:10px;padding:2px 8px;border-radius:999px;background:var(--neutral-100);border:1px solid var(--neutral-200);color:var(--neutral-700);">
                    Tabelas: ${processingStats.processedTables || 0}/${processingStats.totalTables || 0}
                </span>
                <span style="font-size:10px;padding:2px 8px;border-radius:999px;background:var(--neutral-100);border:1px solid var(--neutral-200);color:var(--neutral-700);">
                    Duracao: ${escapeHtml(timingLabel)}
                </span>
            </div>
            ${processingStats.budgetWarnings?.length
        ? `<p style="font-size:10px;color:var(--warning-700);margin:0;">${escapeHtml(processingStats.budgetWarnings[0])}</p>`
        : `<p style="font-size:10px;${S_MUTED}margin:0;">Fluxo concluido. Revise as leituras antes de confirmar.</p>`}
        </div>
    `;
    // ASSESS-001: Render assessment card if available
    if (_docState._assessment) {
        html += renderAssessmentCard(_docState._assessment);
    }
    if (matchedParams.length > 0 || uniqueWells.length > 0) {
        html += `
            <div style="background:var(--neutral-50);border:1px solid var(--neutral-200);border-radius:6px;padding:8px 10px;margin-bottom:10px;font-size:10px;color:var(--neutral-600);">
                <strong style="color:var(--neutral-800);font-size:11px;">${escapeHtml(docType)}</strong>
                <span style="margin-left:8px;">Formato: ${escapeHtml(localeLabel)}</span>
                <span style="margin-left:8px;">${_docState.pageCount || '?'} pagina(s)</span>
                ${matchedParams.length > 0 ? `<br>Parametros: <strong>${matchedParams.map((p: any) => escapeHtml(p)).join(', ')}</strong>` : ''}
                ${uniqueWells.length > 0
            ? `<br>Pontos: <strong>${uniqueWells
                .slice(0, 10)
                .map((w: any) => escapeHtml(w))
                .join(', ')}${uniqueWells.length > 10 ? ` (+${uniqueWells.length - 10})` : ''}</strong>`
            : ''}
                <br><span style="font-style:italic;">Extraido automaticamente &#8212; verificar</span>
            </div>
        `;
    }
    // Summary counters (explicit descriptive text)
    html += `<p style="font-size:11px;color:var(--neutral-600);margin:0 0 8px;">
        ${summary.total} leitura(s) extraida(s): <strong style="color:#10b981;">${summary.green} confirmada(s)</strong>,
        <strong style="color:#f59e0b;">${summary.yellow} para revisao</strong>,
        <strong style="color:#ef4444;">${summary.red} sem match</strong>
    </p>`;
    // P3: Legenda expandida com tooltips descritivos (Wave KKKK2: extraída p/ _ingestionPure)
    html += `<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;">`;
    for (const [color, count] of [
        ['green', summary.green],
        ['yellow', summary.yellow],
        ['red', summary.red],
    ]) {
        const c: any = (CONF_COLORS as any)[color];
        html += `<span style="font-size:11px;padding:3px 10px;border-radius:12px;background:${c.bg};border:1px solid ${c.border};color:var(--neutral-800);cursor:help;"
                       title="${resolveConfTooltip(color)}">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.dot};margin-right:4px;vertical-align:middle;"></span>
            ${c.label}: ${count}
        </span>`;
    }
    html += `<span style="font-size:11px;padding:3px 10px;border-radius:12px;background:var(--neutral-100);color:var(--neutral-800);">Total: ${summary.total}</span>`;
    html += `</div>`;
    // Image gallery (thumbnails)
    if (images.length > 0) {
        html += `
            <details style="margin-bottom:10px;" ${imageAnalysis ? 'open' : ''}>
                <summary style="cursor:pointer;font-size:12px;font-weight:600;color:var(--neutral-800);">
                    Imagens Encontradas (${images.length})
                </summary>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;max-height:200px;overflow-y:auto;">
        `;
        for (let i = 0; i < images.length; i++) {
            const img = images[i];
            const analysis = imageAnalysis?.[i];
            const tooltip = analysis ? escapeHtml(`${analysis.type}: ${analysis.description}`) : '';
            html += `
                <div style="width:80px;text-align:center;" ${tooltip ? `title="${tooltip}"` : ''}>
                    <img src="${img.blobUrl || img.dataUrl || ''}" style="width:80px;height:60px;object-fit:cover;border-radius:4px;border:1px solid var(--neutral-200);">
                    <div style="font-size:9px;${S_MUTED}margin-top:2px;">
                        ${img.page ? `p.${img.page}` : `#${i + 1}`}
                        ${analysis ? `<br>${escapeHtml(analysis.type || '')}` : ''}
                    </div>
                    ${analysis?.families?.length ? `<div style="font-size:8px;color:var(--primary-600);">${escapeHtml(analysis.families.join(', '))}</div>` : ''}
                </div>
            `;
        }
        html += `</div></details>`;
    }
    // AI Analysis - inline controls (non-blocking)
    if (images.length > 0 || readings.length > 0) {
        const aiAvailable = isLLMAvailable();
        const aiRunning = _docState._aiRunning;
        html += `
            <div style="margin-bottom:10px;display:flex;gap:8px;align-items:center;">
                <button class="btn btn-secondary" data-cc-action="cc-1d7f32fc"
                        ${aiRunning ? 'disabled' : ''}
                        style="font-size:11px;padding:4px 12px;">
                    ${aiRunning ? 'IA analisando...' : 'Analisar com IA'}
                </button>
                <button class="btn btn-secondary" data-cc-action="cc-5d7efe9c"
                        ${_docState._aiPagesRunning ? 'disabled' : ''}
                        style="font-size:11px;padding:4px 12px;">
                    ${_docState._aiPagesRunning ? 'Analisando paginas...' : 'Analisar Paginas'}
                </button>
                <span id="doc-ai-status"></span>
                <span id="doc-pages-status" style="font-size:10px;${S_MUTED}"></span>
                ${!aiAvailable ? `<button class="btn btn-outline" data-cc-action="cc-9e38a2b9" style="font-size:10px;padding:2px 8px;color:#ff9800;border-color:#ff9800;">&#9881; Configurar API</button>` : ''}
            </div>
        `;
    }
    // Quarantined tables warning
    if (quarantinedTables.length > 0) {
        html += `
            <div style="background:var(--warning-50);border:1px solid var(--warning-300);border-radius:6px;padding:8px;margin-bottom:10px;font-size:11px;color:var(--neutral-800);">
                <strong>${quarantinedTables.length} tabela(s)</strong> com confianca baixa foram ignoradas (threshold &lt; 0.6).
            </div>
        `;
    }
    // Disclaimer (shown when "Selecionar Sugeridos" is clicked)
    if (disclaimerVisible) {
        html += `
            <div style="background:var(--warning-50);border:1px solid var(--warning-300);border-radius:6px;padding:8px;margin-bottom:10px;font-size:11px;color:var(--neutral-800);">
                Selecionados automaticamente com base em confianca >= YELLOW.
                <strong>Revise cada item antes de confirmar.</strong> Itens RED nao sao selecionados.
            </div>
        `;
    }
    // FD: Bulk actions bar
    if (readings.length > 0) {
        html += `<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">`;
        if (summary.green > 0) {
            html += `<button class="btn btn-secondary" data-cc-action="cc-75fe68f5" style="font-size:10px;padding:3px 10px;color:#10b981;border-color:#10b981;">
                &#10003; Aceitar ${summary.green} confirmado${summary.green > 1 ? 's' : ''}
            </button>`;
        }
        if (summary.red > 0) {
            html += `<label style="font-size:10px;color:var(--neutral-500);cursor:pointer;display:flex;align-items:center;gap:4px;margin-left:auto;">
                <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L2907" type="checkbox" ${hideRed ? 'checked' : ''} data-cc-change="cc-67944d3c">
                Ocultar ${summary.red} sem match
            </label>`;
        }
        html += `</div>`;
    }
    // Readings table
    if (readings.length > 0) {
        html += `
            <div style="${hasPdfPreview ? '' : 'max-height:350px;'}overflow-y:auto;border:1px solid var(--neutral-200);border-radius:6px;">
                <table style="width:100%;border-collapse:collapse;font-size:11px;" aria-label="Leituras extraidas do documento">
                    <thead>
                        <tr style="${S_TABLE_HEADER}position:sticky;top:0;z-index:2;">
                            <th style="padding:6px 4px;text-align:left;width:24px;">
                                <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L2922" type="checkbox" ${selected.size > 0 && selected.size === readings.filter((r: any) => r.confidence !== 'red').length ? 'checked' : ''}
                                       data-cc-change="cc-3aa0a848">
                            </th>
                            <th style="padding:6px 6px;text-align:left;">Parametro</th>
                            <th style="padding:6px 6px;text-align:left;">Valor</th>
                            <th style="padding:6px 6px;text-align:left;">Unidade</th>
                            <th style="padding:6px 4px;text-align:center;width:60px;">Conf.</th>
                            <th style="padding:6px 6px;text-align:left;width:90px;">Familia</th>
                            <th style="padding:6px 6px;text-align:left;width:90px;">Elemento</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        let lastPage: any = null;
        for (const i of sortedIndices) {
            const r = readings[i];
            if (hideRed && r.confidence === 'red')
                continue;
            // P3: Page divider
            const curPage = r.source?.page || 0;
            if (curPage !== lastPage && curPage > 0) {
                const pageReadings = readings.filter((rd: any) => (rd.source?.page || 0) === curPage);
                const pg = pageReadings.filter((rd: any) => rd.confidence === 'green').length;
                const py = pageReadings.filter((rd: any) => rd.confidence === 'yellow').length;
                const pr = pageReadings.filter((rd: any) => rd.confidence === 'red').length;
                const matrixBadge = r.matrix
                    ? ` &#8212; ${escapeHtml(r.matrix === 'soil' ? 'Solo' : r.matrix === 'groundwater' ? 'Agua' : r.matrix === 'air' ? 'Ar' : r.matrix)}`
                    : '';
                html += `<tr><td colspan="7" style="padding:6px 8px;background:var(--neutral-100);font-size:10px;font-weight:600;color:var(--neutral-600);border-top:2px solid var(--neutral-200);">
                    Pagina ${curPage}${matrixBadge}
                    <span style="font-weight:400;margin-left:8px;">${pg > 0 ? `<span style="color:#10b981;">${pg}&#10003;</span> ` : ''}${py > 0 ? `<span style="color:#f59e0b;">${py}&#9888;</span> ` : ''}${pr > 0 ? `<span style="color:#ef4444;">${pr}&#10007;</span>` : ''}</span>
                </td></tr>`;
                lastPage = curPage;
            }
            const c: any = (CONF_COLORS as any)[r.confidence] || (CONF_COLORS as any).red;
            const isChecked = selected.has(i);
            const isActiveRow = _docState.activeRow === i;
            // Wave KKKK2: per-row display fields computed in _ingestionPure.
            const { paramDisplay, valueDisplay, canShowSource, sourceInfo, bboxJson, rowTitle, rowPage } =
                buildDocReadingRowDisplay(r);
            html += `
                <tr data-idx="${i}" data-has-bbox="${canShowSource ? '1' : '0'}"
                    class="${isActiveRow ? 'doc-row-active' : ''}${canShowSource ? '' : ' doc-row-no-source'}"
                    role="button" tabindex="0" aria-selected="${isActiveRow ? 'true' : 'false'}" aria-disabled="${canShowSource ? 'false' : 'true'}"
                    style="${S_TABLE_ROW}${!isChecked ? 'opacity:0.5;' : ''}cursor:${canShowSource ? 'pointer' : 'not-allowed'};${isActiveRow ? 'background:rgba(250, 204, 21, 0.15);outline:2px solid #f59e0b;' : ''}"
                    title="${escapeHtml(rowTitle)}"
                    data-cc-call-click="${canShowSource
                ? `_docSelectRow|t|j:${encodeURIComponent(String(rowPage))}|s:${encodeURIComponent(paramDisplay)}|s:${encodeURIComponent(sourceInfo)}|j:${encodeURIComponent(bboxJson)}`
                : '_docSetActiveRow|t'}">
                    <td style="padding:4px;">
                        <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L2997" type="checkbox" ${isChecked ? 'checked' : ''}
                               data-cc-call-change="handleDocToggleReading|j:${encodeURIComponent(String(i))}|c">
                    </td>
                    <td style="padding:4px 6px;color:var(--neutral-800);">
                        <strong style="font-size:11px;">${escapeHtml(paramDisplay)}</strong>
                        ${r.parameterName !== r.parameterId && r.parameterName ? `<br><span style="${S_MUTED}font-size:9px;">${escapeHtml(r.parameterName)}</span>` : ''}
                    </td>
                    <td style="padding:4px 6px;font-family:monospace;font-size:10px;color:var(--neutral-800);">${escapeHtml(String(valueDisplay))}</td>
                    <td style="padding:4px 6px;font-size:10px;color:var(--neutral-800);">${escapeHtml(r.unitId || r.unit || '')}</td>
                    <td style="padding:4px;text-align:center;">
                        <span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:9px;background:${c.bg};border:1px solid ${c.border};color:var(--neutral-800);">
                            <span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:${c.dot};margin-right:2px;vertical-align:middle;"></span>
                            ${c.label}
                        </span>
                    </td>
                    <td style="padding:4px 6px;">
                        <select data-field-meta="true" data-field-meta-key="auto-pos:ingestion:select:L3013" style="font-size:10px;padding:2px 4px;border:1px solid ${r._aiSuggested ? 'var(--primary-400)' : 'var(--neutral-200)'};border-radius:4px;background:var(--neutral-50);color:var(--neutral-800);max-width:85px;"
                                data-cc-call-change="handleDocChangeFamily|j:${encodeURIComponent(String(i))}|v"
                                ${r._aiSuggested ? 'title="Sugestao da IA"' : ''}>
                            ${familyKeys.map((f: any) => `<option value="${f}" ${r.family === f ? 'selected' : ''}>${f}</option>`).join('')}
                        </select>${r._aiSuggested ? '<span style="color:var(--primary-500);font-size:8px;vertical-align:super;" title="IA">&#9670;</span>' : ''}
                    </td>
                    <td style="padding:4px 6px;">
                        <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L3020" type="text" value="${escapeHtml(r.elementName || '')}"
                               placeholder="auto"
                               style="font-size:10px;padding:2px 4px;border:1px solid var(--neutral-200);border-radius:4px;width:80px;background:var(--neutral-50);color:var(--neutral-800);"
                               data-cc-call-change="handleDocChangeElementName|j:${encodeURIComponent(String(i))}|v">
                    </td>
                </tr>
            `;
        }
        html += `</tbody></table></div>`;
    }
    else {
        html += `<p style="font-size:12px;${S_MUTED}text-align:center;padding:20px;">Nenhum dado extraido do documento.</p>`;
    }
    // Warnings
    const allWarnings = readings.flatMap((r: any) => r.warnings || []);
    if (allWarnings.length > 0) {
        html += `
            <details style="margin-top:10px;font-size:10px;color:var(--neutral-500);">
                <summary style="cursor:pointer;">Avisos (${allWarnings.length})</summary>
                <ul style="margin:4px 0;padding-left:16px;">
                    ${allWarnings
            .slice(0, 20)
            .map((w: any) => `<li>${escapeHtml(w)}</li>`)
            .join('')}
                    ${allWarnings.length > 20 ? `<li>... e mais ${allWarnings.length - 20}</li>` : ''}
                </ul>
            </details>
        `;
    }
    // Decisoes Tecnicas -- obrigatorias para matriz ambigua e condicionais para LGPD.
    if (readings.length > 0) {
        html += `<details style="margin-top:10px;margin-bottom:8px;border:1px solid var(--neutral-200);border-radius:6px;padding:8px;" open>
            <summary style="cursor:pointer;font-size:12px;font-weight:600;color:var(--neutral-800);">Decisoes Tecnicas</summary>
            <div style="margin-top:8px;display:flex;flex-direction:column;gap:10px;">`;
        if (matrixBuckets.length > 0) {
            html += `<div style="background:var(--neutral-50);padding:8px;border-radius:4px;">
                <p style="font-size:11px;font-weight:600;margin:0 0 4px;color:var(--neutral-800);">
                    Matriz ambigua por pagina/tabela (${matrixBuckets.length})
                </p>
                <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">
                    Selecione a matriz para cada tabela ambigua com leituras selecionadas.
                </p>`;
            for (const bucket of matrixBuckets) {
                const selectedInBucket = [...selected].filter((idx: any) => buildDocMatrixKey(readings[idx]) === bucket.key && isDocMatrixAmbiguous(readings[idx])).length;
                const overrideValue = normalizeDocMatrixValue(decisions.matrixOverrides?.[bucket.key]) || '';
                const isRequired = selectedInBucket > 0;
                const isMissing = isRequired && !overrideValue;
                const sampleText = bucket.sampleParams.length > 0
                    ? ` (${bucket.sampleParams.map((p: any) => escapeHtml(p)).join(', ')})`
                    : '';
                html += `
                    <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin:6px 0;padding:6px;border:1px solid ${isMissing ? 'var(--warning-300,#fcd34d)' : 'var(--neutral-200)'};border-radius:4px;background:${isMissing ? 'var(--warning-50,#fffbeb)' : 'var(--neutral-0,#fff)'};">
                        <div style="font-size:10px;color:var(--neutral-700);">
                            <strong>Pagina ${bucket.page}, tabela ${bucket.tableIndex + 1}</strong>
                            <span style="${S_MUTED}"> -- ${bucket.count} leitura(s) ambigua(s)${sampleText}</span>
                            ${isRequired ? `<span style="margin-left:6px;color:${isMissing ? 'var(--warning-700,#a16207)' : 'var(--success-700,#166534)'};">${isMissing ? 'obrigatorio' : 'ok'}</span>` : '<span style="margin-left:6px;opacity:.7;">opcional</span>'}
                        </div>
                        <select data-field-meta="true" data-field-meta-key="auto-pos:ingestion:select:L3085" style="font-size:10px;padding:2px 4px;border:1px solid ${isMissing ? 'var(--warning-400,#f59e0b)' : 'var(--neutral-200)'};border-radius:4px;background:var(--neutral-50);color:var(--neutral-800);min-width:150px;"
                                data-cc-call-change="_docSetMatrixOverride|s:${encodeURIComponent(`${escapeHtml(bucket.key)}`)}|v">
                            <option value="">Selecionar matriz...</option>
                            <option value="soil" ${overrideValue === 'soil' ? 'selected' : ''}>Solo</option>
                            <option value="groundwater" ${overrideValue === 'groundwater' ? 'selected' : ''}>Agua subterranea</option>
                            <option value="surface_water" ${overrideValue === 'surface_water' ? 'selected' : ''}>Agua superficial</option>
                            <option value="sediment" ${overrideValue === 'sediment' ? 'selected' : ''}>Sedimento</option>
                            <option value="air" ${overrideValue === 'air' ? 'selected' : ''}>Ar</option>
                            <option value="vapor" ${overrideValue === 'vapor' ? 'selected' : ''}>Vapor</option>
                            <option value="waste" ${overrideValue === 'waste' ? 'selected' : ''}>Residuo</option>
                        </select>
                    </div>
                `;
            }
            if (unresolvedMatrixSelected > 0) {
                html += `<p style="font-size:10px;color:var(--warning-700,#a16207);margin:4px 0 0;">
                    Faltam ${unresolvedMatrixSelected} decisao(oes) obrigatoria(s) para leituras selecionadas.
                </p>`;
            }
            html += `</div>`;
        }
        if (piiDetected) {
            html += `<div style="background:var(--neutral-50);padding:8px;border-radius:4px;">
                <p style="font-size:11px;font-weight:600;margin:0 0 4px;color:var(--neutral-800);">Dados pessoais (LGPD)</p>
                <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">PII detectada no documento. Escolha a estrategia antes de importar.</p>
                <label style="display:block;font-size:10px;margin-bottom:3px;cursor:pointer;color:var(--neutral-700);">
                    <input data-field-meta="true" data-field-meta-key="auto-name:doc-lgpd" type="radio" name="doc-lgpd" value="pseudonymize" ${decisions.lgpdStrategy === 'pseudonymize' ? 'checked' : ''}
                           data-cc-change="cc-6189feb1">
                    Pseudonimizar campos sensiveis (recomendado)
                </label>
                <label style="display:block;font-size:10px;margin-bottom:3px;cursor:pointer;color:var(--neutral-700);">
                    <input data-field-meta="true" data-field-meta-key="auto-name:doc-lgpd" type="radio" name="doc-lgpd" value="keep_identified" ${decisions.lgpdStrategy === 'keep_identified' ? 'checked' : ''}
                           data-cc-change="cc-c78534e8">
                    Manter identificadores
                </label>
                <label style="display:block;font-size:10px;cursor:pointer;color:var(--neutral-700);">
                    <input data-field-meta="true" data-field-meta-key="auto-name:doc-lgpd" type="radio" name="doc-lgpd" value="block" ${decisions.lgpdStrategy === 'block' ? 'checked' : ''}
                           data-cc-change="cc-a9dada6a">
                    Bloquear importacao com PII
                </label>
                ${isLgpdBlocked ? '<p style="font-size:10px;color:var(--warning-700,#a16207);margin:4px 0 0;">Importacao bloqueada enquanto "Bloquear importacao" estiver selecionado.</p>' : ''}
            </div>`;
        }
        html += `<div style="background:var(--neutral-50);padding:8px;border-radius:4px;">
            <p style="font-size:11px;font-weight:600;margin:0 0 4px;color:var(--neutral-800);">Perfil de poco (nivel/litologia/construtivo)</p>
            <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">Como aplicar os dados de perfil em pocos vinculados.</p>
            <label style="display:block;font-size:10px;margin-bottom:3px;cursor:pointer;color:var(--neutral-700);">
                <input data-field-meta="true" data-field-meta-key="auto-name:doc-profile-strategy" type="radio" name="doc-profile-strategy" value="append" ${decisions.profileConflictStrategy === 'append' ? 'checked' : ''}
                       data-cc-change="cc-4748fe35">
                Append (recomendado)
            </label>
            <label style="display:block;font-size:10px;margin-bottom:3px;cursor:pointer;color:var(--neutral-700);">
                <input data-field-meta="true" data-field-meta-key="auto-name:doc-profile-strategy" type="radio" name="doc-profile-strategy" value="replace" ${decisions.profileConflictStrategy === 'replace' ? 'checked' : ''}
                       data-cc-change="cc-de1a813b">
                Replace
            </label>
            <label style="display:block;font-size:10px;cursor:pointer;color:var(--neutral-700);">
                <input data-field-meta="true" data-field-meta-key="auto-name:doc-profile-strategy" type="radio" name="doc-profile-strategy" value="skip" ${decisions.profileConflictStrategy === 'skip' ? 'checked' : ''}
                       data-cc-change="cc-8b1c750e">
                Skip
            </label>
        </div>`;
        html += `<div style="background:var(--neutral-50);padding:8px;border-radius:4px;">
            <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--neutral-800);cursor:pointer;">
                <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L3153" type="checkbox" ${decisions.saveInFiles ? 'checked' : ''}
                       data-cc-change="cc-9ae4385d">
                Salvar arquivo no Files
            </label>
            <p style="font-size:10px;${S_MUTED}margin:6px 0 0;">Falha no registro gera aviso e nao bloqueia a importacao.</p>
        </div>`;
        html += `<div style="background:var(--neutral-50);padding:8px;border-radius:4px;">
            <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--neutral-800);cursor:pointer;">
                <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L3162" type="checkbox" ${decisions.visualWizardEnabled ? 'checked' : ''}
                       data-cc-change="cc-1d6c9760">
                Abrir wizard visual pos-import
            </label>
            <p style="font-size:10px;${S_MUTED}margin:6px 0 0;">
                Assets elegiveis detectados: ${visualAssets.length}. Nenhuma acao pre-selecionada.
            </p>
        </div>`;
        html += `</div></details>`;
    }
    // Action buttons
    html += `
        <div style="display:flex;gap:8px;margin-top:14px;justify-content:space-between;border-top:1px solid var(--neutral-200);padding-top:12px;">
            <button class="btn btn-secondary" data-cc-action="cc-08ba29a1" style="font-size:11px;">
                Selecionar Sugeridos
            </button>
            <div style="display:flex;gap:8px;">
                <button class="btn btn-secondary" data-cc-action="cc-202db0ca">Cancelar</button>
                <button class="btn btn-primary" data-cc-action="cc-bd60217c" ${isConfirmBlocked ? 'disabled' : ''}>
                    Confirmar e Importar ${selectedCount} leitura${selectedCount !== 1 ? 's' : ''}
                </button>
            </div>
        </div>
        ${isConfirmBlocked
        ? `<p style="font-size:10px;color:var(--warning-700,#a16207);margin:6px 0 0;text-align:right;">
            ${selectedCount === 0 ? 'Selecione ao menos uma leitura.' : ''}
            ${unresolvedMatrixSelected > 0 ? `${selectedCount === 0 ? ' ' : ''}Resolva ${unresolvedMatrixSelected} matriz(zes) ambigua(s).` : ''}
            ${isLgpdBlocked ? `${selectedCount === 0 || unresolvedMatrixSelected > 0 ? ' ' : ''}LGPD em modo bloqueio.` : ''}
        </p>`
        : ''}
    `;
    // Close split view containers
    if (hasPdfPreview) {
        html += `</div></div>`; // close doc-split-right + doc-split
    }
    container.innerHTML = html;
    // FA: Setup lazy rendering for continuous scroll PDF
    if (hasPdfPreview) {
        setTimeout(() => _setupPdfLazyRender(), 50);
    }
    // UX-5: Keyboard navigation for reading rows
    _setupDocKeyboardNav();
    // Restore AI status indicator if already running (user triggered manually)
    if (_docState._aiRunning) {
        setTimeout(() => _updateAIStatusIndicator(), 50);
    }
}
/**
 * Toggle all checkboxes in document review
 */
/** @param {any} checked */
export function handleDocToggleAll( checked: any) {
    if (!_docState || !_docState.readings)
        return;
    _docState.selected = new Set();
    if (checked) {
        _docState.readings.forEach((r: any, i: any) => {
            if (r.confidence !== 'red')
                _docState.selected.add(i);
        });
    }
    _renderDocReview();
}
/**
 * Toggle single reading checkbox
 */
/** @param {any} index @param {any} checked */
export function handleDocToggleReading( index: any, checked: any) {
    if (!_docState)
        return;
    if (checked)
        _docState.selected.add(index);
    else
        _docState.selected.delete(index);
    _renderDocReview();
}
/**
 * Update a domain decision for document ingestion.
 * @param {any} field - Decision field name
 * @param {any} value - Decision value
 */
export function _docDecision( field: any, value: any) {
    if (!_docState)
        return;
    const decisions = ensureDocDecisions(_docState);
    if (field === 'saveInFiles' || field === 'visualWizardEnabled') {
        decisions[field] = value === true || value === 'true' || value === 1;
    }
    else {
        decisions[field] = value;
    }
    _docState._decisions = decisions;
    _renderDocReview();
}
/**
 * Set matrix override by page/table key.
 * @param {string} key
 * @param {string} matrix
 */
export function _docSetMatrixOverride( key: any, matrix: any) {
    if (!_docState || !key)
        return;
    const decisions = ensureDocDecisions(_docState);
    const normalized = normalizeDocMatrixValue(matrix);
    if (!decisions.matrixOverrides || typeof decisions.matrixOverrides !== 'object') {
        decisions.matrixOverrides = {};
    }
    if (normalized)
        decisions.matrixOverrides[key] = normalized;
    else
        delete decisions.matrixOverrides[key];
    _docState._decisions = decisions;
    _renderDocReview();
}
/**
 * Toggle hiding RED readings in review table.
 */
/** @param {any} hide */
export function handleDocToggleHideRed( hide: any) {
    if (!_docState)
        return;
    _docState._hideRed = !!hide;
    _renderDocReview();
}
// ---------------------------------------------------------------------------
// FA: PDF Preview rendering + navigation
// ---------------------------------------------------------------------------
let _pdfDoc: any = null; // Cached pdf.js document instance
const _pageCache = new Map(); // Map<pageNum, ImageBitmap|HTMLCanvasElement>
const _pageRenderJobs = new Map(); // Map<pageNum, Promise<void>> to avoid concurrent canvas renders
const _renderedPages = new Set();
/**
 * UX-5: Keyboard navigation for document review reading rows.
 * Arrow Up/Down navigates rows, Space toggles checkbox, Escape closes.
 */
function _setupDocKeyboardNav() {
    // Remove previous listener if any
    if (_docState?._keyHandler) {
        document.removeEventListener('keydown', _docState._keyHandler);
    }
    const handler = (e: any) => {
        if (!_docState?.readings)
            return;
        // Only handle when not typing in an input/select
        const tag = (e.target?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'select' || tag === 'textarea')
            return;
        const rows = (Array.from(document.querySelectorAll('tr[data-idx]')));
        if (!rows.length)
            return;
        const idxList = rows.map((r: any) => parseInt(r.dataset.idx, 10));
        let currentPos = _docState.activeRow != null ? idxList.indexOf(_docState.activeRow) : -1;
        if (currentPos < 0) {
            const focusedRow = (document.activeElement?.closest?.('tr[data-idx]'));
            if (focusedRow?.dataset?.idx != null) {
                currentPos = idxList.indexOf(parseInt(focusedRow.dataset.idx, 10));
            }
        }
        if (e.key === 'ArrowDown' || e.key === 'j') {
            e.preventDefault();
            const nextPos = Math.min(currentPos + 1, idxList.length - 1);
            const nextRow = rows[nextPos];
            if (nextRow) {
                (nextRow as any).click();
                (nextRow as any).focus();
            }
        }
        else if (e.key === 'ArrowUp' || e.key === 'k') {
            e.preventDefault();
            const prevPos = Math.max(currentPos - 1, 0);
            const prevRow = rows[prevPos];
            if (prevRow) {
                (prevRow as any).click();
                (prevRow as any).focus();
            }
        }
        else if (e.key === 'Enter' && currentPos >= 0) {
            e.preventDefault();
            const row = rows[currentPos];
            if (row) {
                (row as any).click();
                (row as any).focus();
            }
        }
        else if (e.key === ' ' && currentPos >= 0) {
            e.preventDefault();
            const idx = idxList[currentPos];
            const isSelected = _docState.selected.has(idx);
            handleDocToggleReading(idx, !isSelected);
        }
        else if (e.key === 'Escape') {
            e.preventDefault();
            handleDocCancel();
        }
    };
    document.addEventListener('keydown', handler);
    if (_docState)
        _docState._keyHandler = handler;
}
/**
 * Setup IntersectionObserver for lazy PDF page rendering.
 * Each page renders when it becomes visible in the scroll container.
 */
async function _setupPdfLazyRender() {
    if (!_docState?._bufferCopy)
        return;
    try {
        // Lazy load pdf.js
        if (!_pdfDoc) {
            const pdfjsLib = (await importCDN('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs', {
                name: 'pdfjs-dist',
            }));
            pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
            _pdfDoc = await pdfjsLib.getDocument({ data: _docState._bufferCopy.slice(0) }).promise;
        }
    }
    catch (err: any) {
        log.warn('pdf.js load failed', _errorMessage(err));
        return;
    }
    _renderedPages.clear();
    const scrollContainer = document.getElementById('doc-pdf-scroll');
    if (!scrollContainer)
        return;
    // Disconnect previous observer if any (prevents leak on re-open)
    if (_docState?.observer) {
        try {
            _docState.observer.disconnect();
        }
        catch (e: any) {
            console.debug('[ingestion] observerReopen:', _errorMessage(e) || e);
            /* ignore */
        }
    }
    const observer = new IntersectionObserver((entries: any) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                const pageNum = parseInt(entry.target.dataset.page);
                if (!_renderedPages.has(pageNum)) {
                    _renderPdfPage(pageNum);
                }
            }
        }
    }, { root: scrollContainer, rootMargin: '300px' });
    // Store observer for cleanup on modal close
    if (_docState)
        _docState.observer = observer;
    scrollContainer.querySelectorAll('.doc-page-wrapper').forEach((el: any) => observer.observe(el));
}
/**
 * Render a specific PDF page into its canvas within the scroll container.
 */
/** @param {any} pageNum */
async function _renderPdfPage( pageNum: any) {
    if (!_pdfDoc || _renderedPages.has(pageNum))
        return;
    if (_pageRenderJobs.has(pageNum))
        return _pageRenderJobs.get(pageNum);
    const renderJob = (async () => {
        const wrapper = (document.querySelector(`.doc-page-wrapper[data-page="${pageNum}"]`));
        const canvas = (document.querySelector(`canvas[data-page-canvas="${pageNum}"]`));
        if (!wrapper || !canvas)
            return;
        try {
            const page = await _pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: PDF_SCALE });
            (canvas as any).width = viewport.width;
            (canvas as any).height = viewport.height;
            const ctx = (canvas as any).getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            canvas.style.display = 'block';
            const placeholder = (wrapper.querySelector('.doc-page-placeholder'));
            if (placeholder)
                placeholder.style.display = 'none';
            wrapper.style.minHeight = 'auto';
            _renderedPages.add(pageNum);
        }
        catch (err: any) {
            log.warn(`Page ${pageNum} render failed`, _errorMessage(err));
        }
        finally {
            _pageRenderJobs.delete(pageNum);
        }
    })();
    _pageRenderJobs.set(pageNum, renderJob);
    return renderJob;
}
/** FD: Select all GREEN readings in one click */
export function handleDocSelectGreen() {
    if (!_docState?.readings)
        return;
    _docState.readings.forEach((r: any, i: any) => {
        if (r.confidence === 'green')
            _docState.selected.add(i);
    });
    _renderDocReview();
}
export function _docPrevPage() {
    if (!_docState)
        return;
    const p = Math.max(1, (_docState._currentPage || 1) - 1);
    _renderPdfPage(p);
}
export function _docNextPage() {
    if (!_docState)
        return;
    const p = Math.min(_docState.pageCount || 1, (_docState._currentPage || 1) + 1);
    _renderPdfPage(p);
}
/** @param {any} pageNum */
export function _docGoToPage( pageNum: any) {
    if (!_docState)
        return;
    const wrapper = document.querySelector(`.doc-page-wrapper[data-page="${pageNum}"]`);
    if (wrapper) {
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}
/**
 * Navigate to source page + show highlight overlay on PDF canvas at exact position.
 * Called when user clicks a reading row.
 *
 * @param {number} pageNum - Page number to navigate to
 * @param {string} paramName - Parameter display name
 * @param {string} sourceInfo - Source description text
 * @param {AnyRecord|null} bbox - Bounding box in PDF points { x0, y0, x1, y1 } or null
 */
export async function _docShowSource( pageNum: any, paramName: any, sourceInfo: any, bbox: any) {
    if (!_docState)
        return;
    // On fast interactions the lazy setup may still be in-flight.
    // Ensure pdf.js doc is available before trying to render/calc highlight.
    if (!_pdfDoc) {
        await _setupPdfLazyRender();
    }
    if (!_pdfDoc) {
        showToast('Preview PDF indisponivel para highlight de origem.', 'warning');
        return;
    }
    // Scroll to the page wrapper in continuous scroll
    const wrapper = (document.querySelector(`.doc-page-wrapper[data-page="${pageNum}"]`));
    if (wrapper)
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Ensure page is rendered
    await _renderPdfPage(pageNum);
    await new Promise((r: any) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // Remove ALL previous highlights and info boxes
    document.querySelectorAll('.doc-highlight, #doc-source-box').forEach((el: any) => el.remove());
    if (bbox && bbox.x0 != null && wrapper) {
        const canvas = (wrapper.querySelector('canvas[data-page-canvas]'));
        if (canvas) {
            const rect = computeDocHighlightRect({
                bbox,
                pdfScale: PDF_SCALE,
                canvasWidth: (canvas as any).width,
                canvasHeight: (canvas as any).height,
                canvasRect: canvas.getBoundingClientRect(),
                wrapperRect: wrapper.getBoundingClientRect(),
                padX: 8,
                padY: 4,
            });
            if (rect) {
                const hl = document.createElement('div');
                hl.className = 'doc-highlight';
                hl.style.cssText = `position:absolute;
                    left:${rect.left}px;
                    top:${rect.top}px;
                    width:${rect.width}px;
                    height:${rect.height}px;
                    background:rgba(250, 204, 21, 0.4);
                    border:3px solid #f59e0b;
                    border-radius:4px;
                    pointer-events:none;
                    z-index:10;
                    box-shadow:0 0 8px rgba(245, 158, 11, 0.5);`;
                wrapper.appendChild(hl);
            }
        }
    }
    // Glow on wrapper
    if (wrapper) {
        wrapper.style.boxShadow = '0 0 12px var(--accent-300)';
        setTimeout(() => {
            wrapper.style.boxShadow = 'none';
        }, 2000);
    }
    // Info box inside wrapper
    if (wrapper) {
        const box = document.createElement('div');
        box.id = 'doc-source-box';
        box.style.cssText =
            'position:absolute;bottom:4px;left:4px;right:4px;padding:4px 8px;background:rgba(30,58,95,0.95);color:#fff;border-radius:4px;font-size:10px;z-index:11;pointer-events:none;';
        box.innerHTML = `<strong>${paramName}</strong> <span style="opacity:0.7;">&#8212; ${sourceInfo}</span>`;
        wrapper.appendChild(box);
    }
}
/** @param {any} trEl */
/**
 * Sets active visual state for a review row without forcing source navigation.
 *
 * @param {HTMLElement|null} trEl
 */
export function _docSetActiveRow( trEl: any) {
    document.querySelectorAll('tr.doc-row-active').forEach((el: any) => {
        el.classList.remove('doc-row-active');
        el.style.background = '';
        el.style.outline = '';
        el.setAttribute('aria-selected', 'false');
    });
    if (!trEl)
        return;
    trEl.classList.add('doc-row-active');
    trEl.style.background = 'rgba(250, 204, 21, 0.15)';
    trEl.style.outline = '2px solid #f59e0b';
    trEl.setAttribute('aria-selected', 'true');
    trEl.focus();
    if (trEl.getAttribute('aria-disabled') === 'true') {
        document.querySelectorAll('.doc-highlight, #doc-source-box').forEach((el: any) => el.remove());
    }
    if (_docState && trEl?.dataset?.idx != null) {
        _docState.activeRow = parseInt(trEl.dataset.idx, 10);
    }
}
/**
 * Row click handler - highlights the active row and shows PDF source.
 * Wraps _docShowSource with visual row feedback (UX-4).
 */
/** @param {any} trEl @param {any} pageNum @param {any} paramName @param {any} sourceInfo @param {any} bbox */
export async function _docSelectRow( trEl: any, pageNum: any, paramName: any, sourceInfo: any, bbox: any) {
    _docSetActiveRow(trEl);
    if (!hasValidSourceBbox(bbox) || !pageNum) {
        showToast('Sem origem precisa para highlight nesta linha.', 'warning');
        return;
    }
    await _docShowSource(pageNum, paramName, sourceInfo, bbox);
}
/**
 * Cancel document ingestion - return to upload form
 */
export function handleDocCancel() {
    // Cleanup PDF doc
    if (_pdfDoc) {
        try {
            _pdfDoc.destroy();
        }
        catch (e: any) {
            console.debug('[ingestion] pdfDestroy2:', _errorMessage(e) || e);
        }
        _pdfDoc = null;
    }
    _pageCache.clear();
    _pageRenderJobs.clear();
    // Reset modal fullscreen
    const modal = document.getElementById('ingestion-modal');
    if (modal)
        modal.style.cssText = modal.style.cssText.replace(/position:fixed[^;]*;|inset:[^;]*;|z-index:[^;]*;|width:100vw[^;]*;|height:100vh[^;]*;|max-width:[^;]*;|max-height:[^;]*;|border-radius:0[^;]*;/g, '');
    _cleanupDocState();
    renderIngestionStep();
}
/**
 * Change the family of a reading (via dropdown in review table).
 * @param {number} index - Reading index
 * @param {string} family - New family ID
 */
export function handleDocChangeFamily( index: any, family: any) {
    if (!_docState || !_docState.readings || !_docState.readings[index])
        return;
    _docState.readings[index].family = family;
    // No re-render needed - dropdown already shows new value
}
/**
 * Change the element name of a reading (via input in review table).
 * @param {number} index - Reading index
 * @param {string} name - New element name
 */
export function handleDocChangeElementName( index: any, name: any) {
    if (!_docState || !_docState.readings || !_docState.readings[index])
        return;
    _docState.readings[index].elementName = (name || '').trim() || null;
}
/**
 * Select suggested readings (GREEN + YELLOW) with risk disclaimer.
 * Marks all GREEN and YELLOW readings as selected; RED stays unselected.
 * Shows a visible disclaimer warning the user to review before confirming.
 */
export function handleDocSelectSuggested() {
    if (!_docState || !_docState.readings)
        return;
    _docState.selected = new Set();
    _docState.readings.forEach((r: any, i: any) => {
        if (r.confidence === 'green' || r.confidence === 'yellow') {
            _docState.selected.add(i);
        }
    });
    _docState.disclaimerVisible = true;
    _renderDocReview();
}
/**
 * Run AI analysis in BACKGROUND - no loading overlay.
 * User continues reviewing/classifying manually while AI suggests progressively.
 * Each classification updates the table in-place without re-rendering the whole view.
 * Requires LLM API key to be configured (sessionStorage).
 */
export async function handleDocAnalyzeAI() {
    if (!_docState)
        return;
    if (!isLLMAvailable()) {
        // F6: Auto-abrir modal de configuracao LLM
        showToast('Configure uma API key para habilitar analise por IA', 'warning');
        if (typeof window.openLLMConfig === 'function') {
            window.openLLMConfig();
        }
        return;
    }
    if (_docState._aiRunning)
        return; // prevent double-start
    const { readings, images } = _docState;
    _docState._aiRunning = true;
    _docState._aiProgress = { done: 0, total: 0, phase: 'starting' };
    _updateAIStatusIndicator();
    try {
        // Phase 1: Analyze images (if any)
        if (images && images.length > 0) {
            _docState._aiProgress.phase = 'images';
            _docState._aiProgress.total = images.length;
            _updateAIStatusIndicator();
            const imageResults = await analyzeDocumentImages(images, {
                onProgress: (idx: any, total: any) => {
                    _docState._aiProgress.done = idx + 1;
                    _docState._aiProgress.total = total;
                    _updateAIStatusIndicator();
                },
            });
            _docState.imageAnalysis = imageResults;
            const familyAgg = aggregateDetectedFamilies(imageResults);
            if (familyAgg.length > 0) {
                log.debug('DocAI: families detected in images', familyAgg);
            }
            // Re-render to show image analysis results
            _renderDocReview();
        }
        // Phase 2: Classify tables progressively
        if (readings && readings.length > 0) {
            const pageGroups = new Map();
            for (const r of readings) {
                const page = r.source?.page || 0;
                if (!pageGroups.has(page))
                    pageGroups.set(page, []);
                pageGroups.get(page).push(r);
            }
            _docState._aiProgress.phase = 'tables';
            _docState._aiProgress.done = 0;
            _docState._aiProgress.total = pageGroups.size;
            _updateAIStatusIndicator();
            let groupIdx = 0;
            for (const [page, group] of pageGroups) {
                if (!_docState || !_docState._aiRunning)
                    break; // cancelled
                const headers = [
                    ...new Set(group.map((r: any) => r.parameterName).filter(Boolean)),
                ].slice(0, 5);
                const sampleRows = group
                    .slice(0, 3)
                    .map((r: any) => [r.parameterName || '', String(r.value ?? ''), r.unit || '']);
                try {
                    const classification = await classifyTableFamily(headers, sampleRows);
                    if (classification.family !== 'generic' && classification.confidence > 0.5) {
                        let updated = 0;
                        for (const r of group) {
                            if (r.family === 'generic') {
                                r.family = classification.family;
                                r._aiSuggested = true;
                                updated++;
                            }
                        }
                        if (updated > 0) {
                            console.debug(`[DocAI] Page ${page}: ${updated} readings → "${classification.family}" (${(classification.confidence * 100).toFixed(0)}%)`);
                            // Progressive update - re-render to show AI suggestion
                            _renderDocReview();
                        }
                    }
                }
                catch (err: any) {
                    log.warn(`AI classification failed for page ${page}`, _errorMessage(err));
                }
                groupIdx++;
                _docState._aiProgress.done = groupIdx;
                _updateAIStatusIndicator();
            }
        }
        if (_docState) {
            _docState._aiRunning = false;
            _docState._aiProgress = { done: 0, total: 0, phase: 'done' };
            _updateAIStatusIndicator();
            showToast('Analise com IA concluida', 'success');
        }
    }
    catch (err: any) {
        log.error('AI document analysis failed', _errorMessage(err));
        if (_docState) {
            _docState._aiRunning = false;
            _docState._aiProgress = null;
        }
        showToast(`Erro na analise AI: ${_errorMessage(err)}`, 'error');
    }
}
/**
 * Update the AI status indicator in the review table (inline, no overlay).
 * Uses DOM patching to avoid full re-render (user might be mid-edit).
 */
function _updateAIStatusIndicator() {
    const indicator = document.getElementById('doc-ai-status');
    if (!indicator || !_docState)
        return;
    const p = _docState._aiProgress;
    if (!p || p.phase === 'done') {
        indicator.innerHTML = _docState.imageAnalysis
            ? '<span style="color:var(--success-600);font-size:10px;">&#10003; IA concluida</span>'
            : '';
        return;
    }
    const phase = p.phase === 'images' ? 'Imagens' : 'Tabelas';
    const progress = p.total > 0 ? ` (${p.done}/${p.total})` : '';
    indicator.innerHTML = `
        <span style="font-size:10px;color:var(--primary-500);display:inline-flex;align-items:center;gap:4px;">
            <span style="width:10px;height:10px;border:2px solid rgba(94,234,212,0.3);border-top-color:#5eead4;border-radius:50%;animation:ecbt-spin 0.8s linear infinite;display:inline-block;"></span>
            ${phase}${progress}
        </span>`;
}
function _renderMappingModal() {
    return renderMappingModal({
        state: _docState,
        existingElements: getAllElements(),
        styles: {
            muted: S_MUTED,
            tableHeader: S_TABLE_HEADER,
            tableRow: S_TABLE_ROW,
        },
    });
}
/**
 * Ingest selected document readings - shows mapping modal first.
 * 100% human-in-the-loop - user maps each well before import.
 */
export async function handleDocIngest() {
    const result = await prepareDocIngestFlow(_docState, {
        ensureDocDecisions,
        showToast,
        renderDocReview: _renderDocReview,
        getAllElements,
        autoMatchWells,
        loadExtractFields: async (fullText: any) => {
            const { extractFields } = await import('../../core/ingestion/documents/index.js' as string);
            return extractFields(fullText);
        },
        logger: log,
    });
    if (result.status === 'auto_confirm') {
        await _docMappingConfirm();
        return;
    }
    if (result.status === 'mapping_ready') {
        _renderMappingModal();
    }
}
/**
 * P2: Analyze PDF pages as images with LLM Vision.
 * Renders each page as image, sends to LLM for classification.
 * Results stored in _docState._pageAnalysis.
 */
export async function handleDocAnalyzePages() {
    const state = _docState;
    if (!state)
        return;
    if (!isLLMAvailable()) {
        showToast('Configure uma API key para analisar paginas', 'warning');
        if (typeof window.openLLMConfig === 'function')
            window.openLLMConfig();
        return;
    }
    if (state._aiPagesRunning)
        return;
    const MAX_PAGES = 20;
    const pageCount = state.pageCount || 0;
    if (pageCount === 0) {
        showToast('Nenhuma pagina disponivel para analise', 'error');
        return;
    }
    const pagesToAnalyze = Math.min(pageCount, MAX_PAGES);
    state._aiPagesRunning = true;
    state._pageAnalysis = new Map();
    const runToken = Symbol('doc-pages-analysis');
    state._aiPagesRunToken = runToken;
    // Update UI with progress
    const updateStatus = (msg: any) => {
        const statusEl = document.getElementById('doc-pages-status');
        if (statusEl)
            statusEl.textContent = msg;
    };
    updateStatus(`Analisando paginas... 0/${pagesToAnalyze}`);
    try {
        for (let p = 1; p <= pagesToAnalyze; p++) {
            // Abort safely if modal/state was reset mid-run.
            if (!_docState || _docState !== state || state._aiPagesRunToken !== runToken)
                break;
            updateStatus(`Pagina ${p}/${pagesToAnalyze}`);
            try {
                // Use existing analyzeDocumentImages with a page-rendered image
                // For now, analyze using raw text per page (no rendering needed)
                const pageText = extractPageText(state.rawText, p);
                if (pageText && pageText.length > 20) {
                    const { extractDocumentMetadata } = await import('../../core/ingestion/documents/index.js' as string);
                    const meta = await extractDocumentMetadata(pageText);
                    if (!_docState || _docState !== state || state._aiPagesRunToken !== runToken)
                        break;
                    state._pageAnalysis.set(p, {
                        type: meta.reportType || 'unknown',
                        hasTable: /composto|parametro|resultado|concentra/i.test(pageText),
                        hasMap: /mapa|figura|fig\./i.test(pageText),
                        summary: pageText.substring(0, 100),
                    });
                }
            }
            catch (err: any) {
                log.warn(`Page ${p} analysis failed`, _errorMessage(err));
            }
        }
        if (!_docState || _docState !== state || state._aiPagesRunToken !== runToken)
            return;
        const analyzed = state._pageAnalysis?.size || 0;
        updateStatus(`${analyzed} paginas analisadas`);
        showToast(`${analyzed} paginas analisadas pela IA`, 'success');
    }
    catch (err: any) {
        log.error('Page analysis pipeline failed', _errorMessage(err));
        if (_docState === state) {
            showToast('Erro na analise de paginas', 'error');
        }
    }
    finally {
        if (_docState === state && state._aiPagesRunToken === runToken) {
            state._aiPagesRunning = false;
            state._aiPagesRunToken = null;
        }
    }
}
/**
 * Extract approximate text for a specific page from rawText.
 * Simple heuristic: split by "Página N" markers.
 */
/** @param {any} wellId @param {any} action @param {any} _totalPages */
// Mapping modal handlers
/** @param {any} wellId @param {any} action */
export function _docMappingAction( wellId: any, action: any) {
    if (!setDocMappingAction(_docState, wellId, action))
        return;
    _renderMappingModal();
}
/** @param {any} wellId @param {any} elementId */
export function _docMappingTarget( wellId: any, elementId: any) {
    setDocMappingTarget(_docState, wellId, elementId);
}
export function _docMappingBack() {
    if (!_docState)
        return;
    _docState._mapping = null;
    _renderDocReview();
}
/** @param {any} index @param {any} checked */
export function _docFieldToggle( index: any, checked: any) {
    setDocFieldToggle(_docState, index, checked);
}
/**
 * E2E test hook: force document ingestion state and render corresponding screen.
 * Keeps production logic untouched while enabling deterministic Playwright scenarios.
 *
 * @param {Object|null} nextState
 */
export function __setDocStateForTesting( nextState: any) {
    if (!nextState) {
        _docState = null;
        renderIngestionStep();
        return;
    }
    _docState = { ...nextState };
    if (!(_docState.selected instanceof Set)) {
        const incoming = Array.isArray(_docState.selected) ? _docState.selected : [];
        _docState.selected = new Set(incoming);
    }
    if (!_docState.step)
        _docState.step = 'review';
    ensureDocDecisions(_docState);
    if (_docState.step === 'post_visual') {
        _renderDocVisualWizard();
    }
    else {
        _docState.step = 'review';
        _renderDocReview();
    }
}
/**
 * E2E test hook: read current in-memory doc ingestion state.
 * @returns {Object|null}
 */
export function __getDocStateForTesting() {
    return _docState;
}
/** @param {any} item */
function _downloadDocAsset( item: any) {
    const asset = item?.asset || {};
    let href = asset.blobUrl || asset.dataUrl || '';
    let shouldRevoke = false;
    if (!href && asset.blob) {
        href = URL.createObjectURL(asset.blob);
        shouldRevoke = true;
    }
    if (!href)
        return false;
    const a = document.createElement('a');
    a.href = href;
    a.download = buildDocAssetFilename(item, asset, (assetType: string) => getDocVisualAssetLabel(assetType).toLowerCase());
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (shouldRevoke) {
        setTimeout(() => {
            try {
                URL.revokeObjectURL(href);
            }
            catch (e: any) {
                console.debug('[ingestion] revokeUrl:', _errorMessage(e) || e);
                /* noop */
            }
        }, 1200);
    }
    return true;
}
function _renderDocVisualWizard() {
    if (!_docState)
        return;
    ensureDocDecisions(_docState);
    const assets = Array.isArray(_docState._postImportVisualAssets)
        ? _docState._postImportVisualAssets
        : collectDocVisualAssets(_docState);
    if (!assets.length) {
        _docVisualFinish();
        return;
    }
    renderPostVisualWizard({
        state: _docState,
        decisions: ensureDocDecisions(_docState),
        assets,
        families: DOC_VISUAL_FAMILIES,
        getAssetLabel: getDocVisualAssetLabel,
        styles: {
            muted: S_MUTED,
            tableHeader: S_TABLE_HEADER,
            tableRow: S_TABLE_ROW,
        },
    });
}
/** @param {any} assetKey @param {any} field @param {any} value */
export function _docVisualActionSet( assetKey: any, field: any, value: any) {
    if (setDocVisualAction(_docState, assetKey, field, value, ensureDocDecisions)) {
        _renderDocVisualWizard();
    }
}
/** @param {any} assetKey @param {any} family */
export function _docVisualActionFamily( assetKey: any, family: any) {
    if (setDocVisualActionFamily(_docState, assetKey, family, ensureDocDecisions, DOC_VISUAL_FAMILIES)) {
        _renderDocVisualWizard();
    }
}
export function _docVisualFinish() {
    handleCloseIngestionModal();
    requestIngestionUIRefresh('ingestion.doc-visual-finished');
}
export function _docVisualApplySelected() {
    if (!_docState)
        return;
    const assets = Array.isArray(_docState._postImportVisualAssets) ? _docState._postImportVisualAssets : [];
    if (assets.length === 0) {
        _docVisualFinish();
        return;
    }
    applyDocVisualActions({
        state: _docState,
        ensureDecisions: ensureDocDecisions,
        families: DOC_VISUAL_FAMILIES,
        getScatterPosition,
        addElement,
        getAssetLabel: getDocVisualAssetLabel,
        downloadAsset: _downloadDocAsset,
        showToast,
        logger: log,
    });
    _docVisualFinish();
}
/**
 * Confirm mapping and execute import.
 */
export async function _docMappingConfirm() {
    await commitDocImportFlow(_docState, {
        ensureDocDecisions,
        showToast,
        defaultFamilies: DEFAULT_FAMILIES,
        getElementById,
        updateElement,
        addElement,
        getScatterPosition,
        redactPII,
        registerFromIngestion,
        getFileRegisterMode,
        renderDocVisualWizard: _renderDocVisualWizard,
        closeIngestionModal: handleCloseIngestionModal,
        requestUIRefresh: requestIngestionUIRefresh,
        logger: log,
    });
}
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
// ASSESS-001: Document assessment panel handlers
export function handleOpenDocAssessmentReview() {
    if (!_docState?._assessment)
        return;
    openDocAssessmentReview(_docState._assessment, async (acceptedFamilyIds: any, _justifications: any) => {
        const { created, submodules } = await createElementsFromAssessment(acceptedFamilyIds, _docState._assessment);
        if (created.length > 0) {
            showToast(`${created.length} elemento(s) criado(s) a partir do documento`, 'success');
        }
        if (submodules.length > 0) {
            showToast(`Submódulos sugeridos: ${submodules.join(', ')}`, 'info');
        }
        handleCloseIngestionModal();
        requestIngestionUIRefresh('ingestion.assessment-created');
    });
}
export function handleCloseDocAssessmentReview() {
    closeDocAssessmentReview();
}
export function handleApplyDocAssessmentConfig() {
    applyDocAssessmentConfig();
}
/** @param {any} keyword */
export function handleDocAssessmentAddCustomFamily( keyword: any) {
    const name = keyword || 'Custom';
    if (typeof (window as any).addCustomFamily === 'function') {
        (window as any).addCustomFamily(name.toLowerCase().replace(/\s+/g, '_'), name);
    }
    else {
        showToast('Não foi possível abrir o gerenciador de famílias', 'warning');
    }
}
export const ingestionHandlers = {
    handleOpenIngestionModal,
    handleStartLabIngestion,
    handleCloseIngestionModal,
    handleMinimizeIngestionModal,
    handleCancelIngestion,
    handleIngestionRefreshUI,
    handleIngestionFileUpload,
    handleIngestionDirectFile,
    handleIngestionNext,
    handleIngestionBack,
    handleIngestionExecute,
    handleIngestionColumnOverride,
    handleIngestionResolveAmbiguity,
    handleIngestionMapWithAI,
    handleShowMoreObservations,
    handleShowAllObservations,
    handleToggleObsCampaign,
    handleExpandObservation,
    _ingestionDecision,
    _ingestionDecisionApplyOrigin,
    handleClearPipelineError,
    handleDownloadECO1Backup,
    handleDownloadTemplate,
    handleIngestionRouteModel,
    handleIngestionRouteData,
    handleIngestionRouteSpatial,
    handleIngestionValidateGeo,
    handleDocToggleAll,
    handleDocToggleReading,
    handleDocToggleHideRed,
    _docDecision,
    _docSetMatrixOverride,
    handleDocCancel,
    handleDocIngest,
    handleDocChangeFamily,
    handleDocChangeElementName,
    handleDocSelectSuggested,
    handleDocAnalyzeAI,
    handleDocAnalyzePages,
    handleDocSelectGreen,
    _docShowSource,
    _docSetActiveRow,
    _docSelectRow,
    _docPrevPage,
    _docNextPage,
    _docGoToPage,
    _docMappingAction,
    _docMappingTarget,
    _docMappingBack,
    _docMappingConfirm,
    _docFieldToggle,
    _docVisualActionSet,
    _docVisualActionFamily,
    _docVisualApplySelected,
    _docVisualFinish,
    handleOpenDocAssessmentReview,
    handleCloseDocAssessmentReview,
    handleApplyDocAssessmentConfig,
    handleDocAssessmentAddCustomFamily,
    __setDocStateForTesting,
    __getDocStateForTesting,
};
