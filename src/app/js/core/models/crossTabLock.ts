// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   MULTI-MODEL TABS Phase 5 — cross-tab BroadcastChannel lock

   Problema: se mesmo modelo abrir em 2 abas (ex: user duplica tab,
   bookmark), edições concorrentes corrompem state (IDB sem merge).
   Mitigação: tab A broadcast "abri modelo X"; tab B detecta se já
   tem X aberto e entra em read-only mode.

   API:
   - initCrossTabLock(activeModelId) — começa a escutar + anuncia
   - setActiveModel(id) — anuncia novo modelo ativo
   - isReadOnly() — true se conflito detectado
   - destroyCrossTabLock() — cleanup (tests)

   Eventos window:
   - model:readonly-on   { ownedByTab: tabId, modelId }
   - model:readonly-off  { modelId }
   ================================================================ */

const CHANNEL_NAME = 'ecbyts-model-tabs';
const CLAIM_TIMEOUT_MS = 800; // tempo para outra aba responder à nossa pergunta

let _channel: BroadcastChannel | null = null;
let _tabId: string | null = null;
let _activeModelId: string | null = null;
let _readOnly: boolean = false;
let _readOnlyOwner: string | null = null;

interface LockMessage {
    type: string;
    modelId?: string | null;
    tabId: string | null;
}

/**
 * Guards contra env sem BroadcastChannel (tests, Node).
 */
function _hasBC(): boolean {
    return typeof BroadcastChannel !== 'undefined';
}

function _genTabId(): string {
    return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Inicializa listener + anuncia modelo ativo. Idempotente.
 */
export function initCrossTabLock(activeModelId: string | null): {
    tabId: string | null;
    bcAvailable: boolean;
} {
    if (!_hasBC()) {
        _tabId = _tabId || _genTabId();
        _activeModelId = activeModelId || null;
        return { tabId: _tabId, bcAvailable: false };
    }

    if (_channel) {
        // Já inicializado - apenas atualiza ativo
        setActiveModel(activeModelId);
        return { tabId: _tabId, bcAvailable: true };
    }

    _tabId = _genTabId();
    _activeModelId = activeModelId || null;
    _channel = new BroadcastChannel(CHANNEL_NAME);
    _channel.onmessage = _handleMessage;

    // Ao iniciar, pergunta se alguém já tem este modelo aberto
    if (_activeModelId) {
        _broadcast({ type: 'claim', modelId: _activeModelId, tabId: _tabId });
        // Inicialmente otimista - só vira read-only se alguém responder 'active'
        setTimeout(() => {
            // Após timeout, ficamos com ownership (ninguém reclamou)
            if (!_readOnly) _broadcast({ type: 'active', modelId: _activeModelId, tabId: _tabId });
        }, CLAIM_TIMEOUT_MS);
    }

    return { tabId: _tabId, bcAvailable: true };
}

/**
 * Anuncia que esta aba ativou um novo modelo (após switchActive).
 */
export function setActiveModel(id: string | null): void {
    const previous = _activeModelId;
    _activeModelId = id || null;
    if (previous === _activeModelId) return;
    // Se saímos do modelo em read-only, libera
    if (_readOnly && _readOnlyOwner && previous) {
        _readOnly = false;
        _readOnlyOwner = null;
        _emit('model:readonly-off', { modelId: previous });
    }
    if (_channel && _activeModelId) {
        _broadcast({ type: 'claim', modelId: _activeModelId, tabId: _tabId });
    }
}

export function isReadOnly(): boolean {
    return _readOnly;
}

export function getTabId(): string | null {
    return _tabId;
}

export function destroyCrossTabLock(): void {
    if (_channel) {
        try {
            _channel.close();
        } catch (e: any) {
            console.debug('[crossTabLock] channel-close:', e?.message || e);
        }
    }
    _channel = null;
    _tabId = null;
    _activeModelId = null;
    _readOnly = false;
    _readOnlyOwner = null;
}

function _broadcast(msg: LockMessage): void {
    if (!_channel) return;
    try {
        _channel.postMessage(msg);
    } catch (err: any) {
        console.debug('[crossTabLock] post failed', err?.message);
    }
}

function _isValidLockMessage(msg: unknown): msg is LockMessage {
    return (
        msg !== null &&
        typeof msg === 'object' &&
        typeof (msg as LockMessage).type === 'string' &&
        'tabId' in (msg as LockMessage)
    );
}

function _handleClaimMessage(msg: LockMessage): void {
    if (msg.modelId !== _activeModelId || !_activeModelId) return;
    // Se somos donos → responder 'active' (quem chegou antes fica)
    if (!_readOnly) {
        _broadcast({ type: 'active', modelId: _activeModelId, tabId: _tabId });
    }
}

function _handleActiveMessage(msg: LockMessage): void {
    if (msg.modelId !== _activeModelId || !_activeModelId) return;
    if (!_readOnly) {
        _readOnly = true;
        _readOnlyOwner = msg.tabId;
        _emit('model:readonly-on', { ownedByTab: msg.tabId, modelId: _activeModelId });
    }
}

function _handleReleaseMessage(msg: LockMessage): void {
    if (msg.modelId !== _activeModelId) return;
    if (_readOnly && msg.tabId === _readOnlyOwner) {
        _readOnly = false;
        _readOnlyOwner = null;
        _emit('model:readonly-off', { modelId: _activeModelId });
        // Re-anuncia para garantir ownership
        _broadcast({ type: 'active', modelId: _activeModelId, tabId: _tabId });
    }
}

function _handleMessage(event: MessageEvent): void {
    const msg = event?.data;
    if (!_isValidLockMessage(msg)) return;
    if (msg.tabId === _tabId) return; // echo da própria tab

    switch (msg.type) {
        case 'claim':
            _handleClaimMessage(msg);
            break;
        case 'active':
            _handleActiveMessage(msg);
            break;
        case 'release':
            _handleReleaseMessage(msg);
            break;
        default:
            /* mensagem desconhecida — ignorar */
            break;
    }
}

function _emit(eventName: string, detail: Record<string, unknown>): void {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    try {
        window.dispatchEvent(new CustomEvent(eventName, { detail }));
    } catch (e: any) {
        console.debug('[crossTabLock] emit:', e?.message || e);
    }
}

/**
 * Anuncia que este modelo foi fechado (release lock). Chamado no pagehide ou
 * ao trocar para outro modelo. Apenas notifica - não muda state local.
 */
export function releaseModel(id: string | null): void {
    if (!id || !_channel) return;
    _broadcast({ type: 'release', modelId: id, tabId: _tabId });
}

// Cleanup on pagehide; beforeunload blocks bfcache eligibility.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', () => {
        if (_activeModelId) releaseModel(_activeModelId);
    });
}
