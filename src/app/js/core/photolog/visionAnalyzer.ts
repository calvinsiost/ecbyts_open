// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   VISION ANALYZER — AI-powered field photo analysis
   Analise de fotos de campo com IA multimodal (Claude/GPT-4o/Gemini).

   Avalia:
   - Condicoes ambientais do local (contaminacao, vegetacao, erosao)
   - Estado de equipamentos (pocos, tanques, sistemas de remediacao)
   - Conformidade regulatoria (sinalizacao, EPIs, cercamento)
   - Elementos PDPLU identificaveis na foto
   - Riscos observaveis (vazamentos, danos, exposicao)

   Reutiliza infra LLM existente: routeMessage() + vision support.
   Referencia: CONAMA 420, ABNT NBR 15515, CETESB DD-038.
   ================================================================ */
import { routeMessage, hasApiKey } from '../llm/index.js';
import { blobToDataUrl } from '../ingestion/documents/imageOCR.js';
import { getPhotoBlob, getPhoto } from './manager.js';
import { getElementById } from '../elements/manager.js';
/**
 * @typedef {Object} VisionAnalysisResult
 * @property {string} photoId
 * @property {string} elementId
 * @property {string} provider - LLM provider used
 * @property {string} model - Model used
 * @property {Object} analysis - Structured analysis
 * @property {string} analysis.summary - Resumo geral (1-2 frases)
 * @property {string} analysis.condition - 'good'|'fair'|'poor'|'critical'
 * @property {Object[]} analysis.observations - Observacoes especificas
 * @property {Object[]} analysis.risks - Riscos identificados
 * @property {Object[]} analysis.recommendations - Recomendacoes
 * @property {string[]} analysis.pdpluElements - Familias PDPLU identificadas
 * @property {Object} usage - Token usage
 * @property {string} timestamp - ISO timestamp da analise
 */
// ─── System Prompt ──────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert environmental engineer performing a field photo assessment for a contaminated site investigation / environmental monitoring project in Brazil.

CONTEXT:
- This photo was taken at a monitoring point as part of a PDPLU (environmental digital twin) model
- The user needs a structured assessment for regulatory compliance (CONAMA 420, CETESB DD-038)
- Your analysis feeds into an Environmental Integrity Score (EIS) and field documentation

TASK: Analyze the field photo and return a JSON object with this exact structure:

{
  "summary": "1-2 sentence overview of what the photo shows",
  "condition": "good|fair|poor|critical",
  "observations": [
    {
      "category": "infrastructure|vegetation|soil|water|equipment|safety|contamination|erosion|other",
      "description": "specific observation in Portuguese",
      "severity": "info|low|medium|high",
      "location": "where in the photo (e.g. 'centro', 'canto superior direito', 'primeiro plano')"
    }
  ],
  "risks": [
    {
      "type": "contamination|structural|safety|environmental|regulatory",
      "description": "risk description in Portuguese",
      "severity": "low|medium|high|critical",
      "recommendation": "mitigation action in Portuguese"
    }
  ],
  "recommendations": [
    "actionable recommendation in Portuguese"
  ],
  "pdpluElements": ["well", "tank", "plume", "building", "boundary", "remediation"],
  "regulatoryFlags": [
    {
      "regulation": "CONAMA 420|CETESB DD-038|NR-15|ABNT NBR 15515",
      "issue": "description of regulatory concern in Portuguese",
      "severity": "advisory|warning|violation"
    }
  ]
}

