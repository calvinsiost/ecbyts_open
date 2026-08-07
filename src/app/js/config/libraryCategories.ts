// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under AGPL-3.0-only

/* ================================================================
   LIBRARY CATEGORIES — enumeração canônica do que pode ser compartilhado/
   versionado/ativado/desativado na library de ECBT.
   Cada categoria pode (futuramente) ter items na marketplace_v2 (Supabase)
   ou local-only (localStorage). Status de ativação persiste em localStorage
   key `ecbyts-library-activation`.
   ================================================================ */

import { safeJsonParse } from '../utils/helpers/safeJsonParse.js';

export interface LibraryCategory {
    /** Unique slug */
    id: string;
    /** i18n key for display */
    labelKey: string;
    /** lucide icon name */
    icon: string;
    /** Brief description */
    description: string;
    /** Can be published to marketplace */
    shareable: boolean;
    /** Can be activated/deactivated runtime */
    togglable: boolean;
    /** Has version history */
    versioned: boolean;
    /** Filesystem path or registry export to enumerate items */
    discoveryPath?: string;
    /** Items in this category typically paid */
    premium?: boolean;
    /** MOD-LIB-MIG-001: 'artifact' (shareable data, default) vs 'capability' (built-in feature module) */
    kind?: 'artifact' | 'capability';
    /** For capability modules — which registries this module feeds via B1 registerX APIs */
    provides?: {
        reports?: boolean;
        actions?: boolean;
        solvers?: boolean;
        taxonomies?: boolean;
        families?: boolean;
        formats?: boolean;
        radarPresets?: boolean;
    };
    /** For capability modules — window.* handler name that opens the feature panel */
    openHandler?: string;
}

