// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   GAC DD-038 NORMATIVE PROFILE - base regulatory coverage layer.

   First functional slice for DD-038 normative coverage. This file is pure
   data + helpers and intentionally does not change the visual pipeline graph.
   ================================================================ */

export const GAC_DD38_STANDARD_ID = 'cetesb-dd-038-2017-c' as const;
export const GAC_DD38_STANDARD_SOURCE = 'dd-038-2017-c' as const;
export const GAC_DD38_PROFILE_VALIDATED_DATE = '2026-06-22' as const;

export const GAC_DD38_NORMATIVE_BLOCK_IDS = [
    'articles',
    'annex-1',
    'annex-2',
    'annex-a',
    'annex-b',
    'annex-3',
] as const;

export const GAC_DD38_AREA_CLASS_IDS = ['AP', 'AS', 'ACI', 'ACRi', 'ACRe', 'ACRu', 'AME', 'AR'] as const;
export const GAC_DD38_PIPELINE_PHASE_IDS = [
    'detection',
    'characterization',
    'remediation',
    'follow-up',
    'closure',
] as const;
export const GAC_DD38_DATA_NATURE_IDS = [
    'field',
    'laboratory',
    'geospatial',
    'document-regulatory',
    'tabular-analytical',
    'enterprise-system',
    'image-evidence',
    'technical-drawing',
    'model-calculation',
] as const;
export const GAC_DD38_STAKEHOLDER_IDS = [
    'legal-responsible',
    'technical-responsible',
    'field-team',
    'laboratory',
    'specialized-activities',
    'public-agencies',
] as const;

export type GacDd38StandardId = typeof GAC_DD38_STANDARD_ID;
export type GacDd38StandardSource = typeof GAC_DD38_STANDARD_SOURCE;
export type GacDd38NormativeBlockId = (typeof GAC_DD38_NORMATIVE_BLOCK_IDS)[number];
export type GacDd38AreaClassId = (typeof GAC_DD38_AREA_CLASS_IDS)[number];
export type GacDd38PipelinePhaseId = (typeof GAC_DD38_PIPELINE_PHASE_IDS)[number];
export type GacDd38DataNatureId = (typeof GAC_DD38_DATA_NATURE_IDS)[number];
export type GacDd38StakeholderId = (typeof GAC_DD38_STAKEHOLDER_IDS)[number];
export type GacDd38NormativeMappingStatus = 'mapped' | 'partial' | 'missing';

export type GacDd38NormativeSectionKind =
    | 'legal-context'
    | 'definition'
    | 'process-step'
    | 'deliverable'
    | 'checklist'
    | 'licensing'
    | 'material-destination';

export type GacDd38ResponsibleRole = 'responsavel-legal' | 'responsavel-tecnico' | 'cetesb' | 'campo' | 'laboratorio';

export type GacDd38ChecklistEvidenceKind =
    | 'report'
    | 'plan'
    | 'term'
    | 'declaration'
    | 'map'
    | 'lab-data'
    | 'file-reference'
    | 'registry'
    | 'other';

export interface GacDd38NormativeBlock {
    id: GacDd38NormativeBlockId;
    title: string;
    pageStart: number;
    pageEnd: number;
    rolePt: string;
}

export interface GacDd38NormativeSection {
    id: string;
    title: string;
    standardId: GacDd38StandardId;
    source: GacDd38StandardSource;
    blockId: GacDd38NormativeBlockId;
    sectionNumber?: string;
    pageStart: number;
    pageEnd: number;
    kind: GacDd38NormativeSectionKind;
    critical: boolean;
    summaryPt: string;
    expectedEvidence: string[];
    relatedAreaClasses: GacDd38AreaClassId[];
}

export interface GacDd38ChecklistItem {
    id: string;
    label: string;
    sectionIds: string[];
    required: boolean;
    evidenceKind: GacDd38ChecklistEvidenceKind;
    responsibleRole: GacDd38ResponsibleRole;
    relatedAreaClasses: GacDd38AreaClassId[];
}

export interface GacDd38AreaClass {
    id: GacDd38AreaClassId;
    label: string;
    summaryPt: string;
    entryCriteriaPt: string;
    exitCriteriaPt: string;
    sectionIds: string[];
    previousClassIds: GacDd38AreaClassId[];
    nextClassIds: GacDd38AreaClassId[];
}

export interface GacDd38DecisionCriterion {
    id: string;
    label: string;
    nodeId: string;
    phaseId: GacDd38PipelinePhaseId;
    stakeholderId: GacDd38StakeholderId;
    status: GacDd38NormativeMappingStatus;
    sectionIds: string[];
    requiredEvidence: string[];
    responsibleRole: GacDd38ResponsibleRole;
    passConditionPt: string;
    failConditionPt: string;
    gapReasonPt?: string;
}

export interface GacDd38DeliverableTemplate {
    id: string;
    label: string;
    status: GacDd38NormativeMappingStatus;
    sectionIds: string[];
    fileTargetKind: GacDd38ChecklistEvidenceKind;
    checklist: GacDd38ChecklistItem[];
    gapReasonPt?: string;
}

export interface GacDd38PipelinePhaseMapping {
    id: GacDd38PipelinePhaseId;
    label: string;
    sourcePhaseLabel: string;
    status: GacDd38NormativeMappingStatus;
    sectionIds: string[];
    deliverableTemplateIds: string[];
    relatedAreaClasses: GacDd38AreaClassId[];
    summaryPt: string;
    gapReasonPt?: string;
}

export interface GacDd38DataNatureMapping {
    id: GacDd38DataNatureId;
    label: string;
    sourceLabels: string[];
    status: GacDd38NormativeMappingStatus;
    sectionIds: string[];
    checklistItemIds: string[];
    summaryPt: string;
    gapReasonPt?: string;
}

export interface GacDd38StakeholderMapping {
    id: GacDd38StakeholderId;
    label: string;
    sourceLaneLabel: string;
    role: GacDd38ResponsibleRole;
    status: GacDd38NormativeMappingStatus;
    sectionIds: string[];
    checklistItemIds: string[];
    summaryPt: string;
    gapReasonPt?: string;
}

export interface GacDd38NormativeProfile {
    standardId: GacDd38StandardId;
    standardLabel: string;
    source: GacDd38StandardSource;
    validatedDate: typeof GAC_DD38_PROFILE_VALIDATED_DATE;
    blocks: readonly GacDd38NormativeBlock[];
    sections: readonly GacDd38NormativeSection[];
    criticalSectionIds: readonly string[];
    areaClasses: readonly GacDd38AreaClass[];
    checklistItems: readonly GacDd38ChecklistItem[];
    decisionCriteria: readonly GacDd38DecisionCriterion[];
    deliverableTemplates: readonly GacDd38DeliverableTemplate[];
    phaseMappings: readonly GacDd38PipelinePhaseMapping[];
    dataNatureMappings: readonly GacDd38DataNatureMapping[];
    stakeholderMappings: readonly GacDd38StakeholderMapping[];
}

export interface GacDd38NormativeCoverageSummary {
    standardId: GacDd38StandardId;
    blockCount: number;
    sectionCount: number;
    criticalSectionCount: number;
    mappedCriticalSectionCount: number;
    areaClassCount: number;
    checklistItemCount: number;
    phaseMappingCount: number;
    dataNatureMappingCount: number;
    stakeholderMappingCount: number;
    decisionCriterionCount: number;
    deliverableTemplateCount: number;
    mappedDecisionNodeCount: number;
    partialMappingIds: string[];
    missingMappingIds: string[];
    missingDecisionNodeIds: string[];
    presentBlockIds: GacDd38NormativeBlockId[];
    missingBlockIds: GacDd38NormativeBlockId[];
    missingCriticalSectionIds: string[];
    missingAreaClassIds: GacDd38AreaClassId[];
    foundationScore0To1000: number;
    status: 'profile-ready' | 'incomplete';
    blockers: string[];
}

export interface GacDd38NormativeProfileSummary extends GacDd38NormativeCoverageSummary {
    title: string;
    pageRangeLabel: string;
    criticalSections: Pick<GacDd38NormativeSection, 'id' | 'title' | 'pageStart' | 'pageEnd' | 'blockId'>[];
    areaClasses: Pick<GacDd38AreaClass, 'id' | 'label' | 'nextClassIds'>[];
    phaseMappings: Pick<GacDd38PipelinePhaseMapping, 'id' | 'label' | 'status' | 'sectionIds'>[];
    deliverableTemplates: Pick<GacDd38DeliverableTemplate, 'id' | 'label' | 'status' | 'sectionIds'>[];
    decisionCriteria: Pick<GacDd38DecisionCriterion, 'id' | 'label' | 'nodeId' | 'status' | 'sectionIds'>[];
}

export const GAC_DD38_NORMATIVE_BLOCKS: readonly GacDd38NormativeBlock[] = [
    {
        id: 'articles',
        title: 'Artigos 1 a 9',
        pageStart: 1,
        pageEnd: 3,
        rolePt: 'Contexto legal, aplicacao e responsabilidades gerais da decisao de diretoria.',
    },
    {
        id: 'annex-1',
        title: 'Anexo 1 - Protecao e monitoramento preventivo',
        pageStart: 6,
        pageEnd: 10,
        rolePt: 'Base auxiliar para prevencao, acompanhamento preventivo e protecao de areas.',
    },
    {
        id: 'annex-2',
        title: 'Anexo 2 - Gerenciamento de Areas Contaminadas',
        pageStart: 11,
        pageEnd: 58,
        rolePt: 'Corpo principal do Pipeline GAC/DD38, da classificacao inicial ao encerramento.',
    },
    {
        id: 'annex-a',
        title: 'Anexo A - Declaracao de Responsabilidade',
        pageStart: 58,
        pageEnd: 58,
        rolePt: 'Modelo de declaracao usado como entregavel formal do processo.',
    },
    {
        id: 'annex-b',
        title: 'Anexo B - Destinacao de materiais',
        pageStart: 59,
        pageEnd: 63,
        rolePt: 'Regras auxiliares para destinacao de solos, residuos e demais materiais.',
    },
    {
        id: 'annex-3',
        title: 'Anexo 3 - Licenciamento',
        pageStart: 64,
        pageEnd: 65,
        rolePt: 'Criterios auxiliares de licenciamento ambiental ligados ao gerenciamento.',
    },
];

