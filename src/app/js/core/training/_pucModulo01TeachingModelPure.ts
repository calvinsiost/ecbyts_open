// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   PUC Modulo 01 teaching model (pure)

   Local, deterministic model for the Training Deck Workbench scenario:
   "Gestao de Dados Ambientais 2025". This module has no IO, DOM, storage,
   Supabase, runtime handlers, or UI coupling. Runtime code can consume this
   contract to bind slides to explicit teaching presets instead of opening the
   first available pipeline, project, parameter, or module.
   ================================================================ */

export const PUC_MODULO01_TRAINING_MODEL_ID =
    'ecbt://training-model/puc-2025-modulo01-dados-ambientais@1';
export const PUC_MODULO01_TRAINING_MODEL_SLUG = 'puc-2025-modulo01-dados-ambientais';
export const PUC_MODULO01_TRAINING_MODEL_VERSION = 1;
// Reconciled slide count of the canonical 2026 PPTX (T1.6, SPEC_TRAINING_PPTX_SOURCE_FIDELITY):
// docs/reports/TRAINING_SOURCE_MANIFEST_MODULO01.json (slideCount: 28, SHA-256 verified).
// The hand-written teaching plan still covers 33 entries pending the Calvin decision in T1.4,
// so slide-index validation accepts the full plan extent (see PUC_MODULO01_PLAN_SLIDE_COUNT).
export const PUC_MODULO01_EXPECTED_SLIDE_COUNT = 28;

export type DeckMode = 'teacher_setup' | 'slide_edit' | 'presentation' | 'student_preview';

export type SlideTeachingLayout =
    | 'static-16x9'
    | 'center-stage'
    | 'split-explain-demo'
    | 'full-stage-demo'
    | 'picture-in-picture'
    | 'callout-overlay';

export type TeachingModelStatus = 'ready' | 'partial' | 'missing' | 'invalid';

export type TeachingSeedBehavior = 'reuse-existing' | 'install-if-missing' | 'snapshot-only';

export type TeachingAdapterId =
    | 'pipelines.gac'
    | 'datastudio.module'
    | 'datastudio.validation'
    | 'analytics.temporal'
    | 'governance.gantt'
    | 'spatial.interpolation'
    | 'spatial.webmap2d'
    | 'spatial.model3d'
    | 'field.collection'
    | 'ai.neural-network'
    | 'training.component'
    | 'module'
    | 'files.asset'
    | 'report.overlay'
    | string;

export type TeachingSuggestionKind =
    | 'gac'
    | 'datastudio'
    | 'gantt'
    | 'cross-tab-validation'
    | 'plume-interpolation'
    | 'temporal-mann-kendall'
    | 'simple-component'
    | 'dashboard'
    | 'field-collection'
    | 'ai-neural-network'
    | 'automation'
    | 'static';

export type TeachingPriority = 'baixa' | 'media' | 'alta' | 'muito-alta';

export type WorkspaceTarget =
    | {
          type: 'pipeline';
          pipelineId?: string;
          templateId?: string;
          nodeId?: string;
          mode?: 'view' | 'run' | 'explain';
      }
    | {
          type: 'analytics-temporal';
          elementId?: string;
          parameterId?: string;
          method?: 'mannKendall' | 'seasonalMK' | 'theilSen' | 'pettitt';
          mode?: 'run' | 'explain';
      }
    | {
          type: 'governance-project';
          projectId?: string;
          view?: 'gantt' | 'resources' | 'eva' | 'timesheet';
          phaseId?: string;
      }
    | {
          type: 'dom-surface';
          toolId: string;
          selector?: string;
          intent?: 'highlight' | 'inspect' | 'demo';
          snapshotAssetId?: string;
      }
    | {
          type: 'module';
          toolId: string;
          panelId?: string;
          payload?: Record<string, unknown>;
      }
    | {
          type: 'files';
          fileId?: string;
          filter?: Record<string, string>;
      }
    | {
          type: 'report';
          reportId?: string;
          sectionId?: string;
      }
    | {
          type: 'training-slide';
          courseId: string;
          slideId: string;
      };

export interface TeachingValidationRule {
    readonly code: string;
    readonly message: string;
}

export interface TeachingModulePreset {
    readonly id: string;
    readonly adapterId: TeachingAdapterId;
    readonly label: string;
    readonly target: WorkspaceTarget;
    readonly defaultLayout: SlideTeachingLayout;
    readonly fallbackAssetId?: string;
    readonly seedBehavior: TeachingSeedBehavior;
    readonly validationRules: readonly TeachingValidationRule[];
}

export interface TeachingDatasetRef {
    readonly id: string;
    readonly label: string;
    readonly kind: 'sample-data' | 'user-data' | 'project' | 'pipeline' | 'file' | 'report';
    readonly fileId?: string;
    readonly checksumSha256?: string;
    readonly requiredFor: readonly string[];
}

export interface TeachingReadinessWarning {
    readonly code: string;
    readonly message: string;
    readonly slideIndex?: number;
}

export interface TeachingModelReadiness {
    readonly status: TeachingModelStatus;
    readonly missingPresets: readonly string[];
    readonly missingAssets: readonly string[];
    readonly missingCapabilities: readonly string[];
    readonly warnings: readonly TeachingReadinessWarning[];
}

export interface EcbtTeachingModelKey {
    readonly id: string;
    readonly slug: string;
    readonly version: number;
    readonly title: string;
    readonly ownerUserId?: string;
    readonly courseId?: string;
    readonly deckId?: string;
    readonly locale: 'pt-BR' | 'en-US' | string;
    readonly audience?: 'teacher' | 'student' | 'both';
    readonly modulePresets: readonly TeachingModulePreset[];
    readonly datasetRefs: readonly TeachingDatasetRef[];
    readonly assetRefs: readonly string[];
    readonly requiredCapabilities: readonly string[];
    readonly readiness: TeachingModelReadiness;
}

export interface TrainingSlideSuggestion {
    readonly slideIndex: number;
    readonly title: string;
    readonly kind: TeachingSuggestionKind;
    readonly priority: TeachingPriority;
    readonly layout: SlideTeachingLayout;
    readonly presetIds: readonly string[];
    readonly componentIds: readonly string[];
    readonly rationale: string;
}

export interface TeachingPresetBindingValidationInput {
    readonly slideIndex: number;
    readonly modelPresetId?: string | null;
    readonly fallbackAssetId?: string | null;
    readonly requirePreset?: boolean;
}

export interface TeachingPresetBindingIssue {
    readonly code: string;
    readonly message: string;
    readonly slideIndex?: number;
    readonly modelPresetId?: string;
}

export interface TeachingPresetBindingValidation {
    readonly ok: boolean;
    readonly status: 'valid' | 'warning' | 'invalid';
    readonly slideIndex: number;
    readonly modelPresetId: string | null;
    readonly fallbackAssetId: string | null;
    readonly preset: TeachingModulePreset | null;
    readonly errors: readonly TeachingPresetBindingIssue[];
    readonly warnings: readonly TeachingPresetBindingIssue[];
}

export interface PucModulo01ReadinessOptions {
    readonly expectedSlideCount?: number;
    readonly availableAssetIds?: readonly string[];
    readonly availableCapabilities?: readonly string[];
}

