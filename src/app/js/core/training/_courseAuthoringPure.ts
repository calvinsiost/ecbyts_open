// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   COURSE AUTHORING (pure) — COURSE-AUTHORING F1

   Autoria de curso no LMS: criar/editar cursos. A spec LMS original
   listava UGC (User-Generated Content) como "Won't Have" — o seed em
   lmsContent.ts é IMUTÁVEL e estritamente da equipe ecbyts. Esta feature
   abre a porta para o usuário AUTORAR seus próprios cursos, mas com uma
   distinção de confiança rígida: um curso autorado pelo usuário NÃO carrega
   a mesma confiança que um curso first-party (ver deriveCourseTrustTier).

   O `SeedTraining`/`SeedLesson` de lmsContent.ts são o shape PUBLICADO
   (frozen, status:'published' fixo). Aqui modelamos a versão MUTÁVEL/
   draftável: `CourseDraft`/`LessonDraft` — todos os 12 tipos de lição, com
   campos opcionais por tipo, editável até publicar.

   Padrões reusados:
   - Versionamento imutável (id, version) + supersededBy: espelhado de
     core/compliance/_supersessionPure.ts (RF11/ADR A8). Despublicar um curso
     publicado cria uma NOVA versão draft e marca a publicada como supersedida.
   - Trust-tier do certificado: amarra com core/training/_certHashPure.ts (B3) —
     certificado de curso self-attested não pode ser auto-emitido como "verificado".
   - Objetos frozen + APIs puras: estilo de core/friendliness/_friendlinessScorePure.ts.

   PURE: sem IO/DOM/THREE. Toda edição retorna um NOVO objeto (nunca muta a
   entrada). Testável isoladamente em tests/course-authoring.test.mjs.
   ================================================================ */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Proveniência do curso. Define o trust-tier do certificado emitido:
 * - 'first_party': curado pela equipe ecbyts (seed em lmsContent.ts).
 * - 'user_authored': autorado por um usuário via esta feature.
 */
export type CourseProvenance = 'first_party' | 'user_authored';

/** Estado do curso no ciclo de vida de autoria. */
export type CourseStatus = 'draft' | 'published' | 'archived';

/**
 * Os 12 tipos de lição (espelha SeedLesson.type de lmsContent.ts).
 * Mantido como union literal para validação por tipo no publish-gate.
 */
export type LessonType =
    | 'written'
    | 'video'
    | 'quiz'
    | 'interactive'
    | 'model-quiz'
    | 'classify'
    | 'interpret'
    | 'case'
    | 'order-investigation'
    | 'remediation-decision'
    | 'emergency'
    | 'checklist';

/** Lista canônica dos 12 tipos (frozen) — fonte da validação de tipo. */
export const LESSON_TYPES: readonly LessonType[] = Object.freeze([
    'written',
    'video',
    'quiz',
    'interactive',
    'model-quiz',
    'classify',
    'interpret',
    'case',
    'order-investigation',
    'remediation-decision',
    'emergency',
    'checklist',
]);

/** Uma opção de resposta de pergunta de quiz autorado. */
export interface DraftQuizOption {
    id?: string;
    text?: string;
    /** marca a opção como correta (≥1 correta exigida no publish). */
    correct?: boolean;
}

/** Uma pergunta de quiz autorado (mínimo p/ o publish-gate de 'quiz'). */
export interface DraftQuizQuestion {
    id?: string;
    text?: string;
    options?: DraftQuizOption[];
}

/**
 * Rascunho MUTÁVEL de uma lição. Espelha SeedLesson, mas:
 * - todos os campos por-tipo são opcionais (preenchidos conforme o autor avança);
 * - inclui `questions[]` para o tipo 'quiz' (no seed o quiz é separado do array).
 * As edições nunca mutam este objeto — sempre retornam um novo CourseDraft.
 */
