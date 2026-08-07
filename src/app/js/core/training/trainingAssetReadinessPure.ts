// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   TRAINING ASSET READINESS (pure)

   Base pura e testavel para mapear cursos, licoes e midias de aula para
   estados sem IO/network:
   - local-only
   - files-ready
   - supabase-ready
   - missing
   - upload-required
   ================================================================ */

export type TrainingAssetKind = 'course' | 'lesson' | 'media';

export type TrainingAssetReadinessState =
    | 'local-only'
    | 'files-ready'
    | 'supabase-ready'
    | 'missing'
    | 'upload-required';

export interface TrainingAssetRef {
    readonly id: string;
    readonly kind: TrainingAssetKind;
    readonly courseId?: string;
    readonly lessonIndex?: number;
    readonly mediaRef?: string;
}

export interface TrainingAssetReadinessInput {
    readonly refs: readonly TrainingAssetRef[];
    readonly filesStoreCourseIds: readonly string[];
    readonly filesStoreLessonIds: readonly string[];
    readonly filesStoreMediaRefs: readonly string[];
    readonly supabaseCourseIds: readonly string[];
    readonly supabaseLessonIds: readonly string[];
    readonly supabaseMediaRefs: readonly string[];
    readonly requiredUploadMediaRefs?: readonly string[];
}

export interface AssetReadinessItem {
    readonly assetId: string;
    readonly kind: TrainingAssetKind;
    readonly courseId?: string;
    readonly lessonIndex?: number;
    readonly mediaRef?: string;
    readonly state: TrainingAssetReadinessState;
    readonly notes: readonly string[];
    readonly bucket: 'course' | 'lesson' | 'media';
}

export interface TrainingAssetReadinessSummary {
    readonly state: 'ready' | 'needs-upload' | 'incomplete' | 'missing';
    readonly counts: {
        readonly total: number;
        readonly localOnly: number;
        readonly filesReady: number;
        readonly supabaseReady: number;
        readonly uploadRequired: number;
        readonly missing: number;
    };
    readonly missingRequiredRefs: readonly string[];
    readonly uploadPlan: TrainingAssetUploadPlan;
    readonly items: readonly AssetReadinessItem[];
}

export interface TrainingAssetUploadStep {
    readonly kind: TrainingAssetKind;
    readonly action: 'check-and-upload' | 'ensure-meta';
    readonly courseId: string;
    readonly lessonIndex?: number;
    readonly mediaRef?: string;
    readonly targetRef: string;
    readonly source: 'local';
    readonly preconditions: readonly string[];
    readonly skipReason?: string;
}

export interface TrainingAssetUploadPlan {
    readonly filesBucket: string;
    readonly supabaseBucket: string;
    readonly steps: readonly TrainingAssetUploadStep[];
    readonly missingRequiredRefs: readonly string[];
}

export type TrainingTeacherMessageState =
    | 'ready-for-class'
    | 'needs-upload'
    | 'missing-preset'
    | 'live-module-unavailable'
    | 'snapshot-available'
    | 'draft-course';

export type TrainingTeacherMessageSeverity = 'ready' | 'attention' | 'blocked' | 'fallback';

export interface TrainingTeacherMessageInput {
    readonly state?: TrainingTeacherMessageState;
    readonly readiness?: TrainingAssetReadinessSummary | null;
    readonly courseStatus?: string | null;
    readonly courseTitle?: string | null;
    readonly slideTitle?: string | null;
    readonly presetId?: string | null;
    readonly requiredPresetId?: string | null;
    readonly moduleName?: string | null;
    readonly handlerName?: string | null;
    readonly liveModuleAvailable?: boolean | null;
    readonly snapshotAvailable?: boolean | null;
    readonly fallbackLabel?: string | null;
    readonly missingRequiredRefs?: readonly string[] | null;
}

export interface TrainingTeacherMessage {
    readonly state: TrainingTeacherMessageState;
    readonly severity: TrainingTeacherMessageSeverity;
    readonly title: string;
    readonly message: string;
    readonly nextAction: string;
    readonly details: readonly string[];
}