export const GAC_DD38_NORMATIVE_SECTIONS: readonly GacDd38NormativeSection[] = [
    {
        id: 'articles-1-9',
        title: 'Artigos 1 a 9',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'articles',
        sectionNumber: 'Art. 1-9',
        pageStart: 1,
        pageEnd: 3,
        kind: 'legal-context',
        critical: true,
        summaryPt: 'Define o enquadramento legal, o alcance da decisao e as responsabilidades gerais.',
        expectedEvidence: [
            'Identificacao da area',
            'Responsavel legal',
            'Responsavel tecnico',
            'Base da decisao aplicada',
        ],
        relatedAreaClasses: ['AP', 'AS', 'ACI', 'ACRi', 'ACRe', 'ACRu', 'AME', 'AR'],
    },
    {
        id: 'annex-1-preventive-protection',
        title: 'Anexo 1 - Protecao e monitoramento preventivo',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'annex-1',
        pageStart: 6,
        pageEnd: 10,
        kind: 'checklist',
        critical: true,
        summaryPt: 'Organiza a camada preventiva antes ou ao lado do GAC principal.',
        expectedEvidence: ['Plano de acompanhamento preventivo', 'Registros de monitoramento', 'Medidas de protecao'],
        relatedAreaClasses: ['AP', 'AS'],
    },
    {
        id: 'annex-2-gac',
        title: 'Anexo 2 - Gerenciamento de Areas Contaminadas',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'annex-2',
        pageStart: 11,
        pageEnd: 58,
        kind: 'process-step',
        critical: true,
        summaryPt: 'Base normativa principal para classificar, investigar, intervir, monitorar e encerrar areas.',
        expectedEvidence: ['Classe da area', 'Etapa atual', 'Relatorio ou plano aplicavel', 'Decisao documentada'],
        relatedAreaClasses: ['AP', 'AS', 'ACI', 'ACRi', 'ACRe', 'ACRu', 'AME', 'AR'],
    },
    {
        id: 'annex-2-definitions',
        title: 'Definicoes',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'annex-2',
        pageStart: 11,
        pageEnd: 14,
        kind: 'definition',
        critical: true,
        summaryPt: 'Dicionario normativo usado para manter classe, decisao e evidencia com o mesmo sentido do PDF.',
        expectedEvidence: ['Termo normativo aplicado', 'Classe da area', 'Uso declarado quando aplicavel'],
        relatedAreaClasses: ['AP', 'AS', 'ACI', 'ACRi', 'ACRe', 'ACRu', 'AME', 'AR'],
    },
    {
        id: 'annex-2-preliminary-assessment',
        title: 'Avaliacao Preliminar',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'annex-2',
        sectionNumber: '4.1.3',
        pageStart: 17,
        pageEnd: 22,
        kind: 'process-step',
        critical: true,
        summaryPt: 'Levanta historico, uso, fontes potenciais e indicios para decidir se a area vira suspeita.',
        expectedEvidence: [
            'Relatorio de Avaliacao Preliminar',
            'Historico de uso',
            'Coordenadas e matriculas',
            'Vistorias e entrevistas',
        ],
        relatedAreaClasses: ['AP', 'AS'],
    },
    {
        id: 'annex-2-confirmatory-investigation',
        title: 'Investigacao Confirmatoria',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'annex-2',
        sectionNumber: '4.1.4',
        pageStart: 22,
        pageEnd: 26,
        kind: 'process-step',
        critical: true,
        summaryPt: 'Confirma ou descarta contaminacao por amostragem, analises e comparacao com valores aplicaveis.',
        expectedEvidence: [
            'Plano de Investigacao Confirmatoria',
            'Laudos laboratoriais',
            'Mapa de pontos',
            'Relatorio de Investigacao Confirmatoria',
        ],
        relatedAreaClasses: ['AS', 'ACI'],
    },
    {
        id: 'annex-2-detailed-investigation',
        title: 'Investigacao Detalhada',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'annex-2',
        sectionNumber: '4.1.5',
        pageStart: 26,
        pageEnd: 30,
        kind: 'process-step',
        critical: true,
        summaryPt: 'Delimita contaminacao, meios afetados, fontes, caminhos de exposicao e modelo conceitual.',
        expectedEvidence: [
            'Relatorio de Investigacao Detalhada',
            'Modelo Conceitual',
            'Mapas de pluma',
            'Dados analiticos consolidados',
        ],
        relatedAreaClasses: ['ACI', 'ACRi'],
    },
    {
        id: 'annex-2-risk-assessment',
        title: 'Avaliacao de Risco',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'annex-2',
        sectionNumber: '4.1.6',
        pageStart: 30,
        pageEnd: 35,
        kind: 'process-step',
        critical: true,
        summaryPt: 'Avalia risco para definir necessidade de intervencao e confirmar condicoes de uso seguro.',
        expectedEvidence: [
            'Relatorio de Avaliacao de Risco',
            'Cenarios de exposicao',
            'Receptores',
            'Conclusao de risco',
        ],
        relatedAreaClasses: ['ACI', 'ACRi'],
    },
    {
        id: 'annex-2-ecological-risk',
        title: 'Avaliacao de Risco Ecologico',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'annex-2',
        sectionNumber: '4.1.6.2',
        pageStart: 29,
        pageEnd: 31,
        kind: 'process-step',
        critical: false,
        summaryPt: 'Detalha quando a avaliacao de risco ecologico deve ser considerada dentro da etapa de risco.',
        expectedEvidence: [
            'Justificativa de aplicabilidade ecologica',
            'Ecossistema ou receptor ecologico avaliado',
            'Conclusao sobre necessidade de medida de intervencao',
        ],
        relatedAreaClasses: ['ACI', 'ACRi'],
    },
    {
        id: 'annex-2-legal-risk-standards',
        title: 'Identificacao de risco por padroes legais aplicaveis',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'annex-2',
        sectionNumber: '4.1.6.3',
        pageStart: 31,
        pageEnd: 32,
        kind: 'process-step',
        critical: false,
        summaryPt: 'Vincula concentracoes e pontos de conformidade aos padroes legais aplicaveis.',
        expectedEvidence: [
            'Pontos de conformidade',
            'Padroes legais aplicados',
            'Mapas ou secoes de risco',
            'Conclusao de necessidade de intervencao',
        ],
        relatedAreaClasses: ['ACI', 'ACRi'],
    },
    {
        id: 'annex-2-mathematical-modeling',
        title: 'Identificacao de risco com modelagem matematica',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'annex-2',
        sectionNumber: '4.1.6.4',
        pageStart: 32,
        pageEnd: 32,
        kind: 'process-step',
        critical: false,
        summaryPt: 'Referencia o uso de modelagem matematica para simular comportamento temporal da contaminacao.',
        expectedEvidence: [
            'Modelo matematico justificado',
            'Cenarios atual e futuro',
            'CMA por receptor ou hot spot',
            'Conclusao sobre intervencao',
        ],
        relatedAreaClasses: ['ACI', 'ACRi'],
    },
    {
        id: 'annex-2-emergency-measures',
        title: 'Identificacao de perigo e medidas emergenciais',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'annex-2',
        sectionNumber: '4.1.6.5',
        pageStart: 32,
        pageEnd: 33,
        kind: 'process-step',
        critical: false,
        summaryPt: 'Apoia a decisao de adotar e relatar medidas emergenciais quando houver perigo a vida ou saude.',
        expectedEvidence: [
            'Caracterizacao do perigo',
            'Medidas emergenciais adotadas',
            'Mapas de risco ou medicao de exposicao aguda',
            'Relatorio das medidas emergenciais',
        ],
        relatedAreaClasses: ['ACI', 'ACRi'],
    },
    {
        id: 'annex-2-lab-quality',
        title: 'Qualidade laboratorial e acreditacao',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'annex-2',
        sectionNumber: 'Observacoes 3 e 4',
        pageStart: 55,
        pageEnd: 55,
        kind: 'checklist',
        critical: false,
        summaryPt: 'Registra exigencias auxiliares de acreditacao para resultados laboratoriais e amostragens.',
        expectedEvidence: [
            'Laboratorio acreditado',
            'Metodo laboratorial aplicavel',
            'Rastreabilidade de amostragem',
            'Laudos analiticos',
        ],
        relatedAreaClasses: ['AS', 'ACI', 'ACRi', 'ACRe', 'AME'],
    },
    {
        id: 'annex-2-intervention-plan',
        title: 'Plano de Intervencao',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'annex-2',
        sectionNumber: '4.2.1',
        pageStart: 35,
        pageEnd: 44,
        kind: 'deliverable',
        critical: true,
        summaryPt: 'Define medidas de remediacao, controle institucional, engenharia e metas de intervencao.',
        expectedEvidence: ['Plano de Intervencao', 'Metas de remediacao', 'Medidas de controle', 'Cronograma'],
        relatedAreaClasses: ['ACRi', 'ACRe', 'ACRu'],
    },
    {
        id: 'annex-2-intervention-execution',
        title: 'Execucao do Plano de Intervencao',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'annex-2',
        sectionNumber: '4.2.2',
        pageStart: 44,
        pageEnd: 47,
        kind: 'process-step',
        critical: true,
        summaryPt: 'Registra implantacao, desempenho e acompanhamento das medidas aprovadas.',
        expectedEvidence: [
            'Projeto Executivo',
            'Relatorio de Instalacao',
            'Relatorio de Desempenho',
            'Relatorios de Acompanhamento',
        ],
        relatedAreaClasses: ['ACRe', 'ACRu'],
    },
    {
        id: 'annex-2-closure-monitoring',
        title: 'Monitoramento para Encerramento',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'annex-2',
        sectionNumber: '4.2.3',
        pageStart: 47,
        pageEnd: 48,
        kind: 'process-step',
        critical: true,
        summaryPt: 'Comprova estabilidade e atendimento das condicoes para seguir ao encerramento.',
        expectedEvidence: ['Relatorios de Monitoramento para Encerramento', 'Series temporais', 'Atendimento de metas'],
        relatedAreaClasses: ['AME'],
    },
    {
        id: 'annex-2-rehabilitation-term',
        title: 'Termo de Reabilitacao para Uso Declarado',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'annex-2',
        sectionNumber: '4.2.4',
        pageStart: 48,
        pageEnd: 50,
        kind: 'licensing',
        critical: true,
        summaryPt: 'Formaliza a reabilitacao, uso declarado, restricoes e averbacao quando aplicavel.',
        expectedEvidence: [
            'Termo de Reabilitacao',
            'Uso declarado',
            'Averbacao ou registro aplicavel',
            'Restricoes remanescentes',
        ],
        relatedAreaClasses: ['AR'],
    },
    {
        id: 'annex-a-declaration',
        title: 'Anexo A - Declaracao de Responsabilidade',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'annex-a',
        pageStart: 58,
        pageEnd: 58,
        kind: 'deliverable',
        critical: true,
        summaryPt: 'Modelo de declaracao usado para responsabilizacao formal no processo.',
        expectedEvidence: ['Declaracao de Responsabilidade', 'Assinaturas', 'Identificacao do responsavel'],
        relatedAreaClasses: ['AS', 'ACI', 'ACRi', 'ACRe', 'ACRu', 'AME', 'AR'],
    },
    {
        id: 'annex-b-material-destination',
        title: 'Anexo B - Destinacao de Materiais',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'annex-b',
        pageStart: 59,
        pageEnd: 63,
        kind: 'material-destination',
        critical: true,
        summaryPt: 'Define cuidados e evidencias para destinacao de materiais ligados a area contaminada.',
        expectedEvidence: [
            'Plano de Destinacao de Materiais',
            'Caracterizacao do material',
            'Destino autorizado',
            'Registros de transporte/destinacao',
        ],
        relatedAreaClasses: ['ACI', 'ACRi', 'ACRe', 'ACRu'],
    },
    {
        id: 'annex-3-licensing',
        title: 'Anexo 3 - Licenciamento Ambiental',
        standardId: GAC_DD38_STANDARD_ID,
        source: GAC_DD38_STANDARD_SOURCE,
        blockId: 'annex-3',
        pageStart: 64,
        pageEnd: 65,
        kind: 'licensing',
        critical: true,
        summaryPt: 'Apoia decisoes de licenciamento relacionadas a intervencao, reutilizacao ou encerramento.',
        expectedEvidence: [
            'Licenca aplicavel',
            'Restricoes de uso',
            'Condicionantes',
            'Manifestacao do orgao quando aplicavel',
        ],
        relatedAreaClasses: ['ACRu', 'AME', 'AR'],
    },
];