/** @type {ReadonlyArray<LibraryCategory>} */
export const LIBRARY_CATEGORIES: ReadonlyArray<LibraryCategory> = Object.freeze([
    // Core engineering content
    {
        id: 'family_modules',
        labelKey: 'library.cat.familyModules',
        icon: 'box',
        description: 'Pluggable family modules (well, fault, etc.)',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/elements/families/',
    },
    {
        id: 'solvers',
        labelKey: 'library.cat.solvers',
        icon: 'function-square',
        description: 'Numerical simulation solvers',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/simulation/solvers/',
    },
    {
        id: 'workflows',
        labelKey: 'library.cat.workflows',
        icon: 'workflow',
        description: 'Guided BPMN workflow definitions',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/workflows/definitions/',
    },
    {
        id: 'pipelines',
        labelKey: 'library.cat.pipelines',
        icon: 'git-merge',
        description: 'Data pipelines for automation',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/pipelines/',
    },

    // Regulatory / compliance
    {
        id: 'validation_profiles',
        labelKey: 'library.cat.validationProfiles',
        icon: 'shield-check',
        description: 'CONAMA, CETESB, regulatory profiles',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/validation/profiles/',
    },
    {
        id: 'taxonomies',
        labelKey: 'library.cat.taxonomies',
        icon: 'list-tree',
        description: 'Data dictionaries (EPA WQX, ABNT)',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/taxonomy/',
    },
    {
        id: 'domain_validators',
        labelKey: 'library.cat.domainValidators',
        icon: 'check-square',
        description: 'Custom field-level validators',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/validation/engine/',
    },
    {
        id: 'constants',
        labelKey: 'library.cat.constants',
        icon: 'sigma',
        description: 'Emission factors, uncertainties, conversions',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/constants/',
    },

    // Visual / UX
    {
        id: 'symbology',
        labelKey: 'library.cat.symbology',
        icon: 'palette',
        description: 'Color, marker, line style profiles',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/symbology/',
    },
    {
        id: 'themes',
        labelKey: 'library.cat.themes',
        icon: 'sun',
        description: 'Color palettes & UI density presets',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'utils/customize/',
    },
    {
        id: 'layouts',
        labelKey: 'library.cat.layouts',
        icon: 'layout',
        description: 'Panel arrangements & dashboard presets',
        shareable: true,
        togglable: true,
        versioned: true,
    },
    {
        id: 'tours',
        labelKey: 'library.cat.tours',
        icon: 'compass',
        description: 'Guided onboarding & feature tours',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'utils/tour/tours/',
    },
    {
        id: 'diagrams',
        labelKey: 'library.cat.diagrams',
        icon: 'shapes',
        description: 'Symbol libraries (ISA S5.1, P&ID)',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/diagrams/',
    },

    // Data
    {
        id: 'knowledge_assets',
        labelKey: 'library.cat.knowledge',
        icon: 'database',
        description: 'Reusable datasets & references',
        shareable: true,
        togglable: false,
        versioned: true,
    },
    {
        id: 'models_3d',
        labelKey: 'library.cat.models3d',
        icon: 'cube',
        description: '3D models (GLB) — equipment, vehicles',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'assets/models/',
    },
    {
        id: 'demo_cases',
        labelKey: 'library.cat.demoCases',
        icon: 'play-circle',
        description: 'Pre-loaded demo scenarios (RMSP, etc.)',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'utils/demo/',
    },
    {
        id: 'model_presets',
        labelKey: 'library.cat.modelPresets',
        icon: 'file-template',
        description: 'Document-type model presets',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/elements/presets/',
    },
    {
        id: 'report_templates',
        labelKey: 'library.cat.reportTemplates',
        icon: 'file-text',
        description: 'Report layouts (PDF, DOCX)',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'utils/report/',
    },

    // AI / automation
    {
        id: 'ai_prompts',
        labelKey: 'library.cat.aiPrompts',
        icon: 'sparkles',
        description: 'LLM prompt templates & personas',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/llm/',
    },
    {
        id: 'bots',
        labelKey: 'library.cat.bots',
        icon: 'bot',
        description: 'Automation bots (file uploads, AI tagging)',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/automation/bots/',
    },

    // Hardware / external
    {
        id: 'sensor_connectors',
        labelKey: 'library.cat.sensors',
        icon: 'radio',
        description: 'IoT sensor adapters',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/sensor/',
    },

    // Localization
    {
        id: 'locales',
        labelKey: 'library.cat.locales',
        icon: 'languages',
        description: 'UI translations (16 currently shipped)',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'utils/i18n/locales/',
    },

    // Marketplace / monetization
    {
        id: 'service_products',
        labelKey: 'library.cat.serviceProducts',
        icon: 'briefcase',
        description: 'Consulting hours, custom dev',
        shareable: true,
        togglable: false,
        versioned: false,
        premium: true,
    },
    {
        id: 'ai_services',
        labelKey: 'library.cat.aiServices',
        icon: 'cpu',
        description: 'Automated AI execution (per-token billing)',
        shareable: true,
        togglable: true,
        versioned: true,
        premium: true,
    },
    {
        id: 'eic_credits',
        labelKey: 'library.cat.eicCredits',
        icon: 'coins',
        description: 'Environmental Integrity Credits (delta EIS currency)',
        shareable: true,
        togglable: false,
        versioned: false,
        premium: true,
    },

    // UX extras
    {
        id: 'shortcuts',
        labelKey: 'library.cat.shortcuts',
        icon: 'keyboard',
        description: 'Keyboard shortcut profiles',
        shareable: true,
        togglable: true,
        versioned: true,
    },
    {
        id: 'annotations',
        labelKey: 'library.cat.annotations',
        icon: 'pen-tool',
        description: 'Screenshot annotation icon kits',
        shareable: true,
        togglable: true,
        versioned: true,
    },
    // MOD-LIB-MIG-001 — capability modules (built-ins as first-party libraries).
    // Pilot: interpolation. Rollout adds nn/recognition/simulation/etc. (spec §2).
    {
        id: 'interpolation',
        labelKey: 'library.cat.interpolation',
        icon: 'git-branch',
        description: 'Spatial interpolation engine (IDW, RBF, Kriging)',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/interpolation/',
        kind: 'capability',
        provides: { actions: true, solvers: true },
        openHandler: 'handleOpenInterpolationPanel',
    },
    {
        id: 'simulation',
        labelKey: 'library.cat.simulation',
        icon: 'flask-conical',
        description: 'Environmental simulation lab (Gaussian plume, Theis/Thiem, Green-Ampt, SCS-CN, USLE/RUSLE, Manning)',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/simulation/',
        kind: 'capability',
        provides: { actions: true, solvers: true },
        openHandler: 'handleOpenSimulationPanel',
    },
    {
        id: 'nn',
        labelKey: 'library.cat.nn',
        icon: 'brain-circuit',
        description: 'ML Studio — neural network training, what-if analysis, prediction',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/nn/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenNNManager',
    },
    {
        id: 'recognition',
        labelKey: 'library.cat.recognition',
        icon: 'scan-eye',
        description: 'Aerial/image recognition — SAM, SLIC, YOLOS, samgeo segmentation',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/recognition/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenAerialModal',
    },
    {
        id: 'report',
        labelKey: 'library.cat.report',
        icon: 'file-text',
        description: 'Report studio — multi-report manager, PDF/DOCX export, editor, filter presets',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'utils/report/',
        kind: 'capability',
        provides: { reports: true, actions: true },
        openHandler: 'handleOpenReportOverlay',
    },
    {
        id: 'sensor',
        labelKey: 'library.cat.sensor',
        icon: 'radio',
        description: 'IoT sensor center — live data, Open-Meteo feed, auto-refresh polling',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/sensor/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenSensorsCenter',
    },
    {
        id: 'photolog',
        labelKey: 'library.cat.photolog',
        icon: 'camera',
        description: 'PhotoLog — field photo capture, EXIF GPS, 3D markers, AI vision analysis',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/photolog/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenPhotoLog',
    },
    {
        id: 'optimization',
        labelKey: 'library.cat.optimization',
        icon: 'target',
        description: 'Prescriptive spatial optimization — genetic algorithm with uncertainty proxy',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/analytics/optimization/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenOptimizationModal',
    },
    {
        id: 'scenarioSimulation',
        labelKey: 'library.cat.scenarioSimulation',
        icon: 'dices',
        description: 'Scenario modeling — Monte Carlo + Latin Hypercube sampling for uncertainty',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/analytics/scenarioSimulation/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenScenarioSimulationModal',
    },
    {
        id: 'health',
        labelKey: 'library.cat.health',
        icon: 'heart-pulse',
        description: 'Occupational health monitoring — ACGIH BEI thresholds, worker registry (LGPD)',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/health/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenHealthAlertsWidget',
    },
    {
        id: 'calculator',
        labelKey: 'library.cat.calculator',
        icon: 'calculator',
        description: 'Environmental metrics calculator — reusable filter pipeline + KPI seeds',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/calculator/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenCalculator',
    },
    {
        id: 'forum',
        labelKey: 'library.cat.forum',
        icon: 'messages-square',
        description: 'Knowledge Groups forum — threads, karma, notifications, moderation',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/forum/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenForumModal',
    },
    {
        id: 'pid',
        labelKey: 'library.cat.pid',
        icon: 'shapes',
        description: 'Technical diagram editor — ISA S5.1 / P&ID symbols, pan/zoom, PNG/SVG export',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/diagrams/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenDiagramEditor',
    },
    {
        id: 'automation',
        labelKey: 'library.cat.automation',
        icon: 'bot',
        description: 'Automation bots — event-driven file uploads, AI photo tagging, map interpolation',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/automation/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenAutomationPanel',
    },
    {
        id: 'costAnalysis',
        labelKey: 'library.cat.costAnalysis',
        icon: 'dollar-sign',
        description: 'Cost analysis — CAPEX/OPEX roll-up L1-L4 + analysis dashboard',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/analytics/economics/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenCostAnalysis',
    },
    {
        id: 'hypothesisTest',
        labelKey: 'library.cat.hypothesisTest',
        icon: 'flask-conical',
        description: 'Statistical hypothesis testing — t-test, ANOVA, trend significance',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/analytics/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenHypothesisTest',
    },
    {
        id: 'crossSection',
        labelKey: 'library.cat.crossSection',
        icon: 'layers',
        description: 'Geological cross-section — 2D vertical slice through the 3D model',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/scene/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenCrossSectionPanel',
    },
    {
        id: 'ingestion',
        labelKey: 'library.cat.ingestion',
        icon: 'upload-cloud',
        description: 'EDD/XLSX/CSV bulk import wizard — date normalizer + identity resolver',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/ingestion/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenIngestionModal',
    },
    {
        id: 'spatial',
        labelKey: 'library.cat.spatial',
        icon: 'pen-tool',
        description: 'Spatial Blueprint — DXF/CAD ingestion pipeline + georeferencing',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/spatial/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenSpatialModal',
    },
    {
        id: 'eis',
        labelKey: 'library.cat.eis',
        icon: 'gauge',
        description: 'Environmental Integrity Score — TCCCA+T dashboard, 10-axis radar, history',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/eis/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenEisDashboard',
    },
    {
        id: 'governance',
        labelKey: 'library.cat.governance',
        icon: 'landmark',
        description: 'ESG governance dashboard — audit trail, compliance, regulatory calendar, decision log',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/governance/',
        kind: 'capability',
        provides: { actions: true, reports: true },
        openHandler: 'handleOpenGovernanceDashboard',
    },
    {
        id: 'sao',
        labelKey: 'library.cat.sao',
        icon: 'grid-3x3',
        description: 'SAO / ESH matrices — environment, safety & health scenario assessment',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/sao/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenSAOMatrixPanel',
    },
    {
        id: 'ohs',
        labelKey: 'library.cat.ohs',
        icon: 'hard-hat',
        description: 'Occupational health & safety panel — exposure tracking, ACGIH limits',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/health/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenOhsPanel',
    },
    {
        id: 'pipelineManager',
        labelKey: 'library.cat.pipelineManager',
        icon: 'git-merge',
        description: 'BPMN pipeline automation — schema, registry, executor',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/pipelines/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenPipelineManager',
    },
    {
        id: 'workflowEngine',
        labelKey: 'library.cat.workflowEngine',
        icon: 'workflow',
        description: 'Guided environmental workflows — plume delineation, risk assessment, emergency response',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/workflows/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenWorkflowPicker',
    },
    {
        id: 'issues',
        labelKey: 'library.cat.issues',
        icon: 'flag',
        description: 'Issues 3D / BCF + Bug Bounty — non-conformity markers, bounty tiers, leaderboard',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/issues/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenIssuesPanel',
    },
    {
        id: 'purpose',
        labelKey: 'library.cat.purpose',
        icon: 'heart-handshake',
        description: 'Purpose Module — EIS impact tracking, micro-feedback, snapshots',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/purpose/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenPurpose',
    },
    {
        id: 'financial',
        labelKey: 'library.cat.financial',
        icon: 'trending-up',
        description: 'Project valuation + MAC curve — VPL, CRF, VPLA, marginal abatement cost',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/financial/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenMACCurve',
    },
    {
        id: 'etl',
        labelKey: 'library.cat.etl',
        icon: 'arrow-left-right',
        description: 'Lab API ETL — unit conversion, fuzzy name matching, campaign reconciliation',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/etl/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenLabReconciliation',
    },
    {
        id: 'assessment',
        labelKey: 'library.cat.assessment',
        icon: 'file-search',
        description: 'Document type assessment — keyword detection for environmental docs (PT/EN)',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/assessment/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenDocAssessmentReview',
    },
    {
        id: 'demo',
        labelKey: 'library.cat.demo',
        icon: 'play-circle',
        description: 'Demo mode — pre-loaded scenarios, guided cases, ticker',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'utils/demo/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenDemo',
    },
    {
        id: 'sharing',
        labelKey: 'library.cat.sharing',
        icon: 'share-2',
        description: 'Resource sharing — org role hierarchy + action matrix (READ/WRITE/SHARE/DELETE)',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/sharing/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenSharesPanel',
    },
    {
        id: 'symbologyEditor',
        labelKey: 'library.cat.symbologyEditor',
        icon: 'palette',
        description: 'Symbology profile editor — color/marker/line style overlay editor',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/symbology/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenSymbologyEditor',
    },
    {
        id: 'validationEngine',
        labelKey: 'library.cat.validationEngine',
        icon: 'check-square',
        description: 'Domain validator engine — generic 3-level validation, JSON domain loader',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/validation/engine/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenValidationProfiles',
    },
    {
        id: 'presentation',
        labelKey: 'library.cat.presentation',
        icon: 'presentation',
        description: 'Presentation Mode — FSM step model, recorder/player, audio, captions, video',
        shareable: true,
        togglable: true,
        versioned: true,
        discoveryPath: 'core/presentation/',
        kind: 'capability',
        provides: { actions: true },
        openHandler: 'handleOpenPresentationModal',
    },
]);

