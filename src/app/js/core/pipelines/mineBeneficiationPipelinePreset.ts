// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   MINE BENEFICIATION PIPELINE PRESET - high-level productive flow.

   This manual seed models a generic ROM-to-concentrate beneficiation
   route for class demos and future pipeline customization. It is based
   on public mineral-processing references, but it stays intentionally
   generic: mineralogy, cut sizes, reagents and mass balance must be
   validated before using it as an engineering design.
   ================================================================ */

import type { PipelinePack, PipelinePackEdge, PipelinePackNode, PipelineModuleTarget } from './pipelinePack.js';

export const MINE_BENEFICIATION_PIPELINE_ID = 'mine.beneficiation.flow.high-level';
export const MINE_BENEFICIATION_TEMPLATE_ID = 'mine-beneficiation-rom-to-product';
export const MINE_BENEFICIATION_SELECTED_NODE_ID = 'mine.rom.receiving';
export const MINE_BENEFICIATION_PIPELINE_NAME = 'Beneficiamento mineral - ROM para concentrado e rejeitos';
export const MINE_BENEFICIATION_SOURCE_FILE = 'modelo-referenciado-online';

type MineBeneficiationPipelineModel = {
    readonly name: string;
    readonly presetId: string;
    readonly templateId: string;
    readonly standard: string;
    readonly sourceFile: string;
    readonly sourceFormat: string;
    readonly sourceReferences: readonly Record<string, string>[];
    readonly startNodeId: string;
    readonly selectedNodeId: string;
    readonly lanes: readonly Record<string, unknown>[];
    readonly groups: readonly Record<string, unknown>[];
    readonly nodes: readonly Record<string, unknown>[];
    readonly edges: readonly Record<string, unknown>[];
};

type MineBeneficiationEdgeMeta = {
    readonly conditionRef?: string;
    readonly dataRefs?: readonly string[];
    readonly evidenceRefs?: readonly string[];
    readonly failureBehavior?: PipelinePackEdge['failureBehavior'];
    readonly semanticJustification?: string;
    readonly required?: boolean;
};

type MineBeneficiationEdgeRow = readonly [
    id: string,
    from: string,
    to: string,
    label: string,
    kind?: 'data' | undefined,
    meta?: MineBeneficiationEdgeMeta,
];

const SOURCE_REFERENCES = [
    {
        id: 'metso-basics-minerals-processing',
        title: 'Metso - Basics in Minerals Processing handbook',
        url: 'https://www.metso.com/globalassets/insights/ebooks/mo-basics-in-mineral-processing-handbook_lowres.pdf',
        note: 'Cominuicao, classificacao, concentracao e desaguamento como blocos de processo.',
    },
    {
        id: 'flyability-mineral-processing',
        title: 'Flyability - Essential guide to mineral processing',
        url: 'https://www.flyability.com/blog/mineral-processing',
        note: 'Quatro estagios praticos: britagem/moagem, classificacao, concentracao e desaguamento.',
    },
    {
        id: 'epa-extraction-beneficiation',
        title: 'US EPA - Technical Resource Document: Extraction and Beneficiation of Ores and Minerals',
        url: 'https://nepis.epa.gov/Exe/ZyPURL.cgi?Dockey=2000DYY1.TXT',
        note: 'Contexto regulatorio e operacional de extracao, beneficiamento e rejeitos.',
    },
    {
        id: 'fls-tailings-water',
        title: 'FLS - Tailings management and water stewardship in mining',
        url: 'https://fls.com/en/innovation/tailings-management',
        note: 'Espessamento, filtragem e recuperacao de agua de processo.',
    },
    {
        id: 'cim-mineral-processing-guidelines',
        title: 'CIM - Leading Practice Guidelines for Mineral Processing',
        url: 'https://mrmr.cim.org/media/1159/cim-leading-practice-guidelines-for-mineral-processing-2022.pdf',
        note: 'Geometalurgia, amostragem, testwork, parametros de engenharia e decisao de rota.',
    },
    {
        id: 'metso-mass-balancing',
        title: 'Metso - Mass balancing of concentrator data',
        url: 'https://www.metso.com/insights/blog/mining-and-metals/mass-balancing-of-concentrator-data/',
        note: 'Balanco de massa antes de recuperar indicadores, benchmark e gargalos de planta.',
    },
    {
        id: 'ausimm-process-plant-studies',
        title: 'AusIMM - Guidelines for mineral process plant development studies',
        url: 'https://www.ausimm.com/globalassets/insights-and-resources/minerals-processing-toolbox/guidelines_for_mineral_process_plant-whincup.pdf',
        note: 'Lacunas comuns de estudos: testwork, engenharia, CAPEX/OPEX e comissionamento.',
    },
] as const;

const PARAMS_BASE = {
    presetId: MINE_BENEFICIATION_PIPELINE_ID,
    templateId: MINE_BENEFICIATION_TEMPLATE_ID,
    standard: 'Beneficiamento mineral de alto nivel',
    sourceFile: MINE_BENEFICIATION_SOURCE_FILE,
};

const GATE_CHECKS = {
    oreCalibration: [
        'ore-type',
        'ore-consumption-rate',
        'mineralogy',
        'hardness',
        'head-grade',
        'moisture',
        'clay-slimes',
        'deleterious-elements',
    ],
    classification: ['granulometry', 'target-p80', 'liberation-size', 'circulating-load', 'overgrinding-risk'],
    reagent: ['reagents', 'ore-type', 'water-quality', 'pH', 'Eh', 'solids-percent', 'residence-time'],
    separationRoute: ['ore-type', 'mineralogy', 'liberation-size', 'density-contrast', 'magnetic-response', 'floatability'],
    gradeRecovery: ['recovery', 'head-grade', 'concentrate-grade', 'tailings-grade', 'mass-pull', 'deleterious-elements'],
    tailingsRoute: [
        'tailings-route',
        'tailings-volume',
        'solids-percent',
        'geotechnical-risk',
        'water-recovery',
        'water-recovered',
        'license-constraint',
    ],
    waterEnergy: [
        'water',
        'water-make-up',
        'water-recycle',
        'energy',
        'kwh-per-ton',
        'pump-capacity',
        'reagent-water-quality',
        'critical-supplies',
    ],
    massBalance: [
        'mass-balance',
        'ore-consumption-rate',
        'feed-tonnage',
        'concentrate-tonnage',
        'tailings-tonnage',
        'moisture',
        'density',
        'recovery',
    ],
} as const;

function params(
    nodeId: string,
    phase: string,
    lane: string,
    modulePurpose: string,
    extra: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        ...PARAMS_BASE,
        nodeId,
        phase,
        lane,
        modulePurpose,
        fallbackText: `Manter o usuario no fluxo e mostrar resumo produtivo de ${modulePurpose}.`,
        ...extra,
    };
}

const LANES = [
    { label: 'Mina e ROM', y: 0, h: 140 },
    { label: 'Britagem e moagem', y: 140, h: 170 },
    { label: 'Separacao mineral', y: 310, h: 210 },
    { label: 'Agua, rejeitos e utilidades', y: 520, h: 160 },
    { label: 'Qualidade, controle e ESG', y: 680, h: 160 },
] as const;

const GROUPS = [
    { label: 'Alimentacao ROM', x: 0, y: 0, w: 260, h: 840 },
    { label: 'Cominuicao', x: 260, y: 0, w: 520, h: 840 },
    { label: 'Classificacao', x: 780, y: 0, w: 260, h: 840 },
    { label: 'Concentracao', x: 1040, y: 0, w: 780, h: 840 },
    { label: 'Desaguamento', x: 1820, y: 0, w: 520, h: 840 },
    { label: 'Produto e rejeitos', x: 2340, y: 0, w: 720, h: 840 },
] as const;

