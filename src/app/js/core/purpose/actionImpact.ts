// @ts-check
// Generated from src/app/js/core/purpose/actionImpact.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.2.0
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: Environmental Data Governance
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   ACTION IMPACT — Lookup table acao→eixo EIS + micro-feedback
   Tabela pre-computada que mapeia handlers a eixos EIS afetados.

   Cada acao que melhora (ou degrada) dados ambientais tem um eixo
   3CTA+ associado. O micro-feedback usa essa tabela para exibir
   um toast contextual instantaneo (< 100ms) sem recalcular o EIS.

   A tabela e estatica e deterministica — nenhum calculo envolvido.
   O score real e atualizado pelo statusbar (Camada 2) e homeGrid
   (Camada 3) via recalculo normal do EisCalculator.
   ================================================================ */
import { showPurposeMicroToast } from '../../utils/ui/purposeMicroToast.js';
import { ANALYTICS_EVENTS, emitAnalyticsEvent } from '../events/analyticsEventBus.js';
// ================================================================
// LOOKUP TABLE - handler name → eixo EIS afetado
// Mapeia cada handler de dados ao eixo 3CTA+ que ele impacta
// ================================================================
/**
 * Pre-computed mapping: handler name to EIS axis impact.
 * Mapeamento estatico: nome do handler → impacto no eixo EIS.
 *
 * axis: eixo 3CTA+ afetado ('T'|'A'|'Cp'|'Ty'|'Cs'|'Cm')
 * dir:  direcao do impacto ('+' = melhoria, '-' = degradacao)
 * key:  chave i18n para mensagem do micro-toast
 *
 * @type {Object.<string, { axis: string, dir: string, key: string }>}
 */
export const ACTION_EIS_IMPACT = {
    // --- Completude (Cp) - Observacoes e elementos adicionados ---
    handleAddObservation: { axis: 'Cp', dir: '+', key: 'purposeImpactCpAdd' },
    handleAddElement: { axis: 'Cp', dir: '+', key: 'purposeImpactElementAdd' },
    handleRemoveElement: { axis: 'Cp', dir: '-', key: 'purposeImpactCpDown' },
    handleRemoveObservation: { axis: 'Cp', dir: '-', key: 'purposeImpactCpDown' },
    // --- Tempestividade (Ty) - Campanhas e dados temporais ---
    handleAddCampaign: { axis: 'Ty', dir: '+', key: 'purposeImpactTyAdd' },
    // --- Acuracia (A) - Sensores e calibracao ---
    handleFetchSensorData: { axis: 'A', dir: '+', key: 'purposeImpactARefresh' },
    handleSetSensorApiKey: { axis: 'A', dir: '+', key: 'purposeImpactAConnect' },
    // --- Transparencia (T) - Credenciais e autoria ---
    handleSubmitCredentialUpload: { axis: 'T', dir: '+', key: 'purposeImpactTCred' },
    // --- Consistencia (Cs) - Unidades e padronizacao ---
    handleUnitChange: { axis: 'Cs', dir: '+', key: 'purposeImpactCsUnit' },
    // --- Comparabilidade (Cm) - Taxonomia e dicionarios ---
    handleTaxonomyToggle: { axis: 'Cm', dir: '+', key: 'purposeImpactCmTax' },
    // --- Bulk import (Cp + multiplos eixos) ---
    handleConfirmSmartImport: { axis: 'Cp', dir: '+', key: 'purposeImpactCpBulk' },
    handleIngestionExecute: { axis: 'Cp', dir: '+', key: 'purposeImpactCpBulk' },
};
// ================================================================
// AXIS METADATA - Nomes e icones por eixo para o micro-toast
// ================================================================
/** @type {Object.<string, { name: string, i18nKey: string }>} */
export const EIS_AXIS_NAMES = {
    T: { name: 'Transparency', i18nKey: 'eisTransparency' },
    A: { name: 'Accuracy', i18nKey: 'eisAccuracy' },
    Cp: { name: 'Completeness', i18nKey: 'eisCompleteness' },
    Ty: { name: 'Timeliness', i18nKey: 'eisTimeliness' },
    Cs: { name: 'Consistency', i18nKey: 'eisConsistency' },
    Cm: { name: 'Comparability', i18nKey: 'eisComparability' },
};
// ================================================================
// OPT-OUT KEY - Usuario pode desabilitar micro-toasts
// ================================================================
const LS_MICROFEEDBACK_KEY = 'ecbyts-purpose-microfeedback';
// ================================================================
// DEBOUNCE STATE - Evita snapshot spam
// ================================================================
/** @type {ReturnType<typeof setTimeout> | null} */
let _snapshotDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const SNAPSHOT_DEBOUNCE_MS = 60_000; // 60 segundos
// ================================================================
// PUBLIC API
// ================================================================
/**
 * Emit micro-feedback for a handler action.
 * Emite micro-feedback instantaneo para uma acao do usuario.
 *
 * Faz lookup na ACTION_EIS_IMPACT, renderiza micro-toast se mapeado,
 * e emite EIS_SNAPSHOT_TRIGGER (debounced 60s) para captura de snapshot.
 *
 * Chamada tipica: 1 linha no final do handler.
 * ```js
 * handleAddObservation() {
 *     // ... logica existente ...
 *     refreshUi();
 *     purposeMicroFeedback('handleAddObservation');
 * }
 * ```
 *
 * @param {string} handlerName - Nome do handler (ex: 'handleAddObservation')
 * @param {Object} [meta={}] - Metadados opcionais para o toast (ex: { count: 5 })
 */
export function purposeMicroFeedback(handlerName: string, meta: Record<string, any> = {}) {
    // 1. Lookup - handler nao mapeado e silencioso
    const impact = (ACTION_EIS_IMPACT as Record<string, any>)[handlerName];
    if (!impact) return;
    // 2. Opt-out check - usuario desabilitou micro-feedback
    try {
        if (localStorage.getItem(LS_MICROFEEDBACK_KEY) === 'false') {
            // Ainda emite snapshot trigger mesmo com micro-toast desabilitado
            _scheduleSnapshot(handlerName);
            return;
        }
    } catch (e: any) {
        console.debug('[purpose/actionImpact] microFeedbackFlag:', e?.message || e);
        /* localStorage indisponivel — continua */
    }
    // 3. Renderiza micro-toast (Camada 1)
    showPurposeMicroToast(impact.axis, impact.dir, impact.key, meta);
    // 4. Agenda snapshot (debounced 60s) (Camada 2/3)
    _scheduleSnapshot(handlerName);
}
/**
 * Schedule a debounced EIS snapshot capture.
 * Agenda captura de snapshot com debounce de 60s.
 *
 * @param {string} triggerAction - Handler que disparou o trigger
 */
function _scheduleSnapshot(triggerAction: string) {
    if (_snapshotDebounceTimer) clearTimeout(_snapshotDebounceTimer);
    _snapshotDebounceTimer = setTimeout(() => {
        _snapshotDebounceTimer = null;
        void emitAnalyticsEvent(ANALYTICS_EVENTS.EIS_SNAPSHOT_TRIGGER, { triggerAction });
    }, SNAPSHOT_DEBOUNCE_MS);
}
//# sourceMappingURL=actionImpact.js.map
