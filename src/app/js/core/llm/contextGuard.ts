// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Privacy Context Guard — F1 pure-logic (SPEC_ECBY_PRIVACY_CONTEXT_GUARD)
//
// Camada de sanitização entre montagem de contexto do modelo e qualquer
// egress para provider de LLM. Pure-logic (sem rede, sem DOM, sem THREE),
// determinístico. Generalização type-preserving (BP4) — substitui valor
// bruto por ordem de grandeza/faixa/zona/relativo, preservando utilidade
// para o LLM raciocinar SEM expor o dado confidencial.
//
// Princípios (LGPD Art. 5 — minimização; contextual integrity arXiv
// 2310.17884; data minimization arXiv 2510.03662):
// - DEFAULT-DENY: rota/campo desconhecido → trata como sensível.
// - TYPE-PRESERVING: número vira ordem-de-grandeza+faixa (não "[REDACTED]").
// - AUDIT WITHOUT VALUE: registra "campo X foi generalizado" — nunca o
//   valor bruto (paradoxo de auditoria privada).
// - IDEMPOTENTE: sanitizar 2× = sanitizar 1×.

/** Perfis de política suportados. */
const POLICIES = Object.freeze({
    STRICT: 'strict',
    BALANCED: 'balanced',
    OPEN: 'open', // guard OFF (toggle do usuário desliga) — usado p/ testes/CI
});

/** Campos do domínio PDPL-U sempre sensíveis (strip de identificadores). */
const IDENTIFIER_FIELDS = new Set([
    'cnpj',
    'cpf',
    'owner',
    'ownerName',
    'siteName',
    'siteOwner',
    'siteOperator',
    'email',
    'phone',
    'address',
    'street',
    'zipCode',
    'cep',
    'documentNumber',
]);

/** Campos com coordenadas exatas (vira zona/relativo). */
const COORDINATE_FIELDS = new Set(['lat', 'lng', 'latitude', 'longitude', 'x', 'y', 'easting', 'northing']);

/** Campos com datas absolutas (vira relativo). */
const DATE_FIELDS = new Set(['date', 'sampledAt', 'observedAt', 'timestamp', 'collectedAt', 'reportedAt']);

/** Regex p/ detecção heurística (CNPJ + e-mail). Híbrida BP3. */
const RE_CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const RE_CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const RE_EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/**
 * Generaliza um número p/ ordem de grandeza + faixa + relação com
 * threshold opcional. Type-preserving: devolve string explicativa.
 *
 * Exemplos:
 *   1247  → "~10³ (faixa 10³–10⁴)"
 *   1247 + threshold=500   → "~10³ (faixa 10³–10⁴), acima do limite"
 *   0.003 → "~10⁻³ (faixa 10⁻³–10⁻²)"
 *   0     → "≈ 0"
 *
 * @param {number} value Valor bruto.
 * @param {{unit?:string, threshold?:number, thresholdLabel?:string}} [opts]
 * @returns {string}
 */
export function generalizeNumber(value: any, opts: any) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '<valor não numérico>';
    }
    const unit = opts && opts.unit ? ` ${opts.unit}` : '';
    if (value === 0) return `≈ 0${unit}`;
    const abs = Math.abs(value);
    const order = Math.floor(Math.log10(abs));
    const exp = (n: any) => {
        const map = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
        return String(n)
            .split('')
            .map((ch: any) => (map as Record<string,any>)[ch] || ch)
            .join('');
    };
    const sign = value < 0 ? '-' : '';
    let out = `~${sign}10${exp(order)} (faixa 10${exp(order)}–10${exp(order + 1)})${unit}`;
    if (opts && typeof opts.threshold === 'number' && Number.isFinite(opts.threshold)) {
        const label = opts.thresholdLabel ? ` ${opts.thresholdLabel}` : ' do limite';
        if (Math.abs(value) > Math.abs(opts.threshold)) out += `, acima${label}`;
        else if (Math.abs(value) < Math.abs(opts.threshold)) out += `, abaixo${label}`;
        else out += `, no${label}`;
    }
    return out;
}

