export interface WizardFormData {
    profileId?: string | null;
    includePaths?: string;
    excludePaths?: string;
    temporalFrom?: string;
    temporalTo?: string;
    temporalAggregation?: string;
    bboxLonMin?: string;
    bboxLatMin?: string;
    bboxLonMax?: string;
    bboxLatMax?: string;
    billingRequired?: boolean;
    billingContractedTotal?: string;
    billingRatePerSecond?: string;
    billingMaxPerRequest?: string;
    billingCurrency?: string;
    sliceName?: string;
}

export interface TokenTx {
    id: string;
    type: string;
    amount: number;
    endpoint: string | null;
    balance_after: number | null;
    created_at: string;
}

export interface AuditEventLike {
    id?: string;
    event?: string;
    endpoint?: string | null;
    grantee_email?: string;
    profile_slug?: string;
    created_at?: string;
}

export interface AuditFilters {
    grantee?: string;
    profile?: string;
    endpoint?: string;
    event?: string;
    dateFrom?: string;
    dateTo?: string;
}

export function validateWizardData(step: number, formData: WizardFormData): { ok: boolean; errors: string[] };
export function formatTokens(n: unknown): string;
export function transactionsToCSV(txs: TokenTx[]): string;
export function formatEventTimestamp(ts: unknown): string;
export function summarizeRequestMeta(metadata: unknown): string;
export function filterEvents<T extends AuditEventLike>(events: T[], filters: AuditFilters): T[];
