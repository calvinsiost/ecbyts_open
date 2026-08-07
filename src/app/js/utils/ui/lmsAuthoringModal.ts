// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   LMS AUTHORING MODAL — COURSE-AUTHORING-001 F2 (editor visual)

   Editor de UI para CRIAR/EDITAR um curso autorado pelo usuário. É o
   "F2" da feature: liga a lógica pura (_courseAuthoringPure, F1) e a
   persistência (lmsAuthoringStore, store IDB offline-first) a um modal
   `.ecbt-overlay` + `.ecbt-dialog ecbt-dialog--lg` (mesmo padrão de
   photoLogModal/simulationPanel — design-tokens, sem max-width fixo).

   Estrutura do editor:
   - Metadados: título, descrição, categoria, dificuldade, idioma
     (liga via updateCourseMeta — cada edição retorna um novo draft).
   - Lista de lições: cada uma com tipo + título + ↑/↓ (reorder) + remover.
     "+ Adicionar lição" abre um type-picker (12 tipos de LESSON_TYPES) e
     gera o `id` da lição AQUI (addLesson NÃO gera id) antes de chamar addLesson.
   - Campo básico por tipo conforme o publish-gate de _courseAuthoringPure:
     written/interactive → markdown; video → URL; quiz → 1 pergunta + opções
     (marcar a correta); case → caseId; order/remediation → decisionId;
     emergency/checklist → exerciseId; classify/interpret/model-quiz → targetRef.
   - Ações: Salvar rascunho, Publicar (mostra erros POR CAMPO via aria-live),
     Pré-visualizar (stub documentado), Fechar.
   - "Meus cursos": lista de listAuthoredCourses com Editar/Arquivar +
     empty-state pedagógico.

   CSP: o modal é criado dinamicamente e a fiação usa addEventListener (lógica
   complexa permitida por CLAUDE.md), NUNCA on*= inline. Um AbortController por
   abertura cancela todos os listeners de uma vez no fechamento.

   A11y: foco entra ao abrir, ESC fecha, focus-trap no modal, aria-live nos
   erros de validação por campo.
   ================================================================ */

import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { showToast } from './toast.js';
import {
    applyAuthoringBackgroundIsolation as _applyAuthoringBackgroundIsolation,
    consumeFullscreenEscape as _consumeFullscreenEscape,
    exitFullscreenForOverlay as _exitFullscreenForOverlay,
    renderFullscreenButton as _renderFullscreenButton,
    restoreAuthoringBackgroundIsolation as _restoreAuthoringBackgroundIsolation,
    syncFullscreenControls as _syncFullscreenControlsImpl,
    wireFullscreenControls as _wireFullscreenControlsImpl,
} from './lmsAuthoringFullscreen.js';
import {
    renderQuizFields as _renderQuizFields,
    wireQuizFields as _wireQuizFieldsImpl,
    type QuizFieldsHost,
} from './lmsAuthoringQuizFields.js';
import {
    assetFileName as _assetFileName,
    assetIdForRef as _assetIdForRef,
    assetOriginPatch as _assetOriginPatch,
    assetTypeForRef as _assetTypeForRef,
    firstMarkdownImageSrc as _firstImageSrc,
    markdownAssetRefs as _markdownAssetRefs,
    normalizeAssetRef as _normalizeAssetRef,
} from './lmsAuthoringAssetRefs.js';
import {
    isIntroModule01Draft,
    shouldShowDeckWorkbench,
} from './lmsAuthoringDeckModel.js';
import {
    renderDeckWorkbench as renderDeckWorkbenchView,
} from './lmsAuthoringDeckWorkbench.js';
// Glue do Deck Workbench extraído (TRAINING-LMS-GAPS-001 G1.1) — MOVE puro.
import {
    deckWorkbenchCurrentIndexForState as _deckWorkbenchCurrentIndex,
    deckWorkbenchEditableElementIdFor as _deckWorkbenchEditableElementId,
    deckWorkbenchEditableElementsFor as _deckWorkbenchEditableElements,
    deckWorkbenchRenderContext as _deckWorkbenchRenderContext,
    deckWorkbenchSlideFromLessonDraft as _deckWorkbenchSlideFromLesson,
    deckWorkbenchSlidesForDraft as _deckWorkbenchSlides,
    deckWorkbenchVisibleSlidesFor as _deckWorkbenchVisibleSlides,
    focusDeckWorkbenchAfterRender as _focusDeckWorkbenchAfterRender,
    resolveDeckFilePreviewUrls as _resolveDeckFilePreviewUrls,
    setImportedDraftIntoEditor as _setImportedDraftIntoEditor,
    shiftDeckWorkbenchSlide as _shiftDeckWorkbenchSlide,
} from './lmsAuthoringDeckContext.js';
// Import/export extraído (TRAINING-LMS-GAPS-001 G1.2) — MOVE puro.
import {
    onFinalizePackage as _onFinalizePackage,
    onExportKey as _onExportKey,
    onImportKeyProfessorFirst as _onImportKeyProfessorFirst,
    onImportPptx as _onImportPptx,
    onImportCourseJson as _onImportCourseJson,
    onImportFaithfulPackage as _onImportFaithfulPackage,
} from './lmsAuthoringImportExport.js';
// Preview/apresentação extraído (TRAINING-LMS-GAPS-001 G1.3) — MOVE puro.
import {
    onPreview as _onPreview,
    onStartClass as _onStartClass,
} from './lmsAuthoringPresentation.js';
import { t as _t } from '../i18n/translations.js';
import { Z_INDEX } from './zIndex.js';
import { CONFIG } from '../../config.js';
import {
    emptyCourseDraft,
    addLesson,
    removeLesson,
    reorderLesson,
    updateLesson,
    updateCourseMeta,
    validateCourseForPublish,
    LESSON_TYPES,
} from '../../core/training/_courseAuthoringPure.js';
import {
    INTRO_MODULE01_TEACHING_MODEL,
    INTRO_MODULE01_TEACHING_MODEL_KEY,
    getIntroModule01Readiness,
    getIntroModule01SlidePlan,
    inferIntroModule01SlideIndex,
} from '../../core/training/teachingModelIntroModule01.js';
import {
    INTRO_MODULE01_TRAINING_MODEL,
    summarizeIntroModule01Readiness,
} from '../../core/training/_introModule01TeachingModelPure.js';
import { buildTrainingAssetManifest } from '../../core/training/trainingAssetManifestPure.js';
import { buildTrainingAssetReadiness } from '../../core/training/trainingAssetReadinessPure.js';
import { buildTrainingCourseReadinessChecklist } from '../../core/training/trainingCourseReadinessPure.js';
import type { TrainingAssetManifestAsset } from '../../core/training/trainingAssetManifestPure.js';
import type { TrainingAssetRef } from '../../core/training/trainingAssetReadinessPure.js';
import type {
    TrainingCourseReadinessChecklist,
    TrainingCourseReadinessChecklistItem,
    TrainingCourseReadinessState,
    TrainingCourseReadinessSummary,
} from '../../core/training/trainingCourseReadinessPure.js';
import type {
    CourseDraft,
    LessonDraft,
    LessonType,
    PublishError,
    DraftQuizQuestion,
} from '../../core/training/_courseAuthoringPure.js';
import {
    listAuthoredCourses,
    saveAuthoredCourse,
    loadAuthoredCourse,
    publishAuthoredCourse,
    archiveAuthoredCourse,
} from './lmsAuthoringStore.js';
// Catálogos reusados nos pickers (F3.2) — listas reais (id + título) em vez de
// input cru de id. Os catálogos são first-party, frozen e pequenos.
import { getCaseCatalog } from '../../core/training/_caseCatalogPure.js';
import { getOrderingCatalog } from '../../core/training/_orderingCatalogPure.js';
import {
    getOrderInvestigationScenario,
    getRemediationScenario,
} from '../../core/training/_decisionCatalogPure.js';
// Validação de URL de vídeo (F3.3) — reusa o parser seguro do player.
import { isYouTubeUrl } from '../../core/training/_youtubeEmbedPure.js';
// Templates first-party para "começar de um modelo" (F5.1).
import { getCatalogSeed } from '../../core/training/lmsContent.js';
// Chave ECBT do treinamento (exportar/importar o curso editado como .ecbt).
// O import com side-effect registra o kind 'training_course' no portableArtifacts.
import {
    mountTrainingSlideAppOptionsPanel,
    type TrainingSlideAppOptionInput,
    type TrainingSlideAppOptionsInput,
} from './trainingSlideAppOptions.js';

export const t = _t as any;
export const tf = (key: string, fallback: string): string => {
    const value = t(key);
    return value && value !== key ? value : fallback;
};

export const MODAL_ID = 'lms-authoring-overlay';

/** Owner id do curso autorado (espelha o learner local do lmsManager). */
export const LOCAL_OWNER_ID = 'local-user';

/**
 * True se a autoria de curso está habilitada (COURSE-AUTHORING-001 §8 Rollback).
 *
 * Rollback hatch EFETIVO: a flag `CONFIG.FEATURES.COURSE_AUTHORING` controla TODA
 * a superfície de autoria. Quando `false`, o botão "Criar aula" não é injetado
 * no painel LMS e `openCourseAuthoringModal()` degrada para no-op silencioso —
 * o consumo de cursos seed segue intacto. Mesmo precedente de
 * `isPptxImportSupported()` (LMS_PPTX_IMPORT, ADR A6).
 *
 * Checagem defensiva: só desliga com o `=== false` explícito. Se `CONFIG.FEATURES`
 * não existir (ambiente de teste/boot parcial), trata como ligada (default da
 * spec §8) para não quebrar.
 */
export function isCourseAuthoringEnabled(): boolean {
    return (CONFIG as any)?.FEATURES?.COURSE_AUTHORING !== false;
}

function _ensureAuthoringStyles(): void {
    if (typeof document === 'undefined') return;
    const links = [
        { attr: 'data-lms-author-design-css', href: '../../../../css/design-tokens.css' },
        { attr: 'data-lms-author-css', href: '../../../../css/lms-authoring.css' },
    ];
    for (const item of links) {
        if (document.querySelector(`link[${item.attr}="true"]`)) continue;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = new URL(item.href, import.meta.url).href;
        link.setAttribute(item.attr, 'true');
        document.head.appendChild(link);
    }
}

/** Rótulo legível pt-BR/i18n por tipo de lição. */
function _lessonTypeLabel(type: LessonType): string {
    const key = `lmsAuthor.lessonType.${type}`;
    const fallback: Record<LessonType, string> = {
        written: 'Texto (markdown)',
        video: 'Vídeo',
        quiz: 'Quiz',
        interactive: 'Prática interativa',
        'model-quiz': 'Quiz do modelo',
        classify: 'Classificar (VR/VP/VI)',
        interpret: 'Interpretar tendência',
        case: 'Caso interativo',
        'order-investigation': 'Ordem de investigação',
        'remediation-decision': 'Decisão de remediação',
        emergency: 'Emergência',
        checklist: 'Checklist',
    };
    const value = t(key);
    return value && value !== key ? value : fallback[type] || type;
}

function _syncVisibleEditableFieldsBeforeSave(): void {
    if (!_state || typeof document === 'undefined') return;
    const overlay = document.getElementById(MODAL_ID);
    if (!overlay) return;
    const updates = Array.from(
        overlay.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-editable-field]'),
    ).map((el) => ({
        lessonId: el.dataset.editableLessonId || '',
        elementId: el.dataset.editableElementId || '',
        field: el.dataset.editableField || '',
        value: el.value,
    }));
    for (const update of updates) {
        _applyEditableElementField(update.lessonId, update.elementId, update.field, update.value);
    }
}

// ---------------------------------------------------------------------------
// Estado do editor (uma instância por abertura)
// ---------------------------------------------------------------------------

interface EditorState {
    /** rascunho corrente (sempre substituído por um NOVO objeto a cada edição). */
    draft: CourseDraft;
    /** controla os listeners — abortado no fechamento. */
    controller: AbortController;
    /** Superfície principal: formulário de edição ou aula visual/deck. */
    surfaceMode: 'form' | 'deck';
    /** id da lição expandida no acordeão (uma por vez), ou null. */
    expandedLessonId: string | null;
    selectedEditableElementId: string | null;
    filesPreviewUrls: Record<string, string>;
    filesPreviewStatus: Record<string, 'loading' | 'ready' | 'failed'>;
    /** fingerprint do ultimo draft confirmado no store local. */
    lastSavedDraftKey: string | null;
}

interface OpenCourseAuthoringOptions {
    /** Onde o foco inicial deve cair quando o modal abrir. */
    initialFocus?: 'form' | 'deck';
    /** Slide 1-based que deve ficar selecionado quando a aula abrir pelo Workbench. */
    initialSlide?: number | null;
    /** Acao inicial opcional para atalhos vindos do painel Training. */
    startAction?: 'import-key' | 'present' | null;
}

let _state: EditorState | null = null;

// Seam do glue extraído (TRAINING-LMS-GAPS-001 G1.x): exports SEM prefixo _
// (regra no-underscore-prefixed-imports) consumidos por lmsAuthoringDeckContext.
export {
    _state as authoringEditorState,
    _lessonTypeLabel as authoringLessonTypeLabel,
    _render as renderAuthoringModal,
    _clearErrors as clearAuthoringErrors,
    _alignDeckAtAuthoringBodyTop as alignDeckAtAuthoringBodyTop,
    _shouldShowDeckWorkbench as shouldShowDeckWorkbenchForDraft,
    _courseDraftStatusLabel as courseDraftStatusLabel,
    _buildClassReadyChecklist as buildClassReadyChecklistForDraft,
    _readinessStateLabel as readinessStateLabelFor,
    _renderClassReadyBlock as renderClassReadyBlockForDraft,
    _teachingPlanToPanelData as teachingPlanToPanelData,
    _markDraftSaved as markAuthoringDraftSaved,
    _emitAuthoredCoursesChanged as emitAuthoredCoursesChanged,
    _draftWithTeachingPackage as draftWithTeachingPackage,
    _seedToDraft as seedToDraft,
    _mountTeachingSlidePanels as mountTeachingSlidePanels,
    _runDeckQuickAction as runDeckQuickAction,
    _applyEditableElementField as applyEditableElementField,
};

