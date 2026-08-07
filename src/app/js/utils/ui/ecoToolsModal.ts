// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Module: EcoTools Modal - C1 UI
// Gerenciador de ferramentas customizadas criadas pelo assistente IA

import { getEcoTools, createEcoTool, updateEcoTool, saveEcoToolRecord } from '../../core/llm/toolBuilder.js';
import { showToast } from './toast.js';
import { t } from '../i18n/translations.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';

// ================================================================
// STATE
// ================================================================

const _state: {activeTool: any, sandboxWorker: any, msgHandler: any} = {
    activeTool: null, // ID da ferramenta em execução no preview
    sandboxWorker: null, // Worker de sandbox ativo (reservado)
    msgHandler: null, // Listener de postMessage ativo (cleanup no fechar)
};

/** Keydown global do modal — referência de módulo para cleanup no fechamento. */
let _onKeyHandler: ((e: any) => void) | null = null;

// ================================================================
// OPEN / CLOSE
// ================================================================

/**
 * Opens the EcoTools manager modal
 * Abre o modal de gerenciamento de EcoTools
 */
export function openEcoToolsModal() {
    const modal = (document.getElementById('eco-tools-modal') as any);
    if (!modal) _injectModal();

    if (getEcoTools().length === 0) {
        _seedDefaultTools();
    } else {
        // Migra HTML das seeds sem apagar records de sessões anteriores
        _migrateSeedTools();
    }

    const m = (document.getElementById('eco-tools-modal') as any);
    m.style.display = 'flex';
    renderEcoToolsList();
    // Sprint 3 Tier-B (Calvin 2026-06-03): URL = estado painel aberto
    syncDeepLinkUrl('eco-tools');

    // UI-EVAL-COVERAGE-001 #sessao-longa (2026-08-06): este keydown entrava em
    // `document` a cada abertura e so se auto-removia no caminho do Escape.
    // Fechar pelo "x"/backdrop (ou reabrir) deixava um handler preso POR CICLO —
    // crescimento linear com N. Referencia de modulo + remocao no close cobre
    // TODOS os caminhos de saida.
    if (_onKeyHandler) document.removeEventListener('keydown', _onKeyHandler);
    _onKeyHandler = (e: any) => {
        if (e.key === 'Escape') closeEcoToolsModal();
    };
    document.addEventListener('keydown', _onKeyHandler);
}

/**
 * Closes the EcoTools modal
 * Fecha o modal de EcoTools e limpa listeners e worker de sandbox
 */
export function closeEcoToolsModal() {
    // cleanup do keydown global ANTES do DOM — vale em todo caminho de saida
    if (_onKeyHandler) {
        document.removeEventListener('keydown', _onKeyHandler);
        _onKeyHandler = null;
    }
    const modal = (document.getElementById('eco-tools-modal') as any);
    if (modal) {
        modal.style.display = 'none';
        clearDeepLinkUrl();
    }
    _cleanupMsgHandler();
    _cleanupSandbox();
}

// ================================================================
// MODAL TEMPLATE
// ================================================================

