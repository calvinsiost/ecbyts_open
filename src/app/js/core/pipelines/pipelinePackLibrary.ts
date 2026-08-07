// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE PACK LIBRARY - pure entry model for "Meus processos".

   This module answers which Pipeline Packs the user has without reading DOM
   or localStorage. Callers provide already-read packs plus optional metadata.
   ================================================================ */

export type PipelinePackLibraryTabId = 'my-processes' | 'received-keyrings' | 'templates' | 'audit';
export type PipelinePackLibraryStatus = 'ready' | 'needs-review' | 'blocked' | 'template';
export type PipelinePackLibraryOrigin = 'mine' | 'received-keyring' | 'template' | 'audit' | 'unknown';

export interface PipelinePackLibraryOptions {
    currentUserId?: string;
    selectedPackId?: string;
    maxPendingLabels?: number;
}

export interface PipelinePackLibraryEmptyState {
    title: string;
    body: string;
    primaryActionLabel: string;
}

export interface PipelinePackLibraryItem {
    id: string;
    title: string;
    subtitle: string;
    categories: string[];
    categoryLabel: string;
    templateLabel: string;
    libraryLabel: string;
    versionLabel: string;
    sourceLabel: string;
    ownerLabel: string;
    updatedLabel: string;
    statsLabel: string;
    scoreLabel: string;
    status: PipelinePackLibraryStatus;
    statusLabel: string;
    origin: PipelinePackLibraryOrigin;
    sectionIds: PipelinePackLibraryTabId[];
    pendingCount: number;
    pendingLabels: string[];
    warningCount: number;
    warningLabels: string[];
    actionLabel: string;
    nextActionSummary: string;
    sortKey: string;
}

export interface PipelinePackLibraryTab {
    id: PipelinePackLibraryTabId;
    label: string;
    count: number;
    items: PipelinePackLibraryItem[];
    emptyState: PipelinePackLibraryEmptyState;
}

export interface PipelinePackLibraryRecommendation {
    packId: string;
    title: string;
    status: PipelinePackLibraryStatus;
    actionLabel: string;
    reason: string;
}

export interface PipelinePackLibrarySummary {
    total: number;
    myProcesses: number;
    receivedKeyrings: number;
    templates: number;
    audit: number;
    ready: number;
    needsReview: number;
    blocked: number;
}

export interface PipelinePackLibraryViewModel {
    isEmpty: boolean;
    headline: string;
    tabs: PipelinePackLibraryTab[];
    items: PipelinePackLibraryItem[];
    summary: PipelinePackLibrarySummary;
    emptyState: PipelinePackLibraryEmptyState;
    recommendedSelection: PipelinePackLibraryRecommendation | null;
}

export type PipelinePackLibrarySource = readonly unknown[] | Record<string, unknown> | null | undefined;

const TAB_ORDER: PipelinePackLibraryTabId[] = ['my-processes', 'received-keyrings', 'templates', 'audit'];

const TAB_LABELS: Record<PipelinePackLibraryTabId, string> = {
    'my-processes': 'Meus processos',
    'received-keyrings': 'Chaveiros recebidos',
    templates: 'Modelos',
    audit: 'Auditoria',
};

const TAB_EMPTY_STATES: Record<PipelinePackLibraryTabId, PipelinePackLibraryEmptyState> = {
    'my-processes': {
        title: 'Nenhum processo salvo',
        body: 'Importe um chaveiro .ecbt ou crie um processo a partir de um modelo.',
        primaryActionLabel: 'Importar chaveiro',
    },
    'received-keyrings': {
        title: 'Nenhum chaveiro recebido',
        body: 'Quando uma aula ou projeto enviar um chaveiro de processo, ele aparecera aqui.',
        primaryActionLabel: 'Importar .ecbt',
    },
    templates: {
        title: 'Nenhum modelo disponivel',
        body: 'Modelos de GAC, campo, laboratorio e projeto aparecerao aqui quando forem cadastrados.',
        primaryActionLabel: 'Criar modelo',
    },
    audit: {
        title: 'Nenhuma pendencia de auditoria',
        body: 'Processos com falta de fallback, asset ou permissao serao listados aqui.',
        primaryActionLabel: 'Ver processos',
    },
};

const LIBRARY_EMPTY_STATE: PipelinePackLibraryEmptyState = {
    title: 'Voce ainda nao tem processos salvos',
    body: 'Importe um chaveiro recebido, abra o GAC/DD38 ou comece por um modelo para criar seu primeiro processo.',
    primaryActionLabel: 'Importar chaveiro',
};