/** Gera um id de lição estável e único (addLesson NÃO gera — o editor deve). */
function _genLessonId(): string {
    try {
        const c: any = (globalThis as any).crypto;
        if (c && typeof c.randomUUID === 'function') return `l-${c.randomUUID()}`;
    } catch (e: any) {
        // crypto.randomUUID indisponível (contexto não-seguro/old browser) →
        // cai no id baseado em Date.now+random abaixo. Tag p/ silent-catch ratchet.
        console.debug('[lmsAuthoring:genLessonId] crypto.randomUUID indisponível', e?.message || e);
    }
    return `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function _draftPersistenceKey(draft: CourseDraft): string {
    return [draft.id, draft.version, draft.status, draft.updatedAt].map((value) => String(value || '')).join('|');
}

function _markDraftSaved(): void {
    if (!_state) return;
    _state.lastSavedDraftKey = _draftPersistenceKey(_state.draft);
}

function _isDraftSaved(draft: CourseDraft): boolean {
    return Boolean(_state?.lastSavedDraftKey && _state.lastSavedDraftKey === _draftPersistenceKey(draft));
}

function _emitAuthoredCoursesChanged(reason: string, courseId?: string): void {
    try {
        window.dispatchEvent(
            new CustomEvent('lms-authoring:courses-changed', {
                detail: {
                    reason,
                    courseId: courseId || _state?.draft?.id || null,
                },
            }),
        );
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] courses-changed:', e?.message || e);
    }
}

// ---------------------------------------------------------------------------
// Pickers de catálogo (F3.2) — listas { id, título } por tipo de lição.
// Os catálogos são first-party e frozen; aqui só lemos para popular os <select>.
// ---------------------------------------------------------------------------

interface CatalogItem {
    id: string;
    title: string;
}

/** Casos interativos disponíveis (lições 'case'). */
function _caseItems(): CatalogItem[] {
    try {
        return getCaseCatalog().map((c) => ({ id: c.id, title: c.title }));
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] caseItems:', e?.message || e);
        return [];
    }
}

/**
 * Cenários de decisão por subtipo (lições 'order-investigation' vs
 * 'remediation-decision'). O catálogo expõe só getters singulares — provamos os
 * ids seed conhecidos e descartamos os que não resolverem (resiliente a remoção).
 */
const _ORDER_INVEST_IDS = ['dec-invest-btex'] as const;
const _REMEDIATION_IDS = ['dec-remediate-btex'] as const;

function _decisionItems(lessonType: LessonType): CatalogItem[] {
    const out: CatalogItem[] = [];
    try {
        if (lessonType === 'order-investigation') {
            for (const id of _ORDER_INVEST_IDS) {
                const s = getOrderInvestigationScenario(id);
                if (s) out.push({ id: s.id, title: s.title });
            }
        } else if (lessonType === 'remediation-decision') {
            for (const id of _REMEDIATION_IDS) {
                const s = getRemediationScenario(id);
                if (s) out.push({ id: s.id, title: s.title });
            }
        }
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] decisionItems:', e?.message || e);
    }
    return out;
}

/**
 * Exercícios de ordenação por subtipo (lições 'emergency' vs 'checklist'). O
 * OrderingExercise tem `category` ('emergency'|'checklist') — filtramos por ela.
 */
function _exerciseItems(lessonType: LessonType): CatalogItem[] {
    try {
        return getOrderingCatalog()
            .filter((e: any) => e.category === lessonType)
            .map((e: any) => ({ id: e.id, title: e.title }));
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] exerciseItems:', e?.message || e);
        return [];
    }
}

/** Resolve o título legível de um id de catálogo já escolhido (ou ''). */
function _catalogTitleFor(items: CatalogItem[], id: string | undefined): string {
    if (!id) return '';
    const hit = items.find((i) => i.id === id);
    return hit ? hit.title : '';
}

function _lessonIdForInitialSlide(draft: CourseDraft, initialSlide: number | null | undefined): string | null {
    const lessons = Array.isArray(draft.lessons) ? draft.lessons : [];
    if (!lessons.length) return null;
    const slideNumber = Math.round(Number(initialSlide) || 0);
    if (!Number.isFinite(slideNumber) || slideNumber < 1) return lessons[0]?.id || null;
    return lessons[Math.min(lessons.length - 1, slideNumber - 1)]?.id || lessons[0]?.id || null;
}

// ---------------------------------------------------------------------------
// Entry point público
// ---------------------------------------------------------------------------

/**
 * Abre o editor de curso. Sem `courseId` → cria um rascunho novo
 * (emptyCourseDraft). Com `courseId` → carrega o rascunho existente (editar).
 * `initialFocus: 'deck'` é usado pela jornada do professor para cair direto no
 * Workbench visual da aula, em vez de começar no formulário de metadados.
 */
export async function openCourseAuthoringModal(
    courseId?: string,
    options: OpenCourseAuthoringOptions = {},
): Promise<void> {
    // Rollback hatch (COURSE-AUTHORING-001 §8): flag desligada → no-op silencioso,
    // sem abrir o editor. Segunda camada de defesa além da supressão do botão
    // (cobre chamada programática/deep-link). Consumo de cursos segue intacto.
    if (!isCourseAuthoringEnabled()) {
        showToast(t('lmsAuthor.toastRollout') || t('lms.toastRollout') || 'Autoria de curso em rollout — em breve.', 'info');
        return;
    }
    // Fecha qualquer instância anterior (evita listeners/overlay duplicados).
    closeCourseAuthoringModal();
    _ensureAuthoringStyles();

    let draft: CourseDraft | null = null;
    if (courseId) {
        try {
            draft = await loadAuthoredCourse(courseId);
        } catch (e: any) {
            console.debug('[lmsAuthoringModal] load:', e?.message || e);
        }
        if (!draft) {
            showToast(tf('lmsAuthor.toastNotFound', 'Curso não encontrado.'), 'warning');
            return;
        }
    } else {
        draft = emptyCourseDraft(LOCAL_OWNER_ID);
    }

    // T3.6: deck-first e o layout DEFAULT assim que o curso ja tem licoes
    // (nao exige mais initialFocus==='deck' explicito) — só um curso
    // genuinamente novo (sem licoes) abre no form/1a tela.
    const wantsDeck = options.initialFocus === 'deck' || _shouldShowDeckWorkbench(draft);
    const initialDeckLessonId =
        wantsDeck && Array.isArray(draft.lessons) && draft.lessons.length
            ? _lessonIdForInitialSlide(draft, options.initialSlide)
            : null;

    _state = {
        draft,
        controller: new AbortController(),
        surfaceMode: wantsDeck ? 'deck' : 'form',
        expandedLessonId: initialDeckLessonId,
        selectedEditableElementId: null,
        filesPreviewUrls: {},
        filesPreviewStatus: {},
        lastSavedDraftKey: courseId ? _draftPersistenceKey(draft) : null,
    };

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'ecbt-overlay';
    overlay.style.zIndex = String(Z_INDEX.EXCEPTION_LMS_AUTHORING_MODAL);
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'lms-author-title');
    document.body.appendChild(overlay);
    _applyAuthoringBackgroundIsolation(overlay);
    // Ação externa disparada de QUALQUER superfície do authoring (card tsao,
    // atalho do dock, apresentação) fecha o authoring para o módulo destino
    // ficar visível (PIPELINE-PACK-CUSTOMIZATION-WORKBENCH#1).
    _closeAuthoringAfterExternalDeckAction(overlay);

    // Clique no backdrop fecha (mas não cliques dentro do diálogo).
    overlay.addEventListener(
        'click',
        (e) => {
            if (e.target === overlay) closeCourseAuthoringModal();
        },
        { signal: _state.controller.signal },
    );

    // ESC fecha + focus-trap.
    overlay.addEventListener(
        'keydown',
        (e: KeyboardEvent) => _onKeydown(e, overlay),
        { signal: _state.controller.signal },
    );
    _render();
    _focusInitialAuthoringSurface(overlay, options.initialFocus || 'form');
    if (options.startAction === 'import-key') {
        setTimeout(() => void _onImportKeyProfessorFirst(), 0);
    } else if (options.startAction === 'present') {
        setTimeout(() => void _onStartClass(), 0);
    }
}

function _focusInitialAuthoringSurface(overlay: HTMLElement, initialFocus: OpenCourseAuthoringOptions['initialFocus']): void {
    setTimeout(() => {
        if (initialFocus === 'deck') {
            const deck = overlay.querySelector<HTMLElement>('.lms-author-deck-workbench');
            if (deck) {
                if (!deck.hasAttribute('tabindex')) deck.setAttribute('tabindex', '-1');
                if (_state?.surfaceMode !== 'deck') {
                    _alignDeckAtAuthoringBodyTop(overlay, deck);
                    requestAnimationFrame(() => _alignDeckAtAuthoringBodyTop(overlay, deck));
                    setTimeout(() => _alignDeckAtAuthoringBodyTop(overlay, deck), 50);
                }
                try {
                    deck.focus({ preventScroll: true });
                } catch (e: any) {
                    console.debug('[lmsAuthoringModal] deck focus:', e?.message || e);
                    deck.focus?.();
                }
                return;
            }
        }
        const first = overlay.querySelector<HTMLElement>('input, textarea, select, button:not([disabled])');
        (first || overlay.querySelector<HTMLElement>('.ecbt-dialog'))?.focus?.();
    }, 0);
}

function _alignDeckAtAuthoringBodyTop(overlay: HTMLElement, deck: HTMLElement): void {
    const body = overlay.querySelector<HTMLElement>('.lms-author-body');
    if (!body) {
        deck.scrollIntoView({ block: 'start' });
        return;
    }
    const deckTop = deck.getBoundingClientRect().top;
    const bodyTop = body.getBoundingClientRect().top;
    const targetTop = Math.max(0, body.scrollTop + deckTop - bodyTop - 8);
    body.scrollTo({ top: targetTop, behavior: 'auto' });
}

/** Fecha o editor e cancela todos os listeners (AbortController). */
export function closeCourseAuthoringModal(): void {
    try {
        _state?.controller.abort();
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] abort:', e?.message || e);
    }
    _exitFullscreenForOverlay(document.getElementById(MODAL_ID));
    _restoreAuthoringBackgroundIsolation();
    document.getElementById(MODAL_ID)?.remove();
    _state = null;
}

// T3.7: fullscreen + isolamento de background extraidos p/ lmsAuthoringFullscreen.ts.
// Wrappers finos que fixam MODAL_ID (o modulo extraido e generico/reutilizavel).
function _syncFullscreenControls(root: ParentNode | null = document): void {
    _syncFullscreenControlsImpl(MODAL_ID, root);
}

function _wireFullscreenControls(root: HTMLElement, signal: AbortSignal): void {
    _wireFullscreenControlsImpl(root, signal, MODAL_ID);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Re-renderiza o conteúdo do diálogo a partir do `_state.draft` corrente. */
/**
 * T3.5 — 1a tela do editor reduzida a 1 pergunta (titulo) + 1 acao primaria.
 * So se aplica ao curso genuinamente novo (sem titulo e sem licoes ainda);
 * assim que o professor comeca a preencher, o form completo volta a aparecer.
 */
function _isStartStep(d: CourseDraft): boolean {
    const lessons = Array.isArray(d.lessons) ? d.lessons : [];
    return !d.title && lessons.length === 0;
}

function _renderStartStepBody(d: CourseDraft): string {
    return `
        <label class="lms-author-field lms-author-start-step-title">
            <span>${escapeHtml(tf('lmsAuthor.fieldTitle', 'Título'))}</span>
            <input type="text" class="lms-author-input" data-meta="title"
                value="${escapeAttr(d.title)}"
                placeholder="${escapeAttr(tf('lmsAuthor.fieldTitlePh', 'Ex.: Introdução à investigação de áreas contaminadas'))}">
        </label>
        <button class="btn btn-primary lms-author-import-pptx lms-author-start-step-primary" type="button"
            title="${escapeAttr(tf('lmsAuthor.importPptxHint', 'Converter um PowerPoint em curso interno, sem guardar o PPTX bruto na chave final'))}">${escapeHtml(
            tf('lmsAuthor.importPptx', 'Importar PowerPoint'),
        )}</button>
        <details class="lms-author-deck-course-details">
            <summary>${escapeHtml('Dados do curso')}</summary>
            ${_renderMetaForm(d, true)}
        </details>`;
}

function _render(): void {
    const overlay = document.getElementById(MODAL_ID);
    if (!overlay || !_state) return;
    const d = _state.draft;
    const deckFirst = _state.surfaceMode === 'deck' && _shouldShowDeckWorkbench(d);
    const startStep = !deckFirst && _isStartStep(d);
    overlay.classList.toggle('lms-authoring-overlay--deck-first', deckFirst);
    const shellClass = deckFirst ? 'ecbt-dialog ecbt-dialog--lg lms-author lms-author--deck-first' : 'ecbt-dialog ecbt-dialog--lg lms-author';
    const title = deckFirst
        ? `${tf('lmsAuthor.visualClassTitle', 'Aula visual')}: ${d.title || tf('lmsAuthor.untitledCourse', 'Curso sem titulo')}`
        : d.title
          ? `${tf('lmsAuthor.editingTitle', 'Editando')}: ${d.title}`
          : tf('lmsAuthor.title', 'Criar aula');

    overlay.innerHTML = `
        <div class="${escapeAttr(shellClass)}" role="document" tabindex="-1">
            <div class="ecbt-header">
                <h3 class="ecbt-title" id="lms-author-title">${escapeHtml(title)}</h3>
                <button class="ecbt-close lms-author-close" type="button"
                    title="${escapeAttr(tf('lmsAuthor.close', 'Fechar'))}"
                    aria-label="${escapeAttr(tf('lmsAuthor.close', 'Fechar'))}">&times;</button>
            </div>
            <div class="ecbt-form lms-author-body${deckFirst ? ' lms-author-body--deck-first' : ''}">
                ${deckFirst ? _renderDeckFirstBody(d) : startStep ? _renderStartStepBody(d) : `${_renderMetaForm(d)}${_renderLessonsSection(d)}`}
                <p class="lms-author-errors" id="lms-author-errors" role="alert" aria-live="assertive"></p>
                ${deckFirst ? '' : _renderMyCoursesSection()}
            </div>
            ${deckFirst ? _renderDeckFirstActionBar(d) : _renderAuthorActionBar(d, startStep)}
        </div>`;

    // Carrega os cursos autorados de forma assíncrona e popula "Meus cursos".
    void _populateMyCourses();
    _mountTeachingSlidePanels(overlay as HTMLElement, d);
    _wire(overlay as HTMLElement);
    void _resolveDeckFilePreviewUrls(d);
}

function _renderDeckFirstBody(d: CourseDraft): string {
    return `
        ${_renderDeckWorkbench(d)}
        ${_renderTeachingModelSummary(d)}
        <details class="lms-author-deck-course-details">
            <summary>${escapeHtml('Dados do curso')}</summary>
            ${_renderMetaForm(d)}
        </details>`;
}

function _renderDeckFirstActionBar(d: CourseDraft): string {
    const hasLessons = Array.isArray(d.lessons) && d.lessons.length > 0;
    return `
        <div class="lms-author-actions lms-author-actions--deck-first" aria-label="${escapeAttr(tf('lmsAuthor.actionBarLabel', 'Ações da aula'))}">
            <div class="lms-author-action-guidance">
                <span>${escapeHtml('Proximo passo')}</span>
                <strong>${escapeHtml('Iniciar a apresentacao quando estiver pronto')}</strong>
                ${_renderTeacherWorkflowSteps(hasLessons, 'connect')}
            </div>
            <div class="lms-author-actions-primary">
                <button class="btn btn-secondary lms-author-save" type="button">${escapeHtml(
                    tf('lmsAuthor.saveDraft', 'Salvar rascunho'),
                )}</button>
                <button class="btn btn-primary lms-author-start-class" type="button"
                    title="${escapeAttr(tf('lmsAuthor.present.hint', 'Iniciar a apresentacao para a turma'))}">${escapeHtml(
                    tf('lmsAuthor.present.start', 'Iniciar apresentacao'),
                )}</button>
            </div>
            <details class="lms-author-more-actions">
                <summary class="btn btn-secondary" role="button">${escapeHtml(tf('lmsAuthor.moreActions', 'Mais'))}</summary>
                <div class="lms-author-more-actions-menu">
                    <button class="btn btn-secondary lms-author-back-training" type="button">${escapeHtml(
                        'Voltar aos cursos',
                    )}</button>
                    <button class="btn btn-secondary lms-author-edit-details" type="button">${escapeHtml(
                        'Editar detalhes',
                    )}</button>
                    <button class="btn btn-secondary lms-author-publish" type="button">${escapeHtml(
                        tf('lmsAuthor.publishClass', tf('lmsAuthor.publish', 'Publicar')),
                    )}</button>
                    <button class="btn btn-secondary lms-author-final-package" type="button"
                        title="${escapeAttr(tf('lmsAuthor.finalPackageHint', 'Enviar arquivos para Files/Supabase e gerar a chave ECBT final'))}">${escapeHtml(
                        tf('lmsAuthor.finalPackageShort', 'Gerar pacote Files + ECBT'),
                    )}</button>
                    <button class="btn btn-secondary lms-author-import-pptx" type="button"
                        title="${escapeAttr(tf('lmsAuthor.importPptxHint', 'Converter um PowerPoint em curso interno, sem guardar o PPTX bruto na chave final'))}">${escapeHtml(
                        tf('lmsAuthor.importPptx', 'Importar PowerPoint'),
                    )}</button>
                    <button class="btn btn-secondary lms-author-template" type="button"
                        title="${escapeAttr(tf('lmsAuthor.startFromTemplateHint', 'Começar de um curso modelo e personalizar'))}">${escapeHtml(
                        tf('lmsAuthor.startFromTemplate', 'Começar de um modelo'),
                    )}</button>
                    <button class="btn btn-secondary lms-author-preview" type="button">${escapeHtml(
                        tf('lmsAuthor.testClass', 'Testar aula'),
                    )}</button>
                    <button class="btn btn-secondary lms-author-import-course-json" type="button"
                        title="${escapeAttr(tf('lmsAuthor.importCourseJsonHint', 'Carregar um curso fiel gerado do PowerPoint (.course.json)'))}">${escapeHtml(
                        tf('lmsAuthor.importCourseJson', 'Importar curso gerado (.course.json)'),
                    )}</button>
                    <button class="btn btn-secondary lms-author-export-key" type="button"
                        title="${escapeAttr(tf('lmsAuthor.exportKeyHint', 'Gerar a chave ECBT deste treinamento (baixa o arquivo .ecbt e copia a chave)'))}">${escapeHtml(
                        tf('lmsAuthor.exportKey', 'Exportar chave ECBT'),
                    )}</button>
                    <button class="btn btn-secondary lms-author-import-key" type="button"
                        title="${escapeAttr(tf('lmsAuthor.importKeyHint', 'Carregar um treinamento a partir de uma chave ECBT (arquivo .ecbt ou texto colado)'))}">${escapeHtml(
                        tf('lmsAuthor.importKey', 'Importar chave ECBT'),
                    )}</button>
                </div>
            </details>
        </div>`;
}

function _renderAuthorActionBar(d: CourseDraft, startStep = false): string {
    const hasLessons = Array.isArray(d.lessons) && d.lessons.length > 0;
    const primaryImportClass = hasLessons ? 'btn-secondary' : 'btn-primary';
    const guidance = hasLessons ? 'Preparar ou iniciar a apresentacao' : 'Importar o PowerPoint da aula';
    return `
        <div class="lms-author-actions" aria-label="${escapeAttr(tf('lmsAuthor.actionBarLabel', 'Ações da aula'))}">
            <div class="lms-author-action-guidance">
                <span>${escapeHtml('Proximo passo')}</span>
                <strong>${escapeHtml(guidance)}</strong>
                ${_renderTeacherWorkflowSteps(hasLessons, hasLessons ? 'connect' : 'review')}
            </div>
            <div class="lms-author-actions-primary">
                ${
                    hasLessons || startStep
                        ? ''
                        : `<button class="btn ${primaryImportClass} lms-author-import-pptx" type="button"
                    title="${escapeAttr(tf('lmsAuthor.importPptxHint', 'Converter um PowerPoint em curso interno, sem guardar o PPTX bruto na chave final'))}">${escapeHtml(
                            tf('lmsAuthor.importPptx', 'Importar PowerPoint'),
                        )}</button>`
                }
                <button class="btn btn-secondary lms-author-save" type="button">${escapeHtml(
                    tf('lmsAuthor.saveDraft', 'Salvar rascunho'),
                )}</button>
                ${
                    hasLessons
                        ? `<button class="btn btn-primary lms-author-start-class" type="button"
                    title="${escapeAttr(tf('lmsAuthor.present.hint', 'Iniciar a apresentacao para a turma'))}">${escapeHtml(
                            tf('lmsAuthor.present.start', 'Iniciar apresentacao'),
                        )}</button>`
                        : ''
                }
            </div>
            <details class="lms-author-more-actions">
                <summary class="btn btn-secondary" role="button">${escapeHtml(tf('lmsAuthor.moreActions', 'Mais'))}</summary>
                <div class="lms-author-more-actions-menu">
                    ${
                        hasLessons
                            ? `<button class="btn btn-secondary lms-author-import-pptx" type="button"
                        title="${escapeAttr(tf('lmsAuthor.importPptxHint', 'Converter um PowerPoint em curso interno, sem guardar o PPTX bruto na chave final'))}">${escapeHtml(
                                tf('lmsAuthor.importPptx', 'Importar PowerPoint'),
                            )}</button>`
                            : ''
                    }
                    <button class="btn btn-secondary lms-author-preview" type="button">${escapeHtml(
                        tf('lmsAuthor.testClass', 'Testar aula'),
                    )}</button>
                    <button class="btn btn-secondary lms-author-publish" type="button">${escapeHtml(
                        tf('lmsAuthor.publishClass', tf('lmsAuthor.publish', 'Publicar')),
                    )}</button>
                    <button class="btn btn-secondary lms-author-final-package" type="button"
                        title="${escapeAttr(tf('lmsAuthor.finalPackageHint', 'Enviar arquivos para Files/Supabase e gerar a chave ECBT final'))}">${escapeHtml(
                        tf('lmsAuthor.finalPackageShort', 'Gerar pacote Files + ECBT'),
                    )}</button>
                    <button class="btn btn-secondary lms-author-template" type="button"
                        title="${escapeAttr(tf('lmsAuthor.startFromTemplateHint', 'Começar de um curso modelo e personalizar'))}">${escapeHtml(
                        tf('lmsAuthor.startFromTemplate', 'Começar de um modelo'),
                    )}</button>
                    <button class="btn btn-secondary lms-author-import-course-json" type="button"
                        title="${escapeAttr(tf('lmsAuthor.importCourseJsonHint', 'Carregar um curso fiel gerado do PowerPoint (.course.json)'))}">${escapeHtml(
                        tf('lmsAuthor.importCourseJson', 'Importar curso gerado (.course.json)'),
                    )}</button>
                    <button class="btn btn-secondary lms-author-export-key" type="button"
                        title="${escapeAttr(tf('lmsAuthor.exportKeyHint', 'Gerar a chave ECBT deste treinamento (baixa o arquivo .ecbt e copia a chave)'))}">${escapeHtml(
                        tf('lmsAuthor.exportKey', 'Exportar chave ECBT'),
                    )}</button>
                    <button class="btn btn-secondary lms-author-import-key" type="button"
                        title="${escapeAttr(tf('lmsAuthor.importKeyHint', 'Carregar um treinamento a partir de uma chave ECBT (arquivo .ecbt ou texto colado)'))}">${escapeHtml(
                        tf('lmsAuthor.importKey', 'Importar chave ECBT'),
                    )}</button>
                </div>
            </details>
        </div>`;
}

/** Form de metadados do curso (título/descrição/categoria/dificuldade/idioma). */
function _renderTeacherWorkflowSteps(hasLessons: boolean, current: 'review' | 'connect' | 'files' | 'test' | 'publish'): string {
    const order = ['review', 'connect', 'files', 'test', 'publish'];
    const currentIndex = Math.max(0, order.indexOf(current));
    const steps = [
        { key: 'review', label: 'Revisar slides' },
        { key: 'connect', label: 'Conectar modulos' },
        { key: 'files', label: 'Conferir Files' },
        { key: 'test', label: 'Testar aula' },
        { key: 'publish', label: 'Publicar pacote' },
    ];
    const items = steps
        .map((step, idx) => {
            const state =
                !hasLessons && step.key !== 'review'
                    ? 'todo'
                    : idx < currentIndex
                      ? 'done'
                      : idx === currentIndex
                        ? 'current'
                        : 'todo';
            const prefix = state === 'done' ? 'OK' : String(idx + 1);
            return `<span class="lms-author-teacher-step lms-author-teacher-step--${escapeAttr(state)}">
                <b>${escapeHtml(prefix)}</b>${escapeHtml(step.label)}
            </span>`;
        })
        .join('');
    return `<div class="lms-author-teacher-steps" aria-label="${escapeAttr('Etapas do professor')}">${items}</div>`;
}

function _renderMetaForm(d: CourseDraft, hideTitle = false): string {
    const diffOpt = (val: string, label: string) =>
        `<option value="${escapeAttr(val)}"${d.difficulty === val ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    return `
        <fieldset class="lms-author-meta">
            <legend>${escapeHtml(tf('lmsAuthor.metaLegend', 'Dados do curso'))}</legend>
            ${
                hideTitle
                    ? ''
                    : `<label class="lms-author-field">
                <span>${escapeHtml(tf('lmsAuthor.fieldTitle', 'Título'))}</span>
                <input type="text" class="lms-author-input" data-meta="title"
                    value="${escapeAttr(d.title)}"
                    placeholder="${escapeAttr(tf('lmsAuthor.fieldTitlePh', 'Ex.: Introdução à investigação de áreas contaminadas'))}">
            </label>`
            }
            <label class="lms-author-field">
                <span>${escapeHtml(tf('lmsAuthor.fieldDescription', 'Descrição'))}</span>
                <textarea class="lms-author-input lms-author-textarea" data-meta="description" rows="3"
                    placeholder="${escapeAttr(tf('lmsAuthor.fieldDescriptionPh', 'Para quem é o curso e o que o aluno vai aprender.'))}">${escapeHtml(d.description)}</textarea>
            </label>
            <div class="lms-author-row">
                <label class="lms-author-field">
                    <span>${escapeHtml(tf('lmsAuthor.fieldCategory', 'Categoria'))}</span>
                    <input type="text" class="lms-author-input" data-meta="category"
                        value="${escapeAttr(d.category)}"
                        placeholder="${escapeAttr(tf('lmsAuthor.fieldCategoryPh', 'Ex.: compliance'))}">
                </label>
                <label class="lms-author-field">
                    <span>${escapeHtml(tf('lmsAuthor.fieldDifficulty', 'Dificuldade'))}</span>
                    <select class="lms-author-input" data-meta="difficulty">
                        ${diffOpt('beginner', tf('lmsAuthor.diffBeginner', 'Iniciante'))}
                        ${diffOpt('intermediate', tf('lmsAuthor.diffIntermediate', 'Intermediário'))}
                        ${diffOpt('advanced', tf('lmsAuthor.diffAdvanced', 'Avançado'))}
                    </select>
                </label>
                <label class="lms-author-field">
                    <span>${escapeHtml(tf('lmsAuthor.fieldLanguage', 'Idioma'))}</span>
                    <input type="text" class="lms-author-input" data-meta="language"
                        value="${escapeAttr(d.language)}" placeholder="pt-BR">
                </label>
            </div>
            ${_renderPricingRow(d)}
        </fieldset>`;
}

/**
 * Marketplace bridge (F5.2): "Ofertar no marketplace" → habilita preço. O schema
 * já tem pricing.is_paid/price_cents; aqui só ligamos o checkbox e o campo de
 * preço (em reais, convertido p/ centavos). Sem oferta = curso gratuito.
 */
function _renderPricingRow(d: CourseDraft): string {
    const paid = !!d.pricing?.is_paid;
    const priceReais = paid ? (Number(d.pricing?.price_cents) || 0) / 100 : 0;
    return `
        <div class="lms-author-pricing">
            <label class="lms-author-pricing-toggle">
                <input type="checkbox" class="lms-author-pricing-paid" data-pricing="is_paid"${paid ? ' checked' : ''}>
                <span>${escapeHtml(tf('lmsAuthor.offerOnMarketplace', 'Ofertar este curso no marketplace'))}</span>
            </label>
            <p class="lms-author-pricing-hint">${escapeHtml(
                tf('lmsAuthor.offerOnMarketplaceHint', 'Sem ofertar, o curso fica gratuito. Ao ofertar, defina um preço em reais.'),
            )}</p>
            <label class="lms-author-field lms-author-price-field"${paid ? '' : ' hidden'}>
                <span>${escapeHtml(tf('lmsAuthor.priceLabel', 'Preço (R$)'))}</span>
                <input type="number" min="0" step="0.01" class="lms-author-input lms-author-price" data-pricing="price_reais"
                    value="${escapeAttr(priceReais ? String(priceReais) : '')}"
                    placeholder="${escapeAttr(tf('lmsAuthor.pricePh', 'Ex.: 49,90'))}">
            </label>
        </div>`;
}

/** Seção de lições: lista ordenável + type-picker + botão adicionar. */
function _isIntroModule01Draft(d: CourseDraft | null | undefined): boolean {
    return isIntroModule01Draft(d);
}

function _shouldShowDeckWorkbench(d: CourseDraft): boolean {
    return shouldShowDeckWorkbench(d);
}

function _courseDraftStatusLabel(status: unknown): string {
    if (status === 'published') return tf('lmsAuthor.statusPublished', 'Publicado');
    if (status === 'archived') return tf('lmsAuthor.statusArchived', 'Arquivado');
    return tf('lmsAuthor.statusDraft', 'Rascunho');
}

function _draftAssetManifestAssets(draft: CourseDraft): TrainingAssetManifestAsset[] {
    const assets: TrainingAssetManifestAsset[] = [];
    const lessons = Array.isArray(draft.lessons) ? draft.lessons : [];
    lessons.forEach((lesson, lessonIndex) => {
        const refs = _markdownAssetRefs(lesson.markdown);
        const captionsUrl = _normalizeAssetRef((lesson as any).captionsUrl);
        if (captionsUrl) refs.push(captionsUrl);
        refs.forEach((ref, assetIndex) => {
            assets.push({
                assetId: _assetIdForRef(ref, lessonIndex + 1, assetIndex),
                type: _assetTypeForRef(ref),
                required: true,
                lessonId: lesson.id,
                lessonIndex: lessonIndex + 1,
                lessonTitle: lesson.title,
                slideIndex: lessonIndex + 1,
                slideTitle: lesson.title,
                label: _assetFileName(ref) || `Slide ${lessonIndex + 1} asset`,
                ..._assetOriginPatch(ref),
            });
        });
    });
    return assets;
}

function _buildAssetReadinessFacts(draft: CourseDraft): Pick<
    TrainingCourseReadinessSummary,
    'requiredAssetsTotal' | 'missingRequiredAssetIds' | 'assetsPendingUploadIds'
> {
    const manifest = buildTrainingAssetManifest({ assets: _draftAssetManifestAssets(draft) });
    const refs: TrainingAssetRef[] = manifest.items
        .filter((item) => item.required)
        .map((item) => ({
            id: item.assetId,
            kind: 'media',
            courseId: draft.id,
            ...(typeof item.lesson?.index === 'number' ? { lessonIndex: item.lesson.index } : {}),
            mediaRef: item.assetId,
        }));
    const filesStoreMediaRefs = manifest.items
        .filter((item) => item.origins.includes('files'))
        .map((item) => item.assetId);
    const supabaseMediaRefs = manifest.items
        .filter((item) => item.origins.includes('supabase'))
        .map((item) => item.assetId);
    const requiredUploadMediaRefs = manifest.items
        .filter((item) => item.required && item.needsUpload)
        .map((item) => item.assetId);
    const readiness = buildTrainingAssetReadiness({
        refs,
        filesStoreCourseIds: [],
        filesStoreLessonIds: [],
        filesStoreMediaRefs,
        supabaseCourseIds: [],
        supabaseLessonIds: [],
        supabaseMediaRefs,
        requiredUploadMediaRefs,
    });
    const missing = readiness.items
        .filter((item) => item.state === 'missing' && !requiredUploadMediaRefs.includes(item.assetId))
        .map((item) => item.assetId);
    const pending = Array.from(
        new Set([
            ...requiredUploadMediaRefs,
            ...readiness.items
                .filter((item) => item.state === 'upload-required' || item.state === 'local-only')
                .map((item) => item.assetId),
        ]),
    );
    return {
        requiredAssetsTotal: manifest.teacherSummary.requiredAssets,
        missingRequiredAssetIds: missing,
        assetsPendingUploadIds: pending,
    };
}

function _draftTeachingPlans(draft: CourseDraft): any[] {
    if (!_isIntroModule01Draft(draft)) return [];
    const lessons = Array.isArray(draft.lessons) ? draft.lessons : [];
    return lessons
        .map((lesson, lessonIndex) => getIntroModule01SlidePlan(inferIntroModule01SlideIndex(lesson as any, lessonIndex + 1)))
        .filter(Boolean);
}

function _cloneJson<T>(value: T): T {
    try {
        return JSON.parse(JSON.stringify(value)) as T;
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] cloneJson:', e?.message || e);
        return value;
    }
}

