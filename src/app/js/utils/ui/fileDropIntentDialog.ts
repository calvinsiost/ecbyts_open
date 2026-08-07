// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/**
 * FILE-DROP-INTENT-001 — dialog de intenção pós-drop (M1+M2+S1).
 *
 * Pergunta ao usuário, com duas decisões INDEPENDENTES, o que fazer com o
 * arquivo solto na tela do app ou no painel do ecby:
 *   ☐ Adicionar a Files (acervo do projeto)
 *   ☐ Abrir wizard de importação (dados em tuplas)
 * Cancelar/ESC/backdrop = null (zero efeito colateral).
 *
 * Os EFEITOS da escolha são executados pelo chamador
 * (`processFileDropIntent` em utils/handlers/files.ts) — este módulo só
 * coleta a intenção. Spec: docs/specs/features/SPEC_FILE_DROP_INTENT_DIALOG.md
 */

import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { formatBytes } from '../helpers/formatBytes.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import {
    CSV_PREVIEW_READ_CAP_BYTES,
    getFileExtension,
    isTabularExtension,
    normalizeIntentChoice,
    summarizeTabularText,
} from './_fileDropIntentPure.js';
import type { IntentChoice } from './_fileDropIntentPure.js';

const LAST_CHOICE_KEY = 'ecbyts-drop-intent-last';
const OVERLAY_ID = 'fdi-overlay';

/** S1 — última escolha confirmada como pré-marcação (nunca auto-execução). */
function readLastChoice(): IntentChoice {
    try {
        const raw = localStorage.getItem(LAST_CHOICE_KEY);
        return normalizeIntentChoice(raw ? JSON.parse(raw) : null);
    } catch {
        return { addToFiles: false, openWizard: false };
    }
}

function saveLastChoice(choice: IntentChoice): void {
    try {
        safeSetItem(LAST_CHOICE_KEY, JSON.stringify(choice));
    } catch (e: any) {
        console.debug('[fileDropIntent:persist-choice]', e?.message || e);
    }
}

/**
 * M2 — preview barato e assíncrono: csv/tsv contam linhas×colunas (cap 5MB
 * de leitura); demais tipos ficam só com tipo+tamanho já renderizados.
 */
async function fillTabularPreview(file: File, el: HTMLElement): Promise<void> {
    try {
        const truncated = file.size > CSV_PREVIEW_READ_CAP_BYTES;
        const slice = truncated ? file.slice(0, CSV_PREVIEW_READ_CAP_BYTES) : file;
        const text = await slice.text();
        if (!el.isConnected) return; // dialog já fechou
        const summary = summarizeTabularText(text, { truncated });
        if (summary.rows > 0) {
            el.textContent = t('fdi.previewTabular', { rows: `~${summary.rows}`, cols: summary.cols });
        } else {
            el.textContent = '';
        }
    } catch {
        if (el.isConnected) el.textContent = '';
    }
}

/**
 * M1 — abre o dialog de intenção e resolve com a escolha confirmada ou
 * `null` (Cancelar/ESC/backdrop/✕). Multi-arquivo v1: opera no primeiro e
 * informa quantos serão ignorados.
 */
