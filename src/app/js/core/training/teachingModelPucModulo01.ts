// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

// Single source of truth for the reconciled slide count lives in the pure model
// (T1.6, SPEC_TRAINING_PPTX_SOURCE_FIDELITY) — do not hardcode the number here.
import { PUC_MODULO01_EXPECTED_SLIDE_COUNT } from './_pucModulo01TeachingModelPure.js';

export const PUC_MODULO01_TEACHING_MODEL_KEY =
    'ecbt://training-model/puc-2025-modulo01-dados-ambientais@1';

export type TeachingSuggestionKind =
    | 'open-handler'
    | 'snapshot'
    | 'poll'
    | 'reveal'
    | 'resource'
    | 'concept';

export type TeachingSuggestionPriority = 'low' | 'medium' | 'high' | 'critical';

export interface TeachingSuggestion {
    id: string;
    label: string;
    description: string;
    kind: TeachingSuggestionKind;
    priority: TeachingSuggestionPriority;
    handler?: string;
    presetId?: string;
    modelPresetId?: string;
    nodeId?: string;
    fallbackAssetId?: string;
    fallback: string;
}

export interface SlideTeachingPlan {
    slide: number;
    title: string;
    focus: string;
    layout: string;
    suggestions: readonly TeachingSuggestion[];
    teacherGuide?: readonly string[];
    teacherGuideSummary?: string;
    gap?: string;
}

const p = (
    id: string,
    label: string,
    description: string,
    kind: TeachingSuggestionKind,
    priority: TeachingSuggestionPriority,
    fallback: string,
    handler?: string,
    presetId?: string,
    nodeId?: string,
    fallbackAssetId?: string,
): TeachingSuggestion => {
    const suggestion: TeachingSuggestion = { id, label, description, kind, priority, fallback };
    if (handler) suggestion.handler = handler;
    if (presetId) {
        suggestion.presetId = presetId;
        suggestion.modelPresetId = presetId;
    }
    if (nodeId) suggestion.nodeId = nodeId;
    if (fallbackAssetId) suggestion.fallbackAssetId = fallbackAssetId;
    return Object.freeze(suggestion);
};

const datastudio = p(
    'm01.datastudio.overview',
    'DataStudio',
    'Abrir a cadeia digital: extracao, processamento, analise e radar.',
    'open-handler',
    'high',
    'Use um snapshot do DataStudio ou a galeria de ferramentas da aula.',
    'handleOpenDataStudio',
    'm01.datastudio.overview',
);

const pipelinesGac = p(
    'm01.gac.flow.dd38',
    'Fluxo GAC',
    'Abrir Pipelines para mostrar o fluxo GAC/DD38 por fase.',
    'open-handler',
    'critical',
    'Mostrar o diagrama GAC em Files e explicar o fluxo como imagem guiada.',
    'handleOpenPipelineManager',
    'm01.gac.flow.dd38',
    'gac.phase.characterization',
    'asset:m01:snapshot:gac-dd38',
);

const gacDetectionPreliminary = p(
    'm01.gac.phase.detection-preliminary-assessment',
    'Deteccao / avaliacao preliminar',
    'Abrir o node GAC de deteccao, historico, vistoria e avaliacao preliminar.',
    'open-handler',
    'critical',
    'Usar snapshot do GAC DD38 com deteccao/avaliacao preliminar destacada.',
    'handleOpenPipelineManager',
    'm01.gac.phase.detection-preliminary-assessment',
    'gac.phase.detection-preliminary-assessment',
    'asset:m01:snapshot:gac-detection-preliminary-assessment',
);

const gacConfirmatoryInvestigation = p(
    'm01.gac.phase.confirmatory-investigation',
    'Investigacao confirmatoria',
    'Abrir o node GAC de plano de amostragem, analitos alvo e confirmacao.',
    'open-handler',
    'critical',
    'Usar snapshot do GAC DD38 com investigacao confirmatoria destacada.',
    'handleOpenPipelineManager',
    'm01.gac.phase.confirmatory-investigation',
    'gac.phase.confirmatory-investigation',
    'asset:m01:snapshot:gac-confirmatory-investigation',
);

