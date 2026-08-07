// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE <-> P&ID DIAGRAM BRIDGE

   Pure helper to read a serialized P&ID diagram and suggest project
   data bindings for Pipeline Packs. The P&ID editor remains the source
   for equipment, line and instrument tags; the pipeline remains the
   process, decision and provenance layer.
   ================================================================ */

import type {
    PipelineObservationLink,
    PipelineProjectDataBinding,
    PipelineProjectDataValueKind,
} from './pipelinePack.js';

export const PIPELINE_PID_DIAGRAM_BRIDGE_SOURCE = 'pid-diagram';
export const PIPELINE_PID_DIAGRAM_BRIDGE_VERSION = '1.0.0';
export const PIPELINE_PID_TAG_IDENTITY_PROPERTY_SET = 'ecbyts_TagIdentity';

export type PipelinePidBridgeConfidence = 'explicit' | 'tag-match' | 'inferred';
export type PipelinePidDigitalTwinFunctionalClass =
    | 'equipment'
    | 'instrumentation'
    | 'piping'
    | 'valve'
    | 'connection'
    | 'asset'
    | 'unknown';
export type PipelinePidDigitalTwinStatus = 'linked' | 'candidate' | 'missing-ifc' | 'missing-twin' | 'needs-review';

export interface PipelinePidDiagramBridgeOptions {
    defaultObservationStatus?: PipelineObservationLink['status'];
    createMissingObservationLinks?: boolean;
    sourceFileName?: string;
}

export interface PipelinePidBridgeSourceRef {
    sourceModuleId: typeof PIPELINE_PID_DIAGRAM_BRIDGE_SOURCE;
    sourceElementId: string;
    sourceElementType: string;
    sourceElementTag: string;
    sourcePath: string;
}

export interface PipelinePidProjectDataCandidate extends PipelineProjectDataBinding {
    bridgeVersion: typeof PIPELINE_PID_DIAGRAM_BRIDGE_VERSION;
    confidence: PipelinePidBridgeConfidence;
    reason: string;
    sourceRef: PipelinePidBridgeSourceRef;
}

export interface PipelinePidProjectDataSkippedItem {
    sourcePath: string;
    sourceElementId: string;
    reason: 'missing-id' | 'missing-tag' | 'missing-measurement' | 'unsupported-measurement';
}

export interface PipelinePidProjectDataBridgeSummary {
    bridgeVersion: typeof PIPELINE_PID_DIAGRAM_BRIDGE_VERSION;
    source: typeof PIPELINE_PID_DIAGRAM_BRIDGE_SOURCE;
    candidates: PipelinePidProjectDataCandidate[];
    projectDataBindings: PipelineProjectDataBinding[];
    digitalTwinBindings: PipelinePidDigitalTwinBinding[];
    skipped: PipelinePidProjectDataSkippedItem[];
    counts: {
        elements: number;
        connections: number;
        candidates: number;
        digitalTwinBindings: number;
        skipped: number;
        missingObservationLinks: number;
    };
}

export interface PipelinePidExternalIdentity {
    system: string;
    id: string;
    role: string;
}

export interface PipelinePidDigitalTwinBinding {
    id: string;
    bridgeVersion: typeof PIPELINE_PID_DIAGRAM_BRIDGE_VERSION;
    source: typeof PIPELINE_PID_DIAGRAM_BRIDGE_SOURCE;
    sourceRef: PipelinePidBridgeSourceRef;
    pidTag: string;
    pidElementId: string;
    pidElementType: string;
    functionalClass: PipelinePidDigitalTwinFunctionalClass;
    assetTag?: string;
    assetId?: string;
    ifcGlobalId?: string;
    ifcEntity: string;
    ifcElementId?: string;
    ifcPropertySetName: typeof PIPELINE_PID_TAG_IDENTITY_PROPERTY_SET;
    ifcPropertyNames: string[];
    bimSystem?: string;
    bimSpatialPath?: string;
    digitalTwinId?: string;
    twinElementId?: string;
    externalIds: PipelinePidExternalIdentity[];
    confidence: PipelinePidBridgeConfidence;
    status: PipelinePidDigitalTwinStatus;
    reason: string;
    recommendations: string[];
}

export interface PipelinePidDigitalTwinBridgeSummary {
    bridgeVersion: typeof PIPELINE_PID_DIAGRAM_BRIDGE_VERSION;
    source: typeof PIPELINE_PID_DIAGRAM_BRIDGE_SOURCE;
    bindings: PipelinePidDigitalTwinBinding[];
    counts: {
        elements: number;
        connections: number;
        bindings: number;
        linked: number;
        missingIfc: number;
        missingTwin: number;
        needsReview: number;
    };
    recommendations: string[];
}

