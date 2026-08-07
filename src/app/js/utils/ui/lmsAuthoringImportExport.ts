// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   LMS AUTHORING — IMPORT/EXPORT (chave ECBT, .course.json, .pptx, pacote)

   Extração MOVE-pura do bloco de import/export do lmsAuthoringModal.ts
   (TRAINING-LMS-GAPS-001 G1.2). Handlers com efeito (file pickers, chave
   ECBT, marketplace, toasts) — mesmas funções e assinaturas, zero mudança
   de comportamento. Estado vivo via live binding ESM do modal.
   ================================================================ */

import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { showToast } from './toast.js';
import { Z_INDEX } from './zIndex.js';
import {
    t,
    tf,
    LOCAL_OWNER_ID,
    authoringEditorState as _state,
    renderAuthoringModal as _render,
    clearAuthoringErrors as _clearErrors,
    markAuthoringDraftSaved as _markDraftSaved,
    emitAuthoredCoursesChanged as _emitAuthoredCoursesChanged,
    draftWithTeachingPackage as _draftWithTeachingPackage,
    seedToDraft as _seedToDraft,
} from './lmsAuthoringModal.js';
import {
    setImportedDraftIntoEditor as _setImportedDraftIntoEditor,
    focusDeckWorkbenchAfterRender as _focusDeckWorkbenchAfterRender,
} from './lmsAuthoringDeckContext.js';
import {
    exportTrainingCourseKey,
    importTrainingCourseKeyToDraft,
} from '../handlers/trainingCoursePortable.js';
import { summarizeEcbtKeyInputForPanel } from './ecbtKeyContentsPanel.js';
import {
    attachTrainingAssetFilesToDraft,
    syncTrainingAssetFilesToFiles,
    type TrainingAssetFileInput,
} from '../handlers/trainingAssets.js';
import { importPptxToCourseDraft } from '../handlers/pptxCourseImport.js';
import { getCatalogSeed } from '../../core/training/lmsContent.js';
import { getMarketplaceCatalog } from '../libraries/marketplace.js';
import { saveAuthoredCourse } from './lmsAuthoringStore.js';
import {
    INTRO_MODULE01_TEACHING_MODEL_KEY,
    isIntroModule01CourseTitle,
} from '../../core/training/teachingModelIntroModule01.js';
import { LESSON_TYPES } from '../../core/training/_courseAuthoringPure.js';
import type { CourseDraft, LessonType } from '../../core/training/_courseAuthoringPure.js';

function _slugCourse(s: unknown): string {
    return String(s || 'treinamento')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'treinamento';
}

/** Dispara o download de um texto como arquivo (chave .ecbt). */
function _downloadText(text: string, filename: string): void {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Copia um texto para a área de transferência. Usa a Clipboard API quando
 * disponível e cai num fallback execCommand('copy') (contexto não-seguro/browser
 * antigo). Retorna true se o navegador reportou sucesso.
 */
async function _copyToClipboard(text: string): Promise<boolean> {
    try {
        const clip = (navigator as any)?.clipboard;
        if (clip && typeof clip.writeText === 'function') {
            await clip.writeText(text);
            return true;
        }
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] clipboard.writeText:', e?.message || e);
    }
    // Fallback: textarea oculta + execCommand('copy').
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        ta.style.pointerEvents = 'none';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return !!ok;
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] clipboard fallback:', e?.message || e);
        return false;
    }
}

/**
 * Exporta o treinamento em edição como chave ECBT: gera a chave .ecbt do
 * CourseDraft corrente, BAIXA o arquivo `<slug>.ecbt` E copia a chave para a área
 * de transferência. O autor pode colar a chave em outro lugar OU usar o arquivo.
 * Validação leve antes (id + título): sem isso o encodeArtifact lançaria.
 */
function _packageAssetRole(fileName: string, mimeType = ''): NonNullable<TrainingAssetFileInput['role']> {
    const lower = String(fileName || '').toLowerCase();
    const mime = String(mimeType || '').toLowerCase();
    if (lower.endsWith('.ecbt')) return 'ecbt_backup';
    if (lower.endsWith('.course.json') || lower.endsWith('.json')) return 'course_json';
    if (mime.startsWith('video/') || /\.(mp4|webm|ogg)$/i.test(lower)) return 'video';
    if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(lower)) return 'slide_image';
    return 'embedded_image';
}

function _isRawPptxPackageFile(file: File): boolean {
    const name = String(file?.name || '').toLowerCase();
    const type = String(file?.type || '').toLowerCase();
    return name.endsWith('.pptx') || type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
}