function pluralize(value: number, singular: string, plural: string): string {
    if (value === 1) {
        return `1 ${singular}`;
    }
    return `${value} ${plural}`;
}

function summarizeMissingRequiredRefs(missingRequiredRefs: readonly string[]): string {
    if (!Array.isArray(missingRequiredRefs) || missingRequiredRefs.length === 0) {
        return '';
    }
    const topThree = missingRequiredRefs.slice(0, 3).map((value) => `"${value}"`);
    const remainingCount = missingRequiredRefs.length - topThree.length;
    if (remainingCount <= 0) {
        return ` Faltam estes arquivos: ${topThree.join(', ')}.`;
    }
    return ` Faltam estes arquivos: ${topThree.join(', ')} e mais ${remainingCount} item(s).`;
}

function formatQuotedList(values: readonly string[]): string {
    const safeValues = toOrderedUnique(values).slice(0, 3);
    if (safeValues.length === 0) return '';
    return safeValues.map((value) => `"${value}"`).join(', ');
}

export function summarizeTrainingAssetReadinessForTeacher(summary: TrainingAssetReadinessSummary): string {
    const total = Math.max(0, summary.counts.total);
    const missingCount = summary.counts.missing;
    const uploadCount = summary.counts.uploadRequired;
    const incompleteCount = summary.counts.localOnly + summary.counts.filesReady;

    if (summary.state === 'ready') {
        return total <= 0
            ? 'Aula pronta para iniciar.'
            : `Aula pronta para iniciar: ${pluralize(total, 'item verificado', 'itens verificados')}.`;
    }

    if (summary.state === 'needs-upload') {
        return `Aula precisa de upload antes de abrir. Falta enviar ${pluralize(
            uploadCount,
            'arquivo obrigatorio faltante',
            'arquivos obrigatorios faltantes',
        )}.${summarizeMissingRequiredRefs(summary.missingRequiredRefs)}`;
    }

    if (summary.state === 'incomplete') {
        return `Aula ainda esta incompleta: faltam ${pluralize(
            incompleteCount,
            'item',
            'itens',
        )} para finalizar a montagem.`.trim();
    }

    return `Aula sem preparo completo: faltam ${pluralize(
        missingCount,
        'arquivo',
        'arquivos',
    )} obrigatorio(s) para continuar.${summarizeMissingRequiredRefs(summary.missingRequiredRefs)}`;
}

function normalizeTeacherState(value: unknown): TrainingTeacherMessageState | null {
    const normalized = normalizeString(value);
    const allowed: readonly TrainingTeacherMessageState[] = [
        'ready-for-class',
        'needs-upload',
        'missing-preset',
        'live-module-unavailable',
        'snapshot-available',
        'draft-course',
    ];
    return allowed.includes(normalized as TrainingTeacherMessageState)
        ? (normalized as TrainingTeacherMessageState)
        : null;
}

function inferTrainingTeacherMessageState(input: TrainingTeacherMessageInput): TrainingTeacherMessageState {
    const explicitState = normalizeTeacherState(input?.state);
    if (explicitState) return explicitState;

    if (normalizeString(input?.courseStatus).toLowerCase() === 'draft') {
        return 'draft-course';
    }

    const requiredPresetId = normalizeString(input?.requiredPresetId);
    if (requiredPresetId && !normalizeString(input?.presetId)) {
        return 'missing-preset';
    }

    const readinessState = input?.readiness?.state;
    if (readinessState === 'missing' || readinessState === 'needs-upload') {
        return 'needs-upload';
    }

    if (input?.liveModuleAvailable === false && input?.snapshotAvailable === true) {
        return 'snapshot-available';
    }

    if (input?.liveModuleAvailable === false) {
        return 'live-module-unavailable';
    }

    return 'ready-for-class';
}

