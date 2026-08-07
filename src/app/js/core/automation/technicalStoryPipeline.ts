// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Technical Story Automation Pipeline - native automation recipe that bridges
 * random generation, presentation example creation and Presentation Mode.
 *
 * @module core/automation/technicalStoryPipeline
 */
import { getPipeline, savePipeline, deletePipeline, NODE_TYPES, serializeToBpmn } from '../pipelines/index.js';
import { listPresentations } from '../presentation/manager.js';
import { TECHNICAL_STORY_EXAMPLE_KEY } from '../presentation/examples.js';
export const TECHNICAL_STORY_PIPELINE_ID = 'pl_ecbyts_technical_story';
export const TECHNICAL_STORY_PIPELINE_NAME = 'Ecbyts · Pipeline técnico de apresentação';
function _buildNodes() {
    return [
        {
            id: 'StartEvent_technical_story',
            type: NODE_TYPES.TRIGGER,
            label: 'Início',
            config: { triggerType: 'manual' },
        },
        {
            id: 'Task_prepare_workspace',
            type: NODE_TYPES.ACTION,
            label: 'Preparar workspace técnico',
            config: {
                action: 'handlePrepareTechnicalStoryWorkspace',
                params: {},
            },
        },
        {
            id: 'Task_create_presentation',
            type: NODE_TYPES.ACTION,
            label: 'Criar exemplo em Presentation',
            config: {
                action: 'handleCreateTechnicalStoryPresentationExample',
                params: { prepareWorkspace: false },
            },
        },
        {
            id: 'Task_open_presentation',
            type: NODE_TYPES.ACTION,
            label: 'Abrir Presentation Mode',
            config: {
                action: 'handleOpenPresentationModal',
                params: {},
            },
        },
        {
            id: 'EndEvent_technical_story',
            type: 'end',
            label: 'Concluir',
            config: {},
        },
    ];
}
function _buildEdges() {
    return [
        {
            id: 'Flow_start_prepare',
            from: 'StartEvent_technical_story',
            to: 'Task_prepare_workspace',
        },
        {
            id: 'Flow_prepare_create',
            from: 'Task_prepare_workspace',
            to: 'Task_create_presentation',
        },
        {
            id: 'Flow_create_open',
            from: 'Task_create_presentation',
            to: 'Task_open_presentation',
        },
        {
            id: 'Flow_open_end',
            from: 'Task_open_presentation',
            to: 'EndEvent_technical_story',
        },
    ];
}
export function buildTechnicalStoryAutomationPipelineDefinition() {
    return {
        pipelineId: TECHNICAL_STORY_PIPELINE_ID,
        name: TECHNICAL_STORY_PIPELINE_NAME,
        nodes: _buildNodes(),
        edges: _buildEdges(),
        startNodeId: 'StartEvent_technical_story',
    };
}
export function buildTechnicalStoryAutomationPipelineXml() {
    const definition = buildTechnicalStoryAutomationPipelineDefinition();
    return serializeToBpmn({
        name: definition.name,
        nodes: definition.nodes,
        edges: definition.edges,
        startNodeId: definition.startNodeId,
    });
}
export function ensureTechnicalStoryAutomationPipeline() {
    const existing: any = getPipeline(TECHNICAL_STORY_PIPELINE_ID);
    const xml = buildTechnicalStoryAutomationPipelineXml();
    const saved: any = savePipeline({
        id: TECHNICAL_STORY_PIPELINE_ID,
        name: TECHNICAL_STORY_PIPELINE_NAME,
        xml,
    });
    return {
        ...saved,
        created: !existing,
        changed: !existing || existing.name !== TECHNICAL_STORY_PIPELINE_NAME || existing.xml !== xml,
    };
}
export function removeTechnicalStoryAutomationPipeline() {
    return {
        id: TECHNICAL_STORY_PIPELINE_ID,
        removed: deletePipeline(TECHNICAL_STORY_PIPELINE_ID),
    };
}
export function getTechnicalStoryAutomationStatus() {
    const pipeline = getPipeline(TECHNICAL_STORY_PIPELINE_ID);
    const example = listPresentations().find((presentation: any) => presentation?.exampleKey === TECHNICAL_STORY_EXAMPLE_KEY);
    return {
        pipelineInstalled: !!pipeline,
        pipeline,
        exampleReady: !!example,
        example,
        exampleStepCount: example?.steps?.length ?? 0,
        exampleReadiness: example?.exampleReadiness ?? null,
    };
}
//# sourceMappingURL=technicalStoryPipeline.js.map
//# sourceMappingURL=technicalStoryPipeline.js.map
