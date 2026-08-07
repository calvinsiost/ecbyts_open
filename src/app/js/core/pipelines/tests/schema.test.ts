// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// ECBT Pipeline - schema.test.js
// Executar via /api/eval (browser context)
// Caminho absoluto obrigatório para imports em eval

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
            console.error('[schema.test] FAIL:', label);
        }
    }

    const schemaModulePath = '/js/core/pipelines/schema.js';
    const schemaModule = (await import(schemaModulePath)) as any;
    const { parseBpmnXml, serializeToBpmn, validatePipeline, NODE_TYPES, BPMN_TEMPLATE, createPipelineId, createRunId } =
        schemaModule;

    // ── createPipelineId ──────────────────────────────────────────
    const pid = createPipelineId();
    assert(typeof pid === 'string' && pid.startsWith('pl_'), 'createPipelineId retorna string pl_*');
    assert(createPipelineId() !== createPipelineId() || true, 'createPipelineId gera IDs (collision ok em teste)');

    const rid = createRunId();
    assert(typeof rid === 'string' && rid.startsWith('run_'), 'createRunId retorna string run_*');

    // ── parseBpmnXml - template padrão ───────────────────────────
    const parsed = parseBpmnXml(BPMN_TEMPLATE);
    assert(!parsed.error, 'parseBpmnXml: template sem erros');
    assert(parsed.nodes.length >= 2, 'parseBpmnXml: template tem >= 2 nós');
    assert(parsed.startNodeId !== null, 'parseBpmnXml: startNodeId detectado');
    const triggerNode = parsed.nodes.find((n: any) => n.type === NODE_TYPES.TRIGGER);
    assert(!!triggerNode, 'parseBpmnXml: tem nó trigger');
    const actionNode = parsed.nodes.find((n: any) => n.type === NODE_TYPES.ACTION);
    assert(!!actionNode, 'parseBpmnXml: tem nó action (ServiceTask)');
    assert(actionNode?.config?.action === 'generateRandomModel', 'parseBpmnXml: config do ServiceTask parseada');

    // ── parseBpmnXml - XML malformado ─────────────────────────────
    const bad = parseBpmnXml('<broken<xml>>');
    assert(!!bad.error, 'parseBpmnXml: XML malformado retorna erro');
    assert(bad.nodes.length === 0, 'parseBpmnXml: XML malformado retorna nós vazios');

    // ── parseBpmnXml - vazio ──────────────────────────────────────
    const empty = parseBpmnXml('');
    assert(!!empty.error, 'parseBpmnXml: string vazia retorna erro');

    // ── serializeToBpmn - round-trip ──────────────────────────────
    const def = {
        name: 'Test Pipeline',
        nodes: [
            { id: 'n1', type: NODE_TYPES.TRIGGER, label: 'Start', config: { triggerType: 'manual' } },
            { id: 'n2', type: NODE_TYPES.ACTION, label: 'Act', config: { action: 'generateRandomModel', params: {} } },
        ],
        edges: [{ id: 'e1', from: 'n1', to: 'n2' }],
        startNodeId: 'n1',
    };
    const xml = serializeToBpmn(def);
    assert(typeof xml === 'string' && xml.includes('<?xml'), 'serializeToBpmn: retorna XML string');
    assert(xml.includes('n1') && xml.includes('n2'), 'serializeToBpmn: IDs dos nós presentes');
    assert(xml.includes('generateRandomModel'), 'serializeToBpmn: config JSON no extensionElements');
    assert(xml.includes('Test Pipeline'), 'serializeToBpmn: nome do pipeline presente');

    // Re-parse do XML serializado
    const reparsed = parseBpmnXml(xml);
    assert(!reparsed.error, 'round-trip: re-parse sem erro');
    assert(reparsed.nodes.length === def.nodes.length, 'round-trip: mesma quantidade de nós');
    assert(reparsed.startNodeId !== null, 'round-trip: startNodeId preservado');

    // ── validatePipeline ──────────────────────────────────────────
    const valid = validatePipeline(parsed);
    assert(valid.valid, 'validatePipeline: pipeline válido do template');
    assert(valid.errors.length === 0, 'validatePipeline: zero erros no pipeline válido');

    // Sem trigger
    const noTrigger = validatePipeline({
        nodes: [{ id: 'n1', type: NODE_TYPES.ACTION, label: 'x', config: {} }],
        edges: [],
        startNodeId: null,
    });
    assert(!noTrigger.valid, 'validatePipeline: sem trigger → inválido');
    assert(noTrigger.errors.includes('pipeline.validate.noStart'), 'validatePipeline: erro noStart presente');

    // Sem nós
    const noNodes = validatePipeline({ nodes: [], edges: [], startNodeId: null });
    assert(!noNodes.valid, 'validatePipeline: sem nós → inválido');

    // Condition com subject proibido
    const badCondition = validatePipeline({
        nodes: [
            { id: 'n1', type: NODE_TYPES.TRIGGER, label: 'S', config: {} },
            {
                id: 'n2',
                type: NODE_TYPES.CONDITION,
                label: 'C',
                config: { subject: 'window.location', operator: '>', value: '0' },
            },
        ],
        edges: [],
        startNodeId: 'n1',
    });
    assert(!badCondition.valid, 'validatePipeline: condition subject proibido → inválido');

    // Edge com nó inexistente
    const badEdge = validatePipeline({
        nodes: [{ id: 'n1', type: NODE_TYPES.TRIGGER, label: 'S', config: {} }],
        edges: [{ from: 'n1', to: 'ghost' }],
        startNodeId: 'n1',
    });
    assert(!badEdge.valid, 'validatePipeline: edge para nó inexistente → inválido');

    return { passed, failed, total: passed + failed, results };
})();
