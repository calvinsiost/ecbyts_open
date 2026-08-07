// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE DOMAIN PROFILE - reusable process intelligence layer.

   A Process Domain Profile tells the Pipeline Pack what a process family
   usually needs: vocabulary, expected checks, equivalent modules and
   conditional gates. GAC/DD38 and mine beneficiation become two configured
   profiles of the same product surface instead of two special cases.
   ================================================================ */

import {
    normalizePipelinePack,
    type PipelinePack,
    type PipelinePackNode,
    type PipelinePackOpenMode,
    type PipelineSemanticEntry,
} from './pipelinePack.js';

export type PipelineDomainProfileId = 'generic-process' | 'gac-dd38' | 'mine-beneficiation' | string;
export type PipelineDomainSuggestionConfidence = 'high' | 'medium' | 'low';

export interface PipelineDomainModuleSuggestionRule {
    moduleId: string;
    adapterId: string;
    label: string;
    openMode: PipelinePackOpenMode;
    confidence: PipelineDomainSuggestionConfidence;
    terms: string[];
    reasonLabel?: string;
}

export interface PipelineDomainModuleSuggestion {
    moduleId: string;
    adapterId: string;
    label: string;
    confidence: PipelineDomainSuggestionConfidence;
    reason: string;
    openMode: PipelinePackOpenMode;
    matchedTerms: string[];
}

export interface PipelineDomainGateTemplate {
    id: string;
    label: string;
    description: string;
    nodeIdPatterns: string[];
    labelTerms: string[];
    semanticRoles: string[];
    requiredInputs: string[];
    expectedBranches: string[];
    moduleIds: string[];
    userCheck: string;
}

export type DomainTechnicalParameterApplicability = 'required' | 'optional' | 'not-applicable';
export type DomainTechnicalParameterValueKind =
    | 'selection'
    | 'text'
    | 'number'
    | 'percentage'
    | 'mass'
    | 'rate'
    | 'water'
    | 'energy'
    | 'document'
    | 'evidence'
    | 'reference'
    | 'list'
    | string;

export type DomainTechnicalParameterGroup =
    | 'phase'
    | 'stakeholder'
    | 'data-nature'
    | 'ore'
    | 'granulometry'
    | 'recovery'
    | 'mass-balance'
    | 'reagents'
    | 'water'
    | 'energy'
    | 'critical-supplies'
    | 'tailings'
    | 'quality'
    | 'traceability'
    | 'other'
    | string;

export interface DomainTechnicalParameter {
    id: string;
    label: string;
    group: DomainTechnicalParameterGroup;
    applicability: DomainTechnicalParameterApplicability;
    valueKind: DomainTechnicalParameterValueKind;
    description: string;
    requiredForPublish?: boolean;
    examples?: string[];
    appliesToSemanticRoles?: string[];
    userPrompt?: string;
}

export interface PipelineDomainProfile {
    id: PipelineDomainProfileId;
    label: string;
    domain: string;
    summary: string;
    aliases: string[];
    vocabulary: string[];
    requiredChecks: string[];
    moduleSuggestionRules: PipelineDomainModuleSuggestionRule[];
    gateTemplates: PipelineDomainGateTemplate[];
    technicalParameters: DomainTechnicalParameter[];
    userGuidance: string[];
}

export type ProcessDomainProfile = PipelineDomainProfile;

export interface PipelineDomainProfileMatch {
    profile: PipelineDomainProfile;
    confidence: number;
    evidence: string[];
}

export interface PipelineDomainProfileSummary {
    profileId: PipelineDomainProfileId;
    label: string;
    domain: string;
    summary: string;
    confidence: number;
    evidence: string[];
    vocabulary: string[];
    requiredChecks: string[];
    requiredGateLabels: string[];
    moduleLabels: string[];
    technicalParameters: DomainTechnicalParameter[];
    requiredTechnicalParameterLabels: string[];
    optionalTechnicalParameterLabels: string[];
    notApplicableTechnicalParameterLabels: string[];
    userGuidance: string[];
}

export interface PipelineDomainTechnicalParameterCatalogSummary {
    profileId: PipelineDomainProfileId;
    label: string;
    required: DomainTechnicalParameter[];
    optional: DomainTechnicalParameter[];
    notApplicable: DomainTechnicalParameter[];
    requiredCount: number;
    optionalCount: number;
    notApplicableCount: number;
}

const GENERIC_MODULE_RULES: PipelineDomainModuleSuggestionRule[] = [
    {
        moduleId: 'files',
        adapterId: 'files.process',
        label: 'Files',
        openMode: 'open-live',
        confidence: 'high',
        terms: ['arquivo', 'arquivos', 'documento', 'documentos', 'evidencia', 'evidencias', 'anexo', 'laudo', 'relatorio'],
    },
    {
        moduleId: 'datastudio',
        adapterId: 'datastudio.process',
        label: 'Data Studio',
        openMode: 'side-panel',
        confidence: 'high',
        terms: ['dado', 'dados', 'tabela', 'grafico', 'dashboard', 'indicador', 'serie', 'amostra', 'balanco', 'kpi'],
    },
    {
        moduleId: 'gantt',
        adapterId: 'gantt.project',
        label: 'Cronograma',
        openMode: 'side-panel',
        confidence: 'medium',
        terms: ['cronograma', 'prazo', 'etapa', 'sprint', 'projeto', 'metodologia', 'agil', 'planejamento'],
    },
    {
        moduleId: 'temporal-analysis',
        adapterId: 'temporal-analysis.mann-kendall',
        label: 'Mann-Kendall',
        openMode: 'side-panel',
        confidence: 'high',
        terms: ['mann', 'kendall', 'tendencia', 'temporal', 'serie historica'],
    },
    {
        moduleId: 'pipelines',
        adapterId: 'pipelines.process',
        label: 'Pipelines',
        openMode: 'open-live',
        confidence: 'medium',
        terms: ['fluxo', 'pipeline', 'processo', 'decisao', 'gateway', 'rota', 'condicional'],
    },
    {
        moduleId: 'model-3d',
        adapterId: 'model-3d.scene',
        label: 'Modelo 3D',
        openMode: 'open-live',
        confidence: 'medium',
        terms: ['modelo', '3d', 'pluma', 'poco', 'pocos', 'mapa', 'area', 'terreno'],
    },
    {
        moduleId: 'training',
        adapterId: 'training.course',
        label: 'Training',
        openMode: 'side-panel',
        confidence: 'medium',
        terms: ['aula', 'curso', 'licao', 'slide', 'treinamento', 'professor'],
    },
];

