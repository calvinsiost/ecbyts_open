// @ts-check
// AGPL-3.0-only - Copyright (C) 2026 Calvin Stefan Iost - see LICENSE.
// Extracted from app/js/utils/handlers/ingestion.js (P0-1 monolith seam).
// ingestionDomainDecisions.js - Render helpers for wizard DOMAIN_DECISIONS step.
// Pure HTML string builders. wizardState (when supplied) is mutated for the
// elevationStrategy auto-fallback to preserve original behavior.
// ----------------------------------------------------------------
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { S_CARD, S_LABEL, S_TITLE, S_MUTED } from './ingestion/_internal.js';
/** Dispatch entry: routes by step.domain. options.wizardState forwarded to env render. */
export function renderDomainDecisions(step: any, options: any = {}) {
    if (!step || typeof step !== 'object')
        return '';
    if (step.domain === 'ohs')
        return renderOHSDomainDecisions(step);
    return renderEnvironmentalDomainDecisions(step, options);
}
/** Render OHS (occupational) decisions. Self-contained — no wizardState dependency. */
export function renderOHSDomainDecisions(step: any) {
    const d = (step && step.decisions) || {};
    let html = '<div style="margin-top:4px;font-size:11px;">';
    // 4a. GHE
    if (step.hasGHE?.has) {
        html += `
            <div style="${S_CARD}">
                <p style="${S_TITLE}">GHE — ${step.hasGHE.count} grupo(s) homogeneo(s)</p>
                <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">
                    Grupos: ${escapeHtml(step.hasGHE.groups.slice(0, 6).join(', '))}${step.hasGHE.groups.length > 6 ? ' ...' : ''}
                </p>
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:ghe" type="radio" name="ghe" value="create_groups" ${d.gheStrategy === 'create_groups' ? 'checked' : ''}
                           data-cc-change="cc-1c84ec94">
                    Criar como Groups no ecbyts <span style="${S_MUTED}">(recomendado)</span>
                </label>
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:ghe" type="radio" name="ghe" value="ignore" ${d.gheStrategy === 'ignore' ? 'checked' : ''}
                           data-cc-change="cc-4afbf8b5">
                    Ignorar agrupamento
                </label>
            </div>`;
    }
    // 4b. Tipo de amostra: area vs personal
    if (step.hasMixedSampleTypes?.has) {
        html += `
            <div style="${S_CARD}">
                <p style="${S_TITLE}">Tipo de amostra</p>
                <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">
                    Dados contem amostras 'area' e 'personal'. Como tratar?
                </p>
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:sampletype" type="radio" name="sampletype" value="separate" ${d.sampleTypeStrategy === 'separate' ? 'checked' : ''}
                           data-cc-change="cc-98434272">
                    Separar: area → Element 'area', pessoal → Element 'individual' <span style="${S_MUTED}">(recomendado)</span>
                </label>
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:sampletype" type="radio" name="sampletype" value="all_worker" ${d.sampleTypeStrategy === 'all_worker' ? 'checked' : ''}
                           data-cc-change="cc-d7e89bbd">
                    Todas como observacoes no trabalhador
                </label>
            </div>`;
    }
    // 4c. LGPD - dados pessoais
    if (step.hasWorkerPII?.has) {
        html += `
            <div style="${S_CARD}">
                <p style="${S_TITLE}">Dados pessoais (LGPD)</p>
                <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">
                    Dados contem ${step.hasWorkerPII.hasCPF ? 'CPF/' : ''}matricula/nome de trabalhadores.
                </p>
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:lgpd" type="radio" name="lgpd" value="pseudonymize" ${d.lgpdStrategy === 'pseudonymize' ? 'checked' : ''}
                           data-cc-change="cc-157885fe">
                    Pseudonimizar (hash do nome, preservar GHE) <span style="${S_MUTED}">(recomendado)</span>
                </label>
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:lgpd" type="radio" name="lgpd" value="keep_identified" ${d.lgpdStrategy === 'keep_identified' ? 'checked' : ''}
                           data-cc-change="cc-f7724dad">
                    Manter dados identificados <span style="${S_MUTED}">(requer consentimento)</span>
                </label>
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:lgpd" type="radio" name="lgpd" value="anonymize" ${d.lgpdStrategy === 'anonymize' ? 'checked' : ''}
                           data-cc-change="cc-ddbeb700">
                    Anonimizar (remover vinculo com trabalhador)
                </label>
            </div>`;
    }
    // 4d. Limites ocupacionais
    html += `
        <div style="${S_CARD}">
            <p style="${S_TITLE}">Limites ocupacionais</p>
            <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">Referencia para validacao de exposicao</p>
            <label style="${S_LABEL}">
                <input data-field-meta="true" data-field-meta-key="auto-name:oel" type="radio" name="oel" value="ACGIH" ${d.oelSource === 'ACGIH' ? 'checked' : ''}
                       data-cc-change="cc-bd67d1af">
                ACGIH TLV (internacional) <span style="${S_MUTED}">(recomendado)</span>
            </label>
            <label style="${S_LABEL}">
                <input data-field-meta="true" data-field-meta-key="auto-name:oel" type="radio" name="oel" value="NR-15" ${d.oelSource === 'NR-15' ? 'checked' : ''}
                       data-cc-change="cc-80610a32">
                NR-15 (Brasil)
            </label>
            <label style="${S_LABEL}">
                <input data-field-meta="true" data-field-meta-key="auto-name:oel" type="radio" name="oel" value="NIOSH" ${d.oelSource === 'NIOSH' ? 'checked' : ''}
                       data-cc-change="cc-17231792">
                NIOSH REL (EUA)
            </label>
            <label style="${S_LABEL}">
                <input data-field-meta="true" data-field-meta-key="auto-name:oel" type="radio" name="oel" value="custom" ${d.oelSource === 'custom' ? 'checked' : ''}
                       data-cc-change="cc-77f5ec6a">
                Personalizado
            </label>
        </div>`;
    // 4e. PCMSO - aptidao
    if (step.hasPCMSO) {
        html += `
            <div style="${S_CARD}">
                <p style="${S_TITLE}">Dados PCMSO</p>
                <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">Exames medicos detectados. Importar status de aptidao?</p>
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L1724" type="checkbox" ${d.importAptitude ? 'checked' : ''}
                           data-cc-change="cc-f909e27c">
                    Importar aptidao (apto/inapto) como observacao
                </label>
            </div>`;
    }
    // Campanhas (compartilhado)
    if (step.hasMultipleCampaigns) {
        html += `
            <div style="${S_CARD}">
                <p style="${S_TITLE}">${step.stats.campaigns} campanhas de medicao</p>
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:campaign" type="radio" name="campaign" value="auto" ${d.campaignStrategy === 'auto' ? 'checked' : ''}
                           data-cc-change="cc-b2069fe0">
                    Criar automaticamente <span style="${S_MUTED}">(recomendado)</span>
                </label>
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:campaign" type="radio" name="campaign" value="single" ${d.campaignStrategy === 'single' ? 'checked' : ''}
                           data-cc-change="cc-6ff46113">
                    Campanha unica
                </label>
            </div>`;
    }
    html += '</div>';
    return html;
}
/**
 * Render environmental decisions. Mutates wizardState.decisions.elevationStrategy
 * from 'file' to 'dem' when the source file has no elevation column (preserves
 * original inline behavior). When wizardState is omitted, falls back to step.decisions.
 */
