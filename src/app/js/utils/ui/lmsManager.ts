// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   LMS MANAGER — Training Module LMS runtime (Fase B)

   Faz o módulo e-learning ALCANÇÁVEL: liga o trainingPanel (shell
   data-driven) ao catálogo seed (lmsContent) + ao progresso do usuário
   persistido offline-first em IndexedDB (idbStore). Trata as ações do
   painel (enroll/continue/download) e o player de lição (reader markdown
   + quiz inline consumindo o quizEngine).

   Persistência: IDB (offline-first, infra pronta). Sync Supabase é Fase D
   (tabelas training_* quarentenadas em legacy). Gate: flag
   ENABLE_LMS_MODULE (rollback hatch) OU localStorage 'ecbyts-lms'==='1'.
   ================================================================ */

import { CONFIG } from '../../config.js';
import { idbGet, idbSet } from '../storage/idbStore.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { Z_INDEX } from './zIndex.js';
import {
    openTrainingPanel,
    setTrainingPanelData,
    closeTrainingPanel,
    isTrainingPanelOpen,
    isInstructorModeEnabled,
    getActiveTrainingTab,
} from './trainingPanel/trainingPanel.js';
import { getCatalogSeed, getTrainingById, getLessonsForTraining, getQuizForTraining } from '../../core/training/lmsContent.js';
import { buildPanelData, resolveNextLesson } from '../../core/training/lmsCatalogPure.js';
import { buildYouTubeEmbedUrl, youTubeThumbnailUrl } from '../../core/training/_youtubeEmbedPure.js';
import { buildModelElementQuestion, gradeModelQuiz, isAboveReference } from '../../core/training/_modelQuizPure.js';
import { buildClassifyQuestion, bandFromSeverity } from '../../core/training/_classifyQuizPure.js';
import { buildInterpretQuestion, trendFromMannKendall } from '../../core/training/_interpretQuizPure.js';
import { createCaseState, listAvailableActions, applyAction } from '../../core/training/_caseEnginePure.js';
import { scoreCase } from '../../core/training/_caseRubricPure.js';
import { getCaseById } from '../../core/training/_caseCatalogPure.js';
import { buildOrderInvestigationQuestion, gradeOrderInvestigation } from '../../core/training/_orderInvestigationPure.js';
import { buildRemediationDecision, gradeRemediationDecision } from '../../core/training/_remediationDecisionPure.js';
import { getOrderInvestigationScenario, getRemediationScenario } from '../../core/training/_decisionCatalogPure.js';
import { gradeOrdering, shuffledSteps } from '../../core/training/_orderingExercisePure.js';
import { getOrderingExerciseById } from '../../core/training/_orderingCatalogPure.js';
import { computeCompetencyProfile } from '../../core/training/_competencyPure.js';
import { evaluateCourseCertificate, classifyCompletion, describeCertificateGaps } from '../../core/training/_completionPolicyPure.js';
import { normalizeHintsSeenList } from '../../core/training/_lmsHintsSeenPure.js';
import { syncProgress, syncCertificate, appendAudit } from './lmsSyncAdapter.js';
import { openCourseAuthoringModal, isCourseAuthoringEnabled } from './lmsAuthoringModal.js';
import { getMergedTrainingCatalog, listAuthoredCourses } from './lmsAuthoringStore.js';
import {
    gradeQuiz,
    computeLessonProgress,
    buildCertificatePayload,
    evaluateCertificateEligibility,
    buildCertificateExportBundle,
} from '../../core/training/quizEngine.js';

const IDB_ENROLLMENTS = 'ecbyts-lms-enrollments';
const IDB_CERTIFICATES = 'ecbyts-lms-certificates';
/** T8.2: dicas de intenção (T8.1) já vistas — escrita por utils/tour/intentHint.ts. */
const IDB_HINTS_SEEN = 'ecbyts-lms-hints-seen';
const LMS_CANONICAL_TABS = Object.freeze(['myCourses', 'createdCourses', 'catalog', 'certificates']);
const LMS_TAB_ALIASES: Record<string, string> = Object.freeze({
    mine: 'myCourses',
    authored: 'createdCourses',
    created: 'createdCourses',
    creatorCourses: 'createdCourses',
    createdCourses: 'createdCourses',
});

/** @type {any[]} */
let _enrollments: any[] = [];
/** @type {any[]} */
let _certificates: any[] = [];
let _authoringRefreshListenerInstalled = false;

function _flagOn(): boolean {
    try {
        if ((CONFIG as any)?.FEATURES?.ENABLE_LMS_MODULE) return true;
        return localStorage.getItem('ecbyts-lms') === '1';
    } catch {
        return false;
    }
}

function _normalizeLmsActiveTab(activeTab: any, fallback = 'catalog'): string {
    const raw = typeof activeTab === 'string' ? activeTab : '';
    const normalized = LMS_TAB_ALIASES[raw] || raw;
    return LMS_CANONICAL_TABS.includes(normalized) ? normalized : fallback;
}

function _shouldResumeLessonForActiveTab(activeTab: string, skipResume: unknown): boolean {
    return skipResume !== true && activeTab !== 'createdCourses';
}

async function _load() {
    try {
        _enrollments = (await idbGet(IDB_ENROLLMENTS)) || [];
        _certificates = (await idbGet(IDB_CERTIFICATES)) || [];
    } catch (e: any) {
        console.debug('[lmsManager] load:', e?.message || e);
        _enrollments = _enrollments || [];
        _certificates = _certificates || [];
    }
}

function _findEnrollment(trainingId: string): any {
    return _enrollments.find((e) => e.training_id === trainingId) || null;
}

async function _persistEnrollments() {
    try {
        await idbSet(IDB_ENROLLMENTS, _enrollments);
    } catch (e: any) {
        console.debug('[lmsManager] persist enrollments:', e?.message || e);
    }
}

async function _persistCertificates() {
    try {
        await idbSet(IDB_CERTIFICATES, _certificates);
    } catch (e: any) {
        console.debug('[lmsManager] persist certs:', e?.message || e);
    }
}

async function _loadHintsSeen(): Promise<ReturnType<typeof normalizeHintsSeenList>> {
    try {
        const raw = await idbGet(IDB_HINTS_SEEN);
        return normalizeHintsSeenList(raw);
    } catch (e: any) {
        console.debug('[lmsManager] load hints seen:', e?.message || e);
        return [];
    }
}

async function _currentPanelData() {
    let authoredCourses: any[] = [];
    let catalog: readonly any[] = getCatalogSeed();
    try {
        authoredCourses = await listAuthoredCourses();
        catalog = await getMergedTrainingCatalog(getCatalogSeed());
    } catch (e: any) {
        console.debug('[lmsManager] authored courses:', e?.message || e);
    }
    const hintsSeen = await _loadHintsSeen();
    return {
        ...buildPanelData({
            enrollments: _enrollments,
            certificates: _certificates,
            catalog,
            createdCourses: authoredCourses,
        }),
        hintsSeen,
    };
}

/** Re-render the panel from the current in-memory state. */
async function _refreshPanel(options: { activeTab?: string } = {}) {
    const data = await _currentPanelData();
    if (options.activeTab && isTrainingPanelOpen()) {
        openTrainingPanel({
            data,
            activeTab: _normalizeLmsActiveTab(options.activeTab, options.activeTab),
            onAction: _handleAction,
        });
        return;
    }
    setTrainingPanelData(data);
}

/**
 * T7.3 — CustomEvent unico de progresso do LMS, disparado em `_enroll` (apos
 * matricular) e em `_markLessonComplete` (junto do appendAudit). Consumido
 * pelo checklist "Comece aqui" (e por quem mais quiser reagir a progresso
 * real do aluno) sem acoplar ao IDB/Supabase. Best-effort: silencioso se
 * `window` nao existir (SSR/teste) ou dispatchEvent falhar.
 */
function _dispatchLmsProgressEvent(kind: 'enrolled' | 'lesson_completed' | 'course_completed', detail: Record<string, unknown> = {}) {
    try {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent('ecbyts:lms-progress', { detail: { kind, ...detail } }));
    } catch (e: any) {
        console.debug('[lmsManager] dispatchLmsProgressEvent:', e?.message || e);
    }
}

function _ensureAuthoringRefreshListener() {
    if (_authoringRefreshListenerInstalled || typeof window === 'undefined') return;
    _authoringRefreshListenerInstalled = true;
    window.addEventListener('lms-authoring:courses-changed', () => {
        void _refreshPanel({ activeTab: 'createdCourses' });
    });
}

// --- Competências & badges (LMS-INTERACTIVE-ASSESS-001 F6 / RF-13) -------------
const _COMP_LEVEL_LABEL: Record<number, string> = { 0: 'Não iniciada', 1: 'Bronze', 2: 'Prata', 3: 'Ouro' };

/** Mapa lessonId → tipo (todos os cursos do catálogo). */
function _allLessonTypeMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const tr of getCatalogSeed()) for (const l of tr.lessons) map[l.id] = l.type;
    return map;
}

/** Todas as lições concluídas (todos os cursos) como evidência p/ competências. */
function _allCompletions(): Array<{ lessonId: string; type: string; score?: number; passed: boolean }> {
    const typeMap = _allLessonTypeMap();
    const out: Array<{ lessonId: string; type: string; score?: number; passed: boolean }> = [];
    for (const enr of _enrollments) {
        for (const id of enr.completed_lesson_ids || []) {
            const type = typeMap[id];
            if (!type) continue;
            const score = enr.lesson_scores?.[id];
            out.push({ lessonId: id, type, score, passed: true });
        }
    }
    return out;
}