const gacClassification = p(
    'm01.gac.phase.classification',
    'Classificacao GAC',
    'Abrir o node GAC de CMA, risco, prioridade e decisao de gerenciamento.',
    'open-handler',
    'critical',
    'Usar snapshot do GAC DD38 com classificacao/priorizacao destacada.',
    'handleOpenPipelineManager',
    'm01.gac.phase.classification',
    'gac.phase.gac-classification',
    'asset:m01:snapshot:gac-classification',
);

const gacRemediation = p(
    'm01.gac.phase.remediation',
    'Remediacao',
    'Abrir o node GAC de plano de intervencao, metas, tecnologia e execucao.',
    'open-handler',
    'critical',
    'Usar snapshot do GAC DD38 com remediacao destacada.',
    'handleOpenPipelineManager',
    'm01.gac.phase.remediation',
    'gac.phase.remediation',
    'asset:m01:snapshot:gac-remediation',
);

const gacMonitoringCloseout = p(
    'm01.gac.phase.monitoring-closeout',
    'Monitoramento / fechamento',
    'Abrir o node GAC de monitoramento, efetividade, encerramento e restricoes aplicaveis.',
    'open-handler',
    'critical',
    'Usar snapshot do GAC DD38 com monitoramento/fechamento destacado.',
    'handleOpenPipelineManager',
    'm01.gac.phase.monitoring-closeout',
    'gac.phase.monitoring-closeout',
    'asset:m01:snapshot:gac-monitoring-closeout',
);

const gacPhaseSuggestions = Object.freeze([
    gacDetectionPreliminary,
    gacConfirmatoryInvestigation,
    gacClassification,
    gacRemediation,
    gacMonitoringCloseout,
]);

const gacTeacherGuide = Object.freeze([
    'Decisao DD-38 da fase.',
    'Fase, responsavel e evidencia.',
    'Abrir fluxo GAC.',
    'Voltar e definir proximo passo.',
]);

const gacTeacherGuideSummary = 'Decisao DD-38 -> evidencia -> fluxo GAC -> proximo passo.';

const fieldTeacherGuide = Object.freeze([
    'Abrir app de campo.',
    'Preencher dado minimo.',
    'Anexar evidencia.',
    'Discutir confiabilidade.',
]);

const fieldTeacherGuideSummary = 'App de campo -> dado minimo -> evidencia -> confiabilidade.';

const webmapTeacherGuide = Object.freeze([
    'Abrir Webmap 2D.',
    'Conferir camada e legenda.',
    'Localizar area critica.',
    'Voltar com decisao espacial.',
]);

const webmapTeacherGuideSummary = 'Webmap 2D -> camada -> legenda -> decisao espacial.';

const model3dTeacherGuide = Object.freeze([
    'Abrir modelo 3D.',
    'Mostrar corte e pluma.',
    'Relacionar profundidade.',
    'Voltar com hipotese espacial.',
]);

const model3dTeacherGuideSummary = 'Modelo 3D -> corte -> pluma -> hipotese espacial.';

const aiTeacherGuide = Object.freeze([
    'Abrir rede neural.',
    'Mostrar dados de entrada.',
    'Explicar revisao humana.',
    'Voltar com limite da IA.',
]);

const aiTeacherGuideSummary = 'Rede neural -> entradas -> revisao humana -> limite da IA.';

const ganttTeacherGuide = Object.freeze([
    'Abrir Gantt da aula.',
    'Mostrar fase atual.',
    'Ligar marco a evidencia.',
    'Voltar com proximo prazo.',
]);

const ganttTeacherGuideSummary = 'Gantt -> fase -> marco -> proximo prazo.';

const datastudioTeacherGuide = Object.freeze([
    'Abrir DataStudio.',
    'Escolher tabela validada.',
    'Aplicar regra legal.',
    'Voltar com achado principal.',
]);

const datastudioTeacherGuideSummary = 'DataStudio -> tabela -> regra legal -> achado.';

const temporalTeacherGuide = Object.freeze([
    'Abrir Mann-Kendall.',
    'Conferir serie temporal.',
    'Interpretar tendencia.',
    'Voltar com decisao de coleta.',
]);