type Rule = {
    id: string;
    valueKind: PipelineProjectDataValueKind;
    label: string;
    terms: string[];
    unitTerms: string[];
    valueKeys: string[];
};

const PARAMETER_RULES: Rule[] = [
    {
        id: 'ore-consumption-rate',
        valueKind: 'rate',
        label: 'Taxa de consumo de minerio',
        terms: ['rom', 'ore', 'minerio', 'minerio', 'feed', 'alimentacao', 'throughput', 'capacity', 'tonnage', 'tph'],
        unitTerms: ['t/h', 't/d', 'tpa', 'ktpa', 'mtpa', 'ton/h', 'ton/d'],
        valueKeys: ['oreConsumptionRate', 'oreRate', 'feedRate', 'throughput', 'capacity', 'massFlow', 'flowRate', 'rate', 'tonnage'],
    },
    {
        id: 'water',
        valueKind: 'water',
        label: 'Agua',
        terms: ['water', 'agua', 'make-up', 'reciclo', 'recycle'],
        unitTerms: ['m3/h', 'm3/d', 'm3/t', 'l/s'],
        valueKeys: ['waterRate', 'waterConsumption', 'waterMakeUp', 'waterRecycle', 'flowRate', 'rate'],
    },
    {
        id: 'energy',
        valueKind: 'energy',
        label: 'Energia',
        terms: ['energy', 'energia', 'power', 'potencia', 'motor'],
        unitTerms: ['kw', 'mw', 'kwh/t', 'kwh'],
        valueKeys: ['energyConsumption', 'specificEnergy', 'power', 'kw', 'mw', 'kwhPerTon'],
    },
    {
        id: 'granulometry',
        valueKind: 'number',
        label: 'Granulometria/P80',
        terms: ['p80', 'granulometria', 'granulometry', 'screen', 'sieve', 'size', 'particle'],
        unitTerms: ['um', 'micron', 'mm'],
        valueKeys: ['p80', 'particleSize', 'size', 'screenSize', 'cutSize'],
    },
    {
        id: 'recovery',
        valueKind: 'percentage',
        label: 'Recuperacao',
        terms: ['recovery', 'recuperacao', 'mass pull', 'teor', 'grade'],
        unitTerms: ['%'],
        valueKeys: ['recovery', 'recoveryRate', 'massPull', 'grade'],
    },
    {
        id: 'reagents',
        valueKind: 'list',
        label: 'Reagentes',
        terms: ['reagent', 'reagente', 'dosage', 'dosagem', 'ph', 'eh'],
        unitTerms: ['g/t', 'kg/t', 'ppm'],
        valueKeys: ['reagent', 'reagents', 'dosage', 'dose', 'ph', 'eh'],
    },
    {
        id: 'mass-balance',
        valueKind: 'mass',
        label: 'Balanco de massa',
        terms: ['mass balance', 'balanco de massa', 'massa', 'feed', 'concentrate', 'tailings'],
        unitTerms: ['t', 'kg', 't/h', 't/d'],
        valueKeys: ['mass', 'feedTonnage', 'concentrateTonnage', 'tailingsTonnage', 'tonnage'],
    },
    {
        id: 'tailings-route',
        valueKind: 'selection',
        label: 'Rota de rejeitos',
        terms: ['tailings', 'rejeito', 'barragem', 'paste', 'filtrado', 'dry stack', 'backfill'],
        unitTerms: [],
        valueKeys: ['tailingsRoute', 'tailings', 'destination', 'route'],
    },
];

const GENERIC_VALUE_KEYS = [
    'value',
    'valor',
    'measurement',
    'medicao',
    'measuredValue',
    'setpoint',
    'designValue',
    'nominalValue',
    'rate',
    'flowRate',
    'capacity',
    'throughput',
];

const PID_TAG_IDENTITY_PROPERTY_NAMES = [
    'pidTag',
    'assetTag',
    'assetId',
    'ifcGlobalId',
    'ifcElementId',
    'digitalTwinId',
    'twinElementId',
    'dexpiClass',
    'cfihosTagClass',
    'bsddUri',
];

