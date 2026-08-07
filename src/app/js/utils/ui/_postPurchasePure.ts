// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// COMMERCIAL-READINESS T9.2b (claude-omni, 2026-07-16) — view-model puro da
// tela "e agora?" pós-compra de biblioteca.
//
// A compra dispara 'libraryPurchased'/'ecbtPurchaseCompleted' e o CR-053
// (_libraryAutoInstall.ts) auto-instala — mas o cliente só via um toast
// efêmero. Este módulo compõe o modelo da tela que confirma a compra e dá o
// PRÓXIMO PASSO concreto: abrir a biblioteca instalada (sucesso) ou tentar de
// novo / falar com o suporte (falha). Zero DOM, zero imports — testável com
// node:test puro (tests/post-purchase-pure.test.mjs).

export type PostPurchaseStatus = 'installed' | 'install_failed';

export interface PostPurchaseInput {
    /** 'installed' = auto-install OK; qualquer outro valor é tratado como falha (defensivo). */
    status: PostPurchaseStatus | string;
    /** UUID da biblioteca na tabela libraries (referência p/ retry + suporte). */
    libraryId: string;
    /** Nome do manifest instalado (só disponível no sucesso). */
    libraryName?: string | null;
    /** Mensagem de erro do auto-install (só na falha). */
    errorMessage?: string | null;
}

export interface PostPurchaseBuildOptions {
    /** Nome genérico localizado quando o manifest não trouxe nome (ex.: t('postPurchase.genericLibrary')). */
    genericName?: string;
    /** Rótulo localizado para erro vazio/ausente (ex.: t('postPurchase.unknownError')). */
    genericError?: string;
}

export type PostPurchaseActionId = 'open-library' | 'retry-install' | 'contact-support' | 'dismiss';

export interface PostPurchaseAction {
    id: PostPurchaseActionId;
    labelKey: string;
    labelFallback: string;
    kind: 'primary' | 'secondary' | 'link';
}

export interface PostPurchaseModel {
    variant: 'success' | 'error';
    libraryId: string;
    titleKey: string;
    titleFallback: string;
    bodyKey: string;
    /** Vars para interpolar via t(bodyKey, bodyVars) — placeholders {{name}} / {{error}}. */
    bodyVars: { name: string; error?: string };
    bodyFallback: string;
    actions: PostPurchaseAction[];
    ariaLive: 'polite' | 'assertive';
    /** Prefill pronto para openReportBugModal({ prefill }) no caminho de suporte. */
    supportPrefill: {
        type: 'bug';
        description: string;
        metadata: { source: 'post-purchase'; libraryId: string; error?: string };
    };
}

/** Todas as chaves i18n que a tela usa — gate anti-wipe no teste puro. */
export const POST_PURCHASE_I18N_KEYS: readonly string[] = Object.freeze([
    'postPurchase.successTitle',
    'postPurchase.successBody',
    'postPurchase.errorTitle',
    'postPurchase.errorBody',
    'postPurchase.openLibrary',
    'postPurchase.retry',
    'postPurchase.support',
    'postPurchase.continue',
    'postPurchase.genericLibrary',
    'postPurchase.unknownError',
]);

/** Cap defensivo — erro técnico gigante não pode dominar a tela. */
export const MAX_ERROR_CHARS = 160;

/**
 * Normaliza texto vindo de fora (nome de manifest / mensagem de erro):
 * colapsa whitespace (inclusive quebras de linha) e limita o tamanho.
 */
export function sanitizeForDisplay(raw: unknown, maxChars: number = MAX_ERROR_CHARS): string {
    if (typeof raw !== 'string') return '';
    const collapsed = raw.replace(/\s+/g, ' ').trim();
    if (collapsed.length <= maxChars) return collapsed;
    return `${collapsed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/**
 * Compõe o view-model da tela "e agora?" pós-compra.
 * Sucesso → próximo passo = abrir a biblioteca; falha → retry + suporte.
 */
export function buildPostPurchaseModel(
    input: PostPurchaseInput,
    opts: PostPurchaseBuildOptions = {},
): PostPurchaseModel {
    const libraryId = typeof input?.libraryId === 'string' ? input.libraryId : '';
    const genericName = sanitizeForDisplay(opts.genericName, 80) || 'biblioteca comprada';
    const genericError = sanitizeForDisplay(opts.genericError, 80) || 'erro inesperado';
    const name = sanitizeForDisplay(input?.libraryName, 80) || genericName;
    const success = input?.status === 'installed';

    if (success) {
        return {
            variant: 'success',
            libraryId,
            titleKey: 'postPurchase.successTitle',
            titleFallback: 'Compra confirmada!',
            bodyKey: 'postPurchase.successBody',
            bodyVars: { name },
            bodyFallback: `A biblioteca "${name}" foi instalada e já está pronta para uso.`,
            actions: [
                {
                    id: 'open-library',
                    labelKey: 'postPurchase.openLibrary',
                    labelFallback: 'Abrir biblioteca',
                    kind: 'primary',
                },
                {
                    id: 'dismiss',
                    labelKey: 'postPurchase.continue',
                    labelFallback: 'Continuar',
                    kind: 'secondary',
                },
                {
                    id: 'contact-support',
                    labelKey: 'postPurchase.support',
                    labelFallback: 'Falar com o suporte',
                    kind: 'link',
                },
            ],
            ariaLive: 'polite',
            supportPrefill: {
                type: 'bug',
                description: `Compra de biblioteca (${libraryId || 'id desconhecido'}): preciso de ajuda após a compra.`,
                metadata: { source: 'post-purchase', libraryId },
            },
        };
    }

    const error = sanitizeForDisplay(input?.errorMessage) || genericError;
    return {
        variant: 'error',
        libraryId,
        titleKey: 'postPurchase.errorTitle',
        titleFallback: 'Compra confirmada — falta instalar',
        bodyKey: 'postPurchase.errorBody',
        bodyVars: { name, error },
        bodyFallback: `Seu pagamento foi confirmado, mas a instalação automática de "${name}" não terminou (${error}). Tente de novo ou fale com o suporte — a compra está garantida.`,
        actions: [
            {
                id: 'retry-install',
                labelKey: 'postPurchase.retry',
                labelFallback: 'Tentar instalar de novo',
                kind: 'primary',
            },
            {
                id: 'contact-support',
                labelKey: 'postPurchase.support',
                labelFallback: 'Falar com o suporte',
                kind: 'secondary',
            },
            {
                id: 'dismiss',
                labelKey: 'postPurchase.continue',
                labelFallback: 'Continuar',
                kind: 'link',
            },
        ],
        ariaLive: 'assertive',
        supportPrefill: {
            type: 'bug',
            description: `Compra de biblioteca (${libraryId || 'id desconhecido'}): instalação automática falhou — ${error}`,
            metadata: { source: 'post-purchase', libraryId, error },
        },
    };
}