const temporalTeacherGuideSummary = 'Mann-Kendall -> serie -> tendencia -> decisao de coleta.';

const closureTeacherGuide = Object.freeze([
    'Abrir relatorio ou Files.',
    'Mostrar material final.',
    'Conectar evidencia a decisao.',
    'Fechar encaminhamento.',
]);

const closureTeacherGuideSummary = 'Relatorio/Files -> evidencia -> decisao -> encaminhamento.';

const governance = p(
    'm01.governance.panel',
    'Governanca',
    'Abrir governanca para papeis, decisoes, backlog, WBS e Gantt.',
    'open-handler',
    'high',
    'Usar um cartao conceitual com papeis, responsaveis e checkpoints.',
    'handleOpenGovernanceDashboard',
);

const gantt = p(
    'm01.agile.gantt',
    'Gantt da aula',
    'Abrir cronograma Gantt do projeto template do Modulo 01.',
    'open-handler',
    'high',
    'Usar snapshot do Gantt da aula, nao um projeto aleatorio.',
    'handleOpenGovernanceDashboard',
    'm01.agile.gantt',
);

const files = p(
    'm01.files.resources',
    'Files',
    'Abrir materiais da aula: PPT, imagens, snapshots, referencias e QR.',
    'open-handler',
    'medium',
    'Usar Course Resource Landing com os arquivos principais da aula.',
    'handleOpenFiles',
    'm01.files.gac-catalog',
);

const field = p(
    'm01.field.collection',
    'App de campo',
    'Abrir matriz de coleta, evidencias fotograficas e sensores como aplicativo operacional.',
    'open-handler',
    'high',
    'Usar snapshot de formulario de campo e checklist de dados minimos.',
    'handleOpenDataEntryMatrix',
    'm01.field.collection',
);

const dashboard = p(
    'm01.dashboard.eis',
    'Dashboard EIS',
    'Abrir dashboard para materializar indicadores e linhas de evidencia.',
    'open-handler',
    'high',
    'Usar snapshot do dashboard e explicar o que cada indicador responde.',
    'handleOpenEisDashboard',
    'm01.dashboard.eis',
);

const eisReport = p(
    'm01.report.eis.summary',
    'Relatorio EIS',
    'Abrir relatorio EIS com conclusoes, linhas de evidencia e material de fechamento.',
    'open-handler',
    'high',
    'Usar snapshot do relatorio EIS da aula.',
    'handleOpenReportOverlay',
    'm01.report.eis.summary',
);

const map = p(
    'm01.map.spatial',
    'Webmap 2D',
    'Abrir a vista 2D/Webmap com a camada espacial da aula, sem cair em seletor generico.',
    'open-handler',
    'high',
    'Usar snapshot do Webmap 2D ou uma imagem georreferenciada em Files.',
    'handleSwitchView',
    'm01.map.spatial',
);

const interpolation = p(
    'm01.plume.interpolation',
    'Pluma / interpolacao',
    'Abrir interpolacao, pluma, incerteza e comparacao espacial.',
    'open-handler',
    'critical',
    'Usar Reveal Compare com duas plumas e discutir vieses de interpretacao.',
    'handleOpenInterpolationPanel',
    'm01.plume.interpolation',
);

const model3d = p(
    'm01.model3d.plume',
    'Modelo 3D e pluma',
    'Abrir o modelo 3D da aula para conectar coordenadas x/y/z, corte e pluma.',
    'open-handler',
    'critical',
    'Usar snapshot do modelo 3D/pluma se a cena 3D ainda nao estiver pronta.',
    'handleSwitchView',
    'm01.model3d.plume',
    undefined,
    'asset:m01:snapshot:model3d-plume',
);

const temporal = p(
    'm01.temporal.na.mann-kendall',
    'Serie temporal / Mann-Kendall',
    'Abrir analise temporal para NA, tendencia e telemetria.',
    'open-handler',
    'critical',
    'Usar grafico snapshot e perguntar qual decisao mudaria com mais frequencia de coleta.',
    'handleOpenTemporalAnalysis',
    'm01.temporal.na.mann-kendall',
);