const IFC_GLOBAL_ID_KEYS = ['ifcGlobalId', 'ifcGuid', 'globalId', 'ifcElementGlobalId'];
const IFC_ENTITY_KEYS = ['ifcEntity', 'ifcClass', 'ifcType'];
const IFC_ELEMENT_ID_KEYS = ['ifcElementId', 'ifcExpressId', 'ifcStepId', 'ifcLocalId'];
const ASSET_TAG_KEYS = ['assetTag', 'equipmentTag', 'instrumentTag', 'lineTag', 'tag'];
const ASSET_ID_KEYS = ['assetId', 'equipmentId', 'instrumentId', 'assetRegisterId'];
const DIGITAL_TWIN_ID_KEYS = ['digitalTwinId', 'twinId', 'dtId', 'dtwinId'];
const TWIN_ELEMENT_ID_KEYS = ['twinElementId', 'digitalTwinElementId', 'twinNodeId'];
const BIM_SYSTEM_KEYS = ['bimSystem', 'system', 'processSystem', 'ifcSystem'];
const BIM_SPATIAL_PATH_KEYS = ['bimSpatialPath', 'spatialPath', 'ifcSpatialPath', 'locationPath', 'location'];

function _asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function _text(value: unknown): string {
    return String(value ?? '').trim();
}

function _lower(value: unknown): string {
    return _text(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function _slug(value: unknown): string {
    return _lower(value)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 96);
}

function _firstText(...values: unknown[]): string {
    for (const value of values) {
        const text = _text(value);
        if (text) return text;
    }
    return '';
}

function _firstKnownValue(record: Record<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
        if (record[key] !== undefined && record[key] !== null && _text(record[key]) !== '') return record[key];
        const lowerKey = Object.keys(record).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
        if (lowerKey && record[lowerKey] !== undefined && record[lowerKey] !== null && _text(record[lowerKey]) !== '') {
            return record[lowerKey];
        }
    }
    return undefined;
}

function _items(diagram: unknown, key: string, aliases: string[]): unknown[] {
    const record = _asRecord(diagram);
    for (const candidate of [key, ...aliases]) {
        const value = record[candidate];
        if (Array.isArray(value)) return value;
    }
    return [];
}

function _mergedPayload(item: unknown): Record<string, unknown> {
    const root = _asRecord(item);
    return {
        ..._asRecord(root.props),
        ..._asRecord(root.attributes),
        ..._asRecord(root.data),
        ..._asRecord(root.metadata),
        ..._asRecord(root.moduleInputParams),
        ..._asRecord(root.targetParams),
        ...root,
    };
}

function _candidateText(payload: Record<string, unknown>): string {
    return [
        payload.id,
        payload.type,
        payload.category,
        payload.kind,
        payload.tag,
        payload.label,
        payload.name,
        payload.description,
        payload.parameterId,
        payload.measurementType,
        payload.measuredVariable,
        payload.unit,
        payload.basis,
    ].map(_lower).filter(Boolean).join(' ');
}

function _firstKnownText(record: Record<string, unknown>, keys: string[]): string {
    const value = _firstKnownValue(record, keys);
    return _text(value);
}

function _sameIdentity(a: string, b: string): boolean {
    return _slug(a) === _slug(b);
}

function _looksLikePidTag(value: unknown): boolean {
    const text = _text(value);
    if (!text) return false;
    return /^(?:[A-Za-z]{2,6}[-_ ]?\d|[A-Za-z][-_ ]\d)/.test(text);
}

function _pidTag(payload: Record<string, unknown>, sourceRef: PipelinePidBridgeSourceRef): string {
    const explicit = _firstText(
        payload.pidTag,
        payload.pAndIdTag,
        payload.pnidTag,
        payload.pIdTag,
        payload.tag,
        payload.assetTag,
        payload.equipmentTag,
        payload.instrumentTag,
        payload.lineTag,
    );
    if (explicit) return explicit;
    const label = _firstText(payload.label, payload.name);
    if (_looksLikePidTag(label)) return label;
    if (sourceRef.sourceElementTag !== sourceRef.sourceElementId && _looksLikePidTag(sourceRef.sourceElementTag)) {
        return sourceRef.sourceElementTag;
    }
    return '';
}

function _functionalClass(payload: Record<string, unknown>, sourceRef: PipelinePidBridgeSourceRef): PipelinePidDigitalTwinFunctionalClass {
    const typeText = _lower(_firstText(payload.type, payload.category, payload.kind, sourceRef.sourceElementType));
    const allText = `${typeText} ${_candidateText(payload)}`;
    if (/(^|\b)(signal|connector|connection|edge|association)(\b|$)/.test(allText)) return 'connection';
    if (/(^|\b)(pipe|piping|line|pipeline|duct|flowline)(\b|$)/.test(allText)) return 'piping';
    if (/(^|\b)(valve|damper|gate)(\b|$)/.test(allText)) return 'valve';
    if (/(^|\b)(instrument|controller|transmitter|sensor|analyzer|meter|fit|pit|lit|tit|ait|wit)(\b|$)/.test(allText)) {
        return 'instrumentation';
    }
    if (/(^|\b)(asset|equipment|pump|tank|vessel|crusher|mill|screen|thickener|filter|compressor|mixer|motor|conveyor|heat-exchanger|heat_exchanger)(\b|$)/.test(allText)) {
        return 'equipment';
    }
    return 'unknown';
}

