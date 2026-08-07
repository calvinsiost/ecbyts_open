// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// DEEP-LINK-TOOLS-001 Sprint 1 — Registry canônico de deep-links.
//
// Convenção: `https://ecbyts.com/?tools=<toolId>[&payload=<base64url>][&key=<ECBT>]`
//
// Cada entrada autoriza um toolId a ser invocado via URL e mapeia para o módulo
// + export que abre o painel. Lookup O(1) via Map.
//
// SPEC: docs/specs/_archived/SPEC_DEEP_LINK_TOOLS_SHARING.md
// Pattern: análogo a _panelDiscoveryRegistry.ts (auto-register pattern Calvin 2026-05-27)

export type DeepLinkTier = 'A' | 'B';
export type DeepLinkCategory = 'analysis' | 'monitoring' | 'reporting' | 'data' | 'admin';

/** Resultado da validação de payload — pure-logic, sem throw. */
export interface PayloadValidation {
    readonly valid: boolean;
    readonly errors: ReadonlyArray<string>;
}

/** Entrada do registry — frozen, imutável após boot. */
export interface DeepLinkEntry {
    /** Id curto kebab-case (canônico, NUNCA renomear sem ADR). */
    readonly toolId: string;
    /** Tier de prioridade (A = MVP Sprint 1, B = Sprint 2). */
    readonly tier: DeepLinkTier;
    /** Caminho do módulo para lazy import. */
    readonly module: string;
    /** Nome do export que recebe payload e abre o painel. */
    readonly openExport: string;
    /** Validator opcional do payload (XSS-safe, pure). */
    readonly validatePayload?: (p: unknown) => PayloadValidation;
    /** Label i18n para botão "Compartilhar esta tela". */
    readonly labelKey: string;
    /** Categoria UI agregada. */
    readonly category: DeepLinkCategory;
}

// ===========================================================================
// VALIDATORS por toolId — pure-logic, defensivos
// ===========================================================================

const CAS_REGEX = /^[1-9]\d{0,6}-\d{2}-\d$/;
const VALID_RISK_SCENARIOS = new Set(['RES_URB', 'RES_RUR', 'TRAB_COM_IND', 'TRAB_OBRA_CIV']);

function validateRiskPayload(p: unknown): PayloadValidation {
    const errors: string[] = [];
    if (!p || typeof p !== 'object') return { valid: false, errors: ['payload deve ser objeto'] };
    const obj = p as Record<string, unknown>;
    if (obj.sqi !== undefined && (typeof obj.sqi !== 'string' || !CAS_REGEX.test(obj.sqi))) {
        errors.push(`sqi inválido (esperado CAS N-NN-N): ${String(obj.sqi).slice(0, 30)}`);
    }
    if (obj.scenario !== undefined && (typeof obj.scenario !== 'string' || !VALID_RISK_SCENARIOS.has(obj.scenario))) {
        errors.push(`scenario inválido: ${String(obj.scenario).slice(0, 30)}`);
    }
    if (obj.conc !== undefined) {
        if (!obj.conc || typeof obj.conc !== 'object') {
            errors.push('conc deve ser objeto {soil?, groundwater?, air?}');
        } else {
            const c = obj.conc as Record<string, unknown>;
            for (const k of ['soil', 'groundwater', 'air']) {
                if (c[k] !== undefined && (typeof c[k] !== 'number' || !Number.isFinite(c[k] as number) || (c[k] as number) < 0)) {
                    errors.push(`conc.${k} deve ser número finito >= 0`);
                }
            }
        }
    }
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze([...errors]) });
}

function validateScenarioPayload(p: unknown): PayloadValidation {
    if (!p) return Object.freeze({ valid: true, errors: Object.freeze([]) });
    if (typeof p !== 'object') return Object.freeze({ valid: false, errors: Object.freeze(['payload deve ser objeto']) });
    return Object.freeze({ valid: true, errors: Object.freeze([]) });
}

// ===========================================================================
// REGISTRY canônico — 8 painéis Tier-A MVP Sprint 1
// ===========================================================================

