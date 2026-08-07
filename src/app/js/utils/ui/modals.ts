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
   GERENCIAMENTO DE MODAIS
   ================================================================

   Este modulo controla as janelas modais (dialogos) da aplicacao.

   O QUE E UM MODAL?
   Uma janela sobreposta que bloqueia a interacao com o resto da pagina.
   Usado para acoes importantes que precisam de atencao do usuario.

   MODAIS DA APLICACAO:
   - Export: Exibe chave e opcoes de exportacao
   - Import: Campo para colar chave ou selecionar arquivo
   - Family Manager: Gerenciar familias de elementos

   ================================================================ */
import { t } from '../i18n/translations.js';
import { canDo } from '../auth/permissions.js';
import { generateKey, buildModel, copyKeyToClipboard, copyShareURL, downloadKeyFile, downloadJSONFile, setBlockchainOptions, } from '../../core/io/export.js';
import { exportXLSX } from '../../core/io/formats/xlsx.js';
import { importFromString, importFromFile, importIncremental, validateContent } from '../../core/io/import.js';
import { showToast } from './toast.js';
import { setOrigin } from '../../core/io/geo/coordinates.js';
import { getAllFamilies, getFamilyName, toggleFamily, deleteFamily as deleteFamilyFromRegistry, addCustomFamily as addFamilyToRegistry, } from '../../core/elements/families.js';
import { removeElementsByFamily } from '../../core/elements/manager.js';
import { getIcon } from './icons.js';
import { isFieldLocked } from '../libraries/locks.js';
import { addFloatingResizeHandles } from './resizeHandles.js';
import { asyncPrompt, asyncConfirm } from './asyncDialogs.js';
import { escapeHtml } from '../helpers/html.js';
import { CONFIG } from '../../config.js';
import { ensureDeferredStylesLoaded } from '../../main/deferred-styles.js';
const _document: any = document;
const _window: any = window;
// ----------------------------------------------------------------
// ESTADO DO BLOCKCHAIN
// ----------------------------------------------------------------
// eslint-disable-next-line
let blockchainKeysLoaded = false;
// ----------------------------------------------------------------
// FUNCOES GERAIS DE MODAIS
// ----------------------------------------------------------------
/**
 * Abre um modal pelo ID.
 *
 * @param {string} modalId - ID do elemento modal
 *
 * COMO FUNCIONA:
 * - Adiciona classe 'active' ao overlay
 * - CSS faz o modal aparecer (display: flex)
 */
export function openModal(modalId: any) {
    const modal = _document.getElementById(modalId);
    if (modal) {
        // BUG-DEFERRED-CSS-PANEL (2026-08-06) — cinto-e-suspensórios. O fix do
        // primeiro gesto (a8b604480) cobre clique humano; este caminho também é
        // chamado por Automation API / deep-link / tour, onde gesto nenhum
        // ocorreu e as folhas seguiriam adiadas. Custo em boot quente: uma
        // querySelector que retorna null. Gate estrutural irmão:
        // tests/css-panel-sheet-closure.test.mjs.
        ensureDeferredStylesLoaded(_document, _window);
        // INGEST-MODAL-VISIBILITY (2026-06-02, Calvin AI vision finding extended):
        // Algum init code seta inline `display: none` nos modal-overlay. Especificidade
        // inline > class, então `.modal-overlay.active { display: flex }` não aplica
        // e o modal fica invisível. Aplicado primeiro no handleOpenIngestionModal;
        // agora extendido para o openModal genérico (cobre merge-modal, export-modal,
        // import-modal, family-modal, etc.).
        if (modal.style.display === 'none') {
            modal.style.removeProperty('display');
        }
        modal.classList.add('active');
        // Gap #4: ARIA attributes for screen readers
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        // Gap #4: Focus trap - keyboard Tab stays inside modal
        modal._cleanupFocusTrap = _trapFocus(modal);
        // Attach resize handles a modais resizaveis (se ainda nao feito)
        const modalBox = modal.querySelector('.modal.modal-resizable');
        if (modalBox && !modalBox._resizeAttached) {
            addFloatingResizeHandles(modalBox, {
                minWidth: 350,
                maxWidth: _window.innerWidth * 0.9,
                minHeight: 250,
                maxHeight: _window.innerHeight * 0.9,
            });
            modalBox._resizeAttached = true;
        }
    }
}
/**
 * Fecha um modal pelo ID.
 *
 * @param {string} modalId - ID do elemento modal
 */
export function closeModal(modalId: any) {
    const modal = _document.getElementById(modalId);
    if (modal) {
        // Gap #4: Release focus trap
        if (modal._cleanupFocusTrap) {
            modal._cleanupFocusTrap();
            modal._cleanupFocusTrap = null;
        }
        modal.classList.remove('active');
    }
}
/**
 * Focus trap - keeps Tab/Shift+Tab inside a modal.
 * Gap #4: WCAG 2.1 SC 2.4.3 (Focus Order).
 *
 * @param {HTMLElement} modalEl
 * @returns {Function|null} Cleanup function to remove the trap
 */
