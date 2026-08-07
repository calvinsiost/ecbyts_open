#!/usr/bin/env node
/**
 * _ciqDaemonPure — guardas puras do ciq-daemon syncLocalWorktree
 * (TOOLING-PERF-001 RF-5 / WS5, frente DoD-finishing 2026-06-18).
 *
 * O ciq-daemon roda a cada 3 min e ESPELHA origin/main no working tree local
 * servido em :4000 (o que Calvin vê no navegador). Uma regressão nas guardas
 * (sincronizar no meio de um rebase alheio, ou tocar o tree quando HEAD≠main)
 * corromperia o tree compartilhado de TODAS as sessões. Estas funções são a
 * fonte de verdade das decisões de skip/build; o daemon as importa.
 *
 * Pure = sem I/O (o daemon faz o fs.existsSync/git; passa os fatos para cá).
 * Testadas em tests/ciq-daemon-logic.test.mjs (gate-proven-non-no-op).
 */

/** Marcadores em .git que indicam operação git em curso (rebase/merge/cherry). */
export const IN_PROGRESS_MARKERS = ['rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD'];

/**
 * Decide se o local-sync deve PULAR (não tocar o tree) dado o estado do repo.
 * Espelha ciq-daemon.mjs syncLocalWorktree guardas 1-3 (linhas 135-153).
 *
 * @param {object} state
 * @param {string[]} state.presentMarkers — marcadores .git/<x> existentes
 * @param {string} state.head — branch atual (git rev-parse --abbrev-ref HEAD)
 * @param {string} state.localSha — sha de HEAD
 * @param {string} state.remoteSha — sha de origin/main
 * @returns {{ skip: boolean, reason: string }}
 */
export function decideLocalSync({ presentMarkers = [], head, localSha, remoteSha } = {}) {
    // Guarda 1: nunca mexer no meio de rebase/merge/cherry de outra sessão.
    const marker = IN_PROGRESS_MARKERS.find((m) => presentMarkers.includes(m));
    if (marker) {
        return { skip: true, reason: `skip: ${marker} em curso no tree compartilhado` };
    }
    // Guarda 2: só sincroniza se o tree está em main (sessão pode ter trocado).
    if (head !== 'main') {
        return { skip: true, reason: `skip: HEAD em "${head}" (não-main)` };
    }
    // Guarda 3: nada a fazer se já está sincronizado.
    if (localSha && remoteSha && localSha === remoteSha) {
        return { skip: true, reason: 'up_to_date' };
    }
    return { skip: false, reason: 'proceed' };
}

/**
 * Decide se o app/js derivado precisa rebuild após o pull, dado o conjunto de
 * arquivos que o merge vai trazer. Rebuild só quando canonical TS mudou ou o
 * mapa de migração mudou (RF-4: full build só p/ ts-migration-map/tsconfig).
 * Espelha ciq-daemon.mjs:173.
 *
 * @param {string[]} changedFiles
 * @returns {boolean}
 */
export function needsDerivedRebuild(changedFiles) {
    if (!Array.isArray(changedFiles)) return false;
    return changedFiles.some((f) => f.startsWith('src/app/js/') || f === 'scripts/ts-migration-map.json');
}

/**
 * Escape hatch §8 rollback (RF-4/WS4): decide se o ts-build deve forçar build
 * COMPLETO (remover tsBuildInfo) a partir das envs. Honra CIQ_FULL_BUILD=1 e o
 * alias TS_BUILD_FORCE_FULL=1. Pura: recebe o env object.
 * @param {Record<string,string|undefined>} env — normalmente process.env
 * @returns {boolean}
 */
export function shouldForceFullBuild(env = {}) {
    return env.CIQ_FULL_BUILD === '1' || env.TS_BUILD_FORCE_FULL === '1';
}

/**
 * Round-trip do state file do daemon: preserva campos extras escritos por
 * outras partes (ex: last_stash_count) ao gravar last_seen_head/last_tick_at.
 * Espelha o pattern { ...prev, ...novos } usado no daemon e na health.
 * @param {object} prev — state anterior (pode ter campos extras)
 * @param {object} updates — novos campos a mesclar
 * @returns {object} state mesclado (prev NÃO é mutado)
 */
export function mergeStateRoundTrip(prev, updates) {
    return { ...(prev && typeof prev === 'object' ? prev : {}), ...(updates || {}) };
}
