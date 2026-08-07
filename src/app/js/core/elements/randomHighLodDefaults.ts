// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost -- AGPL-3.0-only
//
// Random High-LOD Defaults -- curated per-family variants for random models.
import { MODEL_LIBRARY } from '../../config/model-library.js';
export const RANDOM_VIDEO_TECHNICAL_FAMILIES = Object.freeze([
    'site_project',
    'site_area',
    'site_zone',
    'boundary',
    'stratum',
    'building',
    'plume',
    'well',
    'tank',
    'river',
    'sample',
    'spring',
    'sensor',
    'infra_linear',
    'treatment_system',
    'effluent_point',
    'habitat',
]);
export const RANDOM_VIDEO_FAMILY_CURATION = Object.freeze({
    hero: Object.freeze(['well', 'plume', 'building', 'tank']),
    support: Object.freeze([
        'river',
        'sensor',
        'sample',
        'spring',
        'infra_linear',
        'treatment_system',
        'effluent_point',
        'habitat',
        'boundary',
        'stratum',
    ]),
    optionalSupport: Object.freeze(['lake', 'equipment', 'area', 'marker']),
    avoidByDefault: Object.freeze([
        'dam',
        'pit',
        'waste_stream',
        'emission_source',
        'individual',
        'vehicle',
        'atmosphere',
    ]),
});
export const RANDOM_HIGH_LOD_FAMILY_DEFAULTS = Object.freeze({
    well: Object.freeze({
        variantIds: Object.freeze(['well_hq']),
        strategy: 'fixed',
        tier: 'hq',
        reason: 'Monitoring wells are common hero objects and benefit from texture/detail.',
    }),
    river: Object.freeze({
        variantIds: Object.freeze(['river_hq']),
        strategy: 'fixed',
        tier: 'hq',
        requiresCompanionFamilies: Object.freeze([
            'spring',
            'sample',
            'sensor',
            'effluent_point',
            'habitat',
            'lake',
            'well',
            'plume',
            'building',
            'treatment_system',
        ]),
        minCompanionFamilyCount: 2,
        reason: 'Rivers only read well in hero shots when supported by monitoring, ecology, discharge, plume, or site context.',
    }),
    sensor: Object.freeze({
        variantIds: Object.freeze(['sensor_iot', 'sensor_station_hq']),
        strategy: 'cycle',
        tier: 'hq',
        reason: 'Sensors stay readable beside wells and layers when alternating compact IoT and station meshes.',
    }),
    building: Object.freeze({
        variantIds: Object.freeze(['building_warehouse_hq', 'building_commercial_office']),
        strategy: 'cycle',
        tier: 'hq',
        reason: 'Mid-mass industrial buildings preserve aerial readability without swallowing the transparent scene.',
    }),
    tank: Object.freeze({
        variantIds: Object.freeze(['tank_cylindrical_storage', 'tank_underground_storage']),
        strategy: 'cycle',
        tier: 'hq',
        reason: 'Support tank silhouettes read well near wells and plumes without dominating the frame.',
    }),
    pit: Object.freeze({
        variantIds: Object.freeze(['pit_hq', 'pit_rockpile', 'pit_hilltop_slope']),
        strategy: 'cycle',
        tier: 'hq',
        reason: 'Terrain-heavy pit variants add depth and break the flatness of generic excavation meshes.',
    }),
    plume: Object.freeze({
        variantIds: Object.freeze(['plume_default']),
        strategy: 'fixed',
        tier: 'hq',
        reason: 'The contamination plume is a hero layer in environmental storytelling and should stay readable.',
    }),
    lake: Object.freeze({
        variantIds: Object.freeze(['lake_natural']),
        strategy: 'fixed',
        tier: 'hq',
        reason: 'Natural water bodies read better in aerial and transparent scenes when the water mesh is detailed.',
    }),
    spring: Object.freeze({
        variantIds: Object.freeze(['spring_natural']),
        strategy: 'fixed',
        tier: 'hq',
        reason: 'Springs are small but visually important anchors in hydrogeology-oriented scenarios.',
    }),
    habitat: Object.freeze({
        variantIds: Object.freeze(['habitat_tree_hq', 'habitat_riparian_forest']),
        strategy: 'cycle',
        tier: 'hq',
        reason: 'Tree and riparian variants add natural context without introducing distracting fauna silhouettes.',
    }),
    sample: Object.freeze({
        variantIds: Object.freeze(['sample_point']),
        strategy: 'fixed',
        tier: 'hq',
        reason: 'Sampling points give environmental context and stay legible in close and medium tutorial shots.',
    }),
    effluent_point: Object.freeze({
        variantIds: Object.freeze(['effluent_discharge']),
        strategy: 'fixed',
        tier: 'hq',
        reason: 'Effluent discharge points connect the model to environmental workflow and read well near water bodies.',
    }),
    infra_linear: Object.freeze({
        variantIds: Object.freeze(['infra_pipeline', 'infra_valve']),
        strategy: 'cycle',
        tier: 'hq',
        reason: 'Piping assets add technical structure around the plant without the visual bulk of large site props.',
    }),
    treatment_system: Object.freeze({
        variantIds: Object.freeze(['treatment_oil_water_separator', 'treatment_septic_system']),
        strategy: 'cycle',
        tier: 'hq',
        reason: 'Treatment systems make the environmental story more concrete and fit naturally beside river and effluent beats.',
    }),
    equipment: Object.freeze({
        variantIds: Object.freeze([
            'equipment_electric_motor',
            'equipment_air_compressor',
            'equipment_diesel_generator',
        ]),
        strategy: 'cycle',
        tier: 'hq',
        reason: 'Compact industrial equipment enriches close shots when a scene needs more plant detail.',
    }),
    emission_source: Object.freeze({
        variantIds: Object.freeze(['emission_stack_hq']),
        strategy: 'fixed',
        tier: 'hq',
        reason: 'Emission stacks create clear industrial landmarks and read well in wide technical shots.',
    }),
    waste_stream: Object.freeze({
        variantIds: Object.freeze(['waste_tanker_truck', 'waste_haul_truck']),
        strategy: 'cycle',
        tier: 'hq',
        reason: 'Truck-based waste assets communicate industrial activity better than generic piles in random hero scenes.',
    }),
    dam: Object.freeze({
        variantIds: Object.freeze(['dam_hq']),
        strategy: 'fixed',
        tier: 'hq',
        reason: 'The texturized dam variant is visually strong and generic enough whenever the family is explicitly requested.',
    }),
    individual: Object.freeze({
        variantIds: Object.freeze(['individual_hq']),
        strategy: 'fixed',
        tier: 'hq',
        reason: 'People can add scale when the family is explicitly requested.',
    }),
});
function _normalizeFamilySet(selectedFamilies: any) {
    if (selectedFamilies instanceof Set) {
        return selectedFamilies.size ? new Set([...selectedFamilies].map(String).filter(Boolean)) : null;
    }
    if (Array.isArray(selectedFamilies)) {
        const normalized = selectedFamilies.map(String).filter(Boolean);
        return normalized.length ? new Set(normalized) : null;
    }
    return null;
}
function _normalizePolicy(policy: any, familyId: any) {
    if (!policy)
        return null;
    const variantIds = Array.isArray(policy.variantIds)
        ? policy.variantIds
        : policy.variantId
            ? [policy.variantId]
            : [];
    const validVariantIds = variantIds.filter((variantId: any) => {
        const entry = (MODEL_LIBRARY)[variantId];
        return entry?.family === familyId && entry?.isHq === true;
    }) as Record<string, any>;
    if (!validVariantIds.length)
        return null;
    return {
        familyId,
        variantIds: Object.freeze(validVariantIds),
        preferredVariantId: validVariantIds[0],
        strategy: policy.strategy === 'cycle' && validVariantIds.length > 1 ? 'cycle' : 'fixed',
        tier: policy.tier || 'hq',
        requiresCompanionFamilies: Object.freeze(Array.isArray(policy.requiresCompanionFamilies)
            ? policy.requiresCompanionFamilies.map(String).filter(Boolean)
            : []),
        minCompanionFamilyCount: Number.isFinite(Number(policy.minCompanionFamilyCount)) && Number(policy.minCompanionFamilyCount) > 0
            ? Math.floor(Number(policy.minCompanionFamilyCount))
            : 0,
        reason: policy.reason || '',
    };
}
function _countCompanionFamilies(policy: any, source: any, familyId: any) {
    if (!policy?.requiresCompanionFamilies?.length || !Array.isArray(source))
        return 0;
    const required = new Set(policy.requiresCompanionFamilies);
    const present = new Set();
    for (const element of source) {
        const companionFamily = String(element?.family || '');
        if (!companionFamily || companionFamily === familyId)
            continue;
        if (required.has(companionFamily))
            present.add(companionFamily);
    }
    return present.size;
}
function _isPolicyEligibleForSource(policy: any, source: any) {
    if (!policy?.minCompanionFamilyCount)
        return true;
    return _countCompanionFamilies(policy, source, policy.familyId) >= policy.minCompanionFamilyCount;
}
function _hashString(value: any) {
    let hash = 2166136261;
    const input = String(value || '');
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
export function listRandomHighLodFamilyDefaults() {
    return Object.entries(RANDOM_HIGH_LOD_FAMILY_DEFAULTS)
        .map(([familyId, policy]) => _normalizePolicy(policy, familyId))
        .filter(Boolean);
}
export function getRandomHighLodPolicyForFamily(familyId: any) {
    return familyId
        ? _normalizePolicy((RANDOM_HIGH_LOD_FAMILY_DEFAULTS as Record<string,any>)[familyId], familyId)
        : null;
}
export function getRandomHighLodVariantsForFamily(familyId: any) {
    return getRandomHighLodPolicyForFamily(familyId)?.variantIds || [];
}
export function getRandomHighLodVariantForFamily(
familyId: any, 
/** @type {{index?: number, seed?: any}} */ { index = 0, seed = null } = {}) {
    const policy = getRandomHighLodPolicyForFamily(familyId);
    if (!policy)
        return null;
    if (policy.strategy !== 'cycle' || policy.variantIds.length === 1) {
        return policy.preferredVariantId;
    }
    const offsetSeed = seed == null ? familyId : `${familyId}:${seed}`;
    const offset = _hashString(offsetSeed) % policy.variantIds.length;
    const normalizedIndex = Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0;
    return policy.variantIds[(offset + normalizedIndex) % policy.variantIds.length];
}
export function isRandomHighLodPolicyEligible(
familyId: any, 
{ elements }: any = {}) {
    const policy = getRandomHighLodPolicyForFamily(familyId);
    if (!policy)
        return false;
    return _isPolicyEligibleForSource(policy, Array.isArray(elements) ? elements : []);
}
export async function applyRandomHighLodDefaults(
{ selectedFamilies, elements }: any = {}) {
    const manager = await import('./manager.js' as string);
    const familySet = _normalizeFamilySet(selectedFamilies);
    const source = Array.isArray(elements) ? elements : manager.getAllElements();
    /** @type {Record<string, number>} */
    const familyCounts = {};
    /** @type {Record<string, number>} */
    const variantUsage = {};
    let appliedCount = 0;
    const buckets = new Map();
    for (const element of source) {
        if (!element?.id || !element.family)
            continue;
        if (familySet && !familySet.has(element.family))
            continue;
        if (!getRandomHighLodPolicyForFamily(element.family))
            continue;
        if (!buckets.has(element.family))
            buckets.set(element.family, []);
        buckets.get(element.family).push(element);
    }
    for (const [familyId, familyElements] of buckets.entries()) {
        const policy = getRandomHighLodPolicyForFamily(familyId);
        if (!policy)
            continue;
        if (!_isPolicyEligibleForSource(policy, source))
            continue;
        const sorted = [...familyElements].sort((left: any, right: any) => String(left.id).localeCompare(String(right.id)));
        for (let index = 0; index < sorted.length; index += 1) {
            const element = sorted[index];
            const variantId = getRandomHighLodVariantForFamily(familyId, {
                index,
                seed: policy.strategy === 'cycle' ? sorted[0]?.id || familyId : null,
            });
            if (!variantId)
                continue;
            const data = element.data || {};
            if (data.custom3DAsset)
                continue;
            if (data.modelVariantId === variantId)
                continue;
            data.modelVariantId = variantId;
            manager.updateElement(element.id, { data });
            manager.rebuildElementMesh(element.id);
            appliedCount += 1;
            (familyCounts as any)[familyId] = ((familyCounts as any)[familyId] || 0) + 1;
            (variantUsage as any)[variantId] = ((variantUsage as any)[variantId] || 0) + 1;
        }
    }
    return {
        appliedCount,
        families: Object.keys(familyCounts),
        familyCounts,
        variantUsage,
    };
}