export function renderEnvironmentalDomainDecisions(step: any, options: any = {}) {
    const d = (step && step.decisions) || {};
    const wizardState = options.wizardState || null;
    let html = '<div style="margin-top:4px;font-size:11px;">';
    if (step.hasNonDetects) {
        html += `
            <div style="${S_CARD}">
                <p style="${S_TITLE}">${step.stats.nonDetect} resultados nao detectados (${Math.round((step.stats.nonDetect / Math.max(step.stats.results, 1)) * 100)}%)</p>
                <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">
                    Valores abaixo do Limite de Quantificacao (LQ) do laboratorio.
                    A escolha afeta estatisticas (media, tendencia Mann-Kendall) e mapas de contaminacao.
                </p>
                <label style="${S_LABEL}" title="Preserva o dado original sem alterar. O valor fica nulo e a flag detect_flag=N identifica o nao-detectado. Recomendado para manter rastreabilidade completa.">
                    <input data-field-meta="true" data-field-meta-key="auto-name:nondetect" type="radio" name="nondetect" value="flag_null" ${d.nonDetectStrategy === 'flag_null' ? 'checked' : ''}
                           data-cc-change="cc-d4e0d7e9">
                    Flag com valor nulo <span style="${S_MUTED}">(recomendado — rastreabilidade total)</span>
                </label>
                <label style="${S_LABEL}" title="${t('ingestion.halfLqTooltip')}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:nondetect" type="radio" name="nondetect" value="half_lq" ${d.nonDetectStrategy === 'half_lq' ? 'checked' : ''}
                           data-cc-change="cc-623ae9ae">
                    Metade do LQ <span style="${S_MUTED}">(padrao EPA/ProUCL — para estatisticas)</span>
                </label>
                <label style="${S_LABEL}" title="${t('ingestion.fullLqTooltip')}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:nondetect" type="radio" name="nondetect" value="full_lq" ${d.nonDetectStrategy === 'full_lq' ? 'checked' : ''}
                           data-cc-change="cc-62f44566">
                    Valor do LQ <span style="${S_MUTED}">(conservador — avaliacao de risco)</span>
                </label>
                <label style="${S_LABEL}" title="${t('ingestion.discardTooltip')}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:nondetect" type="radio" name="nondetect" value="discard" ${d.nonDetectStrategy === 'discard' ? 'checked' : ''}
                           data-cc-change="cc-547be2fd">
                    Descartar <span style="${S_MUTED}">(remove nao-detectados — reduz amostra)</span>
                </label>
            </div>`;
    }
    if (step.hasMultipleCampaigns) {
        html += `
            <div style="${S_CARD}">
                <p style="${S_TITLE}">${step.stats.campaigns} campanhas detectadas</p>
                <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">Agrupadas por prefixo de data no codigo de amostra</p>
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:campaign" type="radio" name="campaign" value="auto" ${d.campaignStrategy === 'auto' ? 'checked' : ''}
                           data-cc-change="cc-b2069fe0">
                    Criar ${step.stats.campaigns} campanhas automaticamente <span style="${S_MUTED}">(recomendado)</span>
                </label>
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:campaign" type="radio" name="campaign" value="single" ${d.campaignStrategy === 'single' ? 'checked' : ''}
                           data-cc-change="cc-6ff46113">
                    Campanha unica
                </label>
            </div>`;
    }
    if (step.hasMultilevelWells?.has) {
        html += `
            <div style="${S_CARD}">
                <p style="${S_TITLE}">${step.hasMultilevelWells.count} pocos multinivel</p>
                <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">
                    Ex: ${step.hasMultilevelWells.examples.slice(0, 4).join(', ')}
                </p>
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:multilevel" type="radio" name="multilevel" value="separate" ${d.multilevelStrategy === 'separate' ? 'checked' : ''}
                           data-cc-change="cc-c7296ab3">
                    Elementos separados <span style="${S_MUTED}">(recomendado)</span>
                </label>
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:multilevel" type="radio" name="multilevel" value="merged" ${d.multilevelStrategy === 'merged' ? 'checked' : ''}
                           data-cc-change="cc-04bf2cb2">
                    Um poco com observacoes em profundidades
                </label>
            </div>`;
    }
    if (step.hasCoordinates?.has) {
        html += `
            <div style="${S_CARD}">
                <p style="${S_TITLE}">Coordenadas geograficas</p>
                <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">
                    ${step.hasCoordinates.count || ''} locais com lat/long — serao projetados para coordenadas 3D locais
                </p>
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:coords" type="radio" name="coords" value="auto" ${d.coordinateOrigin === 'auto' ? 'checked' : ''}
                           data-cc-change="cc-c4ecb125">
                    Projetar automaticamente (centroide) <span style="${S_MUTED}">(recomendado)</span>
                </label>
                <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--neutral-200);">
                    <p style="${S_TITLE}font-size:10px;">Ajuste manual de posicionamento</p>
                    <div style="display:grid;grid-template-columns:repeat(3,minmax(90px,1fr));gap:6px;">
                        <label style="${S_LABEL}margin:0;font-size:10px;">Offset X (m)
                            <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L1842" type="number" step="1" value="${Number(d.geoOffsetX || 0)}"
                                   style="width:100%;padding:2px 4px;border:1px solid var(--border-color);border-radius:3px;"
                                   data-cc-change="cc-d85dec21">
                        </label>
                        <label style="${S_LABEL}margin:0;font-size:10px;">Offset Y (m)
                            <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L1847" type="number" step="1" value="${Number(d.geoOffsetY || 0)}"
                                   style="width:100%;padding:2px 4px;border:1px solid var(--border-color);border-radius:3px;"
                                   data-cc-change="cc-20e1555e">
                        </label>
                        <label style="${S_LABEL}margin:0;font-size:10px;">Rotacao (graus)
                            <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L1852" type="number" step="0.1" min="-180" max="180" value="${Number(d.geoRotationDeg || 0)}"
                                   style="width:100%;padding:2px 4px;border:1px solid var(--border-color);border-radius:3px;"
                                   data-cc-change="cc-9acec632">
                        </label>
                    </div>
                    <p style="font-size:9px;${S_MUTED}margin:4px 0 0;">Ajuste aplicado a todos os elementos durante importação.</p>
                </div>
            </div>`;
    }
    // D5: CRS / Datum info + selector
    if (step.dataQuality) {
        const dq = step.dataQuality;
        const datumOk = dq.detectedDatum && !dq.datumWarning;
        const datumColor = datumOk
            ? 'var(--success-700,#15803d)'
            : dq.datumWarning
                ? 'var(--warning-700,#a16207)'
                : 'var(--neutral-500)';
        html += `
            <div style="${S_CARD}${dq.datumWarning ? 'border:1px solid var(--warning-300);' : ''}">
                <p style="${S_TITLE}">Sistema de referencia (CRS)</p>
                <p style="font-size:10px;margin:0 0 6px;">
                    Datum detectado: <strong style="color:${datumColor};">${dq.detectedDatum ? escapeHtml(dq.detectedDatum) : 'nao informado'}</strong>
                    ${dq.datumWarning ? `<br><span style="color:var(--warning-700);">Datum nao reconhecido — verifique se as coordenadas estao em WGS84 ou SIRGAS 2000</span>` : ''}
                    ${!dq.detectedDatum ? `<br><span style="${S_MUTED}">Assumindo WGS84 (EPSG:4326). Se os dados usam outro datum (SAD 69, Corrego Alegre), as coordenadas podem estar deslocadas ate 100m.</span>` : ''}
                </p>
                <p style="font-size:10px;${S_MUTED}margin:0;">
                    ${dq.withCoordinates}/${dq.totalLocations} locais com coordenadas
                    ${dq.withElevation > 0 ? ` | ${dq.withElevation} com cota` : ''}
                </p>
                <div style="margin-top:6px;">
                    <label style="${S_LABEL}font-size:10px;">
                        Formato de data:
                        <select data-field-meta="true" data-field-meta-key="auto-pos:ingestion:select:L1886" style="font-size:10px;padding:2px 4px;margin-left:4px;"
                                data-cc-change="cc-b3d9e47b">
                            <option value="dd/mm" ${(d.dateLocale || 'dd/mm') === 'dd/mm' ? 'selected' : ''}>DD/MM/AAAA (Brasil)</option>
                            <option value="mm/dd" ${d.dateLocale === 'mm/dd' ? 'selected' : ''}>MM/DD/AAAA (EUA)</option>
                        </select>
                        ${step.detectedDateLocale ? `<span style="${S_MUTED}margin-left:4px;">(detectado: ${step.detectedDateLocale})</span>` : ''}
                    </label>
                </div>
            </div>`;
    }
    // VILA LOBOS: estrategia de cota/terreno
    if (step.dataQuality) {
        const dq = step.dataQuality;
        const coveragePct = dq.totalLocations > 0 ? Math.round((dq.withElevation / dq.totalLocations) * 100) : 0;
        if (wizardState && wizardState.decisions?.elevationStrategy === 'file' && dq.withElevation === 0) {
            wizardState.decisions.elevationStrategy = 'dem';
        }
        const elevationStrategy = wizardState?.decisions?.elevationStrategy || d.elevationStrategy || 'file';
        const recommend = dq.withElevation === dq.totalLocations && dq.totalLocations > 0
            ? 'arquivo'
            : dq.withElevation > 0
                ? 'DEM'
                : 'DEM ou zero';
        html += `
            <div style="${S_CARD}" data-testid="elevation-strategy-card">
                <p style="${S_TITLE}">Posicionamento vertical (cota)</p>
                <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">
                    Cobertura de cota: ${dq.withElevation}/${dq.totalLocations} locais (${coveragePct}%).
                    Recomendado: ${recommend}.
                </p>
                <label style="${S_LABEL}" title="Usa a cota informada no arquivo para posicionar os elementos.">
                    <input data-field-meta="true" data-field-meta-key="auto-name:elevstrategy" type="radio" name="elevstrategy" value="file" ${elevationStrategy === 'file' ? 'checked' : ''}
                           data-cc-change="cc-040abac6">
                    Usar cotas do arquivo <span style="${S_MUTED}">(${dq.withElevation > 0 ? 'quando disponiveis' : 'sem dados de cota detectados'})</span>
                </label>
                <label style="${S_LABEL}" title="Posiciona em baseline e prepara geracao de terreno para ajuste posterior.">
                    <input data-field-meta="true" data-field-meta-key="auto-name:elevstrategy" type="radio" name="elevstrategy" value="dem" ${elevationStrategy === 'dem' ? 'checked' : ''}
                           data-cc-change="cc-ce1d9576">
                    Interpolar no terreno (DEM) <span style="${S_MUTED}">(ativa geracao de terreno)</span>
                </label>
                <label style="${S_LABEL}" title="Posiciona todos os elementos no plano base Y=0.">
                    <input data-field-meta="true" data-field-meta-key="auto-name:elevstrategy" type="radio" name="elevstrategy" value="zero" ${elevationStrategy === 'zero' ? 'checked' : ''}
                           data-cc-change="cc-994bf9aa">
                    Cota zero (Y=0)
                </label>
            </div>`;
    }
    if (step.hasActionLevels?.has) {
        // D5: exibir badge com informacoes da aba de thresholds detectada
        const tsi = step.thresholdSheetInfo;
        const thresholdBadge = tsi?.detected
            ? `<span style="font-size:10px;background:var(--accent-100);color:var(--accent-700);padding:1px 6px;border-radius:10px;margin-left:6px;">${tsi.count} itens — ${escapeHtml(tsi.sheetName)}</span>`
            : '';
        html += `
            <div style="${S_CARD}">
                <p style="${S_TITLE}">Limites de referencia${thresholdBadge}</p>
                <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">
                    ${step.hasActionLevels.count || ''} limites encontrados na planilha
                </p>
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L1949" type="checkbox" ${d.importActionLevels ? 'checked' : ''}
                           data-cc-change="cc-083f580d">
                    Importar como referencia de conformidade
                </label>
            </div>`;
    }
    // D4: preview de nao-deteccoes por estrategia
    if (step.hasNonDetects && step.stats?.nonDetect > 0) {
        const ndCount = step.stats.nonDetect;
        const total = step.stats.results;
        const pct = total > 0 ? Math.round((ndCount / total) * 100) : 0;
        // Valores aproximados por estrategia (se mdlAvg disponivel)
        const mdl = step.mdlAvg;
        const u = step.mdlUnit ? ` ${step.mdlUnit}` : '';
        const halfMdlStr = mdl != null ? ` <span style="color:var(--neutral-500);">(&#8776; ${(mdl / 2).toFixed(2)}${u})</span>` : '';
        const fullMdlStr = mdl != null ? ` <span style="color:var(--neutral-500);">(&#8776; ${mdl.toFixed(2)}${u})</span>` : '';
        html += `
            <div style="${S_CARD}">
                <p style="${S_TITLE}">Preview: estrategias de nao-deteccao</p>
                <p style="font-size:10px;color:var(--neutral-800);margin:0 0 6px;">
                    ${ndCount} de ${total} resultados sao nao-deteccoes (${pct}%).
                </p>
                <p style="font-size:10px;${S_MUTED}margin:0 0 4px;">Cada estrategia produz:</p>
                <ul style="font-size:10px;color:var(--neutral-700);margin:0;padding-left:16px;line-height:1.8;">
                    <li><strong>Valor null</strong> — ${ndCount} obs. com valor null</li>
                    <li><strong>&#189; &times; MDL</strong> — ${ndCount} obs. com metade do limite de deteccao${halfMdlStr}</li>
                    <li><strong>MDL completo</strong> — ${ndCount} obs. com limite de deteccao completo${fullMdlStr}</li>
                    <li><strong>Descartar</strong> — ${total - ndCount} obs. no total (${ndCount} descartadas)</li>
                </ul>
            </div>`;
    }
    // G4: warning de datum
    if (step.dataQuality?.datumWarning) {
        html += `
        <div style="${S_CARD}border:1px solid var(--warning-300);background:var(--warning-50,#fffbeb);">
            <p style="${S_TITLE}color:var(--warning-700,#92400e);">&#9888; Datum: ${escapeHtml(step.dataQuality.detectedDatum || 'desconhecido')}</p>
            <p style="font-size:10px;color:var(--warning-600,#d97706);margin:0;">
                Coordenadas podem ter offset significativo vs WGS84 (ex: SAD69 &#8776; 60m).
                Recomendacao: converter para SIRGAS2000/WGS84 antes de importar.
            </p>
        </div>`;
    }
    // D15: profundidade e diametro default
    if (step.dataQuality) {
        const dq = step.dataQuality;
        const missingDepth = dq.totalLocations - dq.withDepth;
        const missingDiam = dq.totalLocations - dq.withDiameter;
        if (missingDepth > 0 || missingDiam > 0) {
            html += `
            <div style="${S_CARD}">
                <p style="${S_TITLE}">Dados construtivos dos pocos</p>
                <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">
                    ${missingDepth > 0 ? `${missingDepth} de ${dq.totalLocations} locais sem dado de profundidade. ` : ''}
                    ${missingDiam > 0 ? `${missingDiam} sem dado de diametro.` : ''}
                </p>
                ${missingDepth > 0
                ? `
                <label style="${S_LABEL}">Profundidade padrao (m):
                    <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L2013" type="number" value="${d.defaultWellDepth ?? 50}" min="1" max="500" step="1"
                           style="width:70px;margin-left:6px;padding:2px 4px;border:1px solid var(--border-color);border-radius:3px;"
                           data-cc-change="cc-b725bca7">
                </label>`
                : ''}
                ${missingDiam > 0
                ? `
                <label style="${S_LABEL}">Diametro padrao (pol):
                    <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L2023" type="number" value="${d.defaultWellDiameter ?? 4}" min="1" max="24" step="0.5"
                           style="width:70px;margin-left:6px;padding:2px 4px;border:1px solid var(--border-color);border-radius:3px;"
                           data-cc-change="cc-2421abb7">
                </label>`
                : ''}
                <p style="font-size:9px;${S_MUTED}margin:4px 0 0;">Pontos sem dados recebem tag <code>is_depth_available: no</code></p>
            </div>`;
        }
    }
    // D16: pontos sem coordenadas
    if (step.dataQuality) {
        const dq = step.dataQuality;
        const missingCoords = dq.totalLocations - dq.withCoordinates;
        if (missingCoords > 0) {
            html += `
            <div style="${S_CARD}">
                <p style="${S_TITLE}">${missingCoords} de ${dq.totalLocations} locais sem coordenadas</p>
                <p style="font-size:10px;${S_MUTED}margin:0 0 6px;">Como posicionar no modelo 3D?</p>
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:missingcoords" type="radio" name="missingcoords" value="origin" ${d.missingCoordsStrategy === 'origin' ? 'checked' : ''}
                           data-cc-change="cc-e3e42251">
                    Empilhar na origem (0, 0, 0)
                </label>
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:missingcoords" type="radio" name="missingcoords" value="grid" ${d.missingCoordsStrategy === 'grid' ? 'checked' : ''}
                           data-cc-change="cc-2927534f">
                    Distribuir em grade ao redor do centroide
                </label>
                <label style="${S_LABEL}">
                    <input data-field-meta="true" data-field-meta-key="auto-name:missingcoords" type="radio" name="missingcoords" value="exclude" ${d.missingCoordsStrategy === 'exclude' ? 'checked' : ''}
                           data-cc-change="cc-61bb3fef">
                    Excluir do modelo (nao importar)
                </label>
                <p style="font-size:9px;${S_MUTED}margin:4px 0 0;">Pontos importados recebem tag <code>is_coordinates_available: no</code></p>
            </div>`;
        }
    }
    // D20: cota default
    if (step.dataQuality) {
        const dq = step.dataQuality;
        const missingElev = dq.totalLocations - dq.withElevation;
        if (missingElev > 0) {
            html += `
            <div style="${S_CARD}">
                <p style="${S_TITLE}">${missingElev} de ${dq.totalLocations} locais sem cota topografica</p>
                <label style="${S_LABEL}">Cota padrao (m):
                    <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L2072" type="number" value="${d.defaultElevation ?? 0}" step="1"
                           style="width:80px;margin-left:6px;padding:2px 4px;border:1px solid var(--border-color);border-radius:3px;"
                           data-cc-change="cc-5aa14815">
                    <span style="${S_MUTED}">usar 0 se desconhecido</span>
                </label>
                <p style="font-size:9px;${S_MUTED}margin:4px 0 0;">Pontos sem cota recebem tag <code>is_z_available: no</code></p>
            </div>`;
        }
    }
    // D17: boundary automatica
    if (step.dataQuality && step.dataQuality.withCoordinates >= 3) {
        html += `
        <div style="${S_CARD}">
            <p style="${S_TITLE}">Limite da area de estudo</p>
            <label style="${S_LABEL}">
                <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L2088" type="checkbox" ${d.generateBoundary ? 'checked' : ''}
                       data-cc-change="cc-2ade4aba">
                Gerar contorno automaticamente (convex hull dos pocos)
            </label>
        </div>`;
    }
    // D18: terreno automatico
    if (step.dataQuality && step.dataQuality.withCoordinates >= 3) {
        html += `
        <div style="${S_CARD}">
            <p style="${S_TITLE}">Superficie do terreno</p>
            <label style="${S_LABEL}">
                <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L2101" type="checkbox" ${d.generateTerrain ? 'checked' : ''}
                       data-cc-change="cc-571acaf5">
                Gerar terreno automaticamente (elevacao SRTM)
            </label>
            ${d.generateTerrain
            ? `
            <label style="${S_LABEL};margin-left:20px;">
                <input data-field-meta="true" data-field-meta-key="auto-pos:ingestion:input:L2109" type="checkbox" ${d.generateAerial ? 'checked' : ''}
                       data-cc-change="cc-34594c4e">
                Aplicar imagem de satelite ao terreno (Sentinel-2)
            </label>`
            : ''}
        </div>`;
    }
    html += '</div>';
    return html;
}
