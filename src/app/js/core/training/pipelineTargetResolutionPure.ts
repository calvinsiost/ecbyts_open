export type PipelineOpenTargetInput =
    | string
    | number
    | boolean
    | {
          readonly id?: unknown;
          readonly pipelineId?: unknown;
          readonly presetId?: unknown;
          readonly templateId?: unknown;
          readonly nodeId?: unknown;
          readonly target?: unknown;
          readonly hint?: unknown;
          readonly course?: unknown;
          readonly courseId?: unknown;
          readonly slide?: unknown;
          readonly slideNumber?: unknown;
          readonly source?: unknown;
          readonly origin?: unknown;
          readonly purpose?: unknown;
          readonly label?: unknown;
          readonly returnLabel?: unknown;
      }
    | null
    | undefined;

export type PipelineOpenReason = 'no-target' | 'target-found' | 'target-not-found' | 'no-pipelines';

export interface NormalizedPipelineOpenTarget {
    readonly raw: string;
    readonly pipelineId: string;
    readonly presetId: string;
    readonly templateId: string;
    readonly nodeId: string;
    readonly aliases: readonly string[];
    readonly hasTarget: boolean;
}

export interface PipelineTargetResolution {
    readonly target: NormalizedPipelineOpenTarget;
    readonly reason: PipelineOpenReason;
    readonly targetPipelineId: string | null;
    readonly match: string;
}

export interface PipelineOpenResult {
    readonly ok: boolean;
    readonly opened: boolean;
    readonly fallback: boolean;
    readonly reason: PipelineOpenReason;
    readonly targetPipelineId: string | null;
    readonly requested: {
        readonly raw: string;
        readonly pipelineId: string;
        readonly presetId: string;
        readonly templateId: string;
        readonly nodeId: string;
    };
    readonly message: string;
}

interface PipelineSearchEntry {
    readonly id?: unknown;
    readonly name?: unknown;
    readonly xml?: unknown;
    readonly presetId?: unknown;
    readonly templateId?: unknown;
    readonly nodeId?: unknown;
    readonly sourcePresetId?: unknown;
    readonly sourceTemplateId?: unknown;
    readonly targetPresetId?: unknown;
    readonly targetTemplateId?: unknown;
    readonly meta?: unknown;
    readonly metadata?: unknown;
    readonly model?: unknown;
}

const GAC_DD38_PRESET_ID = 'm01.gac.flow.dd38';

export function resolvePipelineTarget(
    pipelines: readonly PipelineSearchEntry[],
    targetInput?: PipelineOpenTargetInput,
): PipelineTargetResolution {
    const target = normalizePipelineOpenTarget(targetInput);
    if (!target.hasTarget) {
        return { target, reason: 'no-target', targetPipelineId: null, match: '' };
    }
    if (!Array.isArray(pipelines) || pipelines.length === 0) {
        return { target, reason: 'no-pipelines', targetPipelineId: null, match: '' };
    }

    const aliasIds = new Set(target.aliases.map((alias) => normalizeId(alias)).filter(Boolean));
    for (const pipeline of pipelines) {
        const id = stringValue(pipeline?.id);
        if (id && aliasIds.has(normalizeId(id))) {
            return { target, reason: 'target-found', targetPipelineId: id, match: 'pipeline-id' };
        }
    }

    for (const pipeline of pipelines) {
        const id = stringValue(pipeline?.id);
        if (!id) continue;
        const values = collectPipelineTargetValues(pipeline).map((value) => normalizeId(value)).filter(Boolean);
        if (values.some((value) => aliasIds.has(value))) {
            return { target, reason: 'target-found', targetPipelineId: id, match: 'target-field' };
        }
    }

    for (const pipeline of pipelines) {
        const id = stringValue(pipeline?.id);
        if (!id) continue;
        const haystack = pipelineSearchText(pipeline);
        const alias = target.aliases.find((entry) => {
            const normalized = normalizeSearch(entry);
            return normalized.length >= 3 && haystack.includes(normalized);
        });
        if (alias) {
            return { target, reason: 'target-found', targetPipelineId: id, match: `alias:${alias}` };
        }
    }

    const tokenQuery = target.raw || target.pipelineId || target.presetId || target.templateId || target.nodeId;
    const tokens = tokenizeSearch(tokenQuery);
    if (tokens.length > 0) {
        const candidate = pipelines.find((pipeline) => {
            const haystack = pipelineSearchText(pipeline);
            return tokens.length === 1 ? haystack.includes(tokens[0] || '') : tokens.every((token) => haystack.includes(token));
        });
        const id = stringValue(candidate?.id);
        if (id) {
            return { target, reason: 'target-found', targetPipelineId: id, match: 'token-query' };
        }
    }

    return { target, reason: 'target-not-found', targetPipelineId: null, match: '' };
}