export const GAC_DD38_CRITICAL_SECTION_IDS: readonly string[] = GAC_DD38_NORMATIVE_SECTIONS.filter(
    (section) => section.critical,
).map((section) => section.id);

export const GAC_DD38_AREA_CLASSES: readonly GacDd38AreaClass[] = [
    {
        id: 'AP',
        label: 'Area com Potencial de Contaminacao',
        summaryPt: 'Area onde atividades ou historico indicam potencial de contaminacao.',
        entryCriteriaPt: 'Historico, uso ou atividade com potencial de contaminacao identificado.',
        exitCriteriaPt: 'Avaliacao preliminar conclui ausencia de suspeita ou evolui para AS.',
        sectionIds: ['articles-1-9', 'annex-1-preventive-protection', 'annex-2-preliminary-assessment'],
        previousClassIds: [],
        nextClassIds: ['AS'],
    },
    {
        id: 'AS',
        label: 'Area Suspeita de Contaminacao',
        summaryPt: 'Area com indicios que justificam investigacao confirmatoria.',
        entryCriteriaPt: 'Avaliacao preliminar encontra indicios de contaminacao.',
        exitCriteriaPt: 'Investigacao confirmatoria descarta contaminacao ou evolui para ACI.',
        sectionIds: ['annex-2-preliminary-assessment', 'annex-2-confirmatory-investigation'],
        previousClassIds: ['AP'],
        nextClassIds: ['ACI', 'AR'],
    },
    {
        id: 'ACI',
        label: 'Area Contaminada sob Investigacao',
        summaryPt: 'Area com contaminacao confirmada e investigacao/risco ainda em desenvolvimento.',
        entryCriteriaPt: 'Investigacao confirmatoria identifica contaminacao acima do criterio aplicavel.',
        exitCriteriaPt: 'Investigacao detalhada e risco definem necessidade de intervencao ou reabilitacao.',
        sectionIds: ['annex-2-confirmatory-investigation', 'annex-2-detailed-investigation', 'annex-2-risk-assessment'],
        previousClassIds: ['AS'],
        nextClassIds: ['ACRi', 'AME', 'AR'],
    },
    {
        id: 'ACRi',
        label: 'Area Contaminada com Risco Confirmado',
        summaryPt: 'Area em que o risco exige medidas de intervencao, controle ou remediacao.',
        entryCriteriaPt: 'Avaliacao de risco confirma risco ou necessidade de intervencao.',
        exitCriteriaPt: 'Plano aprovado leva a remediacao, reutilizacao ou monitoramento.',
        sectionIds: ['annex-2-risk-assessment', 'annex-2-intervention-plan'],
        previousClassIds: ['ACI'],
        nextClassIds: ['ACRe', 'ACRu', 'AME'],
    },
    {
        id: 'ACRe',
        label: 'Area Contaminada em Processo de Remediacao',
        summaryPt: 'Area em execucao de medidas de remediacao ou controle aprovadas.',
        entryCriteriaPt: 'Plano de intervencao define remediacao ou medida de controle executavel.',
        exitCriteriaPt: 'Evidencia de desempenho permite monitoramento para encerramento.',
        sectionIds: ['annex-2-intervention-plan', 'annex-2-intervention-execution'],
        previousClassIds: ['ACRi'],
        nextClassIds: ['AME'],
    },
    {
        id: 'ACRu',
        label: 'Area Contaminada em Processo de Reutilizacao',
        summaryPt: 'Area com reutilizacao condicionada a controles, licenciamento ou medidas especificas.',
        entryCriteriaPt: 'Uso pretendido demanda controle e avaliacao normativa antes da reutilizacao.',
        exitCriteriaPt: 'Condicoes, licencas e controles permitem monitoramento ou reabilitacao.',
        sectionIds: ['annex-2-intervention-plan', 'annex-b-material-destination', 'annex-3-licensing'],
        previousClassIds: ['ACRi'],
        nextClassIds: ['AME', 'AR'],
    },
    {
        id: 'AME',
        label: 'Area em Monitoramento para Encerramento',
        summaryPt: 'Area em fase de comprovacao final antes da reabilitacao.',
        entryCriteriaPt: 'Medidas implantadas e metas em acompanhamento para encerramento.',
        exitCriteriaPt: 'Monitoramento comprova estabilidade e atendimento das condicoes.',
        sectionIds: ['annex-2-closure-monitoring', 'annex-3-licensing'],
        previousClassIds: ['ACI', 'ACRi', 'ACRe', 'ACRu'],
        nextClassIds: ['AR'],
    },
    {
        id: 'AR',
        label: 'Area Reabilitada para Uso Declarado',
        summaryPt: 'Estado final com uso declarado, termo emitido e restricoes registradas quando existirem.',
        entryCriteriaPt: 'Condicoes de encerramento atendidas e termo de reabilitacao emitido.',
        exitCriteriaPt: 'Classe final; novas suspeitas reabrem avaliacao conforme a norma.',
        sectionIds: ['annex-2-rehabilitation-term', 'annex-a-declaration', 'annex-3-licensing'],
        previousClassIds: ['AS', 'ACI', 'ACRu', 'AME'],
        nextClassIds: [],
    },
];

export const GAC_DD38_BASE_CHECKLIST_ITEMS: readonly GacDd38ChecklistItem[] = [
    {
        id: 'base-section-reference',
        label: 'Secao DD-038 vinculada',
        sectionIds: ['annex-2-gac'],
        required: true,
        evidenceKind: 'registry',
        responsibleRole: 'responsavel-tecnico',
        relatedAreaClasses: ['AP', 'AS', 'ACI', 'ACRi', 'ACRe', 'ACRu', 'AME', 'AR'],
    },
    {
        id: 'base-area-class-before-after',
        label: 'Classe da area antes e depois da etapa',
        sectionIds: ['annex-2-definitions'],
        required: true,
        evidenceKind: 'registry',
        responsibleRole: 'responsavel-tecnico',
        relatedAreaClasses: ['AP', 'AS', 'ACI', 'ACRi', 'ACRe', 'ACRu', 'AME', 'AR'],
    },
    {
        id: 'base-responsible-roles',
        label: 'Responsaveis legal e tecnico identificados',
        sectionIds: ['articles-1-9', 'annex-a-declaration'],
        required: true,
        evidenceKind: 'declaration',
        responsibleRole: 'responsavel-legal',
        relatedAreaClasses: ['AS', 'ACI', 'ACRi', 'ACRe', 'ACRu', 'AME', 'AR'],
    },
    {
        id: 'base-files-evidence-target',
        label: 'Evidencia guardada em Files sem caminho local do PDF',
        sectionIds: ['annex-2-gac'],
        required: true,
        evidenceKind: 'file-reference',
        responsibleRole: 'responsavel-tecnico',
        relatedAreaClasses: ['AS', 'ACI', 'ACRi', 'ACRe', 'ACRu', 'AME', 'AR'],
    },
    {
        id: 'base-material-destination',
        label: 'Destino de materiais documentado quando aplicavel',
        sectionIds: ['annex-b-material-destination'],
        required: true,
        evidenceKind: 'plan',
        responsibleRole: 'responsavel-tecnico',
        relatedAreaClasses: ['ACI', 'ACRi', 'ACRe', 'ACRu'],
    },
    {
        id: 'base-licensing-constraints',
        label: 'Licenciamento e restricoes de uso registrados quando aplicavel',
        sectionIds: ['annex-3-licensing', 'annex-2-rehabilitation-term'],
        required: true,
        evidenceKind: 'registry',
        responsibleRole: 'cetesb',
        relatedAreaClasses: ['ACRu', 'AME', 'AR'],
    },
];

export const GAC_DD38_PHASE_MAPPINGS: readonly GacDd38PipelinePhaseMapping[] = [
    {
        id: 'detection',
        label: 'Deteccao',
        sourcePhaseLabel: 'Deteccao',
        status: 'partial',
        sectionIds: [
            'articles-1-9',
            'annex-1-preventive-protection',
            'annex-2-definitions',
            'annex-2-preliminary-assessment',
            'annex-2-emergency-measures',
        ],
        deliverableTemplateIds: ['preliminary-assessment-report', 'emergency-measures-report'],
        relatedAreaClasses: ['AP', 'AS'],
        summaryPt: 'Fase importada do VPP para triagem, registros iniciais, indicios e medidas urgentes.',
        gapReasonPt: 'DD-038 usa etapas normativas; "Deteccao" e uma agregacao operacional do diagrama.',
    },
    {
        id: 'characterization',
        label: 'Caracterizacao',
        sourcePhaseLabel: 'Caracterizacao',
        status: 'mapped',
        sectionIds: [
            'annex-2-preliminary-assessment',
            'annex-2-confirmatory-investigation',
            'annex-2-detailed-investigation',
            'annex-2-risk-assessment',
            'annex-2-ecological-risk',
            'annex-2-legal-risk-standards',
            'annex-2-mathematical-modeling',
            'annex-2-lab-quality',
        ],
        deliverableTemplateIds: [
            'confirmatory-investigation-report',
            'detailed-investigation-report',
            'risk-assessment-report',
        ],
        relatedAreaClasses: ['AS', 'ACI', 'ACRi'],
        summaryPt: 'Fase que concentra investigacao, qualidade analitica, modelo conceitual e avaliacao de risco.',
    },
    {
        id: 'remediation',
        label: 'Remediacao',
        sourcePhaseLabel: 'Remediacao',
        status: 'mapped',
        sectionIds: [
            'annex-2-intervention-plan',
            'annex-2-intervention-execution',
            'annex-b-material-destination',
        ],
        deliverableTemplateIds: [
            'intervention-plan',
            'remediation-execution-report',
            'material-destination-plan',
        ],
        relatedAreaClasses: ['ACRi', 'ACRe', 'ACRu'],
        summaryPt: 'Fase que seleciona, aprova e executa medidas de intervencao e destinacao de materiais.',
    },
    {
        id: 'follow-up',
        label: 'Acompanhamento',
        sourcePhaseLabel: 'Acompanhamento',
        status: 'mapped',
        sectionIds: [
            'annex-2-intervention-execution',
            'annex-2-closure-monitoring',
        ],
        deliverableTemplateIds: ['closure-monitoring-report'],
        relatedAreaClasses: ['ACRe', 'ACRu', 'AME'],
        summaryPt: 'Fase de acompanhamento de desempenho, controles e monitoramento para encerramento.',
    },
    {
        id: 'closure',
        label: 'Fechamento',
        sourcePhaseLabel: 'Fechamento',
        status: 'mapped',
        sectionIds: [
            'annex-2-closure-monitoring',
            'annex-2-rehabilitation-term',
            'annex-a-declaration',
            'annex-3-licensing',
        ],
        deliverableTemplateIds: [
            'rehabilitation-term',
            'responsibility-declaration',
            'licensing-constraint-record',
        ],
        relatedAreaClasses: ['AME', 'AR'],
        summaryPt: 'Fase de comprovacao final, termo de reabilitacao, declaracao e restricoes remanescentes.',
    },
];

