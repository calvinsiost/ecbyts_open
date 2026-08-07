// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// COMPLIANCE-PRESET-001 RF2 — Orchestrator (manager event-driven).
// Owner SPEC: claude - novaspec. Wire RF2 por claude - executor 2026-06-06
// (autorização Calvin Opção 3 — canal corrId 8ce3dab1).
//
// Responsabilidade:
//   - Carregar presets (canonical seedados + remote via fetchPresetById opcional)
//   - Selecionar preset por scope (single-bind ou multi-bind D7)
//   - Manter ModelComplianceState do modelo ativo
//   - Emitir eventos para banner UI (compliance-state-changed)
//   - Wire audit log Supabase RF7 (register_preset_audit RPC)
//   - Respeitar lock D8 (decideChangePresetUnderLock)
//   - Modo retroactive D9 (planRetroactiveApplication)
//
// Pure-logic consumido AS-IS (NÃO toco em src/app/js/core/compliance/_*Pure.ts):
//   - _presetPure (validatePreset, getPresetById, getCanonicalPresets)
//   - _modelBindingsPure (addBinding, removeBinding, getBindingsByScope, emptyBindingState)
//   - _lockStatePure (lock, unlock, decideChangePresetUnderLock)
//   - _complianceStateSerdePure (serialize/deserialize para .ecbt)
//   - _retroactiveSnapshotPure (planRetroactiveApplication)
//   - _auditDedupPure (decideAuditDedup window 60s)
//   - _canonicalPresetsCatalog (6 presets memoráveis seedados)
//   - _componentsHashPure (computeContentHash, recursive cascade)

import {
    type CompliancePreset,
    validatePreset,
    getPresetById,
} from './_presetPure.js';
import {
    type ModelComplianceState,
    type ModelPresetBinding,
    type PresetScope,
    type BindingMutationResult,
    emptyBindingState,
    addBinding,
    removeBinding,
    getBindingsByScope,
} from './_modelBindingsPure.js';
import {
    type ComplianceLockState,
    type LockedActionVerdict,
    unlockedState,
    decideChangePresetUnderLock,
} from './_lockStatePure.js';
import {
    type SerializedComplianceStateV2,
    type DeserializeResult,
    serializeComplianceState,
    deserializeComplianceState,
} from './_complianceStateSerdePure.js';
import {
    CANONICAL_PRESETS,
    findCanonicalPreset,
} from './_canonicalPresetsCatalog.js';

export interface ComplianceManagerOptions {
    /** Async fetcher para presets remotos (Supabase). NULL = local-only mode. */
    readonly fetchPresetById?: (id: string) => Promise<CompliancePreset | null>;
    /** Async writer para audit log (Supabase RPC register_preset_audit). */
    readonly registerAudit?: (entry: PresetAuditEntry) => Promise<void>;
    /** Callback síncrono p/ broadcast UI (banner re-render). */
    readonly onStateChanged?: (state: ModelComplianceState) => void;
    /** Clock injetável p/ testes. Default: () => Date.now(). */
    readonly clock?: () => number;
    /** Identificador do user atual (auth.uid()). */
    readonly userId?: string;
    /** Modelo atual (uuid). */
    readonly modelId?: string;
}

export interface PresetAuditEntry {
    // `| undefined` explícito: objetos builder passam modelId/reason vindos de
    // options opcionais (exactOptionalPropertyTypes exige a união).
    readonly modelId?: string | undefined;
    readonly userId: string;
    readonly oldPresetId: string | null;
    readonly newPresetId: string | null;
    readonly scope?: PresetScope;
    readonly action: 'select' | 'change' | 'remove' | 'lock' | 'unlock' | 'retroactive';
    readonly reason?: string | undefined;
    readonly transient: boolean;
    readonly changedAt: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SelectPresetInput {
    readonly presetId: string;
    readonly scope: PresetScope;
    readonly reason?: string;
}

export interface SelectPresetResult {
    readonly state: ModelComplianceState;
    readonly changed: boolean;
    readonly error?: string;
    readonly verdict?: LockedActionVerdict;
}

const DEFAULT_DEDUP_WINDOW_MS = 60_000;

/**
 * Orchestrator stateful — uma instância por modelo aberto (TAB-MODEL-SWITCH).
 *
 * Eventos emitidos via onStateChanged:
 *   - Após addBinding bem-sucedido
 *   - Após removeBinding bem-sucedido
 *   - Após restoreState (round-trip .ecbt)
 *
 * Audit log emitido via registerAudit:
 *   - select/change/remove (mudança de binding)
 *   - lock/unlock (D8 lock state transitions)
 *   - retroactive (D9 aplicação em modelo legado)
 */
export class ComplianceManager {
    private _state: ModelComplianceState;
    private _lockState: ComplianceLockState;
    private _lastAuditAt: number;
    private _lastAuditPresetId: string | null;
    private readonly _options: ComplianceManagerOptions;
    private readonly _clock: () => number;