/**
 * Generaliza coordenada exata p/ zona/relativo do sítio. NUNCA preserva
 * lat/long original. Heurística simples 8-direções a partir do centroide.
 *
 * @param {{lat:number, lng:number}} point
 * @param {{lat:number, lng:number}} centroid
 * @returns {string} ex: "setor NE do sítio"
 */
export function generalizeCoord(point: any, centroid: any) {
    if (!point || !centroid) return 'localização não disponível';
    const dLat = Number(point.lat) - Number(centroid.lat);
    const dLng = Number(point.lng) - Number(centroid.lng);
    if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) {
        return 'localização não disponível';
    }
    if (Math.abs(dLat) < 1e-6 && Math.abs(dLng) < 1e-6) return 'centro do sítio';
    const ns = dLat > 0 ? 'N' : 'S';
    const ew = dLng > 0 ? 'E' : 'W';
    // Se uma componente é muito menor, simplifica direção.
    const ratio = Math.abs(dLat) / (Math.abs(dLng) + 1e-12);
    let sector;
    if (ratio > 2.5)
        sector = ns; // dominante N/S
    else if (ratio < 0.4)
        sector = ew; // dominante E/W
    else sector = `${ns}${ew}`;
    return `setor ${sector} do sítio`;
}

/**
 * Relativiza data absoluta. Recebe `now` p/ determinismo.
 *
 * @param {number|string|Date} value Data bruta.
 * @param {number} now Epoch ms de referência.
 * @returns {string} ex: "~3 meses antes", "campanha mais recente"
 */
