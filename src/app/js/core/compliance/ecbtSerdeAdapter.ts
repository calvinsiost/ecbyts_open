// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// COMPLIANCE-PRESET-001 RF6 — adapter encoder/decoder ECBT IO.
// Owner SPEC: claude - novaspec. Wire RF6 por claude - executor 2026-06-06
// (autorização Calvin Opção 3 — canal corrId 8ce3dab1).
//
// Responsabilidade:
//   - Expor helpers que encoder/decoder ECBT existentes podem consumir
//     SEM precisar conhecer detalhes do ModelComplianceState
//   - Embed/extract do payload .ecbt via campo canonical `complianceState`
//   - Round-trip estável: encodeModel→decode preserva bindings + lock + version
//
// Mantém encoder/decoder atual intocado — esses arquivos consomem o adapter
// quando ready. Adapter expõe:
//   - embedComplianceInPayload(payload, manager) — encoder side
//   - extractComplianceFromPayload(payload) — decoder side
//   - applyComplianceToManager(payload, manager) — pós-decoder restore
//
// NÃO TOCO em encoder.ts/decoder.ts/validator.ts existentes — esses
// serão modificados por claude-novaspec (ou em wire futuro) quando ready.

import {
    type SerializedComplianceStateV2,
    type DeserializeResult,
} from './_complianceStateSerdePure.js';
import { type ComplianceManager } from './manager.js';

/**
 * Campo canonical no payload .ecbt onde complianceState vive.
 * Backward-compat: payload sem este campo é tratado como "sem preset" (default).
 */
export const ECBT_PAYLOAD_COMPLIANCE_KEY = 'complianceState' as const;

export interface EcbtPayloadWithCompliance {
    readonly [key: string]: unknown;
    readonly complianceState?: SerializedComplianceStateV2;
}

/**
 * Embed snapshot do manager no payload .ecbt antes da encode.
 * Caller (encoder) chama isto antes de serializar para o formato ECBT key.
 *
 * NÃO muta payload original — retorna cópia frozen.
 * Quando manager está em estado vazio (sem bindings), embed mesmo assim
 * para garantir round-trip estável + audit trail explícito.
 */
export function embedComplianceInPayload(
    payload: Readonly<Record<string, unknown>>,
    manager: ComplianceManager,
): EcbtPayloadWithCompliance {
    const snapshot = manager.snapshotForEcbt();
    return Object.freeze({
        ...payload,
        [ECBT_PAYLOAD_COMPLIANCE_KEY]: snapshot,
    });
}

/**
 * Extrai SerializedComplianceStateV2 do payload .ecbt pós-decode.
 * Retorna null quando ausente (modelo legado pré-RF6) — caller decide
 * default (modal onboarding D4 "Sem preset" sugere top-3).
 */
export function extractComplianceFromPayload(
    payload: Readonly<Record<string, unknown>> | null | undefined,
): SerializedComplianceStateV2 | null {
    if (!payload || typeof payload !== 'object') return null;
    const raw = (payload as EcbtPayloadWithCompliance)[ECBT_PAYLOAD_COMPLIANCE_KEY];
    if (!raw || typeof raw !== 'object') return null;
    return raw as SerializedComplianceStateV2;
}

/**
 * Atalho pós-decoder: extrai + restaura no manager em uma chamada.
 * Retorna DeserializeResult do pure-logic (state ok? errors? legacy migration?).
 *
 * Quando payload não contém complianceState (legado), retorna result com
 * state=emptyBindingState (manager fica vazio — modal onboarding D4).
 */
export function applyComplianceToManager(
    payload: Readonly<Record<string, unknown>> | null | undefined,
    manager: ComplianceManager,
): DeserializeResult {
    const raw = extractComplianceFromPayload(payload);
    if (!raw) {
        // Modelo legado: restoreState com null preserva manager vazio
        return manager.restoreState(null);
    }
    return manager.restoreState(raw);
}

/**
 * Check se um payload .ecbt contém complianceState (útil para encoder
 * decidir embed ou não-versionado).
 */
export function payloadHasCompliance(
    payload: Readonly<Record<string, unknown>> | null | undefined,
): boolean {
    return extractComplianceFromPayload(payload) !== null;
}
