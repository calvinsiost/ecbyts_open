// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   LMS MODULE DENSITY
   SPEC_LMS_MINIMALIST_AUTHORING_EXPERIENCE — F4 (RF5 + RF6).

   Quando um modulo tecnico do EcByts abre embutido dentro de uma aula
   do LMS, ele deve entrar em modo `minimal`: esconde os controles
   tecnicos (JSON cru, debug, importar/exportar, ids internos, acoes de
   edicao) e mostra a faixa de retorno ao slide. No modo `full` (fora da
   aula) tudo permanece visivel.

   Logica pura: sem DOM, sem storage, sem rede. O consumidor (host do
   modulo) chama applyDensity() e usa hiddenControls/showReturnBar para
   montar a tela. Nao decide visibilidade sozinho.
   ================================================================ */

export type LmsModuleDensity = 'full' | 'minimal';

export interface LmsModuleRef {
    readonly moduleId?: string;
    readonly adapterId?: string;
    readonly surfaceType?: string;
}

export interface LmsDensityResult {
    readonly density: LmsModuleDensity;
    readonly moduleKey: string;
    readonly hiddenControls: readonly string[];
    readonly visibleControls: readonly string[];
    readonly showReturnBar: boolean;
    readonly reason: string;
}

export const LMS_TECHNICAL_CONTROLS = Object.freeze({
    rawJson: 'raw-json',
    bpmnImport: 'bpmn-import',
    debugLog: 'debug-log',
    import: 'import',
    export: 'export',
    editActions: 'edit-actions',
    internalIds: 'internal-ids',
    advancedSettings: 'advanced-settings',
} as const);

const SURFACE_TYPE_TO_ADAPTER: Readonly<Record<string, string>> = Object.freeze({
    'pipelines-gac': 'pipelines.gac',
    'analytics-temporal': 'analytics.temporal',
    'governance-gantt': 'governance.gantt',
    'dom-surface': 'dom.anchor',
    'files-asset': 'files.asset',
});

export const LMS_DENSITY_CONTROLS: Readonly<Record<string, readonly string[]>> = Object.freeze({
    'pipelines.gac': Object.freeze(['raw-json', 'bpmn-import', 'debug-log', 'edit-actions', 'export', 'internal-ids']),
    'analytics.temporal': Object.freeze(['raw-json', 'debug-log', 'export', 'advanced-settings', 'edit-actions']),
    'governance.gantt': Object.freeze(['edit-actions', 'export', 'internal-ids', 'advanced-settings', 'debug-log']),
    'dom.anchor': Object.freeze(['debug-log', 'internal-ids', 'edit-actions', 'raw-json']),
    'files.asset': Object.freeze(['import', 'export', 'edit-actions', 'internal-ids', 'debug-log']),
});

export const LMS_DENSITY_DEFAULT_CONTROLS: readonly string[] = Object.freeze([
    'raw-json',
    'debug-log',
    'edit-actions',
    'import',
    'export',
    'internal-ids',
    'advanced-settings',
]);

export function normalizeLmsDensity(value: unknown): LmsModuleDensity {
    return typeof value === 'string' && value.trim().toLowerCase() === 'minimal' ? 'minimal' : 'full';
}

export function resolveModuleKey(module: string | LmsModuleRef | null | undefined): string {
    if (typeof module === 'string') {
        const trimmed = module.trim();
        return SURFACE_TYPE_TO_ADAPTER[trimmed] || trimmed || 'unknown';
    }
    const ref = module || {};
    const adapterId = (ref.adapterId || '').trim();
    if (adapterId) return SURFACE_TYPE_TO_ADAPTER[adapterId] || adapterId;
    const surfaceType = (ref.surfaceType || '').trim();
    if (surfaceType) return SURFACE_TYPE_TO_ADAPTER[surfaceType] || surfaceType;
    const moduleId = (ref.moduleId || '').trim();
    if (moduleId) return moduleId;
    return 'unknown';
}

export function listTechnicalControls(module: string | LmsModuleRef | null | undefined): readonly string[] {
    const key = resolveModuleKey(module);
    return LMS_DENSITY_CONTROLS[key] || LMS_DENSITY_DEFAULT_CONTROLS;
}

export function applyDensity(module: string | LmsModuleRef | null | undefined, density: unknown): LmsDensityResult {
    const mode = normalizeLmsDensity(density);
    const moduleKey = resolveModuleKey(module);
    const controls = listTechnicalControls(moduleKey);
    if (mode === 'minimal') {
        return Object.freeze({
            density: mode,
            moduleKey,
            hiddenControls: controls,
            visibleControls: Object.freeze([]) as readonly string[],
            showReturnBar: true,
            reason: 'modo aula: controles tecnicos escondidos (RF6) + faixa de retorno ao slide (RF5)',
        });
    }
    return Object.freeze({
        density: mode,
        moduleKey,
        hiddenControls: Object.freeze([]) as readonly string[],
        visibleControls: controls,
        showReturnBar: false,
        reason: 'modo completo: todos os controles do modulo visiveis',
    });
}

export interface LmsDensityContextLike {
    readonly density?: unknown;
    readonly destination?: { readonly adapterId?: string; readonly moduleId?: string };
}

export function applyDensityFromContext(context: LmsDensityContextLike | null | undefined): LmsDensityResult {
    const destination = context?.destination || {};
    const ref: LmsModuleRef = {
        ...(destination.adapterId !== undefined ? { adapterId: destination.adapterId } : {}),
        ...(destination.moduleId !== undefined ? { moduleId: destination.moduleId } : {}),
    };
    return applyDensity(ref, context?.density);
}