function _packageAssetId(file: File, index: number): string {
    const base =
        file.name
            .replace(/\.[^.]+$/g, '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9._-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 64) || `asset-${index + 1}`;
    return `package:${base}`;
}

function _slideIndexFromPackageFile(fileName: string): number | undefined {
    const lower = String(fileName || '').toLowerCase();
    const match = lower.match(/(?:slide|pagina|page)[-_ ]*(\d{1,3})/i);
    if (!match) return undefined;
    const value = Number(match[1]);
    return Number.isInteger(value) && value > 0 ? value : undefined;
}

function _pickTrainingPackageFiles(): Promise<File[] | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = [
            '.ecbt',
            '.course.json',
            '.json',
            '.png',
            '.jpg',
            '.jpeg',
            '.webp',
            '.gif',
            '.svg',
            '.mp4',
            '.webm',
            '.ogg',
            '.pdf',
        ].join(',');
        input.style.display = 'none';
        let settled = false;
        const finish = (files: File[] | null) => {
            if (settled) return;
            settled = true;
            input.remove();
            resolve(files);
        };
        input.addEventListener('change', () => {
            finish(Array.from(input.files || []));
        });
        const onFocusBack = () => {
            window.removeEventListener('focus', onFocusBack);
            setTimeout(() => finish(null), 500);
        };
        window.addEventListener('focus', onFocusBack);
        document.body.appendChild(input);
        input.click();
    });
}

async function _onFinalizePackage(): Promise<void> {
    if (!_state) return;
    const draft = _state.draft;
    if (!draft.title || !draft.title.trim()) {
        showToast(tf('lmsAuthor.keyNeedsTitle', 'De um titulo ao treinamento antes de gerar a chave ECBT.'), 'warning');
        return;
    }
    const files = await _pickTrainingPackageFiles();
    if (!files) return;
    if (!files.length) {
        showToast(
            tf('lmsAuthor.finalPackageNoFiles', 'Selecione os arquivos da aula para enviar ao Files/Supabase.'),
            'warning',
        );
        return;
    }
    const rawPptxFiles = files.filter(_isRawPptxPackageFile);
    if (rawPptxFiles.length) {
        showToast(
            tf(
                'lmsAuthor.finalPackageRawPptxBlocked',
                'Nao envie o PowerPoint bruto. Selecione apenas imagens dos slides, videos e arquivos que a aula interna vai referenciar.',
            ),
            'warning',
        );
        return;
    }

    const assets: TrainingAssetFileInput[] = files.map((file, index) => {
        const slideIndex = _slideIndexFromPackageFile(file.name);
        const isIntroCourse = isIntroModule01CourseTitle(draft.title);
        return {
            assetId: _packageAssetId(file, index),
            file,
            role: _packageAssetRole(file.name, file.type),
            required: true,
            originalRef: file.name,
            ...(typeof slideIndex === 'number' ? { slideIndex } : {}),
            ...(isIntroCourse ? { tags: ['course:intro-module01', 'collection:gac-data-catalog', 'purpose:class-demo'] } : {}),
        };
    });

    showToast(tf('lmsAuthor.finalPackageUploading', 'Enviando arquivos da aula para Files/Supabase...'), 'info');
    let syncResult;
    try {
        syncResult = await syncTrainingAssetFilesToFiles(assets, {
            courseId: draft.id,
            deckId: isIntroModule01CourseTitle(draft.title) ? INTRO_MODULE01_TEACHING_MODEL_KEY : draft.id,
            scopeType: 'workspace',
        });
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] finalPackage sync:', e?.message || e);
        showToast(
            tf('lmsAuthor.finalPackageUploadFailed', 'Nao foi possivel enviar os arquivos para Files/Supabase.'),
            'error',
        );
        return;
    }

    if (!syncResult.ok) {
        const first = syncResult.failures[0]?.error || 'Falha ao registrar arquivo em Files.';
        showToast(
            `${tf('lmsAuthor.finalPackageUploadFailed', 'Nao foi possivel enviar os arquivos para Files/Supabase.')} ${first}`,
            'error',
        );
        return;
    }

    if (!_state) return;
    _state.draft = attachTrainingAssetFilesToDraft(_state.draft, syncResult);
    try {
        await saveAuthoredCourse(_state.draft);
        _markDraftSaved();
        _emitAuthoredCoursesChanged('final-package', _state.draft.id);
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] finalPackage save:', e?.message || e);
    }
    showToast(
        tf('lmsAuthor.finalPackageUploaded', 'Arquivos sincronizados em Files. Gerando chave ECBT final...'),
        'success',
    );
    await _onExportKey();
}

