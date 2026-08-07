// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * EDD Reader Bot - Auto-imports EDD spreadsheet files when confidence exceeds threshold.
 *
 * Reacts to 'file_uploaded' events. Detects EDD format via ingestion parser,
 * validates confidence, and triggers import via the wizard/ingester pipeline.
 *
 * @module core/automation/bots/eddReaderBot
 */
import { createLogger } from '../../../utils/helpers/logger.js';
const log = createLogger('eddReaderBot');
export const eddReaderBot = {
    name: 'EDD Reader',
    description: 'Importa automaticamente arquivos EDD detectados',
    defaultConfig: {
        minConfidence: 0.9,
        autoCreateCampaign: true,
        stagingMode: false,
        notifyOnSuccess: true,
    },
    /**
     * @param {string} eventType
     * @param {{ file?: File, fileType?: string }} payload
     * @param {{ minConfidence?: number, autoCreateCampaign?: boolean, stagingMode?: boolean, notifyOnSuccess?: boolean }} config
     */
    onEvent: async (eventType: any, payload: any, config: any) => {
        if (eventType !== 'file_uploaded')
            return;
        const { file } = payload || {};
        if (!file || !file.name)
            return;
        // Only process spreadsheet files
        if (!/\.(xlsx?|csv)$/i.test(file.name))
            return;
        try {
            const { parseFile } = await import('../../ingestion/parser.js' as string);
            const { detectFormat } = await import('../../ingestion/parser.js' as string);
            const { showToast } = await import('../../../utils/ui/toast.js' as string);
            // Parse and detect format
            const parsed = await parseFile(file);
            if (!parsed || !parsed.sheets || parsed.sheets.length === 0)
                return;
            const format = detectFormat(parsed);
            if (!format || format.type !== 'edd')
                return;
            const confidence = format.confidence || 0;
            log.info(`EDD detected: ${file.name}, confidence: ${(confidence * 100).toFixed(0)}%`);
            const minConf = config.minConfidence ?? 0.9;
            if (confidence < minConf) {
                log.info(`Confidence below threshold (${minConf}), skipping`);
                return;
            }
            if (config.stagingMode) {
                showToast(`EDD detectado: ${file.name} (${(confidence * 100).toFixed(0)}%). Revise antes de importar.`, 'info');
                return { action: 'staged', file: file.name, confidence };
            }
            // Auto-import via ingestion pipeline
            const { mapDeterministic } = await import('../../ingestion/mapper.js' as string);
            const { buildIngestionPlan } = await import('../../ingestion/wizard.js' as string);
            const { ingest } = await import('../../ingestion/ingester.js' as string);
            const mapping = mapDeterministic(parsed, format);
            const wizardState = {
                parsed,
                format,
                mapping,
                createCampaign: config.autoCreateCampaign,
                _botTriggered: true,
            };
            const plan = buildIngestionPlan(wizardState);
            const result = await ingest(plan, { source: 'edd_reader_bot' });
            if (config.notifyOnSuccess) {
                const elCount = result?.elementsCreated || 0;
                const obsCount = result?.observationsCreated || 0;
                showToast(`EDD importado: ${elCount} elementos, ${obsCount} resultados`, 'success');
            }
            log.info(`Import complete: ${file.name}`);
            return { action: 'auto_imported', file: file.name, result };
        }
        catch (err: any) {
            log.error(`Error processing ${file.name}:`, err);
            try {
                const { showToast } = await import('../../../utils/ui/toast.js' as string);
                showToast('Erro ao importar EDD automaticamente', 'error');
            }
            catch (e: any) {
                console.debug('[eddReaderBot] toastImport:', /** @type {Error} */ (e)?.message || e);
                /* toast unavailable */
            }
            return { action: 'error', file: file.name, error: /** @type {Error} */ (err)?.message };
        }
    },
};