const GENERIC_TECHNICAL_PARAMETERS: DomainTechnicalParameter[] = [
    {
        id: 'phase',
        label: 'Fase do processo',
        group: 'phase',
        applicability: 'required',
        valueKind: 'selection',
        description: 'Etapa, fase normativa ou fase produtiva que localiza o item no fluxo.',
        requiredForPublish: true,
        examples: ['Deteccao', 'Caracterizacao', 'Cominuicao', 'Concentracao'],
        userPrompt: 'Em qual fase este item aparece?',
    },
    {
        id: 'stakeholder',
        label: 'Parte interessada responsavel',
        group: 'stakeholder',
        applicability: 'optional',
        valueKind: 'selection',
        description: 'Raia, area ou responsavel que valida o item antes de seguir.',
        examples: ['Responsavel tecnico', 'Campo', 'Operacao da planta'],
        userPrompt: 'Quem responde por este item?',
    },
    {
        id: 'data-nature',
        label: 'Natureza de dados',
        group: 'data-nature',
        applicability: 'optional',
        valueKind: 'selection',
        description: 'Tipo de dado, evidencia ou sinal usado pelo no, conector ou decisao.',
        examples: ['documento', 'amostra', 'sensor', 'KPI'],
        userPrompt: 'Que tipo de dado ou evidencia sustenta este item?',
    },
];

const GAC_DD38_TECHNICAL_PARAMETERS: DomainTechnicalParameter[] = [
    {
        id: 'phase',
        label: 'Fase normativa DD-38',
        group: 'phase',
        applicability: 'required',
        valueKind: 'selection',
        description: 'Fase do gerenciamento de areas contaminadas usada para localizar atividade, evidencia ou decisao.',
        requiredForPublish: true,
        examples: ['Deteccao', 'Caracterizacao', 'Remediacao', 'Acompanhamento', 'Fechamento'],
        userPrompt: 'Qual fase DD-38 governa este item?',
    },
    {
        id: 'stakeholder',
        label: 'Parte interessada responsavel',
        group: 'stakeholder',
        applicability: 'required',
        valueKind: 'selection',
        description: 'Raia ou papel que responde pela evidencia, atividade ou decisao no fluxo GAC.',
        requiredForPublish: true,
        examples: ['Resp. Legal', 'Responsavel Tecnico', 'Campo', 'Laboratorio', 'Orgaos Publicos'],
        userPrompt: 'Quem precisa validar este item no GAC/DD38?',
    },
    {
        id: 'data-nature',
        label: 'Natureza de dados/evidencia',
        group: 'data-nature',
        applicability: 'required',
        valueKind: 'selection',
        description: 'Tipo de evidencia tecnica usada no fluxo: documento, dado analitico, campo, imagem ou sistema.',
        requiredForPublish: true,
        examples: ['laudo', 'EDD', 'GIS', 'LIMS', 'ficha de campo', 'imagem', 'documento'],
        userPrompt: 'Qual evidencia sustenta este ponto do fluxo?',
    },
    {
        id: 'reference-document',
        label: 'Documento ou arquivo de referencia',
        group: 'traceability',
        applicability: 'optional',
        valueKind: 'document',
        description: 'Documento, laudo, imagem, EDD, GIS ou anexo que o click-go deve abrir quando existir.',
        examples: ['01_DadosAnaliticos.vpp', 'laudo analitico', 'ficha de campo', 'mapa GIS'],
        userPrompt: 'Existe um documento especifico para anexar ou abrir?',
    },
    {
        id: 'source-activity-decision',
        label: 'Atividade ou decisao do fluxo original',
        group: 'traceability',
        applicability: 'required',
        valueKind: 'reference',
        description: 'No, atividade, data store ou decisao do VPP que este parametro descreve.',
        requiredForPublish: true,
        examples: ['Classificacao tecnica DD-38', 'Revisao de evidencias', 'Data store Files'],
        userPrompt: 'Qual item do fluxo original esta sendo parametrizado?',
    },
    {
        id: 'click-go-target',
        label: 'Destino click-go no ecbyts',
        group: 'traceability',
        applicability: 'required',
        valueKind: 'reference',
        description: 'Modulo equivalente que deve abrir: Pipelines/GAC para decisoes, Files para evidencias ou Data Studio para dados.',
        requiredForPublish: true,
        examples: ['pipelines.gac-decision', 'files.gac', 'datastudio.gac-catalog'],
        userPrompt: 'O que deve abrir quando o usuario clicar?',
    },
    {
        id: 'traceability-evidence',
        label: 'Evidencia de rastreabilidade',
        group: 'traceability',
        applicability: 'optional',
        valueKind: 'evidence',
        description: 'Fonte, pagina, trecho, versao do pack ou observacao que explica a origem do parametro.',
        examples: ['fonte VPP', 'pagina do PDF', 'versao 1.0.0'],
        userPrompt: 'Qual evidencia prova a origem deste item?',
    },
    {
        id: 'ore-type',
        label: 'Minerio e mineral de interesse',
        group: 'ore',
        applicability: 'not-applicable',
        valueKind: 'selection',
        description: 'Parametro produtivo de beneficiamento; nao se aplica ao fluxo regulatorio GAC/DD38.',
    },
    {
        id: 'granulometry',
        label: 'Granulometria/P80',
        group: 'granulometry',
        applicability: 'not-applicable',
        valueKind: 'number',
        description: 'Parametro produtivo de beneficiamento; nao se aplica ao fluxo regulatorio GAC/DD38.',
    },
    {
        id: 'recovery',
        label: 'Recuperacao',
        group: 'recovery',
        applicability: 'not-applicable',
        valueKind: 'percentage',
        description: 'Parametro metalurgico; nao se aplica como requisito do perfil GAC/DD38.',
    },
    {
        id: 'mass-balance',
        label: 'Balanco de massa',
        group: 'mass-balance',
        applicability: 'not-applicable',
        valueKind: 'mass',
        description: 'Parametro de planta de beneficiamento; nao se aplica como requisito do perfil GAC/DD38.',
    },
    {
        id: 'reagents',
        label: 'Reagentes',
        group: 'reagents',
        applicability: 'not-applicable',
        valueKind: 'list',
        description: 'Parametro de processo mineral; nao se aplica ao perfil GAC/DD38.',
    },
    {
        id: 'water',
        label: 'Agua de processo',
        group: 'water',
        applicability: 'not-applicable',
        valueKind: 'water',
        description: 'Parametro de utilidade de planta; no GAC a agua subterranea entra como natureza de evidencia, nao como agua de processo.',
    },
    {
        id: 'energy',
        label: 'Energia',
        group: 'energy',
        applicability: 'not-applicable',
        valueKind: 'energy',
        description: 'Parametro de consumo operacional de planta; nao se aplica ao perfil GAC/DD38.',
    },
    {
        id: 'critical-supplies',
        label: 'Insumos criticos',
        group: 'critical-supplies',
        applicability: 'not-applicable',
        valueKind: 'list',
        description: 'Parametro de suprimento de planta; nao se aplica ao perfil GAC/DD38.',
    },
    {
        id: 'tailings-route',
        label: 'Rota de rejeitos',
        group: 'tailings',
        applicability: 'not-applicable',
        valueKind: 'selection',
        description: 'Parametro de beneficiamento mineral; nao se aplica ao fluxo GAC/DD38.',
    },
    {
        id: 'water-recovered',
        label: 'Agua recuperada e desaguamento',
        group: 'tailings',
        applicability: 'not-applicable',
        valueKind: 'water',
        description: 'Parametro de desaguamento de rejeitos de beneficiamento; nao se aplica ao perfil GAC/DD38.',
    },
];