export const GAC_DD38_DATA_NATURE_MAPPINGS: readonly GacDd38DataNatureMapping[] = [
    {
        id: 'field',
        label: 'Campo',
        sourceLabels: ['Fichas de Campo', 'amostras', 'vistoria'],
        status: 'mapped',
        sectionIds: ['annex-2-preliminary-assessment', 'annex-2-confirmatory-investigation', 'annex-2-detailed-investigation'],
        checklistItemIds: ['base-files-evidence-target'],
        summaryPt: 'Evidencias de vistoria, amostragem, entrevistas e observacoes de campo.',
    },
    {
        id: 'laboratory',
        label: 'Laboratorio',
        sourceLabels: ['LIMS', 'PDF', 'laudos', 'metodo laboratorial'],
        status: 'mapped',
        sectionIds: ['annex-2-confirmatory-investigation', 'annex-2-detailed-investigation', 'annex-2-lab-quality'],
        checklistItemIds: ['base-files-evidence-target'],
        summaryPt: 'Laudos, metodos, rastreabilidade de amostragem e acreditacao laboratorial.',
    },
    {
        id: 'geospatial',
        label: 'Geoespacial',
        sourceLabels: ['GIS', 'mapa', 'planta', 'coordenadas'],
        status: 'mapped',
        sectionIds: [
            'annex-2-preliminary-assessment',
            'annex-2-detailed-investigation',
            'annex-2-risk-assessment',
            'annex-2-legal-risk-standards',
        ],
        checklistItemIds: ['base-files-evidence-target'],
        summaryPt: 'Mapas, pontos, secoes e delimitacao espacial de fontes, plumas, receptores e riscos.',
    },
    {
        id: 'document-regulatory',
        label: 'Documental / regulatorio',
        sourceLabels: ['Documentos', 'relatorios', 'declaracao', 'termo', 'licenca'],
        status: 'mapped',
        sectionIds: ['articles-1-9', 'annex-2-gac', 'annex-a-declaration', 'annex-3-licensing'],
        checklistItemIds: ['base-section-reference', 'base-responsible-roles', 'base-licensing-constraints'],
        summaryPt: 'Relatorios, declaracoes, termos, licencas, restricoes e documentos protocolados.',
    },
    {
        id: 'tabular-analytical',
        label: 'Tabular / analitico',
        sourceLabels: ['EDD', 'planilha', 'concentracoes', 'series temporais'],
        status: 'mapped',
        sectionIds: [
            'annex-2-confirmatory-investigation',
            'annex-2-detailed-investigation',
            'annex-2-risk-assessment',
            'annex-2-closure-monitoring',
        ],
        checklistItemIds: ['base-files-evidence-target'],
        summaryPt: 'Dados analiticos em EDD, tabelas de concentracao, CMA, metas e series de monitoramento.',
    },
    {
        id: 'enterprise-system',
        label: 'Sistema corporativo',
        sourceLabels: ['ERP', 'Sistemas Manutencao', 'SIPOL', 'SIACR'],
        status: 'partial',
        sectionIds: ['annex-2-gac', 'annex-2-preliminary-assessment'],
        checklistItemIds: ['base-files-evidence-target'],
        summaryPt: 'Sistemas corporativos sustentam rastreabilidade operacional, mas nem todo ERP e item textual da DD-038.',
        gapReasonPt: 'Manter como parcial ate o pack informar qual sistema e fonte oficial, operacional ou somente auxiliar.',
    },
    {
        id: 'image-evidence',
        label: 'Imagem / evidencia visual',
        sourceLabels: ['Imagens', 'foto', 'registro visual'],
        status: 'mapped',
        sectionIds: ['annex-2-preliminary-assessment', 'annex-2-detailed-investigation', 'annex-2-legal-risk-standards'],
        checklistItemIds: ['base-files-evidence-target'],
        summaryPt: 'Registros visuais, fotografias, plantas e evidencias de distribuicao espacial.',
    },
    {
        id: 'technical-drawing',
        label: 'Projeto / desenho tecnico',
        sourceLabels: ['CAD', 'COREL', 'planta', 'projeto executivo'],
        status: 'mapped',
        sectionIds: ['annex-2-detailed-investigation', 'annex-2-intervention-plan', 'annex-2-intervention-execution'],
        checklistItemIds: ['base-files-evidence-target'],
        summaryPt: 'Plantas, secoes, desenhos tecnicos e projeto executivo de sistemas ou controles.',
    },
    {
        id: 'model-calculation',
        label: 'Modelo / calculo',
        sourceLabels: ['modelo conceitual', 'modelagem matematica', 'CMA', 'risco'],
        status: 'mapped',
        sectionIds: ['annex-2-detailed-investigation', 'annex-2-risk-assessment', 'annex-2-mathematical-modeling'],
        checklistItemIds: ['base-files-evidence-target'],
        summaryPt: 'Modelo conceitual, calculos de risco, modelagem matematica e metas tecnicas.',
    },
];

export const GAC_DD38_STAKEHOLDER_MAPPINGS: readonly GacDd38StakeholderMapping[] = [
    {
        id: 'legal-responsible',
        label: 'Responsavel Legal',
        sourceLaneLabel: 'Resp. Legal',
        role: 'responsavel-legal',
        status: 'mapped',
        sectionIds: ['articles-1-9', 'annex-2-gac', 'annex-a-declaration', 'annex-2-emergency-measures'],
        checklistItemIds: ['base-responsible-roles'],
        summaryPt: 'Executa obrigacoes, adota medidas emergenciais quando aplicavel e assina declaracoes formais.',
    },
    {
        id: 'technical-responsible',
        label: 'Responsavel Tecnico',
        sourceLaneLabel: 'Responsavel Tecnico',
        role: 'responsavel-tecnico',
        status: 'mapped',
        sectionIds: ['articles-1-9', 'annex-2-gac', 'annex-a-declaration', 'annex-2-lab-quality'],
        checklistItemIds: ['base-responsible-roles', 'base-files-evidence-target'],
        summaryPt: 'Define abordagem tecnica, consolida evidencias, relatorios, modelos e conclusoes.',
    },
    {
        id: 'field-team',
        label: 'Campo',
        sourceLaneLabel: 'Campo',
        role: 'campo',
        status: 'partial',
        sectionIds: ['annex-2-preliminary-assessment', 'annex-2-confirmatory-investigation', 'annex-2-detailed-investigation'],
        checklistItemIds: ['base-files-evidence-target'],
        summaryPt: 'Produz evidencias de vistoria e amostragem sob responsabilidade tecnica.',
        gapReasonPt: 'DD-038 referencia responsaveis legais/tecnicos; campo e raia operacional importada do VPP.',
    },
    {
        id: 'laboratory',
        label: 'Laboratorio',
        sourceLaneLabel: 'Laboratorio',
        role: 'laboratorio',
        status: 'partial',
        sectionIds: ['annex-2-confirmatory-investigation', 'annex-2-detailed-investigation', 'annex-2-lab-quality'],
        checklistItemIds: ['base-files-evidence-target'],
        summaryPt: 'Fornece laudos e resultados, com acreditacao quando aplicavel.',
        gapReasonPt: 'Laboratorio e fonte de evidencia, mas a responsabilidade formal segue no responsavel tecnico/legal.',
    },
    {
        id: 'specialized-activities',
        label: 'Atividades Especializadas',
        sourceLaneLabel: 'Atividades Especializadas',
        role: 'responsavel-tecnico',
        status: 'partial',
        sectionIds: ['annex-2-detailed-investigation', 'annex-2-risk-assessment', 'annex-2-mathematical-modeling'],
        checklistItemIds: ['base-files-evidence-target'],
        summaryPt: 'Atividades tecnicas auxiliares: GIS, modelagem, EDD, desenhos e calculos.',
        gapReasonPt: 'Raia operacional agregada; o perfil nao presume fornecedor ou especialista especifico.',
    },
    {
        id: 'public-agencies',
        label: 'Orgaos Publicos',
        sourceLaneLabel: 'Orgaos Publicos',
        role: 'cetesb',
        status: 'mapped',
        sectionIds: ['articles-1-9', 'annex-2-gac', 'annex-2-rehabilitation-term', 'annex-3-licensing'],
        checklistItemIds: ['base-section-reference', 'base-licensing-constraints'],
        summaryPt: 'Camada de avaliacao, fiscalizacao, aceite ou exigencia tecnica ligada a Cetesb e orgaos correlatos.',
    },
];

export const GAC_DD38_DECISION_NODE_IDS = [
    'RQHURZGGAqAeHycC',
    'TPK4JZGGAqAeH0LM',
    'h9P1AZGGAqACZ.Za',
    '0zyTJZGGAqAeH3fM',
    'fjNTJZGGAqAeH32S',
    'JiLspZGGAqAeHyaT',
    'li8apZGGAqAeHzNc',
    'bxdk5ZGGAqAeH1Eq',
    '8qLJ5ZGGAqAeHwPP',
    'QDFyFZGGAqAeH26W',
    'B22KFZGGAqAeHxDo',
    'T6hPJZGGAqAeHw6x',
    '8.5QpZGGAqAeH0E_',
    'QRxPJZGGAqAeHxBV',
    'wlpPJZGGAqAeHxGF',
] as const;