const ai = p(
    'm01.ai.neural-network',
    'Rede neural',
    'Abrir rede neural com exemplo rastreavel e checklist de revisao humana.',
    'open-handler',
    'medium',
    'Usar snapshot da rede neural e checklist de risco de IA.',
    'handleOpenNNManager',
    'm01.ai.neural-network',
);

const poll = p(
    'm01.class.poll',
    'Enquete da turma',
    'Registrar resposta A/B ou multipla escolha antes de revelar a discussao.',
    'poll',
    'high',
    'Fazer voto verbal/manual e anotar o resultado no slide.',
    undefined,
    'm01.class.poll',
);

const reveal = p(
    'm01.reveal.compare',
    'Comparar e revelar',
    'Comparar alternativas lado a lado e revelar a linha de evidencia.',
    'reveal',
    'high',
    'Usar duas imagens no slide e revelar a conclusao manualmente.',
    undefined,
    'm01.reveal.compare',
);

const concept = p(
    'm01.slide.concept.card',
    'Cartao conceitual',
    'Mostrar conceito, exemplo no app, risco e pergunta para a turma.',
    'concept',
    'medium',
    'Usar nota do professor no proprio slide.',
    undefined,
    'm01.slide.concept.card',
);

const PLANS: readonly SlideTeachingPlan[] = Object.freeze([
    {
        slide: 1,
        title: 'Situe a aula no modelo ECBT',
        focus: 'Abrir a aula pelo modelo ECBT correto, nao como curso aleatorio.',
        layout: 'static-16x9',
        suggestions: [files, concept],
    },
    {
        slide: 2,
        title: 'Reconheca o que torna um dado digital',
        focus: 'Padronizacao, bases de dados, regras de negocio e insights.',
        layout: 'split-explain-demo',
        suggestions: [datastudio, concept],
    },
    {
        slide: 3,
        title: 'Trate dados ambientais como recurso de valor',
        focus: 'Valor, reuso e risco de dados ambientais mal contextualizados.',
        layout: 'hybrid-slide',
        suggestions: [files, concept],
    },
    {
        slide: 4,
        title: 'Gerencie dados ambientais por linhas de evidencia',
        focus: 'Linhas de evidencia, bases federadas e analises avancadas.',
        layout: 'split-explain-demo',
        suggestions: [pipelinesGac, dashboard, files],
        teacherGuide: gacTeacherGuide,
        teacherGuideSummary: gacTeacherGuideSummary,
    },
    {
        slide: 5,
        title: 'Conecte cada fase do GAC ao decisor e a evidencia',
        focus: 'Conectar fase, decisor, evidencia e responsavel.',
        layout: 'callout-overlay',
        suggestions: [...gacPhaseSuggestions, governance],
        teacherGuide: gacTeacherGuide,
        teacherGuideSummary: gacTeacherGuideSummary,
    },
    {
        slide: 6,
        title: 'Leia o diagrama GAC DD38 como mapa do fluxo',
        focus: 'Usar o diagrama como ativo da aula e ponto de entrada no fluxo.',
        layout: 'full-stage-demo',
        suggestions: [pipelinesGac, ...gacPhaseSuggestions, files],
        teacherGuide: gacTeacherGuide,
        teacherGuideSummary: gacTeacherGuideSummary,
    },
    {
        slide: 7,
        title: 'Percorra o processo GAC fase a fase no pipeline',
        focus: 'Transformar o as-is do slide em nodes clicaveis do pipeline.',
        layout: 'hybrid-slide',
        suggestions: [...gacPhaseSuggestions],
        teacherGuide: gacTeacherGuide,
        teacherGuideSummary: gacTeacherGuideSummary,
    },
    {
        slide: 8,
        title: 'Identifique quem atua e aprova em cada etapa do GAC',
        focus: 'Mostrar quem atua, aprova e consome cada evidencia.',
        layout: 'split-explain-demo',
        suggestions: [governance, ...gacPhaseSuggestions],
        teacherGuide: gacTeacherGuide,
        teacherGuideSummary: gacTeacherGuideSummary,
    },
    {
        slide: 9,
        title: 'Classifique os tipos de dados do GAC',
        focus: 'Dados analiticos, locacionais, geoespaciais, campo, ativos, documentos e ESG.',
        layout: 'full-stage-demo',
        suggestions: [datastudio, files, map],
    },
    {
        slide: 10,
        title: 'Colete dados de campo pelo app',
        focus: 'Mostrar app de coleta como interface operacional do dado.',
        layout: 'live-module-slide',
        suggestions: [field],
        teacherGuide: fieldTeacherGuide,
        teacherGuideSummary: fieldTeacherGuideSummary,
    },
    {
        slide: 11,
        title: 'Transforme dados em indicadores de decisao',
        focus: 'Converter dados em indicadores e decisoes de acompanhamento.',
        layout: 'full-stage-demo',
        suggestions: [dashboard, datastudio],
    },
    {
        slide: 12,
        title: 'Navegue o ecossistema ECBT como plataforma conectada',
        focus: 'Explicar o ecossistema ECBT como plataforma conectada.',
        layout: 'ecosystem-map',
        suggestions: [files, datastudio, pipelinesGac],
        gap: 'Adicionar Ecosystem Map para reduzir a confusao de navegacao.',
    },
    {
        slide: 13,
        title: 'Use mapas web como camada de decisao',
        focus: 'Mostrar dado geoespacial como camada de decisao.',
        layout: 'full-stage-demo',
        suggestions: [map, interpolation],
        teacherGuide: webmapTeacherGuide,
        teacherGuideSummary: webmapTeacherGuideSummary,
    },
    {
        slide: 14,
        title: 'Interprete a pluma em 3D (x/y/z e cortes)',
        focus: 'Conectar coordenadas x/y/z, cortes e pluma.',
        layout: 'full-stage-demo',
        suggestions: [model3d, interpolation, map],
        teacherGuide: model3dTeacherGuide,
        teacherGuideSummary: model3dTeacherGuideSummary,
    },
    {
        slide: 15,
        title: 'Vincule ativos construidos as evidencias ambientais',
        focus: 'Vincular ativos construidos a evidencias ambientais sem prometer BIM nativo.',
        layout: 'snapshot-board',
        suggestions: [files, governance, concept],
        gap: 'IFC/BIM nativo ainda deve ser tratado como snapshot ou backlog.',
    },
    {
        slide: 16,
        title: 'Automatize fluxos ambientais com pipelines reutilizaveis',
        focus: 'Mostrar automacao ambiental com presets e pipeline reutilizavel.',
        layout: 'live-module-slide',
        suggestions: [pipelinesGac, datastudio],
    },
    {
        slide: 17,
        title: 'Use IA como apoio rastreavel, nao como autoridade',
        focus: 'Usar IA como apoio tecnico rastreavel, nao como autoridade final.',
        layout: 'split-explain-demo',
        suggestions: [ai, concept],
        teacherGuide: aiTeacherGuide,
        teacherGuideSummary: aiTeacherGuideSummary,
        gap: 'Adicionar AI Prompt Card e checklist de risco para aula.',
    },
    {
        slide: 18,
        title: 'Organize o projeto com backlog, sprints e cronograma',
        focus: 'Mostrar backlog, sprint, papeis e cronograma do projeto/aula.',
        layout: 'full-stage-demo',
        suggestions: [gantt],
        teacherGuide: ganttTeacherGuide,
        teacherGuideSummary: ganttTeacherGuideSummary,
    },
    {
        slide: 19,
        title: 'Explore a galeria de ferramentas digitais da aula',
        focus: 'Transicao para galeria controlada de ferramentas da aula.',
        layout: 'tool-gallery',
        suggestions: [concept, files],
        gap: 'Tool Gallery evita jogar o professor no home grid inteiro.',
    },
    {
        slide: 20,
        title: 'Conecte drones, LIDAR e sensores aos dados de campo',
        focus: 'Conectar drone, LIDAR, sensores e arquivos de campo.',
        layout: 'hybrid-slide',
        suggestions: [field, map, files],
        teacherGuide: fieldTeacherGuide,
        teacherGuideSummary: fieldTeacherGuideSummary,
    },
    {
        slide: 21,
        title: 'Leia telemetria em alta resolucao espacial e temporal',
        focus: 'Mostrar ingestao de telemetria e leitura temporal.',
        layout: 'full-stage-demo',
        suggestions: [temporal, field],
        teacherGuide: temporalTeacherGuide,
        teacherGuideSummary: temporalTeacherGuideSummary,
    },
    {
        slide: 22,
        title: 'Compare apps de coleta externos com a coleta estruturada',
        focus: 'Comparar apps externos com coleta estruturada no ECBT.',
        layout: 'live-module-slide',
        suggestions: [field, files],
        teacherGuide: fieldTeacherGuide,
        teacherGuideSummary: fieldTeacherGuideSummary,
    },
    {
        slide: 23,
        title: 'Gerencie arquivos, SQL e trilha de auditoria',
        focus: 'Arquivos, SQL, colecoes, trilha de auditoria e intercambio.',
        layout: 'split-explain-demo',
        suggestions: [files, datastudio],
    },
    {
        slide: 24,
        title: 'Abra analises temporais, espaciais e de risco',
        focus: 'Abrir menu de analises: temporal, espacial, risco e dashboard.',
        layout: 'full-stage-demo',
        suggestions: [datastudio, temporal, interpolation],
        teacherGuide: datastudioTeacherGuide,
        teacherGuideSummary: datastudioTeacherGuideSummary,
    },
    {
        slide: 25,
        title: 'Checkpoint: por que tratar dados antes de analisar',
        focus: 'Criar checkpoint de percepcao da turma antes da parte tecnica.',
        layout: 'checkpoint-slide',
        suggestions: [poll, concept],
        gap: 'Class Poll cobre bem este slide sem modulo tecnico pesado.',
    },
    {
        slide: 26,
        title: 'Valide duplicatas, outliers e limites legais na tabela',
        focus: 'Validar duplicatas, outliers, limites legais, censurados e pivots.',
        layout: 'full-stage-demo',
        suggestions: [datastudio, pipelinesGac, files],
        teacherGuide: datastudioTeacherGuide,
        teacherGuideSummary: datastudioTeacherGuideSummary,
    },
    {
        slide: 27,
        title: 'Mapeie a pluma e comunique a incerteza',
        focus: 'Mostrar interpolacao, CMA, profundidade, tempo e anisotropia.',
        layout: 'full-stage-demo',
        suggestions: [interpolation, map],
        teacherGuide: webmapTeacherGuide,
        teacherGuideSummary: webmapTeacherGuideSummary,
    },
    {
        slide: 28,
        title: 'Compare duas plumas e defenda seu palpite',
        focus: 'Capturar palpite da turma e revelar criterio tecnico.',
        layout: 'checkpoint-slide',
        suggestions: [poll, reveal, interpolation],
    },
    {
        slide: 29,
        title: 'Evite conclusoes apressadas comparando evidencias',
        focus: 'Comparar visual, evidencia e risco de conclusao apressada.',
        layout: 'split-explain-demo',
        suggestions: [reveal, interpolation, dashboard],
    },
    {
        slide: 30,
        title: 'Detecte distorcoes da amostragem esparsa no nivel d agua',
        focus: 'Mostrar como amostragem esparsa distorce tendencia de nivel d agua.',
        layout: 'full-stage-demo',
        suggestions: [temporal, poll],
        teacherGuide: temporalTeacherGuide,
        teacherGuideSummary: temporalTeacherGuideSummary,
    },
    {
        slide: 31,
        title: 'Decida onde sensorizar em alta frequencia',
        focus: 'Sensorizacao, frequencia de coleta e mudanca de interpretacao.',
        layout: 'full-stage-demo',
        suggestions: [temporal, field, reveal],
        teacherGuide: temporalTeacherGuide,
        teacherGuideSummary: temporalTeacherGuideSummary,
    },
    {
        slide: 32,
        title: 'Consolide incerteza, evidencia e capacidade tecnica',
        focus: 'Fechar com incerteza, evidencia, massa, capacidade tecnica e report.',
        layout: 'checkpoint-slide',
        suggestions: [dashboard, eisReport, files, concept],
        teacherGuide: closureTeacherGuide,
        teacherGuideSummary: closureTeacherGuideSummary,
    },
    {
        slide: 33,
        title: 'Leve os materiais e o curso publicado com voce',
        focus: 'Levar alunos para materiais, QR, relatorio e curso publicado.',
        layout: 'static-16x9',
        suggestions: [files],
        teacherGuide: closureTeacherGuide,
        teacherGuideSummary: closureTeacherGuideSummary,
    },
]);

