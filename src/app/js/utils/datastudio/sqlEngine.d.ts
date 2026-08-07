// @ts-check
export interface SqlExecResult {
    columns: string[];
    values: unknown[][];
}

export interface LoadedSqlModel {
    id: string;
    name: string;
}

export interface SqlSchemaTable {
    name: string;
    columns: string[];
}

export function initSqlEngine(): Promise<void>;
export function exec(sql: string): SqlExecResult[];
export function loadCurrentModelData(): Promise<void>;
export function loadCloudModel(supabaseModelId: string): Promise<boolean>;
export function unloadModel(modelId: string): void;
export function getLoadedModelCount(): number;
export function getLoadedModels(): LoadedSqlModel[];
export function getSchema(): SqlSchemaTable[];
