// @ts-check
// Generated from src/app/js/utils/handlers/assessment.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/**
 * Document Assessment Handlers
 * Handlers para avaliacao automatica de documentos ambientais.
 *
 * Recebe texto de documento (via ingestion pipeline ou manual),
 * analisa tipo documental e mostra recomendacoes via toast.
 */
import { assessDocument } from '../../core/assessment/documentAssessor.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('AssessmentHandler');
/**
 * Executa avaliacao de documento e exibe resultados via toast.
 * @param {string} text - Texto do documento
 * @returns {object|null} Resultado da avaliacao ou null se falhar
 */
function handleAssessDocument( text: any) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        showToast(t('docAssess.noText'), 'warning');
        return null;
    }
    try {
        const result = assessDocument(text);
        const { documentType, recommendedFamilies, detectedParameters } = result;
        if (documentType.type === 'unknown') {
            showToast(t('docAssess.unknown'), 'info');
        } else {
            const families = recommendedFamilies.join(', ');
            const params = detectedParameters.map((p: any) => p.label).join(', ');
            const msg =
                `${t('docAssess.detected')}: ${documentType.label} | ` +
                `${t('docAssess.families')}: ${families || '-'} | ` +
                `${t('docAssess.parameters')}: ${params || '-'}`;
            showToast(msg, 'success');
        }
        log.info('Assessment complete', documentType.type);
        return result;
    } catch (err: any) {
        log.error('Assessment failed', err?.message);
        showToast(t('docAssess.error'), 'error');
        return null;
    }
}
export const assessmentHandlers = {
    handleAssessDocument,
};