async function _onExportKey(): Promise<void> {
    if (!_state) return;
    const draft = _state.draft;
    if (!draft.title || !draft.title.trim()) {
        showToast(
            tf('lmsAuthor.keyNeedsTitle', 'Dê um título ao treinamento antes de exportar a chave ECBT.'),
            'warning',
        );
        return;
    }
    let key: string;
    const exportDraft = _draftWithTeachingPackage(draft);
    try {
        key = await exportTrainingCourseKey(exportDraft);
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] exportKey:', e?.message || e);
        showToast(tf('lmsAuthor.keyExportFailed', 'Não foi possível gerar a chave ECBT.'), 'error');
        return;
    }
    const filename = `${_slugCourse(exportDraft.title)}.ecbt`;
    try {
        await summarizeEcbtKeyInputForPanel(key, {
            sourceName: exportDraft.title || filename,
            openPanel: true,
            openModal: false,
        });
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] export key summary:', e?.message || e);
    }
    _downloadText(key, filename);
    const copied = await _copyToClipboard(key);
    showToast(
        copied
            ? tf('lmsAuthor.keyExported', 'Chave ECBT copiada e baixada.')
            : tf('lmsAuthor.keyDownloadedNoCopy', 'Chave ECBT baixada (não foi possível copiar para a área de transferência).'),
        'success',
    );
}

/**
 * Importa um treinamento a partir de uma chave ECBT. Oferece DUAS entradas:
 * 1) escolher um arquivo `.ecbt` (file picker), ou
 * 2) colar a chave num prompt (caminho do clipboard).
 * Se a chave for um treinamento válido, CARREGA o draft no editor (substitui o
 * draft em edição) e re-renderiza. Caso contrário, mostra um toast de erro.
 */
async function _onImportKey(): Promise<void> {
    await _openImportKeyModal();
}

interface TrainingKeyMarketplaceItem {
    id: string;
    title: string;
    description: string;
    sourceLabel: string;
    metadata: string;
    trainingId: string | null;
    ecbtKey: string | null;
    raw: any;
}

function _marketplaceTrainingId(item: any): string | null {
    const manifest = item?.manifest || {};
    const contents = item?.contents || manifest?.contents || {};
    const candidates = [
        item?.trainingId,
        item?.training_id,
        item?.course?.trainingId,
        item?.course?.training_id,
        contents?.course?.trainingId,
        contents?.course?.training_id,
        manifest?.trainingId,
        manifest?.training_id,
    ];
    for (const value of candidates) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    const libraryId = String(item?.library_id || item?.libraryId || manifest?.library_id || manifest?.id || item?.id || '');
    return libraryId.startsWith('course-') ? libraryId.slice('course-'.length) : null;
}

function _marketplaceEcbtKey(item: any): string | null {
    const manifest = item?.manifest || {};
    const contents = item?.contents || manifest?.contents || {};
    const candidates = [
        item?.ecbtKey,
        item?.ecbt_key,
        item?.key,
        contents?.trainingCourse?.ecbtKey,
        contents?.trainingCourse?.ecbt_key,
        manifest?.ecbtKey,
        manifest?.ecbt_key,
        manifest?.key,
        manifest?.contents?.trainingCourse?.ecbtKey,
        manifest?.contents?.trainingCourse?.ecbt_key,
    ];
    for (const value of candidates) {
        const text = typeof value === 'string' ? value.trim() : '';
        if (text.startsWith('ECBT')) return text;
    }
    return null;
}

function _normalizeMarketplaceCourseItems(items: any[]): TrainingKeyMarketplaceItem[] {
    return (Array.isArray(items) ? items : [])
        .map((item: any) => {
            const manifest = item?.manifest || {};
            const kind = item?.kind || manifest?.kind || '';
            const trainingId = _marketplaceTrainingId(item);
            const ecbtKey = _marketplaceEcbtKey(item);
            if (kind !== 'course' && !trainingId && !ecbtKey) return null;
            const title = String(item?.name || manifest?.name || item?.title || manifest?.title || trainingId || 'Curso ECBT');
            const description = String(item?.description || manifest?.description || '');
            const difficulty = String(item?.difficulty || manifest?.difficulty || '').trim();
            const lessonsCount = Number(item?.lessons_count ?? manifest?.lessons_count ?? manifest?.contents?.course?.lessons ?? 0);
            const price = Number(item?.price_cents ?? manifest?.price_cents ?? 0);
            const priceLabel = price > 0 ? `R$ ${(price / 100).toFixed(2).replace('.', ',')}` : 'gratis';
            const metadata = [difficulty, lessonsCount > 0 ? `${lessonsCount} licoes` : '', priceLabel]
                .filter(Boolean)
                .join(' | ');
            return {
                id: String(item?.library_id || item?.id || manifest?.id || trainingId || title),
                title,
                description,
                sourceLabel: item?._isRemote ? 'Marketplace' : 'Catalogo ecbyts',
                metadata,
                trainingId,
                ecbtKey,
                raw: item,
            } as TrainingKeyMarketplaceItem;
        })
        .filter((item): item is TrainingKeyMarketplaceItem => !!item);
}

