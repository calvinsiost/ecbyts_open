// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   TRAINING COURSE READINESS (pure)

   Checklist deterministico para professor antes de publicar ou iniciar aula.
   Nao toca DOM, storage, Files, Supabase, rede ou UI.
   ================================================================ */

export const TRAINING_COURSE_READY_EXPECTED_ITEM_COUNT = 33;

export type TrainingCourseReadinessState = 'pronto' | 'atencao' | 'bloqueado';

export type TrainingCourseReadinessItemId =
    | 'ecbt-model'
    | 'slide-lesson-count'
    | 'required-assets'
    | 'hotspots'
    | 'fallbacks'
    | 'publish-save';

export interface TrainingCourseReadinessSummary {
    readonly title?: string | null;
    readonly expectedItemCount?: number | null;
    readonly ecbtModelApplied?: boolean | null;
    readonly ecbtModelId?: string | null;
    readonly expectedEcbtModelId?: string | null;
    readonly slideCount?: number | null;
    readonly lessonCount?: number | null;
    readonly requiredAssetsTotal?: number | null;
    readonly missingRequiredAssetIds?: readonly string[] | null;
    readonly assetsPendingUploadIds?: readonly string[] | null;
    readonly hotspotCount?: number | null;
    readonly unresolvedHotspotIds?: readonly string[] | null;
    readonly fallbackCount?: number | null;
    readonly missingFallbackIds?: readonly string[] | null;
    readonly saved?: boolean | null;
    readonly published?: boolean | null;
}

export interface TrainingCourseReadinessChecklistItem {
    readonly id: TrainingCourseReadinessItemId;
    readonly label: string;
    readonly state: TrainingCourseReadinessState;
    readonly message: string;
    readonly evidence: readonly string[];
}

export interface TrainingCourseReadinessChecklist {
    readonly state: TrainingCourseReadinessState;
    readonly teacherSummary: string;
    readonly canStartClass: boolean;
    readonly canPublishCourse: boolean;
    readonly counts: Readonly<Record<TrainingCourseReadinessState | 'total', number>>;
    readonly items: readonly TrainingCourseReadinessChecklistItem[];
}

const STATE_RANK: Readonly<Record<TrainingCourseReadinessState, number>> = {
    pronto: 0,
    atencao: 1,
    bloqueado: 2,
};

function normalizeText(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
}