/** Overlay "Minhas competências": barras por competência + badges + título. */
function _renderCompetencyOverlay() {
    _closeLessonModal();
    const profile = computeCompetencyProfile(_allCompletions());
    const rows = profile.competencies
        .map((c: any) => {
            const pct = [0, 33, 66, 100][c.level] ?? 0;
            return `<div class="lms-comp-row">
              <span class="lms-comp-name">${escapeHtml(c.label)}</span>
              <span class="lms-comp-bar"><span class="lms-comp-fill lms-comp-lvl-${c.level}" style="width:${pct}%"></span></span>
              <span class="lms-comp-level">${escapeHtml(_COMP_LEVEL_LABEL[c.level] || '')}</span>
            </div>`;
        })
        .join('');
    const badges = profile.badges.length
        ? `<div class="lms-badges">${profile.badges
              .map((b: any) => `<span class="lms-badge lms-badge-${b.level}">${escapeHtml(b.label)}</span>`)
              .join('')}</div>`
        : `<p class="lms-comp-empty">Conclua lições de avaliação (classificar, interpretar, casos, decisão, emergência) para conquistar badges.</p>`;

    const overlay = document.createElement('div');
    overlay.id = 'lms-lesson-overlay';
    overlay.className = 'ecbt-overlay';
    // EXCEPTION_LMS_LESSON_OVERLAY (não ASYNC_DIALOG): este overlay abre a partir
    // do training-panel (z-index 9001) — precisa ficar acima do próprio painel
    // que o originou, senão nasce escondido atrás dele (bug 2026-07-03).
    overlay.style.zIndex = String(Z_INDEX.EXCEPTION_LMS_LESSON_OVERLAY);
    overlay.innerHTML = `<div class="ecbt-dialog ecbt-dialog--md lms-lesson" role="dialog" aria-modal="true">
        <div class="lms-lesson-header"><h2>${t('lms.myCompetencies') || 'Minhas competências'}</h2>
          <button class="lms-lesson-close" aria-label="${escapeHtml(t('lms.close') || 'Fechar')}">&times;</button></div>
        <div class="lms-lesson-body">
          <p class="lms-comp-title">Nível: <strong>${escapeHtml(profile.title)}</strong>
            — ${profile.earnedCount}/${profile.totalCount} competências iniciadas</p>
          <div class="lms-comp-rows">${rows}</div>
          ${badges}
        </div>
        <div class="lms-lesson-actions">
          <button class="btn btn-primary" id="lms-comp-close">Fechar</button>
        </div></div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) _closeLessonModal(); });
    document.body.appendChild(overlay);
    overlay.querySelector('.lms-lesson-close')?.addEventListener('click', _closeLessonModal);
    overlay.querySelector('#lms-comp-close')?.addEventListener('click', _closeLessonModal);
}

/** Injeta o botão "Minhas competências" no cabeçalho do painel (idempotente). */
function _injectCompetencyButton() {
    try {
        const header = document.querySelector('.training-panel-header');
        if (!header || header.querySelector('.lms-comp-open')) return;
        const closeBtn = header.querySelector('.training-panel-close');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lms-comp-open';
        btn.title = 'Ver minhas competências e badges';
        btn.setAttribute('aria-label', 'Minhas competências');
        btn.textContent = 'Competências';
        btn.addEventListener('click', () => _renderCompetencyOverlay());
        header.insertBefore(btn, closeBtn || null);
    } catch (e: any) {
        console.debug('[lmsManager] injectCompetencyButton:', e?.message || e);
    }
}

/** Injeta o botao "Importar .ecbt" no cabecalho do painel (idempotente). COURSE-AUTHORING F2. */
function _injectCreateCourseButton() {
    try {
        // Rollback hatch (COURSE-AUTHORING-001 §8): flag desligada → não injeta o
        // botão. O painel LMS segue só-consumo. Camada 1 de defesa (a 2 é o no-op
        // de openCourseAuthoringModal). Mesmo precedente do LMS_PPTX_IMPORT.
        if (!isCourseAuthoringEnabled()) return;
        const header = document.querySelector('.training-panel-header');
        if (!header || header.querySelector('.lms-create-course')) return;
        const closeBtn = header.querySelector('.training-panel-close');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lms-create-course';
        btn.title = t('trainingPanel.action.openSavedClassFileHint') || 'Abrir uma aula salva do computador ou do marketplace';
        btn.setAttribute('aria-label', t('trainingPanel.action.openSavedClassFile') || 'Abrir arquivo .ecbt');
        btn.textContent = t('trainingPanel.action.openSavedClassFileShort') || 'Importar .ecbt';
        btn.addEventListener('click', () => {
            openCourseAuthoringModal(undefined, { startAction: 'import-key' });
        });
        header.insertBefore(btn, closeBtn || null);
    } catch (e: any) {
        console.debug('[lmsManager] injectCreateCourseButton:', e?.message || e);
    }
}

/** Entry point público (window.handleShowCompetencies). */
export function showCompetencies() {
    _renderCompetencyOverlay();
}

/**
 * Public entry point — opens the LMS module with real data (catalog seed +
 * persisted enrollments/certificates). Registered as window.handleOpenTraining
 * via panelDiscoveryAutoRegister; also the deep-link target.
 */
export async function openLmsModule(options: any = {}) {
    const safeOptions = options && typeof options === 'object' ? options : {};
    if (!_flagOn()) {
        showToast(t('lms.toastRollout') || 'Módulo de treinamento em rollout — em breve.', 'info');
        return;
    }
    await _load();
    _ensureAuthoringRefreshListener();
    const panelData = await _currentPanelData();
    // TRAINING-LEARNER-MIN-001 RF-1 (resume-first): o painel NUNCA abre direto
    // no catálogo — o default é a trilha do aluno ("Aprender", hero Continuar/
    // Comece por aqui). Professor com switch "Modo instrutor" ligado (RF-5) e
    // aulas salvas continua caindo na sua bancada.
    // TRAINING-LMS-GAPS-001#8: painel JÁ aberto + re-entrada sem activeTab
    // (libraries.ts, datastudio.ts chamam handleOpenTraining() sem args) →
    // preserva a aba corrente. Sem isto, professor em "Aulas salvas" sem
    // rascunhos revertia "sozinho" para "Aprender" (fallback sobrescrevia).
    const fallbackTab = isTrainingPanelOpen()
        ? getActiveTrainingTab()
        : isInstructorModeEnabled() && panelData.createdCourses.length > 0
          ? 'createdCourses'
          : 'myCourses';
    const activeTab = _normalizeLmsActiveTab(safeOptions.activeTab, fallbackTab);
    openTrainingPanel({
        data: panelData,
        activeTab,
        onAction: _handleAction,
    });
    // B10: se uma lição ficou em andamento (reload sem fechar), reabre-a por cima
    // do painel do aluno. Na aba do professor, o painel "Aulas salvas" precisa
    // permanecer visível para a preparação da aula.
    if (_shouldResumeLessonForActiveTab(activeTab, safeOptions.skipResume)) _maybeResumeLesson();
}

/**
 * "Obter curso" no Library Marketplace (F6): matricula o usuário no curso (se
 * ainda não estiver) e abre o módulo de Treinamento na aba "Meus Cursos". É o
 * ponto de entrada do fluxo "comprado em libraries" → acesso no LMS.
 */
export async function grantCourseEnrollment(trainingId: string) {
    if (!_flagOn()) {
        showToast(t('lms.toastRollout') || 'Módulo de treinamento em rollout — em breve.', 'info');
        return;
    }
    const training = getTrainingById(trainingId);
    if (!training) {
        showToast(t('lms.toastCourseNotFound') || 'Curso não encontrado.', 'warning');
        return;
    }
    await _load();
    _ensureAuthoringRefreshListener();
    if (!_findEnrollment(trainingId)) {
        _enrollments.push({
            training_id: trainingId,
            status: 'active',
            completed_lesson_ids: [],
            enrolled_at: new Date().toISOString(),
            completed_at: null,
        });
        await _persistEnrollments();
        showToast(`Curso "${training.title}" adicionado aos seus treinamentos.`, 'success');
    } else {
        showToast(`Você já tem o curso "${training.title}".`, 'info');
    }
    openTrainingPanel({
        data: await _currentPanelData(),
        activeTab: 'myCourses',
        onAction: _handleAction,
    });
}

async function _handleAction(detail: { action: string; id: string | null; tab: string }) {
    const { action, id } = detail || ({} as any);
    if (!action) return;
    try {
        if (action === 'enroll' && id) return _enroll(id);
        if (action === 'continue' && id) return _openLesson(id);
        if (action === 'restart' && id) return _restart(id);
        if (action === 'download-certificate' && id) return _downloadCertificate(id);
        if (action === 'show-competencies') return _renderCompetencyOverlay();
        if (action === 'open-tours') return (window as any).handleOpenGuidedTours?.();
        if (action === 'create-course') return openCourseAuthoringModal();
        if (action === 'open-class-file') return openCourseAuthoringModal(undefined, { startAction: 'import-key' });
        if (action === 'edit' && id) {
            return openCourseAuthoringModal(id, { initialFocus: 'deck' });
        }
        if (action === 'start-class' && id) {
            return openCourseAuthoringModal(id, { initialFocus: 'deck', startAction: 'present' });
        }
    } catch (e: any) {
        console.debug('[lmsManager] action', action, e?.message || e);
        showToast(t('lms.toastGenericError') || 'Ocorreu um erro. Tente novamente.', 'error');
    }
}

async function _enroll(trainingId: string) {
    const training = getTrainingById(trainingId);
    if (!training) return;
    if (_findEnrollment(trainingId)) {
        showToast(t('lms.toastAlreadyEnrolled') || 'Você já está matriculado neste curso.', 'info');
        return;
    }
    _enrollments.push({
        training_id: trainingId,
        status: 'active',
        completed_lesson_ids: [],
        enrolled_at: new Date().toISOString(),
        completed_at: null,
    });
    await _persistEnrollments();
    _dispatchLmsProgressEvent('enrolled', { trainingId });
    await _refreshPanel();
    showToast(`Matriculado em "${training.title}".`, 'success');
    // UX: já leva o usuário para a primeira lição (sem trocar de aba/clicar de novo).
    _openLesson(trainingId);
}

/** Reinicia um curso concluído — zera o progresso e reabre a primeira lição. */
async function _restart(trainingId: string) {
    const enr = _findEnrollment(trainingId);
    if (!enr) return;
    enr.completed_lesson_ids = [];
    enr.status = 'active';
    enr.completed_at = null;
    enr.last_quiz_score = undefined;
    await _persistEnrollments();
    await _refreshPanel();
    showToast(t('lms.toastCourseRestarted') || 'Curso reiniciado. Bom treino!', 'info');
    _openLesson(trainingId);
}

// ----------------------------------------------------------------
// LESSON PLAYER (reader markdown + quiz inline)
// ----------------------------------------------------------------

/** Minimal markdown → HTML (headings, bold, bullet lists, paragraphs). XSS-safe. */
function _renderMarkdown(md: string): string {
    const lines = String(md || '').split('\n');
    const out: string[] = [];
    let inList = false;
    const inline = (s: string) =>
        escapeHtml(s)
            .replace(
                /!\[([^\]]*)\]\(([^)]+)\)/g,
                (_m, alt, src) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" style="max-width:100%;height:auto">`,
            )
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    for (const raw of lines) {
        const line = raw.trimEnd();
        if (/^###\s+/.test(line)) {
            if (inList) { out.push('</ul>'); inList = false; }
            out.push(`<h4>${inline(line.replace(/^###\s+/, ''))}</h4>`);
        } else if (/^##\s+/.test(line)) {
            if (inList) { out.push('</ul>'); inList = false; }
            out.push(`<h3>${inline(line.replace(/^##\s+/, ''))}</h3>`);
        } else if (/^#\s+/.test(line)) {
            if (inList) { out.push('</ul>'); inList = false; }
            out.push(`<h2>${inline(line.replace(/^#\s+/, ''))}</h2>`);
        } else if (/^\s*-\s+/.test(line)) {
            if (!inList) { out.push('<ul>'); inList = true; }
            out.push(`<li>${inline(line.replace(/^\s*-\s+/, ''))}</li>`);
        } else if (line === '') {
            if (inList) { out.push('</ul>'); inList = false; }
        } else {
            if (inList) { out.push('</ul>'); inList = false; }
            out.push(`<p>${inline(line)}</p>`);
        }
    }
    if (inList) out.push('</ul>');
    return out.join('');
}

