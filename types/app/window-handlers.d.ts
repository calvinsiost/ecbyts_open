import type { AppModel, HandlerAction } from './model';

export interface EcbytsRuntimeBridge {
    version?: string;
    model?: AppModel;
    handlers?: Record<string, HandlerAction>;
    [key: string]: unknown;
}

declare global {
    interface Window {
        ecbyts?: EcbytsRuntimeBridge;
        appState?: AppModel;
        showToast?: (message: string, type?: string, options?: Record<string, unknown>) => void;
        handleAction?: HandlerAction;
        handleCommand?: HandlerAction;
    }
}

export {};