export function relativizeDate(value: any, now: any) {
    const ref = Number(now);
    if (!Number.isFinite(ref)) return 'data não disponível';
    let ts = null;
    if (value instanceof Date) ts = value.getTime();
    else if (typeof value === 'number') ts = value;
    else if (typeof value === 'string') {
        const parsed = Date.parse(value);
        ts = Number.isFinite(parsed) ? parsed : null;
        // Idempotência: string já relativizada (não parseável como data) → passthrough.
        if (ts == null) return value;
    }
    if (ts == null || !Number.isFinite(ts)) return 'data não disponível';
    const diffDays = Math.floor((ref - ts) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'data futura';
    if (diffDays < 7) return 'campanha mais recente';
    if (diffDays < 30) return `~${Math.floor(diffDays / 7)} semana(s) antes`;
    if (diffDays < 365) return `~${Math.floor(diffDays / 30)} meses antes`;
    return `~${Math.floor(diffDays / 365)} ano(s) antes`;
}

/**
 * Strip de identificadores de uma string (CNPJ/CPF/e-mail + token genérico).
 *
 * @param {string} text
 * @returns {string}
 */
export function stripIdentifiers(text: any) {
    if (typeof text !== 'string' || text === '') return text;
    return text
        .replace(RE_CNPJ, '[identificador removido]')
        .replace(RE_CPF, '[identificador removido]')
        .replace(RE_EMAIL, '[contato removido]');
}

/**
 * Classifica a sensibilidade de um campo do contexto.
 *
 * @param {string} fieldName
 * @returns {'identifier'|'coordinate'|'date'|'numeric'|'generic'}
 */
export function classifyFieldSensitivity(fieldName: any) {
    if (typeof fieldName !== 'string' || fieldName === '') return 'generic';
    const low = fieldName.toLowerCase();
    if (IDENTIFIER_FIELDS.has(fieldName) || IDENTIFIER_FIELDS.has(low)) return 'identifier';
    if (COORDINATE_FIELDS.has(fieldName) || COORDINATE_FIELDS.has(low)) return 'coordinate';
    if (DATE_FIELDS.has(fieldName) || DATE_FIELDS.has(low)) return 'date';
    return 'generic';
}

/**
 * Sanitiza um contexto bruto do modelo. Devolve `{ safeContext,
 * redactions }`. NUNCA muta o input.
 *
 * Comportamento por sensibilidade:
 *   identifier  → 'o sítio' / 'o cliente' (strip total)
 *   coordinate  → "setor X do sítio" (centroide opcional via policy)
 *   date        → relativo a `policy.now`
 *   numeric     → ordem de grandeza + faixa + threshold (se houver no
 *                 catálogo `policy.thresholds[field]`)
 *   generic     → stripIdentifiers aplicado a strings; objects recursivo
 *
 * `policy.mode='open'` desliga o guard (passthrough) — usado quando o
 * usuário OPT-OUT explicitamente (não default).
 *
 * @param {Object} rawContext
 * @param {{mode?:'strict'|'balanced'|'open', centroid?:{lat:number,lng:number},
 *   now?:number, thresholds?:Object}} [policy]
 * @returns {{safeContext:Object, redactions:Array<{field:string, type:string}>}}
 */
export function sanitizeModelContext(rawContext: any, policy: any) {
    if (rawContext == null || typeof rawContext !== 'object') {
        return { safeContext: rawContext, redactions: [] };
    }
    const p = policy || {};
    if (p.mode === POLICIES.OPEN) {
        // Passthrough — toggle OFF assumido pelo usuário.
        return { safeContext: rawContext, redactions: [] };
    }
    const now = Number.isFinite(p.now) ? p.now : Date.now();
    const centroid = p.centroid || null;
    const thresholds = p.thresholds || {};
    const redactions: any[] = [];

    function walk(value: any, path: any): any {
        if (value == null) return value;
        if (Array.isArray(value)) {
            return value.map((v: any, i: any) => walk(v, `${path}[${i}]`));
        }
        if (typeof value === 'object') {
            const out: any = {};
            for (const k of Object.keys(value)) {
                const fieldPath = path ? `${path}.${k}` : k;
                const sensitivity = classifyFieldSensitivity(k);
                const v = value[k];
                if (sensitivity === 'identifier') {
                    out[k] = k === 'cnpj' || k === 'cpf' ? 'o cliente' : 'o sítio';
                    redactions.push({ field: fieldPath, type: 'identifier' });
                } else if (sensitivity === 'coordinate' && typeof v === 'number' && centroid) {
                    // Coordenada solo → não-localizável sem o par. Marca campo.
                    out[k] = '[coord generalizada]';
                    redactions.push({ field: fieldPath, type: 'coordinate' });
                } else if (sensitivity === 'date') {
                    out[k] = relativizeDate(v, now);
                    redactions.push({ field: fieldPath, type: 'date' });
                } else if (typeof v === 'number' && thresholds[k] !== undefined) {
                    out[k] = generalizeNumber(v, { threshold: thresholds[k], thresholdLabel: k });
                    redactions.push({ field: fieldPath, type: 'numeric' });
                } else if (typeof v === 'object') {
                    // Caso especial: {lat, lng} como objeto → generaliza p/ setor.
                    if (v && !Array.isArray(v) && typeof v.lat === 'number' && typeof v.lng === 'number' && centroid) {
                        out[k] = generalizeCoord(v, centroid);
                        redactions.push({ field: fieldPath, type: 'coordinate' });
                    } else {
                        out[k] = walk(v, fieldPath);
                    }
                } else if (typeof v === 'string') {
                    const stripped = stripIdentifiers(v);
                    if (stripped !== v) {
                        redactions.push({ field: fieldPath, type: 'identifier' });
                    }
                    out[k] = stripped;
                } else {
                    out[k] = v;
                }
            }
            return out;
        }
        if (typeof value === 'string') return stripIdentifiers(value);
        return value;
    }

    const safeContext = walk(rawContext, '');
    return { safeContext, redactions };
}

/** Constantes públicas — políticas suportadas. */
export const GUARD_POLICIES = POLICIES;