const NODES = [
    {
        id: 'mine.start',
        type: 'trigger',
        label: 'Inicio: ROM liberado',
        x: 40,
        y: 46,
        w: 140,
        h: 46,
        color: '#22c55e',
        lane: 'Mina e ROM',
        phase: 'Alimentacao ROM',
        contextLabel: 'Inicio operacional: minerio ROM liberado pela mina para beneficiamento',
        semanticRole: 'start-event',
        targetModule: 'files',
        moduleInputParams: params('mine.start', 'Alimentacao ROM', 'Mina e ROM', 'plano de lavra e liberacao de ROM', {
            documentType: 'rom-release',
        }),
    },
    {
        id: 'mine.rom.receiving',
        type: 'action',
        label: 'Receber ROM',
        x: 300,
        y: 42,
        w: 150,
        h: 54,
        color: '#3b82f6',
        lane: 'Mina e ROM',
        phase: 'Alimentacao ROM',
        contextLabel: 'Balanca, amostragem inicial, umidade e reconciliacao mina-planta',
        semanticRole: 'rom-receiving',
        targetModule: 'datastudio',
        moduleInputParams: params('mine.rom.receiving', 'Alimentacao ROM', 'Mina e ROM', 'entrada ROM, tonelagem, teor e umidade', {
            dataset: 'rom-feed',
            projectDataBindings: [
                {
                    id: 'mine-project-data-ore-consumption-rate',
                    parameterId: 'ore-consumption-rate',
                    label: 'Taxa de consumo de minerio no ROM',
                    value: '',
                    unit: 't/h',
                    basis: 'alimentacao ROM por turno',
                    valueKind: 'rate',
                    status: 'empty',
                    observationLink: {
                        observationId: 'obs-rom-feed-rate',
                        label: 'Observacao da taxa ROM',
                        sourceModuleId: 'observations',
                        status: 'missing',
                    },
                },
            ],
        }),
    },
    {
        id: 'mine.rom.stockpile',
        type: 'data_store',
        label: 'Pilha ROM',
        x: 500,
        y: 42,
        w: 150,
        h: 58,
        color: '#c0c000',
        lane: 'Mina e ROM',
        phase: 'Alimentacao ROM',
        contextLabel: 'Homogeneizacao, blending e controle de variabilidade do ROM',
        semanticRole: 'stockpile',
        targetModule: 'libraries',
        moduleInputParams: params('mine.rom.stockpile', 'Alimentacao ROM', 'Mina e ROM', 'biblioteca de pilhas, blocos e campanhas de ROM', {
            libraryType: 'ore-stockpile',
        }),
    },
    {
        id: 'mine.ore.calibration',
        type: 'condition',
        label: 'Minerio calibrado?',
        x: 700,
        y: 38,
        w: 166,
        h: 74,
        color: '#ff9800',
        lane: 'Mina e ROM',
        phase: 'Alimentacao ROM',
        contextLabel: 'Dominio geometalurgico, dureza, teor, argila, umidade e contaminantes calibrados antes da planta',
        semanticRole: 'ore-calibration-decision',
        targetModule: 'datastudio',
        moduleInputParams: params('mine.ore.calibration', 'Alimentacao ROM', 'Mina e ROM', 'calibracao de minerio por dominio geometalurgico', {
            dataset: 'ore-calibration',
            requiredInputs: GATE_CHECKS.oreCalibration,
            conditionalChecks: GATE_CHECKS.oreCalibration,
            oreSpecificDecision: true,
        }),
    },
    {
        id: 'mine.blend.adjustment',
        type: 'action',
        label: 'Ajustar blend/campanha',
        x: 910,
        y: 42,
        w: 190,
        h: 58,
        color: '#3b82f6',
        lane: 'Mina e ROM',
        phase: 'Alimentacao ROM',
        contextLabel: 'Ajuste de mistura, pilha ou campanha quando a alimentacao muda de dominio mineral',
        semanticRole: 'blend-campaign-adjustment',
        targetModule: 'libraries',
        moduleInputParams: params('mine.blend.adjustment', 'Alimentacao ROM', 'Mina e ROM', 'receitas de blend, dominios de minerio e campanhas de planta', {
            libraryType: 'ore-blend-recipe',
        }),
    },
    {
        id: 'mine.primary.crushing',
        type: 'action',
        label: 'Britagem primaria',
        x: 300,
        y: 186,
        w: 158,
        h: 56,
        color: '#3b82f6',
        lane: 'Britagem e moagem',
        phase: 'Cominuicao',
        contextLabel: 'Reducao inicial do ROM por britador primario',
        semanticRole: 'primary-crushing',
        targetModule: 'sensors',
        moduleInputParams: params('mine.primary.crushing', 'Cominuicao', 'Britagem e moagem', 'telemetria de britador primario', {
            equipment: 'primary-crusher',
        }),
    },
    {
        id: 'mine.scalping.screen',
        type: 'action',
        label: 'Peneiramento scalper',
        x: 500,
        y: 186,
        w: 170,
        h: 56,
        color: '#3b82f6',
        lane: 'Britagem e moagem',
        phase: 'Cominuicao',
        contextLabel: 'Remocao de finos e protecao do circuito de britagem secundaria',
        semanticRole: 'scalping-screen',
        targetModule: 'sensors',
        moduleInputParams: params('mine.scalping.screen', 'Cominuicao', 'Britagem e moagem', 'peneira scalper, carga circulante e oversize', {
            equipment: 'scalping-screen',
        }),
    },
    {
        id: 'mine.secondary.crushing',
        type: 'action',
        label: 'Britagem secundaria/terciaria',
        x: 700,
        y: 186,
        w: 198,
        h: 56,
        color: '#3b82f6',
        lane: 'Britagem e moagem',
        phase: 'Cominuicao',
        contextLabel: 'Ajuste granulometrico antes da moagem',
        semanticRole: 'secondary-crushing',
        targetModule: 'sensors',
        moduleInputParams: params('mine.secondary.crushing', 'Cominuicao', 'Britagem e moagem', 'britagem secundaria e terciaria', {
            equipment: 'secondary-crushers',
        }),
    },
    {
        id: 'mine.crushed.ore.silo',
        type: 'data_store',
        label: 'Silo de minerio britado',
        x: 930,
        y: 186,
        w: 178,
        h: 58,
        color: '#c0c000',
        lane: 'Britagem e moagem',
        phase: 'Cominuicao',
        contextLabel: 'Pulmao de alimentacao para moagem e controle de taxa',
        semanticRole: 'crushed-ore-buffer',
        targetModule: 'datastudio',
        moduleInputParams: params('mine.crushed.ore.silo', 'Cominuicao', 'Britagem e moagem', 'inventario do silo de minerio britado', {
            dataset: 'crushed-ore-silo',
        }),
    },
    {
        id: 'mine.grinding',
        type: 'action',
        label: 'Moagem SAG/bolas',
        x: 1160,
        y: 186,
        w: 166,
        h: 56,
        color: '#3b82f6',
        lane: 'Britagem e moagem',
        phase: 'Cominuicao',
        contextLabel: 'Liberacao mineral por moagem SAG, bolas ou circuito equivalente',
        semanticRole: 'grinding',
        targetModule: 'sensors',
        moduleInputParams: params('mine.grinding', 'Cominuicao', 'Britagem e moagem', 'circuito de moagem e consumo energetico', {
            equipment: 'grinding-circuit',
        }),
    },
    {
        id: 'mine.classification',
        type: 'condition',
        label: 'P80 liberado?',
        x: 1390,
        y: 180,
        w: 132,
        h: 76,
        color: '#ff9800',
        lane: 'Britagem e moagem',
        phase: 'Classificacao',
        contextLabel: 'Decisao de granulometria alvo: liberar mineral sem moer demais',
        semanticRole: 'classification-decision',
        targetModule: 'datastudio',
        moduleInputParams: params('mine.classification', 'Classificacao', 'Britagem e moagem', 'curva granulometrica, P80 e carga circulante', {
            dataset: 'classification-p80',
            targetP80Um: 'calibrar-por-minerio',
            requiredInputs: GATE_CHECKS.classification,
            conditionalChecks: GATE_CHECKS.classification,
            watchouts: ['overgrinding', 'slimes-generation', 'liberation-size'],
        }),
    },
    {
        id: 'mine.regrind',
        type: 'action',
        label: 'Remoagem',
        x: 1390,
        y: 312,
        w: 132,
        h: 50,
        color: '#3b82f6',
        lane: 'Separacao mineral',
        phase: 'Classificacao',
        contextLabel: 'Retorno de particulas grossas ou baixo grau de liberacao',
        semanticRole: 'regrind',
        targetModule: 'sensors',
        moduleInputParams: params('mine.regrind', 'Classificacao', 'Separacao mineral', 'remoagem e ajuste de liberacao', {
            equipment: 'regrind-mill',
        }),
    },
    {
        id: 'mine.conditioning',
        type: 'action',
        label: 'Condicionamento',
        x: 1600,
        y: 340,
        w: 164,
        h: 52,
        color: '#3b82f6',
        lane: 'Separacao mineral',
        phase: 'Concentracao',
        contextLabel: 'Ajuste de pH, densidade de polpa e reagentes antes da separacao',
        semanticRole: 'conditioning',
        targetModule: 'sensors',
        moduleInputParams: params('mine.conditioning', 'Concentracao', 'Separacao mineral', 'condicionamento de polpa e reagentes', {
            equipment: 'conditioning-tanks',
            controls: ['pH', 'Eh', 'percent-solids', 'collector-dose', 'frother-dose', 'depressant-dose'],
        }),
    },
    {
        id: 'mine.reagent.decision',
        type: 'condition',
        label: 'Reagentes/pH OK?',
        x: 1785,
        y: 312,
        w: 150,
        h: 78,
        color: '#ff9800',
        lane: 'Separacao mineral',
        phase: 'Concentracao',
        contextLabel: 'Confere suite de reagentes, pH, Eh, densidade de polpa e tempo de residencia antes da separacao',
        semanticRole: 'reagent-ph-decision',
        targetModule: 'sensors',
        moduleInputParams: params('mine.reagent.decision', 'Concentracao', 'Separacao mineral', 'controle de reagentes, pH e condicoes de polpa', {
            equipment: 'reagent-dosing',
            requiredInputs: GATE_CHECKS.reagent,
            conditionalChecks: GATE_CHECKS.reagent,
        }),
    },
    {
        id: 'mine.reagent.adjustment',
        type: 'action',
        label: 'Ajustar reagentes',
        x: 1785,
        y: 500,
        w: 150,
        h: 54,
        color: '#3b82f6',
        lane: 'Agua, rejeitos e utilidades',
        phase: 'Concentracao',
        contextLabel: 'Ajuste de dosagem, agua de processo, pH e tempo de condicionamento quando a resposta metalurgica degrada',
        semanticRole: 'reagent-adjustment-loop',
        targetModule: 'sensors',
        moduleInputParams: params('mine.reagent.adjustment', 'Concentracao', 'Agua, rejeitos e utilidades', 'ajuste operacional de reagentes e qualidade da agua', {
            equipment: 'reagent-skid',
        }),
    },
    {
        id: 'mine.separation.route',
        type: 'condition',
        label: 'Rota de separacao?',
        x: 1600,
        y: 430,
        w: 172,
        h: 76,
        color: '#ff9800',
        lane: 'Separacao mineral',
        phase: 'Concentracao',
        contextLabel: 'Escolha condicional da rota principal conforme mineralogia: gravimetria/DMS, magnetica, flotacao ou combinacao',
        semanticRole: 'separation-route-decision',
        targetModule: 'libraries',
        moduleInputParams: params('mine.separation.route', 'Concentracao', 'Separacao mineral', 'matriz de decisao para rota de separacao mineral', {
            libraryType: 'beneficiation-route-decision',
            options: ['gravity-dms', 'magnetic-separation', 'flotation', 'combined-route'],
            requiredInputs: GATE_CHECKS.separationRoute,
            conditionalChecks: GATE_CHECKS.separationRoute,
        }),
    },
    {
        id: 'mine.gravity.dms',
        type: 'action',
        label: 'Pre-concentracao gravimetrica/DMS',
        x: 1810,
        y: 430,
        w: 220,
        h: 60,
        color: '#3b82f6',
        lane: 'Separacao mineral',
        phase: 'Concentracao',
        contextLabel: 'Opcao para reduzir massa antes da flotacao ou separacao principal',
        semanticRole: 'gravity-or-dms',
        targetModule: 'datastudio',
        moduleInputParams: params('mine.gravity.dms', 'Concentracao', 'Separacao mineral', 'pre-concentracao por densidade ou gravidade', {
            dataset: 'gravity-dms',
        }),
    },
    {
        id: 'mine.magnetic',
        type: 'action',
        label: 'Separacao magnetica',
        x: 2060,
        y: 340,
        w: 172,
        h: 52,
        color: '#3b82f6',
        lane: 'Separacao mineral',
        phase: 'Concentracao',
        contextLabel: 'Separacao magnetica quando a mineralogia justificar',
        semanticRole: 'magnetic-separation',
        targetModule: 'sensors',
        moduleInputParams: params('mine.magnetic', 'Concentracao', 'Separacao mineral', 'separador magnetico e qualidade do produto intermediario', {
            equipment: 'magnetic-separator',
        }),
    },
    {
        id: 'mine.flotation.rougher',
        type: 'action',
        label: 'Flotacao rougher/scavenger',
        x: 2060,
        y: 430,
        w: 205,
        h: 60,
        color: '#3b82f6',
        lane: 'Separacao mineral',
        phase: 'Concentracao',
        contextLabel: 'Concentracao por flotacao: recuperar mineral util para limpeza posterior',
        semanticRole: 'rougher-scavenger-flotation',
        targetModule: 'sensors',
        moduleInputParams: params('mine.flotation.rougher', 'Concentracao', 'Separacao mineral', 'flotacao rougher e scavenger', {
            equipment: 'rougher-scavenger-cells',
        }),
    },
    {
        id: 'mine.cleaner',
        type: 'action',
        label: 'Limpeza do concentrado',
        x: 2320,
        y: 390,
        w: 178,
        h: 56,
        color: '#3b82f6',
        lane: 'Separacao mineral',
        phase: 'Concentracao',
        contextLabel: 'Etapas cleaner para elevar teor com perda controlada de recuperacao',
        semanticRole: 'cleaner-flotation',
        targetModule: 'sensors',
        moduleInputParams: params('mine.cleaner', 'Concentracao', 'Separacao mineral', 'limpeza do concentrado e recuperacao metalurgica', {
            equipment: 'cleaner-cells',
        }),
    },
    {
        id: 'mine.grade.decision',
        type: 'condition',
        label: 'Teor e recuperacao OK?',
        x: 2540,
        y: 382,
        w: 152,
        h: 80,
        color: '#ff9800',
        lane: 'Separacao mineral',
        phase: 'Concentracao',
        contextLabel: 'Decisao operacional: teor, recuperacao, massa e impurezas dentro da meta',
        semanticRole: 'grade-recovery-decision',
        targetModule: 'datastudio',
        moduleInputParams: params('mine.grade.decision', 'Concentracao', 'Separacao mineral', 'teor, recuperacao e balanco metalurgico', {
            dataset: 'metallurgical-balance',
            requiredInputs: GATE_CHECKS.gradeRecovery,
            conditionalChecks: GATE_CHECKS.gradeRecovery,
        }),
    },
    {
        id: 'mine.concentrate.thickener',
        type: 'action',
        label: 'Espessamento do concentrado',
        x: 2760,
        y: 360,
        w: 198,
        h: 56,
        color: '#3b82f6',
        lane: 'Separacao mineral',
        phase: 'Desaguamento',
        contextLabel: 'Retirada de agua antes da filtragem ou transporte',
        semanticRole: 'concentrate-thickening',
        targetModule: 'sensors',
        moduleInputParams: params('mine.concentrate.thickener', 'Desaguamento', 'Separacao mineral', 'espessador de concentrado', {
            equipment: 'concentrate-thickener',
        }),
    },
    {
        id: 'mine.concentrate.filter',
        type: 'action',
        label: 'Filtragem/secagem',
        x: 2990,
        y: 360,
        w: 164,
        h: 56,
        color: '#3b82f6',
        lane: 'Separacao mineral',
        phase: 'Desaguamento',
        contextLabel: 'Ajuste de umidade para expedicao ou etapa seguinte',
        semanticRole: 'concentrate-filtration',
        targetModule: 'sensors',
        moduleInputParams: params('mine.concentrate.filter', 'Desaguamento', 'Separacao mineral', 'filtragem e umidade do concentrado', {
            equipment: 'concentrate-filter',
        }),
    },
    {
        id: 'mine.product.stockpile',
        type: 'data_store',
        label: 'Estoque/embarque de concentrado',
        x: 3200,
        y: 360,
        w: 216,
        h: 60,
        color: '#c0c000',
        lane: 'Separacao mineral',
        phase: 'Produto e rejeitos',
        contextLabel: 'Produto final, expedicao, qualidade e rastreabilidade por lote',
        semanticRole: 'product-stockpile',
        targetModule: 'reports',
        moduleInputParams: params('mine.product.stockpile', 'Produto e rejeitos', 'Separacao mineral', 'produto final e expedicao de concentrado', {
            reportType: 'product-shipment',
        }),
    },
    {
        id: 'mine.tailings.thickener',
        type: 'action',
        label: 'Espessamento de rejeitos',
        x: 2320,
        y: 560,
        w: 186,
        h: 56,
        color: '#3b82f6',
        lane: 'Agua, rejeitos e utilidades',
        phase: 'Desaguamento',
        contextLabel: 'Concentracao de solidos e reducao de agua no rejeito',
        semanticRole: 'tailings-thickening',
        targetModule: 'sensors',
        moduleInputParams: params('mine.tailings.thickener', 'Desaguamento', 'Agua, rejeitos e utilidades', 'espessador de rejeitos', {
            equipment: 'tailings-thickener',
        }),
    },
    {
        id: 'mine.water.recovery',
        type: 'action',
        label: 'Recuperar agua de processo',
        x: 2540,
        y: 560,
        w: 198,
        h: 56,
        color: '#3b82f6',
        lane: 'Agua, rejeitos e utilidades',
        phase: 'Desaguamento',
        contextLabel: 'Overflow de espessadores, retorno ao tanque de agua de processo',
        semanticRole: 'water-recovery',
        targetModule: 'datastudio',
        moduleInputParams: params('mine.water.recovery', 'Desaguamento', 'Agua, rejeitos e utilidades', 'recuperacao e recirculacao de agua', {
            dataset: 'water-recovery',
        }),
    },
    {
        id: 'mine.tailings.disposal',
        type: 'data_store',
        label: 'Barragem, pasta ou empilhamento seco',
        x: 2990,
        y: 560,
        w: 226,
        h: 60,
        color: '#c0c000',
        lane: 'Agua, rejeitos e utilidades',
        phase: 'Produto e rejeitos',
        contextLabel: 'Destino de rejeitos conforme geotecnia, licenca e estrategia de agua',
        semanticRole: 'tailings-disposal',
        targetModule: 'governance',
        moduleInputParams: params('mine.tailings.disposal', 'Produto e rejeitos', 'Agua, rejeitos e utilidades', 'governanca de rejeitos e riscos geotecnicos', {
            governanceTopic: 'tailings',
        }),
    },
    {
        id: 'mine.tailings.route.decision',
        type: 'condition',
        label: 'Rota de rejeitos definida?',
        x: 2760,
        y: 540,
        w: 178,
        h: 78,
        color: '#ff9800',
        lane: 'Agua, rejeitos e utilidades',
        phase: 'Produto e rejeitos',
        contextLabel: 'Escolha entre polpa, pasta, filtrado/empilhamento seco, barragem, backfill ou reprocessamento, com agua recuperada, espessamento, filtragem e disposicao final registrados',
        semanticRole: 'tailings-route-decision',
        targetModule: 'governance',
        moduleInputParams: params('mine.tailings.route.decision', 'Produto e rejeitos', 'Agua, rejeitos e utilidades', 'decisao de rota de rejeitos, agua recuperada, espessamento, filtragem e disposicao final', {
            governanceTopic: 'tailings-route',
            options: ['slurry-tailings', 'paste-tailings', 'filtered-dry-stack', 'backfill', 'reprocessing'],
            requiredInputs: GATE_CHECKS.tailingsRoute,
            conditionalChecks: GATE_CHECKS.tailingsRoute,
            projectDataBindings: [
                {
                    id: 'mine-project-data-tailings-route',
                    parameterId: 'tailings-route',
                    label: 'Rota de rejeitos escolhida',
                    value: '',
                    /** Categorico: 'barragem'|'pasta'|'filtrado'|'empilhamento seco'|'backfill'|'reprocessamento'|'outro'. */
                    unit: 'categorico',
                    basis: 'destino final aprovado para o rejeito da campanha',
                    valueKind: 'selection',
                    status: 'empty',
                },
                {
                    id: 'mine-project-data-water-recovered',
                    parameterId: 'water-recovered',
                    label: 'Agua recuperada do rejeito',
                    value: '',
                    /** Unidade de medida: m3/h (agua recuperada apos espessamento/filtragem do rejeito). */
                    unit: 'm3/h',
                    basis: 'overflow do espessador de rejeitos e filtrado devolvidos ao processo',
                    valueKind: 'water',
                    status: 'empty',
                },
                {
                    id: 'mine-project-data-tailings-thickening',
                    parameterId: 'water-recovered',
                    label: 'Espessamento de rejeitos',
                    value: '',
                    /** Unidade de medida: % (percentual de solidos no underflow do espessador). */
                    unit: '%',
                    basis: 'percentual de solidos no underflow do espessador de rejeitos',
                    valueKind: 'percentage',
                    status: 'empty',
                },
                {
                    id: 'mine-project-data-tailings-filtration',
                    parameterId: 'water-recovered',
                    label: 'Filtragem de rejeitos',
                    value: '',
                    /** Unidade de medida: % (umidade da torta filtrada de rejeitos). */
                    unit: '%',
                    basis: 'umidade da torta apos filtragem, quando a rota exigir empilhamento seco',
                    valueKind: 'percentage',
                    status: 'empty',
                },
                {
                    id: 'mine-project-data-tailings-disposal',
                    parameterId: 'tailings-route',
                    label: 'Disposicao final do rejeito',
                    value: '',
                    /** Categorico: 'barragem'|'pilha seca'|'coprocessamento'|'outro'. */
                    unit: 'categorico',
                    basis: 'destino de disposicao licenciado para o rejeito desaguado',
                    valueKind: 'selection',
                    status: 'empty',
                },
            ],
        }),
    },
    {
        id: 'mine.tailings.route.selection',
        type: 'action',
        label: 'Selecionar rota de rejeitos',
        x: 2760,
        y: 636,
        w: 190,
        h: 54,
        color: '#3b82f6',
        lane: 'Agua, rejeitos e utilidades',
        phase: 'Produto e rejeitos',
        contextLabel: 'Comparar licenca, estabilidade geotecnica, agua recuperada, CAPEX/OPEX e risco de longo prazo',
        semanticRole: 'tailings-route-selection',
        targetModule: 'governance',
        moduleInputParams: params('mine.tailings.route.selection', 'Produto e rejeitos', 'Agua, rejeitos e utilidades', 'avaliacao comparativa de alternativas de rejeitos', {
            governanceTopic: 'tailings-alternatives',
        }),
    },
    {
        id: 'mine.water.return',
        type: 'action',
        label: 'Retorno de agua',
        x: 3200,
        y: 560,
        w: 150,
        h: 50,
        color: '#3b82f6',
        lane: 'Agua, rejeitos e utilidades',
        phase: 'Desaguamento',
        contextLabel: 'Agua recuperada volta para moagem, classificacao ou flotacao',
        semanticRole: 'water-return',
        targetModule: 'datastudio',
        moduleInputParams: params('mine.water.return', 'Desaguamento', 'Agua, rejeitos e utilidades', 'retorno de agua para o processo', {
            dataset: 'process-water-loop',
        }),
    },
    {
        id: 'mine.water.energy.decision',
        type: 'condition',
        label: 'Agua/energia OK?',
        x: 3200,
        y: 638,
        w: 154,
        h: 76,
        color: '#ff9800',
        lane: 'Agua, rejeitos e utilidades',
        phase: 'Controle',
        contextLabel: 'Valida consumo especifico de agua, energia, recirculacao, insumos criticos e gargalos de utilidades antes de fechar o ciclo',
        semanticRole: 'water-energy-decision',
        targetModule: 'datastudio',
        moduleInputParams: params('mine.water.energy.decision', 'Controle', 'Agua, rejeitos e utilidades', 'balanco de agua, energia especifica, insumos criticos e utilidades da planta', {
            dataset: 'water-energy-balance',
            requiredInputs: GATE_CHECKS.waterEnergy,
            conditionalChecks: GATE_CHECKS.waterEnergy,
            projectDataBindings: [
                {
                    id: 'mine-project-data-water-consumption',
                    parameterId: 'water',
                    label: 'Consumo de agua de processo',
                    value: '',
                    /** Unidade de medida: m3/h (vazao de agua de processo). */
                    unit: 'm3/h',
                    basis: 'consumo especifico por etapa de beneficiamento',
                    valueKind: 'water',
                    status: 'empty',
                },
                {
                    id: 'mine-project-data-energy-consumption',
                    parameterId: 'energy',
                    label: 'Consumo especifico de energia',
                    value: '',
                    /** Unidade de medida: kWh/t (energia por tonelada processada). */
                    unit: 'kWh/t',
                    basis: 'consumo especifico por etapa de beneficiamento',
                    valueKind: 'energy',
                    status: 'empty',
                },
                {
                    id: 'mine-project-data-reagent-consumption',
                    parameterId: 'reagents',
                    label: 'Consumo de reagentes',
                    value: '',
                    /** Unidade de medida: g/t (grama de reagente por tonelada de minerio). */
                    unit: 'g/t',
                    basis: 'dosagem por etapa de condicionamento/flotacao',
                    valueKind: 'list',
                    status: 'empty',
                },
                {
                    id: 'mine-project-data-critical-supplies',
                    parameterId: 'critical-supplies',
                    label: 'Insumos criticos (corpos moedores, revestimentos, floculante, cal, combustivel)',
                    value: '',
                    /** Unidade de medida: un/t (unidades ou massa de insumo por tonelada processada). */
                    unit: 'un/t',
                    basis: 'consumo/estoque minimo por insumo critico de planta',
                    valueKind: 'list',
                    status: 'empty',
                },
            ],
        }),
    },
    {
        id: 'mine.water.energy.adjustment',
        type: 'action',
        label: 'Ajustar utilidades',
        x: 3380,
        y: 640,
        w: 156,
        h: 54,
        color: '#3b82f6',
        lane: 'Agua, rejeitos e utilidades',
        phase: 'Controle',
        contextLabel: 'Ajuste de recirculacao, make-up water, bombas, moagem, energia e reposicao de insumos criticos quando o consumo sai da meta',
        semanticRole: 'water-energy-adjustment',
        targetModule: 'datastudio',
        moduleInputParams: params('mine.water.energy.adjustment', 'Controle', 'Agua, rejeitos e utilidades', 'acoes de otimizacao de agua, energia e insumos criticos', {
            dataset: 'utilities-action-plan',
        }),
    },
    {
        id: 'mine.sampling',
        type: 'action',
        label: 'Amostragem e laboratorio',
        x: 930,
        y: 720,
        w: 190,
        h: 54,
        color: '#3b82f6',
        lane: 'Qualidade, controle e ESG',
        phase: 'Qualidade',
        contextLabel: 'Amostras de ROM, produto intermediario, concentrado e rejeitos',
        semanticRole: 'sampling-lab',
        targetModule: 'files',
        moduleInputParams: params('mine.sampling', 'Qualidade', 'Qualidade, controle e ESG', 'cadeia de custodia e boletins de laboratorio', {
            documentType: 'lab-results',
        }),
    },
    {
        id: 'mine.mass.balance',
        type: 'action',
        label: 'Balanco de massa e metalurgico',
        x: 1160,
        y: 720,
        w: 210,
        h: 54,
        color: '#3b82f6',
        lane: 'Qualidade, controle e ESG',
        phase: 'Qualidade',
        contextLabel: 'Reconciliacao de massa, teor, recuperacao e perdas',
        semanticRole: 'mass-balance',
        targetModule: 'datastudio',
        moduleInputParams: params('mine.mass.balance', 'Qualidade', 'Qualidade, controle e ESG', 'balanco de massa e metalurgico', {
            dataset: 'mass-balance',
            requiredInputs: ['feed-tonnage', 'head-grade', 'concentrate-grade', 'tailings-grade', 'moisture', 'density'],
        }),
    },
    {
        id: 'mine.mass.balance.decision',
        type: 'condition',
        label: 'Balanco fechado?',
        x: 1400,
        y: 700,
        w: 152,
        h: 76,
        color: '#ff9800',
        lane: 'Qualidade, controle e ESG',
        phase: 'Qualidade',
        contextLabel: 'Valida se massas, teores, recuperacoes e perdas fecham dentro da tolerancia antes de publicar KPI',
        semanticRole: 'mass-balance-decision',
        targetModule: 'datastudio',
        moduleInputParams: params('mine.mass.balance.decision', 'Qualidade', 'Qualidade, controle e ESG', 'validacao de balanco de massa e recuperacao', {
            dataset: 'mass-balance-closure',
            tolerance: 'calibrar-por-planta',
            requiredInputs: GATE_CHECKS.massBalance,
            conditionalChecks: GATE_CHECKS.massBalance,
        }),
    },
    {
        id: 'mine.control.room',
        type: 'action',
        label: 'Sala de controle e KPIs',
        x: 1640,
        y: 720,
        w: 190,
        h: 54,
        color: '#3b82f6',
        lane: 'Qualidade, controle e ESG',
        phase: 'Controle',
        contextLabel: 'Taxa, recuperacao, teor, energia, agua e disponibilidade',
        semanticRole: 'control-room-kpis',
        targetModule: 'datastudio',
        moduleInputParams: params('mine.control.room', 'Controle', 'Qualidade, controle e ESG', 'painel de KPIs da planta', {
            dataset: 'plant-kpis',
        }),
    },
    {
        id: 'mine.maintenance.plan',
        type: 'action',
        label: 'Plano de manutencao e paradas',
        x: 1880,
        y: 720,
        w: 210,
        h: 54,
        color: '#3b82f6',
        lane: 'Qualidade, controle e ESG',
        phase: 'Controle',
        contextLabel: 'Disponibilidade fisica, manutencao preventiva e janelas de parada',
        semanticRole: 'maintenance-planning',
        targetModule: 'reports',
        moduleInputParams: params('mine.maintenance.plan', 'Controle', 'Qualidade, controle e ESG', 'cronograma de manutencao e paradas', {
            reportType: 'maintenance-schedule',
        }),
    },
    {
        id: 'mine.esg.reporting',
        type: 'action',
        label: 'Indicadores agua, energia e rejeitos',
        x: 2120,
        y: 720,
        w: 228,
        h: 54,
        color: '#3b82f6',
        lane: 'Qualidade, controle e ESG',
        phase: 'ESG',
        contextLabel: 'Consumo especifico de agua/energia, geracao de rejeitos e indicadores regulatorios',
        semanticRole: 'esg-reporting',
        targetModule: 'reports',
        moduleInputParams: params('mine.esg.reporting', 'ESG', 'Qualidade, controle e ESG', 'relatorio de agua, energia, rejeitos e ESG', {
            reportType: 'esg-mining',
        }),
    },
    {
        id: 'mine.end',
        type: 'end',
        label: 'Fim: produto expedido',
        x: 3450,
        y: 366,
        w: 150,
        h: 54,
        color: '#ff6b6b',
        lane: 'Separacao mineral',
        phase: 'Produto e rejeitos',
        contextLabel: 'Concentrado expedido e rejeitos/agua sob controle operacional',
        semanticRole: 'end-event',
    },
] as const;