const PLANS_BY_SLIDE = new Map<number, SlideTeachingPlan>(PLANS.map((plan) => [plan.slide, plan]));

export const PUC_MODULO01_TEACHING_MODEL = Object.freeze({
    key: PUC_MODULO01_TEACHING_MODEL_KEY,
    title: 'Modulo 01 - Introducao a Dados Ambientais (PUC 2025)',
    totalSlides: PUC_MODULO01_EXPECTED_SLIDE_COUNT,
    centralDemos: Object.freeze([
        'GAC/DD38 em Pipelines',
        'DataStudio e Files como cadeia digital',
        'App de campo para coleta estruturada',
        'Governanca/Gantt para metodologia agil',
        'Webmap 2D para contexto espacial',
        'Modelo 3D e pluma para hipotese espacial',
        'Rede neural com revisao humana',
        'Validacao e tabela transposta',
        'Plumas/interpolacao/incerteza',
        'Serie temporal, NA e Mann-Kendall',
        'Relatorio/Files para fechamento da decisao',
    ]),
    plans: PLANS,
});

export function getPucModulo01SlidePlan(slideIndex: number): SlideTeachingPlan | null {
    const normalized = Math.max(1, Math.round(Number(slideIndex) || 0));
    return PLANS_BY_SLIDE.get(normalized) || null;
}

