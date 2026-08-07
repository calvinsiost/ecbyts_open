/**
 * ialQuickReport.js - Tier 3 B11 quick technical report helpers.
 *
 * This is a preview report, not an official signed lab certificate.
 *
 * @module ialQuickReport
 * @license AGPL-3.0-only
 */
import { escapeHtmlFull as _escapeHtmlFull } from '../../utils/helpers/html.js';

export const IAL_QUICK_REPORT_FORMATS = Object.freeze({
    JSON: 'json',
    HTML: 'html',
});

export const IAL_QUICK_REPORT_DISCLAIMER =
    'Preview tecnico gerado automaticamente. Nao substitui laudo oficial assinado por responsavel habilitado.';

const EXCEEDANCE_ORDER = Object.freeze({
    ok: 0,
    vr_exceeded: 1,
    vp_exceeded: 2,
    vi_exceeded: 3,
});

function assertPlainObject(value: any, fieldName: any): any {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${fieldName} must be an object`);
    }
    return value;
}

function optionalString(value: any, fallback = ''): any {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeNumber(value: any, fieldName: any): number {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        throw new TypeError(`${fieldName} must be a finite number`);
    }
    return number;
}

function normalizeThresholds(thresholds: any = {}): Readonly<Record<string, any>> {
    const result: Record<string, any> = {};
    for (const [parameter, raw] of Object.entries(thresholds || {}) as Array<[string, any]>) {
        if (!raw || typeof raw !== 'object') continue;
        const normalized: Record<string, number> = {};
        for (const key of ['vr', 'vp', 'vi']) {
            if (raw[key] === undefined || raw[key] === null || raw[key] === '') continue;
            const value = Number(raw[key]);
            if (Number.isFinite(value)) normalized[key] = value;
        }
        result[String(parameter)] = Object.freeze(normalized);
    }
    return Object.freeze(result);
}

function classifyExceedance(value: any, thresholds: any = {}): string {
    if (Number.isFinite(thresholds.vi) && value > thresholds.vi) return 'vi_exceeded';
    if (Number.isFinite(thresholds.vp) && value > thresholds.vp) return 'vp_exceeded';
    if (Number.isFinite(thresholds.vr) && value > thresholds.vr) return 'vr_exceeded';
    return 'ok';
}

function normalizeObservation(raw: any, index: any, thresholdsByParameter: any): Readonly<any> {
    assertPlainObject(raw, `observations[${index}]`);
    const parameter = optionalString(raw.parameter || raw.name);
    if (!parameter) throw new TypeError(`observations[${index}].parameter must be a non-empty string`);
    const value = normalizeNumber(raw.value ?? raw.result, `observations[${index}].value`);
    const thresholds = thresholdsByParameter[parameter] || {};
    const status = classifyExceedance(value, thresholds);

    return Object.freeze({
        id: optionalString(raw.id, `obs-${index + 1}`),
        sampleId: optionalString(raw.sampleId || raw.sample_id, null as any),
        parameter,
        value,
        unit: optionalString(raw.unit, ''),
        method: optionalString(raw.method, ''),
        thresholds,
        status,
    });
}

function normalizeSample(sample: any = {}): Readonly<any> {
    assertPlainObject(sample, 'sample');
    return Object.freeze({
        id: optionalString(sample.id || sample.sampleId || sample.sample_id, 'sample-1'),
        client: optionalString(sample.client || sample.clientName || sample.client_name, 'Cliente nao informado'),
        collectedAt: optionalString(sample.collectedAt || sample.collected_at || sample.collectionDate, null as any),
        matrix: optionalString(sample.matrix, null as any),
        location: optionalString(sample.location, null as any),
    });
}

/**
 * Normalizes and validates the API payload for `POST /api/reports/ial-quick`.
 */
export function normalizeIalQuickReportInput(input: any = {}): Readonly<object> {
    assertPlainObject(input, 'input');
    const sample = normalizeSample(input.sample);
    const thresholds = normalizeThresholds(input.thresholds);
    if (!Array.isArray(input.observations) || input.observations.length === 0) {
        throw new TypeError('observations must be a non-empty array');
    }

    const observations = input.observations.map((row: any, index: any) =>
        normalizeObservation(row, index, thresholds),
    );
    const format = optionalString(input.format, IAL_QUICK_REPORT_FORMATS.JSON).toLowerCase();
    if (!Object.values(IAL_QUICK_REPORT_FORMATS).includes(format as any)) {
        throw new RangeError('format must be html or json');
    }

    return Object.freeze({
        sample,
        observations: Object.freeze(observations),
        thresholds,
        format,
    });
}

/**
 * Builds the canonical JSON report payload.
 */
export function buildIalQuickReport(input: any = {}): Readonly<object> {
    const normalized = normalizeIalQuickReportInput(input) as any;
    const counts: Record<string, number> = { ok: 0, vr_exceeded: 0, vp_exceeded: 0, vi_exceeded: 0 };
    for (const observation of normalized.observations) {
        counts[observation.status] = (counts[observation.status] ?? 0) + 1;
    }
    const worstStatus = Object.keys(counts)
        .filter((key) => (counts[key] as number) > 0)
        .sort((a, b) => (EXCEEDANCE_ORDER as any)[b] - (EXCEEDANCE_ORDER as any)[a])[0];
    const exceedances = normalized.observations.filter((row: any) => row.status !== 'ok');

    return Object.freeze({
        reportType: 'ial_quick',
        generatedAt: new Date().toISOString(),
        sample: normalized.sample,
        observations: normalized.observations,
        summary: Object.freeze({
            total: normalized.observations.length,
            counts: Object.freeze(counts),
            exceedanceCount: exceedances.length,
            worstStatus: worstStatus || 'ok',
            conclusion:
                exceedances.length > 0
                    ? `${exceedances.length} parametro(s) acima de limite de referencia.`
                    : 'Nenhum parametro acima dos limites informados.',
        }),
        disclaimer: IAL_QUICK_REPORT_DISCLAIMER,
    });
}

function escapeHtml(value: any): string {
    return _escapeHtmlFull(value);
}

function renderThresholds(thresholds: any = {}): string {
    const parts: string[] = [];
    for (const key of ['vr', 'vp', 'vi']) {
        if (Number.isFinite(thresholds[key])) parts.push(`${key.toUpperCase()}: ${thresholds[key]}`);
    }
    return parts.length ? parts.join(' / ') : '-';
}

/**
 * Renders the quick report as a compact HTML preview.
 */
export function renderIalQuickReportHtml(report: any): string {
    assertPlainObject(report, 'report');
    const rows = (Array.isArray(report.observations) ? report.observations : [])
        .map(
            (row: any) =>
                `<tr data-status="${escapeHtml(row.status)}">` +
                `<td>${escapeHtml(row.parameter)}</td>` +
                `<td>${escapeHtml(row.value)} ${escapeHtml(row.unit)}</td>` +
                `<td>${escapeHtml(renderThresholds(row.thresholds))}</td>` +
                `<td>${escapeHtml(row.status)}</td>` +
                `</tr>`,
        )
        .join('');

    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>IAL Quick Report - ${escapeHtml(report.sample?.id)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #1f2933; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .meta, .summary, .disclaimer { margin: 12px 0; }
    table { border-collapse: collapse; width: 100%; margin-top: 16px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
    th { background: #eef2f7; }
    tr[data-status="vi_exceeded"] td { background: #fee2e2; }
    tr[data-status="vp_exceeded"] td { background: #ffedd5; }
    tr[data-status="vr_exceeded"] td { background: #fef9c3; }
    .disclaimer { font-size: 12px; color: #475569; }
  </style>
</head>
<body>
  <h1>IAL Quick Report</h1>
  <div class="meta">
    <strong>Amostra:</strong> ${escapeHtml(report.sample?.id)}<br>
    <strong>Cliente:</strong> ${escapeHtml(report.sample?.client)}<br>
    <strong>Matriz:</strong> ${escapeHtml(report.sample?.matrix || '-')}<br>
    <strong>Coleta:</strong> ${escapeHtml(report.sample?.collectedAt || '-')}
  </div>
  <div class="summary">${escapeHtml(report.summary?.conclusion)}</div>
  <table>
    <thead><tr><th>Parametro</th><th>Resultado</th><th>Limites</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="disclaimer">${escapeHtml(report.disclaimer)}</p>
</body>
</html>`;
}
