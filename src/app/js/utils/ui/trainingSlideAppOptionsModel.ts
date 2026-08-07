// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import {
    normalizeModuleViewContext,
    summarizeContextForTeacher,
    validateModuleViewContext,
    type ModuleViewContext,
} from '../../core/training/moduleViewContextPure.js';
import {
    INTRO_PRESET_PANEL_DEFAULTS,
    type IntroPresetPanelDefaults,
} from './trainingSlideAppOptionPresets.js';
import type {
    NormalizedTrainingSlideAppOption,
    TrainingSlideAppOptionInput,
    TrainingSlideAppOptionType,
    TrainingSlideAppOptionsInput,
} from './trainingSlideAppOptionsTypes.js';

const TRAINING_SLIDE_APP_OPTION_TYPES = ['open-handler', 'snapshot', 'poll', 'reveal', 'resource'] as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function stringifyDisplayValue(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return String(value).trim();
    }
    return '';
}

export function firstText(...values: readonly unknown[]): string {
    for (const value of values) {
        const text = stringifyDisplayValue(value);
        if (text) return text;
    }
    return '';
}

export function stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => stringifyDisplayValue(item)).filter(Boolean);
}

export function uniqueStringArray(values: readonly string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
        const text = stringifyDisplayValue(value);
        const key = text.toLowerCase();
        if (!text || seen.has(key)) continue;
        seen.add(key);
        out.push(text);
    }
    return out;
}

export function unknownArray(value: unknown): readonly unknown[] {
    return Array.isArray(value) ? value : [];
}

export function safeUrl(value: unknown): string {
    const url = stringifyDisplayValue(value);
    if (!url || /^\s*javascript:/i.test(url)) return '';
    return url;
}

/**
 * Resolver do token declarativo `asset:m01:snapshot:*` (fallbackAssetId dos presets do Modulo 01)
 * para uma URL de imagem real, preenchendo `option.imageUrl` na normalizacao.
 *
 * Contexto (T4.5 — docs/specs/features/SPEC_TRAINING_LMS_OPEN_POINTS.md): antes desta mudanca o
 * token nascia em varios lugares (trainingSlideAppOptionPresets.ts, teachingModelIntroModule01.ts,
 * _introModule01TeachingModelPure.ts) e fluia ate moduleContext.fallback.assetId, mas NUNCA resolvia
 * para midia — renderTrainingSlideSnapshotFallback so renderiza <img> se option.imageUrl existir,
 * senao cai no texto "Snapshot nao configurado". Este mapa fecha esse elo que faltava.
 *
 * IMPORTANTE — nao ha PNG real hoje: nenhum snapshot do diagrama GAC/DD-38 foi capturado ainda
 * ATUALIZACAO 2026-07-03: Calvin forneceu o PDF real do diagrama BPMN do fluxo GAC/DD-38
 * ("Aula 3_Diagrama_GAC-DD38_v01.pdf") — renderizado em PNG (WinRT PdfDocument, 1400px largura,
 * app/assets/gac-dd38-snapshot.png) e registrado abaixo para `asset:m01:snapshot:gac-dd38`.
 * Os DEMAIS tokens `asset:m01:snapshot:*` (temporal-na-mk, agile-gantt, webmap-2d etc.) continuam
 * sem fonte real — não fabricar URLs para eles até receber o insumo correspondente.
 * (Nota histórica: nao existia arquivo em app/assets nem asset registrado via Files com a tag
 * `asset:m01:snapshot:gac-dd38` — populacao com uma URL fabricada/placeholder violaria a instrucao
 * de nao fabricar imagem falsa. O mecanismo alternativo de Files ja existente
 * (syncTrainingAssetFilesToFiles em utils/handlers/trainingAssets.ts, que grava a tag `asset:<id>`),
 * continua disponivel para snapshots que precisem viver fora do bundle versionado.)
 *
 * Duas formas de alimentar o mapa, ambas suportadas para nao travar em uma unica fonte:
 * 1) Mapa estatico (este objeto) — bom para snapshots fixos versionados com o codigo.
 * 2) Lookup dinamico injetavel — um chamador (ex.: lmsAuthoringModal.ts) pode resolver o asset por
 *    tag via fileManager.list({tag: 'asset:<id>'}) + fileManager.getDownloadUrl (ambos assincronos/
 *    ligados a rede) ANTES de chamar normalizeTrainingSlideAppOptions, e passar o resultado como um
 *    Record<token, url> (ou uma funcao sincrona) no 2o argumento — ver TrainingSlideAppOptionResolverOptions.
 * A normalizacao em si permanece sincrona e pura (sem I/O), coerente com todos os callers atuais.
 */