const EDGES: readonly MineBeneficiationEdgeRow[] = [
    ['mine.edge.001', 'mine.start', 'mine.rom.receiving', 'liberar ROM'],
    ['mine.edge.002', 'mine.rom.receiving', 'mine.rom.stockpile', 'alimentar pilha'],
    ['mine.edge.003', 'mine.rom.stockpile', 'mine.ore.calibration', 'alimentacao candidata'],
    ['mine.edge.004', 'mine.ore.calibration', 'mine.primary.crushing', 'sim: minerio calibrado', undefined, {
        conditionRef: 'mine.ore.calibration',
        dataRefs: ['ore-type', 'ore-consumption-rate', 'mineralogy', 'head-grade', 'hardness', 'moisture'],
        evidenceRefs: ['testwork-geometalurgico', 'amostragem-rom'],
        semanticJustification: 'Libera britagem quando dominio, mineralogia, teor, dureza e umidade do ROM estao calibrados.',
        required: true,
    }],
    ['mine.edge.005', 'mine.ore.calibration', 'mine.blend.adjustment', 'nao: ajustar campanha', undefined, {
        conditionRef: 'mine.ore.calibration',
        dataRefs: ['ore-type', 'ore-consumption-rate', 'clay-slimes', 'deleterious-elements', 'head-grade-variance'],
        evidenceRefs: ['reconciliacao-mina-planta', 'receita-de-blend'],
        failureBehavior: 'rework',
        semanticJustification: 'Se o minerio especifico nao esta calibrado, volta para blend ou campanha antes de entrar na planta.',
        required: true,
    }],
    ['mine.edge.006', 'mine.blend.adjustment', 'mine.ore.calibration', 'revalidar blend'],
    ['mine.edge.007', 'mine.primary.crushing', 'mine.scalping.screen', 'produto primario'],
    ['mine.edge.008', 'mine.scalping.screen', 'mine.secondary.crushing', 'oversize'],
    ['mine.edge.009', 'mine.scalping.screen', 'mine.crushed.ore.silo', 'undersize util'],
    ['mine.edge.010', 'mine.secondary.crushing', 'mine.crushed.ore.silo', 'produto britado'],
    ['mine.edge.011', 'mine.crushed.ore.silo', 'mine.grinding', 'alimentar moagem'],
    ['mine.edge.012', 'mine.grinding', 'mine.classification', 'polpa moida'],
    ['mine.edge.013', 'mine.classification', 'mine.conditioning', 'sim: P80 alvo', undefined, {
        conditionRef: 'mine.classification',
        dataRefs: ['granulometry', 'target-p80', 'liberation-size', 'circulating-load'],
        evidenceRefs: ['curva-granulometrica', 'ensaio-liberacao'],
        semanticJustification: 'Segue para condicionamento quando a granulometria alvo libera o mineral sem sobrem moagem.',
        required: true,
    }],
    ['mine.edge.014', 'mine.classification', 'mine.regrind', 'nao: grosso ou baixa liberacao', undefined, {
        conditionRef: 'mine.classification',
        dataRefs: ['granulometry', 'oversize', 'liberation-size', 'overgrinding-risk'],
        evidenceRefs: ['classificacao-ciclones', 'amostra-moagem'],
        failureBehavior: 'rework',
        semanticJustification: 'Retorna para remoagem quando a granulometria ou liberacao ainda nao atende a meta.',
        required: true,
    }],
    ['mine.edge.015', 'mine.regrind', 'mine.grinding', 'retorno'],
    ['mine.edge.016', 'mine.conditioning', 'mine.reagent.decision', 'polpa condicionada'],
    ['mine.edge.017', 'mine.reagent.decision', 'mine.separation.route', 'sim: quimica OK', undefined, {
        conditionRef: 'mine.reagent.decision',
        dataRefs: ['reagents', 'pH', 'Eh', 'water-quality', 'solids-percent', 'residence-time'],
        evidenceRefs: ['receita-reagentes', 'controle-dosagem'],
        semanticJustification: 'Libera a rota de separacao quando reagentes, pH, Eh, agua e densidade de polpa estao dentro da janela.',
        required: true,
    }],
    ['mine.edge.018', 'mine.reagent.decision', 'mine.reagent.adjustment', 'nao: corrigir dosagem', undefined, {
        conditionRef: 'mine.reagent.decision',
        dataRefs: ['reagents', 'water-quality', 'pH', 'Eh', 'collector-dose', 'frother-dose'],
        evidenceRefs: ['desvio-dosagem', 'qualidade-agua-processo'],
        failureBehavior: 'rework',
        semanticJustification: 'Recondiciona a polpa quando dosagem, qualidade da agua ou quimica da flotacao saem da meta.',
        required: true,
    }],
    ['mine.edge.019', 'mine.reagent.adjustment', 'mine.conditioning', 'recondicionar'],
    ['mine.edge.020', 'mine.separation.route', 'mine.gravity.dms', 'rota gravimetrica/DMS', undefined, {
        conditionRef: 'mine.separation.route',
        dataRefs: ['ore-type', 'density-contrast', 'liberation-size', 'granulometry'],
        evidenceRefs: ['testwork-gravimetrico-dms'],
        semanticJustification: 'Escolhe gravimetria ou DMS quando contraste de densidade e tamanho de liberacao sustentam pre-concentracao.',
        required: true,
    }],
    ['mine.edge.021', 'mine.separation.route', 'mine.magnetic', 'rota magnetica', undefined, {
        conditionRef: 'mine.separation.route',
        dataRefs: ['ore-type', 'magnetic-response', 'liberation-size', 'granulometry'],
        evidenceRefs: ['testwork-magnetico'],
        semanticJustification: 'Escolhe separacao magnetica quando a resposta magnetica do minerio especifico sustenta a rota.',
        required: true,
    }],
    ['mine.edge.022', 'mine.separation.route', 'mine.flotation.rougher', 'rota flotacao direta', undefined, {
        conditionRef: 'mine.separation.route',
        dataRefs: ['ore-type', 'floatability', 'reagents', 'water-quality', 'liberation-size'],
        evidenceRefs: ['testwork-flotacao'],
        semanticJustification: 'Escolhe flotacao direta quando flotabilidade, reagentes, agua e liberacao mineral sustentam a recuperacao.',
        required: true,
    }],
    ['mine.edge.023', 'mine.gravity.dms', 'mine.flotation.rougher', 'pre-concentrado'],
    ['mine.edge.024', 'mine.magnetic', 'mine.flotation.rougher', 'corrente magnetica'],
    ['mine.edge.025', 'mine.flotation.rougher', 'mine.cleaner', 'concentrado rougher'],
    ['mine.edge.026', 'mine.cleaner', 'mine.grade.decision', 'concentrado cleaner'],
    ['mine.edge.027', 'mine.grade.decision', 'mine.concentrate.thickener', 'sim: teor/recuperacao', undefined, {
        conditionRef: 'mine.grade.decision',
        dataRefs: ['recovery', 'concentrate-grade', 'tailings-grade', 'mass-pull', 'deleterious-elements'],
        evidenceRefs: ['balanco-metalurgico', 'amostra-cleaner'],
        semanticJustification: 'Segue para desaguamento quando teor, recuperacao, massa e impurezas atendem a especificacao.',
        required: true,
    }],
    ['mine.edge.028', 'mine.grade.decision', 'mine.conditioning', 'nao: recircular para ajuste', undefined, {
        conditionRef: 'mine.grade.decision',
        dataRefs: ['recovery', 'tailings-grade', 'mass-pull', 'reagents'],
        evidenceRefs: ['desvio-recuperacao', 'amostra-rejeito'],
        failureBehavior: 'rework',
        semanticJustification: 'Recircula para ajuste quando recuperacao, teor ou perdas no rejeito ficam fora da meta.',
        required: true,
    }],
    ['mine.edge.029', 'mine.concentrate.thickener', 'mine.concentrate.filter', 'underflow'],
    ['mine.edge.030', 'mine.concentrate.filter', 'mine.product.stockpile', 'torta filtrada'],
    ['mine.edge.031', 'mine.product.stockpile', 'mine.end', 'embarque'],
    ['mine.edge.032', 'mine.flotation.rougher', 'mine.tailings.thickener', 'rejeito de flotacao'],
    ['mine.edge.033', 'mine.cleaner', 'mine.tailings.thickener', 'rejeito cleaner'],
    ['mine.edge.034', 'mine.tailings.thickener', 'mine.water.recovery', 'overflow'],
    ['mine.edge.035', 'mine.tailings.thickener', 'mine.tailings.route.decision', 'underflow/rejeito'],
    ['mine.edge.036', 'mine.tailings.route.decision', 'mine.tailings.disposal', 'sim: rota aprovada', undefined, {
        conditionRef: 'mine.tailings.route.decision',
        dataRefs: ['tailings-route', 'tailings-volume', 'solids-percent', 'geotechnical-risk', 'water-recovery', 'water-recovered', 'license-constraint'],
        evidenceRefs: ['plano-rejeitos', 'licenca-operacional'],
        semanticJustification: 'Libera disposicao quando rota de rejeitos, risco geotecnico, agua recuperada (espessamento/filtragem) e restricoes de licenca estao fechados.',
        required: true,
    }],
    ['mine.edge.037', 'mine.tailings.route.decision', 'mine.tailings.route.selection', 'nao: comparar alternativas', undefined, {
        conditionRef: 'mine.tailings.route.decision',
        dataRefs: ['tailings-route', 'geotechnical-risk', 'water-recovery', 'water-recovered', 'capex-opex', 'license-constraint'],
        evidenceRefs: ['alternativas-rejeitos', 'parecer-geotecnia'],
        failureBehavior: 'rework',
        semanticJustification: 'Compara alternativas quando a rota de rejeitos ainda nao e segura, licenciada ou aderente ao balanco de agua recuperada.',
        required: true,
    }],
    ['mine.edge.060', 'mine.tailings.route.decision', 'mine.sampling', 'nao: revisar caracterizacao do rejeito', undefined, {
        conditionRef: 'mine.tailings.route.decision',
        dataRefs: ['tailings-route', 'tailings-volume', 'solids-percent', 'sample-quality', 'geotechnical-risk'],
        evidenceRefs: ['amostra-rejeito', 'caracterizacao-geotecnica'],
        failureBehavior: 'rework',
        semanticJustification: 'Volta para amostragem quando faltam dados de granulometria, solidos, volume ou risco para escolher a rota de rejeitos.',
        required: true,
    }],
    ['mine.edge.038', 'mine.tailings.route.selection', 'mine.tailings.route.decision', 'revalidar rota'],
    ['mine.edge.039', 'mine.water.recovery', 'mine.water.return', 'agua recuperada'],
    ['mine.edge.040', 'mine.water.return', 'mine.water.energy.decision', 'fechar ciclo de agua'],
    ['mine.edge.041', 'mine.water.energy.decision', 'mine.grinding', 'sim: reciclo liberado', undefined, {
        conditionRef: 'mine.water.energy.decision',
        dataRefs: ['water', 'water-recycle', 'water-make-up', 'energy', 'kwh-per-ton', 'pump-capacity', 'critical-supplies'],
        evidenceRefs: ['balanco-agua-energia', 'medidores-utilidades'],
        semanticJustification: 'Retorna agua ao processo quando reciclo, qualidade, energia especifica, insumos criticos e capacidade de utilidades estao liberados.',
        required: true,
    }],
    ['mine.edge.042', 'mine.water.energy.decision', 'mine.water.energy.adjustment', 'nao: otimizar utilidades', undefined, {
        conditionRef: 'mine.water.energy.decision',
        dataRefs: ['water', 'water-make-up', 'water-recycle', 'energy', 'kwh-per-ton', 'pump-capacity', 'critical-supplies'],
        evidenceRefs: ['desvio-utilidades', 'restricao-bombas'],
        failureBehavior: 'rework',
        semanticJustification: 'Ajusta recirculacao, make-up, bombas, moagem, energia ou reposicao de insumos criticos quando o consumo sai da meta.',
        required: true,
    }],
    ['mine.edge.043', 'mine.water.energy.adjustment', 'mine.water.recovery', 'recalcular utilidades'],
    ['mine.edge.044', 'mine.rom.receiving', 'mine.sampling', 'amostra ROM', 'data'],
    ['mine.edge.045', 'mine.ore.calibration', 'mine.sampling', 'dominio geometalurgico', 'data'],
    ['mine.edge.046', 'mine.grinding', 'mine.sampling', 'amostra moagem', 'data'],
    ['mine.edge.047', 'mine.flotation.rougher', 'mine.sampling', 'amostra flotacao', 'data'],
    ['mine.edge.048', 'mine.product.stockpile', 'mine.sampling', 'amostra produto', 'data'],
    ['mine.edge.049', 'mine.tailings.disposal', 'mine.sampling', 'amostra rejeito', 'data'],
    ['mine.edge.050', 'mine.sampling', 'mine.mass.balance', 'resultados de laboratorio', 'data'],
    ['mine.edge.051', 'mine.mass.balance', 'mine.mass.balance.decision', 'calculo reconciliado', 'data'],
    ['mine.edge.052', 'mine.mass.balance.decision', 'mine.control.room', 'sim: publicar KPI', undefined, {
        conditionRef: 'mine.mass.balance.decision',
        dataRefs: ['mass-balance', 'ore-consumption-rate', 'feed-tonnage', 'concentrate-tonnage', 'tailings-tonnage', 'recovery'],
        evidenceRefs: ['balanco-reconciliado', 'resultados-laboratorio'],
        semanticJustification: 'Publica KPI somente quando massas, teores, recuperacoes, umidade e perdas fecham dentro da tolerancia.',
        required: true,
    }],
    ['mine.edge.053', 'mine.mass.balance.decision', 'mine.sampling', 'nao: revisar amostras', undefined, {
        conditionRef: 'mine.mass.balance.decision',
        dataRefs: ['mass-balance', 'ore-consumption-rate', 'sample-quality', 'moisture', 'density', 'recovery'],
        evidenceRefs: ['amostra-inconsistente', 'reconciliacao-falhou'],
        failureBehavior: 'rework',
        semanticJustification: 'Volta para amostragem quando o balanco de massa, teor ou recuperacao nao fecha.',
        required: true,
    }],
    ['mine.edge.054', 'mine.control.room', 'mine.maintenance.plan', 'alertas de disponibilidade', 'data'],
    ['mine.edge.055', 'mine.control.room', 'mine.esg.reporting', 'KPIs operacionais', 'data'],
    ['mine.edge.056', 'mine.water.energy.decision', 'mine.esg.reporting', 'agua e energia especifica', 'data'],
    ['mine.edge.057', 'mine.water.recovery', 'mine.esg.reporting', 'indicadores de agua', 'data'],
    ['mine.edge.058', 'mine.tailings.route.decision', 'mine.esg.reporting', 'rota de rejeitos', 'data'],
    ['mine.edge.059', 'mine.tailings.disposal', 'mine.esg.reporting', 'indicadores de rejeitos', 'data'],
] as const;