function buildReadinessDetails(input: TrainingTeacherMessageInput): readonly string[] {
    const details: string[] = [];
    const readiness = input?.readiness || null;
    if (!readiness) return Object.freeze(details);

    const readyCount = readiness.counts.supabaseReady;
    const pendingUpload = readiness.counts.uploadRequired + readiness.counts.missing;
    details.push(`Itens verificados: ${readiness.counts.total}.`);
    if (readyCount > 0) {
        details.push(`Pronto no armazenamento online: ${pluralize(readyCount, 'item', 'itens')}.`);
    }
    if (pendingUpload > 0) {
        details.push(`Faltam arquivos para subir: ${pluralize(pendingUpload, 'item', 'itens')}.`);
    }

    const missingRefs = toOrderedUnique([
        ...(Array.isArray(input?.missingRequiredRefs) ? input.missingRequiredRefs : []),
        ...readiness.missingRequiredRefs,
    ]);
    const quoted = formatQuotedList(missingRefs);
    if (quoted) {
        details.push(`Arquivos citados: ${quoted}.`);
    }
    return Object.freeze(details);
}

function moduleLabel(input: TrainingTeacherMessageInput): string {
    return normalizeString(input?.moduleName) || 'modulo vivo';
}

function slideLabel(input: TrainingTeacherMessageInput): string {
    return normalizeString(input?.slideTitle) || 'Este slide';
}

function courseLabel(input: TrainingTeacherMessageInput): string {
    return normalizeString(input?.courseTitle) || 'Este curso';
}

function handlerDetail(input: TrainingTeacherMessageInput): string {
    const handlerName = normalizeString(input?.handlerName);
    return handlerName ? ` O app nao encontrou o comando ${handlerName}.` : '';
}

function freezeTeacherMessage(message: TrainingTeacherMessage): TrainingTeacherMessage {
    return Object.freeze({
        ...message,
        details: Object.freeze([...message.details]),
    });
}

/** Mensagem curta, em portugues claro, para explicar ao professor o estado da aula/slide. */
export function buildTrainingTeacherStatusMessage(input: TrainingTeacherMessageInput = {}): TrainingTeacherMessage {
    const state = inferTrainingTeacherMessageState(input);
    const readinessDetails = buildReadinessDetails(input);
    const fallbackLabel = normalizeString(input?.fallbackLabel) || 'snapshot salvo';
    const presetName = normalizeString(input?.requiredPresetId) || 'preset do curso';
    const moduleName = moduleLabel(input);

    if (state === 'ready-for-class') {
        return freezeTeacherMessage({
            state,
            severity: 'ready',
            title: 'Pronto para aula',
            message: `${courseLabel(input)} pode iniciar. Os arquivos obrigatorios, o preset e o modulo do app estao prontos para uso.`,
            nextAction: 'Inicie a aula ou revise os slides finais.',
            details: readinessDetails,
        });
    }

    if (state === 'needs-upload') {
        const readinessMessage = input?.readiness
            ? summarizeTrainingAssetReadinessForTeacher(input.readiness)
            : 'A aula precisa de upload antes de abrir com tudo completo.';
        return freezeTeacherMessage({
            state,
            severity: 'blocked',
            title: 'Precisa subir arquivos',
            message: readinessMessage,
            nextAction: 'Envie os arquivos obrigatorios para o armazenamento do curso e tente abrir o slide novamente.',
            details: readinessDetails,
        });
    }

    if (state === 'missing-preset') {
        return freezeTeacherMessage({
            state,
            severity: 'blocked',
            title: 'Preset ausente',
            message: `${courseLabel(input)} precisa do preset "${presetName}" (modelo de configuracao) para saber quais ferramentas e regras mostrar. Sem esse preset, o slide fica em modo seguro e nao abre o modulo vivo.`,
            nextAction: 'Selecione o preset do curso, salve e reabra a aula.',
            details: readinessDetails,
        });
    }

    if (state === 'live-module-unavailable') {
        return freezeTeacherMessage({
            state,
            severity: 'attention',
            title: 'Modulo vivo indisponivel',
            message: `${slideLabel(input)} pediu para abrir ${moduleName}, mas ele nao esta disponivel neste ambiente.${handlerDetail(input)} O slide nao esta quebrado: ele so nao tem um modulo vivo conectado agora.`,
            nextAction: 'Use o material de apoio ou conecte o modulo vivo ao slide.',
            details: readinessDetails,
        });
    }

    if (state === 'snapshot-available') {
        return freezeTeacherMessage({
            state,
            severity: 'fallback',
            title: 'Snapshot disponivel',
            message: `${slideLabel(input)} nao abriu ${moduleName} ao vivo agora, mas ha ${fallbackLabel} para apresentar a mesma etapa sem depender do modulo conectado.`,
            nextAction: `Abra ${fallbackLabel} e siga a explicacao do slide.`,
            details: readinessDetails,
        });
    }

    return freezeTeacherMessage({
        state,
        severity: 'attention',
        title: 'Curso ainda em rascunho',
        message: `${courseLabel(input)} ainda esta em rascunho. Ele pode ser revisado pelo autor, mas ainda nao deve ser tratado como aula pronta para uma turma.`,
        nextAction: 'Publique o curso quando conteudo, arquivos e preset estiverem conferidos.',
        details: readinessDetails,
    });
}