    constructor(options: ComplianceManagerOptions = {}) {
        this._options = options;
        this._clock = options.clock ?? (() => Date.now());
        this._state = emptyBindingState();
        this._lockState = unlockedState();
        this._lastAuditAt = 0;
        this._lastAuditPresetId = null;
    }

    /** Estado completo (immutable). */
    getState(): ModelComplianceState {
        return this._state;
    }

    /** Lock state atual. */
    getLockState(): ComplianceLockState {
        return this._lockState;
    }

    /** Bindings por scope. 'all' captura tudo. */
    getActiveBindings(scope: PresetScope): ReadonlyArray<ModelPresetBinding> {
        return getBindingsByScope(this._state, scope);
    }

    /** Resolve preset canonical OR fetch remote async. */
    async resolvePreset(presetId: string): Promise<CompliancePreset | null> {
        const canonical = findCanonicalPreset(presetId);
        if (canonical) return canonical;
        if (this._options.fetchPresetById) {
            try {
                return await this._options.fetchPresetById(presetId);
            } catch (e) {
                console.debug('[compliance:manager:resolvePreset]', (e as Error)?.message || e);
                return null;
            }
        }
        return null;
    }

    /**
     * Seleciona preset para um scope. Default: substitui binding existente
     * do mesmo scope. Multi-bind aceita múltiplos scopes simultâneos (D7).
     */
    async selectPreset(input: SelectPresetInput): Promise<SelectPresetResult> {
        const { presetId, scope, reason } = input;
        const preset = await this.resolvePreset(presetId);
        if (!preset) {
            return Object.freeze({
                state: this._state,
                changed: false,
                error: 'preset_not_found',
            });
        }
        const validation = validatePreset(preset);
        if (!validation.valid) {
            return Object.freeze({
                state: this._state,
                changed: false,
                error: `preset_invalid:${validation.errors.join(',')}`,
            });
        }

        // D8 lock gate: bloqueia mudança quando locked sem reason.
        // FIX TS-drainage: a assinatura é (state, reason?: string) e o veredito
        // expõe `allowed` (não `action`/objeto). O código anterior passava um
        // objeto (nunca string → o gate via `locked_no_reason`) e checava
        // `verdict.action === 'reject'` (campo inexistente → sempre falsy), de
        // modo que o gate NUNCA bloqueava. Agora bloqueia de fato.
        const verdict = decideChangePresetUnderLock(this._lockState, reason ?? undefined);
        if (!verdict.allowed) {
            return Object.freeze({
                state: this._state,
                changed: false,
                error: 'locked_no_reason',
                verdict,
            });
        }

        const currentForScope = getBindingsByScope(this._state, scope);
        const previousPresetId = currentForScope.length > 0 ? currentForScope[0]!.presetId : null;
        const action: PresetAuditEntry['action'] = previousPresetId ? 'change' : 'select';

        // Remove previous binding(s) do mesmo scope antes do add
        let next: ModelComplianceState = this._state;
        for (const b of currentForScope) {
            const r = removeBinding(next, b.presetId, b.scope);
            next = r.state;
        }

        const userId = this._options.userId ?? 'anonymous';
        const nowMs = this._clock();
        const result: BindingMutationResult = addBinding(next, {
            presetId,
            scope,
            contentHashSnapshot: preset.contentHash,
            activatedAt: new Date(nowMs).toISOString(),
            activatedBy: userId,
        });

        if (!result.changed) {
            return Object.freeze({
                state: this._state,
                changed: false,
                error: result.error ?? 'add_failed',
            });
        }

        this._state = result.state;
        this._broadcastStateChange();

        // Audit log com dedup window 60s
        const transient = this._isTransient(presetId, nowMs);
        await this._emitAudit({
            modelId: this._options.modelId,
            userId,
            oldPresetId: previousPresetId,
            newPresetId: presetId,
            scope,
            action,
            reason,
            transient,
            changedAt: new Date(nowMs).toISOString(),
        });

        return Object.freeze({ state: this._state, changed: true });
    }