let _modelQuizOutlineActive = false;

/** Remove o outline dos poços destacados (lição model-quiz), se ativo. */
function _clearModelQuizOutline() {
    if (!_modelQuizOutlineActive) return;
    _modelQuizOutlineActive = false;
    import('../scene/setup.js')
        .then((s: any) => s.clearOutlineSelection?.())
        .catch((e: any) => console.debug('[lmsManager] clearOutline:', e?.message || e));
}

function _closeLessonModal() {
    _clearModelQuizOutline();
    document.getElementById('lms-lesson-overlay')?.remove();
    // B7: restaura o HUD direito ao fechar/re-renderizar (modo foco off).
    _setHudFocusMode(false);
    // B10: fechar a lição (X/ESC/concluir) limpa o ponto de retomada. Um RELOAD
    // não passa por aqui → o resume persiste e a lição é reaberta em openLmsModule.
    _clearResume();
}

// --- B7: modo foco — esconde o HUD do canto direito enquanto a lição está em
// painel lateral (senão o diálogo cobre bússola/custos/ECBT). Restaurado ao
// fechar/centralizar. Reversível; o modelo 3D segue visível no centro.
const _HUD_FOCUS_IDS = ['geo-hud', 'scene-hud', 'hud-cards-panel', 'equipment-hud-panel', 'filter-radar-hud'];
function _setHudFocusMode(on: boolean) {
    for (const id of _HUD_FOCUS_IDS) {
        document.getElementById(id)?.classList.toggle('lms-hud-focus-hidden', on);
    }
}

// --- B10: retomada de lição após reload (resume intra-lição) -------------------
const LESSON_RESUME_KEY = 'ecbyts-lms-resume';

function _persistResume(r: { trainingId: string; lessonId: string }) {
    try {
        localStorage.setItem(LESSON_RESUME_KEY, JSON.stringify(r));
    } catch (e: any) {
        console.debug('[lmsManager] persistResume:', e?.message || e);
    }
}
function _clearResume() {
    try {
        localStorage.removeItem(LESSON_RESUME_KEY);
    } catch (e: any) {
        console.debug('[lmsManager] clearResume:', e?.message || e);
    }
}
function _getResume(): { trainingId: string; lessonId: string } | null {
    try {
        const raw = localStorage.getItem(LESSON_RESUME_KEY);
        const r = raw ? JSON.parse(raw) : null;
        return r && typeof r.trainingId === 'string' && typeof r.lessonId === 'string' ? r : null;
    } catch {
        return null;
    }
}

/** Reabre a lição em andamento após um reload (se válida e não concluída). */
function _maybeResumeLesson(): boolean {
    const r = _getResume();
    if (!r) return false;
    const enr = _findEnrollment(r.trainingId);
    if (!enr) {
        _clearResume();
        return false;
    }
    const completed = new Set(enr.completed_lesson_ids || []);
    const lesson = getLessonsForTraining(r.trainingId).find((l) => l.id === r.lessonId);
    if (!lesson || completed.has(r.lessonId)) {
        _clearResume();
        return false;
    }
    _renderLesson(r.trainingId, lesson);
    return true;
}

// --- Layout configurável da tela de lição (Calvin 2026-06-14) -----------------
// O usuário escolhe se a lição fica no MEIO da tela (modal, foco total) ou no
// PAINEL LATERAL (dockado à direita, app interativo) para "treinar on flight"
// — usar o sistema enquanto segue o curso. Persistido em localStorage.
const LESSON_DOCK_KEY = 'ecbyts-lms-lesson-dock';
/** @type {{ trainingId: string, lessonId: string } | null} */
let _currentLesson: { trainingId: string; lessonId: string } | null = null;

/**
 * Layout da lição. DEFAULT = 'side' (Calvin 2026-06-14: "o módulo de treinamento
 * deve nascer na barra lateral por default") — só vira 'center' quando o usuário
 * escolhe explicitamente pelo toggle. A escolha persiste em localStorage e vence
 * o default em qualquer lição (sem re-forçar 'side' a cada reabertura).
 */
function _getDockMode(): 'center' | 'side' {
    try {
        return localStorage.getItem(LESSON_DOCK_KEY) === 'center' ? 'center' : 'side';
    } catch {
        return 'side';
    }
}

function _setDockMode(mode: 'center' | 'side') {
    try {
        localStorage.setItem(LESSON_DOCK_KEY, mode);
    } catch (e: any) {
        console.debug('[lmsManager] setDockMode:', e?.message || e);
    }
}

/** Cabeçalho compartilhado da lição: título + toggle de layout + fechar. */
function _lessonHeaderHtml(title: string): string {
    const side = _getDockMode() === 'side';
    const label = side
        ? t('lms.dockCenter') || 'Centralizar'
        : t('lms.dockSide') || 'Painel lateral';
    const hint = side
        ? t('lms.dockCenterHint') || 'Mover a lição para o centro da tela'
        : t('lms.dockSideHint') ||
          'Mover para o painel lateral — treine usando o app ao mesmo tempo';
    return `
        <div class="lms-lesson-header">
          <h2>${escapeHtml(title)}</h2>
          <div class="lms-lesson-header-actions">
            <button class="lms-lesson-dock-toggle" type="button" title="${escapeHtml(hint)}"
              aria-label="${escapeHtml(hint)}">${escapeHtml(label)}</button>
            <button class="lms-lesson-close" aria-label="${escapeHtml(t('lms.close') || 'Fechar')}">&times;</button>
          </div>
        </div>`;
}

/** Alterna centro ↔ lateral, persiste e reabre a lição atual no novo layout. */
function _toggleLessonDock() {
    _setDockMode(_getDockMode() === 'side' ? 'center' : 'side');
    if (_currentLesson) {
        const lessons = getLessonsForTraining(_currentLesson.trainingId);
        const idx = lessons.findIndex((l) => l.id === _currentLesson!.lessonId);
        if (idx >= 0) _openLessonByIndex(_currentLesson.trainingId, idx);
    }
}

/** Opens the next pending lesson (written reader OR quiz) for a training. */
function _openLesson(trainingId: string) {
    const enr = _findEnrollment(trainingId);
    if (!enr) { showToast(t('lms.toastEnrollFirst') || 'Matricule-se primeiro.', 'warning'); return; }
    const completed = Array.isArray(enr.completed_lesson_ids) ? enr.completed_lesson_ids : [];
    const next = resolveNextLesson(trainingId, completed);
    if (!next) { showToast(t('lms.toastCourseCompleted') || 'Curso concluído.', 'success'); return; }
    _renderLesson(trainingId, next);
}

/** Dispatcher: renderiza a lição conforme o tipo (written/video/quiz/interactive). */
function _renderLesson(trainingId: string, lesson: any) {
    _currentLesson = { trainingId, lessonId: lesson.id };
    if (lesson.type === 'quiz') return _renderQuiz(trainingId, lesson);
    if (lesson.type === 'video') return _renderVideo(trainingId, lesson);
    if (lesson.type === 'interactive') return _renderInteractive(trainingId, lesson);
    if (lesson.type === 'model-quiz') return _renderModelQuiz(trainingId, lesson);
    if (lesson.type === 'classify') return _renderClassify(trainingId, lesson);
    if (lesson.type === 'interpret') return _renderInterpret(trainingId, lesson);
    if (lesson.type === 'case') return _renderCase(trainingId, lesson);
    if (lesson.type === 'order-investigation') return _renderOrderInvestigation(trainingId, lesson);
    if (lesson.type === 'remediation-decision') return _renderRemediationDecision(trainingId, lesson);
    if (lesson.type === 'emergency' || lesson.type === 'checklist') return _renderOrdering(trainingId, lesson);
    return _renderReader(trainingId, lesson);
}

/** Abre a lição em um índice específico da lista ordenada (navegação livre). */
function _openLessonByIndex(trainingId: string, idx: number) {
    const lessons = getLessonsForTraining(trainingId);
    if (idx < 0 || idx >= lessons.length) return;
    _renderLesson(trainingId, lessons[idx]);
}

/**
 * Barra de navegação "‹ / ›" entre lições + indicador "Lição X de N".
 * Botões desabilitados nas extremidades. CSP-safe (wire via addEventListener
 * em _wireLessonNav, sem on*= inline).
 */
function _lessonNavHtml(trainingId: string, lessonId: string): string {
    const lessons = getLessonsForTraining(trainingId);
    const idx = lessons.findIndex((l) => l.id === lessonId);
    const total = lessons.length;
    const prevDis = idx <= 0 ? 'disabled' : '';
    const nextDis = idx < 0 || idx >= total - 1 ? 'disabled' : '';
    return `
      <button type="button" class="lms-nav-btn lms-nav-prev" ${prevDis}
        aria-label="${escapeHtml(t('lms.prevLesson') || 'Lição anterior')}" title="${escapeHtml(t('lms.prevLesson') || 'Lição anterior')}">&#8249;</button>
      <span class="lms-nav-indicator">${escapeHtml(
          t('lms.lessonProgress', { current: idx + 1, total }) ||
              `Lição ${idx + 1} de ${total}`,
      )}</span>
      <button type="button" class="lms-nav-btn lms-nav-next" ${nextDis}
        aria-label="${escapeHtml(t('lms.nextLesson') || 'Próxima lição')}" title="${escapeHtml(t('lms.nextLesson') || 'Próxima lição')}">&#8250;</button>
      <span class="lms-nav-spacer"></span>`;
}