export interface PucModulo01ReadinessSummary {
    readonly status: TeachingModelStatus;
    readonly modelId: string;
    readonly version: number;
    readonly expectedSlideCount: number;
    readonly suggestionCount: number;
    readonly presetCount: number;
    readonly requiredPresetCount: number;
    readonly readySlides: number;
    readonly partialSlides: number;
    readonly missingPresets: readonly string[];
    readonly missingFallbackAssets: readonly string[];
    readonly missingCapabilities: readonly string[];
    readonly invalidBindings: readonly TeachingPresetBindingValidation[];
    readonly warnings: readonly TeachingPresetBindingIssue[];
}

const ASSET_REFS = [
    'asset:m01:snapshot:gac-dd38',
    'asset:m01:snapshot:gac-detection-preliminary-assessment',
    'asset:m01:snapshot:gac-confirmatory-investigation',
    'asset:m01:snapshot:gac-classification',
    'asset:m01:snapshot:gac-remediation',
    'asset:m01:snapshot:gac-monitoring-closeout',
    'asset:m01:snapshot:datastudio-overview',
    'asset:m01:snapshot:files-gac-catalog',
    'asset:m01:snapshot:field-collection',
    'asset:m01:snapshot:eis-dashboard',
    'asset:m01:snapshot:eis-report-summary',
    'asset:m01:snapshot:map-spatial',
    'asset:m01:snapshot:webmap-2d',
    'asset:m01:snapshot:model3d-plume',
    'asset:m01:snapshot:automation-pipeline',
    'asset:m01:snapshot:ai-assistant',
    'asset:m01:snapshot:ai-neural-network',
    'asset:m01:snapshot:agile-gantt',
    'asset:m01:snapshot:cross-tab-validation',
    'asset:m01:snapshot:plume-interpolation',
    'asset:m01:snapshot:temporal-na-mk',
    'asset:m01:snapshot:data-product-recipe',
    'asset:m01:snapshot:ecosystem-map',
    'asset:m01:snapshot:demo-agenda',
    'asset:m01:snapshot:class-poll',
    'asset:m01:snapshot:reveal-compare',
    'asset:m01:snapshot:course-resource-landing',
    'asset:m01:snapshot:source-standard-drawer',
    'asset:m01:snapshot:built-asset-card',
    'asset:m01:snapshot:glossary',
] as const;

const REQUIRED_CAPABILITIES = [
    'training',
    'files',
    'pipelines',
    'datastudio',
    'analytics-temporal',
    'governance-project',
    'spatial-interpolation',
    'spatial-webmap2d',
    'field-collection',
    'ai-neural-network',
    'reports',
] as const;

const GAC_PIPELINE_TEMPLATE_ID = 'gac-dd38-environmental-management';

const GAC_PHASE_PRESET_IDS = [
    'm01.gac.phase.detection-preliminary-assessment',
    'm01.gac.phase.confirmatory-investigation',
    'm01.gac.phase.classification',
    'm01.gac.phase.remediation',
    'm01.gac.phase.monitoring-closeout',
] as const;

const GAC_PHASE_PRESETS: TeachingModulePreset[] = [
    makeGacPhasePreset({
        id: 'm01.gac.phase.detection-preliminary-assessment',
        label: 'GAC: deteccao e avaliacao preliminar',
        nodeId: 'gac.phase.detection-preliminary-assessment',
        fallbackAssetId: 'asset:m01:snapshot:gac-detection-preliminary-assessment',
        evidenceFocus: ['indicios', 'historico de uso', 'vistoria', 'avaliacao preliminar'],
    }),
    makeGacPhasePreset({
        id: 'm01.gac.phase.confirmatory-investigation',
        label: 'GAC: investigacao confirmatoria',
        nodeId: 'gac.phase.confirmatory-investigation',
        fallbackAssetId: 'asset:m01:snapshot:gac-confirmatory-investigation',
        evidenceFocus: ['plano de amostragem', 'analitos alvo', 'confirmacao de contaminacao'],
    }),
    makeGacPhasePreset({
        id: 'm01.gac.phase.classification',
        label: 'GAC: classificacao',
        nodeId: 'gac.phase.gac-classification',
        fallbackAssetId: 'asset:m01:snapshot:gac-classification',
        evidenceFocus: ['CMA', 'risco', 'prioridade', 'decisao de gerenciamento'],
    }),
    makeGacPhasePreset({
        id: 'm01.gac.phase.remediation',
        label: 'GAC: remediacao',
        nodeId: 'gac.phase.remediation',
        fallbackAssetId: 'asset:m01:snapshot:gac-remediation',
        evidenceFocus: ['plano de intervencao', 'metas', 'tecnologia', 'execucao'],
    }),
    makeGacPhasePreset({
        id: 'm01.gac.phase.monitoring-closeout',
        label: 'GAC: monitoramento e fechamento',
        nodeId: 'gac.phase.monitoring-closeout',
        fallbackAssetId: 'asset:m01:snapshot:gac-monitoring-closeout',
        evidenceFocus: ['monitoramento', 'efetividade', 'relatorio de encerramento', 'restricoes aplicaveis'],
    }),
];

