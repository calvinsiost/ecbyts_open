// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   MODULE VIEW CONTEXT PURE
   Describes which app module a Training/LMS lesson should open and with
   which filters, target, visual state, permissions, fallback and return path.
   No DOM, no storage and no network.
   ================================================================ */

export type ModuleSourceKind = 'training-slide' | 'presentation' | 'course-preview' | 'student-player' | string;
export type ModuleAudience = 'teacher' | 'student' | 'both';
export type ModuleCognitiveLoad = 'low' | 'medium' | 'high';
export type ModuleOpenMode = 'inline' | 'side-panel' | 'fullscreen' | 'open-live' | 'snapshot-only';
export type ModuleDensity = 'full' | 'minimal';

export interface ModuleContextSource {
    readonly kind: ModuleSourceKind;
    readonly courseId?: string;
    readonly deckId?: string;
    readonly slideId?: string;
    readonly slideIndex?: number;
    readonly modelKeyId?: string;
    readonly modelPresetId?: string;
    readonly returnLabel?: string;
}

export interface ModuleDestination {
    readonly moduleId: string;
    readonly adapterId: string;
    readonly mode: ModuleOpenMode;
    readonly target: Readonly<Record<string, unknown>>;
}

export interface ModuleDisplayIntent {
    readonly purpose: string;
    readonly audience: ModuleAudience;
    readonly primaryQuestion: string;
    readonly expectedTakeaway?: string;
    readonly cognitiveLoad: ModuleCognitiveLoad;
}

export interface ModuleViewContext {
    readonly id: string;
    readonly source: ModuleContextSource;
    readonly destination: ModuleDestination;
    readonly intent: ModuleDisplayIntent;
    readonly density: ModuleDensity;
    readonly query?: Readonly<Record<string, unknown>>;
    readonly filters?: Readonly<Record<string, unknown>>;
    readonly view?: Readonly<Record<string, unknown>>;
    readonly selection?: Readonly<Record<string, unknown>>;
    readonly permissions?: Readonly<Record<string, unknown>>;
    readonly fallback?: Readonly<Record<string, unknown>>;
    readonly audit?: Readonly<Record<string, unknown>>;
}

export interface ModuleViewContextValidation {
    readonly valid: boolean;
    readonly status: 'ready' | 'warning' | 'error';
    readonly errors: readonly string[];
    readonly warnings: readonly string[];
}

function text(value: unknown): string {
    return String(value ?? '').trim();
}

function optionalText(value: unknown): string | undefined {
    const clean = text(value);
    return clean || undefined;
}

function safeNumber(value: unknown): number | undefined {
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
}

function freezeRecord<T extends Record<string, unknown>>(record: T): Readonly<T> {
    return Object.freeze({ ...record }) as Readonly<T>;
}

function normalizeSource(input: unknown): ModuleContextSource {
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    const source: Record<string, unknown> = { kind: optionalText(raw.kind) || 'training-slide' };
    const courseId = optionalText(raw.courseId);
    const deckId = optionalText(raw.deckId);
    const slideId = optionalText(raw.slideId);
    const slideIndex = safeNumber(raw.slideIndex);
    const modelKeyId = optionalText(raw.modelKeyId);
    const modelPresetId = optionalText(raw.modelPresetId);
    const returnLabel = optionalText(raw.returnLabel);
    if (courseId) source.courseId = courseId;
    if (deckId) source.deckId = deckId;
    if (slideId) source.slideId = slideId;
    if (slideIndex !== undefined) source.slideIndex = slideIndex;
    if (modelKeyId) source.modelKeyId = modelKeyId;
    if (modelPresetId) source.modelPresetId = modelPresetId;
    if (returnLabel) source.returnLabel = returnLabel;
    return Object.freeze(source) as unknown as ModuleContextSource;
}

function normalizeDestination(input: unknown): ModuleDestination {
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    const target = raw.target && typeof raw.target === 'object' ? freezeRecord(raw.target as Record<string, unknown>) : {};
    return Object.freeze({
        moduleId: optionalText(raw.moduleId) || 'unknown',
        adapterId: optionalText(raw.adapterId) || 'unknown',
        mode: (optionalText(raw.mode) as ModuleOpenMode) || 'open-live',
        target,
    });
}

function normalizeIntent(input: unknown): ModuleDisplayIntent {
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    const intent: Record<string, unknown> = {
        purpose: optionalText(raw.purpose) || 'teacher-demo',
        audience: (optionalText(raw.audience) as ModuleAudience) || 'teacher',
        primaryQuestion: optionalText(raw.primaryQuestion) || 'Qual ponto desta tela precisa ser demonstrado?',
        cognitiveLoad: (optionalText(raw.cognitiveLoad) as ModuleCognitiveLoad) || 'medium',
    };
    const expectedTakeaway = optionalText(raw.expectedTakeaway);
    if (expectedTakeaway) intent.expectedTakeaway = expectedTakeaway;
    return Object.freeze(intent) as unknown as ModuleDisplayIntent;
}

function passthroughRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
    return value && typeof value === 'object' ? freezeRecord(value as Record<string, unknown>) : undefined;
}

export function normalizeDensity(value: unknown): ModuleDensity {
    return text(value).toLowerCase() === 'minimal' ? 'minimal' : 'full';
}

function resolveDensity(raw: Record<string, unknown>): ModuleDensity {
    if (raw.density !== undefined) return normalizeDensity(raw.density);
    const view = raw.view && typeof raw.view === 'object' ? (raw.view as Record<string, unknown>) : undefined;
    return normalizeDensity(view?.density);
}

function contextId(source: ModuleContextSource, destination: ModuleDestination): string {
    const slideRef = source.slideId || (source.slideIndex ?? 'slide');
    return [
        source.kind,
        source.courseId || source.deckId || 'course',
        slideRef,
        destination.moduleId,
        destination.adapterId,
    ].map((part) => text(part).replace(/[^a-z0-9._-]+/gi, '-').toLowerCase()).join(':');
}

export function normalizeModuleViewContext(input: unknown): ModuleViewContext {
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    const source = normalizeSource(raw.source);
    const destination = normalizeDestination(raw.destination);
    const context: Record<string, unknown> = {
        id: optionalText(raw.id) || contextId(source, destination),
        source,
        destination,
        intent: normalizeIntent(raw.intent),
        density: resolveDensity(raw),
    };
    const optionalRecords = ['query', 'filters', 'view', 'selection', 'permissions', 'fallback', 'audit'] as const;
    for (const key of optionalRecords) {
        const record = passthroughRecord(raw[key]);
        if (record) context[key] = record;
    }
    return Object.freeze(context) as unknown as ModuleViewContext;
}

function validateSource(source: ModuleContextSource, errors: string[], warnings: string[]): void {
    if (!source.kind) errors.push('source.kind ausente');
    if (!source.courseId && !source.deckId) errors.push('source precisa de courseId ou deckId');
    if (!source.slideId && source.slideIndex === undefined) errors.push('source precisa de slideId ou slideIndex');
    if (!source.modelPresetId) errors.push('source.modelPresetId ausente');
    if (!source.returnLabel) warnings.push('source.returnLabel ausente');
}

function validateDestination(destination: ModuleDestination, errors: string[]): void {
    if (!destination.moduleId || destination.moduleId === 'unknown') errors.push('destination.moduleId ausente');
    if (!destination.adapterId || destination.adapterId === 'unknown') errors.push('destination.adapterId ausente');
    if (!destination.target || Object.keys(destination.target).length === 0) errors.push('destination.target ausente');
}

function validateFiltersForTrainingSlide(context: ModuleViewContext, warnings: string[]): void {
    const filters = context.filters as Record<string, unknown> | undefined;
    const scope = filters?.scope as Record<string, unknown> | undefined;
    if (context.source.kind === 'training-slide' && scope?.source !== 'training') {
        warnings.push('filters.scope.source deveria ser training');
    }
}

export function validateModuleViewContext(input: unknown): ModuleViewContextValidation {
    const context = normalizeModuleViewContext(input);
    const errors: string[] = [];
    const warnings: string[] = [];
    validateSource(context.source, errors, warnings);
    validateDestination(context.destination, errors);
    if (!context.intent.primaryQuestion) warnings.push('intent.primaryQuestion ausente');
    validateFiltersForTrainingSlide(context, warnings);
    return Object.freeze({
        valid: errors.length === 0,
        status: errors.length ? 'error' : warnings.length ? 'warning' : 'ready',
        errors: Object.freeze(errors),
        warnings: Object.freeze(warnings),
    });
}

export type ModuleViewerRole = 'teacher' | 'student' | 'both';

export interface ModuleReadinessPermissions {
    readonly role?: ModuleViewerRole;
    readonly canSeeConfidential?: boolean;
    readonly canSeeDrafts?: boolean;
}

export interface ModuleContextReadiness {
    readonly ready: boolean;
    readonly status: 'ready' | 'fallback' | 'blocked';
    readonly reasons: readonly string[];
    readonly liveAvailable: boolean;
    readonly fallbackAvailable: boolean;
}

interface Visibility {
    readonly audience: string;
    readonly access: string;
    readonly status: string;
}

function readVisibility(context: ModuleViewContext): Visibility {
    const filters = (context.filters as Record<string, unknown> | undefined) || {};
    const visibility = filters.visibility as Record<string, unknown> | undefined;
    const permissions = (context.permissions as Record<string, unknown> | undefined) || {};
    return {
        audience: text(visibility?.audience || permissions?.audience || context.intent.audience).toLowerCase(),
        access: text(visibility?.access || permissions?.access).toLowerCase(),
        status: text(visibility?.status || permissions?.status).toLowerCase(),
    };
}

function isAdapterKnown(adapterId: string, availableAdapters: readonly string[]): boolean {
    if (availableAdapters.length === 0) return true;
    const normalizedId = text(adapterId).toLowerCase();
    return availableAdapters.some((value) => text(value).toLowerCase() === normalizedId);
}