function edgeMetaForPack(raw: Record<string, unknown>): Partial<PipelinePackEdge> {
    const optional: Partial<PipelinePackEdge> = {};
    const conditionRef = String(raw.conditionRef || '').trim();
    const semanticJustification = String(raw.semanticJustification || '').trim();
    const dataRefs = Array.isArray(raw.dataRefs) ? raw.dataRefs.map((ref) => String(ref || '').trim()).filter(Boolean) : [];
    const evidenceRefs = Array.isArray(raw.evidenceRefs) ? raw.evidenceRefs.map((ref) => String(ref || '').trim()).filter(Boolean) : [];
    if (conditionRef) optional.conditionRef = conditionRef;
    if (dataRefs.length > 0) optional.dataRefs = dataRefs;
    if (evidenceRefs.length > 0) optional.evidenceRefs = evidenceRefs;
    if (typeof raw.required === 'boolean') optional.required = raw.required;
    const failureBehavior = String(raw.failureBehavior || '');
    if (['block', 'warn', 'skip', 'rework', 'human-decision'].includes(failureBehavior)) {
        optional.failureBehavior = failureBehavior as NonNullable<PipelinePackEdge['failureBehavior']>;
    }
    if (semanticJustification) optional.semanticJustification = semanticJustification;
    return optional;
}

