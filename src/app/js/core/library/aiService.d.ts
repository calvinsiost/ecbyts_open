export function estimateAiCost(...args: unknown[]): unknown;
export function executeAiService(...args: unknown[]): Promise<{
    status: string;
    cost?: number;
    currency?: string;
    confidence?: number;
    outputId?: string;
}>;