export interface LessonDraft {
    id: string;
    title: string;
    type: LessonType;
    order: number;
    /** estimativa de execução em minutos (UX); exige >0 no publish. */
    minutes: number;
    /** markdown para 'written'/'interactive' (e intro de outros). */
    markdown?: string | null;
    /** alvo de vídeo (YouTube) para 'video'. */
    videoUrl?: string;
    caption?: string;
    transcript?: string;
    captionsUrl?: string;
    /** id do guided tour para 'interactive' (opcional, complementa markdown). */
    tourId?: string;
    /** id do caso (lições 'case'). */
    caseId?: string;
    /** id do cenário de decisão (order-investigation/remediation-decision). */
    decisionId?: string;
    /** id do exercício de ordenação (emergency/checklist). */
    exerciseId?: string;
    /** perguntas para 'quiz' (autoradas inline). */
    questions?: DraftQuizQuestion[];
    /**
     * alvo dos tipos data-driven (classify/interpret/model-quiz): id do poço,
     * parâmetro, ou referência de modelo que a lição avalia. Genérico de propósito
     * — o publish-gate só exige que esteja preenchido (não-vazio).
     */
    targetRef?: string;
}

/** Preço do curso (default gratuito). */
export interface CoursePricing {
    is_paid: boolean;
    price_cents: number;
}

/** Rascunho MUTÁVEL de um curso (a entidade autorável). */
export interface CourseDraft {
    id: string;
    title: string;
    description: string;
    category: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    /** locale do conteúdo (ex.: 'pt-BR'). */
    language: string;
    ownerId: string;
    provenance: CourseProvenance;
    status: CourseStatus;
    /** versão imutável crescente (espelha _supersessionPure). */
    version: number;
    /** id da versão que SUPERSEDE esta (preenchido ao despublicar). */
    supersededBy?: string | null;
    lessons: LessonDraft[];
    pricing: CoursePricing;
    createdAt: string;
    updatedAt: string;
}

/** Erro de validação do publish-gate. */
export interface PublishError {
    /** campo/locus do erro (ex.: 'title', 'lessons[2].videoUrl'). */
    readonly field: string;
    /** código estável (machine-readable, i18n-able). */
    readonly code: string;
    /** mensagem legível pt-BR. */
    readonly message: string;
}

/** Resultado do publish-gate. */
export interface PublishGateResult {
    readonly ok: boolean;
    readonly errors: readonly PublishError[];
}

/** Trust-tier do certificado derivado da proveniência do curso. */
export type CourseTrustTier = 'verified_first_party' | 'self_attested';

/** Ação da máquina de estados de status. */
export type CourseStatusAction = 'publish' | 'unpublish' | 'archive' | 'restore';

/** Resultado de transição de status. */
export interface TransitionResult {
    readonly ok: boolean;
    /** novo draft (e, no unpublish, eventualmente o publicado supersedido). */
    readonly draft: CourseDraft;
    /**
     * No unpublish: o curso publicado anterior, agora marcado como supersedido
     * (supersededBy → id da nova versão draft). Caller persiste ambos.
     */
    readonly superseded?: CourseDraft | null;
    /** erros que impediram a transição (ex.: publish em curso inválido). */
    readonly errors: readonly PublishError[];
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Clock injetável p/ determinismo em testes (default: relógio real). */
type Clock = () => string;
const realClock: Clock = () => new Date().toISOString();

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.trim().length > 0;
}

/** Reordena `order` 1..N preservando a ordem do array. */
function reindexOrder(lessons: LessonDraft[]): LessonDraft[] {
    return lessons.map((l, i) => ({ ...l, order: i + 1 }));
}

/** Clona raso o array de lições (cada lição é um objeto novo). */
function cloneLessons(lessons: LessonDraft[]): LessonDraft[] {
    return lessons.map((l) => {
        const cloned: LessonDraft = { ...l };
        if (l.questions) cloned.questions = l.questions.map((q) => ({ ...q }));
        return cloned;
    });
}

