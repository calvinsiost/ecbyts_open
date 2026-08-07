// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   PIPELINES / SCHEMA — Tipos, parser BPMN e validação
   Schema, parser e serializer do módulo de automação de pipelines.

   Um pipeline é representado internamente como { nodes, edges, startNodeId }.
   Externamente, é armazenado como BPMN 2.0 XML com extensionElements
   contendo a config ecbyts em JSON.

   Nota de segurança: parseBpmnXml() usa DOMParser — sem eval, sem innerHTML
   em superfície exposta ao usuário.
   ================================================================ */

// ----------------------------------------------------------------
// TIPOS DE NÓ
// Node types mapeados a partir dos elementos BPMN 2.0
// ----------------------------------------------------------------

/** Tipos de nó suportados pelo executor */
export const NODE_TYPES = {
    TRIGGER: 'trigger',
    ACTION: 'action',
    CONDITION: 'condition',
    DELAY: 'delay',
    API_CALL: 'api_call',
};

/**
 * Mapeamento de elementos BPMN 2.0 → tipos internos.
 * Usado pelo parser para converter XML em PipelineDefinition.
 */
// Mapeamento BPMN localName → tipo executor
// Chave = localName (sem prefixo) - o DOMParser expõe isso diretamente.
export const BPMN_ELEMENT_MAP = {
    startEvent: NODE_TYPES.TRIGGER,
    serviceTask: NODE_TYPES.ACTION,
    exclusiveGateway: NODE_TYPES.CONDITION,
    intermediateCatchEvent: NODE_TYPES.DELAY,
    scriptTask: NODE_TYPES.API_CALL,
};

/**
 * Subjects permitidos para Condition DSL.
 * Chave: string que o usuário vê/seleciona.
 * Valor: função pura que resolve o valor numérico a partir do appCtx.
 *
 * Regra de segurança: APENAS estes paths são permitidos - sem eval, sem
 * acesso arbitrário ao appCtx. Adicionar novos paths aqui conforme necessário.
 */
const _familyIdAliasWarned = new Set<string>();

function _getElementFamily(el: any): any {
    if (el?.family) return el.family;
    if (el?.familyId) {
        const raw = String(el.familyId);
        if (!_familyIdAliasWarned.has(raw)) {
            _familyIdAliasWarned.add(raw);
            console.warn('[pipelines/schema] "familyId" is deprecated in condition context; prefer "family".');
        }
        return raw;
    }
    return null;
}

function _countElementsByFamily(ctx: any, family: any): number {
    return (ctx.elements || []).filter((e: any) => _getElementFamily(e) === family).length;
}

export const ALLOWED_PATHS: Record<string, (ctx: any) => number> = {
    'elements.length': (ctx) => (ctx.elements || []).length,
    'campaigns.length': (ctx) => (ctx.campaigns || []).length,
    'scenes.length': (ctx) => (ctx.scenes || []).length,
    'elements[family=well].length': (ctx) => _countElementsByFamily(ctx, 'well'),
    'elements[family=plume].length': (ctx) => _countElementsByFamily(ctx, 'plume'),
    'elements[family=lake].length': (ctx) => _countElementsByFamily(ctx, 'lake'),
    'elements[family=river].length': (ctx) => _countElementsByFamily(ctx, 'river'),
    'elements[family=building].length': (ctx) => _countElementsByFamily(ctx, 'building'),
    'elements[family=tank].length': (ctx) => _countElementsByFamily(ctx, 'tank'),
    'elements[family=waste].length': (ctx) => _countElementsByFamily(ctx, 'waste'),
    // Compatibilidade legada (1 ciclo): aliases familyId -> family
    'elements[familyId=well].length': (ctx) => _countElementsByFamily(ctx, 'well'),
    'elements[familyId=plume].length': (ctx) => _countElementsByFamily(ctx, 'plume'),
    'elements[familyId=lake].length': (ctx) => _countElementsByFamily(ctx, 'lake'),
    'elements[familyId=river].length': (ctx) => _countElementsByFamily(ctx, 'river'),
    'elements[familyId=building].length': (ctx) => _countElementsByFamily(ctx, 'building'),
    'elements[familyId=tank].length': (ctx) => _countElementsByFamily(ctx, 'tank'),
    'elements[familyId=waste].length': (ctx) => _countElementsByFamily(ctx, 'waste'),
};

// ----------------------------------------------------------------
// OPERADORES DA CONDITION DSL
// ----------------------------------------------------------------

const CONDITION_OPERATORS = ['>', '<', '>=', '<=', '===', '!=='];

// ----------------------------------------------------------------
// TEMPLATE BPMN PADRÃO
// Diagrama inicial para novas automações - inclui ServiceTask de exemplo
// ----------------------------------------------------------------

export const BPMN_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  xmlns:ecbyts="http://ecbyts.com/bpmn"
                  id="Definitions_1" targetNamespace="http://ecbyts.com">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Inicio"/>
    <bpmn:serviceTask id="Task_1" name="Gerar Modelo de Exemplo">
      <bpmn:extensionElements>
        <ecbyts:config>{"action":"generateRandomModel","params":{}}</ecbyts:config>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <bpmn:endEvent id="EndEvent_1" name="Fim"/>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="82" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="240" y="60" width="100" height="80"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="392" y="82" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="100"/>
        <di:waypoint x="240" y="100"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="340" y="100"/>
        <di:waypoint x="392" y="100"/>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