const FILES_BUCKET = 'files';
const SUPABASE_BUCKET = 'supabase';
const LESSON_PREFIX = 'lesson:';

function normalizeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function toSet(values: ReadonlyArray<string>): Set<string> {
    return new Set(
        (Array.isArray(values) ? values : [])
            .map((value) => normalizeString(value))
            .filter((value) => value.length > 0),
    );
}

function toOrderedUnique(values: readonly string[]): string[] {
    return Array.from(new Set(values.map((value) => normalizeString(value)).filter((value) => value.length > 0)));
}

function lessonKey(courseId: string | undefined, lessonIndex: number | undefined): string {
    const course = normalizeString(courseId);
    if (!course) return '';
    if (typeof lessonIndex !== 'number' || !Number.isInteger(lessonIndex) || lessonIndex <= 0) return course;
    return `${course}-${LESSON_PREFIX}${lessonIndex}`;
}

function notesForState(state: TrainingAssetReadinessState): readonly string[] {
    if (state === 'missing') return ['asset-ref-not-found'];
    if (state === 'upload-required') return ['files-has-media-but-class-requires-upload'];
    if (state === 'files-ready') return ['media-in-files-ready-to-upload'];
    if (state === 'supabase-ready') return ['media-already-on-supabase'];
    return ['local-only-entry'];
}

function bucketForKind(kind: TrainingAssetKind): 'course' | 'lesson' | 'media' {
    return kind;
}

function decideMediaState(
    mediaRef: string,
    store: Readonly<{
        filesMedia: Set<string>;
        supabaseMedia: Set<string>;
        requiredUpload: Set<string>;
    }>,
): TrainingAssetReadinessState {
    if (store.supabaseMedia.has(mediaRef)) return 'supabase-ready';
    if (store.filesMedia.has(mediaRef)) {
        return store.requiredUpload.has(mediaRef) ? 'upload-required' : 'files-ready';
    }
    return store.requiredUpload.has(mediaRef) ? 'missing' : 'local-only';
}