function _fallbackMarketplaceCourseItems(): TrainingKeyMarketplaceItem[] {
    let seeds: any[] = [];
    try {
        seeds = [...getCatalogSeed()];
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] fallback courses:', e?.message || e);
    }
    return seeds.map((seed: any) => ({
        id: `course-${seed?.id || seed?.title || 'seed'}`,
        title: String(seed?.title || 'Curso ECBT'),
        description: String(seed?.description || ''),
        sourceLabel: 'Catalogo local',
        metadata: [
            seed?.difficulty ? String(seed.difficulty) : '',
            Array.isArray(seed?.lessons) ? `${seed.lessons.length} licoes` : '',
            'gratis',
        ]
            .filter(Boolean)
            .join(' | '),
        trainingId: typeof seed?.id === 'string' ? seed.id : null,
        ecbtKey: null,
        raw: { seedCourse: seed },
    }));
}

async function _loadMarketplaceCourseItems(): Promise<TrainingKeyMarketplaceItem[]> {
    let normalized: TrainingKeyMarketplaceItem[] = [];
    try {
        const catalog = await getMarketplaceCatalog('', {});
        normalized = _normalizeMarketplaceCourseItems(Array.isArray(catalog?.items) ? catalog.items : []);
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] marketplace import catalog:', e?.message || e);
    }
    return normalized.length ? normalized : _fallbackMarketplaceCourseItems();
}

function _renderKeyImportMarketplaceList(items: TrainingKeyMarketplaceItem[], query = ''): string {
    const q = query.trim().toLowerCase();
    const visible = items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => {
            if (!q) return true;
            return `${item.title} ${item.description} ${item.metadata} ${item.trainingId || ''}`.toLowerCase().includes(q);
        });
    if (!visible.length) {
        return `<p class="lms-author-key-empty">${escapeHtml(
            tf('lmsAuthor.importKeyNoMarketplaceResults', 'Nenhum curso encontrado no marketplace.'),
        )}</p>`;
    }
    return visible
        .map(
            ({ item, index }) => `
                <button class="lms-author-key-marketplace-item" type="button"
                    data-key-import-index="${escapeAttr(String(index))}">
                    <span class="lms-author-key-marketplace-title">${escapeHtml(item.title)}</span>
                    <span class="lms-author-key-marketplace-desc">${escapeHtml(item.description || item.sourceLabel)}</span>
                    <span class="lms-author-key-marketplace-meta">${escapeHtml(item.metadata || item.sourceLabel)}</span>
                </button>`,
        )
        .join('');
}

async function _importMarketplaceCourseItem(item: TrainingKeyMarketplaceItem): Promise<boolean> {
    if (!_state) return false;
    if (item.ecbtKey) return _loadKeyIntoEditor(item.ecbtKey);

    let seed = item.raw?.seedCourse || null;
    if (!seed && item.trainingId) {
        try {
            seed = [...getCatalogSeed()].find((course: any) => course?.id === item.trainingId) || null;
        } catch (e: any) {
            console.debug('[lmsAuthoringModal] marketplace seed lookup:', e?.message || e);
        }
    }
    if (!seed) {
        showToast(
            tf(
                'lmsAuthor.importKeyMarketplaceUnavailable',
                'Este item ainda nao possui uma chave ECBT importavel. Use arquivo local ou texto colado.',
            ),
            'error',
        );
        return false;
    }
    _state.draft = _seedToDraft(seed);
    _state.expandedLessonId = null;
    _clearErrors();
    _render();
    showToast(tf('lmsAuthor.keyImportedFromMarketplace', 'Curso carregado do marketplace.'), 'success');
    return true;
}

