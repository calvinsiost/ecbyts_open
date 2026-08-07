// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * TAB-MODEL-SWITCH-001 F2 (claude - novaspec, 2026-05-31) — Manager Registry.
 *
 * Lista frozen canônica dos 7 managers críticos que participam do snapshot/
 * restore per tab. Consumida por `modelSwitchBridge.ts` (F3) para iterar
 * `exportState/importState/resetState` em ordem determinística.
 *
 * Pure-logic — sem imports dos managers (evita CDN/Three.js deps em Node).
 * Caller carrega dinamicamente via `await import(entry.modulePath)` quando
 * precisar invocar funções reais.
 *
 * Refs:
 *   - SPEC `docs/specs/features/SPEC_TAB_MODEL_SWITCH_INTEGRATION.md` §4.2
 *   - ADR §10 A3 (registry explícito vs auto-discovery — escolhido explícito)
 *   - F1 commits: 8c27b7cf + b09f2fe8 + dae3e893 (signatures dos 7 managers)
 */

export interface ManagerEntry {
    /** Identificador único (kebab-case ou camelCase) — usado em logs/telemetria */
    readonly name: string;
    /**
     * Caminho relativo para import dinâmico runtime.
     * Format: 'core/<module>/manager.js' OU 'utils/<module>/manager.js'.
     * Em runtime: `await import('/js/' + entry.modulePath)`.
     */
    readonly modulePath: string;
    /**
     * critical=true: falha de export/import → rollback completo do switch
     * (ADR §10 A4). critical=false: falha logada mas não bloqueia.
     */
    readonly critical: boolean;
    /**
     * importState é async (retorna Promise)? Bridge F3 deve await em
     * Promise.all para coordenar. F1 confirmou: apenas `interpolation`
     * é async (importLayers reconstrói malhas Three.js async).
     */
    readonly async: boolean;
    /**
     * Descrição curta para debug + telemetria.
     */
    readonly description: string;
}

/**
 * Registry CANÔNICO — ordem importa.
 *
 * Ordem de iteração no snapshot/restore:
 *   1. sceneOwner PRIMEIRO no reset (dispose 5-step antes de qualquer
 *      manager mutar state) e ÚLTIMO no restore (init após managers
 *      reinjetarem state, para cena ter conteúdo correto desde frame 1).
 *   2. Managers de dados (elements, campaigns, edges, voxel, interpolation)
 *      entre dispose e init — independência mútua permite paralelismo.
 *   3. autosaveLane por último em export (UI metadata, não bloqueante).
 *
 * Bridge F3 implementa ordem via getOrderedForSnapshot()/
 * getOrderedForRestore() helpers.
 */
export const MANAGER_REGISTRY: ReadonlyArray<ManagerEntry> = Object.freeze([
    Object.freeze({
        name: 'sceneOwner',
        modulePath: 'core/scene/lifecycleOwner.js',
        critical: true,
        async: false,
        description: 'Three.js scene lifecycle FSM + dispose canonical 5-step',
    }),
    Object.freeze({
        name: 'elements',
        modulePath: 'core/elements/manager.js',
        critical: true,
        async: false,
        description: 'Elementos PDPLU + meshMap rebind (depende de sceneOwner.init)',
    }),
    Object.freeze({
        name: 'campaigns',
        modulePath: 'core/campaigns/manager.js',
        critical: true,
        async: false,
        description: 'Campanhas de amostragem (observações + planejamento)',
    }),
    Object.freeze({
        name: 'edges',
        modulePath: 'utils/edges/manager.js',
        critical: true,
        async: false,
        description: 'Edges grafo de dependências (depende de elements para refs)',
    }),
    Object.freeze({
        name: 'voxel',
        modulePath: 'core/voxel/manager.js',
        critical: false,
        async: false,
        description: 'Voxels 3D geologia/contaminação (depende de elements via volumes)',
    }),
    Object.freeze({
        name: 'interpolation',
        modulePath: 'core/interpolation/manager.js',
        critical: false,
        async: true,
        description: 'Camadas IDW/RBF/Kriging — ÚNICO async (importLayers reconstrói malhas)',
    }),
    Object.freeze({
        name: 'autosaveLane',
        modulePath: 'core/autosaveLane/manager.js',
        critical: false,
        async: false,
        description: 'Autosave lanes per-user (UI metadata, não toca IDB em import)',
    }),
]);

