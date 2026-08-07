// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   TEACHING SURFACE PURE

   Tiny pure contract for deck slides that open live teaching surfaces.
   No DOM, handlers, storage, network, or generated app/js coupling.
   ================================================================ */

export const TEACHING_SURFACE_SPEC_REF = 'TRAINING-DECK-WORKBENCH-GAC-FILES-UX-001';

export const TEACHING_SURFACE_TYPES = [
    'pipelines-gac',
    'analytics-temporal',
    'governance-gantt',
    'dom-surface',
    'files-asset',
] as const;

export type TeachingSurfaceType = (typeof TEACHING_SURFACE_TYPES)[number];

export type WorkspaceTarget =
    | {
          readonly type: 'pipeline';
          readonly pipelineId?: string;
          readonly templateId?: string;
          readonly nodeId?: string;
          readonly mode?: 'view' | 'run' | 'explain';
      }
    | {
          readonly type: 'analytics-temporal';
          readonly elementId?: string;
          readonly parameterId?: string;
          readonly method?: 'mannKendall' | 'seasonalMK' | 'theilSen' | 'pettitt';
          readonly mode?: 'run' | 'explain';
      }
    | {
          readonly type: 'governance-project';
          readonly projectId?: string;
          readonly view?: 'gantt' | 'resources' | 'eva' | 'timesheet';
          readonly phaseId?: string;
      }
    | {
          readonly type: 'dom-surface';
          readonly toolId?: string;
          readonly selector?: string;
          readonly intent?: 'highlight' | 'inspect' | 'demo';
          readonly snapshotAssetId?: string;
      }
    | {
          readonly type: 'files';
          readonly fileId?: string;
          readonly filter?: Readonly<Record<string, string>>;
      };

export interface TeachingSurface {
    readonly id: string;
    readonly type: TeachingSurfaceType | null;
    readonly label: string;
    readonly target: WorkspaceTarget | null;
    readonly modelPresetId: string | null;
    readonly fallbackAssetId: string | null;
    readonly slideId?: string;
    readonly liveAvailable?: boolean;
}

export interface TeachingSurfaceInput {
    readonly id?: unknown;
    readonly slideId?: unknown;
    readonly type?: unknown;
    readonly kind?: unknown;
    readonly adapterId?: unknown;
    readonly label?: unknown;
    readonly target?: unknown;
    readonly modelPresetId?: unknown;
    readonly fallbackAssetId?: unknown;
    readonly snapshotAssetId?: unknown;
    readonly liveAvailable?: unknown;
}

export interface TeachingSurfaceAdapter {
    readonly type: TeachingSurfaceType;
    readonly adapterId: 'pipelines.gac' | 'analytics.temporal' | 'governance.gantt' | 'dom.anchor' | 'files.asset';
    readonly label: string;
    readonly requiredCapability: 'pipelines' | 'analytics-temporal' | 'governance-project' | 'dom-surface' | 'files';
    readonly targetType: WorkspaceTarget['type'];
    readonly requiresPreset: boolean;
    readonly requiresFallback: boolean;
    readonly teacherVerb: string;
    readonly specRef: typeof TEACHING_SURFACE_SPEC_REF;
}

export type TeachingSurfaceIssueCode =
    | 'surface_type_required'
    | 'adapter_not_registered'
    | 'workspace_target_required'
    | 'workspace_target_incomplete'
    | 'model_preset_id_required'
    | 'fallback_asset_required';

export interface TeachingSurfaceIssue {
    readonly code: TeachingSurfaceIssueCode;
    readonly message: string;
    readonly field?: string;
}

export type TeachingSurfaceResolution = 'open-live' | 'use-fallback' | 'blocked';
export type TeachingSurfaceStatus = 'valid' | 'warning' | 'invalid';
export type TeachingSurfaceFallbackPolicy = 'always' | 'when-live-unavailable';

export interface TeachingSurfaceValidationOptions {
    readonly availableSurfaceTypes?: readonly TeachingSurfaceType[];
    readonly availableAdapterIds?: readonly string[];
    readonly fallbackPolicy?: TeachingSurfaceFallbackPolicy;
    readonly requirePreset?: boolean;
}

