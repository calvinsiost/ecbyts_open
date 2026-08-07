// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { firstText } from './trainingSlideAppOptionsModel.js';
import type {
    NormalizedTrainingSlideAppOption,
    TrainingSlideAppOptionActionResult,
    TrainingSlideAppOptionProfessorSummary,
    TrainingSlideAppOptionType,
} from './trainingSlideAppOptionsTypes.js';
export function fallbackMessage(option: NormalizedTrainingSlideAppOption): string {
    const handlerPart = option.handlerName ? `window.${option.handlerName} indisponivel. ` : '';
    const withAsset = (message: string): string => {
        if (!option.fallbackAssetId || message.includes(option.fallbackAssetId)) return message;
        return `${message} Fallback local: ${option.fallbackAssetId}.`;
    };
    if (option.fallbackText) return withAsset(`${handlerPart}${option.fallbackText}`);
    switch (option.type) {
        case 'snapshot':
            return withAsset(`${handlerPart}Snapshot mostrado como apoio local.`);
        case 'poll':
            return withAsset(`${handlerPart}Voto registrado apenas nesta tela.`);
        case 'reveal':
            return withAsset(`${handlerPart}Explicacao revelada localmente.`);
        case 'resource':
            return withAsset(`${handlerPart}Recurso aberto pelo link configurado.`);
        case 'open-handler':
        default:
            return withAsset(`${handlerPart}Use o slide ou um snapshot como fallback.`);
    }
}

export function optionContentLabel(option: NormalizedTrainingSlideAppOption): string {
    return option.description ? `${option.title} - ${option.description}` : option.title;
}

export function moduleLabel(option: NormalizedTrainingSlideAppOption): string {
    const byHandler: Record<string, string> = {
        handleOpenPipelineManager: 'Pipelines',
        handleOpenTemporalAnalysis: 'Analise temporal',
        handleOpenProjectGantt: 'Cronograma/Gantt',
        handleOpenMapPicker: 'Mapa',
        handleSwitchView: 'Modelo 3D',
        handleOpenInterpolationPanel: 'Interpolacao espacial',
        handleOpenDataEntryMatrix: 'App de campo',
        handleOpenNNManager: 'Rede neural',
        handleOpenDataStudio: 'DataStudio',
        handleOpenFiles: 'Files',
        handleOpenReportOverlay: 'Relatorios',
        handleOpenEisDashboard: 'Dashboard EIS',
    };
    const bySurface: Record<string, string> = {
        'pipelines-gac': 'Pipelines',
        'analytics-temporal': 'Analise temporal',
        'governance-gantt': 'Cronograma/Gantt',
        'spatial-map': 'Mapa',
        'spatial.webmap2d': 'Webmap 2D',
        'webmap-2d': 'Webmap 2D',
        'field.collection': 'App de campo',
        'field-data-entry': 'App de campo',
        'ai.neural-network': 'Rede neural',
        'neural-network': 'Rede neural',
        'model-3d': 'Modelo 3D',
        'plume-interpolation': 'Interpolacao espacial',
        'datastudio-module': 'DataStudio',
        'files-asset': 'Files',
        'report-eis': 'Relatorios',
    };
    return (
        firstText(bySurface[option.surfaceType], bySurface[option.adapterId], byHandler[option.handlerName]) ||
        friendlyDestinationLabel(option)
    );
}

export function optionInputParamPairs(option: NormalizedTrainingSlideAppOption): readonly [string, string][] {
    const firstArg = option.args.find((arg) => arg && typeof arg === 'object' && !Array.isArray(arg)) as
        | Record<string, unknown>
        | undefined;
    const source = firstArg || {};
    const pairs: readonly [string, string][] = [
        ['Fluxo', firstText(source.target, source.pipelineId, source.templateId, option.modelPresetId)],
        ['Preset', firstText(source.presetId, option.modelPresetId)],
        ['Node', firstText(source.nodeId)],
        ['Curso', firstText(source.course, source.courseId)],
        ['Slide', firstText(source.slide, source.slideNumber)],
        ['Retorno', firstText(source.returnLabel)],
    ];
    return pairs.filter(([, value]) => Boolean(value));
}

export function optionInputParamsLabel(option: NormalizedTrainingSlideAppOption): string {
    const pairs = optionInputParamPairs(option);
    if (pairs.length === 0) return 'Sem parametros externos; acao local do slide.';
    return pairs.map(([label, value]) => `${label}: ${value}`).join(' | ');
}

export function optionModuleContextLabel(option: NormalizedTrainingSlideAppOption): string {
    const summary = option.moduleContextSummary;
    if (!summary) return 'Sem contexto embutido; acao local ou recurso simples.';
    return `${summary.statusLabel}: ${summary.moduleLabel}; ${summary.filterLabel}; ${summary.fallbackLabel}.`;
}