function _buildIntroModule01TeachingModelPackage(draft: CourseDraft): Record<string, unknown> | null {
    if (!_isIntroModule01Draft(draft)) return null;
    const richModel = _cloneJson(INTRO_MODULE01_TRAINING_MODEL as any) as Record<string, unknown>;
    const uiModel = _cloneJson(INTRO_MODULE01_TEACHING_MODEL as any) as Record<string, unknown>;
    const uiReadiness = getIntroModule01Readiness();
    const readinessSummary = summarizeIntroModule01Readiness(INTRO_MODULE01_TRAINING_MODEL as any);
    return {
        ...richModel,
        key: INTRO_MODULE01_TEACHING_MODEL_KEY,
        modelKey: INTRO_MODULE01_TEACHING_MODEL_KEY,
        modulePresets: Array.isArray((richModel as any).modulePresets) ? (richModel as any).modulePresets : [],
        datasetRefs: Array.isArray((richModel as any).datasetRefs) ? (richModel as any).datasetRefs : [],
        assetRefs: Array.isArray((richModel as any).assetRefs) ? (richModel as any).assetRefs : [],
        requiredCapabilities: Array.isArray((richModel as any).requiredCapabilities)
            ? (richModel as any).requiredCapabilities
            : [],
        totalSlides: uiReadiness.totalSlides,
        centralDemos: Array.isArray(uiModel.centralDemos) ? uiModel.centralDemos : [],
        plans: _cloneJson(_draftTeachingPlans(draft)),
        uiReadiness: _cloneJson(uiReadiness),
        readinessSummary: _cloneJson(readinessSummary),
        generatedAt: new Date().toISOString(),
    };
}