export const TRAINING_SLIDE_SNAPSHOT_ASSET_MAP: Readonly<Record<string, string>> = Object.freeze({
    // Insumo real de Calvin (2026-07-03): diagrama BPMN completo do fluxo GAC/DD-38, 5 raias.
    'asset:m01:snapshot:gac-dd38': '/assets/gac-dd38-snapshot.png',
    // Demais tokens (temporal-na-mk, agile-gantt, webmap-2d, field-collection,
    // ai-neural-network, model3d-plume, plume-interpolation, datastudio-overview,
    // files-gac-catalog) seguem SEM fonte real — ver comentário acima antes de preencher.
});

export type TrainingSlideSnapshotAssetLookup = (assetId: string) => string;

export interface TrainingSlideAppOptionResolverOptions {
    /** Mapa adicional token->URL, mesclado por cima do TRAINING_SLIDE_SNAPSHOT_ASSET_MAP (maior prioridade). */
    readonly snapshotAssetMap?: Readonly<Record<string, string>>;
    /** Lookup sincrono opcional (ex.: alimentado por um fileManager.list({tag}) resolvido antes da chamada). */
    readonly resolveSnapshotAssetUrl?: TrainingSlideSnapshotAssetLookup;
}

/**
 * Resolve um fallbackAssetId (token `asset:m01:snapshot:*`) para uma URL de imagem real.
 * Ordem de prioridade: lookup injetado > snapshotAssetMap das opcoes > mapa estatico do modulo.
 * Retorna string vazia (nunca fabrica URL) quando o token nao e conhecido por nenhuma fonte.
 */
export function resolveTrainingSlideSnapshotAssetUrl(
    assetId: string,
    options: TrainingSlideAppOptionResolverOptions = {},
): string {
    const id = stringifyDisplayValue(assetId);
    if (!id) return '';
    if (typeof options.resolveSnapshotAssetUrl === 'function') {
        const resolved = safeUrl(options.resolveSnapshotAssetUrl(id));
        if (resolved) return resolved;
    }
    const fromOptionsMap = options.snapshotAssetMap ? options.snapshotAssetMap[id] : '';
    if (fromOptionsMap) return safeUrl(fromOptionsMap);
    return safeUrl(TRAINING_SLIDE_SNAPSHOT_ASSET_MAP[id] || '');
}

function optionArray(value: unknown): readonly TrainingSlideAppOptionInput[] {
    if (!Array.isArray(value)) return [];
    return value.filter(isRecord) as readonly TrainingSlideAppOptionInput[];
}

function isTrainingSlideAppOptionType(value: string): value is TrainingSlideAppOptionType {
    return (TRAINING_SLIDE_APP_OPTION_TYPES as readonly string[]).includes(value);
}

function normalizeType(value: unknown): TrainingSlideAppOptionType {
    const type = stringifyDisplayValue(value);
    return isTrainingSlideAppOptionType(type) ? type : 'open-handler';
}

function fallbackText(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (!isRecord(value)) return '';
    return firstText(value.body, value.message, value.text, value.title);
}

