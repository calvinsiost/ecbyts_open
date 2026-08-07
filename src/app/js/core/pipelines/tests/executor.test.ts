// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// ECBT Pipeline - executor.test.js
// Executar via /api/eval (browser context)

(async () => {
    const results: any[] = [];
    let passed = 0,
        failed = 0;

    function assert(cond: any, label: any) {
        if (cond) {
            results.push({ pass: true, label });
            passed++;
        } else {
            results.push({ pass: false, label });
            failed++;
            console.error('[executor.test] FAIL:', label);
        }
    }

    const { registerPipelineAction, getRegisteredActions, createRun, executeNode, runPipeline, abortRun } =
        await import('/js/core/pipelines/executor.js' as any);

    const { NODE_TYPES, _BPMN_TEMPLATE, parseBpmnXml } = (await import(
        '/js/core/pipelines/schema.js' as any
    )) as any;

    // ── registerPipelineAction ────────────────────────────────────
    registerPipelineAction('testAction_ok', async (params: any) => ({ echo: params.val }));
    const actions = getRegisteredActions();
    assert(
        actions.includes('testAction_ok'),
        'registerPipelineAction: ação registrada visível em getRegisteredActions',
    );

    // ── executeNode - ACTION via allowlist ─────────────────────────
    const run = createRun('pl_test');
    const actNode = {
        id: 'n1',
        type: NODE_TYPES.ACTION,
        label: 'Test',
        config: { action: 'testAction_ok', params: { val: 42 } },
    };
    const actResult = await executeNode(actNode, run, {});
    assert(actResult?.result?.echo === 42, 'executeNode ACTION: executa via allowlist e retorna resultado');

    // ── executeNode - ACTION bloqueada (não registrada) ────────────
    let blocked = false;
    try {
        await executeNode({ id: 'nx', type: NODE_TYPES.ACTION, label: 'X', config: { action: 'eval' } }, run, {});
    } catch (e) {
        blocked = (e as any).message.includes('not allowed');
    }
    assert(blocked, 'executeNode ACTION: ação não registrada lança erro "not allowed"');

    // ── executeNode - ACTION sem nome ─────────────────────────────
    let noName = false;
    try {
        await executeNode({ id: 'n2', type: NODE_TYPES.ACTION, label: 'X', config: {} }, run, {});
    } catch (_e) {
        noName = true;
    }
    assert(noName, 'executeNode ACTION: sem "action" configurado lança erro');

    // ── executeNode - TRIGGER ────────────────────────────────────
    const trigResult = await executeNode(
        { id: 'n0', type: NODE_TYPES.TRIGGER, label: 'S', config: { triggerType: 'manual' } },
        run,
        {},
    );
    assert(trigResult?.triggerType === 'manual', 'executeNode TRIGGER: resolve com triggerType');

    // ── executeNode - DELAY ───────────────────────────────────────
    const t0 = Date.now();
    await executeNode({ id: 'nd', type: NODE_TYPES.DELAY, label: 'W', config: { ms: 80 } }, run, {});
    assert(Date.now() - t0 >= 70, 'executeNode DELAY: aguarda >= ms configurados');

    // ── executeNode - CONDITION true ──────────────────────────────
    const ctx = {
        elements: [
            { family: 'well' },
            { family: 'well' },
            { family: 'plume' },
            { familyId: 'well' }, // legado
        ],
        campaigns: [],
        scenes: [],
    };
    const condTrue = await executeNode(
        {
            id: 'nc',
            type: NODE_TYPES.CONDITION,
            label: 'C',
            config: { subject: 'elements.length', operator: '>', value: '0' },
        },
        run,
        ctx,
    );
    assert(condTrue?.branch === 'true', 'executeNode CONDITION: elements.length > 0 com ctx real → true');

    // ── executeNode - CONDITION false ─────────────────────────────
    const condFalse = await executeNode(
        {
            id: 'nc2',
            type: NODE_TYPES.CONDITION,
            label: 'C',
            config: { subject: 'elements.length', operator: '>', value: '100' },
        },
        run,
        ctx,
    );
    assert(condFalse?.branch === 'false', 'executeNode CONDITION: elements.length > 100 → false');

    // ── executeNode - CONDITION subject proibido ──────────────────
    let condBlocked = false;
    try {
        await executeNode(
            {
                id: 'nc3',
                type: NODE_TYPES.CONDITION,
                label: 'C',
                config: { subject: 'document.cookie', operator: '>', value: '0' },
            },
            run,
            ctx,
        );
    } catch (e) {
        condBlocked = (e as any).message.includes('não permitido');
    }
    assert(condBlocked, 'executeNode CONDITION: subject proibido lança erro');

    // ── executeNode - CONDITION family (canonico) ─────────────────
    const condFamilyCanonical = await executeNode(
        {
            id: 'nc4a',
            type: NODE_TYPES.CONDITION,
            label: 'C',
            config: { subject: 'elements[family=well].length', operator: '>=', value: '3' },
        },
        run,
        ctx,
    );
    assert(condFamilyCanonical?.branch === 'true', 'executeNode CONDITION: family (canonico) correto');

    // ── executeNode - CONDITION familyId (alias legado) ───────────
    const condFamily = await executeNode(
        {
            id: 'nc4',
            type: NODE_TYPES.CONDITION,
            label: 'C',
            config: { subject: 'elements[familyId=well].length', operator: '>=', value: '3' },
        },
        run,
        ctx,
    );
    assert(condFamily?.branch === 'true', 'executeNode CONDITION: familyId alias legado correto');

    // ── executeNode - tipo desconhecido ────────────────────────────
    let unknownType = false;
    try {
        await executeNode({ id: 'nx', type: 'unknown_type', label: 'X', config: {} }, run, {});
    } catch (_e) {
        unknownType = true;
    }
    assert(unknownType, 'executeNode: tipo desconhecido lança erro');

    // ── runPipeline - pipeline completo ───────────────────────────
    registerPipelineAction('ecbytsPipelineTestNoop', async () => ({ noop: true }));

    const simpleDef = parseBpmnXml(`<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:ecbyts="http://ecbyts.com/bpmn"
                  id="D1" targetNamespace="http://ecbyts.com">
  <bpmn:process id="P1" isExecutable="true">
    <bpmn:startEvent id="s1" name="Start"/>
    <bpmn:serviceTask id="t1" name="Noop">
      <bpmn:extensionElements>
        <ecbyts:config>{"action":"ecbytsPipelineTestNoop","params":{}}</ecbyts:config>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <bpmn:endEvent id="e1" name="End"/>
    <bpmn:sequenceFlow id="f1" sourceRef="s1" targetRef="t1"/>
    <bpmn:sequenceFlow id="f2" sourceRef="t1" targetRef="e1"/>
  </bpmn:process>
</bpmn:definitions>`);

    simpleDef.pipelineId = 'pl_test_run';
    const finalRun = await runPipeline(simpleDef, { appCtx: {} });
    assert(finalRun.status === 'completed', 'runPipeline: pipeline simples completa com status completed');
    assert(finalRun.log.length >= 2, 'runPipeline: log tem >= 2 entradas (trigger + action)');
    assert(finalRun.endedAt !== null, 'runPipeline: endedAt preenchido');

    // ── abortRun ──────────────────────────────────────────────────
    // Cria run com delay longo e aborta
    registerPipelineAction('ecbytsPipelineTestNoop2', async () => ({ noop: true }));
    const delayDef = {
        pipelineId: 'pl_abort_test',
        nodes: [
            { id: 's1', type: NODE_TYPES.TRIGGER, label: 'S', config: {} },
            { id: 'd1', type: NODE_TYPES.DELAY, label: 'D', config: { ms: 5000 } },
        ],
        edges: [{ id: 'f1', from: 's1', to: 'd1' }],
        startNodeId: 's1',
    };

    const runPromise = runPipeline(delayDef, {
        onProgress: (r: any) => {
            if (r.currentNodeId === 'd1') abortRun(r.runId);
        },
        appCtx: {},
    });
    // Aguardar com timeout de 3s
    const timeout = new Promise((r) => setTimeout(() => r({ status: 'timeout' }), 3000));
    const abortedRun = (await Promise.race([runPromise, timeout])) as any;
    assert(abortedRun.status === 'aborted', 'abortRun: run marcado como aborted (status: ' + abortedRun.status + ')');

    return { passed, failed, total: passed + failed, results };
})();