function _draftWithTeachingPackage(draft: CourseDraft): CourseDraft {
    const teachingModel = _buildIntroModule01TeachingModelPackage(draft);
    if (!teachingModel) return draft;
    return {
        ...(draft as any),
        teachingModel,
    } as CourseDraft;
}

function _buildHotspotFacts(draft: CourseDraft): Pick<
    TrainingCourseReadinessSummary,
    'hotspotCount' | 'unresolvedHotspotIds'
> {
    const lessons = Array.isArray(draft.lessons) ? draft.lessons : [];
    const plans = _draftTeachingPlans(draft);
    const suggestions = plans.flatMap((plan) => (Array.isArray(plan?.suggestions) ? plan.suggestions : []));
    const plannedHotspots = suggestions.filter(
        (suggestion) => suggestion?.kind === 'open-handler' || suggestion?.handler || suggestion?.presetId,
    );
    const lessonLinks = lessons.filter(
        (lesson) =>
            _normalizeAssetRef(lesson.videoUrl) ||
            _normalizeAssetRef((lesson as any).tourId) ||
            _normalizeAssetRef((lesson as any).caseId) ||
            _normalizeAssetRef((lesson as any).decisionId) ||
            _normalizeAssetRef((lesson as any).exerciseId) ||
            _normalizeAssetRef((lesson as any).targetRef),
    );
    const unresolved = lessons
        .filter((lesson) => lesson.type === 'video' && _normalizeAssetRef(lesson.videoUrl) && !isYouTubeUrl(lesson.videoUrl || ''))
        .map((lesson, index) => lesson.id || `video-${index + 1}`);
    if (!plans.length && lessonLinks.length === 0 && unresolved.length === 0) {
        return { hotspotCount: null, unresolvedHotspotIds: [] };
    }
    return {
        hotspotCount: plannedHotspots.length + lessonLinks.length,
        unresolvedHotspotIds: unresolved,
    };
}

function _buildFallbackFacts(draft: CourseDraft): Pick<
    TrainingCourseReadinessSummary,
    'fallbackCount' | 'missingFallbackIds'
> {
    const suggestions = _draftTeachingPlans(draft).flatMap((plan) =>
        Array.isArray(plan?.suggestions) ? plan.suggestions : [],
    );
    if (!suggestions.length) return { fallbackCount: null, missingFallbackIds: [] };
    return {
        fallbackCount: suggestions.filter((suggestion) => _normalizeAssetRef(suggestion?.fallback)).length,
        missingFallbackIds: suggestions
            .filter((suggestion) => !_normalizeAssetRef(suggestion?.fallback))
            .map((suggestion, index) => _normalizeAssetRef(suggestion?.id) || `fallback-${index + 1}`),
    };
}

function _buildClassReadyChecklist(draft: CourseDraft): TrainingCourseReadinessChecklist {
    const lessons = Array.isArray(draft.lessons) ? draft.lessons : [];
    const isIntroModule01 = _isIntroModule01Draft(draft);
    const modelReadiness = isIntroModule01 ? getIntroModule01Readiness() : null;
    const summary: TrainingCourseReadinessSummary = {
        title: draft.title,
        expectedItemCount: modelReadiness ? modelReadiness.totalSlides : null,
        ecbtModelApplied: isIntroModule01 ? true : null,
        ecbtModelId: isIntroModule01 ? INTRO_MODULE01_TEACHING_MODEL_KEY : null,
        expectedEcbtModelId: INTRO_MODULE01_TEACHING_MODEL_KEY,
        slideCount: lessons.length,
        lessonCount: lessons.length,
        ..._buildAssetReadinessFacts(draft),
        ..._buildHotspotFacts(draft),
        ..._buildFallbackFacts(draft),
        saved: _isDraftSaved(draft),
        published: draft.status === 'published',
    };
    return buildTrainingCourseReadinessChecklist(summary);
}

function _readinessStateLabel(state: TrainingCourseReadinessState): string {
    if (state === 'pronto') return 'Pronto';
    if (state === 'atencao') return 'Atenção';
    return 'Bloqueado';
}

function _renderClassReadyItem(item: TrainingCourseReadinessChecklistItem): string {
    return `
        <li class="lms-author-class-ready-item lms-author-class-ready-item--${escapeAttr(item.state)}">
            <span class="lms-author-class-ready-dot" aria-hidden="true"></span>
            <div>
                <strong>${escapeHtml(item.label)}</strong>
                <span>${escapeHtml(item.message)}</span>
            </div>
            <em>${escapeHtml(_readinessStateLabel(item.state))}</em>
        </li>`;
}

function _renderClassReadyBlock(draft: CourseDraft): string {
    const checklist = _buildClassReadyChecklist(draft);
    const items = checklist.items.map(_renderClassReadyItem).join('');
    return `
        <section class="lms-author-class-ready lms-author-class-ready--${escapeAttr(checklist.state)}"
            aria-label="${escapeAttr('Pronto para aula')}">
            <div class="lms-author-class-ready-head">
                <span class="lms-author-deck-kicker">${escapeHtml('Pronto para aula')}</span>
                <strong>${escapeHtml(_readinessStateLabel(checklist.state))}</strong>
                <span>${escapeHtml(`${checklist.counts.pronto}/${checklist.counts.total} itens prontos`)}</span>
            </div>
            <p>${escapeHtml(checklist.teacherSummary)}</p>
            <ul>${items}</ul>
            <small>${escapeHtml(
                'Itens pendentes usam apenas o draft/modelo atual. Salve, publique e confira Files/Supabase antes de tratar a aula como pronta.',
            )}</small>
        </section>`;
}