function normalizeCount(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function normalizeIds(values: unknown): string[] {
    const raw = Array.isArray(values) ? values : [];
    return Array.from(new Set(raw.map((value) => normalizeText(value)).filter((value) => value.length > 0)));
}

function plural(value: number, singular: string, pluralText: string): string {
    return value === 1 ? `1 ${singular}` : `${value} ${pluralText}`;
}

function listTop(ids: readonly string[]): string {
    const visible = ids.slice(0, 3);
    const suffix = ids.length > visible.length ? ` e mais ${ids.length - visible.length}` : '';
    return `${visible.join(', ')}${suffix}`;
}

function makeItem(
    id: TrainingCourseReadinessItemId,
    label: string,
    state: TrainingCourseReadinessState,
    message: string,
    evidence: readonly string[] = [],
): TrainingCourseReadinessChecklistItem {
    return Object.freeze({
        id,
        label,
        state,
        message,
        evidence: Object.freeze([...evidence]),
    });
}

function buildModelItem(summary: TrainingCourseReadinessSummary): TrainingCourseReadinessChecklistItem {
    const modelId = normalizeText(summary.ecbtModelId);
    const expectedModelId = normalizeText(summary.expectedEcbtModelId);
    const applied = summary.ecbtModelApplied === true;

    if (modelId && expectedModelId && modelId !== expectedModelId) {
        return makeItem(
            'ecbt-model',
            'Modelo ECBT aplicado',
            'bloqueado',
            `Modelo ECBT diferente do esperado. Use ${expectedModelId}.`,
            [`modelo atual: ${modelId}`],
        );
    }

    if (applied || (modelId && expectedModelId && modelId === expectedModelId)) {
        return makeItem(
            'ecbt-model',
            'Modelo ECBT aplicado',
            'pronto',
            modelId ? `Modelo ECBT aplicado: ${modelId}.` : 'Modelo ECBT aplicado.',
        );
    }

    if (modelId) {
        return makeItem(
            'ecbt-model',
            'Modelo ECBT aplicado',
            'atencao',
            `Modelo ECBT informado, mas confirme se ja foi aplicado: ${modelId}.`,
        );
    }

    return makeItem(
        'ecbt-model',
        'Modelo ECBT aplicado',
        'bloqueado',
        'Aplique o modelo ECBT da aula antes de iniciar.',
    );
}

function describeDeckCounts(slideCount: number | null, lessonCount: number | null): string {
    const parts: string[] = [];
    if (slideCount !== null) parts.push(plural(slideCount, 'slide', 'slides'));
    if (lessonCount !== null) parts.push(plural(lessonCount, 'licao', 'licoes'));
    return parts.length > 0 ? parts.join(' e ') : 'sem contagem';
}

function buildCountItem(summary: TrainingCourseReadinessSummary): TrainingCourseReadinessChecklistItem {
    const expected = normalizeCount(summary.expectedItemCount) ?? TRAINING_COURSE_READY_EXPECTED_ITEM_COUNT;
    const slideCount = normalizeCount(summary.slideCount);
    const lessonCount = normalizeCount(summary.lessonCount);
    const knownCounts = [slideCount, lessonCount].filter((count): count is number => count !== null);

    if (knownCounts.length === 0) {
        return makeItem(
            'slide-lesson-count',
            '33 slides/lessons',
            'bloqueado',
            `Confirme que o curso tem ${expected} slides/lessons antes da aula.`,
        );
    }

    const mismatch = knownCounts.some((count) => count !== expected);
    if (mismatch) {
        return makeItem(
            'slide-lesson-count',
            '33 slides/lessons',
            'bloqueado',
            `Esperado: ${expected}. Encontrado: ${describeDeckCounts(slideCount, lessonCount)}.`,
        );
    }

    return makeItem(
        'slide-lesson-count',
        '33 slides/lessons',
        'pronto',
        `${expected} slides/lessons confirmados.`,
        [describeDeckCounts(slideCount, lessonCount)],
    );
}

function buildAssetItem(summary: TrainingCourseReadinessSummary): TrainingCourseReadinessChecklistItem {
    const total = normalizeCount(summary.requiredAssetsTotal);
    const missing = normalizeIds(summary.missingRequiredAssetIds);
    const pendingUpload = normalizeIds(summary.assetsPendingUploadIds);

    if (missing.length > 0) {
        return makeItem(
            'required-assets',
            'Assets obrigatorios',
            'bloqueado',
            `Faltam ${plural(missing.length, 'asset obrigatorio', 'assets obrigatorios')}: ${listTop(missing)}.`,
            missing,
        );
    }

    if (pendingUpload.length > 0) {
        return makeItem(
            'required-assets',
            'Assets obrigatorios',
            'atencao',
            `${plural(pendingUpload.length, 'asset obrigatorio precisa', 'assets obrigatorios precisam')} de upload: ${listTop(
                pendingUpload,
            )}.`,
            pendingUpload,
        );
    }

    if (total === null) {
        return makeItem(
            'required-assets',
            'Assets obrigatorios',
            'atencao',
            'Total de assets obrigatorios nao informado; confira o manifesto antes da aula.',
        );
    }

    if (total === 0) {
        return makeItem(
            'required-assets',
            'Assets obrigatorios',
            'atencao',
            'Nenhum asset obrigatorio declarado; confirme se o curso nao depende de imagens, videos ou arquivos.',
        );
    }

    return makeItem(
        'required-assets',
        'Assets obrigatorios',
        'pronto',
        `${plural(total, 'asset obrigatorio conferido', 'assets obrigatorios conferidos')}.`,
    );
}

function buildHotspotItem(summary: TrainingCourseReadinessSummary): TrainingCourseReadinessChecklistItem {
    const total = normalizeCount(summary.hotspotCount);
    const unresolved = normalizeIds(summary.unresolvedHotspotIds);

    if (unresolved.length > 0) {
        return makeItem(
            'hotspots',
            'Hotspots resolvidos',
            'bloqueado',
            `Resolva ${plural(unresolved.length, 'hotspot', 'hotspots')} antes da aula: ${listTop(unresolved)}.`,
            unresolved,
        );
    }

    if (total === null) {
        return makeItem(
            'hotspots',
            'Hotspots resolvidos',
            'atencao',
            'Hotspots nao informados; confira se nao falta abrir GAC, DataStudio ou outro ponto vivo.',
        );
    }

    if (total === 0) {
        return makeItem(
            'hotspots',
            'Hotspots resolvidos',
            'atencao',
            'Nenhum hotspot declarado; confirme se a aula e apenas estatica.',
        );
    }

    return makeItem('hotspots', 'Hotspots resolvidos', 'pronto', `${plural(total, 'hotspot resolvido', 'hotspots resolvidos')}.`);
}

function buildFallbackItem(summary: TrainingCourseReadinessSummary): TrainingCourseReadinessChecklistItem {
    const total = normalizeCount(summary.fallbackCount);
    const missing = normalizeIds(summary.missingFallbackIds);

    if (missing.length > 0) {
        return makeItem(
            'fallbacks',
            'Fallbacks',
            'bloqueado',
            `Faltam fallbacks para: ${listTop(missing)}.`,
            missing,
        );
    }

    if (total === null) {
        return makeItem(
            'fallbacks',
            'Fallbacks',
            'atencao',
            'Fallbacks nao informados; mantenha PPTX, PDF ou captura salva como contingencia.',
        );
    }

    if (total === 0) {
        return makeItem(
            'fallbacks',
            'Fallbacks',
            'atencao',
            'Nenhum fallback declarado; se um modulo falhar, o professor precisa de backup.',
        );
    }

    return makeItem('fallbacks', 'Fallbacks', 'pronto', `${plural(total, 'fallback pronto', 'fallbacks prontos')}.`);
}

function buildPublishItem(summary: TrainingCourseReadinessSummary): TrainingCourseReadinessChecklistItem {
    const saved = summary.saved === true;
    const published = summary.published === true;

    if (saved && published) {
        return makeItem('publish-save', 'Curso publicado/salvo', 'pronto', 'Curso salvo e publicado.');
    }

    if (saved) {
        return makeItem('publish-save', 'Curso publicado/salvo', 'atencao', 'Curso salvo, mas ainda nao publicado para a turma.');
    }

    if (published) {
        return makeItem(
            'publish-save',
            'Curso publicado/salvo',
            'atencao',
            'Curso publicado, mas o salvamento local nao foi confirmado.',
        );
    }

    return makeItem('publish-save', 'Curso publicado/salvo', 'bloqueado', 'Salve o curso antes de publicar ou iniciar.');
}

function summarizeChecklist(items: readonly TrainingCourseReadinessChecklistItem[]): string {
    const blocked = items.filter((item) => item.state === 'bloqueado').length;
    const attention = items.filter((item) => item.state === 'atencao').length;

    if (blocked > 0) {
        return `Checklist bloqueado: resolva ${plural(blocked, 'item', 'itens')} antes da aula.`;
    }

    if (attention > 0) {
        return `Checklist com atencao: revise ${plural(attention, 'item', 'itens')} antes de publicar.`;
    }

    return 'Checklist pronto para aula: todos os itens essenciais estao prontos.';
}

function overallState(items: readonly TrainingCourseReadinessChecklistItem[]): TrainingCourseReadinessState {
    return items.reduce<TrainingCourseReadinessState>(
        (current, item) => (STATE_RANK[item.state] > STATE_RANK[current] ? item.state : current),
        'pronto',
    );
}

/** Recebe um resumo de curso/deck e devolve o checklist de prontidao do professor. */
export function buildTrainingCourseReadinessChecklist(
    summary: TrainingCourseReadinessSummary,
): TrainingCourseReadinessChecklist {
    const input = summary || {};
    const items = Object.freeze([
        buildModelItem(input),
        buildCountItem(input),
        buildAssetItem(input),
        buildHotspotItem(input),
        buildFallbackItem(input),
        buildPublishItem(input),
    ]);

    const state = overallState(items);
    const counts = Object.freeze({
        total: items.length,
        pronto: items.filter((item) => item.state === 'pronto').length,
        atencao: items.filter((item) => item.state === 'atencao').length,
        bloqueado: items.filter((item) => item.state === 'bloqueado').length,
    });
    const nonPublicationItems = items.filter((item) => item.id !== 'publish-save');

    return Object.freeze({
        state,
        teacherSummary: summarizeChecklist(items),
        canStartClass: state !== 'bloqueado',
        canPublishCourse:
            input.saved === true && nonPublicationItems.every((item) => item.state !== 'bloqueado'),
        counts,
        items,
    });
}