const MINE_BENEFICIATION_TECHNICAL_PARAMETERS: DomainTechnicalParameter[] = [
    {
        id: 'phase',
        label: 'Fase produtiva',
        group: 'phase',
        applicability: 'required',
        valueKind: 'selection',
        description: 'Fase do fluxo ROM-to-product em que o parametro e usado.',
        requiredForPublish: true,
        examples: ['Alimentacao ROM', 'Cominuicao', 'Classificacao', 'Concentracao', 'Desaguamento', 'Qualidade'],
        userPrompt: 'Em qual fase da planta este parametro entra?',
    },
    {
        id: 'stakeholder',
        label: 'Parte interessada responsavel',
        group: 'stakeholder',
        applicability: 'required',
        valueKind: 'selection',
        description: 'Area, raia ou papel que decide, mede ou responde pelo parametro de planta.',
        requiredForPublish: true,
        examples: ['Mina', 'Operacao da planta', 'Laboratorio metalurgico', 'Geotecnia', 'ESG'],
        userPrompt: 'Quem responde por este parametro?',
    },
    {
        id: 'data-nature',
        label: 'Natureza de dados',
        group: 'data-nature',
        applicability: 'required',
        valueKind: 'selection',
        description: 'Origem tecnica do parametro: testwork, sensor, laboratorio, balanco, relatorio ou restricao.',
        requiredForPublish: true,
        examples: ['testwork', 'sensor online', 'amostra de laboratorio', 'balanco reconciliado', 'relatorio ESG'],
        userPrompt: 'Que tipo de dado alimenta este parametro?',
    },
    {
        id: 'ore-type',
        label: 'Minerio e mineral de interesse',
        group: 'ore',
        applicability: 'required',
        valueKind: 'selection',
        description: 'Dominio geometalurgico, mineralogia, teor de cabeca, dureza e contaminantes relevantes.',
        requiredForPublish: true,
        examples: ['itabirito', 'sulfeto', 'fosfato', 'ouro', 'argila alta'],
        appliesToSemanticRoles: ['ore-calibration-decision', 'separation-route-decision'],
        userPrompt: 'Qual minerio ou dominio geometalurgico esta sendo tratado?',
    },
    {
        id: 'ore-consumption-rate',
        label: 'Taxa de consumo de minerio',
        group: 'ore',
        applicability: 'required',
        valueKind: 'rate',
        description: 'Taxa de ROM/minerio alimentada ou consumida pela planta, com unidade, base de medicao e observacao rastreavel.',
        requiredForPublish: true,
        examples: ['1200 t/d ROM', '85 t/h na britagem primaria', '2,1 Mt/ano por campanha'],
        appliesToSemanticRoles: ['rom-receiving', 'primary-crushing', 'ore-calibration-decision', 'mass-balance-decision'],
        userPrompt: 'Qual taxa de consumo de minerio governa esta etapa?',
    },
    {
        id: 'granulometry',
        label: 'Granulometria/P80',
        group: 'granulometry',
        applicability: 'required',
        valueKind: 'number',
        description: 'Tamanho alvo por etapa, P80, liberacao mineral, carga circulante e risco de sobrem moagem.',
        requiredForPublish: true,
        examples: ['P80 150 um', 'liberacao 106 um', 'oversize scalper'],
        appliesToSemanticRoles: ['classification-decision', 'grinding'],
        userPrompt: 'Qual granulometria ou P80 libera o proximo passo?',
    },
    {
        id: 'recovery',
        label: 'Recuperacao',
        group: 'recovery',
        applicability: 'required',
        valueKind: 'percentage',
        description: 'Recuperacao metalurgica, recuperacao de massa, teor do concentrado e perdas no rejeito.',
        requiredForPublish: true,
        examples: ['recuperacao Fe 82%', 'mass pull 18%', 'teor concentrado 64%'],
        appliesToSemanticRoles: ['grade-recovery-decision', 'mass-balance-decision'],
        userPrompt: 'Qual recuperacao ou teor precisa ser atendido?',
    },
    {
        id: 'mass-balance',
        label: 'Balanco de massa',
        group: 'mass-balance',
        applicability: 'required',
        valueKind: 'mass',
        description: 'Fechamento de massas, teores, recuperacoes, umidade, densidade e perdas antes de publicar KPI.',
        requiredForPublish: true,
        examples: ['feed t/h', 'concentrado t/h', 'rejeito t/h', 'umidade', 'densidade'],
        appliesToSemanticRoles: ['mass-balance-decision'],
        userPrompt: 'O balanco esta fechado dentro da tolerancia?',
    },
    {
        id: 'reagents',
        label: 'Reagentes',
        group: 'reagents',
        applicability: 'required',
        valueKind: 'list',
        description: 'Suite de reagentes, dosagem, pontos de adicao, pH, Eh, densidade de polpa e qualidade da agua.',
        requiredForPublish: true,
        examples: ['coletor', 'espumante', 'depressor', 'cal', 'pH 10.5'],
        appliesToSemanticRoles: ['reagent-ph-decision', 'conditioning'],
        userPrompt: 'Quais reagentes e condicoes liberam a rota?',
    },
    {
        id: 'water',
        label: 'Agua',
        group: 'water',
        applicability: 'required',
        valueKind: 'water',
        description: 'Consumo especifico, recirculacao, make-up, qualidade da agua e restricoes de utilidades.',
        requiredForPublish: true,
        examples: ['m3/t', 'reciclo 75%', 'qualidade de agua de flotacao'],
        appliesToSemanticRoles: ['water-energy-decision', 'reagent-ph-decision'],
        userPrompt: 'Qual consumo, reciclo ou qualidade de agua governa o item?',
    },
    {
        id: 'energy',
        label: 'Energia',
        group: 'energy',
        applicability: 'required',
        valueKind: 'energy',
        description: 'Consumo especifico, potencia, capacidade de bombas/moagem e gargalos energeticos.',
        requiredForPublish: true,
        examples: ['kWh/t', 'potencia do SAG', 'capacidade de bomba'],
        appliesToSemanticRoles: ['water-energy-decision', 'grinding'],
        userPrompt: 'Qual consumo ou gargalo energetico precisa ser checado?',
    },
    {
        id: 'critical-supplies',
        label: 'Insumos criticos',
        group: 'critical-supplies',
        applicability: 'required',
        valueKind: 'list',
        description: 'Insumos essenciais alem de reagentes/agua/energia: corpos moedores, revestimentos, floculante, cal, combustivel e sobressalentes criticos, com estoque minimo e fornecedor.',
        requiredForPublish: true,
        examples: ['corpos moedores', 'revestimento de britador', 'floculante', 'cal', 'combustivel', 'sobressalente critico'],
        appliesToSemanticRoles: ['critical-supplies-decision', 'water-energy-decision'],
        userPrompt: 'Quais insumos criticos, alem de agua/energia/reagentes, precisam de estoque garantido?',
    },
    {
        id: 'tailings-route',
        label: 'Rota de rejeitos',
        group: 'tailings',
        applicability: 'required',
        valueKind: 'selection',
        description: 'Destino de rejeitos: polpa, pasta, filtrado, empilhamento seco, barragem, backfill ou reprocessamento.',
        requiredForPublish: true,
        examples: ['barragem', 'pasta', 'filtrado', 'empilhamento seco', 'backfill'],
        appliesToSemanticRoles: ['tailings-route-decision'],
        userPrompt: 'Qual rota de rejeitos fica liberada?',
    },
    {
        id: 'water-recovered',
        label: 'Agua recuperada e desaguamento',
        group: 'tailings',
        applicability: 'required',
        valueKind: 'water',
        description: 'Agua recuperada do rejeito apos espessamento e filtragem, com percentuais de cada etapa e destino final do rejeito desaguado.',
        requiredForPublish: true,
        examples: ['80% recuperado no espessador', 'torta filtrada 22% umidade', 'disposicao em pilha seca'],
        appliesToSemanticRoles: ['tailings-route-decision', 'water-recovery'],
        userPrompt: 'Quanta agua volta ao processo apos espessamento/filtragem e qual a disposicao final do rejeito?',
    },
    {
        id: 'product-quality',
        label: 'Produto final e especificacao',
        group: 'quality',
        applicability: 'optional',
        valueKind: 'text',
        description: 'Especificacao comercial, qualidade do produto, destino e restricoes de embarque.',
        examples: ['teor minimo', 'umidade maxima', 'granulometria de produto'],
        userPrompt: 'Qual especificacao final o produto precisa atender?',
    },
    {
        id: 'reference-document',
        label: 'Documento normativo DD-38',
        group: 'traceability',
        applicability: 'not-applicable',
        valueKind: 'document',
        description: 'Campo especifico do perfil GAC/DD38; no beneficiamento use fontes tecnicas, testwork e relatorios de planta.',
    },
    {
        id: 'click-go-target',
        label: 'Destino click-go normativo GAC',
        group: 'traceability',
        applicability: 'not-applicable',
        valueKind: 'reference',
        description: 'Campo especifico para decisoes/evidencias do GAC/DD38; o beneficiamento usa modulos de planta, sensores, relatorios e governanca.',
    },
];