function _renderDeckWorkbench(d: CourseDraft): string {
    if (!_shouldShowDeckWorkbench(d)) return '';
    const slides = _deckWorkbenchSlides(d);
    if (!slides.length) return '';
    const currentIndex = _deckWorkbenchCurrentIndex(slides);
    const visibleSlides = _deckWorkbenchVisibleSlides(slides, currentIndex);
    return renderDeckWorkbenchView({
        draft: d,
        slides,
        currentIndex,
        visibleSlides,
        context: _deckWorkbenchRenderContext(),
    });
}

function _renderTeachingModelSummary(d: CourseDraft): string {
    if (!_isIntroModule01Draft(d)) return '';
    const readiness = getIntroModule01Readiness();
    return `
        <div class="lms-author-teaching-summary" data-teaching-model-key="${escapeAttr(INTRO_MODULE01_TEACHING_MODEL_KEY)}">
            <div class="lms-author-teaching-summary-main">
                <strong>${escapeHtml('Modelo da aula conectado')}</strong>
                <span>${escapeHtml('Abra uma licao/slide para ver atalhos do app, checkpoints e fallbacks didaticos.')}</span>
            </div>
            <div class="lms-author-teaching-summary-chips" aria-label="${escapeAttr('Resumo do modelo da aula')}">
                <span>${escapeHtml(`${readiness.mappedSlides}/${readiness.totalSlides} slides mapeados`)}</span>
                <span>${escapeHtml(`${readiness.centralDemos} demos centrais`)}</span>
                <span>${escapeHtml(`${readiness.directOpenActions} acoes diretas`)}</span>
            </div>
            <code>${escapeHtml(INTRO_MODULE01_TEACHING_MODEL_KEY)}</code>
        </div>`;
}

function _renderLessonsSection(d: CourseDraft): string {
    const lessons = Array.isArray(d.lessons) ? d.lessons : [];
    const list = lessons.length
        ? lessons.map((l, i) => _renderLessonItem(l, i, lessons.length)).join('')
        : `<p class="lms-author-lessons-empty">${escapeHtml(
              tf('lmsAuthor.lessonsEmpty', 'Nenhuma lição ainda. Adicione a primeira abaixo.'),
          )}</p>`;

    const typeOptions = LESSON_TYPES.map(
        (ty) => `<option value="${escapeAttr(ty)}">${escapeHtml(_lessonTypeLabel(ty))}</option>`,
    ).join('');

    return `
        <fieldset class="lms-author-lessons">
            <legend>${escapeHtml(tf('lmsAuthor.lessonsLegend', 'Lições'))} (${lessons.length})</legend>
            ${_renderTeachingModelSummary(d)}
            ${_renderDeckWorkbench(d)}
            <div class="lms-author-lesson-list">${list}</div>
            <div class="lms-author-add-row">
                <label class="lms-author-field lms-author-add-type">
                    <span class="lms-sr-only">${escapeHtml(tf('lmsAuthor.addType', 'Tipo da nova lição'))}</span>
                    <select class="lms-author-input lms-author-new-type"
                        aria-label="${escapeAttr(tf('lmsAuthor.addType', 'Tipo da nova lição'))}">${typeOptions}</select>
                </label>
                <button type="button" class="btn btn-secondary lms-author-add-lesson">${escapeHtml(
                    tf('lmsAuthor.addLesson', '+ Adicionar lição'),
                )}</button>
            </div>
        </fieldset>`;
}

/** Um item da lista de lições (cabeçalho + corpo expansível por tipo). */
function _renderLessonItem(l: LessonDraft, idx: number, total: number): string {
    const expanded = _state?.expandedLessonId === l.id;
    const upDis = idx === 0 ? ' disabled' : '';
    const downDis = idx === total - 1 ? ' disabled' : '';
    const titleLabel = l.title || `${tf('lmsAuthor.lessonNoTitle', 'Lição sem título')}`;
    return `
        <div class="lms-author-lesson${expanded ? ' lms-author-lesson--open' : ''}" data-lesson-id="${escapeAttr(l.id)}">
            <div class="lms-author-lesson-head">
                <span class="lms-author-lesson-order">${idx + 1}</span>
                <span class="lms-author-lesson-type-badge">${escapeHtml(_lessonTypeLabel(l.type))}</span>
                <button type="button" class="lms-author-lesson-toggle" aria-expanded="${expanded ? 'true' : 'false'}"
                    title="${escapeAttr(tf('lmsAuthor.editLesson', 'Editar lição'))}">${escapeHtml(titleLabel)}</button>
                <span class="lms-author-lesson-btns">
                    <button type="button" class="lms-author-lesson-up" data-lesson-id="${escapeAttr(l.id)}"${upDis}
                        aria-label="${escapeAttr(tf('lmsAuthor.moveUp', 'Subir lição'))}" title="${escapeAttr(tf('lmsAuthor.moveUp', 'Subir lição'))}">&#9650;</button>
                    <button type="button" class="lms-author-lesson-down" data-lesson-id="${escapeAttr(l.id)}"${downDis}
                        aria-label="${escapeAttr(tf('lmsAuthor.moveDown', 'Descer lição'))}" title="${escapeAttr(tf('lmsAuthor.moveDown', 'Descer lição'))}">&#9660;</button>
                    <button type="button" class="lms-author-lesson-remove" data-lesson-id="${escapeAttr(l.id)}"
                        aria-label="${escapeAttr(tf('lmsAuthor.removeLesson', 'Remover lição'))}" title="${escapeAttr(tf('lmsAuthor.removeLesson', 'Remover lição'))}">&times;</button>
                </span>
            </div>
            ${expanded ? `<div class="lms-author-lesson-body">${_renderLessonFields(l)}</div>` : ''}
        </div>`;
}

/** Campos editáveis de uma lição conforme o tipo (publish-gate de F1). */
function _renderLessonFields(l: LessonDraft): string {
    const common = `
        <label class="lms-author-field">
            <span>${escapeHtml(tf('lmsAuthor.lessonTitle', 'Título da lição'))}</span>
            <input type="text" class="lms-author-input" data-lesson-field="title"
                value="${escapeAttr(l.title)}" placeholder="${escapeAttr(tf('lmsAuthor.lessonTitlePh', 'Ex.: O que é VR, VP e VI'))}">
        </label>
        <label class="lms-author-field">
            <span>${escapeHtml(tf('lmsAuthor.lessonMinutes', 'Duração (minutos)'))}</span>
            <input type="number" min="1" step="1" class="lms-author-input lms-author-minutes" data-lesson-field="minutes"
                value="${escapeAttr(String(l.minutes ?? 0))}">
        </label>`;

    let typed = '';
    switch (l.type) {
        case 'written':
        case 'interactive':
            typed = `
                <label class="lms-author-field">
                    <span>${escapeHtml(tf('lmsAuthor.lessonMarkdown', 'Conteúdo (markdown)'))}</span>
                    <textarea class="lms-author-input lms-author-textarea" data-lesson-field="markdown" rows="5"
                        placeholder="${escapeAttr(tf('lmsAuthor.lessonMarkdownPh', '## Título\\n\\nTexto da lição em **markdown**...'))}">${escapeHtml(l.markdown || '')}</textarea>
                </label>`;
            break;
        case 'video':
            typed = _renderVideoFields(l);
            break;
        case 'quiz':
            typed = _renderQuizFields(l);
            break;
        case 'case':
            typed = _catalogPickerField(
                'caseId',
                l.caseId,
                _caseItems(),
                tf('lmsAuthor.lessonCaseId', 'Caso interativo'),
                tf('lmsAuthor.pickCase', 'Escolha um caso do catálogo'),
            );
            break;
        case 'order-investigation':
        case 'remediation-decision':
            typed = _catalogPickerField(
                'decisionId',
                l.decisionId,
                _decisionItems(l.type),
                tf('lmsAuthor.lessonDecisionId', 'Cenário de decisão'),
                tf('lmsAuthor.pickDecision', 'Escolha um cenário do catálogo'),
            );
            break;
        case 'emergency':
        case 'checklist':
            typed = _catalogPickerField(
                'exerciseId',
                l.exerciseId,
                _exerciseItems(l.type),
                tf('lmsAuthor.lessonExerciseId', 'Exercício de ordenação'),
                tf('lmsAuthor.pickExercise', 'Escolha um exercício do catálogo'),
            );
            break;
        case 'classify':
        case 'interpret':
        case 'model-quiz':
            typed = _renderTargetField(l);
            break;
    }
    return common + typed;
}

/** Monta os atalhos do slide atual nos hosts do Deck Workbench. */
function _mountTeachingSlidePanels(overlay: HTMLElement, d: CourseDraft): void {
    if (!_isIntroModule01Draft(d)) return;
    overlay.querySelectorAll<HTMLElement>('.lms-author-teaching-panel-mount').forEach((host) => {
        const slideIndex = Math.max(1, Math.round(Number(host.dataset.slideIndex) || 1));
        const plan = getIntroModule01SlidePlan(slideIndex);
        if (!plan) return;
        mountTrainingSlideAppOptionsPanel(host, _teachingPlanToPanelData(plan), {
            windowRef: window as any,
            onFallback: (result) => showToast(result.message, 'warning'),
        });
    });
}

function _teachingPlanToPanelData(plan: any): TrainingSlideAppOptionsInput {
    const options = Array.isArray(plan.suggestions)
        ? plan.suggestions.map((suggestion: any, idx: number) =>
              _teachingSuggestionToAppOption(suggestion, idx, Math.max(1, Math.round(Number(plan.slide) || 1))),
          )
        : [];
    return {
        slideNumber: plan.slide,
        title: plan.title,
        intro: `${plan.focus} Layout sugerido: ${plan.layout}.`,
        teacherGuide: Array.isArray(plan.teacherGuide) ? plan.teacherGuide : [],
        options,
    };
}

function _teachingSuggestionToAppOption(
    suggestion: any,
    idx: number,
    slideNumber: number,
): TrainingSlideAppOptionInput {
    const kind = String(suggestion.kind || 'open-handler');
    const title = String(suggestion.label || `Opcao ${idx + 1}`);
    const description = String(suggestion.description || '');
    const fallbackText = String(suggestion.fallback || 'Use o slide ou snapshot como fallback didatico.');
    const presetId = String(suggestion.presetId || suggestion.id || '');
    const meta = [presetId, suggestion.priority ? `prioridade: ${suggestion.priority}` : ''].filter(Boolean);

    if (kind === 'poll') {
        return {
            id: suggestion.id,
            type: 'poll',
            title,
            question: description || title,
            choices: ['A', 'B', 'Depende da evidencia'],
            fallbackText,
            meta,
        };
    }
    if (kind === 'reveal' || kind === 'concept') {
        return {
            id: suggestion.id,
            type: 'reveal',
            title,
            description,
            actionLabel: 'Revelar orientacao',
            revealText: fallbackText,
            fallbackText,
            meta,
        };
    }
    if (kind === 'resource') {
        return {
            id: suggestion.id,
            type: 'resource',
            title,
            description,
            actionLabel: 'Abrir recurso',
            fallbackText,
            meta,
        };
    }
    if (kind === 'snapshot') {
        return {
            id: suggestion.id,
            type: 'snapshot',
            title,
            description,
            actionLabel: 'Mostrar snapshot',
            fallbackText,
            meta,
        };
    }
    return {
        id: suggestion.id,
        type: 'open-handler',
        title,
        description,
        handler: suggestion.handler,
        args: _teachingHandlerArgs(suggestion, slideNumber),
        actionLabel: _teachingActionLabel(suggestion),
        fallbackText,
        fallbackAssetId: suggestion.fallbackAssetId,
        meta,
    };
}

function _teachingActionLabel(suggestion: any): string {
    const handler = String(suggestion.handler || '');
    const presetId = String(suggestion.presetId || suggestion.id || '').toLowerCase();
    const title = String(suggestion.label || '').toLowerCase();
    if (handler === 'handleOpenDataStudio') return 'Abrir DataStudio';
    if (handler === 'handleOpenFiles') return 'Abrir Files da aula';
    if (handler === 'handleOpenProjectGantt' || presetId.includes('gantt')) return 'Abrir Gantt da aula';
    if (handler === 'handleOpenTemporalAnalysis' || presetId.includes('mann-kendall')) return 'Abrir Mann-Kendall';
    if (handler === 'handleOpenPipelineManager' || presetId.includes('gac') || title.includes('gac')) {
        return 'Abrir fluxo GAC';
    }
    return 'Abrir no app';
}

