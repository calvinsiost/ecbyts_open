// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 (workspace-section slice) — derivadores READ-ONLY do
 * loader de workspace (labels, mensagens, listas de itens e HTML). claude - re-arq
 * 2026-06-20.
 *
 * EN: Read-only derivers extracted from the homeGrid monolith. Each function
 *     computes a label / empty-message / item-list / list-HTML from (a) homeGrid
 *     state read via an injected getter-context (NO setters — same low-coupling
 *     pattern as _actionsProbe) and (b) pure args. Behaviour is BYTE-identical to
 *     the legacy inline `_getOrganizationScopeOption` / `_getScopeOptions` /
 *     `_getWorkspaceSourceLabel` / `_getWorkspaceScopeLabel` /
 *     `_getWorkspaceSelectionLabel` / `_getLocalWorkspaceEntries` /
 *     `_getWorkspaceItemsForActiveSource` / `_getActiveLaneSnapshots` /
 *     `_getWorkspaceEmptyMessage` / `_buildWorkspaceModelListHtml` /
 *     `_buildWorkspaceSnapshotListHtml`.
 *
 *     The stateful orchestrators (_syncWorkspaceCacheUser, _ensureWorkspaceDefaults,
 *     the _handleWorkspace* selection handlers, _ensureWorkspaceSourceLoaded) STAY
 *     in homeGrid.ts: they read+write the module `let` vars and call render fns, so
 *     moving them would inflate fan-out (a coupled context with setters) — out of
 *     scope for this slice. These derivers are the cohesive, read-only sub-cluster.
 *
 * PT (leigo): junta as funcinhas que SÓ LEEM o estado do workspace e devolvem
 *     textos/listas/HTML (rótulo da fonte, do escopo, mensagem de vazio, lista de
 *     modelos/snapshots). Nada muda estado aqui — quem grava continua no homeGrid.
 *     Comportamento idêntico ao antigo.
 */
import { escapeHtml } from '../../helpers/html.js';

/**
 * Contexto injetado com os GETTERS do estado de workspace do homeGrid (read-only).
 * Equivale a ler as `let` do homeGrid sem acoplá-las (sem setters), além das
 * dependências externas/puras que os derivadores legados consumiam inline.
 */
export interface WorkspaceSectionContext {
    // --- homeGrid state (getters only) ---
    readonly getActiveModelSource: () => string;
    readonly getActiveScopeKind: () => string;
    readonly getActiveModelId: () => any;
    readonly getActiveModelLabel: () => any;
    readonly getActiveLaneId: () => any;
    readonly getActiveSnapshotId: () => any;
    readonly getWorkspaceCache: () => any;
    // --- external/sibling deps (same callables used inline) ---
    readonly getCurrentUser: () => any;
    readonly getModelIdSync: () => any;
    readonly safeGetElements: () => any[];
    readonly safeGetCampaigns: () => any[];
    readonly formatWorkspaceDate: (dateLike: unknown) => string;
    // --- frozen constant (same ref as WORKSPACE_SOURCE_DEFS) ---
    readonly workspaceSourceDefs: readonly { id: string; label: string }[];
}

export function getOrganizationScopeOption(ctx: WorkspaceSectionContext) {
    const user = ctx.getCurrentUser();
    if (!user) return null;
    const orgLabel =
        user?.organization_name ||
        user?.user_metadata?.organization_name ||
        user?.user_metadata?.company ||
        user?.app_metadata?.organization_name ||
        '';
    if (!orgLabel) return null;
    return {
        kind: 'organization',
        orgId: String(orgLabel)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-'),
        label: String(orgLabel).slice(0, 48),
    };
}

export function getScopeOptions(ctx: WorkspaceSectionContext) {
    const orgOption = getOrganizationScopeOption(ctx);
    return [
        { kind: 'personal', orgId: null, label: 'Personal', disabled: false },
        {
            kind: 'organization',
            orgId: orgOption?.orgId || null,
            label: orgOption?.label || 'Organization',
            disabled: !orgOption,
        },
    ];
}

