// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE PACK USER COPY - pure, no-DOM wording helpers.

   Translates technical pack states into short, user-facing Portuguese.
   ================================================================ */

export type PipelinePackUserState =
    | 'empty-processes'
    | 'no-permission'
    | 'missing-asset'
    | 'incomplete-depara'
    | 'publish-blocked'
    | 'ready';

export interface PipelinePackUserCopyContext {
    processTitle?: string;
    assetLabel?: string;
    actionLabel?: string;
    missingCount?: number;
}

export interface PipelinePackUserMessage {
    state: PipelinePackUserState;
    severity: 'info' | 'warning' | 'error' | 'success';
    title: string;
    body: string;
    primaryAction: string;
}

export interface PipelinePackVisibleTerm {
    area: 'overview' | 'navigation' | 'editing' | 'audit' | 'sharing' | 'files';
    userLabel: string;
    replaces: string[];
    reason: string;
}

const TECHNICAL_TERMS = [
    'adapter',
    'adaptador',
    'asset',
    'assets',
    'click-go',
    'de-para',
    'dod',
    'edge',
    'files',
    'foreground',
    'node',
    'pack',
    'payload',
    'params',
    'parametros',
    'query',
    'schema',
    'target',
];

const VISIBLE_TERM_INVENTORY: ReadonlyArray<PipelinePackVisibleTerm> = Object.freeze([
    {
        area: 'overview',
        userLabel: 'processo',
        replaces: ['Pipeline Pack', 'pack'],
        reason: 'Nome curto para o fluxo que o usuario abre, apresenta e compartilha.',
    },
    {
        area: 'overview',
        userLabel: 'ponto',
        replaces: ['node', 'nodeId'],
        reason: 'Cada etapa clicavel do desenho, sem exigir vocabulario de grafo.',
    },
    {
        area: 'overview',
        userLabel: 'conector',
        replaces: ['edge'],
        reason: 'Ligacao visual entre pontos do processo.',
    },
    {
        area: 'navigation',
        userLabel: 'clique para abrir',
        replaces: ['click-go'],
        reason: 'Explica a acao esperada no slide/processo com verbo direto.',
    },
    {
        area: 'editing',
        userLabel: 'area que abre',
        replaces: ['target', 'modulo equivalente'],
        reason: 'Mostra qual parte do ecbyts abre sem falar em destino tecnico.',
    },
    {
        area: 'editing',
        userLabel: 'como abrir',
        replaces: ['adapter', 'adaptador'],
        reason: 'Descreve a forma de abertura como uma escolha do usuario.',
    },
    {
        area: 'editing',
        userLabel: 'plano B',
        replaces: ['fallback'],
        reason: 'Nome claro para a alternativa quando a abertura direta nao funciona.',
    },
    {
        area: 'audit',
        userLabel: 'visual principal',
        replaces: ['foreground'],
        reason: 'Ajuda a entender a comparacao com o desenho original.',
    },
    {
        area: 'audit',
        userLabel: 'checklist final',
        replaces: ['DoD'],
        reason: 'Traduz criterio de aceite para uma lista verificavel.',
    },
    {
        area: 'sharing',
        userLabel: 'chave',
        replaces: ['payload', 'schema'],
        reason: 'Mantem a metafora de compartilhamento sem expor estrutura interna.',
    },
    {
        area: 'files',
        userLabel: 'arquivo de apoio',
        replaces: ['asset', 'assets', 'Files'],
        reason: 'Usa arquivo apenas quando o item e literalmente um recurso salvo.',
    },
]);

function _cleanText(value: unknown): string {
    return String(value ?? '').trim();
}

function _count(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function pipelinePackCopyHasTechnicalJargon(value: unknown): boolean {
    const text = _cleanText(value).toLowerCase();
    return TECHNICAL_TERMS.some((term) => new RegExp(`\\b${term}\\b`, 'i').test(text));
}

export function listPipelinePackVisibleTermInventory(): PipelinePackVisibleTerm[] {
    return VISIBLE_TERM_INVENTORY.map((item) => ({
        area: item.area,
        userLabel: item.userLabel,
        replaces: [...item.replaces],
        reason: item.reason,
    }));
}

export function auditPipelinePackVisibleText(value: unknown): { hasTechnicalJargon: boolean; terms: string[] } {
    const text = _cleanText(value).toLowerCase();
    const terms = TECHNICAL_TERMS.filter((term) => new RegExp(`\\b${term}\\b`, 'i').test(text));
    return {
        hasTechnicalJargon: terms.length > 0,
        terms,
    };
}

export function buildPipelinePackUserMessage(
    state: PipelinePackUserState,
    context: PipelinePackUserCopyContext = {},
): PipelinePackUserMessage {
    const title = _cleanText(context.processTitle) || 'processo';
    const action = _cleanText(context.actionLabel) || 'Revisar agora';
    const missing = _count(context.missingCount);
    const asset = _cleanText(context.assetLabel) || 'referencia';

    if (state === 'empty-processes') {
        return {
            state,
            severity: 'info',
            title: 'Nenhum processo salvo ainda',
            body: 'Importe uma chave, use um modelo ou abra um processo da aula para comecar.',
            primaryAction: 'Importar ou usar modelo',
        };
    }
    if (state === 'no-permission') {
        return {
            state,
            severity: 'error',
            title: 'Voce nao tem acesso a este processo',
            body: `Peca permissao para abrir "${title}" ou use uma copia compartilhada com voce.`,
            primaryAction: 'Ver permissoes',
        };
    }
    if (state === 'missing-asset') {
        return {
            state,
            severity: 'warning',
            title: 'Arquivo de apoio nao encontrado',
            body: `O arquivo "${asset}" precisa estar vinculado antes de apresentar ou compartilhar.`,
            primaryAction: 'Ver arquivos',
        };
    }
    if (state === 'incomplete-depara') {
        return {
            state,
            severity: 'warning',
            title: 'Clique sem abertura definida',
            body: missing > 1
                ? `${missing} pontos do processo ainda precisam dizer o que abre ao clicar.`
                : 'Um ponto do processo ainda precisa dizer o que abre ao clicar.',
            primaryAction: 'Definir cliques',
        };
    }
    if (state === 'publish-blocked') {
        return {
            state,
            severity: 'error',
            title: 'Ainda nao esta pronto para compartilhar',
            body: `Resolva as pendencias principais e depois use "${action}".`,
            primaryAction: action,
        };
    }
    return {
        state: 'ready',
        severity: 'success',
        title: 'Processo pronto para usar',
        body: `O processo "${title}" pode ser aberto, apresentado ou compartilhado como chave.`,
        primaryAction: 'Apresentar',
    };
}