function _suggestIfcEntity(payload: Record<string, unknown>, functionalClass: PipelinePidDigitalTwinFunctionalClass): string {
    const explicit = _firstKnownText(payload, IFC_ENTITY_KEYS);
    if (explicit) return explicit;
    if (functionalClass === 'connection') return 'IfcRelConnectsElements';
    return 'IfcAsset';
}

function _externalIdentities(payload: Record<string, unknown>): PipelinePidExternalIdentity[] {
    const entries: PipelinePidExternalIdentity[] = [];
    const add = (system: string, id: string, role: string) => {
        if (!id) return;
        const key = `${_lower(system)}::${_lower(role)}::${_lower(id)}`;
        if (entries.some((entry) => `${_lower(entry.system)}::${_lower(entry.role)}::${_lower(entry.id)}` === key)) return;
        entries.push({ system, id, role });
    };

    add('IFC', _firstKnownText(payload, IFC_GLOBAL_ID_KEYS), 'ifc-global-id');
    add('IFC', _firstKnownText(payload, IFC_ELEMENT_ID_KEYS), 'ifc-element-id');
    add('BIM', _firstKnownText(payload, ['bimElementId', 'modelElementId', 'revitId', 'navisworksId']), 'bim-element-id');
    add('DigitalTwin', _firstKnownText(payload, DIGITAL_TWIN_ID_KEYS), 'digital-twin-id');
    add('DigitalTwin', _firstKnownText(payload, TWIN_ELEMENT_ID_KEYS), 'twin-element-id');
    add('DEXPI', _firstKnownText(payload, ['dexpiId', 'dexpiClass', 'dexpiType']), 'pid-exchange-class');
    add('CFIHOS', _firstKnownText(payload, ['cfihosTagClass', 'cfihosEquipmentClass', 'cfihosClass']), 'handover-class');
    add('bSDD', _firstKnownText(payload, ['bsddUri', 'classificationUri', 'classificationId']), 'classification-reference');
    add('OPC-UA', _firstKnownText(payload, ['opcUaNodeId', 'opcNodeId']), 'operational-node');
    add('Historian', _firstKnownText(payload, ['historianTag', 'piTag', 'scadaTag']), 'telemetry-tag');

    return entries;
}

function _digitalTwinConfidence(
    payload: Record<string, unknown>,
    pidTag: string,
    assetTag: string,
): PipelinePidBridgeConfidence {
    if (
        _firstKnownText(payload, IFC_GLOBAL_ID_KEYS)
        || _firstKnownText(payload, DIGITAL_TWIN_ID_KEYS)
        || _firstKnownText(payload, ASSET_ID_KEYS)
    ) {
        return 'explicit';
    }
    if (pidTag && assetTag && _sameIdentity(pidTag, assetTag)) return 'tag-match';
    if (/^[A-Za-z]{1,5}[-_ ]?\d/.test(pidTag)) return 'tag-match';
    return 'inferred';
}

function _digitalTwinStatus(
    ifcGlobalId: string,
    ifcElementId: string,
    digitalTwinId: string,
    twinElementId: string,
    pidTag: string,
): PipelinePidDigitalTwinStatus {
    const hasIfc = !!(ifcGlobalId || ifcElementId);
    const hasTwin = !!(digitalTwinId || twinElementId);
    if (hasIfc && hasTwin) return 'linked';
    if (!pidTag) return 'needs-review';
    if (!hasIfc) return 'missing-ifc';
    if (!hasTwin) return 'missing-twin';
    return 'candidate';
}

function _digitalTwinRecommendations(binding: Pick<PipelinePidDigitalTwinBinding,
    'ifcGlobalId' | 'ifcElementId' | 'digitalTwinId' | 'twinElementId' | 'externalIds' | 'functionalClass'
>): string[] {
    const out: string[] = [];
    if (!binding.ifcGlobalId && !binding.ifcElementId) {
        out.push('Vincular IFC GlobalId ou identificador do elemento BIM ao tag P&ID.');
    }
    if (!binding.digitalTwinId && !binding.twinElementId) {
        out.push('Vincular digitalTwinId ou twinElementId para conectar o ativo ao espelho operacional.');
    }
    if (!binding.externalIds.some((entry) => entry.system === 'DEXPI')) {
        out.push('Informar classe DEXPI quando o P&ID vier de troca padronizada.');
    }
    if (!binding.externalIds.some((entry) => entry.system === 'CFIHOS')) {
        out.push('Informar classe CFIHOS para handover, tags e relacao tag-equipamento.');
    }
    if (binding.functionalClass === 'unknown') {
        out.push('Classificar o tipo do item para evitar mapeamento generico.');
    }
    return out;
}