export function getPucModulo01SlideSuggestions(slideIndex: number, limit = 3): TeachingSuggestion[] {
    const plan = getPucModulo01SlidePlan(slideIndex);
    if (!plan) return [];
    return plan.suggestions.slice(0, Math.max(1, limit));
}

export function getPucModulo01Readiness(): {
    key: string;
    totalSlides: number;
    mappedSlides: number;
    centralDemos: number;
    directOpenActions: number;
    fallbackOnlyActions: number;
    gaps: string[];
} {
    const directOpenActions = PLANS.reduce(
        (acc, plan) => acc + plan.suggestions.filter((suggestion) => !!suggestion.handler).length,
        0,
    );
    const fallbackOnlyActions = PLANS.reduce(
        (acc, plan) => acc + plan.suggestions.filter((suggestion) => !suggestion.handler).length,
        0,
    );
    return {
        key: PUC_MODULO01_TEACHING_MODEL_KEY,
        totalSlides: PUC_MODULO01_EXPECTED_SLIDE_COUNT,
        mappedSlides: PLANS.length,
        centralDemos: PUC_MODULO01_TEACHING_MODEL.centralDemos.length,
        directOpenActions,
        fallbackOnlyActions,
        gaps: PLANS.map((plan) => plan.gap).filter((gap): gap is string => !!gap),
    };
}

export function inferPucModulo01SlideIndex(lesson: { title?: string; order?: number } | null, fallbackIndex: number): number {
    const title = String(lesson?.title || '');
    const explicit = title.match(/(?:slide|aula|licao|lesson)\s*0?(\d{1,2})/i) || title.match(/^\s*0?(\d{1,2})\s*[-.)]/);
    if (explicit) return clampSlide(Number(explicit[1]));
    if (typeof lesson?.order === 'number') return clampSlide(lesson.order + 1);
    return clampSlide(fallbackIndex);
}

export function isPucModulo01CourseTitle(title: string | null | undefined): boolean {
    const normalized = normalize(String(title || ''));
    return (
        normalized.includes('modulo 01') &&
        normalized.includes('dados') &&
        (normalized.includes('ambientais') || normalized.includes('introducao'))
    );
}

function clampSlide(value: number): number {
    const n = Math.round(Number(value) || 1);
    return Math.min(PUC_MODULO01_EXPECTED_SLIDE_COUNT, Math.max(1, n));
}

function normalize(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}