export interface TeachingSurfaceValidation {
    readonly ok: boolean;
    readonly status: TeachingSurfaceStatus;
    readonly resolution: TeachingSurfaceResolution;
    readonly surface: TeachingSurface;
    readonly adapter: TeachingSurfaceAdapter | null;
    readonly issues: readonly TeachingSurfaceIssue[];
    readonly teacherMessage: string;
}

export const DEFAULT_TEACHING_SURFACE_ADAPTERS: readonly TeachingSurfaceAdapter[] = Object.freeze([
    Object.freeze({
        type: 'pipelines-gac',
        adapterId: 'pipelines.gac',
        label: 'Fluxo GAC',
        requiredCapability: 'pipelines',
        targetType: 'pipeline',
        requiresPreset: true,
        requiresFallback: true,
        teacherVerb: 'abrir o fluxo GAC',
        specRef: TEACHING_SURFACE_SPEC_REF,
    }),
    Object.freeze({
        type: 'analytics-temporal',
        adapterId: 'analytics.temporal',
        label: 'Mann-Kendall temporal',
        requiredCapability: 'analytics-temporal',
        targetType: 'analytics-temporal',
        requiresPreset: true,
        requiresFallback: true,
        teacherVerb: 'abrir a analise temporal',
        specRef: TEACHING_SURFACE_SPEC_REF,
    }),
    Object.freeze({
        type: 'governance-gantt',
        adapterId: 'governance.gantt',
        label: 'Gantt de governanca',
        requiredCapability: 'governance-project',
        targetType: 'governance-project',
        requiresPreset: true,
        requiresFallback: true,
        teacherVerb: 'abrir o Gantt',
        specRef: TEACHING_SURFACE_SPEC_REF,
    }),
    Object.freeze({
        type: 'dom-surface',
        adapterId: 'dom.anchor',
        label: 'Superficie DOM',
        requiredCapability: 'dom-surface',
        targetType: 'dom-surface',
        requiresPreset: true,
        requiresFallback: true,
        teacherVerb: 'destacar a superficie DOM',
        specRef: TEACHING_SURFACE_SPEC_REF,
    }),
    Object.freeze({
        type: 'files-asset',
        adapterId: 'files.asset',
        label: 'Asset em Files',
        requiredCapability: 'files',
        targetType: 'files',
        requiresPreset: true,
        requiresFallback: true,
        teacherVerb: 'abrir o asset em Files',
        specRef: TEACHING_SURFACE_SPEC_REF,
    }),
]);

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
}