const MODULE_PRESETS: TeachingModulePreset[] = [
    {
        id: 'm01.gac.flow.dd38',
        adapterId: 'pipelines.gac',
        label: 'Fluxo GAC DD38',
        target: {
            type: 'pipeline',
            templateId: GAC_PIPELINE_TEMPLATE_ID,
            nodeId: 'gac.phase.characterization',
            mode: 'explain',
        },
        defaultLayout: 'full-stage-demo',
        fallbackAssetId: 'asset:m01:snapshot:gac-dd38',
        seedBehavior: 'install-if-missing',
        validationRules: [
            {
                code: 'pipeline_target_required',
                message: 'GAC must resolve to an explicit pipelineId or templateId.',
            },
            {
                code: 'no_default_pipeline',
                message: 'Never open the first available pipeline for this class.',
            },
        ],
    },
    ...GAC_PHASE_PRESETS,
    {
        id: 'm01.datastudio.overview',
        adapterId: 'datastudio.module',
        label: 'DataStudio: cadeia digital',
        target: {
            type: 'module',
            toolId: 'datastudio',
            panelId: 'overview',
            payload: {
                modules: ['extraction', 'processing', 'analytics', 'radar'],
                intent: 'class-overview',
            },
        },
        defaultLayout: 'split-explain-demo',
        fallbackAssetId: 'asset:m01:snapshot:datastudio-overview',
        seedBehavior: 'reuse-existing',
        validationRules: [
            {
                code: 'datastudio_panel_required',
                message: 'DataStudio demo must specify the class overview panel.',
            },
        ],
    },
    {
        id: 'm01.files.gac-catalog',
        adapterId: 'files.asset',
        label: 'Files: pacote GAC e materiais do slide 9',
        target: {
            type: 'files',
            filter: {
                course: 'puc-modulo01',
                collection: 'gac-data-catalog',
                purpose: 'class-demo',
            },
        },
        defaultLayout: 'full-stage-demo',
        fallbackAssetId: 'asset:m01:snapshot:files-gac-catalog',
        seedBehavior: 'snapshot-only',
        validationRules: [
            {
                code: 'files_filter_required',
                message: 'Files demo must use the class catalog filter, never the first user file.',
            },
        ],
    },
    {
        id: 'm01.field.collection',
        adapterId: 'field.collection',
        label: 'App de campo: coleta estruturada e sensores',
        target: {
            type: 'module',
            toolId: 'field-collection',
            panelId: 'data-entry-matrix',
            payload: {
                handlers: ['handleOpenDataEntryMatrix'],
                requiredInputs: ['ponto', 'coordenada', 'parametro', 'data', 'responsavel', 'evidencia'],
                mode: 'class-demo',
            },
        },
        defaultLayout: 'center-stage',
        fallbackAssetId: 'asset:m01:snapshot:field-collection',
        seedBehavior: 'snapshot-only',
        validationRules: [
            {
                code: 'field_handlers_optional',
                message: 'Use the saved snapshot if one of the field handlers is unavailable.',
            },
        ],
    },
    {
        id: 'm01.dashboard.eis',
        adapterId: 'report.overlay',
        label: 'Dashboard EIS e relatorio',
        target: {
            type: 'module',
            toolId: 'eis-dashboard',
            panelId: 'report-overlay',
            payload: {
                handlers: ['handleOpenEisDashboard', 'handleOpenReportOverlay'],
            },
        },
        defaultLayout: 'full-stage-demo',
        fallbackAssetId: 'asset:m01:snapshot:eis-dashboard',
        seedBehavior: 'reuse-existing',
        validationRules: [
            {
                code: 'dashboard_snapshot_required',
                message: 'Dashboard slides require a readable saved snapshot.',
            },
        ],
    },
    {
        id: 'm01.report.eis.summary',
        adapterId: 'report.overlay',
        label: 'Relatorio EIS: linhas de evidencia da conclusao',
        target: {
            type: 'report',
            reportId: 'template:puc-modulo01-eis-summary',
            sectionId: 'conclusoes-e-linhas-de-evidencia',
        },
        defaultLayout: 'center-stage',
        fallbackAssetId: 'asset:m01:snapshot:eis-report-summary',
        seedBehavior: 'snapshot-only',
        validationRules: [
            {
                code: 'report_template_required',
                message: 'EIS/report closeout must use the class report template, never the first report.',
            },
        ],
    },
    {
        id: 'm01.map.spatial',
        adapterId: 'spatial.webmap2d',
        label: 'Webmap 2D: camada espacial da aula',
        target: {
            type: 'module',
            toolId: 'spatial-webmap2d',
            panelId: 'webmap-2d-depth',
            payload: {
                handlers: ['handleSwitchView'],
                viewMode: '2d-depth',
                layers: ['pocos', 'limite-da-area', 'pluma-projetada', 'base-georreferenciada'],
                legend: 'Mapa 2D com poco, limite da area e camada de decisao.',
            },
        },
        defaultLayout: 'full-stage-demo',
        fallbackAssetId: 'asset:m01:snapshot:webmap-2d',
        seedBehavior: 'snapshot-only',
        validationRules: [
            {
                code: 'webmap2d_snapshot_required',
                message: 'Webmap 2D slides need fallback imagery for data-free or offline presentation.',
            },
        ],
    },
    {
        id: 'm01.model3d.plume',
        adapterId: 'spatial.model3d',
        label: 'Modelo 3D e pluma',
        target: {
            type: 'module',
            toolId: 'spatial-3d-plume',
            panelId: 'model-3d-cross-section',
            payload: {
                workflowPresetId: 'plume-delineation',
                views: ['3d', 'cross-section', 'plume'],
            },
        },
        defaultLayout: 'full-stage-demo',
        fallbackAssetId: 'asset:m01:snapshot:model3d-plume',
        seedBehavior: 'snapshot-only',
        validationRules: [
            {
                code: 'model3d_snapshot_required',
                message: '3D plume demo must fall back to a saved class snapshot.',
            },
        ],
    },
    {
        id: 'm01.automation.pipeline',
        adapterId: 'pipelines.gac',
        label: 'Automacao e validacao por pipeline',
        target: {
            type: 'pipeline',
            templateId: 'conama-cetesb-validation-workflow',
            nodeId: 'validation.qa-qc',
            mode: 'explain',
        },
        defaultLayout: 'center-stage',
        fallbackAssetId: 'asset:m01:snapshot:automation-pipeline',
        seedBehavior: 'install-if-missing',
        validationRules: [
            {
                code: 'validation_pipeline_required',
                message: 'Validation workflow must name a template or pipeline explicitly.',
            },
        ],
    },
    {
        id: 'm01.ai.neural-network',
        adapterId: 'ai.neural-network',
        label: 'Rede neural com revisao humana',
        target: {
            type: 'module',
            toolId: 'neural-network-manager',
            panelId: 'nn-manager-class-demo',
            payload: {
                handlers: ['handleOpenNNManager'],
                inputs: ['dataset_curado', 'variaveis_ambientais', 'hipotese', 'restricoes_de_uso'],
                mode: 'safe-demo',
            },
        },
        defaultLayout: 'split-explain-demo',
        fallbackAssetId: 'asset:m01:snapshot:ai-neural-network',
        seedBehavior: 'snapshot-only',
        validationRules: [
            {
                code: 'neural_network_snapshot_first',
                message: 'Neural network demo is snapshot-first unless runtime data is curated.',
            },
        ],
    },
    {
        id: 'm01.agile.gantt',
        adapterId: 'governance.gantt',
        label: 'Cronograma agil da aula',
        target: {
            type: 'governance-project',
            projectId: 'template:puc-modulo01-aula',
            view: 'gantt',
            phaseId: 'class-sprint-demo',
        },
        defaultLayout: 'full-stage-demo',
        fallbackAssetId: 'asset:m01:snapshot:agile-gantt',
        seedBehavior: 'install-if-missing',
        validationRules: [
            {
                code: 'gantt_project_required',
                message: 'Gantt demo must use the class project/template, never the first project.',
            },
        ],
    },
    {
        id: 'm01.cross.tab.validation',
        adapterId: 'datastudio.validation',
        label: 'Cross-tab e validacao CONAMA/CETESB',
        target: {
            type: 'module',
            toolId: 'datastudio',
            panelId: 'cross-tab-validation',
            payload: {
                action: 'datastudio_query',
                queryPresetIds: ['conama-validation', 'cetesb-vr-vp-vi', 'qa-qc-replicates'],
                output: 'pivot-table',
            },
        },
        defaultLayout: 'full-stage-demo',
        fallbackAssetId: 'asset:m01:snapshot:cross-tab-validation',
        seedBehavior: 'install-if-missing',
        validationRules: [
            {
                code: 'cross_tab_query_required',
                message: 'Cross-tab slide must resolve to a known validation query preset.',
            },
        ],
    },
    {
        id: 'm01.plume.interpolation',
        adapterId: 'spatial.interpolation',
        label: 'Pluma, interpolacao e incerteza',
        target: {
            type: 'module',
            toolId: 'spatial-interpolation',
            panelId: 'plume-delineation',
            payload: {
                workflowPresetId: 'plume-delineation',
                views: ['interpolation', 'scenario-comparison', 'cross-section', 'risk'],
            },
        },
        defaultLayout: 'full-stage-demo',
        fallbackAssetId: 'asset:m01:snapshot:plume-interpolation',
        seedBehavior: 'install-if-missing',
        validationRules: [
            {
                code: 'plume_preset_required',
                message: 'Plume demo must use the plume-delineation preset or a saved snapshot.',
            },
        ],
    },
    {
        id: 'm01.temporal.na.mann-kendall',
        adapterId: 'analytics.temporal',
        label: 'Serie temporal de NA e Mann-Kendall',
        target: {
            type: 'analytics-temporal',
            elementId: 'template:pm-na-class-series',
            parameterId: 'water-level',
            method: 'mannKendall',
            mode: 'explain',
        },
        defaultLayout: 'full-stage-demo',
        fallbackAssetId: 'asset:m01:snapshot:temporal-na-mk',
        seedBehavior: 'install-if-missing',
        validationRules: [
            {
                code: 'temporal_element_parameter_required',
                message: 'Temporal demo must define element, parameter, and Mann-Kendall method.',
            },
        ],
    },
    {
        id: 'm01.component.data-product-recipe',
        adapterId: 'training.component',
        label: 'Componente: receita de produto de dados',
        target: {
            type: 'module',
            toolId: 'training.simple-component',
            panelId: 'data-product-recipe',
            payload: {
                steps: ['dado bruto', 'dado tratado', 'insight', 'decisao', 'produto digital'],
            },
        },
        defaultLayout: 'center-stage',
        fallbackAssetId: 'asset:m01:snapshot:data-product-recipe',
        seedBehavior: 'snapshot-only',
        validationRules: [
            {
                code: 'component_panel_required',
                message: 'Simple component presets must name a panelId.',
            },
        ],
    },
    {
        id: 'm01.component.ecosystem-map',
        adapterId: 'training.component',
        label: 'Componente: mapa do ecossistema',
        target: {
            type: 'module',
            toolId: 'training.simple-component',
            panelId: 'ecosystem-map',
            payload: {
                center: 'Training',
                modules: ['Files', 'DataStudio', 'Pipelines', 'Reports', 'Sensors', 'Governance', 'EIS'],
            },
        },
        defaultLayout: 'center-stage',
        fallbackAssetId: 'asset:m01:snapshot:ecosystem-map',
        seedBehavior: 'snapshot-only',
        validationRules: [
            {
                code: 'component_panel_required',
                message: 'Simple component presets must name a panelId.',
            },
        ],
    },
    {
        id: 'm01.component.demo-agenda',
        adapterId: 'training.component',
        label: 'Componente: agenda de demos',
        target: {
            type: 'module',
            toolId: 'training.simple-component',
            panelId: 'demo-agenda',
            payload: {
                blocks: ['DataStudio', 'Gantt', 'Cross-tab', 'Pluma', 'Mann-Kendall'],
            },
        },
        defaultLayout: 'static-16x9',
        fallbackAssetId: 'asset:m01:snapshot:demo-agenda',
        seedBehavior: 'snapshot-only',
        validationRules: [
            {
                code: 'component_panel_required',
                message: 'Simple component presets must name a panelId.',
            },
        ],
    },
    {
        id: 'm01.component.class-poll',
        adapterId: 'training.component',
        label: 'Componente: enquete local',
        target: {
            type: 'module',
            toolId: 'training.simple-component',
            panelId: 'class-poll',
            payload: {
                storage: 'local-session',
                modes: ['ab', 'multiple-choice', 'manual-result'],
            },
        },
        defaultLayout: 'center-stage',
        fallbackAssetId: 'asset:m01:snapshot:class-poll',
        seedBehavior: 'snapshot-only',
        validationRules: [
            {
                code: 'component_panel_required',
                message: 'Simple component presets must name a panelId.',
            },
        ],
    },
    {
        id: 'm01.component.reveal-compare',
        adapterId: 'training.component',
        label: 'Componente: comparar e revelar evidencia',
        target: {
            type: 'module',
            toolId: 'training.simple-component',
            panelId: 'reveal-compare',
            payload: {
                modes: ['ab-before-after', 'evidence-ladder'],
            },
        },
        defaultLayout: 'split-explain-demo',
        fallbackAssetId: 'asset:m01:snapshot:reveal-compare',
        seedBehavior: 'snapshot-only',
        validationRules: [
            {
                code: 'component_panel_required',
                message: 'Simple component presets must name a panelId.',
            },
        ],
    },
    {
        id: 'm01.component.resource-landing',
        adapterId: 'training.component',
        label: 'Componente: materiais do curso',
        target: {
            type: 'module',
            toolId: 'training.simple-component',
            panelId: 'course-resource-landing',
            payload: {
                sections: ['ppt', 'diagrama-gac', 'datasets', 'snapshots', 'referencias'],
            },
        },
        defaultLayout: 'static-16x9',
        fallbackAssetId: 'asset:m01:snapshot:course-resource-landing',
        seedBehavior: 'snapshot-only',
        validationRules: [
            {
                code: 'component_panel_required',
                message: 'Simple component presets must name a panelId.',
            },
        ],
    },
    {
        id: 'm01.component.source-standard-drawer',
        adapterId: 'training.component',
        label: 'Componente: fontes e padroes',
        target: {
            type: 'module',
            toolId: 'training.simple-component',
            panelId: 'source-standard-drawer',
            payload: {
                sources: ['CETESB', 'CONAMA', 'DD38', 'EPA'],
            },
        },
        defaultLayout: 'callout-overlay',
        fallbackAssetId: 'asset:m01:snapshot:source-standard-drawer',
        seedBehavior: 'snapshot-only',
        validationRules: [
            {
                code: 'component_panel_required',
                message: 'Simple component presets must name a panelId.',
            },
        ],
    },
    {
        id: 'm01.component.built-asset-card',
        adapterId: 'training.component',
        label: 'Componente: ativo construido',
        target: {
            type: 'module',
            toolId: 'training.simple-component',
            panelId: 'built-asset-card',
            payload: {
                assetTypes: ['tanque', 'tubulacao', 'sistema de remediacao', 'edificio'],
            },
        },
        defaultLayout: 'center-stage',
        fallbackAssetId: 'asset:m01:snapshot:built-asset-card',
        seedBehavior: 'snapshot-only',
        validationRules: [
            {
                code: 'component_panel_required',
                message: 'Simple component presets must name a panelId.',
            },
        ],
    },
    {
        id: 'm01.component.glossary',
        adapterId: 'training.component',
        label: 'Componente: glossario da aula',
        target: {
            type: 'module',
            toolId: 'training.simple-component',
            panelId: 'glossary-popover',
            payload: {
                terms: ['LQ', 'CMA', 'NA', 'pluma', 'massa', 'sprint', 'backlog'],
            },
        },
        defaultLayout: 'callout-overlay',
        fallbackAssetId: 'asset:m01:snapshot:glossary',
        seedBehavior: 'snapshot-only',
        validationRules: [
            {
                code: 'component_panel_required',
                message: 'Simple component presets must name a panelId.',
            },
        ],
    },
];