function isFallbackAvailable(context: ModuleViewContext): boolean {
    const fallback = (context.fallback as Record<string, unknown> | undefined) || {};
    return Boolean(text(fallback.assetId) || text(fallback.text));
}

function checkStudentBlocks(
    visibility: Visibility,
    permissions: ModuleReadinessPermissions,
    reasons: string[],
): void {
    if (permissions.role !== 'student') return;

    if (visibility.audience === 'teacher') {
        reasons.push('aluno bloqueado: destino marcado audience=teacher');
    }
    if ((visibility.access === 'confidential' || visibility.access === 'restricted') && !permissions.canSeeConfidential) {
        reasons.push(`aluno bloqueado: destino ${visibility.access}`);
    }
    if (visibility.status === 'draft' && !permissions.canSeeDrafts) {
        reasons.push('aluno bloqueado: destino em rascunho');
    }
}

function computeReadinessStatus(
    blocked: boolean,
    adapterKnown: boolean,
    fallbackAvailable: boolean,
    reasons: string[],
): ModuleContextReadiness['status'] {
    if (blocked) return 'blocked';
    if (adapterKnown) return 'ready';
    if (fallbackAvailable) return 'fallback';
    reasons.push('adapter indisponivel e sem fallback');
    return 'blocked';
}

/**
 * Decide if a module-view context can open live, must fall back, or is blocked.
 * Pure: takes the context, the adapters the host currently supports and the
 * viewer permissions. Enforces the spec §9.1 blocking rules and §5.3.6
 * teacher-vs-student visibility — a student must never inherit a teacher-only or
 * confidential destination from a slide link.
 */
export function resolveContextReadiness(
    input: unknown,
    availableAdapters: readonly string[] = [],
    permissions: ModuleReadinessPermissions = {},
): ModuleContextReadiness {
    const context = normalizeModuleViewContext(input);
    const validation = validateModuleViewContext(context);
    const reasons: string[] = [...validation.errors];

    const adapterKnown = isAdapterKnown(context.destination.adapterId, availableAdapters);
    const fallbackAvailable = isFallbackAvailable(context);

    const permissionsWithRole: ModuleReadinessPermissions = { role: permissions.role || 'teacher', ...permissions };
    const visibility = readVisibility(context);

    // §5.3.6 / §9.1 — a student cannot open a teacher-only destination by link.
    checkStudentBlocks(visibility, permissionsWithRole, reasons);

    const blocked = reasons.length > 0;
    const liveAvailable = !blocked && adapterKnown;
    const status = computeReadinessStatus(blocked, adapterKnown, fallbackAvailable, reasons);

    return Object.freeze({
        ready: status === 'ready',
        status,
        reasons: Object.freeze(reasons),
        liveAvailable,
        fallbackAvailable,
    });
}

function buildStatusLabel(context: ModuleViewContext): string {
    return context.destination.mode === 'snapshot-only' ? 'Snapshot da aula' : 'Pronto para aula';
}

function buildModuleLabel(context: ModuleViewContext): string {
    const isGac = context.destination.moduleId === 'pipelines' && context.destination.adapterId.includes('gac');
    return isGac ? 'Pipelines / GAC' : context.destination.moduleId;
}

function buildFilterLabel(context: ModuleViewContext): string {
    const filters = context.filters as Record<string, unknown> | undefined;
    const scope = filters?.scope as Record<string, unknown> | undefined;
    return scope?.source === 'training' ? 'Somente aula' : 'Filtro geral';
}

function buildFallbackLabel(context: ModuleViewContext): string {
    const fallback = context.fallback as Record<string, unknown> | undefined;
    return text(fallback?.text || fallback?.assetId) ? 'Fallback pronto' : 'Sem fallback';
}

function buildPresetStatusLabel(context: ModuleViewContext): string {
    const target = context.destination.target || {};
    return text(target.templateId || target.pipelineId || context.source.modelPresetId);
}

function buildFallbackDetailLabel(context: ModuleViewContext): string {
    const fallback = context.fallback as Record<string, unknown> | undefined;
    return text(fallback?.text || fallback?.assetId || '');
}

export function summarizeContextForTeacher(input: unknown): Readonly<Record<string, string>> {
    const context = normalizeModuleViewContext(input);
    return Object.freeze({
        statusLabel: buildStatusLabel(context),
        moduleLabel: buildModuleLabel(context),
        filterLabel: buildFilterLabel(context),
        fallbackLabel: buildFallbackLabel(context),
        destinationLabel: `${context.destination.moduleId} / ${context.destination.adapterId}`,
        reasonLabel: context.intent.primaryQuestion,
        presetStatusLabel: buildPresetStatusLabel(context),
        returnLabel: context.source.returnLabel || 'Voltar ao slide',
        fallbackDetailLabel: buildFallbackDetailLabel(context),
    });
}