function _scoreRule(rule: Rule, payload: Record<string, unknown>): number {
    const text = _candidateText(payload);
    const unit = _lower(_firstText(payload.unit, payload.units, payload.uom));
    const keyScore = rule.valueKeys.some((key) => _firstKnownValue(payload, [key]) !== undefined) ? 4 : 0;
    const unitScore = rule.unitTerms.some((term) => unit.includes(term)) ? 3 : 0;
    const termScore = rule.terms.filter((term) => text.includes(_lower(term))).length;
    return keyScore + unitScore + termScore;
}

function _inferRule(payload: Record<string, unknown>): { rule: Rule | null; confidence: PipelinePidBridgeConfidence; reason: string } {
    const explicitParameterId = _firstText(payload.parameterId, payload.pipelineParameterId, payload.projectDataParameterId);
    if (explicitParameterId) {
        const explicitRule = PARAMETER_RULES.find((rule) => rule.id === explicitParameterId);
        return {
            rule: explicitRule || {
                id: explicitParameterId,
                valueKind: _firstText(payload.valueKind) || 'text',
                label: _firstText(payload.parameterLabel, payload.label, explicitParameterId),
                terms: [],
                unitTerms: [],
                valueKeys: GENERIC_VALUE_KEYS,
            },
            confidence: 'explicit',
            reason: 'Parametro informado diretamente no P&ID',
        };
    }

    const scored = PARAMETER_RULES
        .map((rule) => ({ rule, score: _scoreRule(rule, payload) }))
        .sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best || best.score < 3) {
        return { rule: null, confidence: 'inferred', reason: 'Sem padrao suficiente para promover o tag a dado de projeto' };
    }
    return {
        rule: best.rule,
        confidence: 'inferred',
        reason: `Inferido por tag, unidade ou atributo de ${best.rule.label}`,
    };
}

function _readMeasuredValue(payload: Record<string, unknown>, rule: Rule): unknown {
    return _firstKnownValue(payload, [
        ...rule.valueKeys,
        ...GENERIC_VALUE_KEYS,
    ]);
}

function _readObservationLink(
    payload: Record<string, unknown>,
    sourceRef: PipelinePidBridgeSourceRef,
    options: PipelinePidDiagramBridgeOptions,
): PipelineObservationLink | undefined {
    const explicit = _firstText(
        payload.observationId,
        payload.observationRef,
        payload.observation,
        payload.obsId,
        payload.obsRef,
    );
    const label = _firstText(payload.observationLabel, payload.observationName, payload.obsLabel);
    if (explicit) {
        return {
            observationId: explicit,
            ...(label ? { label } : {}),
            sourceModuleId: PIPELINE_PID_DIAGRAM_BRIDGE_SOURCE,
            sourceElementId: sourceRef.sourceElementId,
            sourcePath: sourceRef.sourcePath,
            status: _firstText(payload.observationStatus, options.defaultObservationStatus, 'linked'),
        };
    }
    if (options.createMissingObservationLinks === false) return undefined;
    return {
        observationId: `pid-observation-${sourceRef.sourceElementId}`,
        label: label || `Observacao P&ID ${sourceRef.sourceElementTag || sourceRef.sourceElementId}`,
        sourceModuleId: PIPELINE_PID_DIAGRAM_BRIDGE_SOURCE,
        sourceElementId: sourceRef.sourceElementId,
        sourcePath: sourceRef.sourcePath,
        status: options.defaultObservationStatus || 'missing',
    };
}

function _sourceRef(payload: Record<string, unknown>, sourcePath: string): PipelinePidBridgeSourceRef | null {
    const sourceElementId = _firstText(payload.id, payload.elementId, payload.nodeId, payload.connectionId);
    if (!sourceElementId) return null;
    const sourceElementType = _firstText(payload.type, payload.category, payload.kind, 'unknown');
    const sourceElementTag = _firstText(payload.tag, payload.label, payload.name, sourceElementId);
    return {
        sourceModuleId: PIPELINE_PID_DIAGRAM_BRIDGE_SOURCE,
        sourceElementId,
        sourceElementType,
        sourceElementTag,
        sourcePath,
    };
}