function makeGacPhasePreset(input: {
    readonly id: string;
    readonly label: string;
    readonly nodeId: string;
    readonly fallbackAssetId: string;
    readonly evidenceFocus: readonly string[];
}): TeachingModulePreset {
    return {
        id: input.id,
        adapterId: 'pipelines.gac',
        label: input.label,
        target: {
            type: 'pipeline',
            templateId: GAC_PIPELINE_TEMPLATE_ID,
            nodeId: input.nodeId,
            mode: 'explain',
        },
        defaultLayout: 'callout-overlay',
        fallbackAssetId: input.fallbackAssetId,
        seedBehavior: 'install-if-missing',
        validationRules: [
            {
                code: 'gac_phase_node_required',
                message: `GAC phase hotspot must open node "${input.nodeId}", not the generic GAC entrypoint.`,
            },
            {
                code: 'gac_phase_fallback_required',
                message: `Fallback snapshot is required for ${input.evidenceFocus.join(', ')}.`,
            },
        ],
    };
}

const DATASET_REFS: TeachingDatasetRef[] = [
    {
        id: 'dataset:m01:gac-dd38-template',
        label: 'Template GAC DD38 para demonstracao',
        kind: 'pipeline',
        requiredFor: ['m01.gac.flow.dd38', ...GAC_PHASE_PRESET_IDS, 'm01.automation.pipeline'],
    },
    {
        id: 'dataset:m01:ambiental-sample-lab',
        label: 'Dados ambientais exemplo: resultados laboratoriais e VR/VP/VI',
        kind: 'sample-data',
        requiredFor: ['m01.datastudio.overview', 'm01.cross.tab.validation'],
    },
    {
        id: 'dataset:m01:gac-files-catalog',
        label: 'Catalogo de arquivos GAC do Modulo 01',
        kind: 'file',
        requiredFor: ['m01.files.gac-catalog'],
    },
    {
        id: 'dataset:m01:plume-scenario',
        label: 'Cenario exemplo de pluma e interpolacao',
        kind: 'sample-data',
        requiredFor: ['m01.map.spatial', 'm01.model3d.plume', 'm01.plume.interpolation'],
    },
    {
        id: 'dataset:m01:na-time-series',
        label: 'Serie temporal de nivel d agua para Mann-Kendall',
        kind: 'sample-data',
        requiredFor: ['m01.temporal.na.mann-kendall'],
    },
    {
        id: 'dataset:m01:class-project',
        label: 'Projeto template da aula Modulo 01',
        kind: 'project',
        requiredFor: ['m01.agile.gantt'],
    },
    {
        id: 'dataset:m01:eis-report-summary',
        label: 'Template EIS/report para conclusoes do Modulo 01',
        kind: 'report',
        requiredFor: ['m01.dashboard.eis', 'm01.report.eis.summary'],
    },
];