export function getWorkspaceSourceLabel(ctx: WorkspaceSectionContext) {
    const activeModelSource = ctx.getActiveModelSource();
    return ctx.workspaceSourceDefs.find((item: any) => item.id === activeModelSource)?.label || 'Local';
}

export function getWorkspaceScopeLabel(ctx: WorkspaceSectionContext) {
    if (ctx.getActiveScopeKind() === 'organization') {
        return getOrganizationScopeOption(ctx)?.label || 'Organization';
    }
    return 'Personal';
}

export function getWorkspaceSelectionLabel(ctx: WorkspaceSectionContext) {
    const activeModelLabel = ctx.getActiveModelLabel();
    if (activeModelLabel) return activeModelLabel;
    const activeModelSource = ctx.getActiveModelSource();
    if (activeModelSource === 'local') {
        const localItems = getLocalWorkspaceEntries(ctx);
        return localItems[0]?.label || 'Workspace local';
    }
    const activeSnapshotId = ctx.getActiveSnapshotId();
    if (activeModelSource === 'autosave' && activeSnapshotId) {
        return `Snapshot ${activeSnapshotId.slice(0, 8)}`;
    }
    return 'Nenhum modelo selecionado';
}

/** @returns {any[]} */
export function getLocalWorkspaceEntries(ctx: WorkspaceSectionContext) {
    const modelId = ctx.getModelIdSync();
    const elements = ctx.safeGetElements();
    const campaigns = ctx.safeGetCampaigns();
    const hasWorkspace = !!modelId || elements.length > 0 || campaigns.length > 0;
    if (!hasWorkspace) return [];
    return [
        {
            id: modelId || 'local-session',
            label: modelId ? 'Workspace atual' : 'Sessao local',
            meta: `${elements.length} elementos - ${campaigns.length} campanhas`,
            status: modelId ? '' : 'Ainda nao salvo na nuvem',
            kind: 'local',
        },
    ];
}

/** @returns {any[]} */
export function getWorkspaceItemsForActiveSource(ctx: WorkspaceSectionContext) {
    const activeScopeKind = ctx.getActiveScopeKind();
    const activeModelSource = ctx.getActiveModelSource();
    const workspaceCache = ctx.getWorkspaceCache();
    if (activeScopeKind === 'organization' && !getOrganizationScopeOption(ctx)?.orgId) {
        return [];
    }
    if (activeModelSource === 'local') {
        return getLocalWorkspaceEntries(ctx);
    }
    if (activeModelSource === 'saved') {
        return (workspaceCache.saved || []).map(
            /** @param {any} ctx */ (model: any) => ({
                id: model.id,
                label: model.name || 'Modelo sem nome',
                meta: `${model.element_count || 0} elementos - ${model.campaign_count || 0} campanhas`,
                status: ctx.formatWorkspaceDate(model.updated_at || model.created_at),
                kind: 'saved',
            }),
        );
    }
    if (activeModelSource === 'shared') {
        return (workspaceCache.shared || []).map(
            /** @param {any} share */ (share: any) => {
                const model = share?.models || {};
                return {
                    id: model.id || share.id,
                    label: model.name || 'Modelo compartilhado',
                    meta: `${model.element_count || 0} elementos - ${model.campaign_count || 0} campanhas`,
                    status: share.permission
                        ? `Permissao: ${share.permission}`
                        : ctx.formatWorkspaceDate(share.created_at),
                    kind: 'shared',
                };
            },
        );
    }
    if (activeModelSource === 'autosave') {
        return (workspaceCache.autosaveLanes || []).map(
            /** @param {any} lane */ (lane: any) => ({
                id: lane.id,
                label: lane.name || 'Raia de autosave',
                meta: lane.scope_key || 'Autosave',
                status: lane.last_used_at
                    ? `Ultimo uso: ${ctx.formatWorkspaceDate(lane.last_used_at)}`
                    : 'Sem atividade recente',
                kind: 'lane',
            }),
        );
    }
    return [];
}