export function lookupKey(value: unknown): string {
    return stringifyDisplayValue(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/_/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
}

function presetLookupValues(record: Record<string, unknown>): string[] {
    return uniqueStringArray([
        firstText(record.modelPresetId),
        firstText(record.presetId),
        firstText(record.id),
        firstText(record.key),
        firstText(record.adapterId),
        firstText(record.surfaceType),
        firstText(record.type),
        ...stringArray(record.meta),
    ]);
}

function resolveIntroPresetDefaults(record: Record<string, unknown>): IntroPresetPanelDefaults | null {
    const values = presetLookupValues(record);
    if (values.length === 0) return null;
    for (const value of values) {
        const key = lookupKey(value);
        if (!key) continue;
        for (const preset of INTRO_PRESET_PANEL_DEFAULTS) {
            const keys = [preset.id, ...preset.aliases].map(lookupKey);
            if (keys.includes(key)) return preset;
            if (keys.some((presetKey) => presetKey.startsWith('m01.') && key.includes(presetKey))) return preset;
        }
    }
    return null;
}

function resolvePresetHandlerName(rawHandlerName: string, preset: IntroPresetPanelDefaults | null): string {
    if (!preset) return rawHandlerName;
    if (!rawHandlerName) return preset.handlerName;
    if (preset.blockedHandlers?.includes(rawHandlerName)) return preset.handlerName;
    return rawHandlerName;
}

function resolvePresetArgs(
    rawArgs: readonly unknown[],
    handlerName: string,
    preset: IntroPresetPanelDefaults | null,
): readonly unknown[] {
    if (rawArgs.length > 0) return rawArgs;
    if (preset && handlerName && handlerName === preset.handlerName) return preset.args;
    return [];
}

function firstObjectArg(args: readonly unknown[]): Record<string, unknown> {
    return (args.find((arg) => isRecord(arg)) as Record<string, unknown> | undefined) || {};
}

function buildOptionModuleViewContext(input: {
    readonly handlerName: string;
    readonly adapterId: string;
    readonly surfaceType: string;
    readonly modelPresetId: string;
    readonly args: readonly unknown[];
    readonly fallbackAssetId: string;
    readonly fallbackText: string;
}): ModuleViewContext | null {
    const isGac =
        input.handlerName === 'handleOpenPipelineManager' ||
        input.adapterId === 'pipelines.gac' ||
        input.surfaceType === 'pipelines-gac';
    if (!isGac) return null;

    const arg = firstObjectArg(input.args);
    const courseId = firstText(arg.courseId, arg.course, 'intro-module01');
    const slideIndex = Number(firstText(arg.slideIndex, arg.slide)) || 4;
    const templateId = firstText(arg.templateId, arg.pipelineId, 'gac-dd38-environmental-management');
    const nodeId = firstText(arg.nodeId);
    const modelPresetId = firstText(arg.presetId, input.modelPresetId, 'm01.gac.flow.dd38');
    return normalizeModuleViewContext({
        source: {
            kind: 'training-slide',
            courseId,
            slideIndex,
            modelPresetId,
            returnLabel: firstText(arg.returnLabel, 'Voltar ao slide'),
        },
        destination: {
            moduleId: 'pipelines',
            adapterId: 'pipelines.gac',
            mode: 'open-live',
            target: {
                type: 'pipeline',
                templateId,
                ...(firstText(arg.pipelineId) ? { pipelineId: firstText(arg.pipelineId) } : {}),
                ...(nodeId ? { nodeId } : {}),
                mode: 'explain',
            },
        },
        intent: {
            purpose: 'review-decision',
            audience: 'teacher',
            primaryQuestion: 'Como o fluxo GAC DD-38 organiza a decisao de classificacao?',
            expectedTakeaway: 'Mostrar a sequencia tecnica sem listar automacoes irrelevantes.',
            cognitiveLoad: 'medium',
        },
        filters: {
            scope: { source: 'training', courseId, modelPresetId },
            domain: { standard: ['CETESB-DD-38'], workflowType: ['GAC'] },
            data: { ...(nodeId ? { nodeIds: [nodeId] } : {}), includeArchived: false },
            visibility: { audience: 'teacher', status: 'demo' },
        },
        view: {
            layout: 'diagram',
            density: 'minimal',
            highlightMode: 'spotlight',
            zoom: nodeId ? 'selected' : 'overview',
            hiddenPanels: ['raw-json', 'bpmn-import', 'debug-log'],
        },
        selection: nodeId ? { selectedNodeId: nodeId } : {},
        fallback: {
            kind: 'snapshot',
            ...(input.fallbackAssetId ? { assetId: input.fallbackAssetId } : {}),
            ...(input.fallbackText ? { text: input.fallbackText } : {}),
        },
    });
}

function defaultTitle(type: TrainingSlideAppOptionType, index: number): string {
    switch (type) {
        case 'snapshot':
            return 'Snapshot de apoio';
        case 'poll':
            return 'Pergunta para turma';
        case 'reveal':
            return 'Revelar explicacao';
        case 'resource':
            return 'Material de apoio';
        case 'open-handler':
        default:
            return `Opcao ${index + 1}`;
    }
}

function defaultActionLabel(type: TrainingSlideAppOptionType): string {
    switch (type) {
        case 'snapshot':
            return 'Mostrar snapshot';
        case 'poll':
            return 'Responder';
        case 'reveal':
            return 'Revelar';
        case 'resource':
            return 'Abrir recurso';
        case 'open-handler':
        default:
            return 'Abrir no app';
    }
}

function isGenericActionLabel(value: string): boolean {
    const key = lookupKey(value);
    return key === 'abrir no app' || key === 'abrir app' || key === 'open app' || key === 'open in app';
}

function resolveActionLabel(
    rawActionLabel: string,
    type: TrainingSlideAppOptionType,
    preset: IntroPresetPanelDefaults | null,
): string {
    if (preset && (!rawActionLabel || isGenericActionLabel(rawActionLabel))) return preset.actionLabel;
    return rawActionLabel || defaultActionLabel(type);
}

function rawOptionsFromData(
    data: TrainingSlideAppOptionsInput | null | undefined,
): readonly TrainingSlideAppOptionInput[] {
    if (Array.isArray(data)) return data;
    if (!isRecord(data)) return [];
    return optionArray(data.options).length
        ? optionArray(data.options)
        : optionArray(data.appOptions).length
          ? optionArray(data.appOptions)
          : optionArray(data.app_options);
}

export function normalizeTrainingSlideAppOptions(
    data: TrainingSlideAppOptionsInput | null | undefined,
    resolverOptions: TrainingSlideAppOptionResolverOptions = {},
): NormalizedTrainingSlideAppOption[] {
    return rawOptionsFromData(data).map((raw, index) => {
        const record = isRecord(raw) ? raw : {};
        const preset = resolveIntroPresetDefaults(record);
        const type = normalizeType(record.type);
        const id = firstText(record.id, record.key) || `${type}-${index + 1}`;
        const choices = stringArray(record.choices).length
            ? stringArray(record.choices)
            : stringArray(record.pollOptions).length
              ? stringArray(record.pollOptions)
              : stringArray(record.options);
        const rawHandlerName = firstText(record.handlerName, record.handler, record.openHandler);
        const handlerName = resolvePresetHandlerName(rawHandlerName, preset);
        const rawArgs = unknownArray(record.handlerArgs).length
            ? unknownArray(record.handlerArgs)
            : unknownArray(record.args);
        const args = resolvePresetArgs(rawArgs, handlerName, preset);
        const modelPresetId = firstText(record.modelPresetId, record.presetId, preset?.id);
        const adapterId = firstText(record.adapterId, preset?.adapterId);
        const surfaceType = firstText(record.surfaceType, preset?.surfaceType);
        const fallbackAssetId = firstText(record.fallbackAssetId, record.snapshotAssetId, preset?.fallbackAssetId);
        const fallbackTextValue = firstText(record.fallbackText, fallbackText(record.fallback), preset?.fallbackText);
        const moduleContext = buildOptionModuleViewContext({
            handlerName,
            adapterId,
            surfaceType,
            modelPresetId,
            args,
            fallbackAssetId,
            fallbackText: fallbackTextValue,
        });
        const moduleContextValidation = moduleContext ? validateModuleViewContext(moduleContext) : null;
        return {
            id,
            type,
            title: firstText(record.title, record.label, record.question, preset?.title) || defaultTitle(type, index),
            description: firstText(record.description, preset?.description),
            handlerName,
            modelPresetId,
            adapterId,
            surfaceType,
            actionLabel: resolveActionLabel(firstText(record.actionLabel), type, preset),
            args,
            payload: record.payload,
            fallbackAssetId,
            fallbackText: fallbackTextValue,
            url: safeUrl(firstText(record.url, record.href, record.resourceUrl)),
            imageUrl:
                safeUrl(firstText(record.imageUrl, record.snapshotUrl)) ||
                resolveTrainingSlideSnapshotAssetUrl(fallbackAssetId, resolverOptions),
            question: firstText(record.question),
            choices,
            revealText: firstText(record.revealText, record.revealedText, record.answer),
            meta: stringArray(record.meta),
            moduleContext,
            moduleContextStatus: moduleContextValidation?.status || '',
            moduleContextSummary: moduleContext ? summarizeContextForTeacher(moduleContext) : null,
        };
    });
}
