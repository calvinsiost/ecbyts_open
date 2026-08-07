export function loadFromStorage(): unknown[];
export function savePipeline(entry: unknown): unknown;
export function getPipeline(id: string): unknown;
export function getAllPipelines(): unknown[];
export function deletePipeline(id: string): boolean;
export function saveRunLog(run: unknown): void;
export function getRunLogs(pipelineId?: string): unknown[];
