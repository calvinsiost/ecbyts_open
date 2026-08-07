// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// AI Report custom template editor — sub-modal (SPEC_AI_REPORT_TEMPLATE_MARKETPLACE Fase 1, UI).
// Self-contained overlay: create/edit custom report templates persisted via aiReportBot CRUD (IDB).
// Validation via _aiReportTemplatePure (placeholder whitelist + role-injection scan + length caps).
import { t } from '../i18n/translations.js';
import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { showToast } from './toast.js';
import { createLogger } from '../helpers/logger.js';

const log = createLogger('AiReportTemplateEditor');

let _editorEl: HTMLElement | null = null;
let _onKeyHandler: ((e: KeyboardEvent) => void) | null = null;

/**
 * Open the template editor sub-modal.
 * @param opts.existing - template to edit (null = create new)
 * @param opts.onSaved - callback(template) after successful save
 */
export async function openTemplateEditor(opts: { existing?: any; onSaved?: (tpl: any) => void } = {}) {
    closeTemplateEditor();
    const existing = opts.existing || null;
    const pure: any = await import('../../core/report/_aiReportTemplatePure.js' as string);
    const whitelist: string[] = pure.PLACEHOLDER_WHITELIST || [];

    _editorEl = document.createElement('div');
    _editorEl.id = 'ai-report-template-editor';
    _editorEl.className = 'ai-report-editor-overlay';
    _editorEl.setAttribute('role', 'dialog');
    _editorEl.setAttribute('aria-modal', 'true');
    _editorEl.setAttribute('aria-label', t('aiReport.editorTitle') || 'Editor de Template');
    _editorEl.innerHTML = _render(existing, whitelist);
    document.body.appendChild(_editorEl);
    _attach(existing, whitelist, opts.onSaved);
    const firstInput = _editorEl.querySelector<HTMLInputElement>('#ai-tpl-name');
    firstInput?.focus();
    log.info('template editor opened (%s)', existing ? 'edit' : 'new');
    return _editorEl;
}

export function closeTemplateEditor() {
    if (_onKeyHandler) {
        document.removeEventListener('keydown', _onKeyHandler);
        _onKeyHandler = null;
    }
    if (_editorEl) {
        _editorEl.remove();
        _editorEl = null;
    }
}

function _render(existing: any, whitelist: string[]): string {
    const e = existing || {};
    const placeholderHint = whitelist.map((p) => `{{${p}}}`).join(' ');
    const isEdit = !!existing;
    return `
        <div class="ai-report-editor">
            <div class="ai-report-editor-header">
                <span class="ai-report-editor-title">${escapeHtml(isEdit ? (t('aiReport.editTemplate') || 'Editar Template') : (t('aiReport.newTemplate') || 'Novo Template'))}</span>
                <button type="button" class="ai-report-editor-close" aria-label="${escapeAttr(t('close') || 'Close')}">&times;</button>
            </div>
            <div class="ai-report-editor-body">
                <label class="ai-report-editor-field">
                    <span>${escapeHtml(t('aiReport.fieldName') || 'Nome')}</span>
                    <input type="text" id="ai-tpl-name" maxlength="80" value="${escapeAttr(e.name || '')}" placeholder="${escapeAttr(t('aiReport.fieldNamePlaceholder') || 'Ex: Laudo CETESB')}">
                </label>
                <label class="ai-report-editor-field">
                    <span>${escapeHtml(t('aiReport.fieldDescription') || 'Descrição')}</span>
                    <input type="text" id="ai-tpl-desc" maxlength="200" value="${escapeAttr(e.description || '')}">
                </label>
                <label class="ai-report-editor-field">
                    <span>${escapeHtml(t('aiReport.fieldSystemPrompt') || 'System Prompt')}</span>
                    <textarea id="ai-tpl-system" rows="4" maxlength="2000" placeholder="${escapeAttr(t('aiReport.fieldSystemPromptPlaceholder') || 'Instruções para a IA. Tom: {{tone}}.')}">${escapeHtml(e.systemPrompt || '')}</textarea>
                </label>
                <label class="ai-report-editor-field">
                    <span>${escapeHtml(t('aiReport.fieldUserPrompt') || 'User Prompt Template')}</span>
                    <textarea id="ai-tpl-user" rows="4" maxlength="2000" placeholder="${escapeAttr(t('aiReport.fieldUserPromptPlaceholder') || 'Site {{siteName}} com {{elementCount}} elementos.')}">${escapeHtml(e.userPromptTemplate || '')}</textarea>
                </label>
                <div class="ai-report-editor-hint">${escapeHtml(t('aiReport.placeholdersAllowed') || 'Placeholders permitidos')}: <code>${escapeHtml(placeholderHint)}</code></div>
                <label class="ai-report-editor-field">
                    <span>${escapeHtml(t('aiReport.fieldDefaultTone') || 'Tom padrão')}</span>
                    <select id="ai-tpl-tone">
                        <option value="technical" ${e.defaultTone !== 'executive' ? 'selected' : ''}>${escapeHtml(t('aiReport.toneTechnical') || 'Técnico')}</option>
                        <option value="executive" ${e.defaultTone === 'executive' ? 'selected' : ''}>${escapeHtml(t('aiReport.toneExecutive') || 'Executivo')}</option>
                    </select>
                </label>
                <div id="ai-tpl-errors" class="ai-report-editor-errors" role="alert" style="display:none"></div>
            </div>
            <div class="ai-report-editor-footer">
                <button type="button" class="btn btn-secondary ai-report-editor-cancel">${escapeHtml(t('cancel') || 'Cancelar')}</button>
                <button type="button" class="btn btn-secondary ai-report-editor-export" title="${escapeAttr(t('aiReport.exportEcbt') || 'Salvar chave .ecbt')}">${escapeHtml(t('aiReport.exportEcbt') || 'Salvar .ecbt')}</button>
                <button type="button" class="btn btn-primary ai-report-editor-save">${escapeHtml(t('save') || 'Salvar')}</button>
            </div>
        </div>
    `;
}