export function friendlyDestinationLabel(option: NormalizedTrainingSlideAppOption): string {
    const byPreset: Record<string, string> = {
        'm01.gac.flow.dd38': 'Pipelines - fluxo GAC DD38',
        'm01.temporal.na.mann-kendall': 'Analise temporal - Mann-Kendall',
        'm01.agile.gantt': 'Cronograma da aula',
        'm01.map.spatial': 'Webmap 2D - camada espacial',
        'm01.field.collection': 'App de campo - coleta estruturada',
        'm01.ai.assistant': 'Rede neural - IA rastreavel',
        'm01.ai.neural-network': 'Rede neural - IA rastreavel',
        'm01.model3d.plume': 'Modelo 3D - pluma',
        'm01.plume.interpolation': 'Graficos espaciais - pluma/interpolacao',
        'm01.datastudio.overview': 'DataStudio - cadeia digital',
        'm01.files.gac-catalog': 'Files - catalogo GAC',
        'm01.cross.tab.validation': 'DataStudio - validacao',
        'm01.dashboard.eis': 'Dashboard EIS',
        'm01.report.eis.summary': 'Relatorio EIS',
    };
    const byTarget: Record<string, string> = {
        'pipelines.gac': 'Pipelines - fluxo GAC',
        'pipelines-gac': 'Pipelines - fluxo GAC',
        'analytics.temporal': 'Analise temporal',
        'analytics-temporal': 'Analise temporal',
        'governance.gantt': 'Cronograma da aula',
        'governance-gantt': 'Cronograma da aula',
        'spatial.webmap2d': 'Webmap 2D - camada espacial',
        'webmap-2d': 'Webmap 2D - camada espacial',
        'field.collection': 'App de campo - coleta estruturada',
        'field-data-entry': 'App de campo - coleta estruturada',
        'ai.neural-network': 'Rede neural - IA rastreavel',
        'neural-network': 'Rede neural - IA rastreavel',
        'spatial.interpolation': 'Graficos espaciais',
        'spatial-map': 'Mapa - geointeligencia',
        'plume-interpolation': 'Graficos espaciais - pluma/interpolacao',
        'spatial.model3d': 'Modelo 3D - pluma',
        'model-3d': 'Modelo 3D - pluma',
        'datastudio.module': 'DataStudio',
        'datastudio-module': 'DataStudio',
        'files.asset': 'Files - materiais da aula',
        'files-asset': 'Files - materiais da aula',
        'datastudio.validation': 'DataStudio - validacao',
        'datastudio-validation': 'DataStudio - validacao',
        'report.overlay': 'Relatorio da aula',
        'report-eis': 'Relatorio EIS',
    };
    const fallbackByType: Record<TrainingSlideAppOptionType, string> = {
        'open-handler': 'App vinculado ao slide',
        snapshot: 'Snapshot local',
        poll: 'Pergunta da turma',
        reveal: 'Explicacao do slide',
        resource: 'Material de apoio',
    };
    return (
        firstText(byPreset[option.modelPresetId], byTarget[option.surfaceType], byTarget[option.adapterId]) ||
        firstText(option.actionLabel, fallbackByType[option.type])
    );
}

export function optionFallbackLabel(option: NormalizedTrainingSlideAppOption): string {
    if (option.fallbackText) return option.fallbackText;
    if (option.fallbackAssetId || option.imageUrl) return 'Snapshot local deste slide.';
    if (option.type === 'resource' && option.url) return 'Material aberto pelo link configurado.';
    return 'Apoio local deste painel.';
}

export function optionReasonLabel(option: NormalizedTrainingSlideAppOption): string {
    if (option.description) return option.description;
    switch (option.type) {
        case 'poll':
            return option.question || 'Pergunta rapida para engajar a turma neste slide.';
        case 'reveal':
            return 'Mostra a orientacao do professor sem sair do slide.';
        case 'snapshot':
            return 'Usa uma imagem local quando o modulo vivo nao for necessario.';
        case 'resource':
            return 'Abre o material de apoio associado a este ponto da aula.';
        case 'open-handler':
        default:
            return 'Abre uma parte do ecossistema ja escolhida para este slide.';
    }
}

export function optionPresetStatusLabel(option: NormalizedTrainingSlideAppOption): string {
    if (option.modelPresetId) return `Preset ${option.modelPresetId} pronto`;
    if (option.handlerName || option.url) return 'Destino configurado';
    return 'Acao local no slide';
}

export function optionReturnLabel(option: NormalizedTrainingSlideAppOption): string {
    if (option.type === 'open-handler' || option.type === 'resource') {
        return 'Voltar ao slide pelo Workbench da aula';
    }
    return 'Permanece neste slide';
}

export function summarizeTrainingSlideAppOptionForProfessor(
    option: NormalizedTrainingSlideAppOption,
): TrainingSlideAppOptionProfessorSummary {
    return Object.freeze({
        destinationLabel: friendlyDestinationLabel(option),
        reasonLabel: optionReasonLabel(option),
        presetStatusLabel: optionPresetStatusLabel(option),
        returnLabel: optionReturnLabel(option),
        fallbackLabel: optionFallbackLabel(option),
    });
}

export function initialStatusMessage(option: NormalizedTrainingSlideAppOption): string {
    if (option.handlerName || (option.type === 'resource' && option.url)) {
        return 'Pronto para abrir. Se o app nao responder, use o apoio indicado acima.';
    }
    return 'Pronto para usar neste painel.';
}

export function visibleResultMessage(
    result: TrainingSlideAppOptionActionResult,
    option: NormalizedTrainingSlideAppOption,
): string {
    if (result.ok) {
        return result.mode === 'resource' ? 'Recurso aberto.' : 'Destino aberto.';
    }
    if (result.mode === 'local') {
        switch (option.type) {
            case 'poll':
                return 'Voto registrado neste painel.';
            case 'reveal':
                return 'Explicacao revelada neste painel.';
            case 'snapshot':
                return 'Snapshot local exibido.';
            case 'resource':
            case 'open-handler':
            default:
                break;
        }
    }
    return `Nao abriu no destino. Use: ${optionFallbackLabel(option)}`;
}

export function inspectorResultMessage(
    result: TrainingSlideAppOptionActionResult,
    option: NormalizedTrainingSlideAppOption,
): string {
    return visibleResultMessage(result, option);
}
