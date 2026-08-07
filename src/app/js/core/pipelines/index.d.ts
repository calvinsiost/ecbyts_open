// @ts-check
export const NODE_TYPES: Record<string, string>;
export const BPMN_ELEMENT_MAP: Record<string, string>;
export const ALLOWED_PATHS: readonly string[];
export const BPMN_TEMPLATE: string;
export function createPipelineId(...args: unknown[]): string;
export function createRunId(...args: unknown[]): string;
export function parseBpmnXml(...args: unknown[]): Record<string, unknown>;
export function serializeToBpmn(...args: unknown[]): string;
export function validatePipeline(...args: unknown[]): Record<string, unknown>;
export function loadFromStorage(...args: unknown[]): unknown;
export function savePipeline(pipeline: Record<string, unknown>): {
    id: string;
    name?: string;
    xml?: string;
    [key: string]: unknown;
};
export function getPipeline(id: string): { id: string; name?: string; xml?: string; [key: string]: unknown } | null;
export function getAllPipelines(...args: unknown[]): Array<Record<string, unknown>>;
export function deletePipeline(...args: unknown[]): unknown;
export function saveRunLog(...args: unknown[]): unknown;
export function getRunLogs(...args: unknown[]): unknown[];
export function registerPipelineAction(...args: unknown[]): unknown;
export function getRegisteredActions(...args: unknown[]): Record<string, unknown>;
export function abortRun(...args: unknown[]): unknown;
export function createRun(...args: unknown[]): Record<string, unknown>;
export function runPipeline(...args: unknown[]): Promise<Record<string, unknown>>;
export function executeNode(...args: unknown[]): Promise<Record<string, unknown>>;