export const GAC_DD38_DECISION_CRITERIA: readonly GacDd38DecisionCriterion[] = [
    {
        id: 'decision-detection-agency-acceptance',
        label: 'Aceite DD-038 da fase de deteccao',
        nodeId: 'RQHURZGGAqAeHycC',
        phaseId: 'detection',
        stakeholderId: 'public-agencies',
        status: 'partial',
        sectionIds: ['annex-2-preliminary-assessment', 'annex-2-confirmatory-investigation', 'annex-a-declaration'],
        requiredEvidence: ['Relatorio de Avaliacao Preliminar', 'indicios de contaminacao', 'Declaracao de Responsabilidade'],
        responsibleRole: 'cetesb',
        passConditionPt: 'Relatorio inicial aceito ou demanda atendida para seguir a investigacao aplicavel.',
        failConditionPt: 'Exigencias tecnicas pendentes ou evidencia inicial insuficiente para classificar/prosseguir.',
        gapReasonPt: 'O VPP usa rotulo generico "Aceite?"; a referencia normativa e inferida por fase e raia.',
    },
    {
        id: 'decision-emergency-action-required',
        label: 'Acoes emergenciais exigidas',
        nodeId: 'TPK4JZGGAqAeH0LM',
        phaseId: 'detection',
        stakeholderId: 'legal-responsible',
        status: 'mapped',
        sectionIds: ['annex-2-emergency-measures', 'articles-1-9'],
        requiredEvidence: ['Caracterizacao do perigo', 'medidas emergenciais adotadas', 'Relatorio das Medidas Emergenciais'],
        responsibleRole: 'responsavel-legal',
        passConditionPt: 'Perigo identificado recebe medida emergencial documentada e comunicavel.',
        failConditionPt: 'Ausencia de perigo imediato ou evidencia insuficiente para acionar medida emergencial.',
    },
    {
        id: 'decision-characterization-agency-acceptance-1',
        label: 'Aceite DD-038 da caracterizacao preliminar/confirmatoria',
        nodeId: 'h9P1AZGGAqACZ.Za',
        phaseId: 'characterization',
        stakeholderId: 'public-agencies',
        status: 'partial',
        sectionIds: ['annex-2-preliminary-assessment', 'annex-2-confirmatory-investigation', 'annex-a-declaration'],
        requiredEvidence: ['Relatorio de Avaliacao Preliminar', 'Plano/Relatorio de Investigacao Confirmatoria', 'laudos'],
        responsibleRole: 'cetesb',
        passConditionPt: 'Evidencias de caracterizacao inicial aceitas para confirmar, descartar ou aprofundar a investigacao.',
        failConditionPt: 'Dados de campo/laboratorio insuficientes ou relatorio exige complementacao.',
        gapReasonPt: 'Rotulo VPP "Aceite" sem subtipo; criterio fica ancorado nos entregaveis adjacentes da fase.',
    },
    {
        id: 'decision-characterization-agency-acceptance-2',
        label: 'Aceite DD-038 da investigacao confirmatoria',
        nodeId: '0zyTJZGGAqAeH3fM',
        phaseId: 'characterization',
        stakeholderId: 'public-agencies',
        status: 'partial',
        sectionIds: ['annex-2-confirmatory-investigation', 'annex-2-lab-quality', 'annex-a-declaration'],
        requiredEvidence: ['Mapa de pontos', 'laudos acreditados', 'comparacao com criterios aplicaveis'],
        responsibleRole: 'cetesb',
        passConditionPt: 'Investigacao confirmatoria tem dados rastreaveis e conclusao de classe/proximo passo.',
        failConditionPt: 'Pontos, metodos ou laudos nao sustentam a confirmacao/descarte da contaminacao.',
        gapReasonPt: 'Rotulo VPP "Aceite" sem subtipo; referencia refinada por contexto de caracterizacao.',
    },
    {
        id: 'decision-characterization-agency-acceptance-3',
        label: 'Aceite DD-038 da investigacao detalhada e risco',
        nodeId: 'fjNTJZGGAqAeH32S',
        phaseId: 'characterization',
        stakeholderId: 'public-agencies',
        status: 'partial',
        sectionIds: ['annex-2-detailed-investigation', 'annex-2-risk-assessment', 'annex-a-declaration'],
        requiredEvidence: ['Modelo Conceitual', 'delimitacao de pluma', 'receptores e cenarios de exposicao'],
        responsibleRole: 'cetesb',
        passConditionPt: 'Modelo conceitual e avaliacao de risco sustentam intervencao, AME ou reabilitacao.',
        failConditionPt: 'Investigacao detalhada ou avaliacao de risco nao fecha fontes, vias, receptores ou conclusao.',
        gapReasonPt: 'Rotulo VPP "Aceite" sem subtipo; referencia refinada por entregaveis adjacentes.',
    },
    {
        id: 'decision-laboratory-method',
        label: 'Metodo laboratorial aplicavel',
        nodeId: 'JiLspZGGAqAeHyaT',
        phaseId: 'characterization',
        stakeholderId: 'technical-responsible',
        status: 'mapped',
        sectionIds: ['annex-2-confirmatory-investigation', 'annex-2-detailed-investigation', 'annex-2-lab-quality'],
        requiredEvidence: ['Metodo laboratorial', 'acreditacao aplicavel', 'laudos e cadeia de custodia'],
        responsibleRole: 'responsavel-tecnico',
        passConditionPt: 'Metodo e laboratorio sustentam o dado analitico usado na decisao.',
        failConditionPt: 'Metodo, acreditacao ou rastreabilidade nao demonstrados para o uso pretendido.',
    },
    {
        id: 'decision-characterization-type',
        label: 'Tipo de investigacao/evidencia definido',
        nodeId: 'li8apZGGAqAeHzNc',
        phaseId: 'characterization',
        stakeholderId: 'technical-responsible',
        status: 'mapped',
        sectionIds: ['annex-2-preliminary-assessment', 'annex-2-confirmatory-investigation', 'annex-2-detailed-investigation'],
        requiredEvidence: ['Tipo de meio avaliado', 'objetivo da etapa', 'natureza de dado associada'],
        responsibleRole: 'responsavel-tecnico',
        passConditionPt: 'Tipo de evidencia/investigacao e coerente com a etapa e classe da area.',
        failConditionPt: 'Tipo de evidencia nao cobre o objetivo normativo da etapa atual.',
    },
    {
        id: 'decision-high-resolution-needed',
        label: 'Necessidade de alta resolucao',
        nodeId: 'bxdk5ZGGAqAeH1Eq',
        phaseId: 'characterization',
        stakeholderId: 'technical-responsible',
        status: 'mapped',
        sectionIds: ['annex-2-detailed-investigation', 'annex-2-risk-assessment', 'annex-2-mathematical-modeling'],
        requiredEvidence: ['Incerteza do modelo conceitual', 'delimitacao espacial', 'justificativa tecnica de alta resolucao'],
        responsibleRole: 'responsavel-tecnico',
        passConditionPt: 'Alta resolucao e necessaria para reduzir incerteza relevante de fonte, pluma, risco ou intervencao.',
        failConditionPt: 'Investigacao convencional ja atende ao objetivo ou falta justificativa tecnica.',
    },
    {
        id: 'decision-risk-confirmed',
        label: 'Risco confirmado',
        nodeId: '8qLJ5ZGGAqAeHwPP',
        phaseId: 'characterization',
        stakeholderId: 'public-agencies',
        status: 'mapped',
        sectionIds: ['annex-2-risk-assessment', 'annex-2-legal-risk-standards', 'annex-2-intervention-plan'],
        requiredEvidence: ['Conclusao de risco', 'receptores', 'CMA/padroes aplicaveis', 'necessidade de intervencao'],
        responsibleRole: 'cetesb',
        passConditionPt: 'Risco acima do aceitavel ou situacao normativa leva a ACRi e plano de intervencao.',
        failConditionPt: 'Risco nao confirmado e criterios permitem AME, monitoramento ou reabilitacao conforme etapa.',
    },
    {
        id: 'decision-ecological-risk-required',
        label: 'Avaliacao de risco ecologico necessaria',
        nodeId: 'QDFyFZGGAqAeH26W',
        phaseId: 'characterization',
        stakeholderId: 'technical-responsible',
        status: 'mapped',
        sectionIds: ['annex-2-risk-assessment', 'annex-2-ecological-risk'],
        requiredEvidence: ['Ecossistema natural sob influencia', 'receptores ecologicos', 'justificativa de aplicabilidade'],
        responsibleRole: 'responsavel-tecnico',
        passConditionPt: 'Existe receptor/ecossistema aplicavel e a avaliacao ecologica deve ser executada ou anexada.',
        failConditionPt: 'Nao ha receptor ecologico aplicavel ou justificativa tecnica dispensa a avaliacao.',
    },
    {
        id: 'decision-mathematical-modeling-required',
        label: 'Modelagem matematica necessaria',
        nodeId: 'B22KFZGGAqAeHxDo',
        phaseId: 'characterization',
        stakeholderId: 'technical-responsible',
        status: 'mapped',
        sectionIds: ['annex-2-risk-assessment', 'annex-2-mathematical-modeling'],
        requiredEvidence: ['Cenario de transporte', 'parametros de modelo', 'CMA por receptor/hot spot'],
        responsibleRole: 'responsavel-tecnico',
        passConditionPt: 'Modelagem e necessaria para prever comportamento temporal ou definir intervencao.',
        failConditionPt: 'Dados e cenarios nao justificam modelagem ou faltam parametros para uso defensavel.',
    },
    {
        id: 'decision-remediation-plan-acceptance',
        label: 'Aceite DD-038 do plano de intervencao',
        nodeId: 'T6hPJZGGAqAeHw6x',
        phaseId: 'remediation',
        stakeholderId: 'public-agencies',
        status: 'partial',
        sectionIds: ['annex-2-intervention-plan', 'annex-b-material-destination', 'annex-a-declaration'],
        requiredEvidence: ['Plano de Intervencao', 'metas', 'cronograma', 'medidas de controle/remediacao'],
        responsibleRole: 'cetesb',
        passConditionPt: 'Plano de Intervencao aceito para execucao ou parecer tecnico aplicavel.',
        failConditionPt: 'Plano incompleto, sem metas, controles, projeto ou anexos necessarios.',
        gapReasonPt: 'Rotulo VPP "Aceite" sem subtipo; fase remediacao ancora o criterio no Plano de Intervencao.',
    },
    {
        id: 'decision-remediation-execution-acceptance',
        label: 'Aceite DD-038 da execucao de remediacao',
        nodeId: '8.5QpZGGAqAeH0E_',
        phaseId: 'remediation',
        stakeholderId: 'public-agencies',
        status: 'partial',
        sectionIds: ['annex-2-intervention-execution', 'annex-b-material-destination'],
        requiredEvidence: ['Relatorio de instalacao', 'relatorio de desempenho', 'acompanhamento de controles'],
        responsibleRole: 'cetesb',
        passConditionPt: 'Execucao demonstra premissas, desempenho e controles para seguir acompanhamento/AME.',
        failConditionPt: 'Instalacao, desempenho ou controles nao demonstram validade do Plano de Intervencao.',
        gapReasonPt: 'Rotulo VPP "Aceite" sem subtipo; referencia refinada pela fase remediacao.',
    },
    {
        id: 'decision-follow-up-acceptance',
        label: 'Aceite DD-038 do acompanhamento',
        nodeId: 'QRxPJZGGAqAeHxBV',
        phaseId: 'follow-up',
        stakeholderId: 'public-agencies',
        status: 'mapped',
        sectionIds: ['annex-2-intervention-execution', 'annex-2-closure-monitoring'],
        requiredEvidence: ['Series de monitoramento', 'atingimento de metas', 'relatorios de acompanhamento'],
        responsibleRole: 'cetesb',
        passConditionPt: 'Acompanhamento comprova desempenho e condicoes para monitoramento de encerramento.',
        failConditionPt: 'Resultados indicam revisao de medidas, continuidade ou nova intervencao.',
    },
    {
        id: 'decision-closure-acceptance',
        label: 'Aceite DD-038 do fechamento/reabilitacao',
        nodeId: 'wlpPJZGGAqAeHxGF',
        phaseId: 'closure',
        stakeholderId: 'public-agencies',
        status: 'mapped',
        sectionIds: ['annex-2-closure-monitoring', 'annex-2-rehabilitation-term', 'annex-a-declaration', 'annex-3-licensing'],
        requiredEvidence: ['Relatorios finais de monitoramento', 'uso declarado', 'restricoes remanescentes', 'termo/declaracao'],
        responsibleRole: 'cetesb',
        passConditionPt: 'Condicoes finais permitem Termo de Reabilitacao para Uso Declarado.',
        failConditionPt: 'Metas, restricoes, uso declarado ou documentacao final ainda nao sustentam AR.',
    },
];