export const DEEP_LINK_REGISTRY: ReadonlyArray<DeepLinkEntry> = Object.freeze([
    Object.freeze({
        toolId: 'risk',
        tier: 'A' as DeepLinkTier,
        module: '../ui/riskAssessmentPanel.js',
        openExport: 'openRiskAssessmentPanel',
        validatePayload: validateRiskPayload,
        labelKey: 'share.tools.risk',
        category: 'analysis' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'mca',
        tier: 'A' as DeepLinkTier,
        module: '../ui/mcaPanel.js',
        openExport: 'openMcaPanel',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.mca',
        category: 'analysis' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'eis',
        tier: 'A' as DeepLinkTier,
        module: '../ui/eisDashboard.js',
        openExport: 'openEisDashboard',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.eis',
        category: 'analysis' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'radar',
        tier: 'A' as DeepLinkTier,
        module: '../ui/radarModal.js',
        openExport: 'openRadarModal',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.radar',
        category: 'monitoring' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'simulation',
        tier: 'A' as DeepLinkTier,
        module: '../ui/simulationPanel.js',
        openExport: 'openSimulationPanel',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.simulation',
        category: 'analysis' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'photolog',
        tier: 'A' as DeepLinkTier,
        module: '../ui/photoLogModal.js',
        openExport: 'openPhotoLogModal',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.photolog',
        category: 'data' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'analytics',
        tier: 'A' as DeepLinkTier,
        module: '../ui/analyticsPanel.js',
        openExport: 'openAnalyticsPanel',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.analytics',
        category: 'analysis' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'cost-center',
        tier: 'A' as DeepLinkTier,
        module: '../ui/costCenter.js',
        openExport: 'openCostCenter',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.cost-center',
        category: 'reporting' as DeepLinkCategory,
    }),
    // ========================================================================
    // TIER-B (Sprint 3, Calvin 2026-06-03): "deep-link para todas as paginas
    // que estiverem ativas". Cobertura ampliada para 20 painéis user-facing.
    // ========================================================================
    Object.freeze({
        toolId: 'ghg-inventory',
        tier: 'B' as DeepLinkTier,
        module: '../ui/ghgInventoryPanel.js',
        openExport: 'openGhgInventoryPanel',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.ghg-inventory',
        category: 'reporting' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'forum',
        tier: 'B' as DeepLinkTier,
        module: '../ui/forumModal.js',
        openExport: 'openForumModal',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.forum',
        category: 'data' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'libraries',
        tier: 'B' as DeepLinkTier,
        module: '../ui/libraryHubModal.js',
        openExport: 'openLibraryHubModal',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.libraries',
        category: 'data' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'wallet',
        tier: 'B' as DeepLinkTier,
        module: '../ui/walletPanel.js',
        openExport: 'openWalletPanel',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.wallet',
        category: 'data' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'credits-hub',
        tier: 'B' as DeepLinkTier,
        module: '../ui/creditsHub.js',
        openExport: 'openCreditsHub',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.credits-hub',
        category: 'data' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'constants',
        tier: 'B' as DeepLinkTier,
        module: '../ui/constantsModal.js',
        openExport: 'openConstantsModal',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.constants',
        category: 'admin' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'domain-editor',
        tier: 'B' as DeepLinkTier,
        module: '../ui/domainEditorModal.js',
        openExport: 'openDomainEditorModal',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.domain-editor',
        category: 'admin' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'customize',
        tier: 'B' as DeepLinkTier,
        module: '../ui/customizeModal.js',
        openExport: 'openCustomizeModal',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.customize',
        category: 'admin' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'logs',
        tier: 'B' as DeepLinkTier,
        module: '../ui/logsModal.js',
        openExport: 'openLogsModal',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.logs',
        category: 'monitoring' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'ohs',
        tier: 'B' as DeepLinkTier,
        module: '../ui/ohsPanel.js',
        openExport: 'openOhsPanel',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.ohs',
        category: 'monitoring' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'health-alerts',
        tier: 'B' as DeepLinkTier,
        module: '../ui/healthAlertsWidget.js',
        openExport: 'openHealthAlertsWidget',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.health-alerts',
        category: 'monitoring' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'automation',
        tier: 'B' as DeepLinkTier,
        module: '../ui/automationPanel.js',
        openExport: 'openAutomationPanel',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.automation',
        category: 'monitoring' as DeepLinkCategory,
    }),
    // Gerenciador de Pipelines (lista + "Importar .ecbt" + editor com render fiel).
    // Painel separado do de bots (automation): abre direto via ?tools=pipelines,
    // contornando o botão ⚙ "Automacoes" que fica escondido em aba inativa da barra.
    Object.freeze({
        toolId: 'pipelines',
        tier: 'B' as DeepLinkTier,
        module: '../handlers/pipelines.js',
        openExport: 'openPipelineManagerModal',
        validatePayload: validateScenarioPayload,
        labelKey: 'pipeline.ribbon.label',
        category: 'monitoring' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'eco-tools',
        tier: 'B' as DeepLinkTier,
        module: '../ui/ecoToolsModal.js',
        openExport: 'openEcoToolsModal',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.eco-tools',
        category: 'analysis' as DeepLinkCategory,
    }),
    // Fluxo de Classificação de Área (GAC) — fluxograma interativo (Decreto SP
    // 59.263). Aberto por botão de slide da aula (LMS) e por `?tools=gac-flow`.
    // Semeia o pipeline-semente na 1ª abertura (openGacFlow é idempotente).
    Object.freeze({
        toolId: 'gac-flow',
        tier: 'B' as DeepLinkTier,
        module: '../handlers/pipelines.js',
        openExport: 'openGacFlow',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.gac-flow',
        category: 'analysis' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'mine-beneficiation-flow',
        tier: 'B' as DeepLinkTier,
        module: '../handlers/pipelines.js',
        openExport: 'openMineBeneficiationFlow',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.mine-beneficiation-flow',
        category: 'analysis' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'report-builder',
        tier: 'B' as DeepLinkTier,
        module: '../ui/reportBuilder.js',
        openExport: 'openReportBuilder',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.report-builder',
        category: 'reporting' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'notifications',
        tier: 'B' as DeepLinkTier,
        module: '../ui/notificationInbox.js',
        openExport: 'openNotificationInbox',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.notifications',
        category: 'data' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'accessibility',
        tier: 'B' as DeepLinkTier,
        module: '../ui/accessibilityPanel.js',
        openExport: 'openAccessibilityPanel',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.accessibility',
        category: 'admin' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'permissions',
        tier: 'B' as DeepLinkTier,
        module: '../ui/permissionsModal.js',
        openExport: 'openPermissionsModal',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.permissions',
        category: 'admin' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'data-entry',
        tier: 'B' as DeepLinkTier,
        module: '../ui/dataEntryMatrix.js',
        openExport: 'openDataEntryMatrix',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.data-entry',
        category: 'data' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'product-wizard',
        tier: 'B' as DeepLinkTier,
        module: '../ui/productWizard.js',
        openExport: 'openProductWizard',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.product-wizard',
        category: 'data' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'symbology',
        tier: 'B' as DeepLinkTier,
        module: '../ui/symbologyModal.js',
        openExport: 'openSymbologyEditor',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.symbology',
        category: 'admin' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'ecbt-audit-trail',
        tier: 'A' as DeepLinkTier,
        module: '../ui/ecbtAuditTrailPanel.js',
        openExport: 'openEcbtAuditTrailPanelFromPayload',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.ecbt-audit-trail',
        category: 'reporting' as DeepLinkCategory,
    }),
    // ========================================================================
    // GAP FIX (claude - ui 2026-06-09) — Sprint 3 deixou `cost-analysis` de fora
    // mesmo com meta "deep-link para todas as paginas ativas". HUD card
    // PASSIVO/ATIVO (cost-hud-canvas) chama handleOpenCostAnalysis() sem URL.
    // Esta entry torna o painel shareable via `?tools=cost-analysis`.
    // ========================================================================
    Object.freeze({
        toolId: 'cost-analysis',
        tier: 'B' as DeepLinkTier,
        module: '../ui/costAnalysisPanel.js',
        // COST-CENTRAL-BOARD-001 (Calvin 2026-06-10): deep-link abre a tela
        // CENTRAL (modal-xlarge), não a aba lateral 280px. Calvin lembrava de
        // tabelão central — sempre foi a view 'detailed' do cost-analysis, mas
        // espremida no painel lateral ficava ilegível.
        openExport: 'openCostAnalysisBoardFromPayload',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.cost-analysis',
        category: 'analysis' as DeepLinkCategory,
    }),
    // ========================================================================
    // Deep-link coverage expansion (claude - bug, 2026-06-09). Paineis
    // user-facing alcancaveis via command palette / ribbon "Mais" mas que NAO
    // eram shareable por URL. Achados via gap analysis (deepLinkRegistry 30 vs
    // 90 superficies). Openers arg-less → abrem no estado atual; payload e
    // validado por validateScenarioPayload (passthrough XSS-safe). Variante
    // payload-aware (ex: ECBT Score de um modelo especifico) = follow-up.
    // ========================================================================
    Object.freeze({
        toolId: 'ecbt-score',
        tier: 'B' as DeepLinkTier,
        module: '../ui/ecbtScorePanel.js',
        openExport: 'openEcbtScorePanel',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.ecbt-score',
        category: 'analysis' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'showcase',
        tier: 'B' as DeepLinkTier,
        module: '../ui/showcaseModal.js',
        openExport: 'openShowcaseModal',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.showcase',
        category: 'reporting' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'consistency',
        tier: 'B' as DeepLinkTier,
        module: '../ui/consistencyPanel.js',
        openExport: 'openConsistencyPanel',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.consistency',
        category: 'analysis' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'frontier-catalogs',
        tier: 'B' as DeepLinkTier,
        module: '../ui/frontierCatalogsHub.js',
        openExport: 'openFrontierCatalogsHub',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.frontier-catalogs',
        category: 'data' as DeepLinkCategory,
    }),
    // ========================================================================
    // BUG-014 batch 2 (claude - bug, 2026-06-11). Próximo lote do checklist
    // curado: openers verificados um-a-um quanto a invocação fn(null) do
    // dispatcher (payload ausente → null; defaults de parâmetro NÃO ativam
    // com null — diagramEditor e healthPanel ganharam null-guard defensivo).
    // Excluídos por exigirem argumento obrigatório (precisam wrapper
    // FromPayload dedicado): openAbntPanel, openCompletenessPanel,
    // openExtendedMetadataEditor, openAIReport{Browse,Modal,Publish},
    // openComplianceDetailsModal, openDocumentCompliancePanel,
    // openModelVcs{Panel,Merge}, openShapefileWizard, openProfileManagerModal,
    // openSliceCreatorWizard, openRetentionExtendModal.
    // ========================================================================
    Object.freeze({
        toolId: 'uncertainty-hub',
        tier: 'B' as DeepLinkTier,
        module: '../ui/uncertaintyHubPanel.js',
        openExport: 'openUncertaintyHubModal',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.uncertainty-hub',
        category: 'analysis' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'system-catalog',
        tier: 'B' as DeepLinkTier,
        module: '../ui/systemCatalogModal.js',
        openExport: 'openSystemCatalogModal',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.system-catalog',
        category: 'data' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'shares',
        tier: 'B' as DeepLinkTier,
        module: '../ui/sharesPanel.js',
        openExport: 'openSharesPanel',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.shares',
        category: 'data' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'presentation',
        tier: 'B' as DeepLinkTier,
        module: '../ui/presentationModal.js',
        openExport: 'openPresentationModal',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.presentation',
        category: 'reporting' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'constellation-controls',
        tier: 'B' as DeepLinkTier,
        module: '../ui/constellationControls.js',
        openExport: 'openControlsPanel',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.constellation-controls',
        category: 'analysis' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'training',
        tier: 'B' as DeepLinkTier,
        // Fase B 2026-06-13: deep-link abre o módulo com dados (lmsManager).
        module: '../ui/lmsManager.js',
        openExport: 'openLmsModule',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.training',
        category: 'data' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'health-monitor',
        tier: 'B' as DeepLinkTier,
        module: '../ui/healthPanel/healthPanel.js',
        openExport: 'openHealthPanel',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.health-monitor',
        category: 'monitoring' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'diagram-editor',
        tier: 'B' as DeepLinkTier,
        module: '../ui/diagramEditor.js',
        openExport: 'openDiagramEditor',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.diagram-editor',
        category: 'data' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'compliance-presets',
        tier: 'B' as DeepLinkTier,
        module: '../ui/complianceUiBootstrap.js',
        openExport: 'openCompliancePresetsSelector',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.compliance-presets',
        category: 'admin' as DeepLinkCategory,
    }),
    Object.freeze({
        toolId: 'compliance-bindings',
        tier: 'B' as DeepLinkTier,
        module: '../ui/complianceUiBootstrap.js',
        openExport: 'openComplianceBindingsManagerModal',
        validatePayload: validateScenarioPayload,
        labelKey: 'share.tools.compliance-bindings',
        category: 'admin' as DeepLinkCategory,
    }),
]) as ReadonlyArray<DeepLinkEntry>;