export function withSeededGacDd38PipelineResolution(
    resolution: PipelineTargetResolution,
    targetInput: PipelineOpenTargetInput | undefined,
    seedGacDd38Pipeline: () => { readonly id?: unknown } | null | undefined,
): PipelineTargetResolution {
    if (resolution.targetPipelineId || !resolution.target.hasTarget) return resolution;
    if (!isGacDd38Target([...resolution.target.aliases, ...targetInputAliases(targetInput)])) return resolution;
    const saved = seedGacDd38Pipeline();
    const id = stringValue(saved?.id) || GAC_DD38_PRESET_ID;
    return {
        target: resolution.target,
        reason: 'target-found',
        targetPipelineId: id,
        match: 'seed:gac-dd38-preset',
    };
}

export function requestedTarget(resolution: PipelineTargetResolution): PipelineOpenResult['requested'] {
    return {
        raw: resolution.target.raw,
        pipelineId: resolution.target.pipelineId,
        presetId: resolution.target.presetId,
        templateId: resolution.target.templateId,
        nodeId: resolution.target.nodeId,
    };
}

export function pipelineOpenMessage(resolution: PipelineTargetResolution): string {
    const label = targetLabel(resolution);
    const targetName = /gac/i.test(`${resolution.target.raw} ${resolution.target.presetId} ${resolution.target.templateId} ${label}`)
        ? 'Fluxo GAC da aula'
        : 'Fluxo da aula';
    if (resolution.reason === 'target-found') {
        return `${targetName} encontrado.`;
    }
    if (resolution.reason === 'no-pipelines') {
        return `${targetName} ainda nao foi instalado nesta chave. Pipelines aberto para importar ou criar o fluxo correto.`;
    }
    if (resolution.reason === 'target-not-found') {
        return `${targetName} ainda nao foi encontrado nesta chave. Pipelines aberto para importar ou escolher o fluxo correto.`;
    }
    return 'Pipeline Manager aberto.';
}

function normalizePipelineOpenTarget(targetInput?: PipelineOpenTargetInput): NormalizedPipelineOpenTarget {
    const raw =
        typeof targetInput === 'string' || typeof targetInput === 'number' || typeof targetInput === 'boolean'
            ? stringValue(targetInput)
            : '';
    const record = isPlainRecord(targetInput) ? targetInput : null;
    const rawPresetId = normalizeId(raw) === GAC_DD38_PRESET_ID ? raw : '';
    const pipelineId = firstString(record?.pipelineId, record?.id);
    const presetId = firstString(record?.presetId, rawPresetId);
    const templateId = firstString(record?.templateId);
    const nodeId = firstString(record?.nodeId);
    const objectRaw = firstString(record?.target, record?.hint);
    const aliases = uniqueStrings([pipelineId, presetId, templateId, nodeId, raw, objectRaw]);
    if (isGacDd38Target(aliases)) {
        aliases.push(GAC_DD38_PRESET_ID, 'Fluxo GAC', 'Fluxo GAC DD38', 'GAC DD38', 'GAC DD 038', 'DD 038/2017');
    }
    return {
        raw: raw || objectRaw,
        pipelineId,
        presetId,
        templateId,
        nodeId,
        aliases: uniqueStrings(aliases),
        hasTarget: aliases.length > 0,
    };
}