function _normalizeValue(value: unknown): string | number | boolean {
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    return _text(value);
}

function _candidateFromItem(
    item: unknown,
    sourcePath: string,
    options: PipelinePidDiagramBridgeOptions,
): { candidate?: PipelinePidProjectDataCandidate; skipped?: PipelinePidProjectDataSkippedItem } {
    const payload = _mergedPayload(item);
    const sourceRef = _sourceRef(payload, sourcePath);
    if (!sourceRef) {
        return { skipped: { sourcePath, sourceElementId: '', reason: 'missing-id' } };
    }
    if (!sourceRef.sourceElementTag) {
        return { skipped: { sourcePath, sourceElementId: sourceRef.sourceElementId, reason: 'missing-tag' } };
    }
    const { rule, confidence, reason } = _inferRule(payload);
    if (!rule) {
        return { skipped: { sourcePath, sourceElementId: sourceRef.sourceElementId, reason: 'unsupported-measurement' } };
    }
    const measuredValue = _readMeasuredValue(payload, rule);
    const hasObservation = !!_firstText(payload.observationId, payload.observationRef, payload.observation, payload.obsId, payload.obsRef);
    if ((measuredValue === undefined || _text(measuredValue) === '') && !hasObservation) {
        return { skipped: { sourcePath, sourceElementId: sourceRef.sourceElementId, reason: 'missing-measurement' } };
    }

    const unit = _firstText(payload.unit, payload.units, payload.uom);
    const basis = _firstText(payload.basis, payload.base, payload.period, payload.context, payload.phase);
    const valueKind = _firstText(payload.valueKind, rule.valueKind) as PipelineProjectDataValueKind;
    const observationLink = _readObservationLink(payload, sourceRef, options);
    const sourceName = _firstText(options.sourceFileName, 'Editor de Diagramas P&ID');
    const id = _firstText(
        payload.projectDataId,
        payload.bindingId,
        `pid-project-data-${_slug(rule.id)}-${_slug(sourceRef.sourceElementId)}`,
    );

    return {
        candidate: {
            id,
            parameterId: rule.id,
            label: _firstText(payload.projectDataLabel, payload.parameterLabel, `${rule.label} - ${sourceRef.sourceElementTag}`),
            value: _normalizeValue(measuredValue ?? ''),
            ...(unit ? { unit } : {}),
            ...(basis ? { basis } : {}),
            valueKind,
            source: `${sourceName}: ${sourceRef.sourceElementType} ${sourceRef.sourceElementTag}`,
            status: measuredValue !== undefined && _text(measuredValue) !== '' ? 'review' : 'empty',
            ...(observationLink ? { observationLink } : {}),
            bridgeVersion: PIPELINE_PID_DIAGRAM_BRIDGE_VERSION,
            confidence,
            reason,
            sourceRef,
        },
    };
}