export const GAC_DD38_DELIVERABLE_TEMPLATES: readonly GacDd38DeliverableTemplate[] = [
    {
        id: 'preliminary-assessment-report',
        label: 'Relatorio de Avaliacao Preliminar',
        status: 'mapped',
        sectionIds: ['annex-2-preliminary-assessment', 'annex-a-declaration'],
        fileTargetKind: 'report',
        checklist: [
            {
                id: 'prelim-area-history',
                label: 'Historico de uso, atividades e fontes potenciais descritos',
                sectionIds: ['annex-2-preliminary-assessment'],
                required: true,
                evidenceKind: 'report',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['AP', 'AS'],
            },
            {
                id: 'prelim-field-evidence',
                label: 'Vistorias, entrevistas, imagens, mapas ou documentos anexados',
                sectionIds: ['annex-2-preliminary-assessment'],
                required: true,
                evidenceKind: 'file-reference',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['AP', 'AS'],
            },
            {
                id: 'prelim-classification',
                label: 'Conclusao sobre AP/AS e proxima etapa registrada',
                sectionIds: ['annex-2-preliminary-assessment', 'annex-2-definitions'],
                required: true,
                evidenceKind: 'registry',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['AP', 'AS'],
            },
        ],
    },
    {
        id: 'confirmatory-investigation-report',
        label: 'Plano e Relatorio de Investigacao Confirmatoria',
        status: 'mapped',
        sectionIds: ['annex-2-confirmatory-investigation', 'annex-2-lab-quality', 'annex-a-declaration'],
        fileTargetKind: 'report',
        checklist: [
            {
                id: 'confirmatory-sampling-plan',
                label: 'Plano de amostragem e pontos de investigacao definidos',
                sectionIds: ['annex-2-confirmatory-investigation'],
                required: true,
                evidenceKind: 'plan',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['AS', 'ACI'],
            },
            {
                id: 'confirmatory-lab-results',
                label: 'Laudos e dados analiticos rastreaveis anexados',
                sectionIds: ['annex-2-confirmatory-investigation', 'annex-2-lab-quality'],
                required: true,
                evidenceKind: 'lab-data',
                responsibleRole: 'laboratorio',
                relatedAreaClasses: ['AS', 'ACI'],
            },
            {
                id: 'confirmatory-classification',
                label: 'Conclusao de confirmacao/descarte e classe da area registrada',
                sectionIds: ['annex-2-confirmatory-investigation', 'annex-2-definitions'],
                required: true,
                evidenceKind: 'registry',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['AS', 'ACI'],
            },
        ],
    },
    {
        id: 'detailed-investigation-report',
        label: 'Relatorio de Investigacao Detalhada',
        status: 'mapped',
        sectionIds: ['annex-2-detailed-investigation', 'annex-2-risk-assessment'],
        fileTargetKind: 'report',
        checklist: [
            {
                id: 'detailed-conceptual-model',
                label: 'Modelo Conceitual atualizado com fontes, vias e receptores',
                sectionIds: ['annex-2-detailed-investigation'],
                required: true,
                evidenceKind: 'report',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['ACI', 'ACRi'],
            },
            {
                id: 'detailed-plume-maps',
                label: 'Mapas, secoes e dados de delimitacao da contaminacao anexados',
                sectionIds: ['annex-2-detailed-investigation'],
                required: true,
                evidenceKind: 'map',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['ACI', 'ACRi'],
            },
            {
                id: 'detailed-risk-inputs',
                label: 'Dados preparados para Avaliacao de Risco quando aplicavel',
                sectionIds: ['annex-2-detailed-investigation', 'annex-2-risk-assessment'],
                required: true,
                evidenceKind: 'lab-data',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['ACI', 'ACRi'],
            },
        ],
    },
    {
        id: 'risk-assessment-report',
        label: 'Relatorio de Avaliacao de Risco',
        status: 'mapped',
        sectionIds: [
            'annex-2-risk-assessment',
            'annex-2-ecological-risk',
            'annex-2-legal-risk-standards',
            'annex-2-mathematical-modeling',
        ],
        fileTargetKind: 'report',
        checklist: [
            {
                id: 'risk-scenarios',
                label: 'Cenarios, receptores e vias de exposicao documentados',
                sectionIds: ['annex-2-risk-assessment'],
                required: true,
                evidenceKind: 'report',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['ACI', 'ACRi'],
            },
            {
                id: 'risk-criteria',
                label: 'CMA, padroes legais ou modelagem usados quando aplicavel',
                sectionIds: ['annex-2-risk-assessment', 'annex-2-legal-risk-standards', 'annex-2-mathematical-modeling'],
                required: true,
                evidenceKind: 'lab-data',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['ACI', 'ACRi'],
            },
            {
                id: 'risk-conclusion',
                label: 'Conclusao sobre risco, ACRi, AME ou necessidade de intervencao',
                sectionIds: ['annex-2-risk-assessment', 'annex-2-intervention-plan'],
                required: true,
                evidenceKind: 'registry',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['ACI', 'ACRi', 'AME'],
            },
        ],
    },
    {
        id: 'emergency-measures-report',
        label: 'Relatorio de Medidas Emergenciais',
        status: 'mapped',
        sectionIds: ['annex-2-emergency-measures', 'articles-1-9'],
        fileTargetKind: 'report',
        checklist: [
            {
                id: 'emergency-danger',
                label: 'Perigo ou risco iminente caracterizado',
                sectionIds: ['annex-2-emergency-measures'],
                required: true,
                evidenceKind: 'report',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['ACI', 'ACRi'],
            },
            {
                id: 'emergency-actions',
                label: 'Medidas emergenciais executadas e registradas',
                sectionIds: ['annex-2-emergency-measures'],
                required: true,
                evidenceKind: 'registry',
                responsibleRole: 'responsavel-legal',
                relatedAreaClasses: ['ACI', 'ACRi'],
            },
        ],
    },
    {
        id: 'intervention-plan',
        label: 'Plano de Intervencao',
        status: 'mapped',
        sectionIds: ['annex-2-intervention-plan', 'annex-b-material-destination', 'annex-a-declaration'],
        fileTargetKind: 'plan',
        checklist: [
            {
                id: 'intervention-measures',
                label: 'Medidas de remediacao, engenharia ou controle institucional descritas',
                sectionIds: ['annex-2-intervention-plan'],
                required: true,
                evidenceKind: 'plan',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['ACRi', 'ACRe', 'ACRu'],
            },
            {
                id: 'intervention-goals',
                label: 'Metas, cronograma e criterio de desempenho definidos',
                sectionIds: ['annex-2-intervention-plan'],
                required: true,
                evidenceKind: 'registry',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['ACRi', 'ACRe', 'ACRu'],
            },
            {
                id: 'intervention-materials',
                label: 'Destinacao de materiais prevista quando aplicavel',
                sectionIds: ['annex-b-material-destination'],
                required: true,
                evidenceKind: 'plan',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['ACRi', 'ACRe', 'ACRu'],
            },
        ],
    },
    {
        id: 'remediation-execution-report',
        label: 'Relatorios de Execucao do Plano de Intervencao',
        status: 'mapped',
        sectionIds: ['annex-2-intervention-execution'],
        fileTargetKind: 'report',
        checklist: [
            {
                id: 'execution-installation',
                label: 'Instalacao do sistema ou medida executada documentada',
                sectionIds: ['annex-2-intervention-execution'],
                required: true,
                evidenceKind: 'report',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['ACRe', 'ACRu'],
            },
            {
                id: 'execution-performance',
                label: 'Desempenho, eficiencia ou acompanhamento reportado',
                sectionIds: ['annex-2-intervention-execution'],
                required: true,
                evidenceKind: 'lab-data',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['ACRe', 'ACRu'],
            },
        ],
    },
    {
        id: 'closure-monitoring-report',
        label: 'Relatorios de Monitoramento para Encerramento',
        status: 'mapped',
        sectionIds: ['annex-2-closure-monitoring', 'annex-2-risk-assessment'],
        fileTargetKind: 'report',
        checklist: [
            {
                id: 'closure-monitoring-series',
                label: 'Campanhas e series temporais apresentadas conforme plano',
                sectionIds: ['annex-2-closure-monitoring'],
                required: true,
                evidenceKind: 'lab-data',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['AME'],
            },
            {
                id: 'closure-monitoring-goals',
                label: 'Atendimento continuado de metas ou CMA demonstrado',
                sectionIds: ['annex-2-closure-monitoring', 'annex-2-risk-assessment'],
                required: true,
                evidenceKind: 'registry',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['AME', 'AR'],
            },
        ],
    },
    {
        id: 'rehabilitation-term',
        label: 'Termo de Reabilitacao para Uso Declarado',
        status: 'mapped',
        sectionIds: ['annex-2-rehabilitation-term', 'annex-a-declaration', 'annex-3-licensing'],
        fileTargetKind: 'term',
        checklist: [
            {
                id: 'rehabilitation-declared-use',
                label: 'Uso declarado, restricoes e condicoes finais registrados',
                sectionIds: ['annex-2-rehabilitation-term'],
                required: true,
                evidenceKind: 'term',
                responsibleRole: 'cetesb',
                relatedAreaClasses: ['AR'],
            },
            {
                id: 'rehabilitation-recording',
                label: 'Averbacao, registro ou comunicacao aplicavel indicada',
                sectionIds: ['annex-2-rehabilitation-term', 'annex-3-licensing'],
                required: true,
                evidenceKind: 'registry',
                responsibleRole: 'cetesb',
                relatedAreaClasses: ['AR'],
            },
        ],
    },
    {
        id: 'responsibility-declaration',
        label: 'Declaracao de Responsabilidade',
        status: 'mapped',
        sectionIds: ['annex-a-declaration', 'articles-1-9'],
        fileTargetKind: 'declaration',
        checklist: [
            {
                id: 'declaration-legal-technical',
                label: 'Responsaveis legal e tecnico identificados e assinantes',
                sectionIds: ['annex-a-declaration'],
                required: true,
                evidenceKind: 'declaration',
                responsibleRole: 'responsavel-legal',
                relatedAreaClasses: ['AS', 'ACI', 'ACRi', 'ACRe', 'ACRu', 'AME', 'AR'],
            },
            {
                id: 'declaration-report-scope',
                label: 'Relatorio declarado e escopo das informacoes identificados',
                sectionIds: ['annex-a-declaration'],
                required: true,
                evidenceKind: 'declaration',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['AS', 'ACI', 'ACRi', 'ACRe', 'ACRu', 'AME', 'AR'],
            },
        ],
    },
    {
        id: 'material-destination-plan',
        label: 'Plano/Registro de Destinacao de Materiais',
        status: 'mapped',
        sectionIds: ['annex-b-material-destination'],
        fileTargetKind: 'plan',
        checklist: [
            {
                id: 'material-characterization',
                label: 'Material caracterizado conforme origem e classe da area',
                sectionIds: ['annex-b-material-destination'],
                required: true,
                evidenceKind: 'lab-data',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['ACI', 'ACRi', 'ACRe', 'ACRu'],
            },
            {
                id: 'material-destination-record',
                label: 'Destino autorizado, transporte e recebimento documentados',
                sectionIds: ['annex-b-material-destination'],
                required: true,
                evidenceKind: 'registry',
                responsibleRole: 'responsavel-tecnico',
                relatedAreaClasses: ['ACI', 'ACRi', 'ACRe', 'ACRu'],
            },
        ],
    },
    {
        id: 'licensing-constraint-record',
        label: 'Registro de Licenciamento e Restricoes',
        status: 'mapped',
        sectionIds: ['annex-3-licensing', 'annex-2-rehabilitation-term'],
        fileTargetKind: 'registry',
        checklist: [
            {
                id: 'licensing-constraints',
                label: 'Licencas, condicionantes ou restricoes de uso registradas',
                sectionIds: ['annex-3-licensing'],
                required: true,
                evidenceKind: 'registry',
                responsibleRole: 'cetesb',
                relatedAreaClasses: ['ACRu', 'AME', 'AR'],
            },
            {
                id: 'licensing-link-to-closure',
                label: 'Vinculo com termo, uso declarado ou reuso documentado',
                sectionIds: ['annex-3-licensing', 'annex-2-rehabilitation-term'],
                required: true,
                evidenceKind: 'term',
                responsibleRole: 'cetesb',
                relatedAreaClasses: ['ACRu', 'AME', 'AR'],
            },
        ],
    },
];