/** Liga os botões "‹ / ›" da barra de navegação ao _openLessonByIndex. */
function _wireLessonNav(overlay: HTMLElement, trainingId: string, lessonId: string) {
    const lessons = getLessonsForTraining(trainingId);
    const idx = lessons.findIndex((l) => l.id === lessonId);
    overlay.querySelector('.lms-nav-prev')?.addEventListener('click', () => {
        if (idx > 0) _openLessonByIndex(trainingId, idx - 1);
    });
    overlay.querySelector('.lms-nav-next')?.addEventListener('click', () => {
        if (idx >= 0 && idx < lessons.length - 1) _openLessonByIndex(trainingId, idx + 1);
    });
}

function _renderVideo(trainingId: string, lesson: any) {
    // autoplay=1: o iframe só é criado quando o usuário pede play (facade), então
    // autoplay aqui inicia a reprodução nesse momento, não no carregamento da lição.
    const embedUrl = buildYouTubeEmbedUrl(lesson.videoUrl, { autoplay: true });
    if (!embedUrl) {
        // Sem vídeo válido vinculado: degrada para "concluir" sem prometer player.
        showToast('Vídeo indisponível para esta lição.', 'warning');
        return _markLessonComplete(trainingId, lesson.id);
    }
    const thumb = youTubeThumbnailUrl(lesson.videoUrl);
    const posterStyle = thumb ? ` style="background-image:url('${escapeHtml(thumb)}')"` : '';
    const caption = lesson.caption ? `<p class="lms-video-caption">${escapeHtml(lesson.caption)}</p>` : '';
    // B6 (WCAG 1.2.2): transcrição textual sob o player + nota de legendas (CC).
    const transcript = lesson.transcript
        ? `<details class="lms-video-transcript"><summary>${t('lms.videoTranscript') || 'Transcrição do vídeo'}</summary>
             <div class="lms-video-transcript-body">${_renderMarkdown(lesson.transcript)}</div></details>`
        : `<p class="lms-video-cc-note">${escapeHtml(t('lms.transcriptUnavailable') || 'Ative as legendas (CC) no player. Transcrição não disponível para esta lição.')}</p>`;
    const overlay = _lessonOverlay(`
        ${_lessonHeaderHtml(lesson.title)}
        <div class="lms-lesson-body">
          <div class="lms-video-wrap">
            <button type="button" class="lms-video-facade"${posterStyle}
              aria-label="${escapeHtml(t('lms.playVideo') || 'Reproduzir vídeo')}">
              <span class="lms-video-play" aria-hidden="true">&#9654;</span>
            </button>
          </div>
          ${caption}
          ${transcript}
        </div>
        <div class="lms-lesson-actions">
          ${_lessonNavHtml(trainingId, lesson.id)}
          <button class="btn btn-primary" id="lms-complete-lesson">Marcar como assistida</button>
        </div>`);
    // Click-to-load (facade): o iframe do YouTube só carrega quando o usuário
    // clica play. Isso elimina o muro anti-bot do YouTube ("Sign in to confirm
    // you're not a bot") que aparecia ao auto-embedar o vídeo de exemplo e
    // deixava o usuário preso na lição. Padrão privacy/perf de lazy-embed.
    overlay.querySelector('.lms-video-facade')?.addEventListener('click', () => {
        const wrap = overlay.querySelector('.lms-video-wrap');
        if (!wrap) return;
        wrap.innerHTML = `<iframe src="${escapeHtml(embedUrl)}" title="${escapeHtml(lesson.title)}"
              loading="lazy" referrerpolicy="strict-origin-when-cross-origin"
              allow="autoplay; accelerometer; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen></iframe>`;
    });
    overlay.querySelector('.lms-lesson-close')?.addEventListener('click', _closeLessonModal);
    overlay.querySelector('#lms-complete-lesson')?.addEventListener('click', () =>
        _markLessonComplete(trainingId, lesson.id),
    );
    _wireLessonNav(overlay, trainingId, lesson.id);
}

/**
 * Lição 'interactive': o usuário pratica MANIPULANDO o próprio ecbyts. Ao
 * iniciar, o painel do LMS fecha e um guided tour (utils/tour) aparece sobre o
 * app real, destacando os controles reais. Ao concluir o tour, a lição é
 * marcada automaticamente e o painel reabre. O botão "Marcar como concluída"
 * é fail-safe (nunca deixa o usuário preso se o tour não estiver disponível).
 */
function _renderInteractive(trainingId: string, lesson: any) {
    const overlay = _lessonOverlay(`
        ${_lessonHeaderHtml(lesson.title)}
        <div class="lms-lesson-body">
          ${_renderMarkdown(lesson.markdown || '')}
          <div class="lms-interactive-hint">
            Ao iniciar, o painel fecha e um guia passo a passo aparece sobre o app
            real — você pratica clicando nos controles da própria tela. Ao concluir
            o guia, esta lição é marcada automaticamente.
          </div>
        </div>
        <div class="lms-lesson-actions">
          ${_lessonNavHtml(trainingId, lesson.id)}
          <button class="btn btn-secondary" id="lms-skip-interactive">${t('lms.markComplete') || 'Marcar como concluída'}</button>
          <button class="btn btn-primary" id="lms-start-interactive">${t('lms.startPractice') || 'Iniciar prática no app'}</button>
        </div>`);
    overlay.querySelector('.lms-lesson-close')?.addEventListener('click', _closeLessonModal);
    overlay.querySelector('#lms-skip-interactive')?.addEventListener('click', () =>
        _markLessonComplete(trainingId, lesson.id),
    );
    overlay.querySelector('#lms-start-interactive')?.addEventListener('click', () =>
        _startInteractive(trainingId, lesson),
    );
    _wireLessonNav(overlay, trainingId, lesson.id);
}

async function _startInteractive(trainingId: string, lesson: any) {
    const tourId = lesson.tourId;
    const startFn = (window as any).handleStartGuidedTour;
    if (!tourId || typeof startFn !== 'function') {
        showToast(
            t('lms.practiceUnavailable') || 'Prática interativa indisponível agora — marcando como concluída.',
            'info',
        );
        return _markLessonComplete(trainingId, lesson.id);
    }
    // Libera a tela para o guided tour: fecha a lição e o painel do LMS.
    _closeLessonModal();
    closeTrainingPanel();
    const cleanup = () => {
        window.removeEventListener('guidedTourComplete', onComplete);
        window.removeEventListener('guidedTourExited', onExit);
        _setPracticeExitLabel(false);
    };
    // Ouve a conclusão do tour (utils/tour dispara 'guidedTourComplete' com o id).
    const onComplete = (ev: any) => {
        const completedId = ev?.detail?.tourId;
        if (completedId && completedId !== tourId) return; // outro tour — ignora
        cleanup();
        _completeInteractiveAndReopen(trainingId, lesson.id);
    };
    // RF-6: "Sair da prática" (skip do tour) volta ao ponto da trilha SEM marcar
    // a lição — saída sempre clara, nunca tela "nua" sem feedback.
    const onExit = (ev: any) => {
        const exitedId = ev?.detail?.tourId;
        if (exitedId && exitedId !== tourId) return; // outro tour — ignora
        cleanup();
        openLmsModule({ activeTab: 'myCourses' });
    };
    window.addEventListener('guidedTourComplete', onComplete);
    window.addEventListener('guidedTourExited', onExit);
    try {
        // silent: o feedback de falha aqui é nosso (toast legível + painel reaberto).
        const result = await startFn(tourId, { silent: true });
        if (result && result.ok === false) {
            throw new Error(result.reason || 'tour-start-failed');
        }
        _setPracticeExitLabel(true);
    } catch (e: any) {
        cleanup();
        console.debug('[lmsManager] startInteractive:', e?.message || e);
        showToast(
            t('lms.practiceStartFailed') ||
                'Não foi possível iniciar a prática guiada. O painel foi reaberto — tente novamente.',
            'warning',
        );
        openLmsModule({ activeTab: 'myCourses' });
    }
}

/**
 * RF-6: enquanto a prática guiada do LMS está ativa, o botão "Skip" do tour
 * vira a saída clara "Sair da prática" (restaurado ao rótulo padrão no fim).
 */
function _setPracticeExitLabel(active: boolean) {
    const skipBtn = document.querySelector('#tour-tooltip .tour-skip-btn');
    if (!skipBtn) return;
    skipBtn.textContent = active ? t('lms.exitPractice') || 'Sair da prática' : t('tourSkip') || 'Skip';
}

/** Marca a lição interativa como concluída e reabre o painel do LMS. */
async function _completeInteractiveAndReopen(trainingId: string, lessonId: string) {
    await _markLessonComplete(trainingId, lessonId);
    openLmsModule({ activeTab: 'myCourses' });
}