function _attach(existing: any, _whitelist: string[], onSaved?: (tpl: any) => void) {
    if (!_editorEl) return;
    _editorEl.querySelector('.ai-report-editor-close')?.addEventListener('click', closeTemplateEditor);
    _editorEl.querySelector('.ai-report-editor-cancel')?.addEventListener('click', closeTemplateEditor);
    _editorEl.addEventListener('click', (ev: any) => {
        if (ev.target === _editorEl) closeTemplateEditor();
    });
    _onKeyHandler = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') closeTemplateEditor();
    };
    document.addEventListener('keydown', _onKeyHandler);
    _editorEl.querySelector('.ai-report-editor-save')?.addEventListener('click', () => _save(existing, onSaved));
    _editorEl.querySelector('.ai-report-editor-export')?.addEventListener('click', () => _exportEcbt(existing));
}

function _readDraft(existing: any) {
    const q = (sel: string) => _editorEl?.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    return {
        id: existing?.id || `custom-${_safeId()}`,
        name: (q('#ai-tpl-name')?.value || '').trim(),
        description: (q('#ai-tpl-desc')?.value || '').trim(),
        systemPrompt: q('#ai-tpl-system')?.value || '',
        userPromptTemplate: q('#ai-tpl-user')?.value || '',
        defaultTone: q('#ai-tpl-tone')?.value === 'executive' ? 'executive' : 'technical',
        isCustom: true,
    };
}

/** Exporta o template custom como chave ECBT (.ecbt) e baixa o arquivo. */
async function _exportEcbt(existing: any) {
    if (!_editorEl) return;
    const draft = _readDraft(existing);
    const pure: any = await import('../../core/report/_aiReportTemplatePure.js' as string);
    const validation = pure.validateTemplateDraft(draft);
    const errBox = _editorEl.querySelector('#ai-tpl-errors') as HTMLElement | null;
    if (!validation.valid) {
        if (errBox) {
            errBox.style.display = 'block';
            errBox.innerHTML = validation.errors.map((er: string) => `<div>&#9888; ${escapeHtml(er)}</div>`).join('');
        }
        return;
    }
    if (errBox) errBox.style.display = 'none';
    await _emitTemplateEcbt(draft);
}

