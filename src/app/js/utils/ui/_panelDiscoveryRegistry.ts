// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Panel Discovery Registry (pure).
//
// Calvin diretiva 2026-05-27: "referenciá-los de forma adequada no painel superior
// 'Mais' (criar lógica em que isso seja feito de forma programática para futuros
// casos não ocorra isso, e no painel system catalog tbm)".
//
// Problema resolvido: painéis que existem em src/app/js/utils/ui/*Panel.ts MAS
// não têm window.handle* / não estão em CORE_CATALOG_ACTIONS / não estão em
// ACTION_REGISTRY ficam invisíveis para o usuário (não aparecem no ribbon "Mais"
// nem no system catalog modal). Scan de 2026-05-27 identificou 5 painéis órfãos:
//   - modelDiscoveryPanel       (187L)
//   - adminMasterPanel (REMOVIDO F3.1 ARCH-ADMIN-SEGREG-001 — agora em ecbytsadmin)
//   - trainingPanel             (400L)
//   - healthPanel               (677L)
//   - timekeeperPanel           (795L)
// Total: 2442L de funcionalidade não-descoberta.
//
// Solução: este registry canônico + auto-register handler em
// panelDiscoveryAutoRegister.ts (lazy import + window.handle* + dd-more entries).
//
// PADRÃO PARA FUTUROS PAINÉIS:
//   Sempre que criar um novo painel em src/app/js/utils/ui/<x>Panel.ts:
//     1. Exportar uma função open<X> ou render<X> como entry point
//     2. Adicionar uma entrada neste registry (id, label, module path, openExport)
//     3. Rodar `npm run test:panel-discovery` (gate detecta órfãos novos)
//   AUTO: handler + dd-more + systemCatalog passam a expô-lo sem código adicional.
//
// Spec NOT:
// - NÃO ler DOM (pure registry, caller usa em auto-register módulo separado)
// - NÃO ler módulos diretamente (apenas metadata; lazy import no auto-register)
// - NÃO emoji

export interface PanelDiscoveryEntry {
    /** Stable id (snake_case-ish). Used for handler name `handleOpen<PascalCase>`. */
    id: string;
    /** User-facing label (pt-BR default). i18n caller pode override via t(labelKey). */
    label: string;
    /** Optional i18n key for translated label lookup. */
    labelKey?: string;
    /** Relative path from utils/handlers/ for lazy import (matches actual emit). */
    module: string;
    /** Named export to invoke (function call). */
    openExport: string;
    /** Optional kwarg constructor for the open call (e.g., { projectId: 'default' }). */
    defaultArgs?: Readonly<Record<string, unknown>>;
    /** Category for grouping in dd-more / systemCatalog. */
    category: 'admin' | 'data' | 'monitoring' | 'governance' | 'general';
    /** Icon name (rendered via icons.ts data-icon attribute). */
    icon: string;
    /** Auto-generated handler name (computed). */
    readonly handlerName?: string;
}

/**
 * Convert an id to PascalCase handler name.
 *   'model_discovery' → 'ModelDiscovery'
 *   'modelDiscovery'  → 'ModelDiscovery'
 */
export function idToPascalCase(id: string): string {
    if (typeof id !== 'string' || !id) return '';
    return id
        .split(/[_\-\s]+/)
        .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : ''))
        .join('');
}

/**
 * Compute the window.handleOpen<PascalCase> name for a registry entry.
 *   { id: 'model_discovery' } → 'handleOpenModelDiscovery'
 *   { id: 'adminMaster' }     → 'handleOpenAdminMaster'
 */
export function computeHandlerName(entry: { id: string }): string {
    return `handleOpen${idToPascalCase(entry.id)}`;
}

/**
 * Frozen registry of "orphan" panels (no direct caller, only lazy/window.* discoverable).
 * Auto-register module (panelDiscoveryAutoRegister.ts) iterates and exposes these.
 */