/** Lookup O(1) preparado eagerly (frozen Map). */
const REGISTRY_MAP: ReadonlyMap<string, DeepLinkEntry> = (() => {
    const m = new Map<string, DeepLinkEntry>();
    for (const e of DEEP_LINK_REGISTRY) m.set(e.toolId, e);
    return m;
})();

/** Recupera entry por toolId (case-sensitive). null se desconhecido. */
export function getDeepLinkEntry(toolId: string): DeepLinkEntry | null {
    if (typeof toolId !== 'string' || !toolId) return null;
    return REGISTRY_MAP.get(toolId) || null;
}

/** Whitelist de toolIds (snapshot frozen). */
export function listToolIds(): ReadonlyArray<string> {
    return Object.freeze(DEEP_LINK_REGISTRY.map((e) => e.toolId));
}

/** Filtra por categoria. */
export function getEntriesByCategory(category: DeepLinkCategory): ReadonlyArray<DeepLinkEntry> {
    return Object.freeze(DEEP_LINK_REGISTRY.filter((e) => e.category === category));
}

/** Filtra por tier (MVP=A, ext=B). */
export function getEntriesByTier(tier: DeepLinkTier): ReadonlyArray<DeepLinkEntry> {
    return Object.freeze(DEEP_LINK_REGISTRY.filter((e) => e.tier === tier));
}

export const DEEP_LINK_REGISTRY_META = Object.freeze({
    totalEntries: DEEP_LINK_REGISTRY.length,
    tierACount: DEEP_LINK_REGISTRY.filter((e) => e.tier === 'A').length,
    tierBCount: DEEP_LINK_REGISTRY.filter((e) => e.tier === 'B').length,
});