RULES:
- Respond ONLY with the JSON object, no additional text
- descriptions and recommendations must be in Portuguese (BR)
- "pdpluElements" lists ONLY families visible in the photo (from: well, plume, lake, river, spring, building, tank, waste, boundary, remediation, sensor, habitat)
- If the photo is unclear or not an environmental site, still provide your best assessment
- "condition" reflects overall site condition: good (maintained), fair (minor issues), poor (significant issues), critical (immediate action needed)
- Be specific about locations within the photo
- Maximum 5 observations, 3 risks, 3 recommendations — prioritize by severity`;
/**
 * Analyzes a photo using AI vision.
 * Envia a foto para o LLM configurado e retorna analise estruturada.
 *
 * @param {string} photoId - ID da foto no PhotoLog
 * @param {Object} [opts]
 * @param {AbortSignal} [opts.signal] - AbortController signal para cancelamento
 * @param {Function} [opts.onProgress] - Callback de progresso (streaming)
 * @returns {Promise<({ok:true} & VisionAnalysisResult)|{ok:false, error:string}>}
 */
export async function analyzePhoto(photoId: string, opts: any = {}) {
    // Verifica se ha API key configurada
    if (!hasApiKey()) {
        return { ok: false, error: 'no_api_key' };
    }
    const photo = getPhoto(photoId);
    if (!photo) {
        return { ok: false, error: 'photo_not_found' };
    }
    // Carrega blob da foto
    const blob = await getPhotoBlob(photoId);
    if (!blob) {
        return { ok: false, error: 'blob_not_found' };
    }
    // Converte para data URL (base64)
    const dataUrl = await blobToDataUrl(blob);
    // Monta mensagem do usuario com contexto do elemento
    const userMessage = _buildUserMessage(photo);
    try {
        const response = await routeMessage(SYSTEM_PROMPT, userMessage, {
            image: dataUrl,
            maxTokens: 2000,
            temperature: 0.3,
            signal: opts.signal,
            onProgress: opts.onProgress,
        });
        // Parse JSON da resposta
        const analysis = _parseAnalysisResponse(response.content);
        if (!analysis) {
            return { ok: false, error: 'parse_failed' };
        }
        const result = {
            photoId,
            elementId: photo.elementId,
            provider: response.provider,
            model: response.model,
            analysis,
            usage: response.usage || null,
            timestamp: new Date().toISOString(),
        };
        // Salva resultado na metadata da foto
        _storeAnalysis(photoId, result);
        return /** @type {*} */ ({ ok: true, ...result });
    }
    catch (err: any) {
        const e = err;
        if (e.name === 'AbortError') {
            return { ok: false, error: 'cancelled' };
        }
        console.error('[photolog:vision] Analysis failed:', e);
        return { ok: false, error: e.message || 'analysis_failed' };
    }
}
/**
 * Returns cached analysis for a photo (if previously analyzed).
 * @param {string} photoId
 * @returns {Object|null} cached analysis result
 */
export function getCachedAnalysis(photoId: string) {
    const photo = getPhoto(photoId);
    return photo?._visionAnalysis || null;
}
/**
 * Checks if AI vision analysis is available.
 * Requer API key configurada.
 * @returns {boolean}
 */
export function isVisionAvailable() {
    return hasApiKey();
}
// ─── Internal ───────────────────────────────────────────────
/**
 * Builds user message with element context.
 * @param {*} photo - PhotoEntry
 * @returns {string}
 */
function _buildUserMessage(photo: any) {
    const el = getElementById(photo.elementId);
    const elName = el ? el.name || el.id : photo.elementId;
    const elFamily = el?.family || 'unknown';
    let msg = `Analyze this field photo from monitoring point "${elName}" (type: ${elFamily}).`;
    if (photo.description) {
        msg += `\nField note: "${photo.description}"`;
    }
    if (photo.gps) {
        msg += `\nGPS: ${photo.gps.lat.toFixed(6)}, ${photo.gps.lng.toFixed(6)}`;
    }
    if (photo.timestamp) {
        msg += `\nCapture date: ${new Date(photo.timestamp).toLocaleDateString('pt-BR')}`;
    }
    return msg;
}
/**
 * Parses LLM response into structured analysis.
 * Tolerante a markdown code blocks e texto extra.
 *
 * @param {string} text - resposta do LLM
 * @returns {Object|null} parsed analysis ou null
 */
function _parseAnalysisResponse(text: string) {
    if (!text || typeof text !== 'string')
        return null;
    // Tenta JSON direto
    try {
        const parsed = JSON.parse(text.trim());
        if (parsed && typeof parsed === 'object' && parsed.summary)
            return _normalizeAnalysis(parsed);
    }
    catch (e: any) {
        console.debug('[vision-analyzer] direct json parse:', e?.message || e);
    }
    // Tenta extrair de markdown code block
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
        try {
            const parsed = JSON.parse((codeBlockMatch[1] || '').trim());
            if (parsed && typeof parsed === 'object')
                return _normalizeAnalysis(parsed);
        }
        catch (e: any) {
            console.debug('[vision-analyzer] codeblock parse:', e?.message || e);
        }
    }
    // Tenta extrair primeiro JSON object do texto
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed && typeof parsed === 'object')
                return _normalizeAnalysis(parsed);
        }
        catch (e: any) {
            console.debug('[vision-analyzer] regex-extract parse:', /** @type {*} */ (e)?.message || e);
        }
    }
    return null;
}
/**
 * Normalizes analysis object - garante campos obrigatorios.
 * @param {*} raw
 * @returns {Object}
 */
function _normalizeAnalysis(raw: any) {
    return {
        summary: raw.summary || 'Analise nao disponivel',
        condition: ['good', 'fair', 'poor', 'critical'].includes(raw.condition) ? raw.condition : 'fair',
        observations: Array.isArray(raw.observations) ? raw.observations.slice(0, 10).map(_normalizeObservation) : [],
        risks: Array.isArray(raw.risks) ? raw.risks.slice(0, 5).map(_normalizeRisk) : [],
        recommendations: Array.isArray(raw.recommendations)
                ? raw.recommendations.slice(0, 5).filter((r: any) => typeof r === 'string')
            : [],
        pdpluElements: Array.isArray(raw.pdpluElements)
            ? raw.pdpluElements.filter((e: any) => typeof e === 'string')
            : [],
        regulatoryFlags: Array.isArray(raw.regulatoryFlags) ? raw.regulatoryFlags.slice(0, 5).map(_normalizeFlag) : [],
    };
}
/** @param {*} obs */
function _normalizeObservation(obs: any) {
    return {
        category: obs?.category || 'other',
        description: obs?.description || '',
        severity: ['info', 'low', 'medium', 'high'].includes(obs?.severity) ? obs.severity : 'info',
        location: obs?.location || '',
    };
}
/** @param {*} risk */
function _normalizeRisk(risk: any) {
    return {
        type: risk?.type || 'environmental',
        description: risk?.description || '',
        severity: ['low', 'medium', 'high', 'critical'].includes(risk?.severity) ? risk.severity : 'medium',
        recommendation: risk?.recommendation || '',
    };
}
/** @param {*} flag */
function _normalizeFlag(flag: any) {
    return {
        regulation: flag?.regulation || '',
        issue: flag?.issue || '',
        severity: ['advisory', 'warning', 'violation'].includes(flag?.severity) ? flag.severity : 'advisory',
    };
}
/**
 * Stores analysis result in photo metadata.
 * @param {string} photoId
 * @param {*} result
 */
function _storeAnalysis(photoId: string, result: any) {
    const photo = getPhoto(photoId);
    if (photo) {
        photo._visionAnalysis = {
            analysis: result.analysis,
            provider: result.provider,
            model: result.model,
            timestamp: result.timestamp,
        };
        photo.updatedAt = new Date().toISOString();
    }
}
//# sourceMappingURL=visionAnalyzer.js.map