/** Constrói um novo draft a partir de patches, recomputando order + updatedAt. */
function withDraft(
    base: CourseDraft,
    patch: Partial<CourseDraft>,
    clock: Clock,
): CourseDraft {
    const next: CourseDraft = {
        ...base,
        ...patch,
        lessons: reindexOrder(patch.lessons ?? cloneLessons(base.lessons)),
        pricing: patch.pricing ? { ...patch.pricing } : { ...base.pricing },
        updatedAt: clock(),
    };
    return next;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface EmptyCourseOpts {
    id?: string;
    title?: string;
    description?: string;
    category?: string;
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
    language?: string;
    pricing?: Partial<CoursePricing>;
    /** clock injetável p/ testes determinísticos. */
    clock?: Clock;
}

/**
 * Cria um rascunho de curso vazio para `ownerId`.
 * status='draft', version=1, provenance='user_authored'.
 */
export function emptyCourseDraft(ownerId: string, opts: EmptyCourseOpts = {}): CourseDraft {
    const clock = opts.clock ?? realClock;
    const now = clock();
    const owner = isNonEmptyString(ownerId) ? ownerId : 'anonymous';
    const id = isNonEmptyString(opts.id) ? opts.id : `course-${owner}-${now}`;
    return {
        id,
        title: opts.title ?? '',
        description: opts.description ?? '',
        category: opts.category ?? 'general',
        difficulty: opts.difficulty ?? 'beginner',
        language: opts.language ?? 'pt-BR',
        ownerId: owner,
        provenance: 'user_authored',
        status: 'draft',
        version: 1,
        supersededBy: null,
        lessons: [],
        pricing: {
            is_paid: !!opts.pricing?.is_paid,
            price_cents: Math.max(0, Math.round(Number(opts.pricing?.price_cents) || 0)),
        },
        createdAt: now,
        updatedAt: now,
    };
}

// ---------------------------------------------------------------------------
// Edições imutáveis (retornam NOVO draft, nunca mutam)
// ---------------------------------------------------------------------------

/** Adiciona uma lição ao fim do curso. Recomputa order 1..N e updatedAt. */
export function addLesson(
    draft: CourseDraft,
    lessonDraft: Partial<LessonDraft> & { id: string; type: LessonType },
    clock: Clock = realClock,
): CourseDraft {
    const lessons = cloneLessons(draft.lessons);
    const lesson: LessonDraft = {
        title: '',
        minutes: 0,
        markdown: null,
        ...lessonDraft,
        id: lessonDraft.id,
        type: lessonDraft.type,
        order: lessons.length + 1,
    };
    lessons.push(lesson);
    return withDraft(draft, { lessons }, clock);
}

/** Remove uma lição por id. Recomputa order 1..N e updatedAt. */
export function removeLesson(draft: CourseDraft, lessonId: string, clock: Clock = realClock): CourseDraft {
    const lessons = cloneLessons(draft.lessons).filter((l) => l.id !== lessonId);
    return withDraft(draft, { lessons }, clock);
}

/**
 * Reordena uma lição. `target` aceita uma direção ('up'/'down') OU um índice
 * absoluto (0-based) de destino. Recomputa order 1..N e updatedAt.
 */
export function reorderLesson(
    draft: CourseDraft,
    lessonId: string,
    target: 'up' | 'down' | number,
    clock: Clock = realClock,
): CourseDraft {
    const lessons = cloneLessons(draft.lessons);
    const idx = lessons.findIndex((l) => l.id === lessonId);
    if (idx < 0) return withDraft(draft, { lessons }, clock); // no-op (mas updatedAt avança)

    let newIndex: number;
    if (target === 'up') newIndex = idx - 1;
    else if (target === 'down') newIndex = idx + 1;
    else newIndex = Math.trunc(Number(target));

    // clamp p/ faixa válida
    newIndex = Math.max(0, Math.min(lessons.length - 1, newIndex));
    if (newIndex === idx) return withDraft(draft, { lessons }, clock);

    const [moved] = lessons.splice(idx, 1);
    if (!moved) return withDraft(draft, { lessons }, clock);
    lessons.splice(newIndex, 0, moved);
    return withDraft(draft, { lessons }, clock);
}

/** Aplica um patch parcial a uma lição (por id). Recomputa order + updatedAt. */
export function updateLesson(
    draft: CourseDraft,
    lessonId: string,
    patch: Partial<LessonDraft>,
    clock: Clock = realClock,
): CourseDraft {
    const lessons = cloneLessons(draft.lessons).map((l) =>
        l.id === lessonId ? { ...l, ...patch, id: l.id } : l,
    );
    return withDraft(draft, { lessons }, clock);
}

/** Patch parcial dos metadados do curso (não toca em lições/versão/status). */
export function updateCourseMeta(
    draft: CourseDraft,
    patch: Partial<Pick<CourseDraft, 'title' | 'description' | 'category' | 'difficulty' | 'language' | 'pricing'>>,
    clock: Clock = realClock,
): CourseDraft {
    const safe: Partial<CourseDraft> = {};
    if (patch.title !== undefined) safe.title = patch.title;
    if (patch.description !== undefined) safe.description = patch.description;
    if (patch.category !== undefined) safe.category = patch.category;
    if (patch.difficulty !== undefined) safe.difficulty = patch.difficulty;
    if (patch.language !== undefined) safe.language = patch.language;
    if (patch.pricing !== undefined) {
        safe.pricing = {
            is_paid: !!patch.pricing.is_paid,
            price_cents: Math.max(0, Math.round(Number(patch.pricing.price_cents) || 0)),
        };
    }
    return withDraft(draft, safe, clock);
}

// ---------------------------------------------------------------------------
// Publish-gate (validação por tipo)
// ---------------------------------------------------------------------------

/**
 * Valida UMA lição conforme seu tipo. Retorna os erros encontrados (vazio = ok).
 * @param lesson locus para os erros (ex.: 'lessons[2]').
 */
function validateLesson(lesson: LessonDraft, prefix: string): PublishError[] {
    const errors: PublishError[] = [];

    if (!isNonEmptyString(lesson.title)) {
        errors.push({ field: `${prefix}.title`, code: 'lesson_title_required', message: 'O título da lição não pode ficar vazio.' });
    }
    if (!(Number(lesson.minutes) > 0)) {
        errors.push({ field: `${prefix}.minutes`, code: 'lesson_minutes_positive', message: 'A duração da lição em minutos deve ser maior que zero.' });
    }
    if (!LESSON_TYPES.includes(lesson.type)) {
        errors.push({ field: `${prefix}.type`, code: 'lesson_type_unknown', message: `Tipo de lição desconhecido: "${String(lesson.type)}".` });
        return errors; // tipo inválido: não dá para validar campos por-tipo
    }

    switch (lesson.type) {
        case 'video':
            if (!isNonEmptyString(lesson.videoUrl)) {
                errors.push({ field: `${prefix}.videoUrl`, code: 'video_url_required', message: 'Lição de vídeo exige uma URL de vídeo.' });
            }
            break;
        case 'quiz': {
            const qs = Array.isArray(lesson.questions) ? lesson.questions : [];
            if (qs.length < 1) {
                errors.push({ field: `${prefix}.questions`, code: 'quiz_needs_question', message: 'Lição de quiz exige ao menos uma pergunta.' });
                break;
            }
            qs.forEach((q, qi) => {
                const opts = Array.isArray(q.options) ? q.options : [];
                const hasCorrect = opts.some((o) => !!o.correct);
                if (!hasCorrect) {
                    errors.push({
                        field: `${prefix}.questions[${qi}]`,
                        code: 'quiz_needs_correct_option',
                        message: 'Cada pergunta de quiz precisa de ao menos uma opção correta.',
                    });
                }
            });
            break;
        }
        case 'written':
        case 'interactive':
            if (!isNonEmptyString(lesson.markdown)) {
                errors.push({ field: `${prefix}.markdown`, code: 'markdown_required', message: 'Lição escrita/interativa exige conteúdo em markdown.' });
            }
            break;
        case 'case':
            if (!isNonEmptyString(lesson.caseId)) {
                errors.push({ field: `${prefix}.caseId`, code: 'case_id_required', message: 'Lição de caso exige um identificador de caso (caseId).' });
            }
            break;
        case 'order-investigation':
        case 'remediation-decision':
            if (!isNonEmptyString(lesson.decisionId)) {
                errors.push({ field: `${prefix}.decisionId`, code: 'decision_id_required', message: 'Lição de decisão exige um identificador de cenário (decisionId).' });
            }
            break;
        case 'emergency':
        case 'checklist':
            if (!isNonEmptyString(lesson.exerciseId)) {
                errors.push({ field: `${prefix}.exerciseId`, code: 'exercise_id_required', message: 'Lição de emergência/checklist exige um identificador de exercício (exerciseId).' });
            }
            break;
        case 'classify':
        case 'interpret':
        case 'model-quiz':
            if (!isNonEmptyString(lesson.targetRef)) {
                errors.push({ field: `${prefix}.targetRef`, code: 'target_ref_required', message: 'Lição baseada em dados exige uma referência-alvo (targetRef).' });
            }
            break;
    }
    return errors;
}

/**
 * Gate de publicação. Um curso só pode ser publicado se passar em TODAS as
 * regras. Retorna `{ ok, errors[] }`. NÃO muta o draft.
 *
 * Regras: título não-vazio; descrição não-vazia; ≥1 lição; ids de lição únicos;
 * cada lição válida para seu tipo (ver validateLesson).
 */
export function validateCourseForPublish(draft: CourseDraft): PublishGateResult {
    const errors: PublishError[] = [];

    if (!draft || typeof draft !== 'object') {
        return Object.freeze({ ok: false, errors: Object.freeze([{ field: 'draft', code: 'draft_invalid', message: 'Rascunho de curso inválido.' }]) });
    }

    if (!isNonEmptyString(draft.title)) {
        errors.push({ field: 'title', code: 'course_title_required', message: 'O título do curso não pode ficar vazio.' });
    }
    if (!isNonEmptyString(draft.description)) {
        errors.push({ field: 'description', code: 'course_description_required', message: 'A descrição do curso não pode ficar vazia.' });
    }

    const lessons = Array.isArray(draft.lessons) ? draft.lessons : [];
    if (lessons.length < 1) {
        errors.push({ field: 'lessons', code: 'course_needs_lesson', message: 'O curso precisa de ao menos uma lição.' });
    }

    // ids de lição duplicados
    const seen = new Set<string>();
    lessons.forEach((l, i) => {
        if (isNonEmptyString(l.id)) {
            if (seen.has(l.id)) {
                errors.push({ field: `lessons[${i}].id`, code: 'lesson_id_duplicate', message: `Id de lição duplicado: "${l.id}".` });
            }
            seen.add(l.id);
        } else {
            errors.push({ field: `lessons[${i}].id`, code: 'lesson_id_required', message: 'Toda lição precisa de um id.' });
        }
    });

    // validação por-tipo
    lessons.forEach((l, i) => {
        for (const err of validateLesson(l, `lessons[${i}]`)) errors.push(err);
    });

    return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

// ---------------------------------------------------------------------------
// Máquina de estados de status
// ---------------------------------------------------------------------------

/**
 * Transiciona o status do curso conforme a ação.
 *
 * - publish: SÓ se validateCourseForPublish(draft).ok → status='published'.
 *   Caso contrário retorna ok=false com os erros do gate (não muta o status).
 * - unpublish: de 'published' cria uma NOVA versão draft (version+1, status='draft',
 *   supersededBy=null) e retorna o curso publicado anterior marcado como
 *   supersedido (supersededBy → id/handle da nova versão). Espelha _supersessionPure.
 * - archive: → status='archived'.
 * - restore: → status='draft'.
 *
 * NÃO muta o draft de entrada — retorna novos objetos.
 */
export function transitionCourseStatus(
    draft: CourseDraft,
    action: CourseStatusAction,
    clock: Clock = realClock,
): TransitionResult {
    const base = withDraft(draft, {}, clock); // cópia + updatedAt

    switch (action) {
        case 'publish': {
            const gate = validateCourseForPublish(draft);
            if (!gate.ok) {
                return Object.freeze({ ok: false, draft: { ...base, status: draft.status }, superseded: null, errors: gate.errors });
            }
            return Object.freeze({ ok: true, draft: { ...base, status: 'published' as CourseStatus }, superseded: null, errors: Object.freeze([]) });
        }

        case 'unpublish': {
            if (draft.status !== 'published') {
                return Object.freeze({
                    ok: false,
                    draft: { ...base, status: draft.status },
                    superseded: null,
                    errors: Object.freeze([{ field: 'status', code: 'unpublish_requires_published', message: 'Só é possível despublicar um curso que está publicado.' }]),
                });
            }
            // Nova versão draft: version+1, status draft, supersededBy zerado.
            const nextVersion = (Number(draft.version) || 1) + 1;
            const newDraftId = `${baseCourseId(draft.id)}@v${nextVersion}`;
            const newDraft: CourseDraft = {
                ...base,
                id: newDraftId,
                version: nextVersion,
                status: 'draft' as CourseStatus,
                supersededBy: null,
            };
            // Curso publicado anterior, agora supersedido pela nova versão.
            const superseded: CourseDraft = {
                ...withDraft(draft, {}, clock),
                status: 'published' as CourseStatus,
                supersededBy: newDraftId,
            };
            return Object.freeze({ ok: true, draft: newDraft, superseded, errors: Object.freeze([]) });
        }

        case 'archive':
            return Object.freeze({ ok: true, draft: { ...base, status: 'archived' as CourseStatus }, superseded: null, errors: Object.freeze([]) });

        case 'restore':
            return Object.freeze({ ok: true, draft: { ...base, status: 'draft' as CourseStatus }, superseded: null, errors: Object.freeze([]) });

        default:
            return Object.freeze({
                ok: false,
                draft: { ...base, status: draft.status },
                superseded: null,
                errors: Object.freeze([{ field: 'action', code: 'unknown_action', message: `Ação de status desconhecida: "${String(action)}".` }]),
            });
    }
}

/** Extrai o id-base do curso, removendo o sufixo de versão `@vN` se presente. */
function baseCourseId(id: string): string {
    const s = isNonEmptyString(id) ? id : 'course';
    const at = s.lastIndexOf('@v');
    return at > 0 ? s.slice(0, at) : s;
}

// ---------------------------------------------------------------------------
// Trust-tier do certificado
// ---------------------------------------------------------------------------

/**
 * Deriva o trust-tier do certificado emitido por este curso.
 *
 * - 'verified_first_party': curso curado pela equipe ecbyts. O certificado pode
 *   ser ancorado por um hash verificável (ver _certHashPure.ts / B3) e exibido
 *   como "verificado".
 * - 'self_attested': curso autorado pelo PRÓPRIO usuário. O certificado NÃO
 *   carrega a mesma confiança — não pode ser auto-emitido como "verificado",
 *   porque o autor e o avaliado podem ser a mesma parte (conflito de interesse).
 *   A UI/servidor deve rotular esse certificado como "autoatestado".
 */
export function deriveCourseTrustTier(draft: CourseDraft): CourseTrustTier {
    return draft && draft.provenance === 'first_party' ? 'verified_first_party' : 'self_attested';
}

// ---------------------------------------------------------------------------
// Fusão com o catálogo
// ---------------------------------------------------------------------------

/** Shape mínimo de uma entrada de catálogo (compatível com SeedTraining e CourseDraft). */
interface CatalogLike {
    readonly id: string;
    readonly status?: string;
    readonly provenance?: string;
}

/**
 * Funde os cursos first-party (seed) com os autorados publicados.
 *
 * - Apenas cursos autorados com status='published' entram (drafts/archived ficam fora).
 * - Em colisão de id, o curso first-party (seed) SEMPRE vence — um curso autorado
 *   nunca sobrescreve um first-party (proteção de confiança).
 *
 * @returns array fundido (seed primeiro, depois autorados não-colidentes).
 */
export function mergeAuthoredIntoCatalog<S extends CatalogLike, A extends CatalogLike>(
    seedCatalog: readonly S[],
    authoredCourses: readonly A[],
): (S | A)[] {
    const seed = Array.isArray(seedCatalog) ? seedCatalog : [];
    const authored = Array.isArray(authoredCourses) ? authoredCourses : [];

    const seedIds = new Set<string>();
    for (const c of seed) {
        if (c && isNonEmptyString(c.id)) seedIds.add(c.id);
    }

    const merged: (S | A)[] = [...seed];
    const addedAuthored = new Set<string>();
    for (const c of authored) {
        if (!c || !isNonEmptyString(c.id)) continue;
        if (c.status !== 'published') continue; // só publicados
        if (seedIds.has(c.id)) continue; // first-party vence colisão
        if (addedAuthored.has(c.id)) continue; // dedup entre autorados
        addedAuthored.add(c.id);
        merged.push(c);
    }
    return merged;
}