const SLIDE_SUGGESTIONS: TrainingSlideSuggestion[] = [
    {
        slideIndex: 1,
        title: 'Capa e modelo da aula',
        kind: 'simple-component',
        priority: 'media',
        layout: 'static-16x9',
        presetIds: ['m01.component.resource-landing'],
        componentIds: ['course-resource-landing'],
        rationale: 'Apply the class ECBT model before presentation starts.',
    },
    {
        slideIndex: 2,
        title: 'Digitalizacao e cadeia de dados',
        kind: 'datastudio',
        priority: 'alta',
        layout: 'split-explain-demo',
        presetIds: ['m01.datastudio.overview', 'm01.component.data-product-recipe'],
        componentIds: ['data-product-recipe'],
        rationale: 'Show DataStudio blocks as the local digital chain.',
    },
    {
        slideIndex: 3,
        title: 'Dados como recurso multiproduto',
        kind: 'simple-component',
        priority: 'media',
        layout: 'center-stage',
        presetIds: ['m01.component.data-product-recipe'],
        componentIds: ['data-product-recipe'],
        rationale: 'Explain raw data to reusable data products before live modules.',
    },
    {
        slideIndex: 4,
        title: 'GAC e linhas de evidencia',
        kind: 'gac',
        priority: 'alta',
        layout: 'split-explain-demo',
        presetIds: ['m01.gac.flow.dd38', 'm01.component.source-standard-drawer'],
        componentIds: ['source-standard-drawer'],
        rationale: 'Introduce the GAC flow and source references.',
    },
    {
        slideIndex: 5,
        title: 'Fases GAC e stakeholders',
        kind: 'gac',
        priority: 'alta',
        layout: 'callout-overlay',
        presetIds: [...GAC_PHASE_PRESET_IDS, 'm01.component.source-standard-drawer'],
        componentIds: ['source-standard-drawer'],
        rationale: 'Each visible phase hotspot resolves to a dedicated GAC node with a fallback snapshot.',
    },
    {
        slideIndex: 6,
        title: 'Diagrama GAC DD38',
        kind: 'gac',
        priority: 'alta',
        layout: 'full-stage-demo',
        presetIds: ['m01.gac.flow.dd38', ...GAC_PHASE_PRESET_IDS, 'm01.component.resource-landing'],
        componentIds: ['course-resource-landing'],
        rationale: 'Use the overview diagram plus node-specific phase targets instead of one generic open action.',
    },
    {
        slideIndex: 7,
        title: 'Processo GAC por fases',
        kind: 'gac',
        priority: 'alta',
        layout: 'callout-overlay',
        presetIds: [...GAC_PHASE_PRESET_IDS],
        componentIds: [],
        rationale: 'Map the as-is process into concrete phase nodes: preliminary, confirmatory, classification, remediation, and closeout.',
    },
    {
        slideIndex: 8,
        title: 'Processo GAC por stakeholders',
        kind: 'gac',
        priority: 'media',
        layout: 'split-explain-demo',
        presetIds: [...GAC_PHASE_PRESET_IDS, 'm01.component.source-standard-drawer'],
        componentIds: ['source-standard-drawer'],
        rationale: 'Stakeholder lanes stay tied to phase-specific GAC nodes and source/fallback context.',
    },
    {
        slideIndex: 9,
        title: 'Natureza dos dados GAC',
        kind: 'datastudio',
        priority: 'alta',
        layout: 'full-stage-demo',
        presetIds: ['m01.datastudio.overview', 'm01.files.gac-catalog', 'm01.component.ecosystem-map'],
        componentIds: ['ecosystem-map'],
        rationale: 'Catalog data types against app modules.',
    },
    {
        slideIndex: 10,
        title: 'Aplicativo para coleta',
        kind: 'field-collection',
        priority: 'alta',
        layout: 'center-stage',
        presetIds: ['m01.field.collection'],
        componentIds: [],
        rationale: 'Open local data-entry, sensors, or photo-log equivalents.',
    },
    {
        slideIndex: 11,
        title: 'Dashboard e produto analitico',
        kind: 'dashboard',
        priority: 'alta',
        layout: 'full-stage-demo',
        presetIds: ['m01.dashboard.eis'],
        componentIds: [],
        rationale: 'Use EIS/dashboard/report overlay as the local product.',
    },
    {
        slideIndex: 12,
        title: 'Plataforma consolidada',
        kind: 'simple-component',
        priority: 'media',
        layout: 'center-stage',
        presetIds: ['m01.component.ecosystem-map'],
        componentIds: ['ecosystem-map'],
        rationale: 'Explain how Training links to Files, DataStudio, Pipelines, and Reports.',
    },
    {
        slideIndex: 13,
        title: 'Web mapping e geointeligencia',
        kind: 'plume-interpolation',
        priority: 'alta',
        layout: 'full-stage-demo',
        presetIds: ['m01.map.spatial'],
        componentIds: [],
        rationale: 'Use the Webmap 2D view with class layers instead of a generic map picker.',
    },
    {
        slideIndex: 14,
        title: 'Modelagem 3D e coordenadas',
        kind: 'plume-interpolation',
        priority: 'alta',
        layout: 'full-stage-demo',
        presetIds: ['m01.model3d.plume'],
        componentIds: [],
        rationale: 'Show 3D plume or cross-section fallback.',
    },
    {
        slideIndex: 15,
        title: 'BIM e ativos construidos',
        kind: 'simple-component',
        priority: 'baixa',
        layout: 'center-stage',
        presetIds: ['m01.component.built-asset-card'],
        componentIds: ['built-asset-card'],
        rationale: 'Use a simple asset card and Files fallback instead of promising BIM runtime.',
    },
    {
        slideIndex: 16,
        title: 'Automacao e workflows',
        kind: 'automation',
        priority: 'alta',
        layout: 'center-stage',
        presetIds: ['m01.automation.pipeline'],
        componentIds: [],
        rationale: 'Open a validation workflow template, never a random pipeline.',
    },
    {
        slideIndex: 17,
        title: 'IA e revisao humana',
        kind: 'ai-neural-network',
        priority: 'media',
        layout: 'split-explain-demo',
        presetIds: ['m01.ai.neural-network', 'm01.component.glossary'],
        componentIds: ['glossary-popover'],
        rationale: 'Use the neural network manager with human-review framing and snapshot fallback.',
    },
    {
        slideIndex: 18,
        title: 'Agile e metodologia',
        kind: 'gantt',
        priority: 'alta',
        layout: 'full-stage-demo',
        presetIds: ['m01.agile.gantt'],
        componentIds: [],
        rationale: 'Show the explicit class project Gantt.',
    },
    {
        slideIndex: 19,
        title: 'Ferramentas digitais',
        kind: 'simple-component',
        priority: 'baixa',
        layout: 'static-16x9',
        presetIds: ['m01.component.demo-agenda'],
        componentIds: ['demo-agenda'],
        rationale: 'Use the slide as a demo agenda transition.',
    },
    {
        slideIndex: 20,
        title: 'Dispositivos e sensores',
        kind: 'field-collection',
        priority: 'alta',
        layout: 'callout-overlay',
        presetIds: ['m01.field.collection'],
        componentIds: [],
        rationale: 'Hotspots can open sensor, file, or field-collection context.',
    },
    {
        slideIndex: 21,
        title: 'Alta resolucao espacial e temporal',
        kind: 'field-collection',
        priority: 'alta',
        layout: 'full-stage-demo',
        presetIds: ['m01.field.collection', 'm01.temporal.na.mann-kendall'],
        componentIds: [],
        rationale: 'Bridge sensor ingestion to temporal analysis.',
    },
    {
        slideIndex: 22,
        title: 'Aplicativos de coleta',
        kind: 'field-collection',
        priority: 'alta',
        layout: 'center-stage',
        presetIds: ['m01.field.collection'],
        componentIds: [],
        rationale: 'Use local structured data entry as the app-side equivalent.',
    },
    {
        slideIndex: 23,
        title: 'Gerenciamento de dados',
        kind: 'datastudio',
        priority: 'alta',
        layout: 'split-explain-demo',
        presetIds: ['m01.datastudio.overview'],
        componentIds: [],
        rationale: 'Use Files/DataStudio/SQL flow for data management.',
    },
    {
        slideIndex: 24,
        title: 'Analise de dados',
        kind: 'datastudio',
        priority: 'alta',
        layout: 'full-stage-demo',
        presetIds: ['m01.datastudio.overview', 'm01.map.spatial'],
        componentIds: [],
        rationale: 'Show the analysis module menu without overcommitting external tools.',
    },
    {
        slideIndex: 25,
        title: 'Discussao sobre tratar dados',
        kind: 'simple-component',
        priority: 'media',
        layout: 'center-stage',
        presetIds: ['m01.component.class-poll'],
        componentIds: ['class-poll'],
        rationale: 'Use a local checkpoint question.',
    },
    {
        slideIndex: 26,
        title: 'Tabela transposta e validacao',
        kind: 'cross-tab-validation',
        priority: 'muito-alta',
        layout: 'full-stage-demo',
        presetIds: ['m01.cross.tab.validation', 'm01.automation.pipeline', 'm01.component.source-standard-drawer'],
        componentIds: ['source-standard-drawer'],
        rationale: 'Highest-value validation demo: pivot, legal references, QA/QC.',
    },
    {
        slideIndex: 27,
        title: 'Mapas de plumas e incerteza',
        kind: 'plume-interpolation',
        priority: 'muito-alta',
        layout: 'full-stage-demo',
        presetIds: ['m01.plume.interpolation', 'm01.map.spatial', 'm01.model3d.plume', 'm01.component.source-standard-drawer'],
        componentIds: ['source-standard-drawer'],
        rationale: 'Central plume/interpolation demo with uncertainty framing.',
    },
    {
        slideIndex: 28,
        title: 'Discussao A/B sobre plumas',
        kind: 'plume-interpolation',
        priority: 'alta',
        layout: 'split-explain-demo',
        presetIds: ['m01.plume.interpolation', 'm01.component.reveal-compare', 'm01.component.class-poll'],
        componentIds: ['reveal-compare', 'class-poll'],
        rationale: 'Capture the class guess before revealing evidence.',
    },
    {
        slideIndex: 29,
        title: 'Revelacao e comparacao de plumas',
        kind: 'plume-interpolation',
        priority: 'alta',
        layout: 'split-explain-demo',
        presetIds: ['m01.plume.interpolation', 'm01.component.reveal-compare'],
        componentIds: ['reveal-compare'],
        rationale: 'Compare interpretations against the same plume preset.',
    },
    {
        slideIndex: 30,
        title: 'Serie temporal de NA',
        kind: 'temporal-mann-kendall',
        priority: 'muito-alta',
        layout: 'full-stage-demo',
        presetIds: ['m01.temporal.na.mann-kendall', 'm01.component.class-poll'],
        componentIds: ['class-poll'],
        rationale: 'Use Mann-Kendall/telemetry to discuss sparse versus high-resolution readings.',
    },
    {
        slideIndex: 31,
        title: 'Alta resolucao temporal para decisao',
        kind: 'temporal-mann-kendall',
        priority: 'muito-alta',
        layout: 'full-stage-demo',
        presetIds: ['m01.temporal.na.mann-kendall', 'm01.field.collection', 'm01.plume.interpolation', 'm01.component.reveal-compare'],
        componentIds: ['reveal-compare'],
        rationale: 'Show how sampling timing changes interpretation.',
    },
    {
        slideIndex: 32,
        title: 'Conclusoes e prontidao',
        kind: 'dashboard',
        priority: 'alta',
        layout: 'center-stage',
        presetIds: [
            'm01.dashboard.eis',
            'm01.report.eis.summary',
            'm01.component.glossary',
            'm01.component.source-standard-drawer',
        ],
        componentIds: ['glossary-popover', 'source-standard-drawer'],
        rationale: 'Close with evidence lines, readiness, and report materialization.',
    },
    {
        slideIndex: 33,
        title: 'Obrigado e materiais',
        kind: 'simple-component',
        priority: 'media',
        layout: 'static-16x9',
        presetIds: ['m01.component.resource-landing'],
        componentIds: ['course-resource-landing'],
        rationale: 'Turn the QR/contact slide into course resources.',
    },
];