const MINE_BENEFICIATION_MODEL: MineBeneficiationPipelineModel = {
    name: `${MINE_BENEFICIATION_PIPELINE_NAME} - modelo de referencia`,
    presetId: MINE_BENEFICIATION_PIPELINE_ID,
    templateId: MINE_BENEFICIATION_TEMPLATE_ID,
    standard: 'Beneficiamento mineral de alto nivel',
    sourceFile: MINE_BENEFICIATION_SOURCE_FILE,
    sourceFormat: 'manual-research',
    sourceReferences: SOURCE_REFERENCES,
    startNodeId: 'mine.start',
    selectedNodeId: MINE_BENEFICIATION_SELECTED_NODE_ID,
    lanes: LANES,
    groups: GROUPS,
    nodes: NODES,
    edges: EDGES.map(([id, from, to, label, kind, meta]) => ({
        id,
        from,
        to,
        label,
        ...(kind ? { kind } : {}),
        ...(meta || {}),
    })),
};

function clean(value: unknown): string {
    return String(value || '').trim().toLowerCase();
}

function textForTarget(value: unknown): string {
    if (!value || typeof value !== 'object') return String(value || '');
    const record = value as Record<string, unknown>;
    return [
        record.id,
        record.pipelineId,
        record.presetId,
        record.templateId,
        record.nodeId,
        record.target,
        record.hint,
        record.name,
    ].map((part) => String(part || '')).join(' ');
}

