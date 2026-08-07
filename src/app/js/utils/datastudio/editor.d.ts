// @ts-check
export interface StarterTemplate {
    label: string;
    sql: string;
}

export function stripSqlComments(sql: string): string;
export function getDefaultStarterSql(): string;
export function initEditor(container: HTMLElement): Promise<void>;
export function getEditorContent(): string;
export function insertAtCursor(text: string): void;
export function setEditorContent(text: string): void;
export function getStarterTemplates(): StarterTemplate[];