function _lessonOverlay(innerHtml: string): HTMLElement {
    _closeLessonModal();
    const side = _getDockMode() === 'side';
    const overlay = document.createElement('div');
    overlay.id = 'lms-lesson-overlay';
    // EXCEPTION_LMS_LESSON_OVERLAY (não ASYNC_DIALOG): a lição abre a partir do
    // training-panel (z-index 9001, ver app/css/training-panel.css) — clicar
    // "Continuar" com o painel ainda aberto criava o overlay em ASYNC_DIALOG
    // (9000), atrás do próprio painel, e a lição nunca ficava visível (bug
    // real reportado por Calvin 2026-07-03, reproduzido com clique de mouse
    // real: overlay existia no DOM com display:block, escondido por trás).
    overlay.style.zIndex = String(Z_INDEX.EXCEPTION_LMS_LESSON_OVERLAY);
    if (side) {
        // Painel lateral: container transparente sem captura de clique (app
        // interativo); só o diálogo à direita recebe eventos. Sem aria-modal.
        overlay.className = 'lms-lesson-sidedock';
        overlay.innerHTML = `<div class="ecbt-dialog lms-lesson lms-lesson--side" role="dialog">${innerHtml}</div>`;
    } else {
        // Centro: modal clássico com backdrop (foco total).
        overlay.className = 'ecbt-overlay';
        overlay.innerHTML = `<div class="ecbt-dialog ecbt-dialog--lg lms-lesson" role="dialog" aria-modal="true">${innerHtml}</div>`;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) _closeLessonModal(); });
    }
    document.body.appendChild(overlay);
    // Toggle de layout (centro ↔ lateral) — comum a todos os tipos de lição.
    overlay.querySelector('.lms-lesson-dock-toggle')?.addEventListener('click', _toggleLessonDock);
    // B5 (a11y): foco ao abrir + ESC fecha + focus-trap (só no modal central).
    _wireLessonA11y(overlay, !side);
    // B10: marca o ponto de retomada (limpo em _closeLessonModal acima; re-setado
    // aqui após montar). Só um RELOAD deixa o resume vivo para reabrir.
    if (_currentLesson) _persistResume(_currentLesson);
    // B7: no painel lateral, ativa o modo foco (esconde o HUD direito p/ não
    // sobrepor). No modo centro o backdrop já cobre tudo — mantém o HUD.
    _setHudFocusMode(side);
    return overlay;
}

/**
 * Acessibilidade do overlay de lição (WCAG 2.4.3 / 2.1.2 / 4.1.3):
 * - move o foco para dentro ao abrir (1º controle focável);
 * - ESC fecha;
 * - no modo CENTRO (modal), prende o foco (Tab cicla dentro do diálogo). No modo
 *   lateral NÃO prende (o app continua interativo, por design).
 */
function _wireLessonA11y(overlay: HTMLElement, isModal: boolean) {
    const dialog = overlay.querySelector('.lms-lesson') as HTMLElement | null;
    const focusables = () =>
        Array.from(
            dialog?.querySelectorAll<HTMLElement>(
                'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
            ) || [],
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    // foco inicial: 1º controle (ou o diálogo).
    setTimeout(() => {
        const list = focusables();
        (list[0] || dialog)?.focus?.();
    }, 0);
    overlay.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            _closeLessonModal();
            return;
        }
        if (!isModal || e.key !== 'Tab') return;
        const list = focusables();
        if (list.length === 0) return;
        const first = list[0]!;
        const last = list[list.length - 1]!;
        const active = document.activeElement as HTMLElement;
        if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    });
    if (dialog && !dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
}

function _renderReader(trainingId: string, lesson: any) {
    const overlay = _lessonOverlay(`
        ${_lessonHeaderHtml(lesson.title)}
        <div class="lms-lesson-body">${_renderMarkdown(lesson.markdown || '')}</div>
        <div class="lms-lesson-actions">
          ${_lessonNavHtml(trainingId, lesson.id)}
          <button class="btn btn-primary" id="lms-complete-lesson">${t('lms.completeLesson') || 'Concluir lição'}</button>
        </div>`);
    overlay.querySelector('.lms-lesson-close')?.addEventListener('click', _closeLessonModal);
    overlay.querySelector('#lms-complete-lesson')?.addEventListener('click', () =>
        _markLessonComplete(trainingId, lesson.id),
    );
    _wireLessonNav(overlay, trainingId, lesson.id);
}

function _renderQuiz(trainingId: string, lesson: any) {
    const quiz = getQuizForTraining(trainingId);
    if (!quiz) { return _markLessonComplete(trainingId, lesson.id); }
    const qs = quiz.questions
        .map((q: any, i: number) => {
            let body: string;
            if (q.type === 'true_false') {
                body = `
                  <label><input type="radio" name="${q.id}" value="true"> ${escapeHtml(t('lms.true') || 'Verdadeiro')}</label>
                  <label><input type="radio" name="${q.id}" value="false"> ${escapeHtml(t('lms.false') || 'Falso')}</label>`;
            } else {
                body = (q.options || [])
                    .map((o: any) => `<label><input type="radio" name="${q.id}" value="${escapeHtml(o.id)}"> ${escapeHtml(o.text)}</label>`)
                    .join('');
            }
            return `<fieldset class="lms-q"><legend>${i + 1}. ${escapeHtml(q.text)}</legend>${body}</fieldset>`;
        })
        .join('');
    const overlay = _lessonOverlay(`
        ${_lessonHeaderHtml(lesson.title)}
        <div class="lms-lesson-body">${qs}</div>
        <div class="lms-lesson-actions">
          ${_lessonNavHtml(trainingId, lesson.id)}
          <button class="btn btn-primary" id="lms-submit-quiz">${t('lms.submitAnswers') || 'Enviar respostas'}</button>
          <span id="lms-quiz-result" aria-live="polite"></span>
        </div>`);
    overlay.querySelector('.lms-lesson-close')?.addEventListener('click', _closeLessonModal);
    _wireLessonNav(overlay, trainingId, lesson.id);
    overlay.querySelector('#lms-submit-quiz')?.addEventListener('click', () => {
        const answers: Record<string, any> = {};
        for (const q of quiz.questions) {
            const checked = overlay.querySelector(`input[name="${q.id}"]:checked`) as HTMLInputElement | null;
            if (!checked) continue;
            answers[q.id] = q.type === 'true_false' ? checked.value === 'true' : checked.value;
        }
        const graded = gradeQuiz(quiz.questions, answers, { passing_score: quiz.passing_score });
        const result = overlay.querySelector('#lms-quiz-result');
        if (graded.passed) {
            if (result) result.textContent = `Aprovado — ${graded.score}%`;
            // keepOpen: mantém o resultado do quiz visível; o aluno fecha quando
            // quiser (mesmo padrão de _renderSelectScenario) — sem isto o painel
            // reaberto por _refreshPanel cobria o feedback antes do aluno vê-lo.
            _markLessonComplete(trainingId, lesson.id, graded.score, true);
        } else if (result) {
            result.textContent = `Nota ${graded.score}% (mínimo ${quiz.passing_score}%). Revise e tente de novo.`;
        }
    });
}

/**
 * Lição 'model-quiz': pergunta gerada a partir dos ELEMENTOS REAIS do modelo.
 * Força o layout lateral (o modelo 3D precisa estar visível), classifica os
 * poços contra os limites (computeElementCompliance → VR/VP/VI), destaca os
 * candidatos no 3D (outline) e pergunta quais estão acima do VR. Correção por
 * dados reais. Degrada graciosamente se não houver modelo/poços.
 */
async function _renderModelQuiz(trainingId: string, lesson: any) {
    // O modelo precisa estar visível → fecha o catálogo (layout segue a preferência,
    // default 'side'). O usuário pode centralizar pelo toggle se preferir.
    closeTrainingPanel();

    // 1. Lê os poços reais do modelo e classifica cada um contra os limites.
    let candidates: any[] = [];
    try {
        const mgr: any = await import('../../core/elements/manager.js' as string);
        const comp: any = await import('../../core/elements/complianceOverlay.js' as string);
        const wells = (mgr.getAllElements?.() || []).filter(
            (e: any) => e && (e.familyId === 'well' || e.family === 'well'),
        );
        candidates = wells.map((w: any) => {
            const severity = comp.computeElementCompliance?.(w) ?? null;
            return { id: w.id, name: w.name || w.id, exceeds: isAboveReference(severity), severity };
        });
    } catch (e: any) {
        console.debug('[lmsManager] modelQuiz read elements:', e?.message || e);
    }

    const question = buildModelElementQuestion(candidates);
    if (!question.ok) {
        showToast(
            'Carregue um modelo com poços (e dados) para esta prática. Marcando como concluída.',
            'info',
        );
        return _markLessonComplete(trainingId, lesson.id);
    }

    // 2. Destaca os poços candidatos no 3D (outline) — "poços destacados".
    try {
        const scene: any = await import('../scene/setup.js' as string);
        const mgr: any = await import('../../core/elements/manager.js' as string);
        const meshes = question.highlightIds
            .map((id: string) => mgr.getMeshByElementId?.(id))
            .filter(Boolean);
        if (meshes.length) {
            scene.setOutlineSelection?.(meshes);
            _modelQuizOutlineActive = true;
        }
    } catch (e: any) {
        console.debug('[lmsManager] modelQuiz outline:', e?.message || e);
    }

    // 3. Renderiza a pergunta multi-select na lateral.
    const optionsHtml = question.options
        .map(
            (o: any) => `
            <label class="lms-mq-option">
              <input type="checkbox" class="lms-mq-check" data-well-id="${escapeHtml(o.id)}">
              <span class="lms-mq-name">${escapeHtml(o.label)}</span>
              <button type="button" class="lms-mq-focus" data-focus-id="${escapeHtml(o.id)}"
                title="${escapeHtml(t('lms.selectWellInModel') || 'Selecionar o poço no modelo')}">${escapeHtml(t('lms.view') || 'ver')}</button>
            </label>`,
        )
        .join('');
    const overlay = _lessonOverlay(`
        ${_lessonHeaderHtml(lesson.title)}
        <div class="lms-lesson-body">
          <p class="lms-mq-intro">${escapeHtml(question.questionText)}</p>
          <div class="lms-mq-options">${optionsHtml}</div>
          <p class="lms-mq-result" id="lms-mq-result" aria-live="polite"></p>
        </div>
        <div class="lms-lesson-actions">
          ${_lessonNavHtml(trainingId, lesson.id)}
          <button class="btn btn-primary" id="lms-mq-submit">${t('lms.submitAnswer') || 'Enviar resposta'}</button>
        </div>`);
    overlay.querySelector('.lms-lesson-close')?.addEventListener('click', _closeLessonModal);
    _wireLessonNav(overlay, trainingId, lesson.id);

    // "ver": seleciona o poço no modelo (usuário acessa o elemento real).
    overlay.querySelectorAll('.lms-mq-focus').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            const id = (btn as HTMLElement).dataset.focusId;
            if (id && typeof (window as any).handleSelectElement === 'function') {
                (window as any).handleSelectElement(id);
            }
        });
    });

    // Enviar: corrige por dados reais, marca concluída se passou.
    overlay.querySelector('#lms-mq-submit')?.addEventListener('click', () => {
        const selected = [...overlay.querySelectorAll('.lms-mq-check')]
            .filter((c) => (c as HTMLInputElement).checked)
            .map((c) => (c as HTMLInputElement).dataset.wellId as string)
            .filter(Boolean);
        const graded = gradeModelQuiz(selected, question.correctIds);
        const result = overlay.querySelector('#lms-mq-result');
        if (graded.passed) {
            if (result) result.textContent = `Correto! ${graded.score}%`;
            _markLessonComplete(trainingId, lesson.id, graded.score);
        } else if (result) {
            const dicas: string[] = [];
            if (graded.missed.length) dicas.push(`faltou marcar ${graded.missed.length}`);
            if (graded.wrong.length) dicas.push(`${graded.wrong.length} marcado(s) a mais`);
            result.textContent = `Quase: ${graded.score}% (${dicas.join(', ')}). Reveja os poços destacados.`;
        }
    });
}