/** @returns {any[]} */
export function getActiveLaneSnapshots(ctx: WorkspaceSectionContext) {
    const activeLaneId = ctx.getActiveLaneId();
    if (!activeLaneId) return [];
    return ctx.getWorkspaceCache().autosaveSnapshotsByLane[activeLaneId] || [];
}

export function getWorkspaceEmptyMessage(ctx: WorkspaceSectionContext) {
    const user = ctx.getCurrentUser();
    const activeScopeKind = ctx.getActiveScopeKind();
    const activeModelSource = ctx.getActiveModelSource();
    const workspaceCache = ctx.getWorkspaceCache();
    if (activeScopeKind === 'organization' && !getOrganizationScopeOption(ctx)?.orgId) {
        return 'Nenhuma organizacao vinculada para este usuario.';
    }
    if (activeModelSource !== 'local' && !user) {
        return 'Faca login para acessar modelos salvos, compartilhados e autosaves.';
    }
    if (workspaceCache.errors[activeModelSource]) {
        return workspaceCache.errors[activeModelSource];
    }
    if (activeModelSource === 'local') {
        return 'Nenhum workspace local detectado nesta sessao.';
    }
    if (activeModelSource === 'saved') {
        return 'Nenhum modelo salvo encontrado.';
    }
    if (activeModelSource === 'shared') {
        return 'Nenhum modelo compartilhado encontrado.';
    }
    if (activeModelSource === 'autosave') {
        return 'Nenhuma raia de autosave encontrada.';
    }
    return 'Nenhum item disponivel.';
}

/** @param {any[]} ctx */
export function buildWorkspaceModelListHtml(ctx: WorkspaceSectionContext, modelItems: any) {
    if (modelItems.length === 0) {
        return `<div class="actions-shell-workspace-empty">${escapeHtml(getWorkspaceEmptyMessage(ctx))}</div>`;
    }
    const activeLaneId = ctx.getActiveLaneId();
    const activeModelId = ctx.getActiveModelId();
    return modelItems
        .map((item: any) => {
            const isActive =
                (item.kind === 'lane' && activeLaneId === item.id) ||
                (item.kind !== 'lane' && activeModelId === item.id);
            return `
                <button type="button"
                        class="actions-shell-model-item${isActive ? ' active' : ''}"
                        data-workspace-item-id="${escapeHtml(item.id)}"
                        data-workspace-item-kind="${escapeHtml(item.kind)}"
                        data-testid="actions-model-item">
                    <span class="actions-shell-model-title">${escapeHtml(item.label)}</span>
                    <span class="actions-shell-model-meta">${escapeHtml(item.meta)}</span>
                    <span class="actions-shell-model-status">${escapeHtml(item.status)}</span>
                </button>
            `;
        })
        .join('');
}

/**
 * @param {any} ctx
 */
export function buildWorkspaceSnapshotListHtml(ctx: WorkspaceSectionContext, snapshots: any) {
    const activeLaneId = ctx.getActiveLaneId();
    const activeSnapshotId = ctx.getActiveSnapshotId();
    if (snapshots.length === 0) {
        return `<div class="actions-shell-workspace-empty">${escapeHtml(
            activeLaneId ? 'Nenhum snapshot disponivel para a raia ativa.' : 'Selecione uma raia para ver snapshots.',
        )}</div>`;
    }
    return snapshots
        .map(
            (snapshot: any, index: any) => {
                const isActive = activeSnapshotId === snapshot.id;
                const summary = `${snapshot.element_count || 0} elementos - ${snapshot.campaign_count || 0} campanhas`;
                return `
                <button type="button"
                        class="actions-shell-model-item actions-shell-snapshot-item${isActive ? ' active' : ''}"
                        data-snapshot-id="${escapeHtml(snapshot.id)}"
                        data-testid="actions-snapshot-item">
                    <span class="actions-shell-model-title">Estado ${index + 1}</span>
                    <span class="actions-shell-model-meta">${escapeHtml(summary)}</span>
                    <span class="actions-shell-model-status">${escapeHtml(ctx.formatWorkspaceDate(snapshot.created_at))}</span>
                </button>
            `;
            },
        )
        .join('');
}