function _trapFocus(modalEl: any) {
    const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusable = modalEl.querySelectorAll(FOCUSABLE);
    if (!focusable.length)
        return null;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    /** @param {KeyboardEvent} e */
    function handler(e: any) {
        if (e.key !== 'Tab')
            return;
        if (e.shiftKey && _document.activeElement === first) {
            e.preventDefault();
            last.focus();
        }
        else if (!e.shiftKey && _document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
    modalEl.addEventListener('keydown', handler);
    // Auto-focus first focusable element
    requestAnimationFrame(() => first.focus());
    return () => modalEl.removeEventListener('keydown', handler);
}
// ----------------------------------------------------------------
// SHARED MODAL SHELL (sym-* pattern)
// ----------------------------------------------------------------
/**
 * Build a standard modal shell using the sym-overlay/sym-dialog pattern.
 * Returns { overlay, dialog, header, body, footer, close } elements.
 *
 * Usage:
 *   const { overlay, body, footer, close } = buildModalShell({
 *       title: 'My Modal',
 *       width: '720px',
 *       onClose: () => myRoot.innerHTML = ''
 *   });
 *   body.appendChild(myContent);
 *   footer.appendChild(myButtons);
 *   myRoot.appendChild(overlay);
 *
 * @param {{ title?: string, width?: string, onClose?: Function, id?: string, twoPane?: boolean }} opts
 * @returns {{ overlay: HTMLElement, dialog: HTMLElement, header: HTMLElement, body: HTMLElement, footer: HTMLElement, close: Function }}
 */
export function buildModalShell(opts: any = {}) {
    const { title = '', width = '880px', onClose, id, twoPane = false } = opts;
    const overlay = _document.createElement('div');
    overlay.className = 'sym-overlay';
    const dialog = _document.createElement('div');
    dialog.className = 'sym-dialog';
    dialog.style.width = `min(${width}, 95vw)`;
    if (id)
        dialog.id = id;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    // Header
    const header = _document.createElement('div');
    header.className = 'sym-header';
    const titleEl = _document.createElement('h2');
    titleEl.className = 'sym-title';
    titleEl.textContent = title;
    const closeBtn = _document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'sym-close-btn';
    closeBtn.innerHTML = '&#10005;';
    closeBtn.title = 'Close';
    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    // Body
    const body = _document.createElement('div');
    body.className = 'sym-body';
    if (!twoPane) {
        body.style.flexDirection = 'column';
        body.style.overflowY = 'auto';
        body.style.padding = '16px';
    }
    // Footer
    const footer = _document.createElement('div');
    footer.className = 'sym-footer';
    // Assemble
    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    // Close handler
    function close() {
        if (overlay._cleanupFocusTrap) {
            overlay._cleanupFocusTrap();
            overlay._cleanupFocusTrap = null;
        }
        overlay.remove();
        if (typeof onClose === 'function')
            onClose();
    }
    closeBtn.onclick = close;
    overlay.addEventListener('click', (e: any) => {
        if (e.target === overlay)
            close();
    });
    overlay.addEventListener('keydown', (e: any) => {
        if (e.key === 'Escape')
            close();
    });
    // Focus trap
    overlay._cleanupFocusTrap = _trapFocus(dialog);
    return { overlay, dialog, header, body, footer, close };
}
/**
 * Fecha modal ao clicar fora dele (no overlay).
 * Deve ser adicionado como listener no overlay.
 *
 * @param {Event} event - Evento de clique
 */
export function closeOnOverlayClick(event: any) {
    // Verifica se clicou no overlay (e nao no conteudo do modal)
    const target = event.target;
    if (target?.classList.contains('modal-overlay')) {
        target.classList.remove('active');
    }
}
// ----------------------------------------------------------------
// MODAL DE EXPORTACAO
// ----------------------------------------------------------------
/**
 * Abre modal de exportacao.
 * Gera a chave e exibe no textarea.
 */
export async function openExportModal() {
    // Abre modal primeiro (feedback imediato)
    openModal('export-modal');
    // Carrega lista de chaves se ainda nao carregou
    await loadBlockchainKeys();
    // Atualiza label do formato
    updateFormatLabel();
    // Exibe loading
    const preview = _document.getElementById('export-key-preview');
    if (preview) {
        preview.value = t('modals.generatingKey');
    }
    // Gera chave do modelo atual (async)
    const key = await generateKey();
    // Exibe no textarea
    if (preview) {
        preview.value = key;
    }
}
/**
 * Carrega lista de chaves disponiveis para o select.
 */
async function loadBlockchainKeys() {
    const select = _document.getElementById('export-key-select');
    if (!select)
        return;
    try {
        const { listKeys, isSupported } = await import('../../core/crypto/keyManager.js' as string);
        if (!isSupported()) {
            select.innerHTML = `<option value="">${t('modals.browserDoesNotSupportCrypto')}</option>`;
            return;
        }
        const keys = await listKeys();
        if (keys.length === 0) {
            select.innerHTML = `<option value="">${t('modals.noKeysClickNew')}</option>`;
        }
        else {
            select.innerHTML = keys
                .map((k: any) => `<option value="${k.id}">${k.name} (${k.id.toUpperCase()})</option>`)
                .join('');
        }
        blockchainKeysLoaded = true;
    }
    catch (err: any) {
        console.error('Erro ao carregar chaves:', err);
        select.innerHTML = `<option value="">${t('modals.errorLoadingKeys')}</option>`;
    }
}
/**
 * Toggle das opcoes de blockchain.
 */
export async function toggleBlockchainOptions() {
    const checkbox = _document.getElementById('export-blockchain-enabled');
    const options = _document.getElementById('blockchain-options');
    const enabled = checkbox?.checked || false;
    if (options) {
        options.style.display = enabled ? 'block' : 'none';
    }
    // Atualiza opcoes de exportacao
    const keyId = enabled ? _document.getElementById('export-key-select')?.value : null;
    setBlockchainOptions({ enabled, keyId });
    // Atualiza label e regenera chave
    updateFormatLabel();
    await regenerateKey();
}
/**
 * Quando seleciona uma chave diferente.
 */
export async function onKeySelectChange() {
    const keyId = _document.getElementById('export-key-select')?.value || null;
    const enabled = _document.getElementById('export-blockchain-enabled')?.checked || false;
    setBlockchainOptions({ enabled, keyId });
    await regenerateKey();
}
/**
 * Cria nova chave de assinatura.
 */
export async function createNewKey() {
    try {
        const { generateKeyPair } = await import('../../core/crypto/keyManager.js' as string);
        const name = await asyncPrompt(t('modals.newKeyNamePrompt'), 'Minha Chave');
        if (!name)
            return;
        const { keyId } = await generateKeyPair(name);
        showToast(t('modals.keyCreated', { keyId: keyId.toUpperCase() }), 'success');
        // Recarrega lista e seleciona a nova
        await loadBlockchainKeys();
        const select = _document.getElementById('export-key-select');
        if (select) {
            select.value = keyId;
            await onKeySelectChange();
        }
    }
    catch (err: any) {
        console.error('Erro ao criar chave:', err);
        showToast(t('modals.errorCreatingKey', { message: err.message }), 'error');
    }
}
/**
 * Atualiza o label do formato (ECO1 simples ou ECO1 blockchain).
 * ECO1 blockchain so e usado quando blockchain esta habilitado E uma chave esta selecionada.
 */
function updateFormatLabel() {
    const label = _document.getElementById('export-format-label');
    const enabled = _document.getElementById('export-blockchain-enabled')?.checked || false;
    const keyId = _document.getElementById('export-key-select')?.value || '';
    if (label) {
        if (enabled && keyId) {
            label.textContent = t('modals.modelKeyBlockchain');
        }
        else if (enabled && !keyId) {
            label.textContent = t('modals.modelKeySelectBlockchain');
        }
        else {
            label.textContent = t('modals.modelKey');
        }
    }
}
/**
 * Regenera a chave apos mudanca de opcoes.
 */
async function regenerateKey() {
    const preview = _document.getElementById('export-key-preview');
    if (!preview)
        return;
    preview.value = t('modals.generatingKey');
    try {
        const key = await generateKey();
        preview.value = key;
    }
    catch (err: any) {
        preview.value = t('errorWithMessage', { message: err.message });
    }
}
/**
 * Copia chave do modal de exportacao.
 */
export async function handleCopyKey() {
    if (!canDo('export')) {
        showToast(t('auth.actionDenied') || "You don't have permission to perform this action.", 'error');
        return;
    }
    const success = await copyKeyToClipboard();
    if (success) {
        showToast(t('keyCopied'), 'success');
    }
    else {
        showToast(t('modals.errorCopying'), 'error');
    }
}
/**
 * Copia URL de compartilhamento.
 */
export async function handleCopyURL() {
    const success = await copyShareURL();
    if (success) {
        showToast(t('urlCopied'), 'success');
    }
    else {
        showToast(t('modals.errorCopyingUrl'), 'error');
    }
}
/**
 * Faz download conforme formato selecionado.
 */
export async function handleDownload() {
    if (!canDo('export')) {
        showToast(t('auth.actionDenied') || "You don't have permission to perform this action.", 'error');
        return;
    }
    const format = _document.getElementById('export-format-select')?.value || 'ecokey';
    const projectName = _document.getElementById('project-name')?.value || 'model';
    const safeName = projectName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'model';
    try {
        // Formatos ECO Key e JSON usam os exportadores existentes
        if (format === 'ecokey') {
            // TRUST-007: chave-arquivo .ecokey requer auth + authorId no payload.
            // Sem sessão, generateAuthoredKey retorna {authRequired:true} sem gerar a chave;
            // mostramos prompt UX (modal soft 1ª vez/sessão, banner toast subsequente) e
            // oferecemos rota anônima (downloadKeyFile legado, sem authorId).
            const { downloadAuthoredKeyFile } = await import('../../core/io/export.js');
            const result: any = await downloadAuthoredKeyFile(projectName);
            if (result?.authRequired) {
                const promptedKey = '__ecbtAuthPromptedThisSession';
                const alreadyPrompted = (window as any)[promptedKey] === true;
                if (alreadyPrompted) {
                    // Banner inline (toast warning) — não modal repetido (research-backed:
                    // modal repetido eleva drop-off de auth — Security Boulevard 2026).
                    showToast(t('auth.required.exportBanner') || 'Faça login para exportar como autor verificado (.ecokey anônima continua disponível).', 'warning');
                    await downloadKeyFile(projectName);
                    showToast(t('fileDownloaded'), 'success');
                    closeModal('export-modal');
                    return;
                }
                (window as any)[promptedKey] = true;
                const { asyncConfirm } = await import('./asyncDialogs.js');
                // asyncConfirm é (message, { confirmLabel, cancelLabel }) — não
                // aceita objeto {title,...}. Título prefixado à mensagem.
                const _authTitle = t('auth.required.title') || 'Faça login para exportar com autor verificado';
                const _authMsg = t('auth.required.message') || 'Chaves ECBT autenticadas registram o UUID do autor para auditoria. Você pode fazer login agora ou salvar como rascunho local sem autoria.';
                const wantsLogin = await asyncConfirm(`${_authTitle}\n\n${_authMsg}`, {
                    confirmLabel: t('auth.required.loginCta') || 'Fazer login',
                    cancelLabel: t('auth.required.saveLocalCta') || 'Salvar como rascunho local',
                });
                if (wantsLogin) {
                    (window as any).handleSignIn?.();
                    closeModal('export-modal');
                    return;
                }
                // CTA 2: salvar como rascunho anônimo (sem authorId) — preserva trabalho.
                await downloadKeyFile(projectName);
                showToast(t('fileDownloaded'), 'success');
                closeModal('export-modal');
                return;
            }
            // Sessão ativa: chave autenticada exportada com sucesso.
            showToast(t('fileDownloaded'), 'success');
            closeModal('export-modal');
            return;
        }
        if (format === 'json') {
            downloadJSONFile(projectName);
            showToast(t('fileDownloaded'), 'success');
            closeModal('export-modal');
            return;
        }
        if (format.startsWith('xlsx-')) {
            syncOriginFromUI();
            const template = format.replace('xlsx-', '');
            const blob = await exportXLSX(buildModel(), { template });
            const url = URL.createObjectURL(blob);
            const link = _document.createElement('a');
            link.href = url;
            link.download = `${safeName}.xlsx`;
            link.click();
            URL.revokeObjectURL(url);
            showToast(t('fileDownloaded'), 'success');
            closeModal('export-modal');
            return;
        }
        // Sincroniza origem UTM antes de exportar formatos georeferenciados
        syncOriginFromUI();
        const model = buildModel();
        let blob, ext;
        if (format === 'csv-observations' || format === 'csv-elements' || format === 'csv-campaigns') {
            const { exportCSV } = await import('../../core/io/formats/csv.js' as string);
            const scope = format.replace('csv-', '');
            blob = exportCSV(model, { scope });
            ext = '.csv';
        }
        else if (format === 'geojson') {
            const { exportGeoJSON } = await import('../../core/io/formats/geojson.js' as string);
            blob = exportGeoJSON(model);
            ext = '.geojson';
        }
        else if (format === 'gltf') {
            const { exportGLTF } = await import('../../core/io/formats/gltf.js' as string);
            blob = await exportGLTF(model, { binary: true });
            ext = '.glb';
        }
        else if (format === 'obj') {
            const { exportOBJ } = await import('../../core/io/formats/obj.js' as string);
            blob = await exportOBJ(model);
            ext = '.obj';
        }
        else if (format === 'gdl') {
            const { exportGDL } = await import('../../core/io/formats/gdl.js' as string);
            blob = await exportGDL(model);
            ext = '.gdl';
        }
        else if (format === 'kml') {
            const { exportKML } = await import('../../core/io/formats/kml.js' as string);
            blob = exportKML(model);
            ext = '.kml';
        }
        else if (format === 'ngsild') {
            const { exportNGSILD } = await import('../../core/io/formats/ngsild.js' as string);
            blob = exportNGSILD(model, { scope: 'full', format: 'normalized' });
            ext = '.jsonld';
        }
        else if (format === 'xlsx-edd-br' ||
            format === 'xlsx-edd-r2' ||
            format === 'xlsx-ohs-aiha' ||
            format === 'xlsx-ecbyts') {
            syncOriginFromUI();
            const { exportXLSX } = await import('../../core/io/formats/xlsx.js' as string);
            const template = format.replace('xlsx-', '');
            blob = await exportXLSX(model, template);
            ext = '.xlsx';
        }
        else {
            showToast(t('modals.unsupportedFormat'), 'error');
            return;
        }
        // Download
        const url = URL.createObjectURL(blob);
        const link = _document.createElement('a');
        link.href = url;
        link.download = `${safeName}${ext}`;
        link.click();
        URL.revokeObjectURL(url);
        showToast(t('fileDownloaded'), 'success');
        closeModal('export-modal');
    }
    catch (err: any) {
        console.error('Erro ao exportar:', err);
        showToast(`Erro: ${err.message}`, 'error');
    }
}
/**
 * Handler para mudança de formato no modal de exportação.
 * Mostra/oculta seções relevantes para o formato selecionado.
 */
export function onExportFormatChange() {
    const format = _document.getElementById('export-format-select')?.value || 'ecokey';
    const ecokeyOptions = _document.getElementById('ecokey-options');
    const previewSection = _document.getElementById('ecokey-preview-section');
    const formatInfo = _document.getElementById('export-format-info');
    const formatDesc = _document.getElementById('export-format-description');
    const btnCopyKey = _document.getElementById('btn-copy-key');
    const btnCopyUrl = _document.getElementById('btn-copy-url');
    const isKey = format === 'ecokey';
    const isJson = format === 'json';
    const isKeyOrJson = isKey || isJson;
    // Blockchain options: só para ECO Key
    if (ecokeyOptions)
        ecokeyOptions.style.display = isKey ? 'block' : 'none';
    // Preview textarea: só para ECO Key e JSON
    if (previewSection)
        previewSection.style.display = isKeyOrJson ? 'block' : 'none';
    // Botões de cópia: só para ECO Key
    if (btnCopyKey)
        btnCopyKey.style.display = isKey ? '' : 'none';
    if (btnCopyUrl)
        btnCopyUrl.style.display = isKey ? '' : 'none';
    // Info do formato: para formatos não-key
    if (formatInfo && formatDesc) {
        if (isKeyOrJson) {
            formatInfo.style.display = 'none';
        }
        else {
            formatInfo.style.display = 'block';
            formatDesc.textContent = (FORMAT_DESCRIPTIONS as Record<string, string>)[format] || '';
        }
    }
}
/**
 * Sincroniza a origem UTM do formulário para o módulo de coordenadas.
 */
function syncOriginFromUI() {
    const easting = parseFloat(_document.getElementById('utm-origin-easting')?.value) || 0;
    const northing = parseFloat(_document.getElementById('utm-origin-northing')?.value) || 0;
    const elevation = parseFloat(_document.getElementById('utm-origin-elevation')?.value) || 0;
    const zone = parseInt(_document.getElementById('utm-zone')?.value) || 23;
    const hemisphere = _document.getElementById('utm-hemisphere')?.value || 'S';
    setOrigin({ easting, northing, elevation, zone, hemisphere });
}
const FORMAT_DESCRIPTIONS = {
    'csv-observations': 'Exporta todas as observações como tabela CSV. Abre no Excel, R, Python. Ideal para análise de dados e relatórios CONAMA/CETESB.',
    'csv-elements': 'Exporta lista de elementos com posição, família e contagem de observações.',
    'csv-campaigns': 'Exporta campanhas de amostragem (nome, data, cor).',
    geojson: 'Exporta elementos como GeoJSON (RFC 7946). Abre no QGIS, geojson.io, Mapbox. Requer origem UTM configurada para coordenadas corretas.',
    gltf: 'Exporta a cena 3D como GLB (glTF Binary). Abre no Blender, Unity, visualizadores 3D.',
    obj: 'Exporta a cena como malha OBJ pronta para impressão 3D. Abre em fatiadores (Cura, PrusaSlicer, Bambu) e no Blender/MeshLab. Defina a escala no fatiador.',
    gdl: 'Exporta a cena como objeto paramétrico GDL (ArchiCAD) — sólido B-rep para colar no 3D Script de um objeto de projeto.',
    kml: 'Exporta para Google Earth com folders, ícones, descrições HTML e extrusão 3D. Requer origem UTM configurada.',
    ngsild: 'Exporta entidades NGSI-LD (FIWARE/Smart Data Models) com contexto JSON-LD para interoperabilidade IoT.',
    'xlsx-edd-br': 'Exporta em formato XLSX estruturado conforme EDD Brasileiro.',
    'xlsx-edd-r2': 'Exporta em formato XLSX estruturado conforme EPA EDD R2.',
    'xlsx-ohs-aiha': 'Exporta em formato XLSX estruturado conforme OHS AIHA.',
    'xlsx-ecbyts': 'Exporta em formato XLSX nativo ecbyts.',
};
// ----------------------------------------------------------------
// MODAL DE IMPORTACAO
// ----------------------------------------------------------------
let _importMode = 'model';
function _applyImportModeUI() {
    if (!CONFIG.FEATURES.FIRST_JOURNEY_IMPORT_ROUTING) {
        _importMode = 'model';
    }
    const modeEls = _document.querySelectorAll('[data-import-mode]');
    modeEls.forEach((btn: any) => {
        btn.style.display = CONFIG.FEATURES.FIRST_JOURNEY_IMPORT_ROUTING ? '' : 'none';
        const isActive = btn.getAttribute('data-import-mode') === _importMode;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    const fileInput = _document.getElementById('import-file');
    const keyWrap = _document.getElementById('import-key-section');
    const mergeWrap = _document.getElementById('import-merge-section');
    const orSeparator = _document.getElementById('import-or-separator');
    const helper = _document.getElementById('import-mode-helper');
    const importTitle = _document.querySelector('#import-modal .modal-title');
    if (importTitle) {
        importTitle.textContent =
            _importMode === 'data'
                ? 'Importar dados'
                : _importMode === 'spatial'
                    ? 'Importar espacial'
                    : 'Importar modelo';
    }
    if (fileInput) {
        if (_importMode === 'data') {
            fileInput.setAttribute('accept', '.xlsx,.xls,.csv,.tsv,.pdf,.docx,.shp,.zip');
        }
        else if (_importMode === 'spatial') {
            fileInput.setAttribute('accept', '.dxf,.shp,.zip,.geojson');
        }
        else {
            fileInput.setAttribute('accept', '.ecokey,.json,.key,.csv,.geojson,.shp,.zip');
        }
    }
    if (keyWrap)
        keyWrap.style.display = _importMode === 'model' ? '' : 'none';
    if (mergeWrap)
        mergeWrap.style.display = _importMode === 'model' ? '' : 'none';
    if (orSeparator)
        orSeparator.style.display = _importMode === 'model' ? '' : 'none';
    if (helper) {
        if (_importMode === 'data') {
            helper.textContent = t('modals.spreadsheetDocsFollowIngestion');
        }
        else if (_importMode === 'spatial') {
            helper.textContent = t('modals.dxfCadFollowSpatial') + ' (.dxf, .shp, .zip, .geojson)';
        }
        else {
            helper.textContent = t('modals.useKeyOrFile');
        }
    }
}
export function setImportMode(mode = 'model') {
    if (!CONFIG.FEATURES.FIRST_JOURNEY_IMPORT_ROUTING) {
        _importMode = 'model';
        _applyImportModeUI();
        return;
    }
    _importMode = ['model', 'data', 'spatial'].includes(mode) ? mode : 'model';
    _applyImportModeUI();
}
/**
 * Abre modal de importacao.
 * Limpa campos anteriores.
 */
export function openImportModal() {
    // Limpa textarea
    const keyInput = _document.getElementById('import-key-input');
    if (keyInput) {
        keyInput.value = '';
    }
    // Limpa seletor de arquivo
    const fileInput = _document.getElementById('import-file');
    if (fileInput) {
        fileInput.value = '';
    }
    // Limpa status
    const status = _document.getElementById('import-status');
    if (status) {
        status.textContent = '';
    }
    setImportMode('model');
    openModal('import-modal');
}
/**
 * Executa importacao do modal.
 * Verifica se ha arquivo ou texto e importa.
 * Suporta formatos: .ecokey, .json, .key, .csv, .geojson
 *
 * @param {Function} onSuccess - Callback chamado apos importacao bem sucedida
 */
export async function executeImport(onSuccess: any) {
    if (!canDo('edit')) {
        showToast(t('auth.actionDenied') || "You don't have permission to perform this action.", 'error');
        return;
    }
    const keyInput = _document.getElementById('import-key-input');
    const fileInput = _document.getElementById('import-file');
    const selectedFile = fileInput?.files?.[0] || null;
    try {
        if (_importMode === 'data') {
            closeModal('import-modal');
            if (typeof _window.handleOpenIngestionModal === 'function') {
                _window.handleOpenIngestionModal();
                if (selectedFile && typeof _window.handleIngestionDirectFile === 'function') {
                    await _window.handleIngestionDirectFile(selectedFile);
                }
                showToast(t('modals.dataFlowOpenedIngestion'), 'info');
            }
            else {
                showToast(t('modals.ingestionWizardUnavailable'), 'warning');
            }
            return;
        }
        if (_importMode === 'spatial') {
            const spatialExt = selectedFile
                ? selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase()
                : '';
            const isShapefile = spatialExt === '.shp' || spatialExt === '.zip';
            const isGeoJSON = spatialExt === '.geojson';
            if (selectedFile && (isShapefile || isGeoJSON)) {
                // Rota direta: shapefile/geojson sao dados espaciais
                // que reusam importShapefile()/importGeoJSON() existentes.
                // Cai no pipeline shared abaixo (linhas 786+).
            }
            else {
                closeModal('import-modal');
                if (typeof _window.handleOpenSpatialModal === 'function') {
                    _window.handleOpenSpatialModal();
                    if (selectedFile && typeof _window.handleSpatialDirectFile === 'function') {
                        await _window.handleSpatialDirectFile(selectedFile);
                    }
                    showToast(t('modals.spatialFlowOpened'), 'info');
                }
                else {
                    showToast(t('modals.spatialImportUnavailable'), 'warning');
                }
                return;
            }
        }
        // Prioridade para arquivo selecionado
        if (fileInput?.files?.length > 0) {
            const file = fileInput.files[0];
            const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
            // CSV: importa observações
            if (ext === '.csv') {
                syncOriginFromUI();
                const text = await readFileAsText(file);
                const { importCSV } = await import('../../core/io/formats/csv.js' as string);
                const result = importCSV(text);
                closeModal('import-modal');
                showToast(`Imported ${result.observations.length} observations from ${result.elementIds.length} elements`, 'success');
                if (onSuccess)
                    onSuccess();
                return;
            }
            // GeoJSON: importa elementos
            if (ext === '.geojson') {
                syncOriginFromUI();
                const text = await readFileAsText(file);
                const { importGeoJSON } = await import('../../core/io/formats/geojson.js' as string);
                const result = importGeoJSON(text);
                if (result.warnings.length > 0) {
                    console.warn('GeoJSON import warnings:', result.warnings);
                }
                closeModal('import-modal');
                showToast(t('modals.importedElementsFromGeojson', { count: result.elements.length }), 'success');
                if (onSuccess)
                    onSuccess();
                return;
            }
            // Shapefile (.shp ou .zip contendo shapefile).
            // Para .zip generico, modo spatial tenta shapefile-first;
            // outros modos tentam shapefile somente se nome sugere (.zip+shp).
            const zipShouldBeShapefile = ext === '.zip' && (_importMode === 'spatial' || file.name.toLowerCase().includes('shp'));
            if (ext === '.shp' || zipShouldBeShapefile) {
                syncOriginFromUI();
                // Wizard QGIS-style: preview + opcoes antes do commit
                const { openShapefileWizard } = await import('./shapefileWizardModal.js' as string);
                const wizardResult = await openShapefileWizard(file);
                if (!wizardResult || !wizardResult.confirmed) {
                    return; // Cancelado pelo usuario
                }
                const { showProgressOverlay } = await import('./progressOverlay.js' as string);
                const progress = showProgressOverlay(t('importingShapefile') || 'Importing shapefile...');
                try {
                    const { importShapefile } = await import('../../core/io/formats/shapefile.js' as string);
                    progress.update('Loading shpjs library', 0, 3);
                    const result = await importShapefile(file, {
                        targetFamily: wizardResult.targetFamily,
                        nameField: wizardResult.nameField || undefined,
                        familyMode: wizardResult.familyMode,
                    });
                    progress.update('Creating elements', 1, 3);
                    // Batch chunked addElement com rAF (evita main thread freeze + crash em >1000 elems)
                    const { addElementsBatch } = await import('../../core/elements/manager.js' as string);
                    const items = result.elements.map((el: any) => ({
                        family: el.family,
                        id: el.id,
                        name: el.name,
                        // LOD hint via wizard: meshFactory.createBoundaryMesh aplica simplification
                        // se lodHint !== 'HIGH'. Geometria original preservada em mesh.userData.originalVertices.
                        data: wizardResult.simplifyLod ? { ...el.data, lodHint: wizardResult.simplifyLod } : el.data,
                        meta: { iconClass: `icon-${el.family}`, color: el.color || '', label: el.name }
                    }));
                    const batchResult = await addElementsBatch(items, {
                        chunkSize: 50,
                        onProgress: (p: any) => progress.update(`Creating elements ${p.done}/${p.total}`, p.percent, 100),
                    });
                    const added = batchResult.added;
                    for (const ed of batchResult.errorDetails.slice(0, 20)) {
                        progress.addWarning(`${ed.id}: ${ed.message}`);
                    }
                    for (const w of result.warnings)
                        progress.addWarning(w);
                    progress.finish({ elements: added, warnings: result.warnings.length + batchResult.errors });
                    setTimeout(() => {
                        progress.dismiss();
                        closeModal('import-modal');
                    }, 2000);
                    showToast(t('modals.shapefileImported', { count: added }), 'success');
                    // Auto-fit + 2D top-down apos import bulk (Calvin 2026-05-14:
                    // dados GIS importados sempre 2D por default). Padding generoso
                    // 0.25 para garantir margem visual em datasets grandes.
                    if (wizardResult.autoFit) {
                        try {
                            const ctrlMod = await import('../scene/controls.js' as string);
                            const addedIds = (result?.elements || [])
                                .map((el: any) => el?.id)
                                .filter((id: any) => typeof id === 'string' && id.length > 0);
                            if (typeof ctrlMod.enable2DAndFitImported === 'function') {
                                await ctrlMod.enable2DAndFitImported(addedIds, { padding: 0.25 });
                            }
                            else if (typeof _window.fitAllElements === 'function') {
                                _window.fitAllElements();
                            }
                        }
                        catch (e: any) {
                            console.debug('[modals] enable2DAndFit:', e?.message || e);
                        }
                    }
                    if (onSuccess)
                        onSuccess();
                }
                catch (err: any) {
                    progress.addError(err.message);
                    progress.finish({ errors: 1 });
                    showToast(t('modals.shapefileError', { message: err.message }), 'error');
                }
                return;
            }
            // ZIP generico (tenta shapefile primeiro)
            if (ext === '.zip') {
                syncOriginFromUI();
                try {
                    const { importShapefile } = await import('../../core/io/formats/shapefile.js' as string);
                    const result = await importShapefile(file);
                    const { addElement } = await import('../../core/elements/manager.js' as string);
                    let added = 0;
                    for (const el of result.elements) {
                        try {
                            addElement(el.family, el.id, el.name, el.data, {
                                iconClass: `icon-${el.family}`,
                                label: el.name,
                            });
                            added++;
                        }
                        catch (e: any) {
                            console.debug('[modals] shapefileAddElement:', e?.message || e);
                            /* skip */
                        }
                    }
                    closeModal('import-modal');
                    showToast(t('modals.shapefileZipImported', { count: added }), 'success');
                    // 2D top-down + fit nos elementos recém-importados (default ZIP).
                    try {
                        const ctrlMod = await import('../scene/controls.js' as string);
                        const addedIds = (result?.elements || [])
                            .map((el: any) => el?.id)
                            .filter((id: any) => typeof id === 'string' && id.length > 0);
                        if (typeof ctrlMod.enable2DAndFitImported === 'function') {
                            await ctrlMod.enable2DAndFitImported(addedIds, { padding: 0.25 });
                        }
                        else if (typeof _window.fitAllElements === 'function') {
                            _window.fitAllElements();
                        }
                    }
                    catch (e2: any) {
                        console.debug('[modals] enable2DAndFit-zip:', e2?.message || e2);
                    }
                    if (onSuccess)
                        onSuccess();
                    return;
                }
                catch (e: any) {
                    console.debug('[modals] shapefileFallback:', e?.message || e);
                    // Nao e shapefile - tenta como ECO key file
                }
            }
            // Default: ECO key ou JSON
            const mergeToggle = _document.getElementById('import-merge-toggle');
            const isMerge = mergeToggle?.checked || false;
            if (isMerge) {
                await _importWithMerge(file, null, onSuccess);
            }
            else {
                await importFromFile(file);
                closeModal('import-modal');
                showToast(t('modelImported'), 'success');
                if (onSuccess)
                    onSuccess();
            }
            return;
        }
        // Tenta texto colado
        const keyValue = keyInput?.value?.trim();
        if (keyValue) {
            const mergeToggle = _document.getElementById('import-merge-toggle');
            const isMerge = mergeToggle?.checked || false;
            if (isMerge) {
                await _importWithMerge(null, keyValue, onSuccess);
            }
            else {
                await importFromString(keyValue);
                closeModal('import-modal');
                showToast(t('modelImported'), 'success');
                if (onSuccess)
                    onSuccess();
            }
            return;
        }
        // Nenhum input fornecido
        showToast(t('provideKeyOrFile'), 'error');
    }
    catch (error: any) {
        showToast(`${t('importFailed')}: ${error.message}`, 'error');
    }
}
/**
 * Lê conteúdo de um File como texto.
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsText(file: any) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(String(e.target?.result || ''));
        reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
        reader.readAsText(file);
    });
}
/**
 * Importa modelo com merge incremental.
 * Decodifica a partir de arquivo ou string, depois chama importIncremental().
 * Trata CRS mismatch com dialog bloqueante.
 *
 * @param {File|null} file - arquivo .ecokey/.json
 * @param {string|null} keyString - texto colado
 * @param {Function} onSuccess - callback pos-import
 */
async function _importWithMerge(file: any, keyString: any, onSuccess: any) {
    // eslint-disable-next-line
    const { parseInput, parseInputAsync, decodeKeyUniversal, detectKeyVersion } = await import('../../core/io/import.js' as string).then(() => import('../../core/io/decoder.js' as string));
    const { showProgressOverlay } = await import('./progressOverlay.js' as string);
    const { pushSnapshot } = await import('../history/manager.js' as string);
    const { asyncConfirm } = await import('./asyncDialogs.js' as string);
    /** @type {string} */
    let input;
    if (file) {
        input = await readFileAsText(file);
    }
    else {
        input = keyString || '';
    }
    // Decode
    const version = detectKeyVersion(input.trim());
    /** @type {any} */
    let model;
    if (version === 4) {
        model = await decodeKeyUniversal(input.trim());
    }
    else {
        model = parseInput(input.trim());
    }
    // Tenta merge
    const progress = showProgressOverlay(t('merging') || 'Merging data...');
    try {
        const result = await importIncremental(model, { duplicateStrategy: 'skip' });
        progress.finish({
            elements: result.stats.elementsAdded,
            campaigns: result.stats.campaignsAdded,
            observations: result.stats.observationsAdded,
        });
        if (result.stats.elementsSkipped > 0) {
            progress.addInfo(`${result.stats.elementsSkipped} existing element(s) preserved`);
        }
        pushSnapshot();
        closeModal('import-modal');
        showToast(`Merged: +${result.stats.elementsAdded} elements, +${result.stats.campaignsAdded} campaigns, +${result.stats.observationsAdded} obs`, 'success');
        if (onSuccess)
            onSuccess();
        setTimeout(() => progress.dismiss(), 3000);
    }
    catch (err: any) {
        const message = err.message || String(err);
        if (message.startsWith('CRS_MISMATCH:')) {
            const [, current, imported] = message.split(':');
            progress.dismiss();
            const proceed = await asyncConfirm(`UTM zone mismatch: current model is Zone ${current}, import is Zone ${imported}. Coordinates may be wrong. Proceed anyway?`);
            if (proceed) {
                // Retry sem check de CRS (patch temporario no modelo)
                model.coordinate = model.coordinate || {};
                model.coordinate.zone = parseInt(current);
                try {
                    const result = await importIncremental(model, { duplicateStrategy: 'skip' });
                    pushSnapshot();
                    closeModal('import-modal');
                    showToast(t('modals.mergedCrsOverridden', { count: result.stats.elementsAdded }), 'success');
                    if (onSuccess)
                        onSuccess();
                }
                catch (e2: any) {
                    showToast(`${t('importFailed')}: ${e2.message}`, 'error');
                }
            }
        }
        else {
            progress.addError(message);
            progress.finish({ errors: 1 });
        }
    }
}
/**
 * Handler para mudanca no input de arquivo.
 * Exibe nome do arquivo selecionado.
 *
 * @param {Event} event - Evento change
 */
export function handleFileInputChange(event: any) {
    const status = _document.getElementById('import-status');
    if (!status)
        return;
    const target = event.target;
    if (target?.files && target.files.length > 0) {
        const fileName = target.files[0].name;
        status.innerHTML = `<span style="color: var(--success);">${t('fileSelected')}: ${escapeHtml(fileName)}</span>`;
    }
}
/**
 * Handler para digitacao no textarea de importacao.
 * Valida formato enquanto usuario digita.
 *
 * @param {Event} event - Evento input
 */
export function handleKeyInputChange(event: any) {
    const status = _document.getElementById('import-status');
    if (!status)
        return;
    const target = event.target;
    const value = target?.value.trim() || '';
    if (!value) {
        status.textContent = '';
        return;
    }
    const validation = validateContent(value);
    if (validation.valid) {
        status.innerHTML = `<span style="color: var(--success);">${t('validFormat')}</span>`;
    }
    else {
        status.innerHTML = `<span style="color: var(--warning);">${t('enterEcoKey')}</span>`;
    }
}
// ----------------------------------------------------------------
// MODAL DE GERENCIAMENTO DE FAMILIAS
// ----------------------------------------------------------------
/**
 * Abre modal de gerenciamento de familias.
 * Atualiza lista de familias.
 */
export function openFamilyManager() {
    updateFamilyManagerList();
    openModal('family-modal');
}
/**
 * Atualiza lista de familias no modal.
 */
export function updateFamilyManagerList() {
    const container = _document.getElementById('family-manager-list');
    if (!container)
        return;
    const families = getAllFamilies();
    container.innerHTML = Object.values(families)
        .map((f: any) => {
        const locked = isFieldLocked(f.id);
        return `
        <div style="display: flex; align-items: center; gap: 8px; padding: 8px; border-bottom: 1px solid var(--neutral-200);">
            <span style="font-size: 18px;">${getIcon(f.icon, { size: '20px' })}</span>
            <span style="flex: 1; font-size: 12px;">${getFamilyName(f)}${locked ? ` <span class="locked-indicator">${getIcon('lock', { size: '10px' })} ${t('lockedField')}</span>` : ''}</span>
            <input data-field-meta="true" data-field-meta-key="auto-pos:modals:input:L1072" type="checkbox" ${f.enabled ? 'checked' : ''} ${locked ? 'disabled' : ''}
                   data-cc-call-change="handleFamilyToggle|s:${encodeURIComponent(`${f.id}`)}">
            ${f.custom && !locked
            ? `
                <button type="button" class="btn btn-secondary"
                        style="padding: 4px 8px; font-size: 10px;"
                        data-cc-call-click="handleFamilyDelete|s:${encodeURIComponent(`${f.id}`)}">
                    ${t('delete')}
                </button>
            `
            : ''}
        </div>
    `;
    })
        .join('');
}
/**
 * Handler para toggle de familia.
 *
 * @param {string} familyId - ID da familia
 */
export function handleFamilyToggle(familyId: any) {
    toggleFamily(familyId);
    // Dispara evento para atualizar UI principal
    _window.dispatchEvent(new CustomEvent('familiesChanged'));
}
/**
 * Handler para deletar familia.
 *
 * @param {string} familyId - ID da familia
 */
export async function handleFamilyDelete(familyId: any) {
    const family = getAllFamilies()[familyId];
    if (!family)
        return;
    const confirmMessage = `${t('deleteFamilyConfirm')} "${getFamilyName(family)}"?`;
    if (await asyncConfirm(confirmMessage)) {
        // Remove elementos da familia
        removeElementsByFamily(familyId);
        // Remove familia do registro
        deleteFamilyFromRegistry(familyId);
        // Atualiza lista no modal
        updateFamilyManagerList();
        showToast(t('familyDeleted'), 'info');
        // Dispara evento para atualizar UI principal
        _window.dispatchEvent(new CustomEvent('familiesChanged'));
    }
}
/**
 * Adiciona familia personalizada.
 */
export function handleAddCustomFamily() {
    const idInput = _document.getElementById('new-family-id');
    const nameInput = _document.getElementById('new-family-name');
    const id = idInput?.value?.trim()?.toLowerCase()?.replace(/\s+/g, '_');
    const name = nameInput?.value?.trim();
    if (!id || !name) {
        showToast(t('enterIdAndName'), 'error');
        return;
    }
    const result = addFamilyToRegistry(id, name);
    if (result) {
        // Limpa inputs
        if (idInput)
            idInput.value = '';
        if (nameInput)
            nameInput.value = '';
        // Atualiza lista
        updateFamilyManagerList();
        showToast(`${t('familyAdded')}: "${name}"`, 'success');
        // Dispara evento para atualizar UI principal
        _window.dispatchEvent(new CustomEvent('familiesChanged'));
    }
    else {
        showToast(t('familyExists'), 'error');
    }
}