export function isMineBeneficiationPipelineTarget(value: unknown): boolean {
    const raw = clean(textForTarget(value));
    const text = raw.replace(/[^a-z0-9]+/g, ' ');
    return (
        raw === MINE_BENEFICIATION_PIPELINE_ID ||
        raw === MINE_BENEFICIATION_SELECTED_NODE_ID ||
        text.includes('mine beneficiation') ||
        text.includes('beneficiamento') ||
        text.includes('geometalurgia') ||
        text.includes('ore calibration') ||
        text.includes('rom to product') ||
        text.includes('rom para concentrado') ||
        text.includes('mineral processing') ||
        text.includes('flotacao') ||
        text.includes('flotation') ||
        text.includes(MINE_BENEFICIATION_TEMPLATE_ID)
    );
}

function cloneModel(): MineBeneficiationPipelineModel {
    return JSON.parse(JSON.stringify(MINE_BENEFICIATION_MODEL)) as MineBeneficiationPipelineModel;
}

export function buildMineBeneficiationPipelineModel(): MineBeneficiationPipelineModel {
    return cloneModel();
}

export function buildMineBeneficiationPipelineEntry() {
    return {
        id: MINE_BENEFICIATION_PIPELINE_ID,
        name: MINE_BENEFICIATION_PIPELINE_NAME,
        presetId: MINE_BENEFICIATION_PIPELINE_ID,
        templateId: MINE_BENEFICIATION_TEMPLATE_ID,
        nodeId: MINE_BENEFICIATION_SELECTED_NODE_ID,
        sourceFile: MINE_BENEFICIATION_SOURCE_FILE,
        sourceFormat: 'manual-research',
        xml: '',
        model: buildMineBeneficiationPipelineModel(),
    };
}