export function openFileDropIntentDialog(
    files: File[],
    opts: { wizardSupported?: boolean } = {},
): Promise<IntentChoice | null> {
    const file = files?.[0];
    if (!(file instanceof File)) return Promise.resolve(null);
    // Reentrância: um dialog já aberto → ignora o novo drop (sem fila).
    if (document.getElementById(OVERLAY_ID)) return Promise.resolve(null);

    const wizardSupported = opts.wizardSupported !== false;
    const ext = getFileExtension(file.name);
    const last = readLastChoice();
    const preAddToFiles = last.addToFiles;
    const preOpenWizard = last.openWizard && wizardSupported;
    const extraCount = Math.max(0, (files?.length || 1) - 1);

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'ecbt-overlay';
        overlay.innerHTML = `
            <div class="ecbt-dialog ecbt-dialog--sm fdi-dialog" role="dialog" aria-modal="true"
                 aria-labelledby="fdi-title">
                <div class="ecbt-header">
                    <span class="ecbt-title" id="fdi-title">${escapeHtml(t('fdi.title'))}</span>
                    <button type="button" class="ecbt-close" id="fdi-close"
                            aria-label="${escapeHtml(t('fdi.cancel'))}">&times;</button>
                </div>
                <div class="fdi-body">
                    <div class="fdi-file-row">
                        <span class="fdi-file-name">${escapeHtml(file.name)}</span>
                        <span class="fdi-file-meta">${escapeHtml(ext ? ext.toUpperCase() + ' · ' : '')}${escapeHtml(formatBytes(file.size))}</span>
                    </div>
                    <div class="fdi-preview" id="fdi-preview" aria-live="polite"></div>
                    ${extraCount > 0 ? `<div class="fdi-multi-note">${escapeHtml(t('fdi.multiIgnored', { n: extraCount }))}</div>` : ''}
                    <div class="fdi-choices">
                        <label class="fdi-choice">
                            <input type="checkbox" id="fdi-add-files" ${preAddToFiles ? 'checked' : ''}>
                            <span>${escapeHtml(t('fdi.addToFiles'))}</span>
                        </label>
                        <label class="fdi-choice ${wizardSupported ? '' : 'fdi-choice--disabled'}">
                            <input type="checkbox" id="fdi-open-wizard" aria-describedby="fdi-wizard-hint"
                                   ${preOpenWizard ? 'checked' : ''} ${wizardSupported ? '' : 'disabled'}>
                            <span>${escapeHtml(t('fdi.openWizard'))}
                                <span class="fdi-choice-hint" id="fdi-wizard-hint">${escapeHtml(
                                    wizardSupported ? t('fdi.wizardHint') : t('fdi.wizardUnsupported'),
                                )}</span>
                            </span>
                        </label>
                    </div>
                    <div class="fdi-actions">
                        <button type="button" class="btn-secondary" id="fdi-cancel">${escapeHtml(t('fdi.cancel'))}</button>
                        <button type="button" class="btn-primary" id="fdi-confirm">${escapeHtml(t('fdi.confirm'))}</button>
                    </div>
                </div>
            </div>`;

        const controller = new AbortController();
        const { signal } = controller;
        const previouslyFocused = document.activeElement as HTMLElement | null;

        const finish = (choice: IntentChoice | null) => {
            controller.abort();
            overlay.remove();
            if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                try {
                    previouslyFocused.focus();
                } catch (e: any) {
                    console.debug('[fileDropIntent:restore-focus]', e?.message || e);
                }
            }
            resolve(choice);
        };

        document.body.appendChild(overlay);
        const addFilesCb = overlay.querySelector('#fdi-add-files') as HTMLInputElement;
        const openWizardCb = overlay.querySelector('#fdi-open-wizard') as HTMLInputElement;
        const confirmBtn = overlay.querySelector('#fdi-confirm') as HTMLButtonElement;
        const cancelBtn = overlay.querySelector('#fdi-cancel') as HTMLButtonElement;
        const closeBtn = overlay.querySelector('#fdi-close') as HTMLButtonElement;
        const previewEl = overlay.querySelector('#fdi-preview') as HTMLElement;

        // Confirmar exige ≥1 intenção marcada (no-op confuso evitado).
        const syncConfirm = () => {
            confirmBtn.disabled = !addFilesCb.checked && !openWizardCb.checked;
        };
        addFilesCb.addEventListener('change', syncConfirm, { signal });
        openWizardCb.addEventListener('change', syncConfirm, { signal });
        syncConfirm();

        confirmBtn.addEventListener(
            'click',
            () => {
                const choice: IntentChoice = {
                    addToFiles: addFilesCb.checked,
                    openWizard: openWizardCb.checked && wizardSupported,
                };
                saveLastChoice(choice);
                finish(choice);
            },
            { signal },
        );
        cancelBtn.addEventListener('click', () => finish(null), { signal });
        closeBtn.addEventListener('click', () => finish(null), { signal });
        overlay.addEventListener(
            'click',
            (e) => {
                if (e.target === overlay) finish(null); // backdrop = cancel
            },
            { signal },
        );
        overlay.addEventListener(
            'keydown',
            (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    finish(null);
                    return;
                }
                // Focus-trap: Tab circula dentro do dialog (A11y §9).
                if (e.key === 'Tab') {
                    const focusables = Array.from(
                        overlay.querySelectorAll<HTMLElement>('button, input:not([disabled])'),
                    ).filter((el) => el.offsetParent !== null);
                    if (!focusables.length) return;
                    const first = focusables[0] as HTMLElement;
                    const lastEl = focusables[focusables.length - 1] as HTMLElement;
                    if (e.shiftKey && document.activeElement === first) {
                        e.preventDefault();
                        lastEl.focus();
                    } else if (!e.shiftKey && document.activeElement === lastEl) {
                        e.preventDefault();
                        first.focus();
                    }
                }
            },
            { signal },
        );

        // Foco inicial: Confirmar (spec M1); se desabilitado, primeiro checkbox.
        (confirmBtn.disabled ? addFilesCb : confirmBtn).focus();

        // M2 — preview assíncrono (dialog já visível ≤300ms com placeholder).
        if (isTabularExtension(ext) && previewEl) {
            void fillTabularPreview(file, previewEl);
        }
    });
}