export const ORPHAN_PANELS_REGISTRY: ReadonlyArray<PanelDiscoveryEntry> = Object.freeze([
    {
        id: 'model_discovery',
        label: 'Descobrir Modelos',
        labelKey: 'panel.modelDiscovery.title',
        // R-OPEN BUG 2 (2026-08-06): apontava para renderDiscoveryPanel, que
        // EXIGE (registry, containerEl) — invocada com 0 args pelo auto-register
        // virava no-op silencioso. openExport DEVE ser um opener 0-arg que monta
        // o próprio DOM (gate: tests/panel-discovery-openers.test.mjs).
        module: '../ui/modelDiscoveryPanel.js',
        openExport: 'openModelDiscoveryPanel',
        category: 'data',
        icon: 'search',
    },
    // ARCH-ADMIN-SEGREG-001 F3.1 (2026-05-30): admin_master ENTRY REMOVIDA —
    // adminMasterPanel migrou para ecbytsadmin (localhost:3001) módulo features
    // (3 tabs: Admin Grants + Role Templates + Audit Log).
    {
        id: 'training',
        label: 'Treinamento',
        labelKey: 'panel.training.title',
        // Fase B 2026-06-13: aponta para o lmsManager (abre o painel COM o
        // catálogo seed + matrículas), não para o painel vazio.
        module: '../ui/lmsManager.js',
        openExport: 'openLmsModule',
        category: 'monitoring',
        icon: 'book-open',
    },
    {
        id: 'health',
        label: 'Saúde Ocupacional',
        labelKey: 'panel.health.title',
        module: '../ui/healthPanel/healthPanel.js',
        openExport: 'openHealthPanel',
        defaultArgs: Object.freeze({ projectId: 'default' }),
        category: 'monitoring',
        icon: 'heart',
    },
    {
        id: 'timekeeper',
        label: 'Timekeeper',
        labelKey: 'panel.timekeeper.title',
        // R-OPEN BUG 4 (2026-08-06): apontava para renderTimekeeperSection, que
        // apenas RETORNA a string HTML da seção do governance panel — o retorno
        // era descartado e nada abria. Opener 0-arg real monta overlay próprio.
        module: '../ui/timekeeperPanel.js',
        openExport: 'openTimekeeperPanel',
        category: 'governance',
        icon: 'clock',
    },
    {
        id: 'risk_assessment',
        label: 'Avaliação de Risco CETESB',
        labelKey: 'panel.riskAssessment.title',
        module: '../ui/riskAssessmentPanel.js',
        openExport: 'openRiskAssessmentPanel',
        category: 'monitoring',
        icon: 'shield-alert',
    },
    // Frontier Catalogs Hub (claude - novaspec, 2026-06-02): entry point UI
    // único para os 6 catálogos descobríveis (FC-01/02/03/04/05/06).
    // Atende CLAUDE.md "UI Visibility Rule" — antes deste hub os catálogos
    // existiam só como window.open*Catalog() invisíveis ao usuário.
    {
        id: 'frontier_catalogs',
        label: 'Catálogos do ECBT',
        labelKey: 'panel.frontierCatalogs.title',
        module: '../ui/frontierCatalogsHub.js',
        openExport: 'openFrontierCatalogsHub',
        category: 'data',
        icon: 'book-open',
    },
    // ECBT Score (Veredito da Área) — INDICADOR PRINCIPAL (Calvin diretiva
    // project_ecbt_score_principal_indicator: líquido monetário ativo−passivo).
    // Achado órfão via scripts/audit-invisible-ui-features.mjs (claude - bug):
    // ecbtScorePanel.ts (512L) existia SEM amarração na UI — invisível ao usuário
    // (zero referência a openEcbtScorePanel). Wire mínimo aqui o torna alcançável
    // (ribbon "Mais" + system catalog). Placement como KPI de topo na home =
    // follow-up de UX (BUG-013).
    {
        id: 'ecbt_score',
        label: 'ECBT Score (Veredito da Área)',
        labelKey: 'panel.ecbtScore.title',
        module: '../ui/ecbtScorePanel.js',
        openExport: 'openEcbtScorePanel',
        category: 'governance',
        icon: 'dollar-sign',
    },
    {
        id: 'budget',
        label: 'Orçamento Cotado',
        labelKey: 'panel.budget.title',
        module: '../ui/budgetPanel.js',
        openExport: 'openBudgetPanel',
        category: 'data',
        icon: 'dollar-sign',
    },
] as const);

/**
 * Get the full registry with handlerName field computed.
 * Returns a fresh array (caller-safe to filter/map).
 */
export function getDiscoveryEntriesWithHandlers(): ReadonlyArray<
    PanelDiscoveryEntry & { handlerName: string }
> {
    return ORPHAN_PANELS_REGISTRY.map((entry) => ({
        ...entry,
        handlerName: computeHandlerName(entry),
    }));
}

/**
 * Filter entries by category.
 */
export function getEntriesByCategory(category: PanelDiscoveryEntry['category']): PanelDiscoveryEntry[] {
    return ORPHAN_PANELS_REGISTRY.filter((e) => e.category === category);
}

/**
 * Lookup entry by id.
 */
export function getEntryById(id: string): PanelDiscoveryEntry | undefined {
    return ORPHAN_PANELS_REGISTRY.find((e) => e.id === id);
}