function edgeKindForPack(kind: unknown): PipelinePackEdge['kind'] {
    return String(kind || '') === 'data' ? 'data-association' : 'control-flow';
}

function moduleTargetForNode(node: Record<string, unknown>): PipelineModuleTarget | null {
    const targetModule = String(node.targetModule || '').trim();
    if (!targetModule) return null;
    const nodeId = String(node.id || '');
    const label = String(node.contextLabel || node.label || nodeId);
    const moduleId = targetModule.includes('.') ? targetModule.split('.')[0] || targetModule : targetModule;
    return {
        id: `mine-beneficiation-${moduleId}-${nodeId}`,
        ownerNodeId: nodeId,
        label,
        moduleId,
        adapterId: targetModule,
        openMode: moduleId === 'files' ? 'side-panel' : 'open-live',
        targetParams: {
            ...(node.moduleInputParams && typeof node.moduleInputParams === 'object'
                ? (node.moduleInputParams as Record<string, unknown>)
                : {}),
            source: 'pipeline-pack',
            pipelineId: MINE_BENEFICIATION_PIPELINE_ID,
        },
        fallback: {
            type: 'message',
            text: `Mostrar resumo operacional de ${label} no fluxo de beneficiamento.`,
        },
        requiredPermission: 'view',
    };
}