export const PIPELINE_GENERIC_DOMAIN_PROFILE: PipelineDomainProfile = {
    id: 'generic-process',
    label: 'Processo generico',
    domain: 'generic-process',
    summary: 'Perfil base para processos editaveis com etapas, evidencias, decisoes e modulos equivalentes.',
    aliases: ['generic-process', 'processo generico', 'pipeline pack', 'processo'],
    vocabulary: ['etapa', 'decisao', 'evidencia', 'modulo equivalente', 'rota', 'responsavel'],
    requiredChecks: ['grafo com conectores validos', 'de-para com modulo equivalente', 'fallback explicito', 'permissao minima'],
    moduleSuggestionRules: GENERIC_MODULE_RULES,
    gateTemplates: [
        {
            id: 'generic-route-decision',
            label: 'Decisao de rota',
            description: 'Ponto em que o usuario precisa escolher o caminho do processo com criterio claro.',
            nodeIdPatterns: ['decision', 'gateway', 'condition'],
            labelTerms: ['decisao', 'rota', 'aprovado', 'ok'],
            semanticRoles: ['decision', 'gateway', 'condition'],
            requiredInputs: ['criterio de decisao', 'responsavel', 'evidencia minima'],
            expectedBranches: ['seguir', 'ajustar'],
            moduleIds: ['pipelines', 'datastudio', 'files'],
            userCheck: 'Definir criterio, responsavel e pelo menos dois caminhos visiveis para o usuario.',
        },
    ],
    technicalParameters: GENERIC_TECHNICAL_PARAMETERS,
    userGuidance: [
        'Comece pelo objetivo do processo, depois conecte etapas, decisoes e evidencias.',
        'Cada decisao precisa dizer o que o usuario deve conferir antes de seguir.',
        'Quando uma etapa depender de outro modulo, configure um modulo equivalente e um fallback claro.',
    ],
};

