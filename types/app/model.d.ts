export interface AuditEntry {
    id?: string;
    timestamp?: string;
    actor?: string;
    action: string;
    target?: string;
    metadata?: Record<string, unknown>;
}

export interface UncertaintyValue {
    value: number;
    unit?: string;
    confidence?: number;
    method?: string;
}

export interface EisScore {
    score: number;
    band?: string;
    factors?: Record<string, number>;
}

export interface ObservationModel {
    id: string;
    type?: string;
    timestamp?: string;
    value?: number | string | boolean | null;
    unit?: string;
    metadata?: Record<string, unknown>;
}

export interface ElementModel {
    id: string;
    type?: string;
    name?: string;
    properties?: Record<string, unknown>;
    observations?: ObservationModel[];
}

export interface CampaignModel {
    id: string;
    name?: string;
    status?: string;
    observations?: ObservationModel[];
    metadata?: Record<string, unknown>;
}

export interface SceneModel {
    id?: string;
    objects?: unknown[];
    camera?: unknown;
    metadata?: Record<string, unknown>;
}

export interface AppModel {
    id?: string;
    version?: string;
    elements?: ElementModel[];
    campaigns?: CampaignModel[];
    scene?: SceneModel;
    auditTrail?: AuditEntry[];
    metadata?: Record<string, unknown>;
}

export type HandlerAction<TPayload = unknown, TResult = unknown> = (payload?: TPayload) => TResult | Promise<TResult>;