function nodeForPack(node: Record<string, unknown>): PipelinePackNode {
    const out: PipelinePackNode = {
        id: String(node.id || ''),
        type: String(node.type || 'action'),
        label: String(node.label || node.id || ''),
    };
    for (const key of ['x', 'y', 'w', 'h'] as const) {
        const value = Number(node[key]);
        if (Number.isFinite(value)) out[key] = value;
    }
    for (const key of ['color', 'lane', 'phase', 'contextLabel', 'semanticRole', 'targetModule'] as const) {
        const value = String(node[key] || '').trim();
        if (value) out[key] = value;
    }
    if (node.moduleInputParams && typeof node.moduleInputParams === 'object') {
        out.moduleInputParams = node.moduleInputParams as Record<string, unknown>;
    }
    return out;
}

export function buildMineBeneficiationPipelinePack(): PipelinePack {
    const model = buildMineBeneficiationPipelineModel();
    const moduleTargets = model.nodes
        .map((node) => moduleTargetForNode(node as Record<string, unknown>))
        .filter((target): target is PipelineModuleTarget => !!target);
    return {
        id: `${MINE_BENEFICIATION_PIPELINE_ID}.pack`,
        title: MINE_BENEFICIATION_PIPELINE_NAME,
        description: 'Pipeline Pack de referencia para aula, desenho inicial e customizacao de fluxos de beneficiamento mineral.',
        schemaVersion: '1.0.0',
        version: '1.0.0',
        source: {
            kind: 'manual',
            semantics: 'semantic',
            sourceFileName: MINE_BENEFICIATION_SOURCE_FILE,
        },
        graph: {
            nodes: model.nodes.map((node) => nodeForPack(node as Record<string, unknown>)),
            edges: model.edges.map((edge, index) => {
                const raw = edge as Record<string, unknown>;
                return {
                    id: String(raw.id || `mine-beneficiation-edge-${index + 1}`),
                    source: String(raw.from || raw.source || ''),
                    target: String(raw.to || raw.target || ''),
                    kind: edgeKindForPack(raw.kind),
                    ...(String(raw.label || '').trim() ? { label: String(raw.label) } : {}),
                    ...edgeMetaForPack(raw),
                };
            }),
            lanes: model.lanes.map((lane, index) => ({
                id: `mine-beneficiation-lane-${index + 1}`,
                label: String(lane.label || `Raia ${index + 1}`),
                y: Number(lane.y) || 0,
                h: Number(lane.h) || 0,
            })),
            groups: model.groups.map((group, index) => ({
                id: `mine-beneficiation-group-${index + 1}`,
                label: String(group.label || `Fase ${index + 1}`),
                x: Number(group.x) || 0,
                y: Number(group.y) || 0,
                w: Number(group.w) || 0,
                h: Number(group.h) || 0,
            })),
            startNodeIds: [model.startNodeId],
            endNodeIds: ['mine.end'],
        },
        layout: {
            renderTheme: 'reference-light',
            hasReferenceOverlay: false,
            viewport: { x: 0, y: 0, zoom: 0.65 },
        },
        semantics: {
            domain: 'mine-beneficiation',
            glossary: {
                ROM: 'Run-of-mine: minerio como chega da mina antes do beneficiamento.',
                Cominuicao: 'Reducao de tamanho por britagem e moagem para liberar minerais.',
                Classificacao: 'Separacao por tamanho para decidir avanco ou retorno a moagem.',
                Concentracao: 'Aumento do teor do mineral util por propriedades fisicas ou quimicas.',
                Flotacao: 'Separacao por diferenca de superficie usando bolhas, reagentes e espuma.',
                Rejeitos: 'Corrente sem valor economico imediato que exige gestao geotecnica e ambiental.',
                Recuperacao: 'Percentual do metal ou mineral util que chega ao concentrado.',
                Geometalurgia: 'Relacao entre dominios geologicos, mineralogia, dureza, recuperacao e comportamento na planta.',
                P80: 'Tamanho em que 80% das particulas passam; deve ser calibrado por mineralogia e liberacao.',
                'Balanco de massa': 'Fechamento de massas, teores, recuperacoes, umidade e perdas antes de publicar KPIs.',
                Reagentes: 'Coletor, espumante, depressor, modificadores de pH/Eh e outros insumos calibrados por minerio e agua.',
                'Insumos criticos': 'Corpos moedores, revestimentos, floculante, cal, combustivel e sobressalentes com estoque minimo garantido, alem de agua, energia e reagentes.',
                'Agua recuperada': 'Agua devolvida ao processo apos espessamento e filtragem do rejeito, junto com a disposicao final aprovada (barragem, pilha seca, coprocessamento ou outro).',
            },
            entries: model.nodes.map((node) => ({
                nodeId: String(node.id),
                label: String(node.contextLabel || node.label || node.id),
                meaning: String(node.contextLabel || node.label || node.id),
                domainTags: [
                    'mine-beneficiation',
                    String(node.phase || '').toLowerCase().replace(/\s+/g, '-'),
                    String(node.lane || '').toLowerCase().replace(/\s+/g, '-'),
                ].filter(Boolean),
                confidence: 'manual',
            })),
        },
        moduleTargets,
        variants: [
            {
                id: 'mine-beneficiation-present',
                label: 'Apresentar beneficiamento',
                mode: 'present',
                description: 'Versao limpa para explicar o fluxo produtivo em aula.',
            },
            {
                id: 'mine-beneficiation-audit',
                label: 'Auditar beneficiamento',
                mode: 'audit',
                description: 'Versao com score, fontes, riscos e lacunas de customizacao.',
            },
            {
                id: 'mine-beneficiation-customize',
                label: 'Customizar por minerio',
                mode: 'edit',
                description: 'Base para adaptar mineralogia, rotas e modulos equivalentes.',
            },
        ],
        validationProfile: {
            scoreModel: 'unified-0-1000',
            scope: 'pipeline-mine-beneficiation',
            minScore: 980,
            requiredChecks: ['graph', 'connectors', 'lanes', 'groups', 'module-targets', 'source-references'],
            quadrantPolicy: {
                grid: '4x4',
                reportWorstBlocks: 4,
            },
        },
        assets: SOURCE_REFERENCES.map((reference) => ({
            id: `asset-${reference.id}`,
            label: reference.title,
            kind: 'reference',
            status: 'local-only',
            linkedNodeIds: [],
        })),
        permissions: {
            defaultPermission: 'view',
            allowedRoles: ['teacher', 'student', 'owner'],
        },
        audit: {
            lastScore: 1000,
            notes: [
                'Modelo manual baseado em fontes publicas de processamento mineral.',
                'Fluxo generico: ROM, calibracao de minerio, britagem, moagem, classificacao, rotas de concentracao, desaguamento, produto, rejeitos, agua e energia.',
                'Gates condicionais explicitos: minerio calibrado, P80 alvo, reagentes/pH, rota de separacao, teor/recuperacao, rota de rejeitos, agua/energia e balanco fechado.',
                'Validar mineralogia, dominios geometalurgicos, granulometria, recuperacoes, reagentes, geotecnia, agua/energia e balanco de massa antes de projeto executivo.',
                `Fontes: ${SOURCE_REFERENCES.map((reference) => reference.url).join(' | ')}`,
            ],
        },
    };
}