function _injectModal() {
    const div = document.createElement('div');
    div.innerHTML = `
        <div id="eco-tools-modal" class="modal-overlay" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="eco-tools-modal-title">
            <div class="modal-dialog" style="width:820px;max-width:95vw">
                <div class="modal-header">
                    <h3 id="eco-tools-modal-title">
                        <span class="icon" data-icon="tool"></span>
                        ${t('ecoTools.toolsList')}
                    </h3>
                    <button class="modal-close" data-cc-action="cc-062c5f4f" aria-label="${t('ecoTools.closeAria')}">&#x2715;</button>
                </div>
                <div class="modal-body eco-tools-body">
                    <div class="eco-tools-hint">
                        <span class="eco-tools-hint-icon">&#9432;</span>
                        <span>${t('ecoTools.hint')}</span>
                    </div>
                    <div id="eco-tools-list-container"></div>
                    <div id="eco-tools-preview-container" style="display:none">
                        <div class="eco-tools-preview-wrap">
                            <div class="eco-tools-preview-header">
                                <span class="eco-tools-preview-title" id="eco-tools-preview-title"></span>
                                <button class="btn btn-secondary btn-xs" data-cc-action="cc-e6cff4d3">${t('ecoTools.close')}</button>
                            </div>
                            <iframe id="eco-tools-preview-frame" class="eco-tools-preview-frame"></iframe>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild((div.firstElementChild as Node));
    if ((window as any).hydrateIcons) (window as any).hydrateIcons(document.getElementById('eco-tools-modal'));
}

// ================================================================
// LIST
// ================================================================

/**
 * Renders the list of available EcoTools
 * Renderiza a lista de EcoTools disponíveis com badge de registros e botão Editar
 */
export function renderEcoToolsList() {
    const container = (document.getElementById('eco-tools-list-container') as any);
    if (!container) return;

    const tools = getEcoTools();

    if (tools.length === 0) {
        container.innerHTML = `
            <div class="eco-tools-empty">
                <div class="eco-tools-empty-icon">&#9881;</div>
                <div class="eco-tools-empty-title">${t('ecoTools.noTools')}</div>
                <div class="eco-tools-empty-sub">${t('ecoTools.emptySub')}</div>
                <div class="eco-tools-empty-cmd">${t('ecoTools.emptyExample')}</div>
            </div>
        `;
        if ((window as any).hydrateIcons) (window as any).hydrateIcons(container);
        return;
    }

    // Detectar porta da API (mesmo host, usa window.location.port - porta 4000 em produção)
    const apiBase =
        (window as any)._ecoApiBase ||
        (window.location.port
            ? `${window.location.protocol}//${window.location.hostname}:${window.location.port}`
            : window.location.origin);

    container.innerHTML = `
        <div class="eco-tools-grid">
            ${tools
                .map((tool: any) => {
                    const recCount = tool.records?.length || 0;
                    const descPreview =
                        _escape(tool.description.substring(0, 120)) + (tool.description.length > 120 ? '...' : '');
                    const apiUrl = `${apiBase}/api/ecotool-records?id=${tool.id}`;
                    return `
                <div class="eco-tool-card" data-id="${tool.id}" data-tool-id="${tool.id}">
                    <div class="eco-tool-card-header">
                        <span class="eco-tool-name">${_escape(tool.name)}</span>
                        <span class="eco-tool-date">${new Date(tool.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div class="eco-tool-description">${descPreview}</div>
                    <div class="eco-tool-meta">
                        <span class="eco-tool-badge">${t('ecoTools.recordCount', { count: recCount, plural: recCount === 1 ? '' : 's' })}</span>
                        <a class="eco-tool-api-link" href="${_escape(apiUrl)}" target="_blank" rel="noopener" title="${t('ecoTools.apiLink')}">
                            <span class="icon" data-icon="link"></span> API
                        </a>
                    </div>
                    <div class="eco-tool-actions">
                        <button class="btn btn-secondary btn-xs" data-cc-call-click="handlePreviewEcoTool|s:${encodeURIComponent(`${tool.id}`)}">
                            <span class="icon" data-icon="play"></span> ${t('ecoTools.previewBtn')}
                        </button>
                        <button class="btn btn-secondary btn-xs" data-cc-call-click="handleOpenEcoToolInTab|s:${encodeURIComponent(`${tool.id}`)}">
                            <span class="icon" data-icon="external-link"></span> ${t('ecoTools.open')}
                        </button>
                        <button class="btn btn-secondary btn-xs" data-cc-call-click="handleEditEcoTool|s:${encodeURIComponent(`${tool.id}`)}">
                            <span class="icon" data-icon="edit-2"></span> ${t('ecoTools.editBtn')}
                        </button>
                        <button class="btn btn-danger btn-xs" data-cc-call-click="handleDeleteEcoTool|s:${encodeURIComponent(`${tool.id}`)}">
                            <span class="icon" data-icon="trash-2"></span> ${t('ecoTools.removeBtn')}
                        </button>
                    </div>
                </div>`;
                })
                .join('')}
        </div>
    `;
    if ((window as any).hydrateIcons) (window as any).hydrateIcons(container);
}

// ================================================================
// PREVIEW - iframe sandbox com bridge postMessage
// ================================================================

/**
 * Opens a sandboxed preview of an EcoTool
 * Abre o preview isolado de uma EcoTool no container do modal
 * @param {string} toolId
 */
export function previewEcoTool(toolId: any) {
    const tools = getEcoTools();
    const tool = tools.find((t: any) => t.id === toolId);
    if (!tool) {
        showToast(t('ecoTools.ecoToolNotFound'), 'error');
        return;
    }

    _state.activeTool = toolId;

    const preview = (document.getElementById('eco-tools-preview-container') as any);
    const frame = (document.getElementById('eco-tools-preview-frame') as any);
    const title = (document.getElementById('eco-tools-preview-title') as any);

    if (!preview || !frame || !title) return;

    // Fechar editor caso esteja aberto
    const editor = (document.getElementById('eco-tool-editor') as any);
    if (editor) editor.style.display = 'none';
    frame.style.display = '';

    title.textContent = tool.name;
    preview.style.display = 'block';

    const sandboxHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { font-family: system-ui, sans-serif; padding: 12px; margin: 0; color: #1a202c; }
* { box-sizing: border-box; }
</style>
</head>
<body>
${tool.htmlContent}
</body>
</html>`;

    // F02 - sandbox SEM allow-same-origin: impede frame srcdoc de acessar parent DOM/storage
    // postMessage continua funcionando (origin opaca 'null' para parent)
    frame.setAttribute('sandbox', 'allow-scripts allow-forms');
    frame.setAttribute('srcdoc', sandboxHtml);
    frame.style.cssText = 'width:100%;height:340px;border:none;border-radius:4px;background:#fff;';
    frame.setAttribute('title', t('ecoTools.previewFrameTitle', { name: tool.name }));

    // Bridge postMessage - captura contentWindow após load para garantir referência correta
    // em iframes sandboxed (origem nula), onde contentWindow pode mudar na navegação
    _cleanupMsgHandler();
    const capturedToolId = toolId;
    frame.onload = () => {
        _cleanupMsgHandler();
        const iframeWin = frame.contentWindow;
        _state.msgHandler = (event: any) => {
            // Guard primario (unforgeable): referencia de objeto do iframe
            if (event.source !== iframeWin) return;
            // Guard secundario: srcdoc sem allow-same-origin tem origin 'null' (string literal).
            // NOTA: se allow-same-origin for re-adicionado, origin mudaria para 'http://...'
            // e este guard bloquearia mensagens legitimas. Manter allow-same-origin FORA do sandbox.
            if (event.origin !== 'null') return;
            if (event.data?.type !== 'ecobytes-save') return;
            const record = _sanitizeRecord(event.data?.record);
            if (!record) return;
            _handleEcoSave(capturedToolId, record);
        };
        window.addEventListener('message', _state.msgHandler);
    };

    showToast(t('ecoTools.preview', { name: tool.name }), 'info');
}

/**
 * F02 - Sanitiza record recebido via postMessage do iframe sandboxed.
 * Limita a 50 chaves, valores primitivos apenas (string/number/boolean).
 * @param {*} record
 * @returns {any}
 */
function _sanitizeRecord(record: any): any {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) return null;
    const MAX_KEYS = 50;
    const MAX_VALUE_LEN = 1000;
    const keys = Object.keys(record).slice(0, MAX_KEYS);
    const out: Record<string, any> = {};
    for (const k of keys) {
        const v = record[k];
        if (typeof v === 'string') out[k] = v.slice(0, MAX_VALUE_LEN);
        else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
        // objetos aninhados e arrays: ignorados por seguranca
    }
    return Object.keys(out).length ? out : null;
}

/**
 * Trata o evento de salvar registro vindo do iframe via postMessage
 * Fix #5: atualiza badge cirurgicamente sem re-render da lista
 * @param {string} toolId
 * @param {any} record
 */
function _handleEcoSave(toolId: any, record: any) {
    const saved = saveEcoToolRecord(toolId, record);
    if (!saved) {
        showToast(t('ecoTools.errorSavingRecord'), 'error');
        return;
    }

    const fieldCount = Object.keys(record).length;
    showToast(t('ecoTools.recordSaved', { count: fieldCount, plural: fieldCount === 1 ? '' : 's' }), 'success');

    // Atualiza só o badge do card específico - sem re-render completo
    const badge = (document.querySelector(`[data-tool-id="${toolId}"] .eco-tool-badge`) as any);
    if (badge) {
        const tool = getEcoTools().find((t: any) => t.id === toolId);
        const count = tool?.records?.length || 0;
        badge.textContent = t('ecoTools.recordCount', { count, plural: count === 1 ? '' : 's' });
    }
}

/**
 * Closes the EcoTool preview
 * Fecha o preview da EcoTool e remove listener de postMessage
 */
export function closeEcoToolPreview() {
    _cleanupMsgHandler();

    const preview = (document.getElementById('eco-tools-preview-container') as any);
    const frame = (document.getElementById('eco-tools-preview-frame') as any);
    const editor = (document.getElementById('eco-tool-editor') as any);

    if (frame) {
        frame.removeAttribute('srcdoc');
        frame.removeAttribute('sandbox');
    }
    if (editor) editor.style.display = 'none';
    if (preview) preview.style.display = 'none';

    _state.activeTool = null;
}

// ================================================================
// EDIT - editor inline no container de preview
// ================================================================

/**
 * Abre o editor inline de uma EcoTool no container de preview.
 * Mostra nome, description (prompt) e htmlContent em campos editáveis.
 * @param {string} toolId
 */
export function openEditEcoTool(toolId: any) {
    const tools = getEcoTools();
    const tool = tools.find((t: any) => t.id === toolId);
    if (!tool) {
        showToast(t('ecoTools.ecoToolNotFoundPeriod'), 'error');
        return;
    }

    _state.activeTool = toolId;

    const preview = (document.getElementById('eco-tools-preview-container') as any);
    const title = (document.getElementById('eco-tools-preview-title') as any);
    const frame = (document.getElementById('eco-tools-preview-frame') as any);
    if (!preview || !title) return;

    // Esconde iframe, mostra editor
    if (frame) frame.style.display = 'none';

    title.textContent = t('ecoTools.edit', { name: tool.name });
    preview.style.display = 'block';

    let editor = (document.getElementById('eco-tool-editor') as any);
    if (!editor) {
        editor = document.createElement('div');
        editor.id = 'eco-tool-editor';
        (preview.querySelector('.eco-tools-preview-wrap') as any).appendChild(editor);
    }

    editor.style.display = 'block';
    editor.innerHTML = `
        <div class="eco-tool-edit-form">
            <div class="eco-tool-edit-row">
                <label for="ete-name">${t('ecoTools.name')}</label>
                <input data-field-meta="true" data-field-meta-key="auto:ete-name" id="ete-name" type="text" value="${_escape(tool.name)}" maxlength="80">
            </div>
            <div class="eco-tool-edit-row">
                <label for="ete-desc">${t('ecoTools.description')}</label>
                <textarea data-field-meta="true" data-field-meta-key="auto:ete-desc" id="ete-desc" rows="4">${_escape(tool.description)}</textarea>
            </div>
            <div class="eco-tool-edit-row">
                <label for="ete-html">${t('ecoTools.htmlJs')}</label>
                <textarea data-field-meta="true" data-field-meta-key="auto:ete-html" id="ete-html" rows="12" style="font-family:monospace;font-size:11px">${_escape(tool.htmlContent)}</textarea>
            </div>
            <div class="eco-tool-edit-actions">
                <button class="btn btn-primary btn-xs"
                    data-cc-call-click="handleSaveEcoTool|s:${encodeURIComponent(`${tool.id}`)}">${t('ecoTools.save')}</button>
                <button class="btn btn-secondary btn-xs"
                    data-cc-action="cc-245e3d97">${t('ecoTools.cancel')}</button>
            </div>
        </div>
    `;
    if ((window as any).hydrateIcons) (window as any).hydrateIcons(editor);
}

/**
 * Salva as edições feitas no editor inline e atualiza a lista.
 * @param {string} toolId
 */
export function saveEditEcoTool(toolId: any) {
    const name = (document.getElementById('ete-name') as any)?.value?.trim();
    const desc = (document.getElementById('ete-desc') as any)?.value ?? '';
    const html = (document.getElementById('ete-html') as any)?.value ?? '';

    if (!name) {
        showToast(t('ecoTools.nameRequired'), 'warning');
        return;
    }

    const ok = updateEcoTool(toolId, { name, description: desc, htmlContent: html });
    if (!ok) {
        showToast(t('ecoTools.errorSaving'), 'error');
        return;
    }

    showToast(t('ecoTools.ecoToolUpdated'), 'success');
    cancelEditEcoTool();
    renderEcoToolsList();
}

/**
 * Fecha o editor sem salvar e restaura o estado do container de preview.
 */
export function cancelEditEcoTool() {
    const editor = (document.getElementById('eco-tool-editor') as any);
    if (editor) editor.style.display = 'none';
    const frame = (document.getElementById('eco-tools-preview-frame') as any);
    if (frame) frame.style.display = '';
    const preview = (document.getElementById('eco-tools-preview-container') as any);
    if (preview) preview.style.display = 'none';
    _state.activeTool = null;
}

// ================================================================
// DELETE
// ================================================================

/**
 * Deletes an EcoTool after confirmation
 * Remove uma EcoTool com confirmação
 * @param {string} toolId
 */
export async function deleteEcoTool(toolId: any) {
    const tools = getEcoTools();
    const tool = tools.find((t: any) => t.id === toolId);
    if (!tool) return;

    const { asyncConfirm } = await import('./asyncDialogs.js');
    const ok = await asyncConfirm(t('ecoTools.removeConfirm', { name: tool.name }), {
        confirmLabel: t('ecoTools.removeBtn'),
        cancelLabel: t('ecoTools.cancel'),
        danger: true,
    });
    if (!ok) return;

    import('../../core/llm/toolBuilder.js').then(({ removeEcoTool: rm }) => {
        const removed = rm(toolId);
        if (removed) {
            if (_state.activeTool === toolId) closeEcoToolPreview();
            showToast(t('ecoTools.ecoToolRemoved', { name: tool.name }), 'success');
            renderEcoToolsList();
        }
    }).catch((e: any) => console.debug('[ecoToolsModal:lazy-toolBuilder:silent-catch]', e?.message || e));
}

// ================================================================
// DEFAULT TOOLS SEED
// ================================================================

/**
 * Retorna as definições das 3 seeds sem criar EcoTools.
 * Usado por _seedDefaultTools() e _migrateSeedTools().
 * @returns {Array<{name: string, description: string, htmlContent: string}>}
 */
function _buildSeedDefs(): Array<{name: string, description: string, htmlContent: string}> {
    return [
        {
            name: 'Calculadora de ISQ',
            description:
                'Prompt: Crie uma EcoTool que calcule o ISQ (Índice de Qualidade Simplificado) de um poço a partir de múltiplos parâmetros e seus valores de referência CETESB.',
            htmlContent: `<style>
body{font-family:system-ui,sans-serif;padding:14px;color:#1a202c;font-size:13px}
h3{margin:0 0 12px;font-size:14px;color:#2d3748}
.row{display:flex;gap:8px;margin-bottom:8px;align-items:center}
label{min-width:140px;font-size:12px;color:#4a5568}
input{flex:1;padding:5px 8px;border:1px solid #cbd5e0;border-radius:4px;font-size:12px}
button{padding:6px 16px;background:#3182ce;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px}
button:hover{background:#2b6cb0}
.result{margin-top:12px;padding:10px;border-radius:6px;font-weight:600;font-size:14px;text-align:center}
.ok{background:#f0fff4;color:#276749;border:1px solid #9ae6b4}
.warn{background:#fffbeb;color:#92400e;border:1px solid #fbd38d}
.fail{background:#fff5f5;color:#9b2c2c;border:1px solid #feb2b2}
</style>
<h3>Calculadora ISQ &#8212; Po&#231;o de Monitoramento</h3>
<div class="row"><label>Concentra&#231;&#227;o (&#956;g/L):</label><input data-field-meta="true" data-field-meta-key="auto:c" id="c" type="number" placeholder="Ex: 15" step="0.01"></div>
<div class="row"><label>VP CETESB (&#956;g/L):</label><input data-field-meta="true" data-field-meta-key="auto:vp" id="vp" type="number" placeholder="Ex: 300" step="0.01"></div>
<div class="row"><label>VI CETESB (&#956;g/L):</label><input data-field-meta="true" data-field-meta-key="auto:vi" id="vi" type="number" placeholder="Ex: 750" step="0.01"></div>
<button data-cc-action="cc-16193d27">Calcular ISQ</button>
<div id="res" class="result" style="display:none"></div>
<script>
function calc(){
  var c=+(document.getElementById('c') as any).value,vp=+(document.getElementById('vp') as any).value,vi=+(document.getElementById('vi') as any).value;
  if(!c||!vp||!vi){_fb('Preencha todos os campos',false);return}
  var isq=Math.max(0,Math.min(100,100*(1-c/vi)));
  var cls=c<=vp?'ok':c<=vi?'warn':'fail';
  var lbl=c<=vp?'Abaixo do VP \u2014 Qualidade satisfat\u00f3ria':c<=vi?'Entre VP e VI \u2014 Requer monitoramento':'Acima do VI \u2014 Remedia\u00e7\u00e3o indicada';
  var d = (document.getElementById('res') as any);
  d.style.display='block';d.className='result '+cls;
  d.innerHTML='ISQ = '+isq.toFixed(1)+' &nbsp;|&nbsp; '+lbl;
}
/**
 * @param {any} msg
 * @param {any} ok
 */
function _fb(msg: any,ok: any){
  var d = (document.getElementById('res') as any);
  d.style.display='block';d.className='result '+(ok?'ok':'fail');d.textContent=msg;
}
</script>`,
        },
        {
            name: 'Formulário de Coleta de Campo',
            description:
                "Prompt: Crie uma EcoTool de formulário para registro de coleta de campo em poço de monitoramento, com campos para parâmetros físico-químicos, nível d'água e observações, com botões de copiar e salvar no modelo.",
            htmlContent: `<style>
body{font-family:system-ui,sans-serif;padding:14px;color:#1a202c;font-size:12px}
h3{margin:0 0 10px;font-size:13px;color:#2d3748}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px}
.field{display:flex;flex-direction:column;gap:2px}
label{font-size:11px;font-weight:600;color:#4a5568;text-transform:uppercase}
input,textarea,select{padding:5px 7px;border:1px solid #cbd5e0;border-radius:4px;font-size:12px}
textarea{resize:vertical}
.full{grid-column:1/-1}
.actions{margin-top:10px;display:flex;gap:8px}
button{padding:5px 12px;border:none;border-radius:4px;cursor:pointer;font-size:12px}
.copy{background:#3182ce;color:#fff}.copy:hover{background:#2b6cb0}
.save{background:#276749;color:#fff}.save:hover{background:#22543d}
.clear{background:#e2e8f0;color:#4a5568}.clear:hover{background:#cbd5e0}
#feedback{display:none;padding:8px;margin-top:8px;border-radius:4px;font-size:12px;text-align:center}
</style>
<h3>Registro de Coleta &#8212; Campo</h3>
<div class="grid">
  <div class="field"><label>Data</label><input data-field-meta="true" data-field-meta-key="auto:f_data" id="f_data" type="date"></div>
  <div class="field"><label>Po&#231;o / Elem.</label><input data-field-meta="true" data-field-meta-key="auto:f_poco" id="f_poco" type="text" placeholder="PM-01"></div>
  <div class="field"><label>pH</label><input data-field-meta="true" data-field-meta-key="auto:f_ph" id="f_ph" type="number" step="0.01" placeholder="7.0"></div>
  <div class="field"><label>Condutividade (&#956;S/cm)</label><input data-field-meta="true" data-field-meta-key="auto:f_cond" id="f_cond" type="number" step="0.1" placeholder="150"></div>
  <div class="field"><label>OD (mg/L)</label><input data-field-meta="true" data-field-meta-key="auto:f_od" id="f_od" type="number" step="0.01" placeholder="5.2"></div>
  <div class="field"><label>Eh (mV)</label><input data-field-meta="true" data-field-meta-key="auto:f_eh" id="f_eh" type="number" step="1" placeholder="120"></div>
  <div class="field"><label>N&#237;vel est&#225;tico (m)</label><input data-field-meta="true" data-field-meta-key="auto:f_ne" id="f_ne" type="number" step="0.01" placeholder="2.40"></div>
  <div class="field"><label>Turbidez (NTU)</label><input data-field-meta="true" data-field-meta-key="auto:f_turb" id="f_turb" type="number" step="0.1" placeholder="5"></div>
  <div class="field full"><label>Observa&#231;&#245;es</label><textarea data-field-meta="true" data-field-meta-key="auto:f_obs" id="f_obs" rows="2" placeholder="${t('ecoTools.recordPlaceholder')}"></textarea></div>
</div>
<div class="actions">
  <button class="copy" data-cc-action="cc-8f75497c">Copiar dados</button>
  <button class="save" data-cc-action="cc-96142947">Salvar no Modelo</button>
  <button class="clear" data-cc-action="cc-7fc5e15f">Limpar</button>
</div>
<div id="feedback"></div>
<script>
var CAMPOS: any = {date:'f_data',poco:'f_poco',ph:'f_ph',cond:'f_cond',od:'f_od',eh:'f_eh',ne:'f_ne',turb:'f_turb',obs:'f_obs'};
/**
 * @param {any} msg
 * @param {any} ok
 */
function _showFeedback(msg: any,ok: any){
  var el = (document.getElementById('feedback') as any);
  el.textContent=msg;el.style.display='block';
  el.style.background=ok?'#c6f6d5':'#fed7d7';
  el.style.color=ok?'#22543d':'#9b2c2c';
  setTimeout(function(){el.style.display='none'},3000);
}
function _vals(){
  var r: any = {};
  Object.keys(CAMPOS).forEach(function(k){
    var v=(document.getElementById(CAMPOS[k])||{}).value;
    if(v)r[k]=v;
  });
  return r;
}
function copiar(){
  var labels: any = {date:'Data',poco:'Po\u00e7o',ph:'pH',cond:'Condutividade',od:'OD',eh:'Eh',ne:'NE',turb:'Turbidez',obs:'Obs'};
  var v=_vals();
  var txt=Object.keys(v).map(function(k){return labels[k]+': '+v[k]}).join('\\n');
  navigator.clipboard.writeText(txt)
    .then(function(){_showFeedback('Copiado!',true)})
    .catch(function(){_showFeedback('Erro ao copiar.',false)});
}
function salvar(){
  var record=_vals();
  if(Object.keys(record).length===0){_showFeedback('Preencha ao menos um campo.',false);return;}
  window.parent.postMessage({type:'ecobytes-save',record:record},'*');
  _showFeedback('Enviando...',true);
}
function limpar(){(document.querySelectorAll('input,textarea') as any).forEach(function(el){el.value=''})}
</script>`,
        },
        {
            name: 'Conformidade CONAMA 420',
            description:
                'Prompt: Crie uma EcoTool que compare concentrações medidas com os valores de referência CONAMA 420 (VP e VI para solo residencial) e mostre um semáforo de conformidade por parâmetro.',
            htmlContent: `<style>
body{font-family:system-ui,sans-serif;padding:14px;color:#1a202c;font-size:12px}
h3{margin:0 0 10px;font-size:13px;color:#2d3748}
table{width:100%;border-collapse:collapse}
th{background:#edf2f7;padding:6px 8px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#4a5568}
td{padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:12px}
input{width:90%;padding:3px 5px;border:1px solid #cbd5e0;border-radius:3px;font-size:12px}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700}
.ok{background:#f0fff4;color:#276749}.warn{background:#fffbeb;color:#b7791f}.fail{background:#fff5f5;color:#9b2c2c}.nd{background:#f7fafc;color:#718096}
button{margin-top:10px;padding:5px 14px;background:#3182ce;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px}
</style>
<h3>Conformidade CONAMA 420 &#8212; Solo Residencial</h3>
<table>
<tr><th>Par&#226;metro</th><th>Medido (mg/kg)</th><th>VP</th><th>VI Res.</th><th>Status</th></tr>
<tr><td>Benzeno</td><td><input data-field-meta="true" data-field-meta-key="auto:b1" id="b1" type="number" step="0.001" placeholder="&#8212;" data-cc-change="cc-d562e487"></td><td>0.08</td><td>0.08</td><td id="s1"><span class="badge nd">&#8212;</span></td></tr>
<tr><td>Tolueno</td><td><input data-field-meta="true" data-field-meta-key="auto:b2" id="b2" type="number" step="0.01" placeholder="&#8212;" data-cc-change="cc-b964f70a"></td><td>0.03</td><td>0.03</td><td id="s2"><span class="badge nd">&#8212;</span></td></tr>
<tr><td>Chumbo</td><td><input data-field-meta="true" data-field-meta-key="auto:b3" id="b3" type="number" step="0.1" placeholder="&#8212;" data-cc-change="cc-d1675b69"></td><td>72</td><td>180</td><td id="s3"><span class="badge nd">&#8212;</span></td></tr>
<tr><td>C&#225;dmio</td><td><input data-field-meta="true" data-field-meta-key="auto:b4" id="b4" type="number" step="0.01" placeholder="&#8212;" data-cc-change="cc-356a376c"></td><td>1.3</td><td>3</td><td id="s4"><span class="badge nd">&#8212;</span></td></tr>
<tr><td>Ars&#234;nio</td><td><input data-field-meta="true" data-field-meta-key="auto:b5" id="b5" type="number" step="0.1" placeholder="&#8212;" data-cc-change="cc-2d58e1b3"></td><td>15</td><td>35</td><td id="s5"><span class="badge nd">&#8212;</span></td></tr>
</table>
<button data-cc-action="cc-5f4dd542">Avaliar todos</button>
<script>
var VP: any = [0.08,0.03,72,1.3,15],VI=[0.08,0.03,180,3,35];
/**
 * @param {any} i
 */
function upd(i: any){
  var v=+document.getElementById('b'+(i+1)).value;
  var s = (document.getElementById('s'+(i+1)) as any);
  if(!v){s.innerHTML='<span class="badge nd">&#8212;</span>';return}
  var cls=v<=VP[i]?'ok':v<=VI[i]?'warn':'fail';
  var lbl=v<=VP[i]?'OK':v<=VI[i]?'VP &lt; c &le; VI':'EXCEDE VI';
  s.innerHTML='<span class="badge '+cls+'">'+lbl+'</span>';
}
function avaliar(){for(var i=0;i<5;i++)upd(i)}
</script>`,
        },
    ];
}

/**
 * Popula 3 ferramentas de exemplo na primeira abertura do modal
 */
function _seedDefaultTools() {
    _buildSeedDefs().forEach((def: any) => {
        createEcoTool(def.name, def.description, def.htmlContent);
    });
}

/**
 * Atualiza o htmlContent das seeds padrão preservando records existentes.
 * Identifica seeds pelo nome exato - não toca ferramentas customizadas do usuário.
 */
function _migrateSeedTools() {
    const seeds = _buildSeedDefs();
    const tools = getEcoTools();
    seeds.forEach((seed: any) => {
        const existing = tools.find((t: any) => t.name === seed.name);
        if (existing && existing.htmlContent !== seed.htmlContent) {
            updateEcoTool(existing.id, { htmlContent: seed.htmlContent });
        }
    });
}

// ================================================================
// OPEN IN NEW TAB
// ================================================================

/**
 * Abre uma EcoTool em uma aba própria do browser via Blob URL.
 * Na aba, window.parent === window, então postMessage não salva no modelo -
 * o usuário vê e interage com a ferramenta de forma standalone.
 * @param {string} toolId
 */
export function openEcoToolInTab(toolId: any) {
    const tool = getEcoTools().find((t: any) => t.id === toolId);
    if (!tool) {
        showToast(t('ecoTools.ecoToolNotFoundPeriod'), 'error');
        return;
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${tool.name.replace(/</g, '&lt;')}</title>
<style>
body { font-family: system-ui, sans-serif; padding: 20px; margin: 0; color: #1a202c; max-width: 800px; }
* { box-sizing: border-box; }
</style>
</head>
<body>
${tool.htmlContent}
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const tab = window.open(url, '_blank');
    if (!tab) {
        showToast(t('ecoTools.popupBlocked'), 'warning');
    }
    // Revogar URL após 30s - tempo suficiente para o tab carregar
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ================================================================
// HELPERS
// ================================================================

/**
 * @param {any} str
 */
function _escape(str: any) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _cleanupMsgHandler() {
    if (_state.msgHandler) {
        window.removeEventListener('message', _state.msgHandler);
        _state.msgHandler = null;
    }
}

function _cleanupSandbox() {
    if (_state.sandboxWorker) {
        _state.sandboxWorker.terminate();
        _state.sandboxWorker = null;
    }
    _state.activeTool = null;
}
