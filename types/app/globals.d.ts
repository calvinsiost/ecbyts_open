import type { AppModel, AuditEntry, ElementModel, HandlerAction, ObservationModel } from './model';
import type { CloudSyncEnvelope, StorageEnvelope, StorageWriteResult } from './storage';
import type { EcbytsRuntimeBridge } from './window-handlers';

declare global {
    namespace Ecbyts {
        export type App = AppModel;
        export type Element = ElementModel;
        export type Observation = ObservationModel;
        export type Audit = AuditEntry;
        export type Action<TPayload = unknown, TResult = unknown> = HandlerAction<TPayload, TResult>;
        export type StorageValue<TValue = unknown> = StorageEnvelope<TValue>;
        export type StorageResult = StorageWriteResult;
        export type CloudSync<TValue = unknown> = CloudSyncEnvelope<TValue>;
        export type Runtime = EcbytsRuntimeBridge;
    }
}

export {};