function _dedupeCandidates(candidates: PipelinePidProjectDataCandidate[]): PipelinePidProjectDataCandidate[] {
    const seen = new Set<string>();
    const out: PipelinePidProjectDataCandidate[] = [];
    for (const candidate of candidates) {
        const key = `${candidate.parameterId}::${candidate.sourceRef.sourceElementId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(candidate);
    }
    return out;
}

function _toProjectDataBinding(candidate: PipelinePidProjectDataCandidate): PipelineProjectDataBinding {
    return {
        id: candidate.id,
        parameterId: candidate.parameterId,
        label: candidate.label,
        value: candidate.value,
        ...(candidate.unit ? { unit: candidate.unit } : {}),
        ...(candidate.basis ? { basis: candidate.basis } : {}),
        ...(candidate.valueKind ? { valueKind: candidate.valueKind } : {}),
        ...(candidate.source ? { source: candidate.source } : {}),
        ...(candidate.status ? { status: candidate.status } : {}),
        ...(candidate.observationLink ? { observationLink: candidate.observationLink } : {}),
    };
}

type PidIdentityFields = {
    pidTag: string;
    assetTag: string;
    assetId: string;
    ifcGlobalId: string;
    ifcElementId: string;
    digitalTwinId: string;
    twinElementId: string;
};

function _extractIdentityFields(payload: Record<string, unknown>, sourceRef: PipelinePidBridgeSourceRef): PidIdentityFields {
    return {
        pidTag: _pidTag(payload, sourceRef),
        assetTag: _firstKnownText(payload, ASSET_TAG_KEYS),
        assetId: _firstKnownText(payload, ASSET_ID_KEYS),
        ifcGlobalId: _firstKnownText(payload, IFC_GLOBAL_ID_KEYS),
        ifcElementId: _firstKnownText(payload, IFC_ELEMENT_ID_KEYS),
        digitalTwinId: _firstKnownText(payload, DIGITAL_TWIN_ID_KEYS),
        twinElementId: _firstKnownText(payload, TWIN_ELEMENT_ID_KEYS),
    };
}

function _hasAnyIdentityField(fields: PidIdentityFields): boolean {
    return !!(
        fields.pidTag
        || fields.assetTag
        || fields.assetId
        || fields.ifcGlobalId
        || fields.ifcElementId
        || fields.digitalTwinId
        || fields.twinElementId
    );
}

type PidBindingCoreContext = {
    payload: Record<string, unknown>;
    sourceRef: PipelinePidBridgeSourceRef;
    fields: PidIdentityFields;
    functionalClass: PipelinePidDigitalTwinFunctionalClass;
    ifcEntity: string;
    externalIds: PipelinePidExternalIdentity[];
    status: PipelinePidDigitalTwinStatus;
};

function _buildDigitalTwinBindingId(context: PidBindingCoreContext): string {
    const { payload, fields, sourceRef } = context;
    return _firstText(
        payload.digitalTwinBindingId,
        payload.twinBindingId,
        `pid-digital-twin-${_slug(fields.pidTag || sourceRef.sourceElementId)}`,
    );
}

function _buildDigitalTwinBindingReason(status: PipelinePidDigitalTwinStatus): string {
    return status === 'linked'
        ? 'Tag P&ID ja possui identidade BIM/IFC e identificador de digital twin.'
        : 'Tag P&ID reconhecido; faltam vinculos para fechar a ponte P&ID -> BIM/IFC -> digital twin.';
}

function _buildDigitalTwinBindingCore(context: PidBindingCoreContext): PipelinePidDigitalTwinBinding {
    const { payload, sourceRef, fields, functionalClass, ifcEntity, externalIds, status } = context;
    const bimSystem = _firstKnownText(payload, BIM_SYSTEM_KEYS);
    const bimSpatialPath = _firstKnownText(payload, BIM_SPATIAL_PATH_KEYS);
    const binding: PipelinePidDigitalTwinBinding = {
        id: _buildDigitalTwinBindingId(context),
        bridgeVersion: PIPELINE_PID_DIAGRAM_BRIDGE_VERSION,
        source: PIPELINE_PID_DIAGRAM_BRIDGE_SOURCE,
        sourceRef,
        pidTag: fields.pidTag || sourceRef.sourceElementTag,
        pidElementId: sourceRef.sourceElementId,
        pidElementType: sourceRef.sourceElementType,
        functionalClass,
        ...(fields.assetTag ? { assetTag: fields.assetTag } : {}),
        ...(fields.assetId ? { assetId: fields.assetId } : {}),
        ...(fields.ifcGlobalId ? { ifcGlobalId: fields.ifcGlobalId } : {}),
        ifcEntity,
        ...(fields.ifcElementId ? { ifcElementId: fields.ifcElementId } : {}),
        ifcPropertySetName: PIPELINE_PID_TAG_IDENTITY_PROPERTY_SET,
        ifcPropertyNames: PID_TAG_IDENTITY_PROPERTY_NAMES,
        ...(bimSystem ? { bimSystem } : {}),
        ...(bimSpatialPath ? { bimSpatialPath } : {}),
        ...(fields.digitalTwinId ? { digitalTwinId: fields.digitalTwinId } : {}),
        ...(fields.twinElementId ? { twinElementId: fields.twinElementId } : {}),
        externalIds,
        confidence: _digitalTwinConfidence(payload, fields.pidTag, fields.assetTag),
        status,
        reason: _buildDigitalTwinBindingReason(status),
        recommendations: [],
    };
    binding.recommendations = _digitalTwinRecommendations(binding);
    return binding;
}

function _digitalTwinBindingFromItem(item: unknown, sourcePath: string): PipelinePidDigitalTwinBinding | null {
    const payload = _mergedPayload(item);
    const sourceRef = _sourceRef(payload, sourcePath);
    if (!sourceRef) return null;

    const fields = _extractIdentityFields(payload, sourceRef);
    if (!_hasAnyIdentityField(fields)) return null;

    const externalIds = _externalIdentities(payload);
    const functionalClass = _functionalClass(payload, sourceRef);
    const ifcEntity = _suggestIfcEntity(payload, functionalClass);
    const status = _digitalTwinStatus(
        fields.ifcGlobalId,
        fields.ifcElementId,
        fields.digitalTwinId,
        fields.twinElementId,
        fields.pidTag,
    );

    return _buildDigitalTwinBindingCore({
        payload,
        sourceRef,
        fields,
        functionalClass,
        ifcEntity,
        externalIds,
        status,
    });
}

function _dedupeDigitalTwinBindings(bindings: PipelinePidDigitalTwinBinding[]): PipelinePidDigitalTwinBinding[] {
    const seen = new Set<string>();
    const out: PipelinePidDigitalTwinBinding[] = [];
    for (const binding of bindings) {
        const key = [
            _slug(binding.pidTag),
            _slug(binding.ifcGlobalId || binding.ifcElementId),
            _slug(binding.digitalTwinId || binding.twinElementId),
            _slug(binding.pidElementId),
        ].join('::');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(binding);
    }
    return out;
}

function _summaryRecommendations(bindings: PipelinePidDigitalTwinBinding[]): string[] {
    const recommendations = new Set<string>();
    for (const binding of bindings) {
        binding.recommendations.forEach((recommendation) => recommendations.add(recommendation));
    }
    return [...recommendations];
}

export function summarizePipelinePidDigitalTwinBridge(
    diagram: unknown,
): PipelinePidDigitalTwinBridgeSummary {
    const elements = _items(diagram, 'elements', ['nodes', 'symbols']);
    const connections = _items(diagram, 'connections', ['edges', 'lines']);
    const bindings = _dedupeDigitalTwinBindings([
        ...elements.map((element, index) => _digitalTwinBindingFromItem(element, `elements.${index}`)),
        ...connections.map((connection, index) => _digitalTwinBindingFromItem(connection, `connections.${index}`)),
    ].filter((binding): binding is PipelinePidDigitalTwinBinding => !!binding));

    return {
        bridgeVersion: PIPELINE_PID_DIAGRAM_BRIDGE_VERSION,
        source: PIPELINE_PID_DIAGRAM_BRIDGE_SOURCE,
        bindings,
        counts: {
            elements: elements.length,
            connections: connections.length,
            bindings: bindings.length,
            linked: bindings.filter((binding) => binding.status === 'linked').length,
            missingIfc: bindings.filter((binding) => !binding.ifcGlobalId && !binding.ifcElementId).length,
            missingTwin: bindings.filter((binding) => !binding.digitalTwinId && !binding.twinElementId).length,
            needsReview: bindings.filter((binding) => binding.status === 'needs-review').length,
        },
        recommendations: _summaryRecommendations(bindings),
    };
}

export function inferPipelineDigitalTwinLinksFromPidDiagram(diagram: unknown): PipelinePidDigitalTwinBinding[] {
    return summarizePipelinePidDigitalTwinBridge(diagram).bindings;
}

export function summarizePipelinePidProjectDataBridge(
    diagram: unknown,
    options: PipelinePidDiagramBridgeOptions = {},
): PipelinePidProjectDataBridgeSummary {
    const elements = _items(diagram, 'elements', ['nodes', 'symbols']);
    const connections = _items(diagram, 'connections', ['edges', 'lines']);
    const candidates: PipelinePidProjectDataCandidate[] = [];
    const skipped: PipelinePidProjectDataSkippedItem[] = [];

    elements.forEach((element, index) => {
        const result = _candidateFromItem(element, `elements.${index}`, options);
        if (result.candidate) candidates.push(result.candidate);
        if (result.skipped) skipped.push(result.skipped);
    });
    connections.forEach((connection, index) => {
        const result = _candidateFromItem(connection, `connections.${index}`, options);
        if (result.candidate) candidates.push(result.candidate);
        if (result.skipped) skipped.push(result.skipped);
    });

    const deduped = _dedupeCandidates(candidates);
    const digitalTwinBindings = summarizePipelinePidDigitalTwinBridge(diagram).bindings;
    return {
        bridgeVersion: PIPELINE_PID_DIAGRAM_BRIDGE_VERSION,
        source: PIPELINE_PID_DIAGRAM_BRIDGE_SOURCE,
        candidates: deduped,
        projectDataBindings: deduped.map(_toProjectDataBinding),
        digitalTwinBindings,
        skipped,
        counts: {
            elements: elements.length,
            connections: connections.length,
            candidates: deduped.length,
            digitalTwinBindings: digitalTwinBindings.length,
            skipped: skipped.length,
            missingObservationLinks: deduped.filter((candidate) => candidate.observationLink?.status === 'missing').length,
        },
    };
}

export function inferPipelineProjectDataFromPidDiagram(
    diagram: unknown,
    options: PipelinePidDiagramBridgeOptions = {},
): PipelineProjectDataBinding[] {
    return summarizePipelinePidProjectDataBridge(diagram, options).projectDataBindings;
}