export const PIPELINE_GAC_DD38_DOMAIN_PROFILE: PipelineDomainProfile = {
    id: 'gac-dd38',
    label: 'GAC/DD38',
    domain: 'gac-dd38',
    summary: 'Perfil para gestao de areas contaminadas, DD-38/CETESB, evidencias, classificacao e fluxo tecnico.',
    aliases: ['gac', 'dd38', 'dd-38', 'cetesb', 'areas contaminadas', '01_dadosanaliticos.vpp', 'm01.gac.flow.dd38'],
    vocabulary: ['DD-38', 'CETESB', 'GAC', 'evidencias', 'responsavel tecnico', 'campo', 'laboratorio', 'classificacao'],
    requiredChecks: [
        'raias tecnicas preservadas',
        'data stores com Files',
        'conectores do VPP validos',
        'score GAC >= 980',
        'foreground visual >= 95%',
    ],
    moduleSuggestionRules: [
        ...GENERIC_MODULE_RULES,
        {
            moduleId: 'files',
            adapterId: 'files.gac',
            label: 'Files GAC',
            openMode: 'open-live',
            confidence: 'high',
            terms: ['documento', 'documentos', 'evidencia', 'evidencias', 'anexo', 'laudo', 'pdf', 'gis', 'edd', 'lims', 'imagem'],
        },
        {
            moduleId: 'pipelines',
            adapterId: 'pipelines.gac',
            label: 'Pipelines/GAC',
            openMode: 'open-live',
            confidence: 'high',
            terms: ['gac', 'dd38', 'dd-38', 'cetesb', 'classificacao', 'decisao tecnica', 'area contaminada'],
        },
        {
            moduleId: 'datastudio',
            adapterId: 'datastudio.gac-catalog',
            label: 'Data Studio GAC',
            openMode: 'side-panel',
            confidence: 'high',
            terms: ['amostra', 'analitico', 'vp', 'vi', 'vr', 'conama', 'cetesb', 'serie', 'catalogo'],
        },
    ],
    gateTemplates: [
        {
            id: 'gac-technical-classification',
            label: 'Classificacao tecnica DD-38',
            description: 'Decisao tecnica que define o caminho do caso conforme evidencias e criterio regulatorio.',
            nodeIdPatterns: ['gac', 'dd38', 'classificacao', 'decision', 'gateway'],
            labelTerms: ['classificacao', 'dd38', 'gac', 'decisao', 'aprovado', 'ok'],
            semanticRoles: ['decision', 'gateway', 'classification', 'gac-decision'],
            requiredInputs: ['evidencias tecnicas', 'fase do caso', 'criterio DD-38', 'responsavel tecnico'],
            expectedBranches: ['seguir', 'revisar'],
            moduleIds: ['pipelines', 'files', 'datastudio'],
            userCheck: 'Mostrar ao professor quais evidencias sustentam a classificacao e qual caminho abre em seguida.',
        },
        {
            id: 'gac-evidence-review',
            label: 'Revisao de evidencias',
            description: 'Conferencia de documentos, imagens, EDD, GIS e laudos antes de seguir o fluxo.',
            nodeIdPatterns: ['evidencia', 'documento', 'files', 'review'],
            labelTerms: ['evidencia', 'documento', 'arquivo', 'edd', 'gis', 'laudo'],
            semanticRoles: ['evidence-review', 'data-store', 'document-review'],
            requiredInputs: ['arquivo', 'origem', 'status', 'responsavel'],
            expectedBranches: ['completo', 'pendente'],
            moduleIds: ['files', 'datastudio'],
            userCheck: 'Garantir que o usuario saiba onde abrir os arquivos e o que falta anexar.',
        },
    ],
    technicalParameters: GAC_DD38_TECHNICAL_PARAMETERS,
    userGuidance: [
        'Use Files para evidencias e Data Studio para dados analiticos antes da decisao GAC.',
        'Toda decisao DD-38 precisa deixar claro qual evidencia sustenta o caminho escolhido.',
        'Na aula, abra o modulo vivo pelo click-go e volte para o slide/processo sem perder contexto.',
    ],
};