/** localStorage key for activation state */
export const ACTIVATION_KEY = 'ecbyts-library-activation';

/**
 * @returns {Record<string, boolean>}
 */
export function readActivationState(): Record<string, boolean> {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVATION_KEY) : null;
    const parsed = safeJsonParse<Record<string, boolean>>(raw, {}, 'libraryCategories-activation');
    return parsed && typeof parsed === 'object' ? parsed : {};
}

/**
 * @param {string} categoryId
 * @param {boolean} active
 */
export function setActivationState(categoryId: string, active: boolean): void {
    const state = readActivationState();
    state[categoryId] = !!active;
    try {
        localStorage.setItem(ACTIVATION_KEY, JSON.stringify(state));
    } catch (e) {
        console.debug('[libraryCategories] persist:', (e as { message?: string } | null)?.message);
    }
}

/**
 * @param {string} categoryId
 * @returns {boolean} — defaults to true (all enabled by default)
 */
export function isCategoryActive(categoryId: string): boolean {
    const state = readActivationState();
    return state[categoryId] !== false;
}

/**
 * Capability modules (built-in features migrating to first-party libraries —
 * MOD-LIB-MIG-001), distintos das categorias de artefato (dados compartilháveis).
 * @returns {ReadonlyArray<LibraryCategory>}
 */
export function getCapabilityModules(): ReadonlyArray<LibraryCategory> {
    return LIBRARY_CATEGORIES.filter((c) => c.kind === 'capability');
}

/**
 * MOD-LIB-MIG-001 M2 — gate de capability. Seguro por construção: só um módulo de
 * CAPACIDADE (kind=capability) pode ser desabilitado; ids desconhecidos ou de
 * artefato retornam SEMPRE true (nunca quebram comportamento existente).
 * @param {string} capabilityId
 * @returns {boolean}
 */
export function isCapabilityEnabled(capabilityId: string): boolean {
    const cat = LIBRARY_CATEGORIES.find((c) => c.id === capabilityId);
    if (!cat || cat.kind !== 'capability') return true;
    return isCategoryActive(capabilityId);
}