/** Destaca um único poço no 3D (outline) — usado por classify/interpret. */
async function _highlightWell(wellId: string): Promise<void> {
    try {
        const scene: any = await import('../scene/setup.js' as string);
        const mgr: any = await import('../../core/elements/manager.js' as string);
        const mesh = mgr.getMeshByElementId?.(wellId);
        if (mesh) {
            scene.setOutlineSelection?.([mesh]);
            _modelQuizOutlineActive = true;
        }
    } catch (e: any) {
        console.debug('[lmsManager] highlightWell:', e?.message || e);
    }
}

/**
 * Renderiza uma lição de ESCOLHA ÚNICA sobre o modelo (classify/interpret) na
 * lateral: pergunta + opções (radio) + correção por dados reais.
 */
function _renderSingleSelect(
    trainingId: string,
    lesson: any,
    vm: {
        questionText: string;
        contextNote?: string;
        options: ReadonlyArray<{ id: string; label: string }>;
        correctId: string;
        focusWellId?: string;
        /** grader customizado p/ nota parcial (F4 decisões). Se ausente: exato 100/0. */
        onGrade?: (chosenId: string) => { passed: boolean; score: number; message: string };
    },
) {
    const name = `mq-${lesson.id}`;
    const optionsHtml = vm.options
        .map(
            (o) => `
            <label class="lms-mq-option">
              <input type="radio" name="${escapeHtml(name)}" class="lms-ss-radio" value="${escapeHtml(o.id)}">
              <span class="lms-mq-name">${escapeHtml(o.label)}</span>
            </label>`,
        )
        .join('');
    const note = vm.contextNote ? `<p class="lms-video-caption">${escapeHtml(vm.contextNote)}</p>` : '';
    const focusBtn = vm.focusWellId
        ? `<button type="button" class="lms-mq-focus" id="lms-ss-focus" title="${escapeHtml(t('lms.selectWellInModel') || 'Selecionar o poço no modelo')}">${t('lms.viewWellInModel') || 'ver poço no modelo'}</button>`
        : '';
    const overlay = _lessonOverlay(`
        ${_lessonHeaderHtml(lesson.title)}
        <div class="lms-lesson-body">
          <p class="lms-mq-intro">${escapeHtml(vm.questionText)}</p>
          ${focusBtn}
          <div class="lms-mq-options">${optionsHtml}</div>
          ${note}
          <p class="lms-mq-result" id="lms-ss-result" aria-live="polite"></p>
        </div>
        <div class="lms-lesson-actions">
          ${_lessonNavHtml(trainingId, lesson.id)}
          <button class="btn btn-primary" id="lms-ss-submit">${t('lms.submitAnswer') || 'Enviar resposta'}</button>
        </div>`);
    overlay.querySelector('.lms-lesson-close')?.addEventListener('click', _closeLessonModal);
    _wireLessonNav(overlay, trainingId, lesson.id);
    overlay.querySelector('#lms-ss-focus')?.addEventListener('click', () => {
        if (vm.focusWellId && typeof (window as any).handleSelectElement === 'function') {
            (window as any).handleSelectElement(vm.focusWellId);
        }
    });
    overlay.querySelector('#lms-ss-submit')?.addEventListener('click', () => {
        const chosen = (overlay.querySelector(`input[name="${name}"]:checked`) as HTMLInputElement | null)?.value;
        const result = overlay.querySelector('#lms-ss-result');
        if (!chosen) {
            if (result) result.textContent = 'Selecione uma opção.';
            return;
        }
        if (vm.onGrade) {
            const g = vm.onGrade(chosen);
            if (result) result.textContent = g.message;
            // keepOpen: mantém o feedback pedagógico (justificativa/dado) visível;
            // o aluno avança pela navegação ‹ ›. Marca a conclusão em background.
            if (g.passed) _markLessonComplete(trainingId, lesson.id, g.score, true);
            return;
        }
        if (chosen === vm.correctId) {
            if (result) result.textContent = 'Correto!';
            _markLessonComplete(trainingId, lesson.id, 100);
        } else {
            const right = vm.options.find((o) => o.id === vm.correctId)?.label || '';
            if (result) result.textContent = `Não é essa. A resposta correta: ${right}`;
        }
    });
}

/** Lição 'classify': classifica a faixa VR/VP/VI de um poço real (escolha única). */
async function _renderClassify(trainingId: string, lesson: any) {
    closeTrainingPanel();
    let chosenWell: any = null;
    let band: any = 'below_vr';
    try {
        const mgr: any = await import('../../core/elements/manager.js' as string);
        const comp: any = await import('../../core/elements/complianceOverlay.js' as string);
        const wells = (mgr.getAllElements?.() || []).filter(
            (e: any) => e && (e.familyId === 'well' || e.family === 'well'),
        );
        // Prefere um poço com excedência (pergunta mais rica); senão, o primeiro.
        const scored = wells.map((w: any) => ({ w, sev: comp.computeElementCompliance?.(w) ?? null }));
        chosenWell = (scored.find((s: any) => s.sev) || scored[0])?.w || null;
        const sev = chosenWell ? comp.computeElementCompliance?.(chosenWell) ?? null : null;
        band = bandFromSeverity(sev);
    } catch (e: any) {
        console.debug('[lmsManager] classify read:', e?.message || e);
    }
    if (!chosenWell) {
        showToast('Carregue um modelo com poços para esta prática. Marcando como concluída.', 'info');
        return _markLessonComplete(trainingId, lesson.id);
    }
    await _highlightWell(chosenWell.id);
    const question = buildClassifyQuestion({ wellName: chosenWell.name || chosenWell.id, correctBand: band });
    if (!question.ok) return _markLessonComplete(trainingId, lesson.id);
    _renderSingleSelect(trainingId, lesson, {
        questionText: question.questionText,
        options: question.options,
        correctId: question.correctId,
        focusWellId: chosenWell.id,
    });
}

/** Lição 'interpret': interpreta a tendência temporal (Mann-Kendall) de um poço real. */
async function _renderInterpret(trainingId: string, lesson: any) {
    closeTrainingPanel();
    let pick: { well: any; paramLabel: string; n: number; trend: any } | null = null;
    try {
        const mgr: any = await import('../../core/elements/manager.js' as string);
        const trends: any = await import('../../core/analytics/temporalTrends.js' as string);
        // mapa campaignId -> data (p/ ordenar a série), via getCampaigns global.
        const campaigns = (window as any).getCampaigns?.() || [];
        const campDate: Record<string, string> = {};
        for (const c of campaigns) campDate[c.id] = c.date || c.id;
        const wells = (mgr.getAllElements?.() || []).filter(
            (e: any) => e && (e.familyId === 'well' || e.family === 'well'),
        );
        for (const w of wells) {
            const byParam: Record<string, Array<{ t: string; v: number }>> = {};
            for (const o of w.data?.observations || []) {
                const pid = o.parameterId;
                const v = Number(o.value);
                if (!pid || !Number.isFinite(v)) continue;
                const t = o.date || campDate[o.campaignId] || o.campaignId || '';
                (byParam[pid] ||= []).push({ t: String(t), v });
            }
            for (const [pid, arr] of Object.entries(byParam)) {
                if (arr.length < 4) continue;
                arr.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
                const mk = trends.computeMannKendallTrend?.(arr.map((p) => p.v));
                pick = { well: w, paramLabel: pid, n: arr.length, trend: trendFromMannKendall(mk?.trend) };
                break;
            }
            if (pick) break;
        }
    } catch (e: any) {
        console.debug('[lmsManager] interpret read:', e?.message || e);
    }
    if (!pick) {
        showToast('Modelo sem série temporal suficiente (≥4 campanhas) para esta prática. Marcando como concluída.', 'info');
        return _markLessonComplete(trainingId, lesson.id);
    }
    await _highlightWell(pick.well.id);
    const question = buildInterpretQuestion({
        wellName: pick.well.name || pick.well.id,
        parameterLabel: pick.paramLabel,
        n: pick.n,
        correctTrend: pick.trend,
    });
    if (!question.ok) return _markLessonComplete(trainingId, lesson.id);
    _renderSingleSelect(trainingId, lesson, {
        questionText: question.questionText,
        contextNote: question.contextNote,
        options: question.options,
        correctId: question.correctId,
        focusWellId: pick.well.id,
    });
}

/** Lição 'order-investigation' (F4 RF-9): escolher a melhor investigação agora. */
function _renderOrderInvestigation(trainingId: string, lesson: any) {
    // Drill de decisão: não precisa do modelo 3D — respeita a preferência de dock.
    const sc = getOrderInvestigationScenario(lesson.decisionId);
    if (!sc) {
        showToast('Cenário não encontrado. Marcando como concluída.', 'info');
        return _markLessonComplete(trainingId, lesson.id);
    }
    const q = buildOrderInvestigationQuestion(sc.scenario, sc.gaps, sc.options);
    if (!q.ok) return _markLessonComplete(trainingId, lesson.id);
    _renderSingleSelect(trainingId, lesson, {
        questionText: q.questionText,
        contextNote: sc.title,
        options: q.options,
        correctId: q.correctId,
        onGrade: (chosen) => {
            const g = gradeOrderInvestigation(chosen, sc.gaps, sc.options);
            const picked = sc.options.find((o) => o.id === chosen);
            const data = picked ? ` ${picked.result}` : '';
            const msg = g.score === 100
                ? `Correto!${data}`
                : g.hint
                  ? `${g.hint} (Melhor: ${g.correctLabel}.)`
                  : `A melhor opção: ${g.correctLabel}.`;
            return { passed: g.passed || g.score >= 60, score: g.score, message: msg };
        },
    });
}

