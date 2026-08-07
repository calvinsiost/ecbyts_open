// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// ECBT Pipeline - registry.test.js
// Executar via /api/eval (browser context)

(async () => {
    const results: Array<{ pass: boolean; label: string }> = [];
    let passed = 0,
        failed = 0;

    function assert(cond: any, label: string): void {
        if (cond) {
            results.push({ pass: true, label });
            passed++;
        } else {
            results.push({ pass: false, label });
            failed++;
            console.error('[registry.test] FAIL:', label);
        }
    }

    const { savePipeline, getPipeline, getAllPipelines, deletePipeline, saveRunLog, getRunLogs } = (await import(
        '/js/core/pipelines/registry.js' as any
    )) as any;

    const PREFIX = 'TEST_REG_';

    // ── savePipeline - cria ───────────────────────────────────────
    const entry1 = savePipeline({ name: PREFIX + 'Alpha', xml: '<x/>' });
    assert(typeof entry1.id === 'string' && entry1.id.startsWith('pl_'), 'savePipeline: retorna ID pl_*');
    assert(entry1.name === PREFIX + 'Alpha', 'savePipeline: name preservado');
    assert(typeof entry1.updatedAt === 'string', 'savePipeline: updatedAt preenchido');

    // ── getPipeline ───────────────────────────────────────────────
    const fetched = getPipeline(entry1.id);
    assert(!!fetched, 'getPipeline: retorna entry salvo');
    assert(fetched.xml === '<x/>', 'getPipeline: xml preservado');

    // ── getPipeline - ID inexistente ──────────────────────────────
    assert(getPipeline('pl_nonexistent_xyz') === undefined, 'getPipeline: inexistente retorna undefined');

    // ── getAllPipelines ───────────────────────────────────────────
    const entry2 = savePipeline({ name: PREFIX + 'Beta', xml: '<y/>' });
    const all = getAllPipelines();
    assert(all.length >= 2, 'getAllPipelines: retorna >= 2 entradas');
    assert(all[0].updatedAt >= all[all.length - 1].updatedAt, 'getAllPipelines: ordenado por updatedAt desc');

    // ── savePipeline - atualiza (upsert) ──────────────────────────
    const updated = savePipeline({ id: entry1.id, name: PREFIX + 'Alpha-v2', xml: '<z/>' });
    assert(updated.id === entry1.id, 'savePipeline upsert: mesmo ID');
    assert(updated.name === PREFIX + 'Alpha-v2', 'savePipeline upsert: name atualizado');
    assert(getPipeline(entry1.id).xml === '<z/>', 'savePipeline upsert: xml atualizado');

    // ── deletePipeline ────────────────────────────────────────────
    const del1 = deletePipeline(entry1.id);
    assert(del1 === true, 'deletePipeline: retorna true se existia');
    assert(getPipeline(entry1.id) === undefined, 'deletePipeline: removido do registry');
    const del2 = deletePipeline(entry1.id);
    assert(del2 === false, 'deletePipeline: retorna false se inexistente');

    // ── saveRunLog ────────────────────────────────────────────────
    const run1 = {
        runId: 'run_test_001',
        pipelineId: entry2.id,
        status: 'completed',
        log: [{ nodeId: 'n1', status: 'completed', ts: Date.now() }],
        error: null,
        startedAt: Date.now() - 1000,
        endedAt: Date.now(),
    };
    saveRunLog(run1);
    const logs = getRunLogs(entry2.id);
    assert(logs.length >= 1, 'saveRunLog + getRunLogs: log salvo e recuperado');
    assert(logs[0].runId === 'run_test_001', 'getRunLogs: runId correto');

    // ── getRunLogs - sem filtro ────────────────────────────────────
    const allLogs = getRunLogs();
    assert(allLogs.length >= 1, 'getRunLogs sem filtro: retorna todos os logs');

    // ── saveRunLog - limite 50 ─────────────────────────────────────
    // Inserir 55 logs e verificar que máximo é 50
    for (let i = 0; i < 55; i++) {
        saveRunLog({
            runId: 'run_flood_' + i,
            pipelineId: 'pl_flood',
            status: 'completed',
            log: [],
            error: null,
            startedAt: Date.now() + i,
            endedAt: Date.now() + i + 100,
        });
    }
    const allAfterFlood = getRunLogs();
    assert(allAfterFlood.length <= 50, 'saveRunLog: não excede 50 logs (atual: ' + allAfterFlood.length + ')');

    // Cleanup - remover entrada de teste
    deletePipeline(entry2.id);

    return { passed, failed, total: passed + failed, results };
})();