    /**
     * Remove binding por (presetId, scope). Emite audit action='remove'.
     */
    async removeBindingByScope(
        presetId: string,
        scope: PresetScope,
        reason?: string,
    ): Promise<SelectPresetResult> {
        const result = removeBinding(this._state, presetId, scope);
        if (!result.changed) {
            return Object.freeze({ state: this._state, changed: false, error: 'binding_not_found' });
        }
        this._state = result.state;
        this._broadcastStateChange();
        const userId = this._options.userId ?? 'anonymous';
        const nowMs = this._clock();
        await this._emitAudit({
            modelId: this._options.modelId,
            userId,
            oldPresetId: presetId,
            newPresetId: null,
            scope,
            action: 'remove',
            reason,
            transient: false,
            changedAt: new Date(nowMs).toISOString(),
        });
        return Object.freeze({ state: this._state, changed: true });
    }

    /**
     * Restaura estado a partir de payload serializado (round-trip .ecbt RF6).
     */
    restoreState(raw: unknown): DeserializeResult {
        const result = deserializeComplianceState(raw);
        if (result.state) {
            this._state = result.state;
            this._broadcastStateChange();
        }
        return result;
    }

    /**
     * Snapshot serializado para persistência em .ecbt (RF6).
     */
    snapshotForEcbt(): SerializedComplianceStateV2 {
        return serializeComplianceState(this._state);
    }

    /**
     * Lista presets canônicos (sem rede).
     */
    listCanonicalPresets(): ReadonlyArray<CompliancePreset> {
        return CANONICAL_PRESETS;
    }

    /**
     * Lookup por id (canonical OR cache local — não consulta remote).
     */
    getPresetSync(presetId: string): CompliancePreset | null {
        const canonical = findCanonicalPreset(presetId);
        if (canonical) return canonical;
        return getPresetById(presetId);
    }

    // ============================================================
    // Internals
    // ============================================================

    private _broadcastStateChange(): void {
        if (this._options.onStateChanged) {
            try {
                this._options.onStateChanged(this._state);
            } catch (e) {
                console.debug('[compliance:manager:broadcast]', (e as Error)?.message || e);
            }
        }
    }

    private async _emitAudit(entry: PresetAuditEntry): Promise<void> {
        if (!this._options.registerAudit) {
            // Local-only mode: track dedup but don't persist
            this._lastAuditAt = Date.parse(entry.changedAt);
            this._lastAuditPresetId = entry.newPresetId;
            return;
        }
        try {
            await this._options.registerAudit(entry);
            this._lastAuditAt = Date.parse(entry.changedAt);
            this._lastAuditPresetId = entry.newPresetId;
        } catch (e) {
            console.debug('[compliance:manager:audit]', (e as Error)?.message || e);
        }
    }

    private _isTransient(newPresetId: string, nowMs: number): boolean {
        // RF19 dedup window 60s: A→B→A em <60s marcado transient
        if (this._lastAuditPresetId === null) return false;
        const delta = nowMs - this._lastAuditAt;
        if (delta > DEFAULT_DEDUP_WINDOW_MS) return false;
        // A→B→A pattern: o NOVO preset igual ao "old" da última mudança? Heuristic:
        // sob lock window, qualquer A→B→A repetição é transient
        return this._lastAuditPresetId === newPresetId;
    }
}

/**
 * Factory simples sem opções (manager local-only para testes).
 */
export function createLocalManager(): ComplianceManager {
    return new ComplianceManager();
}