async function _openImportKeyModal(): Promise<void> {
    if (!_state) return;
    document.getElementById('lms-author-key-import-modal')?.remove();

    const ctl = new AbortController();
    const overlay = document.createElement('div');
    overlay.id = 'lms-author-key-import-modal';
    overlay.className = 'ecbt-overlay lms-author-key-import-overlay';
    overlay.style.zIndex = String(Z_INDEX.EXCEPTION_LMS_AUTHORING_MODAL + 2);
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'lms-author-key-import-title');
    overlay.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--sm lms-author-key-dialog" role="document" tabindex="-1">
            <div class="ecbt-header">
                <h3 class="ecbt-title" id="lms-author-key-import-title">${escapeHtml(
                    tf('lmsAuthor.importKeyTitle', 'Importar chave ECBT'),
                )}</h3>
                <button class="ecbt-close lms-author-key-close" type="button"
                    aria-label="${escapeAttr(tf('lmsAuthor.close', 'Fechar'))}">&times;</button>
            </div>
            <div class="lms-author-key-body">
                <p class="lms-author-key-lead">${escapeHtml(
                    tf(
                        'lmsAuthor.importKeyLead',
                        'Escolha uma chave do marketplace, carregue um arquivo .ecbt do computador ou cole o texto da chave.',
                    ),
                )}</p>
                <div class="lms-author-key-import-grid">
                    <section class="lms-author-key-panel" aria-label="${escapeAttr(
                        tf('lmsAuthor.importKeyMarketplace', 'Marketplace'),
                    )}">
                        <div class="lms-author-key-panel-head">
                            <h4>${escapeHtml(tf('lmsAuthor.importKeyMarketplace', 'Marketplace'))}</h4>
                            <span>${escapeHtml(tf('lmsAuthor.importKeyRecommended', 'recomendado'))}</span>
                        </div>
                        <input class="lms-author-input lms-author-key-search" type="search"
                            placeholder="${escapeAttr(tf('lmsAuthor.importKeySearch', 'Buscar curso...'))}" />
                        <div class="lms-author-key-marketplace-list" aria-live="polite">
                            <p class="lms-author-key-empty">${escapeHtml(
                                tf('lmsAuthor.importKeyLoadingMarketplace', 'Carregando cursos...'),
                            )}</p>
                        </div>
                    </section>
                    <section class="lms-author-key-panel" aria-label="${escapeAttr(
                        tf('lmsAuthor.importKeyLocal', 'Computador local'),
                    )}">
                        <div class="lms-author-key-panel-head">
                            <h4>${escapeHtml(tf('lmsAuthor.importKeyLocal', 'Computador local'))}</h4>
                        </div>
                        <button class="btn btn-primary lms-author-key-file" type="button">${escapeHtml(
                            tf('lmsAuthor.importKeyLocalFile', 'Importar arquivo .ecbt'),
                        )}</button>
                        <label class="lms-author-field">
                            <span>${escapeHtml(tf('lmsAuthor.importKeyPasteLabel', 'Ou cole o texto da chave'))}</span>
                            <textarea class="lms-author-input lms-author-textarea lms-author-key-paste"
                                rows="6" spellcheck="false" placeholder="ECBT..."></textarea>
                        </label>
                        <div class="lms-author-key-actions">
                            <button class="btn btn-secondary lms-author-key-cancel" type="button">${escapeHtml(
                                tf('lmsAuthor.cancel', 'Cancelar'),
                            )}</button>
                            <button class="btn btn-primary lms-author-key-paste-load" type="button">${escapeHtml(
                                tf('lmsAuthor.importKeyPasteAction', 'Importar texto colado'),
                            )}</button>
                        </div>
                    </section>
                </div>
            </div>
        </div>`;

    const close = () => {
        ctl.abort();
        overlay.remove();
    };

    document.body.appendChild(overlay);
    const dialog = overlay.querySelector<HTMLElement>('.lms-author-key-dialog');
    const list = overlay.querySelector<HTMLElement>('.lms-author-key-marketplace-list');
    const search = overlay.querySelector<HTMLInputElement>('.lms-author-key-search');
    const paste = overlay.querySelector<HTMLTextAreaElement>('.lms-author-key-paste');
    let items: TrainingKeyMarketplaceItem[] = [];

    const renderList = () => {
        if (!list) return;
        list.innerHTML = _renderKeyImportMarketplaceList(items, search?.value || '');
    };

    overlay.querySelector('.lms-author-key-close')?.addEventListener('click', close, { signal: ctl.signal });
    overlay.querySelector('.lms-author-key-cancel')?.addEventListener('click', close, { signal: ctl.signal });
    overlay.addEventListener(
        'click',
        (event) => {
            if (event.target === overlay) close();
        },
        { signal: ctl.signal },
    );
    document.addEventListener(
        'keydown',
        (event) => {
            if (event.key === 'Escape') close();
        },
        { signal: ctl.signal },
    );
    search?.addEventListener('input', renderList, { signal: ctl.signal });
    overlay.querySelector('.lms-author-key-file')?.addEventListener(
        'click',
        () => {
            void (async () => {
                const fromFile = await _pickKeyFile();
                if (fromFile !== null && (await _loadKeyIntoEditor(fromFile))) close();
            })();
        },
        { signal: ctl.signal },
    );
    overlay.querySelector('.lms-author-key-paste-load')?.addEventListener(
        'click',
        () => {
            void (async () => {
                const text = paste?.value || '';
                if (!text.trim()) {
                    showToast(t('lmsAuthor.importKeyPasteEmpty') || 'Cole uma chave ECBT antes de importar.', 'info');
                    paste?.focus();
                    return;
                }
                if (await _loadKeyIntoEditor(text)) close();
            })();
        },
        { signal: ctl.signal },
    );
    list?.addEventListener(
        'click',
        (event) => {
            const target = event.target as Element | null;
            const button = target?.closest('button[data-key-import-index]') as HTMLButtonElement | null;
            if (!button) return;
            const index = Number(button.dataset.keyImportIndex);
            const item = Number.isInteger(index) ? items[index] : null;
            if (!item) return;
            void (async () => {
                button.disabled = true;
                if (await _importMarketplaceCourseItem(item)) {
                    close();
                    return;
                }
                button.disabled = false;
            })();
        },
        { signal: ctl.signal },
    );

    dialog?.focus();
    void (async () => {
        items = await _loadMarketplaceCourseItems();
        if (!document.body.contains(overlay)) return;
        renderList();
    })();
}

/**
 * Abre um seletor de arquivo `.ecbt` e devolve o texto lido, ou null se o usuário
 * não escolheu arquivo (cancelou) — nesse caso o caller oferece colar a chave.
 */
async function _onImportKeyProfessorFirst(): Promise<void> {
    await _openImportKeyModal();
}

function _pickKeyFile(): Promise<string | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.ecbt,text/plain';
        input.style.display = 'none';
        let settled = false;
        const finish = (v: string | null) => {
            if (settled) return;
            settled = true;
            input.remove();
            resolve(v);
        };
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) {
                finish(null);
                return;
            }
            try {
                finish(await file.text());
            } catch (e: any) {
                console.debug('[lmsAuthoringModal] read key file:', e?.message || e);
                showToast(tf('lmsAuthor.keyReadFailed', 'Não foi possível ler o arquivo da chave.'), 'error');
                finish('');
            }
        });
        // Se o usuário fechar o diálogo sem escolher, o 'change' não dispara —
        // resolvemos como null (cancelado) após o foco voltar à janela.
        const onFocusBack = () => {
            window.removeEventListener('focus', onFocusBack);
            setTimeout(() => finish(null), 400);
        };
        window.addEventListener('focus', onFocusBack);
        document.body.appendChild(input);
        input.click();
    });
}

/**
 * Decodifica a chave e, se for um treinamento válido, substitui o draft em edição
 * e re-renderiza o editor. Toast de erro se a chave não contiver um treinamento.
 */
async function _loadKeyIntoEditor(keyText: string): Promise<boolean> {
    if (!_state) return false;
    const text = String(keyText || '').trim();
    if (!text) return false;
    let draft: CourseDraft | null = null;
    try {
        draft = await importTrainingCourseKeyToDraft(text);
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] importKey:', e?.message || e);
    }
    if (!draft) {
        showToast(tf('lmsAuthor.keyInvalid', 'A chave não contém um treinamento válido.'), 'error');
        return false;
    }
    try {
        await summarizeEcbtKeyInputForPanel(text, {
            sourceName: draft.title || 'Chave de treinamento',
            openPanel: false,
            openModal: true,
        });
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] key summary:', e?.message || e);
    }
    if (!_state) return false; // modal fechado durante o await
    _setImportedDraftIntoEditor(draft);
    _render();
    _focusDeckWorkbenchAfterRender();
    showToast(tf('lmsAuthor.keyImported', 'Treinamento importado da chave ECBT.'), 'success');
    return true;
}

// ---------------------------------------------------------------------------
// Importar curso fiel (.course.json) — caminho operacional para aula
// ---------------------------------------------------------------------------

/**
 * Importa um CourseDraft em JSON. Este é o formato gerado por
 * `scripts/pptx-to-course.mjs`, usado quando a aula precisa preservar a imagem
 * fiel de cada slide sem depender de uma chave ECBT pesada.
 */
async function _onImportCourseJson(): Promise<void> {
    if (!_state) return;
    const text = await _pickCourseJsonFile();
    if (text === null) return;
    await _loadCourseJsonIntoEditor(text);
}

async function _onImportFaithfulPackage(): Promise<void> {
    if (!_state) return;
    const text = await _pickFaithfulPackageFile();
    if (text === null) return;
    const trimmed = String(text || '').trim();
    if (!trimmed) return;
    if (trimmed.startsWith('ECBT.')) {
        await _loadKeyIntoEditor(trimmed);
        return;
    }
    await _loadCourseJsonIntoEditor(trimmed);
}

async function _onImportPptx(): Promise<void> {
    if (!_state) return;
    const file = await _pickPptxFile();
    if (!file || !_state) return;
    const base = _state.draft;
    let result: Awaited<ReturnType<typeof importPptxToCourseDraft>> | null;
    try {
        result = await importPptxToCourseDraft(file, {
            ownerId: base.ownerId || LOCAL_OWNER_ID,
            ...(base.title?.trim() ? { title: base.title.trim() } : {}),
            description: base.description || '',
            category: base.category || 'Dados Ambientais',
            difficulty: base.difficulty || 'beginner',
            language: base.language || 'pt-BR',
        });
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] import pptx:', e?.message || e);
        showToast(
            tf('lmsAuthor.pptxImportFailed', 'Nao foi possivel converter este PowerPoint para curso interno.'),
            'error',
        );
        return;
    }
    if (!_state || !result?.draft) return;
    _setImportedDraftIntoEditor(result.draft);
    _render();
    _focusDeckWorkbenchAfterRender();
    showToast(
        tf(
            'lmsAuthor.pptxImported',
            'PowerPoint importado: {slides} slides, {files} imagens em Files e {embedded} imagens embutidas.',
        )
            .replace('{slides}', String(result.summary.slideCount))
            .replace('{files}', String(result.summary.imagesInFiles))
            .replace('{embedded}', String(result.summary.imagesEmbedded)),
        'success',
    );
}

function _pickPptxFile(): Promise<File | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation';
        // WCAG 2.1 AA (1.3.1 Info & Relationships / 4.1.2 Name, Role, Value): o seletor
        // de arquivo e criado programaticamente e fica oculto (display:none), entao nao
        // herda nome acessivel do texto visivel — precisa de aria-label explicito para
        // leitores de tela anunciarem o proposito do dialogo de arquivo.
        input.setAttribute(
            'aria-label',
            tf('lmsAuthor.importPptxFileLabel', 'Selecionar arquivo PowerPoint (.pptx) para importar como curso'),
        );
        input.style.display = 'none';
        let settled = false;
        const finish = (v: File | null) => {
            if (settled) return;
            settled = true;
            input.remove();
            resolve(v);
        };
        input.addEventListener('change', () => finish(input.files?.[0] || null));
        const onFocusBack = () => {
            window.removeEventListener('focus', onFocusBack);
            setTimeout(() => finish(null), 400);
        };
        window.addEventListener('focus', onFocusBack);
        document.body.appendChild(input);
        input.click();
    });
}

function _pickCourseJsonFile(): Promise<string | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.course.package.json,.course.json,.json,application/json,text/json,text/plain';
        input.style.display = 'none';
        let settled = false;
        const finish = (v: string | null) => {
            if (settled) return;
            settled = true;
            input.remove();
            resolve(v);
        };
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) {
                finish(null);
                return;
            }
            try {
                finish(await file.text());
            } catch (e: any) {
                console.debug('[lmsAuthoringModal] read course json:', e?.message || e);
                showToast(tf('lmsAuthor.courseJsonReadFailed', 'Não foi possível ler o arquivo JSON do curso.'), 'error');
                finish('');
            }
        });
        const onFocusBack = () => {
            window.removeEventListener('focus', onFocusBack);
            setTimeout(() => finish(null), 400);
        };
        window.addEventListener('focus', onFocusBack);
        document.body.appendChild(input);
        input.click();
    });
}

function _pickFaithfulPackageFile(): Promise<string | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.ecbt,.course.package.json,.course.json,.json,application/json,text/json,text/plain';
        input.style.display = 'none';
        let settled = false;
        const finish = (v: string | null) => {
            if (settled) return;
            settled = true;
            input.remove();
            resolve(v);
        };
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) {
                finish(null);
                return;
            }
            try {
                finish(await file.text());
            } catch (e: any) {
                console.debug('[lmsAuthoringModal] read faithful package:', e?.message || e);
                showToast(tf('lmsAuthor.courseJsonReadFailed', 'Nao foi possivel ler o arquivo JSON do curso.'), 'error');
                finish('');
            }
        });
        const onFocusBack = () => {
            window.removeEventListener('focus', onFocusBack);
            setTimeout(() => finish(null), 400);
        };
        window.addEventListener('focus', onFocusBack);
        document.body.appendChild(input);
        input.click();
    });
}

const COURSE_JSON_CORE_FIELDS = Object.freeze([
    'id',
    'title',
    'description',
    'category',
    'difficulty',
    'language',
    'ownerId',
    'provenance',
    'status',
    'version',
    'supersededBy',
    'lessons',
    'pricing',
    'createdAt',
    'updatedAt',
]);

function _courseJsonPackageFields(obj: any): Record<string, unknown> {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    try {
        const cloned = JSON.parse(JSON.stringify(obj));
        if (!cloned || typeof cloned !== 'object' || Array.isArray(cloned)) return {};
        for (const key of COURSE_JSON_CORE_FIELDS) delete cloned[key];
        return cloned;
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] course json extras:', e?.message || e);
        return {};
    }
}

function _normalizeCourseJsonDraft(obj: any): CourseDraft | null {
    if (!obj || typeof obj !== 'object') return null;
    const lessons = Array.isArray(obj.lessons) ? obj.lessons : [];
    if (!String(obj.title || '').trim() || lessons.length === 0) return null;
    const now = new Date().toISOString();
    const packageFields = _courseJsonPackageFields(obj);
    return {
        ...packageFields,
        id: typeof obj.id === 'string' && obj.id.trim() ? obj.id : `course-json-${Date.now()}`,
        title: String(obj.title || ''),
        description: typeof obj.description === 'string' ? obj.description : '',
        category: typeof obj.category === 'string' ? obj.category : 'Dados Ambientais',
        difficulty: (['beginner', 'intermediate', 'advanced'].includes(obj.difficulty)
            ? obj.difficulty
            : 'beginner') as CourseDraft['difficulty'],
        language: typeof obj.language === 'string' ? obj.language : 'pt-BR',
        ownerId: typeof obj.ownerId === 'string' ? obj.ownerId : LOCAL_OWNER_ID,
        provenance: 'user_authored',
        status: 'draft',
        version: Number(obj.version) > 0 ? Math.trunc(Number(obj.version)) : 1,
        supersededBy: null,
        lessons: lessons.map((l: any, i: number) => ({
            ...l,
            id: typeof l?.id === 'string' && l.id.trim() ? l.id : `lesson-json-${i + 1}`,
            title: typeof l?.title === 'string' ? l.title : `Lição ${i + 1}`,
            type: (LESSON_TYPES.includes(l?.type) ? l.type : 'written') as LessonType,
            order: i + 1,
            minutes: Number(l?.minutes) > 0 ? Number(l.minutes) : 2,
            markdown: typeof l?.markdown === 'string' ? l.markdown : '',
        })) as CourseDraft['lessons'],
        pricing: obj.pricing && typeof obj.pricing === 'object'
            ? {
                  is_paid: !!obj.pricing.is_paid,
                  price_cents: Math.max(0, Math.round(Number(obj.pricing.price_cents) || 0)),
              }
            : { is_paid: false, price_cents: 0 },
        createdAt: typeof obj.createdAt === 'string' && obj.createdAt ? obj.createdAt : now,
        updatedAt: now,
    };
}

async function _loadCourseJsonIntoEditor(jsonText: string): Promise<void> {
    if (!_state) return;
    let draft: CourseDraft | null = null;
    try {
        draft = _normalizeCourseJsonDraft(JSON.parse(String(jsonText || '')));
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] parse course json:', e?.message || e);
    }
    if (!draft) {
        showToast(tf('lmsAuthor.courseJsonInvalid', 'O JSON não contém um curso válido.'), 'error');
        return;
    }
    _setImportedDraftIntoEditor(draft);
    _render();
    _focusDeckWorkbenchAfterRender();
    showToast(
        tf('lmsAuthor.courseJsonImported', 'Curso importado do JSON: {lessons} lições.').replace(
            '{lessons}',
            String(draft.lessons.length),
        ),
        'success',
    );
}

// Exports SEM prefixo _ (regra no-underscore-prefixed-imports) — o modal
// importa com alias de volta para os nomes históricos.
export {
    _slugCourse as slugCourse,
    _downloadText as downloadText,
    _copyToClipboard as copyToClipboard,
    _pickTrainingPackageFiles as pickTrainingPackageFiles,
    _onFinalizePackage as onFinalizePackage,
    _onExportKey as onExportKey,
    _onImportKey as onImportKey,
    _openImportKeyModal as openImportKeyModal,
    _onImportKeyProfessorFirst as onImportKeyProfessorFirst,
    _pickKeyFile as pickKeyFile,
    _loadKeyIntoEditor as loadKeyIntoEditor,
    _onImportCourseJson as onImportCourseJson,
    _onImportFaithfulPackage as onImportFaithfulPackage,
    _onImportPptx as onImportPptx,
    _loadCourseJsonIntoEditor as loadCourseJsonIntoEditor,
};