function decideItemState(
    ref: TrainingAssetRef,
    store: Readonly<{
        filesCourses: Set<string>;
        filesLessons: Set<string>;
        filesMedia: Set<string>;
        supabaseCourses: Set<string>;
        supabaseLessons: Set<string>;
        supabaseMedia: Set<string>;
        requiredUpload: Set<string>;
    }>,
): TrainingAssetReadinessState {
    if (ref.kind === 'course') {
        const courseId = normalizeString(ref.id);
        if (!courseId) return 'missing';
        if (store.supabaseCourses.has(courseId)) return 'supabase-ready';
        if (store.filesCourses.has(courseId)) return 'files-ready';
        return 'local-only';
    }

    if (ref.kind === 'lesson') {
        const id = normalizeString(ref.id);
        const lessonKeyValue = lessonKey(ref.courseId, ref.lessonIndex);
        const lookup = lessonKeyValue || id;
        if (!lookup) return 'missing';
        if (store.supabaseLessons.has(lookup)) return 'supabase-ready';
        if (store.supabaseLessons.has(id)) return 'supabase-ready';
        if (store.filesLessons.has(lookup)) return 'files-ready';
        if (store.filesLessons.has(id)) return 'files-ready';
        return 'local-only';
    }

    const mediaRef = normalizeString(ref.mediaRef);
    if (!mediaRef) return 'missing';
    return decideMediaState(mediaRef, {
        filesMedia: store.filesMedia,
        supabaseMedia: store.supabaseMedia,
        requiredUpload: store.requiredUpload,
    });
}

function assetIdFromRef(ref: TrainingAssetRef, fallbackMediaRef: string): string {
    const id = normalizeString(ref.id);
    if (id) return id;
    if (fallbackMediaRef) return fallbackMediaRef;
    return `${ref.kind}-missing`;
}

function buildStores(input: TrainingAssetReadinessInput) {
    return {
        filesCourses: toSet(input.filesStoreCourseIds),
        filesLessons: toSet(input.filesStoreLessonIds),
        filesMedia: toSet(input.filesStoreMediaRefs),
        supabaseCourses: toSet(input.supabaseCourseIds),
        supabaseLessons: toSet(input.supabaseLessonIds),
        supabaseMedia: toSet(input.supabaseMediaRefs),
        requiredUpload: toSet(input.requiredUploadMediaRefs || []),
    };
}

/** Consolida estado de readiness de curso/licao/midia sem tocar rede nem credenciais. */
export function buildTrainingAssetReadiness(input: TrainingAssetReadinessInput): TrainingAssetReadinessSummary {
    const refs = Array.isArray(input?.refs) ? input.refs : [];
    const store = buildStores(input || ({} as TrainingAssetReadinessInput));

    const normalized = refs.map((ref) => {
        const courseId = normalizeString(ref?.courseId);
        const mediaRef = normalizeString(ref?.mediaRef);
        const lessonIndex =
            typeof ref?.lessonIndex === 'number' && Number.isInteger(ref.lessonIndex) ? ref.lessonIndex : null;
        const normalizedRef: TrainingAssetRef = {
            id: normalizeString(ref?.id),
            kind: ref.kind,
            ...(courseId ? { courseId } : {}),
            ...(mediaRef ? { mediaRef } : {}),
            ...(lessonIndex !== null ? { lessonIndex } : {}),
        };
        const state = decideItemState(normalizedRef, store);
        const item: AssetReadinessItem = {
            assetId: assetIdFromRef(normalizedRef, normalizedRef.mediaRef || ''),
            kind: normalizedRef.kind,
            state,
            notes: notesForState(state),
            bucket: bucketForKind(normalizedRef.kind),
            ...(normalizedRef.courseId ? { courseId: normalizedRef.courseId } : {}),
            ...(typeof normalizedRef.lessonIndex === 'number' ? { lessonIndex: normalizedRef.lessonIndex } : {}),
            ...(normalizedRef.mediaRef ? { mediaRef: normalizedRef.mediaRef } : {}),
        };
        return item;
    });

    const missingRequiredRefs = toOrderedUnique(
        Array.from(store.requiredUpload).filter((mediaRef) => !store.supabaseMedia.has(mediaRef)),
    );

    const counts = {
        total: normalized.length,
        localOnly: normalized.filter((item) => item.state === 'local-only').length,
        filesReady: normalized.filter((item) => item.state === 'files-ready').length,
        supabaseReady: normalized.filter((item) => item.state === 'supabase-ready').length,
        uploadRequired: normalized.filter((item) => item.state === 'upload-required').length,
        missing: normalized.filter((item) => item.state === 'missing').length,
    };

    let state: TrainingAssetReadinessSummary['state'] = 'ready';
    if (counts.missing > 0) {
        state = 'missing';
    } else if (counts.uploadRequired > 0) {
        state = 'needs-upload';
    } else if (counts.localOnly > 0 || counts.filesReady > 0) {
        state = 'incomplete';
    }

    const uploadPlan = buildTrainingAssetUploadPlan(input || ({} as TrainingAssetReadinessInput));
    return {
        state,
        counts,
        missingRequiredRefs,
        uploadPlan,
        items: Object.freeze(normalized),
    };
}

