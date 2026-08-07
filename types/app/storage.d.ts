export interface StorageEnvelope<TValue = unknown> {
    value: TValue;
    version?: string;
    updatedAt?: string;
    source?: string;
}

export interface StorageWriteResult {
    ok: boolean;
    key: string;
    error?: string;
}

export interface CloudSyncEnvelope<TValue = unknown> extends StorageEnvelope<TValue> {
    remoteId?: string;
    syncStatus?: 'local' | 'pending' | 'synced' | 'conflict' | 'error';
}