function idText(value: unknown, fallback: string): string {
    const raw = text(value) || fallback;
    const slug = raw.toLowerCase().replace(/[^a-z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || fallback;
}

function booleanOrUndefined(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function targetRecord(input: unknown): Record<string, unknown> {
    return asRecord(input);
}

function stringRecord(value: unknown): Readonly<Record<string, string>> | undefined {
    const input = asRecord(value);
    const out: Record<string, string> = {};
    for (const [key, raw] of Object.entries(input)) {
        const cleanKey = text(key);
        const cleanValue = text(raw);
        if (cleanKey && cleanValue) out[cleanKey] = cleanValue;
    }
    return Object.keys(out).length > 0 ? Object.freeze(out) : undefined;
}

function normalizePipelineTarget(input: unknown): WorkspaceTarget {
    const target = targetRecord(input);
    const mode = text(target.mode);
    const out: {
        readonly type: 'pipeline';
        pipelineId?: string;
        templateId?: string;
        nodeId?: string;
        mode?: 'view' | 'run' | 'explain';
    } = { type: 'pipeline' };
    const pipelineId = text(target.pipelineId);
    const templateId = text(target.templateId);
    const nodeId = text(target.nodeId);
    if (pipelineId) out.pipelineId = pipelineId;
    if (templateId) out.templateId = templateId;
    if (nodeId) out.nodeId = nodeId;
    if (mode === 'view' || mode === 'run' || mode === 'explain') out.mode = mode;
    return Object.freeze(out);
}

function normalizeTemporalTarget(input: unknown): WorkspaceTarget {
    const target = targetRecord(input);
    const method = text(target.method);
    const mode = text(target.mode);
    const out: {
        readonly type: 'analytics-temporal';
        elementId?: string;
        parameterId?: string;
        method?: 'mannKendall' | 'seasonalMK' | 'theilSen' | 'pettitt';
        mode?: 'run' | 'explain';
    } = { type: 'analytics-temporal' };
    const elementId = text(target.elementId);
    const parameterId = text(target.parameterId);
    if (elementId) out.elementId = elementId;
    if (parameterId) out.parameterId = parameterId;
    if (method === 'mannKendall' || method === 'seasonalMK' || method === 'theilSen' || method === 'pettitt') {
        out.method = method;
    }
    if (mode === 'run' || mode === 'explain') out.mode = mode;
    return Object.freeze(out);
}

function normalizeGanttTarget(input: unknown): WorkspaceTarget {
    const target = targetRecord(input);
    const view = text(target.view);
    const out: {
        readonly type: 'governance-project';
        projectId?: string;
        view?: 'gantt' | 'resources' | 'eva' | 'timesheet';
        phaseId?: string;
    } = { type: 'governance-project' };
    const projectId = text(target.projectId);
    const phaseId = text(target.phaseId);
    if (projectId) out.projectId = projectId;
    if (view === 'resources' || view === 'eva' || view === 'timesheet') out.view = view;
    else out.view = 'gantt';
    if (phaseId) out.phaseId = phaseId;
    return Object.freeze(out);
}

function normalizeDomTarget(input: unknown): WorkspaceTarget {
    const target = targetRecord(input);
    const intent = text(target.intent);
    const out: {
        readonly type: 'dom-surface';
        toolId?: string;
        selector?: string;
        intent?: 'highlight' | 'inspect' | 'demo';
        snapshotAssetId?: string;
    } = { type: 'dom-surface' };
    const toolId = text(target.toolId);
    const selector = text(target.selector);
    const snapshotAssetId = text(target.snapshotAssetId);
    if (toolId) out.toolId = toolId;
    if (selector) out.selector = selector;
    if (intent === 'highlight' || intent === 'inspect' || intent === 'demo') out.intent = intent;
    if (snapshotAssetId) out.snapshotAssetId = snapshotAssetId;
    return Object.freeze(out);
}

function normalizeFilesTarget(input: unknown): WorkspaceTarget {
    const target = targetRecord(input);
    const out: {
        readonly type: 'files';
        fileId?: string;
        filter?: Readonly<Record<string, string>>;
    } = { type: 'files' };
    const fileId = text(target.fileId);
    const filter = stringRecord(target.filter);
    if (fileId) out.fileId = fileId;
    if (filter) out.filter = filter;
    return Object.freeze(out);
}

export function normalizeTeachingSurfaceType(value: unknown): TeachingSurfaceType | null {
    const raw = text(value).toLowerCase().replace(/_/g, '-').replace(/\./g, '-');
    if (TEACHING_SURFACE_TYPES.includes(raw as TeachingSurfaceType)) return raw as TeachingSurfaceType;
    if (raw === 'pipeline' || raw === 'pipelines' || raw === 'pipelines-gac-dd38') return 'pipelines-gac';
    if (raw === 'analytics' || raw === 'temporal' || raw === 'mann-kendall') return 'analytics-temporal';
    if (raw === 'governance' || raw === 'governance-project' || raw === 'gantt') return 'governance-gantt';
    if (raw === 'dom' || raw === 'dom-anchor') return 'dom-surface';
    if (raw === 'files' || raw === 'file' || raw === 'asset') return 'files-asset';
    return null;
}

export function surfaceTypeFromWorkspaceTarget(target: unknown): TeachingSurfaceType | null {
    const type = text(asRecord(target).type);
    if (type === 'pipeline') return 'pipelines-gac';
    if (type === 'analytics-temporal') return 'analytics-temporal';
    if (type === 'governance-project') return 'governance-gantt';
    if (type === 'dom-surface') return 'dom-surface';
    if (type === 'files') return 'files-asset';
    return normalizeTeachingSurfaceType(type);
}

export function normalizeWorkspaceTarget(target: unknown, surfaceType?: TeachingSurfaceType | null): WorkspaceTarget | null {
    const type = surfaceType || surfaceTypeFromWorkspaceTarget(target);
    if (type === 'pipelines-gac') return normalizePipelineTarget(target);
    if (type === 'analytics-temporal') return normalizeTemporalTarget(target);
    if (type === 'governance-gantt') return normalizeGanttTarget(target);
    if (type === 'dom-surface') return normalizeDomTarget(target);
    if (type === 'files-asset') return normalizeFilesTarget(target);
    return null;
}

export function createTeachingSurfaceAdapterRegistry(
    adapters: readonly TeachingSurfaceAdapter[] = DEFAULT_TEACHING_SURFACE_ADAPTERS,
): ReadonlyMap<TeachingSurfaceType, TeachingSurfaceAdapter> {
    const registry = new Map<TeachingSurfaceType, TeachingSurfaceAdapter>();
    for (const adapter of adapters) {
        registry.set(adapter.type, adapter);
    }
    return registry;
}

export function resolveTeachingSurfaceAdapter(
    typeOrAdapterId: unknown,
    adapters: readonly TeachingSurfaceAdapter[] = DEFAULT_TEACHING_SURFACE_ADAPTERS,
): TeachingSurfaceAdapter | null {
    const normalizedType = normalizeTeachingSurfaceType(typeOrAdapterId);
    if (normalizedType) {
        return adapters.find((adapter) => adapter.type === normalizedType) ?? null;
    }
    const adapterId = text(typeOrAdapterId);
    return adapters.find((adapter) => adapter.adapterId === adapterId) ?? null;
}

export function normalizeTeachingSurface(input: TeachingSurfaceInput): TeachingSurface {
    const record = asRecord(input);
    const targetInput = record.target;
    const type =
        normalizeTeachingSurfaceType(record.type) ||
        normalizeTeachingSurfaceType(record.kind) ||
        normalizeTeachingSurfaceType(record.adapterId) ||
        surfaceTypeFromWorkspaceTarget(targetInput);
    const target = normalizeWorkspaceTarget(targetInput, type);
    const fallbackAssetId = text(record.fallbackAssetId) || text(record.snapshotAssetId) || text(asRecord(target).snapshotAssetId) || null;
    const slideId = text(record.slideId);
    const liveAvailable = booleanOrUndefined(record.liveAvailable);
    const out: {
        id: string;
        type: TeachingSurfaceType | null;
        label: string;
        target: WorkspaceTarget | null;
        modelPresetId: string | null;
        fallbackAssetId: string | null;
        slideId?: string;
        liveAvailable?: boolean;
    } = {
        id: idText(record.id, type ? `surface:${type}` : 'surface:unknown'),
        type,
        label: text(record.label),
        target,
        modelPresetId: text(record.modelPresetId) || null,
        fallbackAssetId,
    };
    if (slideId) out.slideId = slideId;
    if (typeof liveAvailable === 'boolean') out.liveAvailable = liveAvailable;
    return Object.freeze(out);
}

function targetIsComplete(surface: TeachingSurface, adapter: TeachingSurfaceAdapter): boolean {
    const target = surface.target;
    if (!target || target.type !== adapter.targetType) return false;
    if (surface.type === 'pipelines-gac') {
        return target.type === 'pipeline' && Boolean(target.pipelineId || target.templateId);
    }
    if (surface.type === 'analytics-temporal') {
        return target.type === 'analytics-temporal' && Boolean(target.elementId && target.parameterId && target.method);
    }
    if (surface.type === 'governance-gantt') {
        return target.type === 'governance-project' && Boolean(target.projectId && target.view === 'gantt');
    }
    if (surface.type === 'dom-surface') {
        return target.type === 'dom-surface' && Boolean(target.toolId && target.selector);
    }
    if (surface.type === 'files-asset') {
        return target.type === 'files' && Boolean(target.fileId);
    }
    return false;
}

function isLiveAvailable(
    surface: TeachingSurface,
    adapter: TeachingSurfaceAdapter | null,
    options: TeachingSurfaceValidationOptions,
): boolean {
    if (typeof surface.liveAvailable === 'boolean') return surface.liveAvailable;
    if (!adapter) return false;
    if (options.availableSurfaceTypes) return options.availableSurfaceTypes.includes(adapter.type);
    if (options.availableAdapterIds) {
        const normalized = new Set(options.availableAdapterIds.map((value) => resolveTeachingSurfaceAdapter(value)?.type ?? normalizeTeachingSurfaceType(value)));
        return normalized.has(adapter.type);
    }
    return true;
}

function issue(code: TeachingSurfaceIssueCode, message: string, field?: string): TeachingSurfaceIssue {
    const out: { code: TeachingSurfaceIssueCode; message: string; field?: string } = { code, message };
    if (field) out.field = field;
    return Object.freeze(out);
}

function teacherMessage(
    surface: TeachingSurface,
    adapter: TeachingSurfaceAdapter | null,
    resolution: TeachingSurfaceResolution,
    issues: readonly TeachingSurfaceIssue[],
): string {
    const label = surface.label || adapter?.label || 'superficie de ensino';
    if (issues.some((item) => item.code === 'surface_type_required' || item.code === 'adapter_not_registered')) {
        return `Antes de apresentar, escolha uma superficie de ensino valida para "${label}".`;
    }
    if (issues.some((item) => item.code === 'model_preset_id_required')) {
        return `Antes de apresentar, escolha um preset do modelo ECBT para "${label}".`;
    }
    if (issues.some((item) => item.code === 'workspace_target_required' || item.code === 'workspace_target_incomplete')) {
        return `Antes de apresentar, complete o destino de "${label}" para evitar abrir um modulo aleatorio.`;
    }
    if (issues.some((item) => item.code === 'fallback_asset_required')) {
        return `Modulo "${label}" nao esta disponivel com fallback seguro. Salve uma captura ou vincule um asset antes da aula.`;
    }
    if (resolution === 'use-fallback') {
        return `Modulo "${label}" nao esta disponivel agora; usando captura salva "${surface.fallbackAssetId}".`;
    }
    return `Pronto para aula: ${adapter?.teacherVerb ?? 'abrir superficie'} com preset "${surface.modelPresetId}" e fallback "${surface.fallbackAssetId}".`;
}

export function validateTeachingSurface(
    input: TeachingSurfaceInput,
    options: TeachingSurfaceValidationOptions = {},
): TeachingSurfaceValidation {
    const surface = normalizeTeachingSurface(input);
    const adapter = surface.type ? resolveTeachingSurfaceAdapter(surface.type) : null;
    const issues: TeachingSurfaceIssue[] = [];

    if (!surface.type) {
        issues.push(issue('surface_type_required', 'Teaching surface type is required.', 'type'));
    } else if (!adapter) {
        issues.push(issue('adapter_not_registered', `No teaching surface adapter registered for "${surface.type}".`, 'type'));
    }

    const requiresPreset = options.requirePreset ?? adapter?.requiresPreset ?? true;
    if (requiresPreset && !surface.modelPresetId) {
        issues.push(issue('model_preset_id_required', 'A live teaching surface needs an explicit modelPresetId.', 'modelPresetId'));
    }

    if (!surface.target) {
        issues.push(issue('workspace_target_required', 'Teaching surface needs a structured WorkspaceTarget.', 'target'));
    } else if (adapter && !targetIsComplete(surface, adapter)) {
        issues.push(issue('workspace_target_incomplete', 'WorkspaceTarget is incomplete for this teaching surface adapter.', 'target'));
    }

    const liveAvailable = isLiveAvailable(surface, adapter, options);
    const fallbackPolicy = options.fallbackPolicy ?? 'always';
    const fallbackRequired = (adapter?.requiresFallback ?? true) && (fallbackPolicy === 'always' || !liveAvailable);
    if (fallbackRequired && !surface.fallbackAssetId) {
        issues.push(issue('fallback_asset_required', 'A snapshot/fallback asset is required before class.', 'fallbackAssetId'));
    }

    const blocking = issues.length > 0;
    const resolution: TeachingSurfaceResolution = blocking ? 'blocked' : liveAvailable ? 'open-live' : 'use-fallback';
    const status: TeachingSurfaceStatus = blocking ? 'invalid' : resolution === 'use-fallback' ? 'warning' : 'valid';
    const message = teacherMessage(surface, adapter, resolution, issues);

    return Object.freeze({
        ok: issues.length === 0,
        status,
        resolution,
        surface,
        adapter,
        issues: Object.freeze(issues),
        teacherMessage: message,
    });
}