// ----------------------------------------------------------------
// GERAÇÃO DE IDs
// ----------------------------------------------------------------

/**
 * Gera ID único de pipeline.
 * @returns ex: 'pl_lrd2k9ab'
 */
export function createPipelineId(): string {
    return 'pl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Gera ID único de execução (run).
 * @returns ex: 'run_lrd2k9ab'
 */
export function createRunId(): string {
    return 'run_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ----------------------------------------------------------------
// PARSER BPMN → PipelineDefinition
// ----------------------------------------------------------------

/**
 * Extrai config ecbyts do extensionElements de um nó BPMN.
 * Retorna objeto parseado ou {} se não houver config.
 *
 * @param el - Elemento BPMN DOM
 * @returns Config do nó
 */
function _extractConfig(el: Element): object {
    const ext = el.querySelector('extensionElements ecbyts\\:config, extensionElements config');
    if (!ext) return {};
    try {
        return JSON.parse((ext.textContent || '').trim());
    } catch {
        return {};
    }
}

/**
 * Parse de XML BPMN 2.0 → PipelineDefinition interna.
 * Usa DOMParser (sem eval). Falha silenciosamente retornando
 * { nodes: [], edges: [], startNodeId: null, error: string }.
 *
 * @param xmlString - BPMN 2.0 XML
 */
export function parseBpmnXml(xmlString: string): {
    nodes: any[];
    edges: any[];
    startNodeId: string | null;
    error: string | null;
} {
    const result: { nodes: any[]; edges: any[]; startNodeId: string | null; error: string | null } = {
        nodes: [],
        edges: [],
        startNodeId: null,
        error: null,
    };

    if (!xmlString || typeof xmlString !== 'string') {
        result.error = 'XML vazio ou inválido';
        return result;
    }

    let doc;
    try {
        const parser = new DOMParser();
        doc = parser.parseFromString(xmlString, 'application/xml');
        const parseError = doc.querySelector('parsererror');
        if (parseError) {
            result.error = 'XML malformado: ' + (parseError.textContent || '').slice(0, 120);
            return result;
        }
    } catch (e) {
        result.error = 'Falha ao parsear XML: ' + (e as any).message;
        return result;
    }

    // Extrai nós de processo
    const process = doc.querySelector('process');
    if (!process) {
        result.error = 'Elemento <process> não encontrado no XML';
        return result;
    }

    // Track IDs já adicionados para evitar duplicatas
    const addedIds = new Set();

    for (const [localName, nodeType] of Object.entries(BPMN_ELEMENT_MAP)) {
        process.querySelectorAll(localName).forEach((el) => {
            const id = el.getAttribute('id');
            if (!id || addedIds.has(id)) return;
            addedIds.add(id);

            const config = _extractConfig(el);
            result.nodes.push({
                id,
                type: nodeType,
                label: el.getAttribute('name') || id,
                config,
            });

            if (nodeType === NODE_TYPES.TRIGGER && !result.startNodeId) {
                result.startNodeId = id;
            }
        });
    }

    // Adicionar endEvent como nós terminais (tipo 'end') para que edges sejam válidas
    process.querySelectorAll('endEvent').forEach((el) => {
        const id = el.getAttribute('id');
        if (!id || addedIds.has(id)) return;
        addedIds.add(id);
        result.nodes.push({ id, type: 'end', label: el.getAttribute('name') || id, config: {} });
    });

    // Extrai edges (sequenceFlow)
    process.querySelectorAll('sequenceFlow').forEach((el) => {
        const id = el.getAttribute('id');
        const from = el.getAttribute('sourceRef');
        const to = el.getAttribute('targetRef');
        if (!from || !to) return;

        const edge: any = { id, from, to };
        const condExpr = el.querySelector('conditionExpression');
        if (condExpr) {
            edge.branch = (condExpr.textContent || '').trim() || undefined;
        }
        result.edges.push(edge);
    });

    return result;
}

// ----------------------------------------------------------------
// SERIALIZER PipelineDefinition → BPMN XML
// Usado quando bpmn-js NÃO está disponível (editor linear)
// ----------------------------------------------------------------

/**
 * Converte PipelineDefinition interna em BPMN 2.0 XML.
 * Nós sem tipo reconhecido são omitidos com aviso no console.
 *
 * @returns BPMN 2.0 XML
 */
export function serializeToBpmn(def: {
    name?: string;
    nodes?: any[];
    edges?: any[];
    startNodeId?: string | null;
}): string {
    const { name = 'Pipeline', nodes = [], edges = [] } = def;

    // Mapa inverso: NODE_TYPE → tagName BPMN
    // 'end' é gerado por parseBpmnXml para endEvent - deve ser round-trip corretamente
    const typeToTag: Record<string, string> = {
        [NODE_TYPES.TRIGGER]: 'bpmn:startEvent',
        [NODE_TYPES.ACTION]: 'bpmn:serviceTask',
        [NODE_TYPES.CONDITION]: 'bpmn:exclusiveGateway',
        [NODE_TYPES.DELAY]: 'bpmn:intermediateCatchEvent',
        [NODE_TYPES.API_CALL]: 'bpmn:scriptTask',
        end: 'bpmn:endEvent',
    };

    const nodeXml = nodes
        .map((node) => {
            const tag = typeToTag[node.type];
            if (!tag) {
                console.warn(`[pipelines/schema] Tipo desconhecido "${node.type}" omitido da serialização`);
                return '';
            }
            const configJson = JSON.stringify(node.config || {});
            const nameAttr = (node.label || node.id).replace(/"/g, '&quot;');
            return `    <${tag} id="${node.id}" name="${nameAttr}">
      <bpmn:extensionElements>
        <ecbyts:config>${configJson}</ecbyts:config>
      </bpmn:extensionElements>
    </${tag}>`;
        })
        .filter(Boolean)
        .join('\n');

    const edgeXml = edges
        .map((edge) => {
            const branchXml = edge.branch
                ? `\n      <bpmn:conditionExpression>${edge.branch}</bpmn:conditionExpression>`
                : '';
            return `    <bpmn:sequenceFlow id="${edge.id || 'f_' + edge.from + '_' + edge.to}" sourceRef="${edge.from}" targetRef="${edge.to}">${branchXml}
    </bpmn:sequenceFlow>`;
        })
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:ecbyts="http://ecbyts.com/bpmn"
                  id="Definitions_1" targetNamespace="http://ecbyts.com"
                  name="${name.replace(/"/g, '&quot;')}">
  <bpmn:process id="Process_1" isExecutable="true">
${nodeXml}
${edgeXml}
  </bpmn:process>
</bpmn:definitions>`;
}

// ----------------------------------------------------------------
// VALIDAÇÃO
// ----------------------------------------------------------------

/**
 * Valida uma PipelineDefinition parsed.
 * Retorna { valid: boolean, errors: string[] }.
 */
export function validatePipeline(def: { nodes: any[]; edges: any[]; startNodeId: string | null }): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    if (!def || !Array.isArray(def.nodes)) {
        return { valid: false, errors: ['Definição de pipeline inválida'] };
    }

    if (def.nodes.length === 0) {
        errors.push('pipeline.validate.noNodes');
    }

    const hasTrigger = def.nodes.some((n) => n.type === NODE_TYPES.TRIGGER);
    if (!hasTrigger || !def.startNodeId) {
        errors.push('pipeline.validate.noStart');
    }

    // Verificar referências de edges
    const nodeIds = new Set(def.nodes.map((n) => n.id));
    for (const edge of def.edges || []) {
        if (!nodeIds.has(edge.from)) {
            errors.push(`Edge referencia nó inexistente: ${edge.from}`);
        }
        if (!nodeIds.has(edge.to)) {
            errors.push(`Edge referencia nó inexistente: ${edge.to}`);
        }
    }

    // Validar condition configs
    for (const node of def.nodes) {
        if (node.type === NODE_TYPES.CONDITION) {
            const { subject, operator, value } = node.config || {};
            if (subject && !ALLOWED_PATHS[subject]) {
                errors.push(`Condition subject não permitido: "${subject}"`);
            }
            if (operator && !CONDITION_OPERATORS.includes(operator)) {
                errors.push(`Condition operator inválido: "${operator}"`);
            }
            if (value === undefined || value === null || value === '') {
                errors.push(`Condition value não definido no nó "${node.id}"`);
            }
        }
    }

    // Detectar ciclos via DFS (previne loop infinito no executor)
    if (errors.length === 0 && def.edges && def.edges.length > 0) {
        const adj = new Map<string, string[]>();
        for (const edge of def.edges) {
            if (!adj.has(edge.from)) adj.set(edge.from, []);
            (adj.get(edge.from) as string[]).push(edge.to);
        }
        const visited = new Set();
        const stack = new Set();
        /**
         * DFS iterativo com rastreamento de ciclo.
         * @returns true se ciclo encontrado
         */
        function hasCycle(startId: string): boolean {
            const dfsStack: Array<[string, boolean]> = [[startId, false]];
            while (dfsStack.length > 0) {
                const [nodeId, leaving] = dfsStack.pop() as [string, boolean];
                if (leaving) {
                    stack.delete(nodeId);
                    continue;
                }
                if (stack.has(nodeId)) return true;
                if (visited.has(nodeId)) continue;
                visited.add(nodeId);
                stack.add(nodeId);
                dfsStack.push([nodeId, true]); // marcador de saída
                for (const neighbor of adj.get(nodeId) || []) {
                    dfsStack.push([neighbor, false]);
                }
            }
            return false;
        }
        for (const nodeId of nodeIds) {
            if (!visited.has(nodeId) && hasCycle(nodeId)) {
                errors.push('pipeline.error.cycle');
                break;
            }
        }
    }

    return { valid: errors.length === 0, errors };
}