/**
 * Lookup helper: retorna entry pelo nome canônico.
 */
export function getManagerByName(name: string): ManagerEntry | null {
    return MANAGER_REGISTRY.find((m) => m.name === name) || null;
}

/**
 * Filter: apenas managers críticos (falha → rollback completo no switch).
 */
export function getCriticalManagers(): ReadonlyArray<ManagerEntry> {
    return MANAGER_REGISTRY.filter((m) => m.critical);
}

/**
 * Filter: apenas managers async (bridge F3 usa Promise.all para coordenar).
 */
export function getAsyncManagers(): ReadonlyArray<ManagerEntry> {
    return MANAGER_REGISTRY.filter((m) => m.async);
}

/**
 * Validação de invariantes do registry:
 *   - Nomes únicos
 *   - modulePath únicos
 *   - sceneOwner é primeiro (ordem canônica)
 *   - Pelo menos 1 manager crítico
 *
 * Caller (CI test ou bootstrap) chama para detectar regressão se alguém
 * editar MANAGER_REGISTRY sem cuidado.
 */
export interface RegistryValidation {
    valid: boolean;
    errors: string[];
}

export function validateRegistry(registry: ReadonlyArray<ManagerEntry> = MANAGER_REGISTRY): RegistryValidation {
    const errors: string[] = [];
    const names = new Set<string>();
    const paths = new Set<string>();
    for (const m of registry) {
        if (!m.name) errors.push('missing_name');
        if (names.has(m.name)) errors.push(`duplicate_name:${m.name}`);
        names.add(m.name);
        if (!m.modulePath) errors.push(`missing_modulePath:${m.name}`);
        if (paths.has(m.modulePath)) errors.push(`duplicate_modulePath:${m.modulePath}`);
        paths.add(m.modulePath);
        if (typeof m.critical !== 'boolean') errors.push(`invalid_critical:${m.name}`);
        if (typeof m.async !== 'boolean') errors.push(`invalid_async:${m.name}`);
    }
    if (registry.length === 0) errors.push('empty_registry');
    else if (registry[0]!.name !== 'sceneOwner') errors.push('sceneOwner_must_be_first'); // length>0 no else
    if (registry.filter((m) => m.critical).length === 0) errors.push('no_critical_managers');
    return { valid: errors.length === 0, errors };
}

/**
 * Ordem para SNAPSHOT (export): managers de dados primeiro, sceneOwner por
 * último (lê FSM state após mudanças).
 */
export function getOrderedForSnapshot(): ReadonlyArray<ManagerEntry> {
    const data = MANAGER_REGISTRY.filter((m) => m.name !== 'sceneOwner');
    const scene = MANAGER_REGISTRY.filter((m) => m.name === 'sceneOwner');
    return Object.freeze([...data, ...scene]);
}

/**
 * Ordem para RESTORE (import): sceneOwner PRIMEIRO (init cena nova antes
 * de managers reinjetarem meshes Three.js que dependem do scene group).
 */
export function getOrderedForRestore(): ReadonlyArray<ManagerEntry> {
    const scene = MANAGER_REGISTRY.filter((m) => m.name === 'sceneOwner');
    const data = MANAGER_REGISTRY.filter((m) => m.name !== 'sceneOwner');
    return Object.freeze([...scene, ...data]);
}

/**
 * Estatísticas para admin dashboard / telemetria.
 */
export interface RegistryStats {
    total: number;
    critical: number;
    async: number;
    names: string[];
}

export function getRegistryStats(): RegistryStats {
    return {
        total: MANAGER_REGISTRY.length,
        critical: MANAGER_REGISTRY.filter((m) => m.critical).length,
        async: MANAGER_REGISTRY.filter((m) => m.async).length,
        names: MANAGER_REGISTRY.map((m) => m.name),
    };
}