/** Lição 'remediation-decision' (F4 RF-10): escolher a técnica adequada. */
function _renderRemediationDecision(trainingId: string, lesson: any) {
    // Drill de decisão: não precisa do modelo 3D — respeita a preferência de dock.
    const sc = getRemediationScenario(lesson.decisionId);
    if (!sc) {
        showToast('Cenário não encontrado. Marcando como concluída.', 'info');
        return _markLessonComplete(trainingId, lesson.id);
    }
    const q = buildRemediationDecision(sc.profile, sc.techniques);
    if (!q.ok) return _markLessonComplete(trainingId, lesson.id);
    _renderSingleSelect(trainingId, lesson, {
        questionText: `${q.profileSummary} ${q.questionText}`,
        contextNote: sc.title,
        options: q.options,
        correctId: q.bestId,
        onGrade: (chosen) => {
            const g = gradeRemediationDecision(chosen, sc.profile, sc.techniques);
            const picked = sc.techniques.find((t) => t.id === chosen);
            const why = picked ? ` ${picked.rationale}` : '';
            const msg = g.score === 100
                ? `Excelente escolha — a melhor técnica.${why}`
                : g.score === 70
                  ? `Adequada, mas não a ótima.${why} ${g.hint || ''}`
                  : `${g.hint || ''}`;
            return { passed: g.passed, score: g.score, message: msg.trim() };
        },
    });
}

// --- Ordenação: emergência / checklist (LMS-INTERACTIVE-ASSESS-001 F5) ---------
/** Renderiza a lista ordenável (setas ↑/↓, CSP-safe) e corrige via gradeOrdering. */
function _renderOrdering(trainingId: string, lesson: any) {
    // Exercício de ordenação: não precisa do modelo 3D — respeita a preferência de dock.
    const ex = getOrderingExerciseById(lesson.exerciseId);
    if (!ex) {
        showToast('Exercício não encontrado. Marcando como concluída.', 'info');
        return _markLessonComplete(trainingId, lesson.id);
    }
    // ordem inicial = embaralhamento determinístico (estável entre re-renders).
    const order: string[] = shuffledSteps(ex).map((s) => s.id);
    const labelOf = (id: string) => ex.steps.find((s) => s.id === id)?.label || id;
    const timeNote =
        ex.category === 'emergency' && Number.isFinite(ex.timeLimitS)
            ? `<p class="lms-video-caption">Tempo de referência: ${ex.timeLimitS}s (apenas orientativo).</p>`
            : '';

    const overlay = _lessonOverlay(`
        ${_lessonHeaderHtml(lesson.title)}
        <div class="lms-lesson-body">
          <p class="lms-mq-intro">${escapeHtml(ex.scenario)}</p>
          <p class="lms-ord-help">Ordene os passos na sequência correta (use ↑/↓):</p>
          <ol class="lms-ord-list" id="lms-ord-list"></ol>
          <span id="lms-ord-live" class="lms-sr-only" aria-live="polite"></span>
          ${timeNote}
          <p class="lms-mq-result" id="lms-ord-result" aria-live="polite"></p>
        </div>
        <div class="lms-lesson-actions">
          ${_lessonNavHtml(trainingId, lesson.id)}
          <button class="btn btn-primary" id="lms-ord-submit">${t('lms.checkOrder') || 'Conferir ordem'}</button>
        </div>`);
    overlay.querySelector('.lms-lesson-close')?.addEventListener('click', _closeLessonModal);
    _wireLessonNav(overlay, trainingId, lesson.id);

    const listEl = overlay.querySelector('#lms-ord-list') as HTMLElement | null;
    const liveEl = overlay.querySelector('#lms-ord-live') as HTMLElement | null;
    // B5 (WCAG 4.1.3): anuncia o movimento a leitores de tela + re-foca o botão
    // movido (o render recria o DOM, então o foco do teclado se perderia).
    const announceAndFocus = (id: string, newIdx: number, dir: 'up' | 'down') => {
        if (liveEl) liveEl.textContent = `${labelOf(id)}: posição ${newIdx + 1} de ${order.length}.`;
        const sel = dir === 'up' ? '.lms-ord-up' : '.lms-ord-down';
        const item = listEl?.querySelectorAll('.lms-ord-item')[newIdx];
        (item?.querySelector(sel) as HTMLElement | null)?.focus();
    };
    const render = () => {
        if (!listEl) return;
        listEl.innerHTML = order
            .map(
                (id, i) => `
            <li class="lms-ord-item" data-step-id="${escapeHtml(id)}">
              <span class="lms-ord-pos">${i + 1}</span>
              <span class="lms-ord-label">${escapeHtml(labelOf(id))}</span>
              <span class="lms-ord-btns">
                <button type="button" class="lms-ord-up" data-i="${i}" aria-label="${escapeHtml(t('lms.moveUp', { item: labelOf(id) }) || `Subir ${labelOf(id)}`)}" ${i === 0 ? 'disabled' : ''}>&#9650;</button>
                <button type="button" class="lms-ord-down" data-i="${i}" aria-label="${escapeHtml(t('lms.moveDown', { item: labelOf(id) }) || `Descer ${labelOf(id)}`)}" ${i === order.length - 1 ? 'disabled' : ''}>&#9660;</button>
              </span>
            </li>`,
            )
            .join('');
        listEl.querySelectorAll('.lms-ord-up').forEach((b) =>
            b.addEventListener('click', () => {
                const i = Number((b as HTMLElement).dataset.i);
                if (i > 0) { const id = order[i]!; [order[i - 1], order[i]] = [order[i]!, order[i - 1]!]; render(); announceAndFocus(id, i - 1, 'up'); }
            }),
        );
        listEl.querySelectorAll('.lms-ord-down').forEach((b) =>
            b.addEventListener('click', () => {
                const i = Number((b as HTMLElement).dataset.i);
                if (i < order.length - 1) { const id = order[i]!; [order[i + 1], order[i]] = [order[i]!, order[i + 1]!]; render(); announceAndFocus(id, i + 1, 'down'); }
            }),
        );
    };
    render();

    overlay.querySelector('#lms-ord-submit')?.addEventListener('click', () => {
        const g = gradeOrdering(order, ex);
        const result = overlay.querySelector('#lms-ord-result');
        if (result) {
            const crit = g.criticalViolations.length
                ? ' Um passo crítico ficou fora de ordem.'
                : '';
            result.textContent = `Nota ${g.score}/100 (${g.band}). ${g.summary}${crit}`;
        }
        if (g.passed) _markLessonComplete(trainingId, lesson.id, g.score, true);
    });
}

// --- Caso Ambiental Interativo (LMS-INTERACTIVE-ASSESS-001 F3) ----------------
const CATEGORY_LABELS: Record<string, string> = {
    investigation: 'Investigação',
    classification: 'Classificação',
    risk: 'Avaliação de risco',
    remediation: 'Remediação',
    regulatory: 'Regulatório',
    finalize: 'Concluir',
};
let _caseState: any = null;
let _caseDef: any = null;

function _brl(cents: number): string {
    return `R$ ${(Number(cents || 0) / 100).toFixed(2).replace('.', ',')}`;
}

/** (Re)renderiza o corpo dinâmico do caso (menu de ações + histórico + score). */
function _renderCaseBody(overlay: HTMLElement, trainingId: string, lesson: any) {
    const host = overlay.querySelector('#lms-case-dynamic');
    if (!host || !_caseDef || !_caseState) return;
    const meta = `<div class="lms-case-meta">
        <span>Orçamento: ${_brl(_caseDef.budgetCents)}</span>
        <span>Gasto: ${_brl(_caseState.budgetSpentCents)}</span>
        <span>${_caseState.daysElapsed} dias</span>
      </div>`;

    if (_caseState.done) {
        const score = scoreCase(_caseState, _caseDef);
        const dims = score.dimensions
            .map((d: any) => `<div class="lms-case-dim"><span>${escapeHtml(d.label)}</span><strong>${d.score}</strong></div>`)
            .join('');
        const veto = score.vetoes.length ? `<p class="lms-case-veto">${escapeHtml(score.vetoes[0])}</p>` : '';
        host.innerHTML = `${meta}
          <div class="lms-case-scorecard lms-case-band-${score.band.toLowerCase()}">
            <div class="lms-case-band">${score.band}</div>
            <div class="lms-case-overall">${score.overall}/100</div>
          </div>
          <div class="lms-case-dims">${dims}</div>
          ${veto}
          <p class="lms-case-summary">${escapeHtml(score.summary)}</p>
          <div class="lms-case-finish">
            ${score.passed ? `<button type="button" class="btn btn-primary" id="lms-case-close">${t('lms.completeLesson') || 'Concluir lição'}</button>` : ''}
            <button type="button" class="btn btn-secondary" id="lms-case-retry">${t('lms.retryCase') || 'Refazer o caso'}</button>
          </div>`;
        // Marca concluída em background (mantém o score visível); o aluno fecha quando quiser.
        if (score.passed) _markLessonComplete(trainingId, lesson.id, score.overall, true);
        host.querySelector('#lms-case-close')?.addEventListener('click', _closeLessonModal);
        host.querySelector('#lms-case-retry')?.addEventListener('click', () => {
            _caseState = createCaseState(_caseDef);
            _renderCaseBody(overlay, trainingId, lesson);
        });
        return;
    }

    const available = listAvailableActions(_caseState, _caseDef);
    const byCat: Record<string, any[]> = {};
    for (const a of available) (byCat[a.category] ||= []).push(a);
    const order = ['investigation', 'classification', 'risk', 'remediation', 'regulatory', 'finalize'];
    const menu = order
        .filter((c) => byCat[c]?.length)
        .map((c) => {
            const btns = (byCat[c] ?? [])
                .map((a: any) => {
                    const cost = a.costCents ? ` · ${_brl(a.costCents)}` : '';
                    return `<button type="button" class="lms-case-action" data-action-id="${escapeHtml(a.id)}">${escapeHtml(a.label)}<span class="lms-case-cost">${cost}</span></button>`;
                })
                .join('');
            return `<fieldset class="lms-case-cat"><legend>${escapeHtml(CATEGORY_LABELS[c] || c)}</legend>${btns}</fieldset>`;
        })
        .join('');
    const history = _caseState.performed.length
        ? `<div class="lms-case-history"><h4>${t('lms.results') || 'Resultados'}</h4>${_caseState.performed
              .map(
                  (p: any) =>
                      `<div class="lms-case-hist ${p.correct ? 'ok' : 'warn'}"><strong>${escapeHtml(p.label)}</strong><span>${escapeHtml(p.result)}</span></div>`,
              )
              .join('')}</div>`
        : '';
    host.innerHTML = `${meta}<div class="lms-case-menu">${menu}</div>${history}`;
    host.querySelectorAll('.lms-case-action').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = (btn as HTMLElement).dataset.actionId;
            if (!id) return;
            const outcome = applyAction(_caseState, _caseDef, id);
            _caseState = outcome.state;
            showToast(outcome.hint ? `${outcome.result} (${outcome.hint})` : outcome.result, outcome.correct ? 'success' : 'warning');
            _renderCaseBody(overlay, trainingId, lesson);
        });
    });
}