/** Pergunta destino (Library ecbyts | local) e salva a chave .ecbt do template. */
async function _emitTemplateEcbt(draft: any): Promise<boolean> {
    try {
        const lib: any = await import('../report/_ecbtLibraryStore.js' as string);
        const target = await lib.chooseEcbtTarget('export');
        if (!target) return false;
        const key = await buildTemplateEcbtKey(draft);
        const name = draft?.name || 'report-template';
        if (target === 'library') {
            const ok = await lib.saveEcbtToLibrary({ id: String(draft?.id || `tpl-${_slug(name)}`), kind: 'report_template', name, key });
            showToast(ok ? (t('ecbtLib.savedLibrary') || 'Salvo na Library ecbyts') : (t('aiReport.ecbtExportFailed') || 'Falha'), ok ? 'success' : 'error');
            return ok;
        }
        const blob = new Blob([key], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${_slug(name) || 'report-template'}.ecbt`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast(t('aiReport.ecbtExported') || 'Chave .ecbt salva', 'success');
        return true;
    } catch (err: any) {
        log.error('export ecbt failed:', err?.message || err);
        showToast(t('aiReport.ecbtExportFailed') || 'Falha ao gerar .ecbt', 'error');
        return false;
    }
}

/**
 * Constrói uma chave ECBT (tipo A) que carrega o template de relatório como payload.
 * Wrapper model com _kind='report_template' + elements=[] (sem família) — encodeKey
 * serializa/cifra normalmente. Importável de volta por um decoder kind-aware (Fase 2).
 */
export async function buildTemplateEcbtKey(template: any): Promise<string> {
    const { encodeKey } = await import('../../core/io/encoder.js' as string);
    const wrapper = {
        ecbyts: '2.0.0',
        _kind: 'report_template',
        reportTemplate: template,
        elements: [],
        campaigns: [],
        scenes: [],
    };
    return encodeKey(wrapper);
}

function _slug(s: string): string {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
}

async function _save(existing: any, onSaved?: (tpl: any) => void) {
    if (!_editorEl) return;
    const draft = _readDraft(existing);

    const pure: any = await import('../../core/report/_aiReportTemplatePure.js' as string);
    const validation = pure.validateTemplateDraft(draft);
    const errBox = _editorEl.querySelector('#ai-tpl-errors') as HTMLElement | null;
    if (!validation.valid) {
        if (errBox) {
            errBox.style.display = 'block';
            errBox.innerHTML = validation.errors.map((er: string) => `<div>&#9888; ${escapeHtml(er)}</div>`).join('');
        }
        return;
    }
    if (errBox) errBox.style.display = 'none';

    try {
        const bot: any = await import('../../core/report/aiReportBot.js' as string);
        await bot.saveCustomTemplate(draft);
        showToast(t('aiReport.templateSaved') || 'Template salvo', 'success');
        closeTemplateEditor();
        if (typeof onSaved === 'function') onSaved(draft);
    } catch (err: any) {
        log.error('save template failed:', err?.message || err);
        if (errBox) {
            errBox.style.display = 'block';
            errBox.textContent = `${t('aiReport.templateSaveFailed') || 'Falha ao salvar'}: ${err?.message || err}`;
        }
    }
}

/** Delete a custom template by id (used by aiReportModal card delete button). */
export async function deleteTemplate(id: string): Promise<boolean> {
    try {
        const bot: any = await import('../../core/report/aiReportBot.js' as string);
        const ok = await bot.deleteCustomTemplate(id);
        if (ok) showToast(t('aiReport.templateDeleted') || 'Template excluído', 'info');
        return ok;
    } catch (err: any) {
        log.error('delete template failed:', err?.message || err);
        showToast(t('aiReport.templateSaveFailed') || 'Falha', 'error');
        return false;
    }
}

// Crypto-free monotonic-ish id (Date.now/Math.random banned in some contexts; use counter + perf).
let _idCounter = 0;
function _safeId(): string {
    _idCounter += 1;
    const base = (typeof performance !== 'undefined' && performance.now ? Math.floor(performance.now()) : _idCounter);
    return `${base}-${_idCounter}`;
}

/** Exporta um template já salvo (por objeto) como chave .ecbt — pergunta destino. Card-level. */
export async function exportTemplateEcbt(template: any): Promise<boolean> {
    return _emitTemplateEcbt(template);
}

// Global exposure for inline onclick wiring from aiReportModal (codemod-governed; minimal footprint).
if (typeof window !== 'undefined') {
    (window as any).openAIReportTemplateEditor = openTemplateEditor;
    (window as any).deleteAIReportTemplate = deleteTemplate;
    (window as any).exportAIReportTemplateEcbt = exportTemplateEcbt;
}