function targetInputAliases(targetInput?: PipelineOpenTargetInput): string[] {
    if (!isPlainRecord(targetInput)) return [stringValue(targetInput)];
    return uniqueStrings([
        firstString(targetInput.id),
        firstString(targetInput.pipelineId),
        firstString(targetInput.presetId),
        firstString(targetInput.templateId),
        firstString(targetInput.nodeId),
        firstString(targetInput.target),
        firstString(targetInput.hint),
    ]);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function firstString(...values: readonly unknown[]): string {
    for (const value of values) {
        const text = stringValue(value);
        if (text) return text;
    }
    return '';
}

function stringValue(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return String(value).trim();
    }
    return '';
}

function uniqueStrings(values: readonly string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
        const text = stringValue(value);
        const key = normalizeId(text);
        if (!text || seen.has(key)) continue;
        seen.add(key);
        out.push(text);
    }
    return out;
}

function normalizeId(value: string): string {
    return String(value || '').trim().toLowerCase();
}

function normalizeSearch(value: string): string {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function tokenizeSearch(value: string): string[] {
    return normalizeSearch(value)
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= 2);
}

function isGacDd38Target(values: readonly string[]): boolean {
    return values.some((value) => {
        const normalizedId = normalizeId(value);
        const normalizedSearch = normalizeSearch(value);
        return (
            normalizedId === GAC_DD38_PRESET_ID ||
            (normalizedSearch.includes('gac') && (normalizedSearch.includes('dd38') || normalizedSearch.includes('dd 038')))
        );
    });
}

function collectPipelineTargetValues(pipeline: PipelineSearchEntry): string[] {
    const values: string[] = [];
    pushTargetValue(values, pipeline?.id);
    pushTargetValue(values, pipeline?.presetId);
    pushTargetValue(values, pipeline?.templateId);
    pushTargetValue(values, pipeline?.nodeId);
    pushTargetValue(values, pipeline?.sourcePresetId);
    pushTargetValue(values, pipeline?.sourceTemplateId);
    pushTargetValue(values, pipeline?.targetPresetId);
    pushTargetValue(values, pipeline?.targetTemplateId);

    const meta = isPlainRecord(pipeline?.meta) ? pipeline.meta : isPlainRecord(pipeline?.metadata) ? pipeline.metadata : null;
    pushTargetValue(values, meta?.presetId);
    pushTargetValue(values, meta?.templateId);
    pushTargetValue(values, meta?.nodeId);

    const model = isPlainRecord(pipeline?.model) ? pipeline.model : null;
    pushTargetValue(values, model?.id);
    pushTargetValue(values, model?.presetId);
    pushTargetValue(values, model?.templateId);
    pushTargetValue(values, model?.nodeId);
    if (Array.isArray(model?.nodes)) {
        for (const node of model.nodes) {
            if (!isPlainRecord(node)) continue;
            pushTargetValue(values, node.id);
            pushTargetValue(values, node.nodeId);
            pushTargetValue(values, node.presetId);
            pushTargetValue(values, node.templateId);
            pushTargetValue(values, node.key);
        }
    }
    return values;
}

function pushTargetValue(values: string[], value: unknown): void {
    const text = stringValue(value);
    if (text) values.push(text);
}

function pipelineSearchText(pipeline: PipelineSearchEntry): string {
    const model = pipeline?.model ? JSON.stringify(pipeline.model) : '';
    return normalizeSearch(
        [
            stringValue(pipeline?.id),
            stringValue(pipeline?.name),
            stringValue(pipeline?.xml),
            stringValue(pipeline?.presetId),
            stringValue(pipeline?.templateId),
            stringValue(pipeline?.nodeId),
            model,
        ].join(' '),
    );
}

function targetLabel(resolution: PipelineTargetResolution): string {
    const requested = requestedTarget(resolution);
    const parts = [
        requested.pipelineId ? `pipelineId=${requested.pipelineId}` : '',
        requested.presetId ? `presetId=${requested.presetId}` : '',
        requested.templateId ? `templateId=${requested.templateId}` : '',
        requested.nodeId ? `nodeId=${requested.nodeId}` : '',
        !requested.pipelineId && !requested.presetId && !requested.templateId && !requested.nodeId && requested.raw
            ? `target=${requested.raw}`
            : '',
    ].filter(Boolean);
    return parts.join(', ');
}