function _teachingHandlerArgs(suggestion: any, slideNumber: number): readonly unknown[] {
    const handler = String(suggestion.handler || '');
    const presetId = String(suggestion.presetId || suggestion.id || '');
    const slide = Math.max(1, Math.round(Number(slideNumber) || 1));
    if (handler === 'handleOpenDataStudio') {
        const lowered = presetId.toLowerCase();
        const module = lowered.includes('radar')
            ? 'radar'
            : lowered.includes('processing') || lowered.includes('validation')
              ? 'processing'
              : 'analytics';
        return [
            Object.freeze({
                module,
                source: 'training',
                course: 'intro-module01',
                slide,
                presetId,
                label: 'DataStudio da aula',
                purpose: 'class-demo',
                returnLabel: 'Voltar ao slide',
            }),
        ];
    }
    if (handler === 'handleOpenPipelineManager' && presetId) {
        const nodeId = String(suggestion.nodeId || '').trim();
        const templateId = String(
            suggestion.templateId ||
                (presetId.includes('gac') ? 'gac-dd38-environmental-management' : ''),
        ).trim();
        return [
            Object.freeze({
                target: presetId,
                presetId,
                ...(templateId ? { templateId } : {}),
                ...(nodeId ? { nodeId } : {}),
                source: 'training',
                course: 'intro-module01',
                slide,
                label: 'Fluxo GAC da aula',
                purpose: 'class-demo',
                returnLabel: 'Voltar ao slide',
            }),
        ];
    }
    if (handler === 'handleOpenProjectGantt') {
        const rawProjectId = String(
            suggestion.projectId || suggestion.templateId || suggestion.target || 'template:intro-module01-aula',
        );
        const projectId = rawProjectId === 'm01.agile.gantt' ? 'template:intro-module01-aula' : rawProjectId;
        return [
            Object.freeze({
                projectId,
                presetId: presetId || 'm01.agile.gantt',
                source: 'training',
                course: 'intro-module01',
                slide,
                label: 'Gantt da aula',
                purpose: 'class-demo',
                returnLabel: 'Voltar ao slide',
            }),
        ];
    }
    if (handler === 'handleOpenTemporalAnalysis') {
        return [
            Object.freeze({
                elementId: suggestion.elementId || 'template:pm-na-class-series',
                parameterId: suggestion.parameterId || 'water-level',
                method: suggestion.method || 'mannKendall',
                mode: suggestion.mode || 'explain',
                source: 'training',
                course: 'intro-module01',
                slide,
                presetId: presetId || 'm01.temporal.na.mann-kendall',
                label: 'Mann-Kendall da aula',
                purpose: 'class-demo',
                returnLabel: 'Voltar ao slide',
            }),
        ];
    }
    return [];
}

function _catalogPickerField(
    field: string,
    value: string | undefined,
    items: CatalogItem[],
    label: string,
    placeholder: string,
): string {
    if (!items.length) {
        return `
            <label class="lms-author-field">
                <span>${escapeHtml(label)}</span>
                <p class="lms-author-picker-empty">${escapeHtml(
                    tf('lmsAuthor.noCatalogItem', 'Nenhum item de catálogo disponível para este tipo.'),
                )}</p>
            </label>`;
    }
    const chosenTitle = _catalogTitleFor(items, value);
    const opts = [
        `<option value=""${value ? '' : ' selected'} disabled>${escapeHtml(placeholder)}</option>`,
        ...items.map(
            (it) =>
                `<option value="${escapeAttr(it.id)}"${it.id === value ? ' selected' : ''}>${escapeHtml(it.title)}</option>`,
        ),
    ].join('');
    return `
        <label class="lms-author-field">
            <span>${escapeHtml(label)}</span>
            <select class="lms-author-input lms-author-catalog-pick" data-lesson-field="${escapeAttr(field)}">
                ${opts}
            </select>
            <span class="lms-author-picker-chosen"${chosenTitle ? '' : ' hidden'}>${
                chosenTitle
                    ? `${escapeHtml(tf('lmsAuthor.pickedTitle', 'Selecionado'))}: ${escapeHtml(chosenTitle)}`
                    : ''
            }</span>
        </label>`;
}

/** Campos do tipo 'video' (F3.3): URL validada + transcrição. */
function _renderVideoFields(l: LessonDraft): string {
    const url = l.videoUrl || '';
    const valid = url ? isYouTubeUrl(url) : null; // null = ainda vazio
    const badge =
        valid === null
            ? ''
            : valid
              ? `<span class="lms-author-video-valid">${escapeHtml(tf('lmsAuthor.lessonVideoValid', 'URL de YouTube válida.'))}</span>`
              : `<span class="lms-author-video-invalid">${escapeHtml(tf('lmsAuthor.lessonVideoInvalid', 'URL não reconhecida como vídeo do YouTube.'))}</span>`;
    return `
        <label class="lms-author-field">
            <span>${escapeHtml(tf('lmsAuthor.lessonVideoUrl', 'URL do vídeo (YouTube)'))}</span>
            <input type="url" class="lms-author-input lms-author-video-url" data-lesson-field="videoUrl"
                value="${escapeAttr(url)}" placeholder="https://www.youtube.com/watch?v=...">
            <span class="lms-author-video-badge" aria-live="polite">${badge}</span>
        </label>
        <label class="lms-author-field">
            <span>${escapeHtml(tf('lmsAuthor.lessonTranscript', 'Transcrição (acessibilidade)'))}</span>
            <textarea class="lms-author-input lms-author-textarea" data-lesson-field="transcript" rows="3"
                placeholder="${escapeAttr(tf('lmsAuthor.lessonTranscriptPh', 'Transcrição textual do vídeo (WCAG 1.2.2).'))}">${escapeHtml(l.transcript || '')}</textarea>
        </label>`;
}

/**
 * Campo de alvo (F3.4) para classify/interpret/model-quiz: o autor informa qual
 * parâmetro/poço/modelo a lição avalia. Input livre com placeholder claro (o que
 * é o alvo depende do tipo). O publish-gate só exige que esteja preenchido.
 */
function _renderTargetField(l: LessonDraft): string {
    const ph =
        l.type === 'model-quiz'
            ? tf('lmsAuthor.lessonTargetModel', 'Ex.: poços acima do VR no modelo atual')
            : l.type === 'classify'
              ? tf('lmsAuthor.lessonTargetWell', 'Ex.: PM-03 (poço/parâmetro a classificar)')
              : tf('lmsAuthor.lessonTargetParameter', 'Ex.: Benzeno em PM-03 (série a interpretar)');
    return `
        <label class="lms-author-field">
            <span>${escapeHtml(tf('lmsAuthor.lessonTargetRef', 'Referência-alvo (poço/parâmetro/modelo)'))}</span>
            <input type="text" class="lms-author-input" data-lesson-field="targetRef"
                value="${escapeAttr(l.targetRef || '')}" placeholder="${escapeAttr(ph)}">
        </label>`;
}

/** T3.7: ponte para o quiz editor extraído (lmsAuthoringQuizFields.ts) — mantém _state/rerender no host. */
const _quizFieldsHost: QuizFieldsHost = {
    getExpandedLessonId: () => _state?.expandedLessonId,
    commitQuestions: (lessonId, questions) => _commitQuiz(lessonId, questions),
    rerender: () => _render(),
};

/** Seção "Meus cursos" (lista carregada async em _populateMyCourses). */
function _renderMyCoursesSection(): string {
    return `
        <fieldset class="lms-author-mine">
            <legend>${escapeHtml(tf('lmsAuthor.myCoursesLegend', 'Meus cursos'))}</legend>
            <div class="lms-author-mine-list" id="lms-author-mine-list" aria-live="polite">
                <p class="lms-author-mine-loading">${escapeHtml(tf('lmsAuthor.loading', 'Carregando...'))}</p>
            </div>
        </fieldset>`;
}

// ---------------------------------------------------------------------------
// "Meus cursos" — carga assíncrona + render
// ---------------------------------------------------------------------------

async function _populateMyCourses(): Promise<void> {
    const host = document.getElementById('lms-author-mine-list');
    if (!host) return;
    let courses: CourseDraft[] = [];
    try {
        courses = await listAuthoredCourses();
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] listAuthored:', e?.message || e);
    }
    // Ainda montado?
    if (!document.getElementById(MODAL_ID)) return;
    if (!courses.length) {
        host.innerHTML = `<p class="lms-author-mine-empty">${escapeHtml(
            tf('lmsAuthor.myCoursesEmpty', 'Crie seu primeiro curso — ele aparece aqui para editar e publicar.'),
        )}</p>`;
        return;
    }
    host.innerHTML = courses
        .map((c) => {
            const statusLabel =
                c.status === 'published'
                    ? tf('lmsAuthor.statusPublished', 'Publicado')
                    : c.status === 'archived'
                      ? tf('lmsAuthor.statusArchived', 'Arquivado')
                      : tf('lmsAuthor.statusDraft', 'Rascunho');
            const archived = c.status === 'archived';
            return `
                <div class="lms-author-mine-item" data-course-id="${escapeAttr(c.id)}">
                    <span class="lms-author-mine-title">${escapeHtml(c.title || (tf('lmsAuthor.untitled', 'Sem título')))}</span>
                    <span class="lms-author-mine-status lms-author-mine-status--${escapeAttr(c.status)}">${escapeHtml(statusLabel)}</span>
                    <span class="lms-author-mine-lessons">${(c.lessons || []).length} ${escapeHtml(tf('lmsAuthor.lessonsShort', 'lições'))}</span>
                    <span class="lms-author-mine-btns">
                        <button type="button" class="btn btn-secondary lms-author-mine-edit" data-course-id="${escapeAttr(c.id)}">${escapeHtml(tf('lmsAuthor.edit', 'Editar'))}</button>
                        ${archived ? '' : `<button type="button" class="btn btn-secondary lms-author-mine-archive" data-course-id="${escapeAttr(c.id)}">${escapeHtml(tf('lmsAuthor.archive', 'Arquivar'))}</button>`}
                    </span>
                </div>`;
        })
        .join('');
    _wireMyCourses(host);
}

// ---------------------------------------------------------------------------
// Wire de eventos (addEventListener — CSP-safe — todos sob o AbortController)
// ---------------------------------------------------------------------------

