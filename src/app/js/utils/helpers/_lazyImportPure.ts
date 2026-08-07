// @ts-check
// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under AGPL-3.0-only
/* ================================================================
   LAZY IMPORT — LOGICA PURA (sem DOM/window/import())
   ================================================================

   SPEC_REFERENCE_RESILIENCE_SWEEPS RF-2. Separada do wrapper
   `lazyImport.ts` para teste barato em node:test (sem browser).

   Responsabilidades:
   - classificar o erro de um import() dinamico (rede/modulo/outro)
   - derivar a "origem" do erro (chave de dedupe de toast)
   - tracker de dedupe: UM toast por origem por sessao
   - nome canonico do evento "o servidor voltou" (contrato entre quem
     DETECTA a reconexao e quem REAGE a ela)

   ================================================================ */

/**
 * Evento de janela disparado por QUALQUER detector de reconexao com o
 * servidor local (ws da bridge de automacao, heartbeat /api/health, ...).
 * `lazyImport` escuta e re-tenta os imports de rede que falharam.
 *
 * Vive AQUI (modulo sem nenhuma dependencia) para que os detectores
 * possam importar so a string, sem arrastar toast.js/DOM junto.
 */
export const SERVER_RECONNECTED_EVENT = 'ecbyts:server-reconnected';

/**
 * Classifica um erro de import() dinamico.
 *
 * @param {unknown} err
 * @returns {'network' | 'missing-module' | 'other'}
 *   - network: server local caiu / fetch do chunk falhou (o caso BOOT-RESILIENCE-001)
 *   - missing-module: modulo nao existe (bug de referencia, classe A da spec)
 *   - other: qualquer outra coisa (erro em tempo de avaliacao do modulo etc.)
 */
export function classifyImportError(err: unknown): 'network' | 'missing-module' | 'other' {
    const msg = String((err as any)?.message ?? err ?? '').toLowerCase();
    const name = String((err as any)?.name ?? '');
    // Padroes de falha de REDE ao buscar o chunk (Chrome/Firefox/Safari + Vite dev):
    if (
        /failed to fetch dynamically imported module/.test(msg) ||
        /error loading dynamically imported module/.test(msg) ||
        /importing a module script failed/.test(msg) ||
        /networkerror|failed to fetch|load failed|err_connection|fetch failed/.test(msg) ||
        name === 'ChunkLoadError'
    ) {
        return 'network';
    }
    // Modulo genuinamente inexistente (referencia orfa):
    if (/cannot find module|module not found|does not provide an export|404/.test(msg)) {
        return 'missing-module';
    }
    return 'other';
}

/**
 * Deriva a chave de dedupe (origem) de uma falha de import.
 * Falhas de REDE colapsam na dependencia caida (um toast so por "server fora"),
 * as demais sao por caminho de modulo (bugs distintos = toasts distintos).
 *
 * @param {string} path - caminho passado ao import()
 * @param {'network' | 'missing-module' | 'other'} kind
 * @returns {string}
 */
export function dedupeKeyFor(path: string, kind: 'network' | 'missing-module' | 'other'): string {
    if (kind === 'network') return 'network:local-server';
    return `${kind}:${String(path)}`;
}

/**
 * Mensagem de toast por classe de erro (uma por origem por sessao).
 * @param {'network' | 'missing-module' | 'other'} kind
 * @param {string} path
 * @returns {{ message: string, type: 'warning' | 'error' }}
 */
export function toastPayloadFor(kind: 'network' | 'missing-module' | 'other', path: string): { message: string, type: 'warning' | 'error' } {
    if (kind === 'network') {
        return {
            message: 'Servidor local indisponivel — alguns modulos nao carregaram. Eles serao recarregados quando a conexao voltar.',
            type: 'warning',
        };
    }
    return {
        message: `Falha ao carregar modulo (${path}). [ECB-LAZY-001]`,
        type: 'error',
    };
}

/**
 * @typedef {Object} DedupeTracker
 * @property {(key: string) => boolean} shouldNotify - true na PRIMEIRA vez que a key aparece
 * @property {() => void} reset - limpa o estado (nova "sessao" logica; usado ao reconectar)
 * @property {() => string[]} seen - keys ja notificadas (debug/teste)
 */

/**
 * Cria um tracker de dedupe de toast: UM aviso por origem por sessao.
 * @returns {DedupeTracker}
 */
export function createDedupeTracker(): { shouldNotify: (key: string) => boolean, reset: () => void, seen: () => string[] } {
    const notified = new Set<string>();
    return {
        shouldNotify(key: string): boolean {
            if (notified.has(key)) return false;
            notified.add(key);
            return true;
        },
        reset(): void {
            notified.clear();
        },
        seen(): string[] {
            return [...notified];
        },
    };
}