export const GAC_DD38_DELIVERABLE_CHECKLIST_ITEMS: readonly GacDd38ChecklistItem[] = Object.freeze(
    GAC_DD38_DELIVERABLE_TEMPLATES.flatMap((template) => template.checklist),
);

export const GAC_DD38_CHECKLIST_ITEMS: readonly GacDd38ChecklistItem[] = Object.freeze([
    ...GAC_DD38_BASE_CHECKLIST_ITEMS,
    ...GAC_DD38_DELIVERABLE_CHECKLIST_ITEMS,
]);

export const GAC_DD38_NORMATIVE_PROFILE: GacDd38NormativeProfile = {
    standardId: GAC_DD38_STANDARD_ID,
    standardLabel: 'CETESB DD-038/2017-C',
    source: GAC_DD38_STANDARD_SOURCE,
    validatedDate: GAC_DD38_PROFILE_VALIDATED_DATE,
    blocks: GAC_DD38_NORMATIVE_BLOCKS,
    sections: GAC_DD38_NORMATIVE_SECTIONS,
    criticalSectionIds: GAC_DD38_CRITICAL_SECTION_IDS,
    areaClasses: GAC_DD38_AREA_CLASSES,
    checklistItems: GAC_DD38_CHECKLIST_ITEMS,
    decisionCriteria: GAC_DD38_DECISION_CRITERIA,
    deliverableTemplates: GAC_DD38_DELIVERABLE_TEMPLATES,
    phaseMappings: GAC_DD38_PHASE_MAPPINGS,
    dataNatureMappings: GAC_DD38_DATA_NATURE_MAPPINGS,
    stakeholderMappings: GAC_DD38_STAKEHOLDER_MAPPINGS,
};

function _unique<T extends string>(values: readonly T[]): T[] {
    return Array.from(new Set(values));
}

function _coveragePoints(done: number, total: number, weight: number): number {
    if (total <= 0) return 0;
    return Math.round((done / total) * weight);
}

function _resolveProfile(profile?: GacDd38NormativeProfile): GacDd38NormativeProfile {
    return profile || GAC_DD38_NORMATIVE_PROFILE;
}

export function buildGacDd38NormativeProfile(): GacDd38NormativeProfile {
    return GAC_DD38_NORMATIVE_PROFILE;
}

export function findGacDd38NormativeSection(
    sectionId: string,
    profile?: GacDd38NormativeProfile,
): GacDd38NormativeSection | null {
    return _resolveProfile(profile).sections.find((section) => section.id === sectionId) || null;
}

export function findGacDd38AreaClass(areaClassId: string, profile?: GacDd38NormativeProfile): GacDd38AreaClass | null {
    return _resolveProfile(profile).areaClasses.find((areaClass) => areaClass.id === areaClassId) || null;
}

export function findGacDd38PhaseMapping(
    phaseId: string,
    profile?: GacDd38NormativeProfile,
): GacDd38PipelinePhaseMapping | null {
    return _resolveProfile(profile).phaseMappings.find((phase) => phase.id === phaseId) || null;
}

export function findGacDd38DataNatureMapping(
    dataNatureId: string,
    profile?: GacDd38NormativeProfile,
): GacDd38DataNatureMapping | null {
    return _resolveProfile(profile).dataNatureMappings.find((nature) => nature.id === dataNatureId) || null;
}

export function findGacDd38StakeholderMapping(
    stakeholderId: string,
    profile?: GacDd38NormativeProfile,
): GacDd38StakeholderMapping | null {
    return _resolveProfile(profile).stakeholderMappings.find((stakeholder) => stakeholder.id === stakeholderId) || null;
}

export function findGacDd38DecisionCriterionByNodeId(
    nodeId: string,
    profile?: GacDd38NormativeProfile,
): GacDd38DecisionCriterion | null {
    return _resolveProfile(profile).decisionCriteria.find((criterion) => criterion.nodeId === nodeId) || null;
}

export function findGacDd38DeliverableTemplate(
    templateId: string,
    profile?: GacDd38NormativeProfile,
): GacDd38DeliverableTemplate | null {
    return _resolveProfile(profile).deliverableTemplates.find((template) => template.id === templateId) || null;
}

export function listGacDd38CriticalNormativeSections(profile?: GacDd38NormativeProfile): GacDd38NormativeSection[] {
    const resolved = _resolveProfile(profile);
    const byId = new Map(resolved.sections.map((section) => [section.id, section]));
    return resolved.criticalSectionIds
        .map((sectionId) => byId.get(sectionId))
        .filter((section): section is GacDd38NormativeSection => Boolean(section));
}