export const PIPELINE_MINE_BENEFICIATION_DOMAIN_PROFILE: PipelineDomainProfile = {
    id: 'mine-beneficiation',
    label: 'Beneficiamento mineral',
    domain: 'mine-beneficiation',
    summary: 'Perfil para fluxos ROM-to-product com cominuicao, classificacao, concentracao, rejeitos, agua, energia e balanco.',
    aliases: [
        'mine-beneficiation',
        'beneficiamento',
        'beneficiamento mineral',
        'mineral processing',
        'rom',
        'flotacao',
        'geometalurgia',
        'mine.beneficiation.flow.high-level',
    ],
    vocabulary: [
        'ROM',
        'granulometria',
        'P80',
        'recuperacao',
        'reagentes',
        'agua',
        'energia',
        'rejeitos',
        'balanco de massa',
        'geometalurgia',
    ],
    requiredChecks: [
        'minerio especifico calibrado',
        'granulometria alvo definida',
        'recuperacao e teor acompanhados',
        'reagentes e agua controlados',
        'rota de rejeitos definida',
        'balanco de massa fechado',
    ],
    moduleSuggestionRules: [
        ...GENERIC_MODULE_RULES,
        {
            moduleId: 'datastudio',
            adapterId: 'datastudio.mine-beneficiation',
            label: 'Data Studio - beneficiamento',
            openMode: 'side-panel',
            confidence: 'high',
            terms: ['balanco', 'massa', 'recuperacao', 'teor', 'p80', 'granulometria', 'agua', 'energia', 'kpi', 'tonelagem'],
        },
        {
            moduleId: 'sensors',
            adapterId: 'sensors.mine-equipment',
            label: 'Sensores de planta',
            openMode: 'open-live',
            confidence: 'high',
            terms: ['britador', 'moagem', 'sag', 'bolas', 'peneira', 'flotacao', 'reagente', 'ph', 'eh', 'bomba', 'espessador'],
        },
        {
            moduleId: 'governance',
            adapterId: 'governance.tailings',
            label: 'Governanca de rejeitos',
            openMode: 'side-panel',
            confidence: 'high',
            terms: ['rejeito', 'rejeitos', 'barragem', 'pasta', 'empilhamento seco', 'geotecnia', 'licenca', 'backfill'],
        },
        {
            moduleId: 'libraries',
            adapterId: 'libraries.process-routes',
            label: 'Biblioteca de rotas',
            openMode: 'side-panel',
            confidence: 'medium',
            terms: ['rota', 'blend', 'campanha', 'testwork', 'mineralogia', 'geometalurgia', 'gravimetria', 'magnetica'],
        },
        {
            moduleId: 'reports',
            adapterId: 'reports.mine-production',
            label: 'Relatorios de producao',
            openMode: 'side-panel',
            confidence: 'medium',
            terms: ['produto', 'embarque', 'esg', 'manutencao', 'disponibilidade', 'relatorio', 'capex', 'opex'],
        },
    ],
    gateTemplates: [
        {
            id: 'mine-ore-calibration',
            label: 'Minerio calibrado?',
            description: 'Confirma se o ROM tem dominio, mineralogia, dureza, teor e contaminantes calibrados.',
            nodeIdPatterns: ['mine.ore.calibration'],
            labelTerms: ['minerio calibrado', 'rom calibrado', 'geometalurgico'],
            semanticRoles: ['ore-calibration-decision'],
            requiredInputs: ['ore-consumption-rate', 'mineralogy', 'hardness', 'head-grade', 'moisture', 'clay-slimes', 'deleterious-elements'],
            expectedBranches: ['sim', 'ajustar blend'],
            moduleIds: ['datastudio', 'libraries'],
            userCheck: 'Conferir minerio, blend e dominio antes de alimentar a planta.',
        },
        {
            id: 'mine-p80-classification',
            label: 'P80 liberado?',
            description: 'Valida granulometria alvo e liberacao mineral antes da concentracao.',
            nodeIdPatterns: ['mine.classification'],
            labelTerms: ['p80', 'granulometria', 'liberado'],
            semanticRoles: ['classification-decision'],
            requiredInputs: ['target-p80', 'liberation-size', 'circulating-load', 'overgrinding-risk'],
            expectedBranches: ['sim', 'remoagem'],
            moduleIds: ['datastudio', 'sensors'],
            userCheck: 'Definir P80 por minerio e mostrar quando retorna para remoagem.',
        },
        {
            id: 'mine-reagent-ph',
            label: 'Reagentes/pH OK?',
            description: 'Confere suite de reagentes, pH, Eh, qualidade da agua e densidade de polpa.',
            nodeIdPatterns: ['mine.reagent.decision'],
            labelTerms: ['reagente', 'reagentes', 'ph', 'eh'],
            semanticRoles: ['reagent-ph-decision'],
            requiredInputs: ['ore-type', 'water-quality', 'pH', 'Eh', 'solids-percent', 'residence-time'],
            expectedBranches: ['sim', 'ajustar reagentes'],
            moduleIds: ['sensors', 'datastudio'],
            userCheck: 'Mostrar dosagem, agua e pH antes de liberar a rota de separacao.',
        },
        {
            id: 'mine-separation-route',
            label: 'Rota de separacao?',
            description: 'Escolhe gravimetria/DMS, magnetica, flotacao ou rota combinada conforme mineralogia.',
            nodeIdPatterns: ['mine.separation.route'],
            labelTerms: ['rota de separacao', 'flotacao', 'gravimetria', 'magnetica'],
            semanticRoles: ['separation-route-decision'],
            requiredInputs: ['mineralogy', 'liberation-size', 'density-contrast', 'magnetic-response', 'floatability'],
            expectedBranches: ['gravimetria/DMS', 'magnetica', 'flotacao', 'combinada'],
            moduleIds: ['libraries', 'datastudio'],
            userCheck: 'Deixar a rota escolhida explicita e permitir trocar por minerio.',
        },
        {
            id: 'mine-grade-recovery',
            label: 'Teor e recuperacao OK?',
            description: 'Valida se teor, recuperacao, massa e impurezas estao dentro da meta operacional.',
            nodeIdPatterns: ['mine.grade.decision'],
            labelTerms: ['teor', 'recuperacao'],
            semanticRoles: ['grade-recovery-decision'],
            requiredInputs: ['head-grade', 'concentrate-grade', 'tailings-grade', 'recovery-target', 'mass-pull'],
            expectedBranches: ['sim', 'reprocessar/ajustar'],
            moduleIds: ['datastudio', 'reports'],
            userCheck: 'Comparar teor e recuperacao contra metas antes de seguir para produto.',
        },
        {
            id: 'mine-tailings-route',
            label: 'Rota de rejeitos definida?',
            description: 'Define polpa, pasta, filtrado/empilhamento seco, barragem, backfill ou reprocessamento.',
            nodeIdPatterns: ['mine.tailings.route.decision'],
            labelTerms: ['rota de rejeitos', 'rejeitos', 'barragem', 'empilhamento seco'],
            semanticRoles: ['tailings-route-decision'],
            requiredInputs: ['tailings-volume', 'solids-percent', 'geotechnical-risk', 'water-recovery', 'license-constraint'],
            expectedBranches: ['polpa', 'pasta', 'filtrado', 'backfill', 'reprocessamento'],
            moduleIds: ['governance', 'datastudio'],
            userCheck: 'Explicitar destino de rejeitos, agua recuperada e risco geotecnico.',
        },
        {
            id: 'mine-water-energy',
            label: 'Agua/energia OK?',
            description: 'Valida consumo especifico de agua, energia, recirculacao e gargalos de utilidades.',
            nodeIdPatterns: ['mine.water.energy.decision'],
            labelTerms: ['agua', 'energia', 'utilidades'],
            semanticRoles: ['water-energy-decision'],
            requiredInputs: ['water-make-up', 'water-recycle', 'kwh-per-ton', 'pump-capacity', 'reagent-water-quality'],
            expectedBranches: ['sim', 'ajustar utilidades'],
            moduleIds: ['datastudio', 'sensors'],
            userCheck: 'Mostrar consumo e recirculacao antes de fechar o ciclo de planta.',
        },
        {
            id: 'mine-mass-balance',
            label: 'Balanco fechado?',
            description: 'Fecha massas, teores, recuperacoes, umidade e perdas antes de publicar KPI.',
            nodeIdPatterns: ['mine.mass.balance.decision'],
            labelTerms: ['balanco fechado', 'balanco de massa'],
            semanticRoles: ['mass-balance-decision'],
            requiredInputs: ['ore-consumption-rate', 'feed-tonnage', 'head-grade', 'concentrate-grade', 'tailings-grade', 'moisture', 'density'],
            expectedBranches: ['sim', 'reconciliar'],
            moduleIds: ['datastudio', 'reports'],
            userCheck: 'Nao publicar KPI enquanto massa, teor e recuperacao nao fecharem dentro da tolerancia.',
        },
    ],
    technicalParameters: MINE_BENEFICIATION_TECHNICAL_PARAMETERS,
    userGuidance: [
        'Comece calibrando minerio, granulometria alvo, recuperacao e rota de rejeitos.',
        'Use gates condicionais para mostrar onde uma rota muda por mineralogia, reagente, agua, energia ou balanco.',
        'Para virar fluxo real, preencha dados de planta, testwork, consumo, massa, reagentes e restricoes ambientais.',
    ],
};

