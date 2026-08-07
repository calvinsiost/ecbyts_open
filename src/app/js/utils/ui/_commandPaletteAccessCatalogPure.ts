// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// PALETTE-ACCESS-CATALOG :: pure-logic do catálogo amigável de comandos da
// Command Palette (Ctrl+K) e do filtro de disponibilidade. Sem DOM, sem
// window, sem timer, sem I/O. Extraído de commandPaletteAccess.ts (que mantinha
// o catálogo inline acoplado a `window.*`, inflando complexidade cognitiva).
//
// O catálogo aqui é DADO PURO: cada entry mapeia um nome de handler global
// (`handlerName`) — a resolução do handler real (`() => window[name]()`) e o
// fail-soft de handlers ausentes ficam no wire runtime, que injeta um
// predicado `hasHandler` em `selectAvailableCommands`.

/**
 * Descritor declarativo de UM comando amigável da palette. Puro: aponta para o
 * nome de um handler global (não a função em si) — o binding fica no runtime.
 */
export interface PaletteAccessCommandDescriptor {
    /** ID estável `<categoria>.<sub>` (dedup pelo registry da palette). */
    id: string;
    /** Label en-US. */
    label: string;
    /** Label pt-BR. */
    label_pt: string;
    /** Categoria de agrupamento na palette. */
    category: string;
    /** Nome do handler global (`window[handlerName]`) que o comando dispara. */
    handlerName: string;
    /** Palavras-chave para fuzzy search (lowercase, sem acento quando possível). */
    keywords: string[];
}

/**
 * Catálogo canônico de comandos amigáveis mapeados aos `window.handle*`
 * existentes. Frozen — estender via novo descriptor, nunca mutar em runtime.
 */