function _wire(overlay: HTMLElement): void {
    if (!_state) return;
    const signal = _state.controller.signal;

    overlay.querySelector('.lms-author-close')?.addEventListener('click', closeCourseAuthoringModal, { signal });

    // Metadados → updateCourseMeta (input/change).
    overlay.querySelectorAll<HTMLElement>('[data-meta]').forEach((el) => {
        const evt = el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(
            evt,
            () => {
                const field = (el as HTMLElement).dataset.meta as
                    | 'title'
                    | 'description'
                    | 'category'
                    | 'difficulty'
                    | 'language';
                const value = (el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
                _applyMeta(field, value);
            },
            { signal },
        );
    });

    // F5.2 — Marketplace: checkbox "ofertar" + campo de preço (reais → centavos).
    const paidEl = overlay.querySelector('.lms-author-pricing-paid') as HTMLInputElement | null;
    const priceField = overlay.querySelector('.lms-author-price-field') as HTMLElement | null;
    const priceEl = overlay.querySelector('.lms-author-price') as HTMLInputElement | null;
    paidEl?.addEventListener(
        'change',
        () => {
            if (priceField) priceField.hidden = !paidEl.checked;
            _applyPricing(paidEl.checked, priceEl?.value);
        },
        { signal },
    );
    priceEl?.addEventListener('input', () => _applyPricing(!!paidEl?.checked, priceEl.value), { signal });

    // Adicionar lição.
    overlay.querySelector('.lms-author-add-lesson')?.addEventListener(
        'click',
        () => {
            const sel = overlay.querySelector('.lms-author-new-type') as HTMLSelectElement | null;
            const type = (sel?.value || 'written') as LessonType;
            _addLesson(type);
        },
        { signal },
    );

    // Toggle expandir/colapsar uma lição + ↑/↓ + remover.
    overlay.querySelectorAll('.lms-author-lesson-toggle').forEach((btn) => {
        btn.addEventListener(
            'click',
            () => {
                const id = (btn.closest('.lms-author-lesson') as HTMLElement | null)?.dataset.lessonId;
                if (id && _state) {
                    _state.expandedLessonId = _state.expandedLessonId === id ? null : id;
                    _render();
                }
            },
            { signal },
        );
    });
    overlay.querySelectorAll('.lms-author-lesson-up').forEach((btn) =>
        btn.addEventListener('click', () => _reorder((btn as HTMLElement).dataset.lessonId, 'up'), { signal }),
    );
    overlay.querySelectorAll('.lms-author-lesson-down').forEach((btn) =>
        btn.addEventListener('click', () => _reorder((btn as HTMLElement).dataset.lessonId, 'down'), { signal }),
    );
    overlay.querySelectorAll('.lms-author-lesson-remove').forEach((btn) =>
        btn.addEventListener('click', () => _removeLesson((btn as HTMLElement).dataset.lessonId), { signal }),
    );

    overlay.querySelectorAll<HTMLElement>('.lms-author-slide-strip-item').forEach((btn) => {
        btn.addEventListener(
            'click',
            () => {
                const lessonId = btn.dataset.deckSlideLessonId;
                if (!lessonId || !_state) return;
                _state.expandedLessonId = lessonId;
                _state.selectedEditableElementId = null;
                _render();
            },
            { signal },
        );
    });
    overlay.querySelectorAll<HTMLButtonElement>('.lms-author-slide-window-btn').forEach((btn) => {
        btn.addEventListener(
            'click',
            () => {
                const step = Number(btn.dataset.deckSlideStep || 0);
                if (!Number.isFinite(step) || step === 0) return;
                _shiftDeckWorkbenchSlide(step);
            },
            { signal },
        );
    });

    // Campos da lição expandida → updateLesson (sem re-render: preserva o foco).
    overlay.querySelectorAll<HTMLButtonElement>('.lms-author-deck-action').forEach((btn) => {
        btn.addEventListener(
            'click',
            (event) => {
                event.stopPropagation();
                _runDeckQuickAction(overlay, btn);
            },
            { signal },
        );
    });

    overlay.querySelectorAll<HTMLButtonElement>('.lms-author-slide-editable-element').forEach((btn) => {
        btn.addEventListener(
            'click',
            () => {
                const lessonId = btn.dataset.editableLessonId || '';
                const elementId = btn.dataset.editableElementId || '';
                _selectEditableSlideElement(lessonId, elementId);
            },
            { signal },
        );
    });

    overlay.querySelectorAll<HTMLElement>('[data-editable-field]').forEach((el) => {
        const evt = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ? 'change' : 'input';
        el.addEventListener(
            evt,
            () => {
                const lessonId = el.dataset.editableLessonId || '';
                const elementId = el.dataset.editableElementId || '';
                const field = el.dataset.editableField || '';
                const value = (el as HTMLInputElement | HTMLTextAreaElement).value;
                _applyEditableElementField(lessonId, elementId, field, value);
            },
            { signal },
        );
    });

    overlay.querySelectorAll<HTMLButtonElement>('.lms-author-editable-position-reviewed').forEach((btn) => {
        btn.addEventListener(
            'click',
            () => {
                _applyEditableElementField(btn.dataset.editableLessonId || '', btn.dataset.editableElementId || '', 'needsPositionReview', false);
            },
            { signal },
        );
    });

    overlay.querySelectorAll<HTMLElement>('[data-lesson-field]').forEach((el) => {
        const lessonEl = el.closest('.lms-author-lesson') as HTMLElement | null;
        const lessonId = lessonEl?.dataset.lessonId;
        if (!lessonId) return;
        const evt = el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(
            evt,
            () => {
                const field = (el as HTMLElement).dataset.lessonField as keyof LessonDraft;
                let value: any = (el as HTMLInputElement | HTMLTextAreaElement).value;
                if (field === 'minutes') value = Math.max(0, Math.round(Number(value) || 0));
                _applyLessonField(lessonId, field, value);
            },
            { signal },
        );
    });

    // Quiz: N perguntas × N opções + correta + add/remove (escopo da lição expandida).
    _wireQuizFieldsImpl(overlay, signal, _quizFieldsHost);

    // Extras por tipo: badge de validade do vídeo + título do item de catálogo.
    _wireTypedExtras(overlay, signal);

    // F5.1 — "Começar de um modelo" (templates first-party).
    overlay.querySelector('.lms-author-template')?.addEventListener('click', () => _onTemplatePick(overlay), { signal });
    overlay.querySelector('.lms-author-import-course-json')?.addEventListener('click', () => void _onImportCourseJson(), { signal });
    overlay.querySelectorAll('.lms-author-import-faithful-package').forEach((btn) => {
        btn.addEventListener('click', () => void _onImportFaithfulPackage(), { signal });
    });

    // Ações do rodapé.
    overlay.querySelectorAll('.lms-author-back-training').forEach((button) => {
        button.addEventListener('click', () => closeCourseAuthoringModal(), { signal });
    });
    overlay.querySelectorAll('.lms-author-edit-details').forEach((btn) => {
        btn.addEventListener(
            'click',
            () => {
                if (!_state) return;
                _state.surfaceMode = 'form';
                _render();
                setTimeout(() => overlay.querySelector<HTMLElement>('[data-meta="title"]')?.focus?.(), 0);
            },
            { signal },
        );
    });
    overlay.querySelectorAll('.lms-author-save').forEach((button) => {
        button.addEventListener('click', () => void _onSave(), { signal });
    });
    overlay.querySelectorAll('.lms-author-publish').forEach((button) => {
        button.addEventListener('click', () => void _onPublish(), { signal });
    });
    overlay.querySelectorAll('.lms-author-preview').forEach((button) => {
        button.addEventListener('click', () => void _onPreview(), { signal });
    });
    overlay.querySelectorAll('.lms-author-start-class').forEach((button) => {
        button.addEventListener('click', () => void _onStartClass(), { signal });
    });
    _wireFullscreenControls(overlay, signal);

    // Chave ECBT do treinamento (exportar como .ecbt + clipboard / importar de arquivo ou texto).
    overlay.querySelector('.lms-author-export-key')?.addEventListener('click', () => void _onExportKey(), { signal });
    overlay.querySelectorAll('.lms-author-final-package').forEach((button) => {
        button.addEventListener('click', () => void _onFinalizePackage(), { signal });
    });
    overlay.querySelectorAll('.lms-author-import-key').forEach((button) => {
        button.addEventListener(
            'click',
            (event) => {
                (event.currentTarget as HTMLElement | null)
                    ?.closest<HTMLDetailsElement>('.lms-author-more-actions')
                    ?.removeAttribute('open');
                void _onImportKeyProfessorFirst();
            },
            { signal },
        );
    });

    // Importar de PowerPoint (.pptx) → cada slide vira uma lição (LMS-PPTX-BRIDGE F3).
    overlay.querySelector('.lms-author-import-pptx')?.addEventListener('click', () => void _onImportPptx(), { signal });
}

/**
 * Atualizações de exibição por tipo, sem re-render (preservam o foco):
 * - vídeo: badge "URL válida/inválida" atualiza ao digitar;
 * - picker de catálogo: o título do item escolhido aparece ao trocar o <select>.
 */
function _runDeckQuickAction(overlay: HTMLElement, button: HTMLButtonElement): void {
    const optionId = button.dataset.deckActionOptionId || '';
    const presetId = button.dataset.deckActionPresetId || '';
    const details = button.closest('.lms-author-deck-ppt-side')?.querySelector<HTMLDetailsElement>(
        '.lms-author-deck-app-details',
    );
    if (details) details.open = true;
    const cards = Array.from(overlay.querySelectorAll<HTMLElement>('.lms-author-deck-app-options-mount .tsao-card'));
    const card = cards.find(
        (item) => item.dataset.optionId === optionId || (!!presetId && item.dataset.modelPresetId === presetId),
    );
    const actionButton = card?.querySelector<HTMLButtonElement>('.tsao-actions .tsao-btn, .tsao-btn');
    if (!actionButton) {
        showToast('Nao encontrei a acao deste slide. Abra o plano completo para usar o fallback.', 'warning');
        return;
    }
    // O fechamento pós-ação-externa agora é armado UMA vez na criação do
    // overlay (openCourseAuthoringModal) — cobre também o clique direto no
    // card tsao, não só este atalho do dock.
    actionButton.click();
}

function _closeAuthoringAfterExternalDeckAction(overlay: HTMLElement): void {
    if (!_state) return;
    // Escuta em WINDOW, não no overlay: o evento é emitido pelo painel tsao e,
    // quando o painel foi re-renderizado durante a ação assíncrona, ele chega
    // direto em window (ver emitPanelEvent) — no overlay ele se perderia e o
    // authoring ficaria aberto COBRINDO o editor do módulo destino
    // (PIPELINE-PACK-CUSTOMIZATION-WORKBENCH#1).
    window.addEventListener(
        'training-slide-app-option:action',
        (event: Event) => {
            const detail = (event as CustomEvent).detail;
            const result = detail?.result;
            const option = detail?.option;
            const externalResult = result?.ok && (result.mode === 'handler' || result.mode === 'resource');
            const externalOption = option?.type === 'open-handler' || option?.type === 'resource';
            if (!externalResult || !externalOption) return;
            // PIPELINE-PACK-CUSTOMIZATION-WORKBENCH#1: o "Voltar ao slide" do
            // módulo destino só conhece o slug lógico do curso (ex.:
            // 'intro-module01'), que NÃO é o id real do rascunho — e este
            // overlay vai fechar já já. Persiste o rascunho (best-effort) e
            // registra id real + slide corrente para returnToTrainingSlide
            // reabrir o MESMO deck/slide em vez de cair no home do Training.
            const draft = _state?.draft;
            if (draft?.id) {
                void (async () => {
                    try {
                        await saveAuthoredCourse(draft);
                    } catch (e: any) {
                        console.debug('[lmsAuthoringModal] pre-close autosave:', e?.message || e);
                    }
                })();
                const lessons = Array.isArray(draft.lessons) ? draft.lessons : [];
                const slideIndex = lessons.findIndex((l: any) => l?.id === _state?.expandedLessonId);
                (window as any).__ecbytsTrainingDeckReturn = {
                    courseId: draft.id,
                    slide: slideIndex >= 0 ? slideIndex + 1 : null,
                    savedAt: Date.now(),
                };
            }
            setTimeout(() => {
                document.getElementById('lms-author-preview-overlay')?.remove();
                const presentOverlay = document.getElementById('lms-present-overlay');
                _exitFullscreenForOverlay(presentOverlay);
                presentOverlay?.remove();
                closeCourseAuthoringModal();
                const win = typeof window !== 'undefined' ? (window as any) : null;
                const closeTraining = (win?.closeLmsModule || win?.closeTrainingPanel) as (() => void) | null;
                if (typeof closeTraining === 'function') closeTraining();
            }, 0);
        },
        // SEM once:true — eventos NÃO-externos (poll/reveal/snapshot) retornam
        // cedo e não podem "consumir" o listener; o abort do controller no
        // closeCourseAuthoringModal faz a limpeza.
        { signal: _state.controller.signal },
    );
}

function _wireTypedExtras(overlay: HTMLElement, signal: AbortSignal): void {
    // Badge de validade do vídeo (F3.3).
    overlay.querySelectorAll<HTMLInputElement>('.lms-author-video-url').forEach((input) => {
        const badge = input.parentElement?.querySelector('.lms-author-video-badge');
        input.addEventListener(
            'input',
            () => {
                if (!badge) return;
                const url = input.value.trim();
                if (!url) {
                    badge.innerHTML = '';
                    return;
                }
                badge.innerHTML = isYouTubeUrl(url)
                    ? `<span class="lms-author-video-valid">${escapeHtml(tf('lmsAuthor.lessonVideoValid', 'URL de YouTube válida.'))}</span>`
                    : `<span class="lms-author-video-invalid">${escapeHtml(tf('lmsAuthor.lessonVideoInvalid', 'URL não reconhecida como vídeo do YouTube.'))}</span>`;
            },
            { signal },
        );
    });

    // Título do item de catálogo escolhido (F3.2).
    overlay.querySelectorAll<HTMLSelectElement>('.lms-author-catalog-pick').forEach((sel) => {
        const chosen = sel.parentElement?.querySelector('.lms-author-picker-chosen') as HTMLElement | null;
        sel.addEventListener(
            'change',
            () => {
                if (!chosen) return;
                const label = sel.options[sel.selectedIndex]?.textContent || '';
                if (label) {
                    chosen.hidden = false;
                    chosen.textContent = `${tf('lmsAuthor.pickedTitle', 'Selecionado')}: ${label}`;
                } else {
                    chosen.hidden = true;
                }
            },
            { signal },
        );
    });
}

/** Persiste o array de perguntas no draft (questions) via updateLesson. */
function _commitQuiz(lessonId: string, questions: DraftQuizQuestion[]): void {
    if (!_state) return;
    _state.draft = updateLesson(_state.draft, lessonId, { questions });
}

/** Fia as ações de "Meus cursos" (editar/arquivar). */
function _wireMyCourses(host: HTMLElement): void {
    if (!_state) return;
    const signal = _state.controller.signal;
    host.querySelectorAll('.lms-author-mine-edit').forEach((btn) =>
        btn.addEventListener(
            'click',
            () => {
                const id = (btn as HTMLElement).dataset.courseId;
                if (id) void openCourseAuthoringModal(id); // reabre em modo edição
            },
            { signal },
        ),
    );
    host.querySelectorAll('.lms-author-mine-archive').forEach((btn) =>
        btn.addEventListener(
            'click',
            () => {
                const id = (btn as HTMLElement).dataset.courseId;
                if (id) void _onArchive(id);
            },
            { signal },
        ),
    );
}

// ---------------------------------------------------------------------------
// Mutações de estado (sempre via lógica pura → novo draft)
// ---------------------------------------------------------------------------

function _applyMeta(field: 'title' | 'description' | 'category' | 'difficulty' | 'language', value: string): void {
    if (!_state) return;
    const wasStartStep = field === 'title' && _isStartStep(_state.draft);
    const patch: any = {};
    if (field === 'difficulty') {
        patch.difficulty = (['beginner', 'intermediate', 'advanced'].includes(value) ? value : 'beginner') as any;
    } else {
        patch[field] = value;
    }
    _state.draft = updateCourseMeta(_state.draft, patch);
    // T3.5: sair da 1a tela minimalista (titulo preenchido) revela o form
    // completo (secao de licoes) — precisa de um re-render de verdade aqui,
    // e não só atualizar o <h3> do diálogo.
    if (wasStartStep && !_isStartStep(_state.draft)) {
        _render();
        const overlay = document.getElementById(MODAL_ID);
        const titleInput = overlay?.querySelector<HTMLInputElement>('[data-meta="title"]');
        if (titleInput) {
            titleInput.focus({ preventScroll: true });
            titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length);
        }
        return;
    }
    // Atualiza só o título do diálogo (não re-renderiza — preserva o foco do input).
    const titleEl = document.getElementById('lms-author-title');
    if (titleEl && field === 'title') {
        titleEl.textContent = value
            ? `${tf('lmsAuthor.editingTitle', 'Editando')}: ${value}`
            : tf('lmsAuthor.title', 'Criar aula');
    }
}

/**
 * Aplica a oferta de marketplace (F5.2). is_paid + price (reais → centavos).
 * Curso não-ofertado fica gratuito (price_cents=0). Sem re-render (preserva foco).
 */
function _applyPricing(isPaid: boolean, priceReaisRaw: string | undefined): void {
    if (!_state) return;
    const reais = Math.max(0, Number(priceReaisRaw) || 0);
    const price_cents = isPaid ? Math.round(reais * 100) : 0;
    _state.draft = updateCourseMeta(_state.draft, { pricing: { is_paid: isPaid, price_cents } });
}

function _addLesson(type: LessonType): void {
    if (!_state) return;
    const wasEmpty = !Array.isArray(_state.draft.lessons) || _state.draft.lessons.length === 0;
    const id = _genLessonId();
    _state.draft = addLesson(_state.draft, { id, type, title: '', minutes: 5 });
    _state.expandedLessonId = id; // já abre a nova lição para edição
    // T3.6: a 1a licao de um curso novo (form ainda em modo 'form') liga o
    // deck-first automaticamente — sem isso o professor ficava preso no
    // formulario monolitico mesmo depois de ja ter conteudo real.
    if (wasEmpty && _state.surfaceMode === 'form' && _shouldShowDeckWorkbench(_state.draft)) {
        _state.surfaceMode = 'deck';
    }
    _render();
}