export const PIPELINE_DOMAIN_PROFILES: PipelineDomainProfile[] = [
    PIPELINE_GAC_DD38_DOMAIN_PROFILE,
    PIPELINE_MINE_BENEFICIATION_DOMAIN_PROFILE,
    PIPELINE_GENERIC_DOMAIN_PROFILE,
];

function _nonEmpty(value: unknown): string {
    return String(value ?? '').trim();
}

function _asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function _asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map(_nonEmpty).filter(Boolean) : [];
}

function _unique(values: string[]): string[] {
    return Array.from(new Set(values.map(_nonEmpty).filter(Boolean)));
}

export function normalizePipelineDomainText(value: unknown): string {
    return _nonEmpty(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function _nodeText(node: PipelinePackNode, semantic?: PipelineSemanticEntry | null): string {
    return [
        node.id,
        node.type,
        node.label,
        node.contextLabel,
        node.semanticRole,
        node.targetModule,
        node.lane,
        node.phase,
        semantic?.label,
        semantic?.meaning,
        ...(semantic?.domainTags || []),
        ..._asStringArray(_asObject(node.moduleInputParams).requiredInputs),
    ].map(_nonEmpty).filter(Boolean).join(' ');
}

function _packText(pack: PipelinePack): string {
    return [
        pack.id,
        pack.title,
        pack.description,
        pack.source.sourceFileName,
        pack.semantics.domain,
        pack.validationProfile.scope,
        ...Object.keys(pack.semantics.glossary || {}),
        ...Object.values(pack.semantics.glossary || {}),
        ...pack.audit.notes,
        ...pack.graph.nodes.map((node) => _nodeText(
            node,
            pack.semantics.entries.find((entry) => entry.nodeId === node.id) || null,
        )),
    ].map(_nonEmpty).filter(Boolean).join(' ');
}

function _profileScore(profile: PipelineDomainProfile, pack: PipelinePack, normalizedText: string): PipelineDomainProfileMatch {
    let score = 0;
    const evidence: string[] = [];
    const normalizedDomain = normalizePipelineDomainText(pack.semantics.domain);
    const normalizedScope = normalizePipelineDomainText(pack.validationProfile.scope);
    const normalizedSource = normalizePipelineDomainText(pack.source.sourceFileName);

    if (normalizedDomain.includes(normalizePipelineDomainText(profile.domain))
        || normalizedDomain.includes(normalizePipelineDomainText(profile.id))) {
        score += 8;
        evidence.push(`Dominio semantico: ${pack.semantics.domain}`);
    }
    if (normalizedScope.includes(normalizePipelineDomainText(profile.domain))
        || normalizedScope.includes(normalizePipelineDomainText(profile.id))) {
        score += 6;
        evidence.push(`Escopo do score: ${pack.validationProfile.scope}`);
    }
    if (normalizedSource && profile.aliases.some((alias) => normalizedSource.includes(normalizePipelineDomainText(alias)))) {
        score += 5;
        evidence.push(`Fonte reconhecida: ${pack.source.sourceFileName}`);
    }

    const matchedAliases = profile.aliases
        .filter((alias) => normalizedText.includes(normalizePipelineDomainText(alias)))
        .slice(0, 8);
    if (matchedAliases.length > 0) {
        score += Math.min(8, matchedAliases.length * 2);
        evidence.push(`Termos encontrados: ${matchedAliases.join(', ')}`);
    }

    const matchedVocabulary = profile.vocabulary
        .filter((term) => normalizedText.includes(normalizePipelineDomainText(term)))
        .slice(0, 5);
    if (matchedVocabulary.length > 0) {
        score += Math.min(5, matchedVocabulary.length);
        evidence.push(`Vocabulario do dominio: ${matchedVocabulary.join(', ')}`);
    }

    return {
        profile,
        confidence: profile.id === 'generic-process' ? 0.1 : Math.min(1, score / 18),
        evidence,
    };
}

export function getPipelineDomainProfiles(): PipelineDomainProfile[] {
    return PIPELINE_DOMAIN_PROFILES;
}

export function findPipelineDomainProfile(profileId: string): PipelineDomainProfile | null {
    const normalized = normalizePipelineDomainText(profileId);
    return PIPELINE_DOMAIN_PROFILES.find((profile) => {
        return normalizePipelineDomainText(profile.id) === normalized
            || normalizePipelineDomainText(profile.domain) === normalized
            || profile.aliases.some((alias) => normalizePipelineDomainText(alias) === normalized);
    }) || null;
}

export function inferPipelineDomainProfile(input: unknown): PipelineDomainProfileMatch {
    const pack = normalizePipelinePack(input);
    const normalizedText = normalizePipelineDomainText(_packText(pack));
    const matches = PIPELINE_DOMAIN_PROFILES
        .filter((profile) => profile.id !== 'generic-process')
        .map((profile) => _profileScore(profile, pack, normalizedText))
        .sort((a, b) => b.confidence - a.confidence);
    const best = matches[0];
    if (best && best.confidence > 0) return best;
    return {
        profile: PIPELINE_GENERIC_DOMAIN_PROFILE,
        confidence: 0.1,
        evidence: ['Nenhum dominio especifico foi identificado; usando perfil generico.'],
    };
}

function _resolveProfile(input?: PipelineDomainProfile | PipelineDomainProfileId | unknown): PipelineDomainProfile {
    if (!input) return PIPELINE_GENERIC_DOMAIN_PROFILE;
    if (typeof input === 'object' && input && 'gateTemplates' in input && 'moduleSuggestionRules' in input) {
        return input as PipelineDomainProfile;
    }
    if (typeof input === 'string') return findPipelineDomainProfile(input) || PIPELINE_GENERIC_DOMAIN_PROFILE;
    return inferPipelineDomainProfile(input).profile;
}

function _moduleRulesForProfile(profile: PipelineDomainProfile): PipelineDomainModuleSuggestionRule[] {
    const byAdapter = new Map<string, PipelineDomainModuleSuggestionRule>();
    for (const rule of profile.id === 'generic-process'
        ? profile.moduleSuggestionRules
        : [...GENERIC_MODULE_RULES, ...profile.moduleSuggestionRules]) {
        byAdapter.set(`${rule.moduleId}:${rule.adapterId}`, rule);
    }
    return Array.from(byAdapter.values());
}

function _cloneTechnicalParameter(parameter: DomainTechnicalParameter): DomainTechnicalParameter {
    return {
        ...parameter,
        ...(parameter.examples ? { examples: [...parameter.examples] } : {}),
        ...(parameter.appliesToSemanticRoles ? { appliesToSemanticRoles: [...parameter.appliesToSemanticRoles] } : {}),
    };
}

export function listDomainTechnicalParameters(
    input?: PipelineDomainProfile | PipelineDomainProfileId | unknown,
    applicability?: DomainTechnicalParameterApplicability,
): DomainTechnicalParameter[] {
    const parameters = _resolveProfile(input).technicalParameters || [];
    return parameters
        .filter((parameter) => !applicability || parameter.applicability === applicability)
        .map(_cloneTechnicalParameter);
}

export function summarizeDomainTechnicalParameterCatalog(
    input?: PipelineDomainProfile | PipelineDomainProfileId | unknown,
): PipelineDomainTechnicalParameterCatalogSummary {
    const profile = _resolveProfile(input);
    const parameters = listDomainTechnicalParameters(profile);
    const required = parameters.filter((parameter) => parameter.applicability === 'required');
    const optional = parameters.filter((parameter) => parameter.applicability === 'optional');
    const notApplicable = parameters.filter((parameter) => parameter.applicability === 'not-applicable');
    return {
        profileId: profile.id,
        label: profile.label,
        required,
        optional,
        notApplicable,
        requiredCount: required.length,
        optionalCount: optional.length,
        notApplicableCount: notApplicable.length,
    };
}

function _subjectText(subject: unknown, semantic?: PipelineSemanticEntry | null): string {
    if (typeof subject === 'string') return subject;
    const object = _asObject(subject);
    return [
        object.id,
        object.type,
        object.label,
        object.contextLabel,
        object.semanticRole,
        object.targetModule,
        object.lane,
        object.phase,
        object.meaning,
        semantic?.label,
        semantic?.meaning,
        ...(semantic?.domainTags || []),
        ..._asStringArray(object.domainTags),
        ..._asStringArray(_asObject(object.moduleInputParams).requiredInputs),
    ].map(_nonEmpty).filter(Boolean).join(' ');
}

export function suggestPipelineDomainModules(
    subject: unknown,
    profileInput?: PipelineDomainProfile | PipelineDomainProfileId,
    semantic?: PipelineSemanticEntry | null,
): PipelineDomainModuleSuggestion[] {
    const subjectText = _subjectText(subject, semantic || null);
    const inferredProfile = profileInput
        ? _resolveProfile(profileInput)
        : inferPipelineDomainProfile({
            title: subjectText,
            semantics: { domain: subjectText, entries: [] },
            graph: { nodes: [], edges: [], lanes: [], groups: [] },
        }).profile;
    const normalizedText = normalizePipelineDomainText(subjectText);
    if (!normalizedText) return [];
    const genericRuleKeys = new Set(GENERIC_MODULE_RULES.map((rule) => `${rule.moduleId}:${rule.adapterId}`));
    const profileRuleKeys = new Set(inferredProfile.moduleSuggestionRules
        .map((rule) => `${rule.moduleId}:${rule.adapterId}`)
        .filter((key) => !genericRuleKeys.has(key)));

    return _moduleRulesForProfile(inferredProfile)
        .map((rule) => {
            const matchedTerms = _unique(rule.terms.filter((term) => normalizedText.includes(normalizePipelineDomainText(term))));
            const ruleKey = `${rule.moduleId}:${rule.adapterId}`;
            const domainSpecificBonus = inferredProfile.id !== 'generic-process' && profileRuleKeys.has(ruleKey) ? 2 : 0;
            return matchedTerms.length > 0
                ? {
                    moduleId: rule.moduleId,
                    adapterId: rule.adapterId,
                    label: rule.label,
                    confidence: rule.confidence,
                    reason: `${rule.reasonLabel || 'Encontrado no texto'}: ${matchedTerms.slice(0, 3).join(', ')}.`,
                    openMode: rule.openMode,
                    matchedTerms,
                    score: matchedTerms.length + domainSpecificBonus + (rule.confidence === 'high' ? 2 : rule.confidence === 'medium' ? 1 : 0),
                }
                : null;
        })
        .filter((item): item is PipelineDomainModuleSuggestion & { score: number } => !!item)
        .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
        .map(({ score: _score, ...item }) => item);
}

export function listPipelineDomainGateTemplates(input?: PipelineDomainProfile | PipelineDomainProfileId | unknown): PipelineDomainGateTemplate[] {
    return _resolveProfile(input).gateTemplates;
}

export function summarizePipelineDomainProfile(input: unknown): PipelineDomainProfileSummary {
    const match = inferPipelineDomainProfile(input);
    const profile = match.profile;
    const technicalParameters = listDomainTechnicalParameters(profile);
    return {
        profileId: profile.id,
        label: profile.label,
        domain: profile.domain,
        summary: profile.summary,
        confidence: match.confidence,
        evidence: match.evidence,
        vocabulary: profile.vocabulary,
        requiredChecks: profile.requiredChecks,
        requiredGateLabels: profile.gateTemplates.map((gate) => gate.label),
        moduleLabels: _unique(_moduleRulesForProfile(profile).map((rule) => rule.label)),
        technicalParameters,
        requiredTechnicalParameterLabels: technicalParameters
            .filter((parameter) => parameter.applicability === 'required')
            .map((parameter) => parameter.label),
        optionalTechnicalParameterLabels: technicalParameters
            .filter((parameter) => parameter.applicability === 'optional')
            .map((parameter) => parameter.label),
        notApplicableTechnicalParameterLabels: technicalParameters
            .filter((parameter) => parameter.applicability === 'not-applicable')
            .map((parameter) => parameter.label),
        userGuidance: profile.userGuidance,
    };
}