export const PALETTE_ACCESS_CATALOG: ReadonlyArray<PaletteAccessCommandDescriptor> = Object.freeze([
    // ECBT Score
    {
        id: 'ecbt.open-score', label: 'Open ECBT Score (Verdict)',
        label_pt: 'Abrir ECBT Score (Veredito)', category: 'Score',
        handlerName: 'handleOpenEcbtScorePanel',
        keywords: ['score', 'veredito', 'monetario', 'ativos', 'passivos', 'net'],
    },
    // Compliance / Violações
    {
        id: 'compliance.open-violations', label: 'Open compliance violations',
        label_pt: 'Abrir violações de conformidade', category: 'Compliance',
        // BOOT-RESILIENCE-001: handler real (era 'handleOpenComplianceViolations',
        // órfão — só referenciado em typeof-guards, nunca instalado). O opener
        // canônico do painel de violações é handleOpenViolationsPanel, instalado
        // em initComplianceViolationsFab() (complianceViolationsFab.ts).
        handlerName: 'handleOpenViolationsPanel',
        keywords: ['violacao', 'violacoes', 'conama', 'cetesb', 'norma', 'preset'],
    },
    {
        id: 'compliance.toggle-violations-fab', label: 'Toggle violations FAB',
        label_pt: 'Botão flutuante de violações', category: 'Compliance',
        handlerName: 'handleOpenViolationsFab',
        keywords: ['fab', 'flutuante', 'violacao'],
    },
    {
        id: 'compliance.select-presets', label: 'Select norms/presets',
        label_pt: 'Selecionar normas/presets', category: 'Compliance',
        handlerName: 'handleOpenCompliancePresets',
        keywords: ['conama', 'cetesb', 'ipcc', 'iso', 'norma', 'preset'],
    },
    // Modelo
    {
        id: 'model.generate-random', label: 'Generate random model',
        label_pt: 'Gerar modelo aleatório', category: 'Modelo',
        handlerName: 'handleGenerateRandomModel',
        keywords: ['random', 'demo', 'gerar', 'novo'],
    },
    {
        id: 'model.clear', label: 'Clear current model',
        label_pt: 'Limpar modelo atual', category: 'Modelo',
        handlerName: 'handleClearModel',
        keywords: ['limpar', 'zerar', 'reset'],
    },
    {
        id: 'model.add-element', label: 'Add element',
        label_pt: 'Adicionar elemento', category: 'Modelo',
        handlerName: 'handleAddElement',
        keywords: ['poco', 'plume', 'rio', 'lago', 'nascente', 'building'],
    },
    {
        id: 'model.add-campaign', label: 'Add campaign',
        label_pt: 'Adicionar campanha', category: 'Modelo',
        handlerName: 'handleAddCampaign',
        keywords: ['campanha', 'coleta', 'amostragem'],
    },
    {
        id: 'model.manage-families', label: 'Manage element families',
        label_pt: 'Gerenciar famílias de elementos', category: 'Modelo',
        // BOOT-RESILIENCE-001: era 'handleOpenManageFamilies' (órfão). O opener
        // real é openFamilyManager (window.openFamilyManager, handlers/index.ts).
        handlerName: 'openFamilyManager',
        keywords: ['familia', 'manage', 'gerenciar'],
    },
    // I/O
    {
        id: 'io.import-key', label: 'Import ECBT key',
        label_pt: 'Importar chave ECBT', category: 'I/O',
        // BOOT-RESILIENCE-001: era 'handleImportKey' (órfão). O modal de import
        // de chave .ecokey/JSON é openImportModal (window.openImportModal).
        handlerName: 'openImportModal',
        keywords: ['importar', 'chave', 'ecbt', 'key', 'load'],
    },
    {
        id: 'io.export-key', label: 'Export ECBT key',
        label_pt: 'Exportar chave ECBT', category: 'I/O',
        // BOOT-RESILIENCE-001: era 'handleExportKey' (órfão — mesmo órfão já
        // corrigido em coreCatalog.ts). O modal de export é openExportModal.
        handlerName: 'openExportModal',
        keywords: ['exportar', 'chave', 'salvar', 'save'],
    },
    {
        id: 'io.import-file', label: 'Import file (XLSX/CSV/JSON)',
        label_pt: 'Importar arquivo (XLSX/CSV/JSON)', category: 'I/O',
        // BOOT-RESILIENCE-001: era 'handleImportFile' (órfão). O import de
        // planilha/arquivo (XLSX/CSV/JSON) é openSmartImportModal, instalado via
        // Object.assign(window, smartImportHandlers) (handlers/index.ts).
        handlerName: 'openSmartImportModal',
        keywords: ['importar', 'planilha', 'edd', 'csv', 'xlsx'],
    },
    // Painéis principais
    {
        id: 'panel.analytics', label: 'Open Analytics',
        label_pt: 'Abrir Analytics', category: 'Painel',
        // BOOT-RESILIENCE-001: era 'handleOpenAnalytics' (órfão — só usado como
        // typeof-guard/fallback, nunca instalado). O opener instalado é
        // handleOpenTemporalAnalysis (Object.assign window temporalAnalysisHandlers).
        handlerName: 'handleOpenTemporalAnalysis',
        keywords: ['analytics', 'grafico', 'temporal', 'tendencia'],
    },
    {
        id: 'panel.simulation', label: 'Open Simulation Lab',
        label_pt: 'Abrir Lab de Simulação', category: 'Painel',
        // BOOT-RESILIENCE-001: era 'handleOpenSimulationLab' (órfão). O opener
        // do modal de simulação de cenários é handleOpenScenarioSimulationModal
        // (Object.assign window scenarioSimulationHandlers).
        handlerName: 'handleOpenScenarioSimulationModal',
        keywords: ['simulacao', 'plume', 'gaussiana', 'theis'],
    },
    {
        id: 'panel.datastudio', label: 'Open DataStudio (SQL)',
        label_pt: 'Abrir DataStudio (SQL)', category: 'Painel',
        handlerName: 'handleOpenDataStudio',
        keywords: ['datastudio', 'sql', 'query', 'consulta'],
    },
    {
        id: 'panel.report', label: 'Open Report Builder',
        label_pt: 'Abrir gerador de relatório', category: 'Painel',
        handlerName: 'handleOpenReportBuilder',
        keywords: ['relatorio', 'docx', 'pdf', 'report'],
    },
    {
        id: 'panel.photolog', label: 'Open PhotoLog',
        label_pt: 'Abrir PhotoLog', category: 'Painel',
        handlerName: 'handleOpenPhotoLog',
        keywords: ['photolog', 'foto', 'camera', 'exif'],
    },
    {
        id: 'panel.issues', label: 'Open issues / bounty',
        label_pt: 'Abrir painel de não-conformidades', category: 'Painel',
        handlerName: 'handleOpenIssuesPanel',
        keywords: ['issue', 'bug', 'bounty', 'nao-conformidade'],
    },
    {
        id: 'panel.libraries', label: 'Open Libraries marketplace',
        label_pt: 'Abrir marketplace de Libraries', category: 'Painel',
        // BOOT-RESILIENCE-001: era 'handleOpenLibrariesPanel' (órfão). O opener
        // instalado do hub/marketplace de Libraries é handleOpenLibraryHub
        // (window.handleOpenLibraryHub, handlers/index.ts).
        handlerName: 'handleOpenLibraryHub',
        keywords: ['library', 'marketplace', 'install', 'preset'],
    },
    {
        id: 'panel.wallet', label: 'Open $ECBT wallet',
        label_pt: 'Abrir carteira $ECBT', category: 'Painel',
        // BOOT-RESILIENCE-001: era 'handleOpenWalletPanel' (órfão). O opener
        // instalado da carteira é handleOpenWallet (Object.assign window
        // walletHandlers) — abre walletPanel.
        handlerName: 'handleOpenWallet',
        keywords: ['wallet', 'carteira', 'ecbt', 'saldo'],
    },
    {
        id: 'panel.constants', label: 'Manage constants',
        label_pt: 'Gerenciar constantes', category: 'Painel',
        handlerName: 'handleOpenConstantsModal',
        keywords: ['constante', 'fator', 'emissao'],
    },
    // Config
    {
        id: 'config.customize', label: 'Customize UI',
        label_pt: 'Personalizar UI', category: 'Config',
        handlerName: 'handleOpenCustomize',
        keywords: ['customize', 'personalizar', 'tema', 'fonte'],
    },
    // BOOT-RESILIENCE-001: removido o comando 'config.toggle-theme' — apontava
    // para o handler órfão 'handleToggleTheme', que nunca é instalado. O toggle
    // de tema real (handleSetTheme('system')) exige argumento e não cabe na
    // convenção zero-arg deste catálogo (() => window[handlerName]()); além
    // disso já existe o comando 'toggle-theme' no command registry principal
    // (handlers/index.ts). Remover a entrada órfã em vez de deixá-la no-op.
    // Ajuda
    {
        id: 'help.tours', label: 'Guided tours',
        label_pt: 'Tours guiados', category: 'Ajuda',
        // BOOT-RESILIENCE-001: era 'handleOpenTourPicker' (órfão). O opener
        // instalado do seletor de tours é handleOpenGuidedTours (Object.assign
        // window tourHandlers).
        handlerName: 'handleOpenGuidedTours',
        keywords: ['tour', 'tutorial', 'guia', 'help'],
    },
    {
        id: 'help.report-bug', label: 'Report bug',
        label_pt: 'Reportar bug', category: 'Ajuda',
        handlerName: 'handleReportBug',
        keywords: ['bug', 'problema', 'feedback'],
    },
    {
        id: 'help.docs', label: 'Open documentation',
        label_pt: 'Abrir documentação', category: 'Ajuda',
        handlerName: 'handleOpenDocs',
        keywords: ['docs', 'documentacao', 'manual'],
    },
]);

/** Total de comandos do catálogo (estável p/ asserts em tests). */
export const PALETTE_ACCESS_CATALOG_SIZE = PALETTE_ACCESS_CATALOG.length;

/**
 * Filtra o catálogo aos comandos cujo handler está disponível, preservando a
 * ordem de declaração. PURO: `hasHandler` é injetado (no runtime,
 * `(name) => typeof window[name] === 'function'`).
 *
 * @param hasHandler predicado de disponibilidade por nome de handler
 * @param catalog catálogo de origem (default = PALETTE_ACCESS_CATALOG)
 */
export function selectAvailableCommands(
    hasHandler: (handlerName: string) => boolean,
    catalog: ReadonlyArray<PaletteAccessCommandDescriptor> = PALETTE_ACCESS_CATALOG,
): PaletteAccessCommandDescriptor[] {
    return catalog.filter((c) => hasHandler(c.handlerName));
}

/** Resolve um descriptor por ID (null se desconhecido). */
export function getCommandById(id: string): PaletteAccessCommandDescriptor | null {
    return PALETTE_ACCESS_CATALOG.find((c) => c.id === id) || null;
}