export const PUC_MODULO01_TRAINING_MODEL: EcbtTeachingModelKey = deepFreeze({
    id: PUC_MODULO01_TRAINING_MODEL_ID,
    slug: PUC_MODULO01_TRAINING_MODEL_SLUG,
    version: PUC_MODULO01_TRAINING_MODEL_VERSION,
    title: 'PUC 2025 Modulo 01 - Gestao de Dados Ambientais',
    locale: 'pt-BR',
    audience: 'both',
    modulePresets: MODULE_PRESETS,
    datasetRefs: DATASET_REFS,
    assetRefs: [...ASSET_REFS],
    requiredCapabilities: [...REQUIRED_CAPABILITIES],
    readiness: {
        status: 'partial',
        missingPresets: [],
        missingAssets: [],
        missingCapabilities: [],
        warnings: [
            {
                code: 'runtime_assets_unverified',
                message: 'Local model fallback ids are declared, but runtime Files/Supabase assets still need resolution.',
            },
            {
                code: 'workspace_adapters_unwired',
                message: 'Training-to-workspace adapters are modeled here; runtime deep links are a separate layer.',
            },
        ],
    },
});

export const PUC_MODULO01_SLIDE_SUGGESTIONS: readonly TrainingSlideSuggestion[] =
    deepFreeze(SLIDE_SUGGESTIONS);

