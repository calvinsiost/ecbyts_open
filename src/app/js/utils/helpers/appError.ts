// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   APP ERROR — Contrato unico de erro no ecbyts
   ================================================================

   O QUE E ISSO?
   Um utilitario central que padroniza erros de toda a aplicacao.
   Em vez de cada handler mostrar `showToast(err.message, 'error')`
   com mensagem tecnica crua, usa-se `handleAppError(err, ctx)` que:

   1. Mapeia o erro para uma mensagem amigavel (pt-BR)
   2. Gera um codigo curto rastreavel (ECB-{AREA}-{NNN})
   3. Exibe toast com botao "Reportar" diretamente
   4. Preenche o formulario de bug report automaticamente
   5. Envia metadados estruturados para o painel admin

   CODIGO DE ERRO: ECB-{AREA}-{NNN}
   Areas: AUTH, FILE, SENSOR, IMPORT, REPORT, PIPELINE, NET, GEN

   COMO USAR (substituir em handlers criticos):
     // ANTES:
     showToast(err.message || 'Erro', 'error');
     // DEPOIS:
     handleAppError(err, { code: 'ECB-FILE-001', screen: 'files', operation: 'upload' });

   ================================================================ */
// ----------------------------------------------------------------
// CATALOGO DE ERROS
// ----------------------------------------------------------------
/**
 * Catalogo de codigos de erro com mensagens amigaveis ao usuario.
 * Cada entrada: { userMessage, severity }
 * severity: 'error' (vermelho) | 'warning' (amarelo)
 */
export const ERROR_CATALOG = {
    // Auth
    'ECB-AUTH-001': { userMessage: 'Sessao expirada. Faca login novamente.', severity: 'warning' },
    'ECB-AUTH-002': { userMessage: 'Permissao insuficiente para esta acao.', severity: 'error' },
    // Files
    'ECB-FILE-001': { userMessage: 'Falha ao enviar arquivo. Tente novamente.', severity: 'error' },
    'ECB-FILE-002': { userMessage: 'Arquivo muito grande. Limite: 50 MB.', severity: 'warning' },
    'ECB-FILE-003': { userMessage: 'Formato de arquivo nao suportado.', severity: 'warning' },
    // Import/Ingestion
    'ECB-IMPORT-001': { userMessage: 'Erro ao processar o arquivo importado.', severity: 'error' },
    'ECB-IMPORT-002': { userMessage: 'Formato de importacao invalido ou corrompido.', severity: 'error' },
    // Sensor/IoT
    'ECB-SENSOR-001': { userMessage: 'Nao foi possivel conectar ao sensor.', severity: 'error' },
    'ECB-SENSOR-002': { userMessage: 'Tempo limite atingido ao ler dados do sensor.', severity: 'warning' },
    // Report export
    'ECB-REPORT-001': { userMessage: 'Falha ao exportar relatorio.', severity: 'error' },
    // Pipelines/Workflows
    'ECB-PIPELINE-001': { userMessage: 'Etapa do pipeline falhou. Verifique os logs.', severity: 'error' },
    // Network
    'ECB-NET-001': { userMessage: 'Sem conexao. Verifique sua internet.', severity: 'error' },
    'ECB-NET-002': { userMessage: 'Servidor indisponivel. Tente em alguns instantes.', severity: 'error' },
    // Generic fallback
    'ECB-GEN-001': { userMessage: 'Ocorreu um erro inesperado.', severity: 'error' },
};
// ----------------------------------------------------------------
// NORMALIZADOR
// ----------------------------------------------------------------
/**
 * Normaliza qualquer erro bruto em um objeto AppError padronizado.
 *
 * @param {Error|string|object} raw - Erro original capturado no catch
 * @param {{ code?: string, screen?: string, operation?: string }} ctx - Contexto da operacao
 * @returns {{ code: string, userMessage: string, severity: string, screen: string, operation: string, correlationId: string, details: string }}
 */
export function toAppError(raw: any, ctx: any = {}) {
    const correlationId = _genId();
    const code = ctx.code || 'ECB-GEN-001';
    const catalog = (ERROR_CATALOG as Record<string,any>)[code] ||
        ERROR_CATALOG['ECB-GEN-001'];
    return {
        code,
        userMessage: catalog.userMessage,
        severity: catalog.severity,
        screen: ctx.screen || _inferScreen(),
        operation: ctx.operation || 'unknown',
        correlationId,
        details: raw instanceof Error ? raw.message : String(raw || ''),
    };
}
// ----------------------------------------------------------------
// HELPER PRINCIPAL
// ----------------------------------------------------------------
/**
 * Normaliza erro, exibe toast com CTA "Reportar" e envia metadados para captureError.
 * Substitui showToast(err.message, 'error') em handlers criticos.
 *
 * @param {Error|string} raw - Erro capturado no catch
 * @param {{ code?: string, screen?: string, operation?: string }} ctx - Contexto
 * @returns {Promise<void>}
 *
 * EXEMPLO:
 *   try {
 *     await uploadFile(file);
 *   } catch (err: any) {
 *     handleAppError(err, { code: 'ECB-FILE-001', screen: 'files', operation: 'upload' });
 *   }
 */
export async function handleAppError(raw: any, ctx: any = {}) {
    const appErr = toAppError(raw, ctx);
    const { showToast } = await import('../ui/toast.js' as string);
    // Mensagem amigavel com codigo curto rastreavel
    const label = `${appErr.userMessage} [${appErr.code}]`;
    // Toast persistente (duration=0) com CTA para abrir bug report pre-preenchido
    showToast(label, appErr.severity === 'warning' ? 'warning' : 'error', 0, {
        action: {
            label: 'Reportar',
            onClick: async () => {
                const { openReportBugModal } = await import('../ui/reportBugModal.js' as string);
                openReportBugModal({
                    prefill: {
                        type: 'bug',
                        description: `Erro ${appErr.code} em ${appErr.screen} / ${appErr.operation}:\n${appErr.details}`,
                        metadata: {
                            code: appErr.code,
                            screen: appErr.screen,
                            operation: appErr.operation,
                            correlationId: appErr.correlationId,
                        },
                    },
                });
            },
        },
    });
    // Captura automatica fire-and-forget (nao bloqueia o fluxo)
    try {
        const { captureError } = await import('../errorReporting/reporter.js' as string);
        captureError('warning', `[${appErr.code}] ${appErr.details}`, {
            metadata: {
                code: appErr.code,
                screen: appErr.screen,
                operation: appErr.operation,
                correlationId: appErr.correlationId,
                severity: appErr.severity,
                handled: true,
                source: 'handleAppError',
            },
        });
    }
    catch (e: any) {
        console.debug('[appError] reporter:', e?.message || e);
        // reporter pode falhar silenciosamente - nao impede o fluxo principal
    }
}
// ----------------------------------------------------------------
// INTERNALS
// ----------------------------------------------------------------
/**
 * Gera ID de correlacao curto para rastreio.
 * Formato: timestamp36-random5 (ex: "lxv3k2-a8f7c")
 *
 * @returns {string}
 */
function _genId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
/**
 * Infere tela ativa pelo hash da URL ou painel aberto.
 *
 * @returns {string}
 */
function _inferScreen() {
    const hash = location.hash?.slice(1) || '';
    if (hash)
        return hash;
    const activePanel = document.querySelector('.panel.active')?.id || '';
    return activePanel || 'unknown';
}