export function summarizeGacDd38NormativeCoverage(profile?: GacDd38NormativeProfile): GacDd38NormativeCoverageSummary {
    const resolved = _resolveProfile(profile);
    const blockIds = _unique(resolved.blocks.map((block) => block.id));
    const missingBlockIds = GAC_DD38_NORMATIVE_BLOCK_IDS.filter((blockId) => !blockIds.includes(blockId));
    const sectionIds = new Set(resolved.sections.map((section) => section.id));
    const areaClassIds = new Set(resolved.areaClasses.map((areaClass) => areaClass.id));
    const checklistItemIds = new Set(resolved.checklistItems.map((item) => item.id));
    const deliverableTemplateIds = new Set(resolved.deliverableTemplates.map((template) => template.id));
    const phaseMappingIds = new Set(resolved.phaseMappings.map((phase) => phase.id));
    const dataNatureMappingIds = new Set(resolved.dataNatureMappings.map((nature) => nature.id));
    const stakeholderMappingIds = new Set(resolved.stakeholderMappings.map((stakeholder) => stakeholder.id));
    const decisionNodeIds = new Set(resolved.decisionCriteria.map((criterion) => criterion.nodeId));
    const missingCriticalSectionIds = resolved.criticalSectionIds.filter((sectionId) => {
        const section = findGacDd38NormativeSection(sectionId, resolved);
        return (
            !section ||
            !section.expectedEvidence.length ||
            section.pageStart <= 0 ||
            section.pageEnd < section.pageStart
        );
    });
    const missingAreaClassIds = GAC_DD38_AREA_CLASS_IDS.filter((areaClassId) => !areaClassIds.has(areaClassId));
    const missingPhaseMappingIds = GAC_DD38_PIPELINE_PHASE_IDS.filter((phaseId) => !phaseMappingIds.has(phaseId));
    const missingDataNatureMappingIds = GAC_DD38_DATA_NATURE_IDS.filter((natureId) => !dataNatureMappingIds.has(natureId));
    const missingStakeholderMappingIds = GAC_DD38_STAKEHOLDER_IDS.filter((stakeholderId) => !stakeholderMappingIds.has(stakeholderId));
    const missingDecisionNodeIds = GAC_DD38_DECISION_NODE_IDS.filter((nodeId) => !decisionNodeIds.has(nodeId));
    const mappedCriticalSectionCount = resolved.criticalSectionIds.length - missingCriticalSectionIds.length;
    const partialMappingIds = [
        ...resolved.phaseMappings
            .filter((phase) => phase.status === 'partial')
            .map((phase) => `phase:${phase.id}`),
        ...resolved.dataNatureMappings
            .filter((nature) => nature.status === 'partial')
            .map((nature) => `data-nature:${nature.id}`),
        ...resolved.stakeholderMappings
            .filter((stakeholder) => stakeholder.status === 'partial')
            .map((stakeholder) => `stakeholder:${stakeholder.id}`),
        ...resolved.decisionCriteria
            .filter((criterion) => criterion.status === 'partial')
            .map((criterion) => `decision:${criterion.nodeId}`),
        ...resolved.deliverableTemplates
            .filter((template) => template.status === 'partial')
            .map((template) => `deliverable:${template.id}`),
    ];
    const missingMappingIds = [
        ...missingPhaseMappingIds.map((phaseId) => `phase:${phaseId}`),
        ...missingDataNatureMappingIds.map((natureId) => `data-nature:${natureId}`),
        ...missingStakeholderMappingIds.map((stakeholderId) => `stakeholder:${stakeholderId}`),
        ...missingDecisionNodeIds.map((nodeId) => `decision:${nodeId}`),
        ...resolved.phaseMappings
            .filter((phase) => phase.status === 'missing')
            .map((phase) => `phase:${phase.id}`),
        ...resolved.dataNatureMappings
            .filter((nature) => nature.status === 'missing')
            .map((nature) => `data-nature:${nature.id}`),
        ...resolved.stakeholderMappings
            .filter((stakeholder) => stakeholder.status === 'missing')
            .map((stakeholder) => `stakeholder:${stakeholder.id}`),
        ...resolved.decisionCriteria
            .filter((criterion) => criterion.status === 'missing')
            .map((criterion) => `decision:${criterion.nodeId}`),
        ...resolved.deliverableTemplates
            .filter((template) => template.status === 'missing')
            .map((template) => `deliverable:${template.id}`),
    ];
    const blockers = [
        ...missingBlockIds.map((blockId) => `Bloco normativo ausente: ${blockId}`),
        ...missingCriticalSectionIds.map((sectionId) => `Secao critica ausente ou incompleta: ${sectionId}`),
        ...missingAreaClassIds.map((areaClassId) => `Classe de area ausente: ${areaClassId}`),
        ...missingPhaseMappingIds.map((phaseId) => `Fase de pipeline sem referencia DD-038: ${phaseId}`),
        ...missingDataNatureMappingIds.map((natureId) => `Natureza de dado sem referencia DD-038: ${natureId}`),
        ...missingStakeholderMappingIds.map((stakeholderId) => `Parte interessada sem referencia DD-038: ${stakeholderId}`),
        ...missingDecisionNodeIds.map((nodeId) => `No de decisao sem criterio DD-038: ${nodeId}`),
    ];

    for (const checklistItem of resolved.checklistItems) {
        const missingSectionRefs = checklistItem.sectionIds.filter((sectionId) => !sectionIds.has(sectionId));
        if (missingSectionRefs.length > 0) {
            blockers.push(`Checklist ${checklistItem.id} referencia secao ausente: ${missingSectionRefs.join(', ')}`);
        }
    }

    if (resolved.checklistItems.length === 0) {
        blockers.push('Checklist normativo base ausente.');
    }

    for (const phase of resolved.phaseMappings) {
        const missingSectionRefs = phase.sectionIds.filter((sectionId) => !sectionIds.has(sectionId));
        const missingTemplateRefs = phase.deliverableTemplateIds.filter((templateId) => !deliverableTemplateIds.has(templateId));
        if (phase.sectionIds.length === 0 || phase.status === 'missing') {
            blockers.push(`Fase ${phase.id} sem mapeamento DD-038 aplicavel.`);
        }
        if (missingSectionRefs.length > 0) {
            blockers.push(`Fase ${phase.id} referencia secao ausente: ${missingSectionRefs.join(', ')}`);
        }
        if (missingTemplateRefs.length > 0) {
            blockers.push(`Fase ${phase.id} referencia template ausente: ${missingTemplateRefs.join(', ')}`);
        }
    }

    for (const nature of resolved.dataNatureMappings) {
        const missingSectionRefs = nature.sectionIds.filter((sectionId) => !sectionIds.has(sectionId));
        const missingChecklistRefs = nature.checklistItemIds.filter((itemId) => !checklistItemIds.has(itemId));
        if (nature.sectionIds.length === 0 || nature.status === 'missing') {
            blockers.push(`Natureza de dado ${nature.id} sem mapeamento DD-038 aplicavel.`);
        }
        if (missingSectionRefs.length > 0) {
            blockers.push(`Natureza de dado ${nature.id} referencia secao ausente: ${missingSectionRefs.join(', ')}`);
        }
        if (missingChecklistRefs.length > 0) {
            blockers.push(`Natureza de dado ${nature.id} referencia checklist ausente: ${missingChecklistRefs.join(', ')}`);
        }
    }

    for (const stakeholder of resolved.stakeholderMappings) {
        const missingSectionRefs = stakeholder.sectionIds.filter((sectionId) => !sectionIds.has(sectionId));
        const missingChecklistRefs = stakeholder.checklistItemIds.filter((itemId) => !checklistItemIds.has(itemId));
        if (stakeholder.sectionIds.length === 0 || stakeholder.status === 'missing') {
            blockers.push(`Parte interessada ${stakeholder.id} sem mapeamento DD-038 aplicavel.`);
        }
        if (missingSectionRefs.length > 0) {
            blockers.push(`Parte interessada ${stakeholder.id} referencia secao ausente: ${missingSectionRefs.join(', ')}`);
        }
        if (missingChecklistRefs.length > 0) {
            blockers.push(`Parte interessada ${stakeholder.id} referencia checklist ausente: ${missingChecklistRefs.join(', ')}`);
        }
    }

    const criteriaWithSpecificReferences = resolved.decisionCriteria.filter((criterion) => {
        const hasSpecificSection = criterion.sectionIds.some((sectionId) => sectionId !== 'annex-2-gac');
        return (
            criterion.status !== 'missing' &&
            hasSpecificSection &&
            criterion.requiredEvidence.length > 0 &&
            criterion.passConditionPt.trim().length > 0 &&
            criterion.failConditionPt.trim().length > 0
        );
    });
    const mappedDecisionNodeIds = new Set(criteriaWithSpecificReferences.map((criterion) => criterion.nodeId));

    for (const criterion of resolved.decisionCriteria) {
        const missingSectionRefs = criterion.sectionIds.filter((sectionId) => !sectionIds.has(sectionId));
        if (criterion.sectionIds.length === 0 || !criterion.sectionIds.some((sectionId) => sectionId !== 'annex-2-gac')) {
            blockers.push(`Criterio de decisao ${criterion.id} sem referencia DD-038 especifica.`);
        }
        if (criterion.requiredEvidence.length === 0) {
            blockers.push(`Criterio de decisao ${criterion.id} sem evidencia requerida.`);
        }
        if (missingSectionRefs.length > 0) {
            blockers.push(`Criterio de decisao ${criterion.id} referencia secao ausente: ${missingSectionRefs.join(', ')}`);
        }
        if (!phaseMappingIds.has(criterion.phaseId)) {
            blockers.push(`Criterio de decisao ${criterion.id} referencia fase ausente: ${criterion.phaseId}`);
        }
        if (!stakeholderMappingIds.has(criterion.stakeholderId)) {
            blockers.push(`Criterio de decisao ${criterion.id} referencia parte interessada ausente: ${criterion.stakeholderId}`);
        }
    }

    for (const template of resolved.deliverableTemplates) {
        const missingSectionRefs = template.sectionIds.filter((sectionId) => !sectionIds.has(sectionId));
        if (template.sectionIds.length === 0 || template.status === 'missing') {
            blockers.push(`Template de entregavel ${template.id} sem referencia DD-038 aplicavel.`);
        }
        if (template.checklist.length === 0) {
            blockers.push(`Template de entregavel ${template.id} sem checklist.`);
        }
        if (missingSectionRefs.length > 0) {
            blockers.push(`Template de entregavel ${template.id} referencia secao ausente: ${missingSectionRefs.join(', ')}`);
        }
        for (const item of template.checklist) {
            const missingTemplateItemSectionRefs = item.sectionIds.filter((sectionId) => !sectionIds.has(sectionId));
            if (missingTemplateItemSectionRefs.length > 0) {
                blockers.push(
                    `Checklist do entregavel ${template.id}/${item.id} referencia secao ausente: ${missingTemplateItemSectionRefs.join(', ')}`,
                );
            }
        }
    }

    const foundationScore0To1000 =
        _coveragePoints(blockIds.length - missingBlockIds.length, GAC_DD38_NORMATIVE_BLOCK_IDS.length, 150) +
        _coveragePoints(mappedCriticalSectionCount, resolved.criticalSectionIds.length, 250) +
        _coveragePoints(
            GAC_DD38_AREA_CLASS_IDS.length - missingAreaClassIds.length,
            GAC_DD38_AREA_CLASS_IDS.length,
            200,
        ) +
        _coveragePoints(resolved.checklistItems.length > 0 ? 1 : 0, 1, 100) +
        _coveragePoints(
            GAC_DD38_PIPELINE_PHASE_IDS.length - missingPhaseMappingIds.length,
            GAC_DD38_PIPELINE_PHASE_IDS.length,
            100,
        ) +
        _coveragePoints(mappedDecisionNodeIds.size, GAC_DD38_DECISION_NODE_IDS.length, 100) +
        _coveragePoints(resolved.deliverableTemplates.length > 0 ? 1 : 0, 1, 100);

    return {
        standardId: resolved.standardId,
        blockCount: blockIds.length,
        sectionCount: resolved.sections.length,
        criticalSectionCount: resolved.criticalSectionIds.length,
        mappedCriticalSectionCount,
        areaClassCount: resolved.areaClasses.length,
        checklistItemCount: resolved.checklistItems.length,
        phaseMappingCount: resolved.phaseMappings.length,
        dataNatureMappingCount: resolved.dataNatureMappings.length,
        stakeholderMappingCount: resolved.stakeholderMappings.length,
        decisionCriterionCount: resolved.decisionCriteria.length,
        deliverableTemplateCount: resolved.deliverableTemplates.length,
        mappedDecisionNodeCount: mappedDecisionNodeIds.size,
        partialMappingIds,
        missingMappingIds: _unique(missingMappingIds),
        missingDecisionNodeIds,
        presentBlockIds: blockIds,
        missingBlockIds,
        missingCriticalSectionIds,
        missingAreaClassIds,
        foundationScore0To1000,
        status: blockers.length === 0 ? 'profile-ready' : 'incomplete',
        blockers,
    };
}

export function summarizeGacDd38NormativeProfile(profile?: GacDd38NormativeProfile): GacDd38NormativeProfileSummary {
    const resolved = _resolveProfile(profile);
    const coverage = summarizeGacDd38NormativeCoverage(resolved);
    return {
        ...coverage,
        title: resolved.standardLabel,
        pageRangeLabel: 'paginas 1-65',
        criticalSections: listGacDd38CriticalNormativeSections(resolved).map((section) => ({
            id: section.id,
            title: section.title,
            pageStart: section.pageStart,
            pageEnd: section.pageEnd,
            blockId: section.blockId,
        })),
        areaClasses: resolved.areaClasses.map((areaClass) => ({
            id: areaClass.id,
            label: areaClass.label,
            nextClassIds: [...areaClass.nextClassIds],
        })),
        phaseMappings: resolved.phaseMappings.map((phase) => ({
            id: phase.id,
            label: phase.label,
            status: phase.status,
            sectionIds: [...phase.sectionIds],
        })),
        deliverableTemplates: resolved.deliverableTemplates.map((template) => ({
            id: template.id,
            label: template.label,
            status: template.status,
            sectionIds: [...template.sectionIds],
        })),
        decisionCriteria: resolved.decisionCriteria.map((criterion) => ({
            id: criterion.id,
            label: criterion.label,
            nodeId: criterion.nodeId,
            status: criterion.status,
            sectionIds: [...criterion.sectionIds],
        })),
    };
}