/** Lição 'case': Caso Ambiental Interativo sobre o modelo (painel lateral). */
function _renderCase(trainingId: string, lesson: any) {
    closeTrainingPanel();
    _caseDef = getCaseById(lesson.caseId);
    if (!_caseDef) {
        showToast('Caso não encontrado. Marcando como concluída.', 'info');
        return _markLessonComplete(trainingId, lesson.id);
    }
    _caseState = createCaseState(_caseDef);
    const overlay = _lessonOverlay(`
        ${_lessonHeaderHtml(lesson.title)}
        <div class="lms-lesson-body">
          <p class="lms-case-scenario">${escapeHtml(_caseDef.scenario)}</p>
          <div id="lms-case-dynamic"></div>
        </div>
        <div class="lms-lesson-actions">
          ${_lessonNavHtml(trainingId, lesson.id)}
        </div>`);
    overlay.querySelector('.lms-lesson-close')?.addEventListener('click', _closeLessonModal);
    _wireLessonNav(overlay, trainingId, lesson.id);
    _renderCaseBody(overlay, trainingId, lesson);
}

async function _markLessonComplete(
    trainingId: string,
    lessonId: string,
    quizScore?: number,
    keepOpen?: boolean,
) {
    const enr = _findEnrollment(trainingId);
    if (!enr) return;
    const set = new Set(enr.completed_lesson_ids || []);
    set.add(lessonId);
    enr.completed_lesson_ids = [...set];
    if (typeof quizScore === 'number') enr.last_quiz_score = quizScore;
    // RF-13: nota por lição alimenta o agregador de competências/badges.
    if (typeof quizScore === 'number') {
        enr.lesson_scores = { ...(enr.lesson_scores || {}), [lessonId]: quizScore };
    }

    const totalIds = getLessonsForTraining(trainingId).map((l) => l.id);
    const prog = computeLessonProgress({ completedLessonIds: enr.completed_lesson_ids, totalLessons: totalIds.length });
    let certIssued = false;
    if (prog.complete) {
        enr.status = 'completed';
        enr.completed_at = enr.completed_at || new Date().toISOString();
        certIssued = await _maybeIssueCertificate(trainingId, enr, quizScore);
    }
    await _persistEnrollments();
    // B2: sincroniza progresso + trilha de auditoria para o Supabase (best-effort,
    // não-bloqueante; no-op se offline/deslogado — IDB segue como fonte local).
    const lessonType = getLessonsForTraining(trainingId).find((l) => l.id === lessonId)?.type;
    const outcome = classifyCompletion(lessonType, typeof quizScore === 'number');
    void appendAudit({
        trainingId,
        lessonId,
        eventType: outcome === 'skipped' ? 'lesson_skipped' : 'lesson_completed',
        score: quizScore,
        meta: { outcome },
    });
    // T7.3: CustomEvent 'ecbyts:lms-progress' unico p/ quem escuta progresso
    // real (ex.: checklist "Comece aqui") — nao substitui appendAudit (Supabase).
    _dispatchLmsProgressEvent('lesson_completed', { trainingId, lessonId, outcome });
    if (prog.complete) {
        void appendAudit({ trainingId, eventType: 'course_completed', score: enr.last_quiz_score });
        _dispatchLmsProgressEvent('course_completed', { trainingId });
    }
    void syncProgress(enr);
    await _refreshPanel();
    // keepOpen: lições 'case' mantêm o score visível (o aluno fecha quando quiser).
    if (!keepOpen) _closeLessonModal();
    // B1: curso pode concluir a navegação (NFR-5) mas o certificado exige avaliação
    // real — se houve avaliação pulada (fail-safe), avisa em vez de prometer cert.
    // T5.1b: mensagem genérica trocada por policy.gaps (quais lições faltam e por quê).
    const msg = !prog.complete
        ? 'Lição concluída.'
        : certIssued
          ? 'Curso concluído! Certificado disponível.'
          : _describePendingCertificate(trainingId, enr);
    showToast(msg, prog.complete && !certIssued ? 'info' : 'success');
}

/** T5.1b: mensagem "faltam N avaliações: ..." quando o curso terminou sem certificar. */
function _describePendingCertificate(trainingId: string, enr: any): string {
    const seedLessons = getLessonsForTraining(trainingId);
    const lessons = seedLessons.map((l) => ({ id: l.id, type: l.type }));
    const titleById: Record<string, string> = {};
    for (const l of seedLessons) titleById[l.id] = l.title;
    const passingScore = getQuizForTraining(trainingId)?.passing_score ?? 70;
    const policy = evaluateCourseCertificate({
        lessons,
        completedIds: enr.completed_lesson_ids || [],
        scores: enr.lesson_scores || {},
        passingScore,
    });
    // gaps vazios mas certIssued=false = 2º gate (evaluateCertificateEligibility) recusou
    // por outro motivo (ex.: certificate_enabled=false) — mensagem genérica honesta.
    const gapsMsg = describeCertificateGaps(policy.gaps, titleById);
    return gapsMsg || 'Curso concluído. Certificado indisponível para este curso.';
}

/** Emite o certificado SE a política de integridade liberar. Retorna se emitiu. */
async function _maybeIssueCertificate(trainingId: string, enr: any, quizScore?: number): Promise<boolean> {
    const training = getTrainingById(trainingId);
    if (!training) return false;
    const lessons = getLessonsForTraining(trainingId).map((l) => ({ id: l.id, type: l.type }));
    const scores: Record<string, number> = enr.lesson_scores || {};
    const passingScore = getQuizForTraining(trainingId)?.passing_score ?? 70;

    // B1: gate de integridade — nenhuma avaliação pulada/abaixo do corte. SEM default-100.
    const policy = evaluateCourseCertificate({
        lessons,
        completedIds: enr.completed_lesson_ids || [],
        scores,
        passingScore,
    });
    if (!policy.eligible) return false;
    if (_certificates.some((c) => c.training_id === trainingId)) return true; // já emitido

    // Nota do certificado: quiz final, senão média das avaliações pontuadas (nunca 100 default).
    const assessmentScores = lessons.map((l) => scores[l.id]).filter((s) => Number.isFinite(s)) as number[];
    const finalScore =
        typeof quizScore === 'number'
            ? quizScore
            : Number.isFinite(enr.last_quiz_score)
              ? enr.last_quiz_score
              : assessmentScores.length
                ? Math.round(assessmentScores.reduce((a, n) => a + n, 0) / assessmentScores.length)
                : 0;

    const eligibility = evaluateCertificateEligibility({
        training: { ...training, certificate_enabled: true },
        enrollment: enr,
        score: finalScore,
        passingScore,
    });
    if (!eligibility.eligible) return false;
    const certificateId = `cert-${trainingId}-${Date.now().toString(36)}`;
    const payload = buildCertificatePayload({
        training,
        enrollment: enr,
        score: finalScore,
        certificateId,
        learner: { id: 'local-user', name: 'Você' },
        issuedAt: new Date().toISOString(),
    });
    if (payload) {
        const certRecord = { ...payload, id: certificateId, training_id: trainingId, training_title: training.title, score: finalScore };
        _certificates.push(certRecord);
        await _persistCertificates();
        // B3: registra o certificado no servidor com o hash do payload (verificável)
        // + B2 audit. Best-effort, não-bloqueante.
        void syncCertificate(certRecord);
        void appendAudit({ trainingId, eventType: 'certificate_issued', score: finalScore, meta: { certificateId } });
        return true;
    }
    return false;
}

function _downloadCertificate(certId: string) {
    const cert = _certificates.find((c) => c.id === certId || c.certificate_id === certId);
    if (!cert) {
        showToast(t('lms.toastCertNotFound') || 'Certificado não encontrado.', 'warning');
        return;
    }
    // buildCertificateExportBundle espera o INPUT (learner/training), não o
    // payload de saída — reconstrói a partir do cert salvo + seed.
    const training = getTrainingById(cert.training_id);
    const certInput = {
        learner: { id: 'local-user', fullName: cert.learner_name || 'Você' },
        training: { ...(training || {}), id: cert.training_id, certificate_enabled: true },
        enrollment: { status: 'completed', progress_percent: 100, completed_at: cert.completion_date || cert.issued_at },
        score: cert.score,
        certificateId: cert.certificate_id || cert.id,
        issuedAt: cert.issued_at,
    };
    let bundle: any = null;
    try {
        bundle = buildCertificateExportBundle(certInput);
    } catch (e: any) {
        console.debug('[lmsManager] cert bundle:', e?.message || e);
    }
    const bytes = bundle?.binary?.bytes;
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
        showToast(t('lms.toastCertPdfFailed') || 'Falha ao gerar o PDF do certificado.', 'error');
        return;
    }
    try {
        const blob = new Blob([bytes as unknown as BlobPart], { type: bundle.binary.mime_type || 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = bundle.binary.file_name || `certificado-${certId}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast(t('lms.toastCertPdfDownloaded') || 'Certificado PDF baixado.', 'success');
    } catch (e: any) {
        console.debug('[lmsManager] cert download:', e?.message || e);
        showToast(t('lms.toastPdfDownloadFailed') || 'Falha ao baixar o PDF.', 'error');
    }
}

/** Registra o entry point global (chamado no boot / panelDiscovery). */
export function registerLmsHandlers() {
    (window as any).openLmsModule = openLmsModule;
    (window as any).closeLmsModule = closeTrainingPanel;
    (window as any).grantCourseEnrollment = grantCourseEnrollment;
}