// The plan spans more slides than the reconciled 2026 deck while T1.4 (keep/remove the
// teacher-addition slides) is undecided; validation must accept what the plan actually covers.
export const PUC_MODULO01_PLAN_SLIDE_COUNT: number = PUC_MODULO01_SLIDE_SUGGESTIONS.reduce(
    (max, suggestion) => Math.max(max, suggestion.slideIndex),
    PUC_MODULO01_EXPECTED_SLIDE_COUNT,
);

export function listPucModulo01SuggestionsBySlide(slideIndex?: number): readonly TrainingSlideSuggestion[] {
    if (slideIndex === undefined || slideIndex === null) {
        return PUC_MODULO01_SLIDE_SUGGESTIONS;
    }
    const normalized = normalizeSlideIndex(slideIndex);
    if (normalized === null) return Object.freeze([]);
    return Object.freeze(PUC_MODULO01_SLIDE_SUGGESTIONS.filter((suggestion) => suggestion.slideIndex === normalized));
}

export function getPucModulo01PresetById(
    modelPresetId: string,
    model: EcbtTeachingModelKey = PUC_MODULO01_TRAINING_MODEL,
): TeachingModulePreset | null {
    const id = normalizeString(modelPresetId);
    if (!id) return null;
    return model.modulePresets.find((preset) => preset.id === id) ?? null;
}

export function getPucModulo01PresetsForSlide(
    slideIndex: number,
    model: EcbtTeachingModelKey = PUC_MODULO01_TRAINING_MODEL,
): readonly TeachingModulePreset[] {
    const suggestions = listPucModulo01SuggestionsBySlide(slideIndex);
    if (suggestions.length === 0) return Object.freeze([]);
    const presetMap = buildPresetMap(model);
    const presetIds = unique(suggestions.flatMap((suggestion) => suggestion.presetIds));
    const presets = presetIds
        .map((presetId) => presetMap.get(presetId) ?? null)
        .filter((preset): preset is TeachingModulePreset => preset !== null);
    return Object.freeze(presets);
}

export function validatePucModulo01PresetBinding(
    input: TeachingPresetBindingValidationInput,
    model: EcbtTeachingModelKey = PUC_MODULO01_TRAINING_MODEL,
): TeachingPresetBindingValidation {
    const errors: TeachingPresetBindingIssue[] = [];
    const warnings: TeachingPresetBindingIssue[] = [];
    const slideIndex = normalizeSlideIndex(input?.slideIndex);
    const modelPresetId = normalizeString(input?.modelPresetId);

    if (slideIndex === null) {
        errors.push({
            code: 'slide_index_invalid',
            message: `Slide index must be an integer from 1 to ${PUC_MODULO01_PLAN_SLIDE_COUNT}.`,
        });
    }

    const normalizedSlideIndex = slideIndex ?? 0;
    const suggestions = slideIndex === null ? [] : listPucModulo01SuggestionsBySlide(slideIndex);
    const suggestedPresetIds = unique(suggestions.flatMap((suggestion) => suggestion.presetIds));
    const requiresPreset = input?.requirePreset ?? suggestedPresetIds.length > 0;

    if (!modelPresetId) {
        if (requiresPreset) {
            errors.push({
                code: 'model_preset_id_required',
                message: 'This slide needs an explicit modelPresetId before opening a live module.',
                slideIndex: normalizedSlideIndex,
            });
        }
        return freezeValidation({
            ok: errors.length === 0,
            status: errors.length > 0 ? 'invalid' : warnings.length > 0 ? 'warning' : 'valid',
            slideIndex: normalizedSlideIndex,
            modelPresetId: null,
            fallbackAssetId: normalizeString(input?.fallbackAssetId) || null,
            preset: null,
            errors,
            warnings,
        });
    }

    const preset = getPucModulo01PresetById(modelPresetId, model);
    if (!preset) {
        errors.push({
            code: 'model_preset_not_found',
            message: `modelPresetId "${modelPresetId}" is not present in the teaching model.`,
            slideIndex: normalizedSlideIndex,
            modelPresetId,
        });
    } else {
        if (suggestedPresetIds.length > 0 && !suggestedPresetIds.includes(modelPresetId)) {
            warnings.push({
                code: 'model_preset_not_suggested_for_slide',
                message: `Preset "${modelPresetId}" exists, but is not one of the suggested presets for slide ${normalizedSlideIndex}.`,
                slideIndex: normalizedSlideIndex,
                modelPresetId,
            });
        }

        const stableTargetIssue = validateStableTarget(preset);
        if (stableTargetIssue) {
            errors.push({
                code: stableTargetIssue,
                message: `Preset "${modelPresetId}" does not define enough target data to avoid a default/random module open.`,
                slideIndex: normalizedSlideIndex,
                modelPresetId,
            });
        }
    }

    const fallbackAssetId = normalizeString(input?.fallbackAssetId) || normalizeString(preset?.fallbackAssetId) || null;
    if (!fallbackAssetId) {
        errors.push({
            code: 'fallback_asset_required',
            message: 'Teaching presets need a snapshot/fallback asset id.',
            slideIndex: normalizedSlideIndex,
            modelPresetId,
        });
    } else if (!model.assetRefs.includes(fallbackAssetId)) {
        errors.push({
            code: 'fallback_asset_not_in_model',
            message: `Fallback asset "${fallbackAssetId}" is not declared in the teaching model assetRefs.`,
            slideIndex: normalizedSlideIndex,
            modelPresetId,
        });
    }

    return freezeValidation({
        ok: errors.length === 0,
        status: errors.length > 0 ? 'invalid' : warnings.length > 0 ? 'warning' : 'valid',
        slideIndex: normalizedSlideIndex,
        modelPresetId,
        fallbackAssetId,
        preset,
        errors,
        warnings,
    });
}