/**
 * Gera um plano deterministico para execucao de upload antes da aula.
 * Nao executa rede e nao requer credenciais.
 */
export function buildTrainingAssetUploadPlan(input: TrainingAssetReadinessInput): TrainingAssetUploadPlan {
    const refs = Array.isArray(input?.refs) ? input.refs : [];
    const store = buildStores(input || ({} as TrainingAssetReadinessInput));
    const seen = new Set<string>();
    const steps: TrainingAssetUploadStep[] = [];

    const requiredOnly = toOrderedUnique(Array.from(store.requiredUpload));

    const mediaRefsForPlan = toOrderedUnique(
        [...requiredOnly, ...refs.filter((r) => r.kind === 'media').map((r) => normalizeString(r.mediaRef))].filter(
            (v) => v.length > 0,
        ),
    );

    for (const mediaRef of mediaRefsForPlan) {
        if (store.supabaseMedia.has(mediaRef)) continue;
        if (seen.has(mediaRef)) continue;
        seen.add(mediaRef);

        const refsForMedia = refs.filter((r) => normalizeString(r.mediaRef) === mediaRef);
        const courseId =
            normalizeString(refsForMedia[0]?.courseId) || normalizeString(refsForMedia[0]?.id) || 'unknown-course';
        const lessonIndex = Number.isInteger(refsForMedia[0]?.lessonIndex as number)
            ? (refsForMedia[0]?.lessonIndex as number)
            : undefined;
        const required = store.requiredUpload.has(mediaRef);

        const preconditions: string[] = toOrderedUnique([
            `media:${mediaRef}`,
            ...(courseId !== 'unknown-course' ? [`course:${courseId}`] : []),
            ...(typeof lessonIndex === 'number' && lessonIndex > 0 ? [`lesson:${courseId}:${lessonIndex}`] : []),
            ...(required ? ['required-for-class'] : []),
        ]);

        const onFiles = store.filesMedia.has(mediaRef);
        if (!onFiles) {
            steps.push({
                kind: 'media',
                action: 'check-and-upload',
                courseId,
                mediaRef,
                targetRef: `${FILES_BUCKET}/${mediaRef}`,
                source: 'local',
                preconditions: Object.freeze(preconditions),
                skipReason: required ? 'required-media-not-in-files' : 'media-not-in-files-store',
                ...(typeof lessonIndex === 'number' ? { lessonIndex } : {}),
            });
            continue;
        }

        steps.push({
            kind: 'media',
            action: required ? 'check-and-upload' : 'ensure-meta',
            courseId,
            mediaRef,
            targetRef: `${SUPABASE_BUCKET}://training/${mediaRef}`,
            source: 'local',
            preconditions: Object.freeze(preconditions),
            ...(required ? {} : { skipReason: 'optional-upload' }),
            ...(typeof lessonIndex === 'number' ? { lessonIndex } : {}),
        });
    }

    return {
        filesBucket: FILES_BUCKET,
        supabaseBucket: SUPABASE_BUCKET,
        steps: Object.freeze(steps),
        missingRequiredRefs: Object.freeze(
            requiredOnly.filter((mediaRef) => !store.filesMedia.has(mediaRef) || !store.supabaseMedia.has(mediaRef)),
        ),
    };
}
