// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   LMS AUTHORING STORE (runtime) — COURSE-AUTHORING-001 F2/F4 precursor
   ================================================================
   Persistência offline-first dos rascunhos de curso AUTORADOS pelo usuário.
   É o elo entre a lógica pura (`_courseAuthoringPure`, F1) e o editor de UI
   (F2): guarda/carrega/lista os rascunhos no IndexedDB e aplica as transições
   de estado (publicar / arquivar) via a máquina de estados pura.

   IO isolado: o IndexedDB é resolvido por lazy import de `utils/storage/idbStore`
   (offline-first) e é INJETÁVEL via `deps` para testes (sem browser). Toda a
   regra de negócio (gate de publicação, versão, soft-delete, merge) vem do core
   puro — este arquivo só orquestra persistência. Quando logado, o sync para o
   servidor é responsabilidade do adapter Supabase (fase F4).
   ================================================================ */

import {
    transitionCourseStatus,
    mergeAuthoredIntoCatalog,
} from '../../core/training/_courseAuthoringPure.js';
import type {
    CourseDraft,
    PublishGateResult,
} from '../../core/training/_courseAuthoringPure.js';

/** Chave única do IndexedDB para a lista de cursos autorados. */
export const AUTHORED_COURSES_KEY = 'ecbyts-lms-authored';

const UNTITLED_COURSE_TITLE_PATTERN = /^curso sem t[ií]tulo$/i;
const TEST_COURSE_TITLE_PATTERNS = [
    /teste e2e/i,
    /importado type c/i,
    /arquivo ecbt comprimido/i,
];

export interface StoreDeps {
    /** idbGet injetável (testes); senão lazy import de utils/storage/idbStore. */
    readonly idbGet?: (key: string) => Promise<any>;
    /** idbSet injetável (testes); senão lazy import de utils/storage/idbStore. */
    readonly idbSet?: (key: string, value: any) => Promise<boolean>;
}

/** Resolve {idbGet,idbSet} — injetados (testes) ou do idbStore (offline-first). */
async function _idb(deps: StoreDeps): Promise<{ idbGet?: StoreDeps['idbGet']; idbSet?: StoreDeps['idbSet'] }> {
    let idbGet = deps.idbGet;
    let idbSet = deps.idbSet;
    if (!idbGet || !idbSet) {
        try {
            const m: any = await import('../storage/idbStore.js' as string);
            idbGet = idbGet || m.idbGet;
            idbSet = idbSet || m.idbSet;
        } catch (e: any) {
            console.debug('[lmsAuthoringStore:idb]', e?.message || e);
        }
    }
    return { idbGet, idbSet };
}

/** Lista todos os cursos autorados persistidos (vazio se nada/offline). */
export async function listAuthoredCourses(deps: StoreDeps = {}): Promise<CourseDraft[]> {
    const { idbGet, idbSet } = await _idb(deps);
    if (!idbGet) return [];
    const arr = await idbGet(AUTHORED_COURSES_KEY);
    if (!Array.isArray(arr)) return [];
    const courses = arr as CourseDraft[];
    const clean = courses.filter((course) => !_isDisposableAuthoredCourse(course));
    if (clean.length !== courses.length && idbSet) {
        await idbSet(AUTHORED_COURSES_KEY, clean);
    }
    return clean;
}

function _isDisposableAuthoredCourse(course: CourseDraft | null | undefined): boolean {
    if (!course || typeof course !== 'object') return true;
    const title = String(course.title || '').trim();
    const lessons = Array.isArray(course.lessons) ? course.lessons : [];
    const isEmptyPlaceholder = lessons.length === 0 && (!title || UNTITLED_COURSE_TITLE_PATTERN.test(title));
    if (isEmptyPlaceholder) return true;
    const id = String(course.id || '').toLowerCase();
    return id.includes('type-c-e2e') || TEST_COURSE_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

/** Carrega um rascunho específico por id (null se não existe). */
export async function loadAuthoredCourse(id: string, deps: StoreDeps = {}): Promise<CourseDraft | null> {
    if (!id) return null;
    const all = await listAuthoredCourses(deps);
    return all.find((c) => c && c.id === id) || null;
}

/** Upsert de um rascunho (por id). Retorna true se persistiu. */
export async function saveAuthoredCourse(draft: CourseDraft, deps: StoreDeps = {}): Promise<boolean> {
    if (!draft || !draft.id) return false;
    const { idbSet } = await _idb(deps);
    if (!idbSet) return false;
    const all = await listAuthoredCourses(deps);
    const idx = all.findIndex((c) => c && c.id === draft.id);
    if (idx >= 0) all[idx] = draft;
    else all.push(draft);
    return await idbSet(AUTHORED_COURSES_KEY, all);
}

/**
 * Publica um curso autorado: aplica o gate de publicação (puro) e persiste.
 * Curso inválido NÃO publica — retorna os erros por campo (não muta nada).
 */
export async function publishAuthoredCourse(id: string, deps: StoreDeps = {}): Promise<PublishGateResult> {
    const draft = await loadAuthoredCourse(id, deps);
    if (!draft) {
        return { ok: false, errors: [{ field: 'id', code: 'not_found', message: 'Curso não encontrado.' }] };
    }
    const res = transitionCourseStatus(draft, 'publish');
    if (!res.ok) return { ok: false, errors: res.errors };
    await saveAuthoredCourse(res.draft, deps);
    return { ok: true, errors: [] };
}

/**
 * Soft-delete: arquiva o curso (status='archived') em vez de apagar — protege
 * matrículas/certificados emitidos (KQ4). Retorna true se persistiu.
 */
export async function archiveAuthoredCourse(id: string, deps: StoreDeps = {}): Promise<boolean> {
    const draft = await loadAuthoredCourse(id, deps);
    if (!draft) return false;
    const res = transitionCourseStatus(draft, 'archive');
    return await saveAuthoredCourse(res.draft, deps);
}

/**
 * Hard-delete permitido APENAS para rascunhos nunca publicados (status='draft').
 * Curso publicado/arquivado: usar archive (soft-delete). Retorna true se removeu.
 */
export async function deleteAuthoredDraft(id: string, deps: StoreDeps = {}): Promise<boolean> {
    const draft = await loadAuthoredCourse(id, deps);
    if (!draft) return false;
    if (draft.status !== 'draft') return false; // proteção: só rascunho cru
    const { idbSet } = await _idb(deps);
    if (!idbSet) return false;
    const all = (await listAuthoredCourses(deps)).filter((c) => c && c.id !== id);
    return await idbSet(AUTHORED_COURSES_KEY, all);
}

/**
 * Catálogo combinado para o painel do LMS: cursos first-party (seed) + cursos
 * autorados PUBLICADOS. First-party vence colisão de id (proteção de confiança).
 */
export async function getMergedTrainingCatalog<S extends { id: string }>(
    seedCatalog: readonly S[],
    deps: StoreDeps = {},
): Promise<(S | CourseDraft)[]> {
    const authored = await listAuthoredCourses(deps);
    return mergeAuthoredIntoCatalog(seedCatalog || [], authored) as (S | CourseDraft)[];
}