export function summarizePucModulo01Readiness(
    model: EcbtTeachingModelKey = PUC_MODULO01_TRAINING_MODEL,
    options: PucModulo01ReadinessOptions = {},
): PucModulo01ReadinessSummary {
    const expectedSlideCount = normalizePositiveInteger(options.expectedSlideCount) ?? PUC_MODULO01_EXPECTED_SLIDE_COUNT;
    const presetMap = buildPresetMap(model);
    const requiredPresetIds = unique(PUC_MODULO01_SLIDE_SUGGESTIONS.flatMap((suggestion) => suggestion.presetIds));
    const missingPresets = requiredPresetIds.filter((presetId) => !presetMap.has(presetId));
    const availableAssets = new Set((options.availableAssetIds ?? model.assetRefs).map((assetId) => normalizeString(assetId)));
    const missingFallbackAssets = unique(
        model.modulePresets
            .map((preset) => normalizeString(preset.fallbackAssetId))
            .filter((assetId) => assetId.length > 0 && !availableAssets.has(assetId)),
    );

    const missingCapabilities = Array.isArray(options.availableCapabilities)
        ? model.requiredCapabilities.filter((capability) => !options.availableCapabilities?.includes(capability))
        : [];

    const validations = PUC_MODULO01_SLIDE_SUGGESTIONS.flatMap((suggestion) =>
        suggestion.presetIds.map((modelPresetId) =>
            validatePucModulo01PresetBinding({ slideIndex: suggestion.slideIndex, modelPresetId }, model),
        ),
    );
    const invalidBindings = validations.filter((validation) => !validation.ok);
    const slideIndexesWithInvalidBindings = new Set(invalidBindings.map((validation) => validation.slideIndex));
    const slideIndexesWithMissingAssets = new Set<number>();

    for (const suggestion of PUC_MODULO01_SLIDE_SUGGESTIONS) {
        for (const presetId of suggestion.presetIds) {
            const fallbackAssetId = presetMap.get(presetId)?.fallbackAssetId;
            if (fallbackAssetId && missingFallbackAssets.includes(fallbackAssetId)) {
                slideIndexesWithMissingAssets.add(suggestion.slideIndex);
            }
        }
    }

    const warnings: TeachingPresetBindingIssue[] = [
        ...model.readiness.warnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
            ...(typeof warning.slideIndex === 'number' ? { slideIndex: warning.slideIndex } : {}),
        })),
        ...validations.flatMap((validation) => validation.warnings),
    ];

    let status: TeachingModelStatus = 'ready';
    if (
        model.id !== PUC_MODULO01_TRAINING_MODEL_ID ||
        model.version !== PUC_MODULO01_TRAINING_MODEL_VERSION ||
        invalidBindings.length > 0
    ) {
        status = 'invalid';
    } else if (missingPresets.length > 0 || missingFallbackAssets.length > 0 || missingCapabilities.length > 0) {
        status = 'missing';
    } else if (warnings.length > 0 || model.readiness.status !== 'ready') {
        status = 'partial';
    }

    const partialSlideIndexes = new Set<number>([
        ...slideIndexesWithInvalidBindings,
        ...slideIndexesWithMissingAssets,
    ]);
    const partialSlides = partialSlideIndexes.size;
    const readySlides = Math.max(0, expectedSlideCount - partialSlides);

    return deepFreeze({
        status,
        modelId: model.id,
        version: model.version,
        expectedSlideCount,
        suggestionCount: PUC_MODULO01_SLIDE_SUGGESTIONS.length,
        presetCount: model.modulePresets.length,
        requiredPresetCount: requiredPresetIds.length,
        readySlides,
        partialSlides,
        missingPresets,
        missingFallbackAssets,
        missingCapabilities,
        invalidBindings,
        warnings,
    });
}

export function isPucModulo01TeachingModelId(id: unknown): boolean {
    return normalizeString(id) === PUC_MODULO01_TRAINING_MODEL_ID;
}

function validateStableTarget(preset: TeachingModulePreset): string | null {
    const target = preset.target;
    switch (target.type) {
        case 'pipeline':
            if (!target.pipelineId && !target.templateId) return 'pipeline_target_unseeded';
            return target.nodeId ? null : 'pipeline_node_unseeded';
        case 'analytics-temporal':
            return target.elementId && target.parameterId && target.method ? null : 'temporal_target_unseeded';
        case 'governance-project':
            return target.projectId && target.view ? null : 'gantt_target_unseeded';
        case 'dom-surface':
            return target.toolId && (target.selector || target.snapshotAssetId) ? null : 'dom_target_unseeded';
        case 'module':
            return target.toolId && (target.panelId || target.payload) ? null : 'module_target_unseeded';
        case 'files':
            return target.fileId || target.filter ? null : 'files_target_unseeded';
        case 'report':
            return target.reportId || target.sectionId ? null : 'report_target_unseeded';
        case 'training-slide':
            return target.courseId && target.slideId ? null : 'training_slide_target_unseeded';
        default:
            return 'target_unknown';
    }
}

function buildPresetMap(model: EcbtTeachingModelKey): Map<string, TeachingModulePreset> {
    return new Map(model.modulePresets.map((preset) => [preset.id, preset]));
}

function normalizeSlideIndex(value: unknown): number | null {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > PUC_MODULO01_PLAN_SLIDE_COUNT) return null;
    return n;
}

function normalizePositiveInteger(value: unknown): number | null {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) return null;
    return n;
}

function normalizeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function unique<T>(items: readonly T[]): T[] {
    return Array.from(new Set(items));
}

function freezeValidation(input: {
    ok: boolean;
    status: 'valid' | 'warning' | 'invalid';
    slideIndex: number;
    modelPresetId: string | null;
    fallbackAssetId: string | null;
    preset: TeachingModulePreset | null;
    errors: TeachingPresetBindingIssue[];
    warnings: TeachingPresetBindingIssue[];
}): TeachingPresetBindingValidation {
    return deepFreeze({
        ok: input.ok,
        status: input.status,
        slideIndex: input.slideIndex,
        modelPresetId: input.modelPresetId,
        fallbackAssetId: input.fallbackAssetId,
        preset: input.preset,
        errors: input.errors,
        warnings: input.warnings,
    });
}

function deepFreeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        const record = value as Record<string, unknown>;
        Object.freeze(value);
        for (const key of Object.keys(record)) {
            const child = record[key];
            if (child && typeof child === 'object') {
                deepFreeze(child);
            }
        }
    }
    return value;
}