function _removeLesson(lessonId?: string): void {
    if (!_state || !lessonId) return;
    _state.draft = removeLesson(_state.draft, lessonId);
    if (_state.expandedLessonId === lessonId) _state.expandedLessonId = null;
    _render();
}

function _reorder(lessonId: string | undefined, dir: 'up' | 'down'): void {
    if (!_state || !lessonId) return;
    _state.draft = reorderLesson(_state.draft, lessonId, dir);
    _render();
}

function _applyLessonField(lessonId: string, field: keyof LessonDraft, value: any): void {
    if (!_state) return;
    _state.draft = updateLesson(_state.draft, lessonId, { [field]: value } as Partial<LessonDraft>);
}

function _selectEditableSlideElement(lessonId: string, elementId: string): void {
    if (!_state || !lessonId || !elementId) return;
    _state.expandedLessonId = lessonId;
    _state.selectedEditableElementId = elementId;
    _render();
}

function _editableElementPatch(field: string, rawValue: unknown): Record<string, unknown> {
    if (field === 'label' || field === 'text') {
        return { [field]: String(rawValue || '') };
    }
    if (field === 'needsPositionReview') {
        return {
            needsPositionReview: Boolean(rawValue),
            positionSource: rawValue ? 'fallback-grid' : 'manual-reviewed',
        };
    }
    if (field === 'x' || field === 'y' || field === 'w' || field === 'h') {
        const pct = Math.max(0, Math.min(100, Number(rawValue) || 0));
        const value = pct / 100;
        return {
            [field]: value,
            needsPositionReview: false,
            positionSource: 'manual-workbench',
        };
    }
    return {};
}

function _applyEditableElementField(lessonId: string, elementId: string, field: string, rawValue: unknown): void {
    if (!_state || !lessonId || !elementId || !field) return;
    const lesson = _state.draft.lessons.find((item) => item.id === lessonId) as any;
    if (!lesson) return;
    const sourceElements = [
        lesson.editableSlide?.elements,
        lesson.slideModel?.elements,
        lesson.editableElements,
        lesson.slideElements,
        lesson.elements,
        lesson.ecbytsElements,
    ].find((value) => Array.isArray(value));
    if (!Array.isArray(sourceElements)) return;
    const patch = _editableElementPatch(field, rawValue);
    if (!Object.keys(patch).length) return;
    const updatedElements = sourceElements.map((element: any, index: number) => {
        const id = _deckWorkbenchEditableElementId(element, index);
        if (id !== elementId) return element;
        const next = { ...element, id, ...patch };
        if (field === 'x' || field === 'y' || field === 'w' || field === 'h') {
            next.bounds = {
                ...(element.bounds && typeof element.bounds === 'object' ? element.bounds : {}),
                [field]: (patch as any)[field],
            };
        }
        if (field === 'needsPositionReview' && rawValue === false) {
            next.needsPositionReview = false;
        }
        return next;
    });
    const lessonPatch: any = {
        editableElements: updatedElements,
    };
    if (lesson.editableSlide && typeof lesson.editableSlide === 'object') {
        lessonPatch.editableSlide = { ...lesson.editableSlide, elements: updatedElements };
    }
    if (lesson.slideModel && typeof lesson.slideModel === 'object') {
        lessonPatch.slideModel = { ...lesson.slideModel, elements: updatedElements };
    }
    for (const alias of ['slideElements', 'elements', 'ecbytsElements']) {
        if (Array.isArray(lesson[alias])) lessonPatch[alias] = updatedElements;
    }
    _state.draft = updateLesson(_state.draft, lessonId, lessonPatch as Partial<LessonDraft>);
    _state.selectedEditableElementId = elementId;
    _state.lastSavedDraftKey = null;
    _render();
}

// ---------------------------------------------------------------------------
// Ações do rodapé
// ---------------------------------------------------------------------------

/** Salva o rascunho corrente no store IDB (offline-first). */
async function _onSave(): Promise<void> {
    if (!_state) return;
    _clearErrors();
    _syncVisibleEditableFieldsBeforeSave();
    let ok = false;
    try {
        ok = await saveAuthoredCourse(_state.draft);
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] save:', e?.message || e);
    }
    if (ok) {
        _markDraftSaved();
        _emitAuthoredCoursesChanged('save', _state.draft.id);
        _render();
        showToast(tf('lmsAuthor.toastSaved', 'Rascunho salvo.'), 'success');
    } else {
        showToast(tf('lmsAuthor.toastSaveFailed', 'Não foi possível salvar (offline?).'), 'warning');
    }
}

/**
 * Publica o curso. Salva primeiro (garante que o store tem a versão corrente),
 * roda o publish-gate via store e, se inválido, mostra os erros POR CAMPO.
 */
async function _onPublish(): Promise<void> {
    if (!_state) return;
    _clearErrors();
    // 1. Persiste a versão corrente antes de publicar (o store publica por id).
    try {
        await saveAuthoredCourse(_state.draft);
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] publish-save:', e?.message || e);
    }
    // 2. Validação local imediata (feedback rápido + offline-safe).
    const gate = validateCourseForPublish(_state.draft);
    if (!gate.ok) {
        _showErrors(gate.errors);
        return;
    }
    // 3. Publica via store (re-valida e persiste o status='published').
    let res: { ok: boolean; errors: readonly PublishError[] };
    try {
        res = await publishAuthoredCourse(_state.draft.id);
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] publish:', e?.message || e);
        showToast(tf('lmsAuthor.toastPublishFailed', 'Falha ao publicar (offline?).'), 'warning');
        return;
    }
    if (!res.ok) {
        _showErrors(res.errors);
        return;
    }
    try {
        const publishedDraft = await loadAuthoredCourse(_state.draft.id);
        if (publishedDraft && _state) {
            _state.draft = publishedDraft;
            _markDraftSaved();
            _emitAuthoredCoursesChanged('publish', publishedDraft.id);
            _render();
        }
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] publish-reload:', e?.message || e);
    }
    showToast(tf('lmsAuthor.toastPublished', 'Curso publicado! Já aparece no catálogo.'), 'success');
    void _populateMyCourses();
}

/** Arquiva um curso (soft-delete) a partir de "Meus cursos". */
async function _onArchive(courseId: string): Promise<void> {
    let ok = false;
    try {
        ok = await archiveAuthoredCourse(courseId);
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] archive:', e?.message || e);
    }
    showToast(
        ok
            ? tf('lmsAuthor.toastArchived', 'Curso arquivado.')
            : tf('lmsAuthor.toastArchiveFailed', 'Não foi possível arquivar.'),
        ok ? 'info' : 'warning',
    );
    if (ok) _emitAuthoredCoursesChanged('archive', courseId);
    void _populateMyCourses();
}

// ---------------------------------------------------------------------------
// Chave ECBT do treinamento (exportar/importar o curso editado)
// ---------------------------------------------------------------------------

/** slug seguro p/ nome de arquivo (a partir do título do curso). */

// ---------------------------------------------------------------------------
// Templates first-party (F5.1) — "começar de um modelo"
// ---------------------------------------------------------------------------

/**
 * Converte um curso seed (SeedTraining, frozen) em um CourseDraft NOVO e mutável
 * do usuário: novo id, status='draft', provenance='user_authored', version=1.
 * As lições copiam o tipo + campos relevantes; o quiz final do seed (separado das
 * lições) é convertido numa lição 'quiz' com a primeira pergunta para o autor
 * personalizar. Não muta o seed.
 */
function _seedToDraft(seed: any): CourseDraft {
    const now = new Date().toISOString();
    const base = emptyCourseDraft(LOCAL_OWNER_ID, {
        title: seed?.title ? `${seed.title} (cópia)` : '',
        description: seed?.description || '',
        category: seed?.category || 'general',
        difficulty: seed?.difficulty || 'beginner',
    });
    const lessons: LessonDraft[] = (Array.isArray(seed?.lessons) ? seed.lessons : []).map((l: any, i: number) => {
        const ld: LessonDraft = {
            id: _genLessonId(),
            title: l?.title || '',
            type: (LESSON_TYPES.includes(l?.type) ? l.type : 'written') as LessonType,
            order: i + 1,
            minutes: Number(l?.minutes) > 0 ? Number(l.minutes) : 5,
            markdown: l?.markdown ?? null,
            videoUrl: l?.videoUrl,
            transcript: l?.transcript,
            caseId: l?.caseId,
            decisionId: l?.decisionId,
            exerciseId: l?.exerciseId,
            tourId: l?.tourId,
        };
        return ld;
    });
    return {
        ...base,
        lessons,
        createdAt: now,
        updatedAt: now,
    };
}

/** Abre um seletor leve de templates first-party e duplica o escolhido. */
function _onTemplatePick(_overlay: HTMLElement): void {
    let seeds: any[] = [];
    try {
        seeds = [...getCatalogSeed()];
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] templates:', e?.message || e);
    }
    if (!seeds.length) {
        showToast(tf('lmsAuthor.templateNone', 'Nenhum modelo disponível no momento.'), 'info');
        return;
    }
    document.getElementById('lms-author-template-pop')?.remove();
    const ctl = new AbortController();
    const pop = document.createElement('div');
    pop.id = 'lms-author-template-pop';
    pop.className = 'ecbt-overlay';
    pop.style.zIndex = String(Z_INDEX.EXCEPTION_LMS_AUTHORING_MODAL + 1);
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'true');
    pop.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--sm lms-author-template-dialog" role="document" tabindex="-1">
            <div class="ecbt-header">
                <h3 class="ecbt-title">${escapeHtml(tf('lmsAuthor.templatePickTitle', 'Começar de um modelo'))}</h3>
                <button class="ecbt-close lms-author-template-close" type="button"
                    aria-label="${escapeAttr(tf('lmsAuthor.close', 'Fechar'))}">&times;</button>
            </div>
            <div class="lms-author-template-list">
                ${seeds
                    .map(
                        (s) => `
                    <button type="button" class="lms-author-template-item" data-template-id="${escapeAttr(s.id)}">
                        <span class="lms-author-template-name">${escapeHtml(s.title || s.id)}</span>
                        <span class="lms-author-template-meta">${(s.lessons || []).length} ${escapeHtml(tf('lmsAuthor.lessonsShort', 'lições'))}</span>
                    </button>`,
                    )
                    .join('')}
            </div>
        </div>`;
    document.body.appendChild(pop);
    const close = () => { ctl.abort(); pop.remove(); };
    pop.querySelector('.lms-author-template-close')?.addEventListener('click', close, { signal: ctl.signal });
    pop.addEventListener('click', (e) => { if (e.target === pop) close(); }, { signal: ctl.signal });
    pop.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close(); } }, { signal: ctl.signal });
    pop.querySelectorAll('.lms-author-template-item').forEach((btn) =>
        btn.addEventListener(
            'click',
            () => {
                const id = (btn as HTMLElement).dataset.templateId;
                const seed = seeds.find((s) => s.id === id);
                if (seed && _state) {
                    _state.draft = _seedToDraft(seed);
                    _state.expandedLessonId = null;
                    _state.lastSavedDraftKey = null;
                    close();
                    _render();
                    showToast(tf('lmsAuthor.templateDuplicated', 'Modelo duplicado como novo rascunho. Personalize e publique.'), 'success');
                }
            },
            { signal: ctl.signal },
        ),
    );
    setTimeout(() => pop.querySelector<HTMLElement>('.lms-author-template-item')?.focus(), 0);
}

// ---------------------------------------------------------------------------
// Erros de validação por campo (aria-live)
// ---------------------------------------------------------------------------

function _clearErrors(): void {
    const box = document.getElementById('lms-author-errors');
    if (box) box.innerHTML = '';
    document
        .querySelectorAll('.lms-author-field--error')
        .forEach((el) => el.classList.remove('lms-author-field--error'));
}

/** Mostra os erros do publish-gate, listados por campo, e destaca os inputs. */
function _showErrors(errors: readonly PublishError[]): void {
    const box = document.getElementById('lms-author-errors');
    if (!box) return;
    if (!errors.length) {
        box.innerHTML = '';
        return;
    }
    box.innerHTML = `
        <strong>${escapeHtml(tf('lmsAuthor.errorsTitle', 'Corrija antes de publicar:'))}</strong>
        <ul class="lms-author-error-list">
            ${errors.map((e) => `<li><code>${escapeHtml(e.field)}</code> — ${escapeHtml(e.message)}</li>`).join('')}
        </ul>`;
    // Destaque visual: campos de metadados de topo (title/description) quando aplicável.
    for (const e of errors) {
        if (e.field === 'title' || e.field === 'description') {
            const input = document.querySelector(`[data-meta="${e.field}"]`);
            input?.closest('.lms-author-field')?.classList.add('lms-author-field--error');
        }
    }
    showToast(tf('lmsAuthor.toastInvalid', 'O curso tem pendências — veja a lista de erros.'), 'warning');
}

// ---------------------------------------------------------------------------
// A11y: ESC fecha + focus-trap
// ---------------------------------------------------------------------------

function _onKeydown(e: KeyboardEvent, overlay: HTMLElement): void {
    if (e.key === 'Escape') {
        if (_consumeFullscreenEscape(e, overlay)) {
            return;
        }
        e.preventDefault();
        closeCourseAuthoringModal();
        return;
    }
    if (e.key !== 'Tab') return;
    const dialog = overlay.querySelector('.ecbt-dialog') as HTMLElement | null;
    if (!dialog) return;
    const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
    ).filter((el) => el.offsetParent !== null);
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement as HTMLElement;
    if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
    }
}