const STATUS_LABELS: Record<PipelinePackLibraryStatus, string> = {
    ready: 'Pronto',
    'needs-review': 'Precisa de revisao',
    blocked: 'Bloqueado',
    template: 'Modelo',
};

interface ExtractedRecord {
    pack: Record<string, unknown>;
    meta: Record<string, unknown>;
    storageKey: string;
}

interface PackLite {
    id: string;
    title: string;
    description: string;
    version: string;
    templateId: string;
    templateTitle: string;
    libraryId: string;
    libraryTitle: string;
    categories: string[];
    sourceKind: string;
    sourceFileName: string;
    nodes: number;
    edges: number;
    lanes: number;
    groups: number;
    moduleTargets: Record<string, unknown>[];
    assets: Record<string, unknown>[];
    auditNotes: string[];
    warnings: string[];
    score: number | null;
    minScore: number | null;
}

function _asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function _asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function _text(value: unknown): string {
    return String(value ?? '').trim();
}

function _lower(value: unknown): string {
    return _text(value).toLowerCase();
}

function _number(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function _bool(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    const raw = _lower(value);
    return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'sim';
}

function _slug(value: unknown): string {
    return _lower(value)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function _unique(values: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
        const text = _text(value);
        if (!text || seen.has(text)) continue;
        seen.add(text);
        out.push(text);
    }
    return out;
}

function _textList(value: unknown): string[] {
    const object = _asObject(value);
    const raw = Array.isArray(value)
        ? value
        : Object.keys(object).length > 0
          ? [value]
          : _text(value)
            ? String(value).split(',')
            : [];
    return _unique(
        raw
            .map((entry) => {
                const object = _asObject(entry);
                return _firstText(
                    object.label,
                    object.name,
                    object.title,
                    object.message,
                    object.code,
                    object.id,
                    entry,
                );
            })
            .filter(Boolean),
    );
}

function _firstText(...values: unknown[]): string {
    for (const value of values) {
        const text = _text(value);
        if (text) return text;
    }
    return '';
}

function _firstNumber(...values: unknown[]): number | null {
    for (const value of values) {
        const n = _number(value);
        if (n !== null) return n;
    }
    return null;
}

function _dateLabel(value: unknown): string {
    const text = _text(value);
    if (!text) return 'Sem data recente';
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text;
    return date.toISOString().slice(0, 10);
}

function _dateSort(value: unknown): string {
    const text = _text(value);
    const date = new Date(text);
    if (!text || Number.isNaN(date.getTime())) return '0000-00-00T00:00:00.000Z';
    return date.toISOString();
}

function _recordsFromSource(source: PipelinePackLibrarySource): ExtractedRecord[] {
    if (Array.isArray(source)) {
        return source.map((entry, index) => _extractRecord(entry, `item-${index + 1}`));
    }
    const map = _asObject(source);
    return Object.entries(map).map(([storageKey, value]) =>
        _extractRecord({ pack: value, metadata: { storageKey } }, storageKey),
    );
}

function _extractRecord(value: unknown, fallbackKey: string): ExtractedRecord {
    const wrapper = _asObject(value);
    const meta = {
        ..._asObject(wrapper.metadata),
        ..._asObject(wrapper.meta),
    };
    const candidate = wrapper.pack ?? wrapper.pipelinePack ?? wrapper.payload ?? wrapper.artifact;
    const pack = Object.keys(_asObject(candidate)).length > 0 ? _asObject(candidate) : wrapper;
    const storageKey = _firstText(meta.storageKey, wrapper.storageKey, wrapper.id, fallbackKey);
    return { pack, meta: { ...wrapper, ...meta }, storageKey };
}

function _normalizePackLite(record: ExtractedRecord): PackLite {
    const pack = record.pack;
    const meta = record.meta;
    const graph = _asObject(pack.graph);
    const source = _asObject(pack.source);
    const packMetadata = _asObject(pack.metadata ?? pack.meta);
    const library = _asObject(pack.library ?? packMetadata.library ?? meta.library);
    const template = _asObject(pack.template ?? packMetadata.template ?? meta.template);
    const validation = _asObject(pack.validation ?? meta.validation);
    const audit = _asObject(pack.audit);
    const validationProfile = _asObject(pack.validationProfile);
    const title = _firstText(pack.title, pack.name, meta.title, meta.name, 'Processo sem titulo');
    const id = _firstText(
        pack.id,
        meta.packId,
        meta.id,
        record.storageKey,
        `pipeline-pack-${_slug(title) || 'untitled'}`,
    );
    const moduleTargets = _asArray(pack.moduleTargets).map(_asObject);
    const assets = _asArray(pack.assets).map(_asObject);
    const nodes = _asArray(graph.nodes ?? pack.nodes).length;
    const edges = _asArray(graph.edges ?? pack.edges).length;
    const lanes = _asArray(graph.lanes ?? pack.lanes).length;
    const groups = _asArray(graph.groups ?? pack.groups).length;
    const categories = _unique([
        ..._textList(pack.categories),
        ..._textList(packMetadata.categories),
        ..._textList(meta.categories),
        ..._textList(pack.category),
        ..._textList(packMetadata.category),
        ..._textList(meta.category),
    ]);
    const warnings = _unique([
        ..._textList(pack.warnings),
        ..._textList(packMetadata.warnings),
        ..._textList(validation.warnings),
        ..._textList(meta.warnings),
    ]);
    return {
        id,
        title,
        description: _firstText(pack.description, meta.description),
        version: _firstText(
            pack.version,
            packMetadata.version,
            meta.version,
            pack.schemaVersion,
            meta.schemaVersion,
            '1.0.0',
        ),
        templateId: _firstText(pack.templateId, template.id, meta.templateId, meta.templateKey),
        templateTitle: _firstText(pack.templateTitle, template.title, template.name, meta.templateTitle),
        libraryId: _firstText(pack.libraryId, library.id, meta.libraryId, meta.collectionId),
        libraryTitle: _firstText(
            pack.libraryTitle,
            library.title,
            library.name,
            meta.libraryTitle,
            meta.collectionTitle,
        ),
        categories,
        sourceKind: _firstText(source.kind, meta.sourceKind, 'manual'),
        sourceFileName: _firstText(source.sourceFileName, meta.sourceFileName, meta.fileName),
        nodes,
        edges,
        lanes,
        groups,
        moduleTargets,
        assets,
        auditNotes: _asArray(audit.notes).map(_text).filter(Boolean),
        warnings,
        score: _firstNumber(audit.lastScore, meta.score),
        minScore: _firstNumber(validationProfile.minScore, meta.minScore),
    };
}

function _isTemplate(meta: Record<string, unknown>): boolean {
    const origin = _lower(meta.origin ?? meta.kind ?? meta.source);
    return (
        _bool(meta.isTemplate ?? meta.template) || origin === 'template' || origin === 'model' || origin === 'modelo'
    );
}

function _isReceived(meta: Record<string, unknown>, pack: PackLite): boolean {
    const origin = _lower(meta.origin ?? meta.kind ?? meta.source);
    return Boolean(
        _firstText(meta.receivedFrom, meta.keyringId, meta.keyringTitle, meta.courseId, meta.lessonId) ||
        origin === 'received' ||
        origin === 'received-keyring' ||
        origin === 'keyring' ||
        origin === 'chaveiro' ||
        origin === 'training' ||
        pack.sourceKind === 'ecbt',
    );
}

function _isMine(meta: Record<string, unknown>, currentUserId: string): boolean {
    const origin = _lower(meta.origin ?? meta.kind ?? meta.source);
    const owner = _firstText(meta.ownerId, meta.createdBy, meta.authorId, meta.userId);
    return origin === 'mine' || origin === 'my-process' || Boolean(currentUserId && owner === currentUserId);
}

function _ownerLabel(meta: Record<string, unknown>, currentUserId: string): string {
    const ownerName = _firstText(meta.ownerName, meta.createdByName, meta.authorName);
    const ownerId = _firstText(meta.ownerId, meta.createdBy, meta.authorId, meta.userId);
    if (ownerName) return ownerName;
    if (currentUserId && ownerId === currentUserId) return 'Criado por mim';
    if (ownerId) return `Autor: ${ownerId}`;
    return 'Origem nao informada';
}

function _sourceLabel(pack: PackLite, meta: Record<string, unknown>): string {
    const keyring = _firstText(meta.keyringTitle, meta.courseTitle, meta.lessonTitle);
    if (keyring) return `Chaveiro: ${keyring}`;
    if (pack.sourceFileName) return `Fonte: ${pack.sourceFileName}`;
    return `Fonte: ${pack.sourceKind}`;
}

function _statsLabel(pack: PackLite): string {
    const parts = [`${pack.nodes} nos`, `${pack.edges} conectores`];
    if (pack.lanes > 0) parts.push(`${pack.lanes} raias`);
    if (pack.groups > 0) parts.push(`${pack.groups} grupos`);
    return parts.join(' / ');
}

function _scoreLabel(pack: PackLite): string {
    if (pack.score === null) return 'Sem score local';
    return `${Math.round(pack.score)}/1000`;
}

function _categoryLabel(pack: PackLite): string {
    return pack.categories.length > 0 ? pack.categories.join(' / ') : 'Categoria nao informada';
}

function _templateLabel(pack: PackLite, isTemplate: boolean): string {
    const template = _firstText(pack.templateTitle, pack.templateId);
    if (template) return `Modelo: ${template}`;
    return isTemplate ? `Modelo: ${pack.title}` : 'Modelo nao informado';
}

function _libraryLabel(pack: PackLite): string {
    const library = _firstText(pack.libraryTitle, pack.libraryId);
    return library ? `Biblioteca: ${library}` : 'Biblioteca pessoal';
}

function _targetLabel(target: Record<string, unknown>): string {
    return _firstText(target.label, target.ownerNodeId, target.ownerRegionId, target.id, 'destino de modulo');
}

function _pendingFromTarget(target: Record<string, unknown>): string[] {
    const fallback = _asObject(target.fallback);
    const openMode = _firstText(target.openMode, 'open-live');
    const moduleId = _firstText(target.moduleId);
    const adapterId = _firstText(target.adapterId);
    const targetLabel = _targetLabel(target);
    const messages: string[] = [];
    if (!moduleId || !adapterId) {
        messages.push(`Complete o modulo equivalente de "${targetLabel}".`);
    }
    if (openMode !== 'snapshot-only' && _firstText(fallback.type, 'none') === 'none') {
        messages.push(`Defina o que mostrar se "${targetLabel}" nao abrir.`);
    }
    return messages;
}

function _pendingFromAsset(asset: Record<string, unknown>): string[] {
    const status = _lower(asset.status);
    const label = _firstText(asset.label, asset.fileName, asset.id, 'asset');
    if (status === 'missing') return [`Vincule o arquivo "${label}" antes de apresentar.`];
    if (status === 'no-permission') return [`Ajuste a permissao do arquivo "${label}".`];
    if (status === 'pending-validation') return [`Revise o arquivo "${label}" antes de publicar.`];
    return [];
}

function _metadataPending(meta: Record<string, unknown>): string[] {
    return [
        ..._asArray(meta.pending).map(_text),
        ..._asArray(meta.pendingLabels).map(_text),
        ..._asArray(meta.issues).map((issue) => _firstText(_asObject(issue).message, issue)),
    ].filter(Boolean);
}

function _pendingLabels(pack: PackLite, meta: Record<string, unknown>): string[] {
    const labels = [
        ...pack.moduleTargets.flatMap(_pendingFromTarget),
        ...pack.assets.flatMap(_pendingFromAsset),
        ...pack.warnings,
        ...pack.auditNotes,
        ..._metadataPending(meta),
    ];
    if (pack.score !== null && pack.minScore !== null && pack.score < pack.minScore) {
        labels.push(`Score ${Math.round(pack.score)}/1000 abaixo da meta ${Math.round(pack.minScore)}/1000.`);
    }
    if (_bool(meta.needsReview)) {
        labels.push('Revise este processo antes de usar em aula.');
    }
    return _unique(labels);
}

function _status(
    pack: PackLite,
    meta: Record<string, unknown>,
    pendingLabels: string[],
    isTemplate: boolean,
): PipelinePackLibraryStatus {
    const raw = _lower(meta.status ?? meta.auditStatus);
    if (isTemplate) return 'template';
    if (raw === 'blocked' || raw === 'bloqueado') return 'blocked';
    if (pack.assets.some((asset) => ['missing', 'no-permission'].includes(_lower(asset.status)))) return 'blocked';
    if (raw === 'needs-review' || raw === 'review' || raw === 'revisao' || pendingLabels.length > 0)
        return 'needs-review';
    return 'ready';
}

function _origin(
    isTemplate: boolean,
    isReceived: boolean,
    isMine: boolean,
    hasAudit: boolean,
): PipelinePackLibraryOrigin {
    if (isTemplate) return 'template';
    if (hasAudit) return 'audit';
    if (isReceived) return 'received-keyring';
    if (isMine) return 'mine';
    return 'unknown';
}

function _sectionIds(isTemplate: boolean, isReceived: boolean, hasAudit: boolean): PipelinePackLibraryTabId[] {
    const ids: PipelinePackLibraryTabId[] = [];
    if (isTemplate) ids.push('templates');
    else if (isReceived) ids.push('received-keyrings');
    else ids.push('my-processes');
    if (hasAudit) ids.push('audit');
    return ids;
}

function _subtitle(pack: PackLite, meta: Record<string, unknown>, isTemplate: boolean, isReceived: boolean): string {
    if (isTemplate)
        return _firstText(meta.templateDescription, pack.description, 'Modelo pronto para criar um novo processo.');
    if (isReceived) {
        const keyring = _firstText(meta.keyringTitle, meta.courseTitle, meta.lessonTitle, meta.receivedFrom);
        return keyring ? `Veio de chaveiro ${keyring}.` : 'Recebido de uma aula ou chaveiro.';
    }
    return _firstText(pack.description, 'Processo salvo na sua biblioteca.');
}

function _actionLabel(status: PipelinePackLibraryStatus): string {
    if (status === 'template') return 'Usar modelo';
    if (status === 'needs-review' || status === 'blocked') return 'Revisar pendencias';
    return 'Abrir processo';
}

export function summarizePipelinePackLibraryNextAction(
    status: PipelinePackLibraryStatus,
    pendingCount = 0,
    firstPendingLabel = '',
): string {
    const first = _text(firstPendingLabel);
    if (status === 'template') return 'Usar este modelo para criar um novo processo.';
    if (status === 'ready') return 'Abrir este processo agora.';
    const noun = pendingCount === 1 ? 'pendencia' : 'pendencias';
    const prefix = status === 'blocked' ? 'Resolver' : 'Revisar';
    const suffix = first ? `: ${first}` : '.';
    return `${prefix} ${Math.max(1, pendingCount)} ${noun} antes de abrir${suffix}`;
}

function _sortKey(meta: Record<string, unknown>, pack: PackLite): string {
    const updated = _dateSort(_firstText(meta.lastOpenedAt, meta.updatedAt, meta.importedAt, meta.createdAt));
    return `${updated}|${pack.title}|${pack.id}`;
}

export function normalizePipelinePackLibraryItems(
    source: PipelinePackLibrarySource,
    options: PipelinePackLibraryOptions = {},
): PipelinePackLibraryItem[] {
    const currentUserId = _text(options.currentUserId);
    const maxPending = Math.max(1, Math.floor(Number(options.maxPendingLabels) || 3));
    const byId = new Map<string, PipelinePackLibraryItem>();
    for (const record of _recordsFromSource(source)) {
        const pack = _normalizePackLite(record);
        const meta = record.meta;
        const isTemplate = _isTemplate(meta);
        const isReceived = !isTemplate && _isReceived(meta, pack);
        const isMine = _isMine(meta, currentUserId);
        const pending = _pendingLabels(pack, meta);
        const hasAudit = pending.length > 0 || _bool(meta.audit) || _lower(meta.origin) === 'audit';
        const status = _status(pack, meta, pending, isTemplate);
        const origin = _origin(isTemplate, isReceived, isMine, hasAudit);
        const sectionIds = _sectionIds(isTemplate, isReceived, hasAudit);
        const warningLabels = _unique([...pack.warnings, ...pending]);
        const item: PipelinePackLibraryItem = {
            id: pack.id,
            title: pack.title,
            subtitle: _subtitle(pack, meta, isTemplate, isReceived),
            categories: pack.categories,
            categoryLabel: _categoryLabel(pack),
            templateLabel: _templateLabel(pack, isTemplate),
            libraryLabel: _libraryLabel(pack),
            versionLabel: `Versao ${pack.version}`,
            sourceLabel: _sourceLabel(pack, meta),
            ownerLabel: _ownerLabel(meta, currentUserId),
            updatedLabel: _dateLabel(_firstText(meta.lastOpenedAt, meta.updatedAt, meta.importedAt, meta.createdAt)),
            statsLabel: _statsLabel(pack),
            scoreLabel: _scoreLabel(pack),
            status,
            statusLabel: STATUS_LABELS[status],
            origin,
            sectionIds,
            pendingCount: pending.length,
            pendingLabels: pending.slice(0, maxPending),
            warningCount: warningLabels.length,
            warningLabels: warningLabels.slice(0, maxPending),
            actionLabel: _actionLabel(status),
            nextActionSummary: summarizePipelinePackLibraryNextAction(status, pending.length, pending[0]),
            sortKey: _sortKey(meta, pack),
        };
        byId.set(item.id, item);
    }
    return Array.from(byId.values()).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

function _tabItems(items: PipelinePackLibraryItem[], tabId: PipelinePackLibraryTabId): PipelinePackLibraryItem[] {
    return items.filter((item) => item.sectionIds.includes(tabId));
}

function _recommendationScore(item: PipelinePackLibraryItem, selectedPackId: string, anyProcess: boolean): number {
    let score = 0;
    if (selectedPackId && item.id === selectedPackId) score += 1000;
    if (item.status === 'needs-review') score += 320;
    if (item.status === 'blocked') score += 260;
    if (item.status === 'ready') score += 220;
    if (item.status === 'template') score += anyProcess ? 5 : 180;
    if (item.sectionIds.includes('my-processes')) score += 70;
    if (item.sectionIds.includes('received-keyrings')) score += 50;
    if (item.sectionIds.includes('audit')) score += 40;
    if (item.title.toLowerCase().includes('gac')) score += 15;
    return score;
}

function _recommendationReason(item: PipelinePackLibraryItem, selectedPackId: string): string {
    if (selectedPackId && item.id === selectedPackId) return 'Processo selecionado nesta entrada.';
    if (item.status === 'needs-review' || item.status === 'blocked') {
        return 'Ha pendencias claras para resolver antes de usar em aula.';
    }
    if (item.status === 'template') return 'Nao ha processos salvos; comece por este modelo.';
    if (item.sectionIds.includes('received-keyrings')) return 'Chaveiro recebido pronto para revisar.';
    if (item.title.toLowerCase().includes('gac')) return 'Processo de referencia GAC/DD38 disponivel.';
    return 'Processo pronto para abrir agora.';
}

function _recommendedSelection(
    items: PipelinePackLibraryItem[],
    options: PipelinePackLibraryOptions,
): PipelinePackLibraryRecommendation | null {
    if (items.length === 0) return null;
    const selectedPackId = _text(options.selectedPackId);
    const anyProcess = items.some((item) => item.status !== 'template');
    const ranked = items
        .map((item) => ({
            item,
            score: _recommendationScore(item, selectedPackId, anyProcess),
        }))
        .sort((a, b) => b.score - a.score || b.item.sortKey.localeCompare(a.item.sortKey));
    const best = ranked[0]?.item;
    if (!best) return null;
    return {
        packId: best.id,
        title: best.title,
        status: best.status,
        actionLabel: best.actionLabel,
        reason: _recommendationReason(best, selectedPackId),
    };
}

function _summary(items: PipelinePackLibraryItem[]): PipelinePackLibrarySummary {
    return {
        total: items.length,
        myProcesses: _tabItems(items, 'my-processes').length,
        receivedKeyrings: _tabItems(items, 'received-keyrings').length,
        templates: _tabItems(items, 'templates').length,
        audit: _tabItems(items, 'audit').length,
        ready: items.filter((item) => item.status === 'ready').length,
        needsReview: items.filter((item) => item.status === 'needs-review').length,
        blocked: items.filter((item) => item.status === 'blocked').length,
    };
}

export function buildPipelinePackLibraryViewModel(
    source: PipelinePackLibrarySource,
    options: PipelinePackLibraryOptions = {},
): PipelinePackLibraryViewModel {
    const items = normalizePipelinePackLibraryItems(source, options);
    const tabs = TAB_ORDER.map((id) => {
        const tabItems = _tabItems(items, id);
        return {
            id,
            label: TAB_LABELS[id],
            count: tabItems.length,
            items: tabItems,
            emptyState: TAB_EMPTY_STATES[id],
        };
    });
    return {
        isEmpty: items.length === 0,
        headline: 'Quais processos eu tenho?',
        tabs,
        items,
        summary: _summary(items),
        emptyState: LIBRARY_EMPTY_STATE,
        recommendedSelection: _recommendedSelection(items, options),
    };
}
