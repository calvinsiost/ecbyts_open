// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   PROJECT MANAGER — CRUD, Gantt, Resources, Allocations
   Gerenciador de projetos ambientais com cronograma,
   recursos humanos e alocacao.

   ENTIDADES:
   - Projeto: Cronograma, fases, dependencias, milestones
   - Recurso: Membro da equipe com nivel e disponibilidade (LGPD)
   - Alocacao: Vinculacao de recurso a fase de projeto

   TIPOS DE PROJETO:
   - remediation: Remediacao ambiental
   - monitoring: Monitoramento periodico
   - investigation: Investigacao ambiental
   - decommissioning: Descomissionamento
   - custom: Projeto generico

   ALGORITMOS:
   - Critical Path Method (CPM): Forward + backward pass, float=0 = critico
   - Kahn's Algorithm: Deteccao de ciclos em dependencias (DAG validation)
   - Load Calculation: Alocacao cruzada entre projetos
   ================================================================ */

import { generateId } from '../helpers/id.js';
import { idbSet, idbGetWithLegacy } from '../storage/idbStore.js';
// Adopt own pure helpers (Module C extraction commit 5bdb8701) — CPM + Kahn.
import {
    detectPhaseCycle,
    computeCriticalPath,
} from './_projectSchedulePure.js';

/** @typedef {Record<string, any>} AnyRecord */
/** @typedef {AnyRecord & {id: string, dates: AnyRecord, phases: Array<any>, linkedContractIds: Array<string>, linkedWbsRootIds: Array<string>, linkedMacMeasureIds: Array<string>, linkedCampaignIds: Array<string>, linkedElementIds: Array<string>}} ProjectRecord */

// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------

const IDB_KEY_PROJECTS = 'ecbyts-gov-projects';
const IDB_KEY_RESOURCES = 'ecbyts-gov-resources';
const IDB_KEY_ALLOCATIONS = 'ecbyts-gov-allocations';
const IDB_KEY_TIMESHEETS = 'ecbyts-gov-timesheets';

/** @type {Array<any>} */
let projects: any = [];

/** @type {Array<any>} Pool global de recursos (cross-projeto) */
let resources: any = [];

/** @type {Array<any>} Alocacoes recurso→fase (cross-projeto) */
let allocations: any = [];

/** @type {Array<any>} Timesheet entries */
let timesheets: any = [];

let _loaded = false;

/** @type {ReturnType<typeof setTimeout>|null} */
let _saveTimer: any = null;

// ----------------------------------------------------------------
// PERSISTENCE - IDB (debounced, fire-and-forget)
// ----------------------------------------------------------------

function _save() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
        idbSet(
            IDB_KEY_PROJECTS,
            projects.map((p: any) => ({ ...p })),
        ).catch((_e: any) => console.debug('[utils/governance/projectManager:silent-catch]', _e?.message || _e));
        idbSet(
            IDB_KEY_RESOURCES,
            resources.map((r: any) => ({ ...r })),
        ).catch((_e: any) => console.debug('[utils/governance/projectManager:silent-catch]', _e?.message || _e));
        idbSet(
            IDB_KEY_ALLOCATIONS,
            allocations.map((a: any) => ({ ...a })),
        ).catch((_e: any) => console.debug('[utils/governance/projectManager:silent-catch]', _e?.message || _e));
        idbSet(
            IDB_KEY_TIMESHEETS,
            timesheets.map((t: any) => ({ ...t })),
        ).catch((_e: any) => console.debug('[utils/governance/projectManager:silent-catch]', _e?.message || _e));
    }, 300);
}

/**
 * Load project data from IDB on startup.
 * @returns {Promise<void>}
 */
export async function loadProjects() {
    if (_loaded) return;
    const p = await idbGetWithLegacy(IDB_KEY_PROJECTS);
    if (Array.isArray(p) && p.length > 0) projects = p;
    const r = await idbGetWithLegacy(IDB_KEY_RESOURCES);
    if (Array.isArray(r) && r.length > 0) resources = r;
    const a = await idbGetWithLegacy(IDB_KEY_ALLOCATIONS);
    if (Array.isArray(a) && a.length > 0) allocations = a;
    const t = await idbGetWithLegacy(IDB_KEY_TIMESHEETS);
    if (Array.isArray(t) && t.length > 0) timesheets = t;
    _loaded = true;
}

// ----------------------------------------------------------------
// PROJECT CRUD
// ----------------------------------------------------------------

/**
 * Add a new project.
 * Adiciona novo projeto ambiental.
 *
 * @param {AnyRecord} data - Project data
 * @returns {ProjectRecord} - Created project
 */
export function addProject(data: any = {}) {
    const project = (({
        id: data.id || generateId('project'),
        name: data.name || 'New Project',
        type: data.type || 'custom',
        status: data.status || 'planning',
        description: data.description || '',
        dates: {
            startDate: data.dates?.startDate || '',
            endDate: data.dates?.endDate || '',
        },
        phases: data.phases || [],
        linkedContractIds: data.linkedContractIds || [],
        linkedWbsRootIds: data.linkedWbsRootIds || [],
        linkedMacMeasureIds: data.linkedMacMeasureIds || [],
        linkedCampaignIds: data.linkedCampaignIds || [],
        linkedElementIds: data.linkedElementIds || [],
        timesheetDailyTargetHours: _normalizeProjectDailyTargetHours(data.timesheetDailyTargetHours),
        notes: data.notes || '',
        costCenterId: data.costCenterId || null,
        createdAt: data.createdAt || new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
    }) as any);

    projects.push(project);
    _save();
    return project;
}

/**
 * Update an existing project.
 * Atualiza projeto existente.
 *
 * @param {string} id - Project ID
 * @param {AnyRecord} updates - Fields to update
 * @returns {AnyRecord|null} - Updated project or null
 */
export function updateProject(id: any, updates: any) {
    const project = projects.find((p: any) => p.id === id);
    if (!project) return null;

    for (const [key, value] of Object.entries(updates)) {
        if (key === 'dates') {
            Object.assign(project.dates, value);
        } else if (key !== 'id' && key !== 'createdAt') {
            project[key] = value;
        }
    }

    project.modifiedAt = new Date().toISOString();
    _save();
    return project;
}

/**
 * Remove a project and its allocations.
 * Remove projeto e alocacoes associadas.
 *
 * @param {string} id - Project ID
 * @returns {boolean}
 */
/**
 * Clear all projects, resources and allocations.
 * Remove todos os projetos, recursos e alocacoes.
 */
export function clearProjects() {
    projects = [];
    resources = [];
    allocations = [];
    timesheets = [];
    _save();
    _emitTimesheetsChanged({ reason: 'clear' });
}

/**
 * @param {string} id - Project ID
 * @returns {boolean}
 */
export function removeProject(id: any) {
    const idx = projects.findIndex((p: any) => p.id === id);
    if (idx === -1) return false;

    // Remove alocacoes vinculadas ao projeto
    allocations = allocations.filter((a: any) => a.projectId !== id);
    timesheets = timesheets.filter((e: any) => e.projectId !== id);

    projects.splice(idx, 1);
    _save();
    _emitTimesheetsChanged({ reason: 'project_removed', projectId: id });
    return true;
}

/**
 * Get all projects.
 * @returns {Array<any>}
 */
export function getProjects() {
    return projects;
}

/**
 * Get a project by ID.
 * @param {string} id
 * @returns {ProjectRecord|null}
 */
export function getProject(id: any) {
    return projects.find((p: any) => p.id === id) || null;
}

// ----------------------------------------------------------------
// PHASE MANAGEMENT
// ----------------------------------------------------------------

/**
 * Add a phase to a project.
 * Adiciona fase ao cronograma do projeto.
 *
 * @param {string} projectId
 * @param {AnyRecord} phase - Phase data
 * @returns {AnyRecord|null} - Created phase
 */
export function addPhase(projectId: any, phase: any = {}) {
    const project = getProject(projectId);
    if (!project) return null;

    const newPhase = {
        id: phase.id || generateId('phase'),
        name: phase.name || 'New Phase',
        startDate: phase.startDate || project.dates.startDate || '',
        endDate: phase.endDate || project.dates.endDate || '',
        percentComplete: phase.percentComplete || 0,
        color: phase.color || '#3b6bff',
        isMilestone: phase.isMilestone || false,
        dependencies: phase.dependencies || [],
        linkedWbsItemId: phase.linkedWbsItemId || null,
    };

    project.phases.push(newPhase);
    project.modifiedAt = new Date().toISOString();
    _save();
    return newPhase;
}

/**
 * Update a phase in a project.
 * @param {string} projectId
 * @param {string} phaseId
 * @param {AnyRecord} updates
 * @returns {AnyRecord|null}
 */
export function updatePhase(projectId: any, phaseId: any, updates: any) {
    const project = getProject(projectId);
    if (!project) return null;

    const phase = project.phases.find((p: any) => p.id === phaseId);
    if (!phase) return null;

    for (const [key, value] of Object.entries(updates)) {
        if (key !== 'id') {
            phase[key] = value;
        }
    }

    project.modifiedAt = new Date().toISOString();
    _save();
    return phase;
}

/**
 * Remove a phase from a project.
 * Remove fase e limpa dependencias orfas.
 *
 * @param {string} projectId
 * @param {string} phaseId
 * @returns {boolean}
 */
export function removePhase(projectId: any, phaseId: any) {
    const project = getProject(projectId);
    if (!project) return false;

    const idx = project.phases.findIndex((p: any) => p.id === phaseId);
    if (idx === -1) return false;

    project.phases.splice(idx, 1);

    // Limpa referencias de dependencia orfas
    for (const phase of project.phases) {
        const depIdx = phase.dependencies.indexOf(phaseId);
        if (depIdx !== -1) {
            phase.dependencies.splice(depIdx, 1);
        }
    }

    // Remove alocacoes da fase
    allocations = allocations.filter((a: any) => a.phaseId !== phaseId);
    timesheets = timesheets.filter((e: any) => e.phaseId !== phaseId);

    project.modifiedAt = new Date().toISOString();
    _save();
    _emitTimesheetsChanged({ reason: 'phase_removed', projectId, phaseId });
    return true;
}

// ----------------------------------------------------------------
// DEPENDENCY MANAGEMENT (DAG validation)
// ----------------------------------------------------------------

/**
 * Add a dependency (finish-to-start) between phases.
 * Valida DAG com Kahn's algorithm antes de aceitar.
 *
 * @param {string} projectId
 * @param {string} phaseId - Fase dependente (successor)
 * @param {string} depPhaseId - Fase predecessora
 * @returns {{ ok: boolean, error?: string }}
 */
export function addPhaseDependency(projectId: any, phaseId: any, depPhaseId: any) {
    const project = getProject(projectId);
    if (!project) return { ok: false, error: 'project_not_found' };

    if (phaseId === depPhaseId) return { ok: false, error: 'self_dependency' };

    const phase = project.phases.find((p: any) => p.id === phaseId);
    const depPhase = project.phases.find((p: any) => p.id === depPhaseId);
    if (!phase || !depPhase) return { ok: false, error: 'phase_not_found' };

    if (phase.dependencies.includes(depPhaseId)) {
        return { ok: false, error: 'duplicate' };
    }

    // Testa DAG temporariamente adicionando a dependencia
    phase.dependencies.push(depPhaseId);
    const hasCycle = detectPhaseCycle(project.phases);

    if (hasCycle) {
        phase.dependencies.pop(); // Reverte
        return { ok: false, error: 'cycle_detected' };
    }

    project.modifiedAt = new Date().toISOString();
    _save();
    return { ok: true };
}

/**
 * Remove a dependency between phases.
 * @param {string} projectId
 * @param {string} phaseId
 * @param {string} depPhaseId
 * @returns {boolean}
 */
export function removePhaseDependency(projectId: any, phaseId: any, depPhaseId: any) {
    const project = getProject(projectId);
    if (!project) return false;

    const phase = project.phases.find((p: any) => p.id === phaseId);
    if (!phase) return false;

    const idx = phase.dependencies.indexOf(depPhaseId);
    if (idx === -1) return false;

    phase.dependencies.splice(idx, 1);
    project.modifiedAt = new Date().toISOString();
    _save();
    return true;
}

// _detectCycle removed — substituído por detectPhaseCycle de _projectSchedulePure.

// ----------------------------------------------------------------
// CRITICAL PATH METHOD (CPM)
// ----------------------------------------------------------------

/**
 * Calculate critical path for a project.
 * Calcula caminho critico usando CPM (forward + backward pass).
 *
 * @param {string} projectId
 * @returns {Set<string>} Set of phase IDs on the critical path
 */
export function calculateCriticalPath(projectId: any) {
    const project = getProject(projectId);
    if (!project || project.phases.length === 0) return new Set();
    // Delega CPM (forward+backward pass + float) para _projectSchedulePure.
    return computeCriticalPath(project.phases);
}

// _topologicalSort removed — substituído por topologicalSortPhases de _projectSchedulePure
// (usado internamente por computeCriticalPath).

// ----------------------------------------------------------------
// LINK MANAGEMENT
// ----------------------------------------------------------------

/**
 * Link a contract to a project.
 * @param {string} projectId
 * @param {string} contractId
 */
export function linkContract(projectId: any, contractId: any) {
    const project = getProject(projectId);
    if (!project) return;
    if (!project.linkedContractIds.includes(contractId)) {
        project.linkedContractIds.push(contractId);
        project.modifiedAt = new Date().toISOString();
        _save();
    }
}

/** @param {string} projectId @param {string} contractId */
export function unlinkContract(projectId: any, contractId: any) {
    const project = getProject(projectId);
    if (!project) return;
    const idx = project.linkedContractIds.indexOf(contractId);
    if (idx !== -1) {
        project.linkedContractIds.splice(idx, 1);
        project.modifiedAt = new Date().toISOString();
        _save();
    }
}

/** @param {string} projectId @param {string} wbsId */
export function linkWbsRoot(projectId: any, wbsId: any) {
    const project = getProject(projectId);
    if (!project) return;
    if (!project.linkedWbsRootIds.includes(wbsId)) {
        project.linkedWbsRootIds.push(wbsId);
        project.modifiedAt = new Date().toISOString();
        _save();
    }
}

/** @param {string} projectId @param {string} wbsId */
export function unlinkWbsRoot(projectId: any, wbsId: any) {
    const project = getProject(projectId);
    if (!project) return;
    const idx = project.linkedWbsRootIds.indexOf(wbsId);
    if (idx !== -1) {
        project.linkedWbsRootIds.splice(idx, 1);
        project.modifiedAt = new Date().toISOString();
        _save();
    }
}

/** @param {string} projectId @param {string} measureId */
export function linkMacMeasure(projectId: any, measureId: any) {
    const project = getProject(projectId);
    if (!project) return;
    if (!project.linkedMacMeasureIds.includes(measureId)) {
        project.linkedMacMeasureIds.push(measureId);
        project.modifiedAt = new Date().toISOString();
        _save();
    }
}

/** @param {string} projectId @param {string} measureId */
export function unlinkMacMeasure(projectId: any, measureId: any) {
    const project = getProject(projectId);
    if (!project) return;
    const idx = project.linkedMacMeasureIds.indexOf(measureId);
    if (idx !== -1) {
        project.linkedMacMeasureIds.splice(idx, 1);
        project.modifiedAt = new Date().toISOString();
        _save();
    }
}

/** @param {string} projectId @param {string} campaignId */
export function linkCampaign(projectId: any, campaignId: any) {
    const project = getProject(projectId);
    if (!project) return;
    if (!project.linkedCampaignIds.includes(campaignId)) {
        project.linkedCampaignIds.push(campaignId);
        project.modifiedAt = new Date().toISOString();
        _save();
    }
}

/** @param {string} projectId @param {string} campaignId */
export function unlinkCampaign(projectId: any, campaignId: any) {
    const project = getProject(projectId);
    if (!project) return;
    const idx = project.linkedCampaignIds.indexOf(campaignId);
    if (idx !== -1) {
        project.linkedCampaignIds.splice(idx, 1);
        project.modifiedAt = new Date().toISOString();
        _save();
    }
}

/** @param {string} projectId @param {string} elementId */
export function linkElement(projectId: any, elementId: any) {
    const project = getProject(projectId);
    if (!project) return;
    if (!project.linkedElementIds.includes(elementId)) {
        project.linkedElementIds.push(elementId);
        project.modifiedAt = new Date().toISOString();
        _save();
    }
}

/** @param {string} projectId @param {string} elementId */
export function unlinkElement(projectId: any, elementId: any) {
    const project = getProject(projectId);
    if (!project) return;
    const idx = project.linkedElementIds.indexOf(elementId);
    if (idx !== -1) {
        project.linkedElementIds.splice(idx, 1);
        project.modifiedAt = new Date().toISOString();
        _save();
    }
}

// ----------------------------------------------------------------
// RESOURCE MANAGEMENT (Global pool - LGPD)
// ----------------------------------------------------------------

/**
 * Add a resource (team member).
 * Adiciona recurso ao pool global. Requer consentimento LGPD.
 *
 * @param {AnyRecord} data
 * @returns {AnyRecord} - Created resource
 */
export function addResource(data: any = {}) {
    const resource = {
        id: data.id || generateId('resource'),
        name: data.consentGiven ? data.name || '' : 'Anonymous',
        role: data.role || '',
        level: data.level || 'mid',
        email: data.consentGiven ? data.email || '' : '',
        hoursPerWeek: data.hoursPerWeek || 40,
        costPerHour: data.costPerHour || 0,
        consentGiven: data.consentGiven || false,
        consentDate: data.consentGiven ? new Date().toISOString() : null,
        consentPurpose: 'Gerenciamento de alocacao de recursos em projetos ambientais',
        consentWithdrawn: false,
        active: data.active !== undefined ? data.active : true,
    };

    resources.push(resource);
    _save();
    return resource;
}

/**
 * Update a resource.
 * @param {string} id
 * @param {AnyRecord} updates
 * @returns {AnyRecord|null}
 */
export function updateResource(id: any, updates: any) {
    const resource = resources.find((r: any) => r.id === id);
    if (!resource) return null;

    for (const [key, value] of Object.entries(updates)) {
        if (key !== 'id' && key !== 'consentPurpose') {
            resource[key] = value;
        }
    }

    _save();
    return resource;
}

/**
 * Remove a resource and its allocations.
 * @param {string} id
 * @returns {boolean}
 */
export function removeResource(id: any) {
    const idx = resources.findIndex((r: any) => r.id === id);
    if (idx === -1) return false;

    allocations = allocations.filter((a: any) => a.resourceId !== id);
    timesheets = timesheets.filter((e: any) => e.resourceId !== id);
    resources.splice(idx, 1);
    _save();
    _emitTimesheetsChanged({ reason: 'resource_removed', resourceId: id });
    return true;
}

/**
 * Anonymize a resource (LGPD).
 * Remove dados pessoais mantendo alocacoes.
 *
 * @param {string} id
 * @returns {AnyRecord|null}
 */
export function anonymizeResource(id: any) {
    const resource = resources.find((r: any) => r.id === id);
    if (!resource) return null;

    resource.name = `Resource-${resource.id.slice(-4)}`;
    resource.email = '';
    resource.consentWithdrawn = true;
    resource.consentGiven = false;
    return resource;
}

/**
 * Withdraw consent (LGPD Art. 7-10).
 * Revoga consentimento - anonimiza dados pessoais.
 *
 * @param {string} id
 * @returns {AnyRecord|null}
 */
export function withdrawConsent(id: any) {
    return anonymizeResource(id);
}

/**
 * Get all resources.
 * @returns {Array<any>}
 */
export function getResources() {
    return resources;
}

/**
 * Get a resource by ID.
 * @param {string} id
 * @returns {AnyRecord|null}
 */
export function getResource(id: any) {
    return resources.find((r: any) => r.id === id) || null;
}

// ----------------------------------------------------------------
// ALLOCATION MANAGEMENT
// ----------------------------------------------------------------

/**
 * Add an allocation (resource → phase).
 * Valida datas dentro do range da fase (DA-8).
 *
 * @param {AnyRecord} data
 * @returns {AnyRecord|null} - Created allocation or null if invalid
 */
export function addAllocation(data: any = {}) {
    // Valida existencia de fase
    let phaseObj = null;
    for (const proj of projects) {
        phaseObj = proj.phases.find((p: any) => p.id === data.phaseId);
        if (phaseObj) break;
    }

    const allocation = {
        id: data.id || generateId('alloc'),
        resourceId: data.resourceId || '',
        projectId: data.projectId || '',
        phaseId: data.phaseId || '',
        hoursPerDay: data.hoursPerDay || 8,
        startDate: data.startDate || phaseObj?.startDate || '',
        endDate: data.endDate || phaseObj?.endDate || '',
        notes: data.notes || '',
    };

    // DA-8: Valida datas dentro do range da fase
    if (phaseObj && allocation.startDate && allocation.endDate) {
        if (phaseObj.startDate && allocation.startDate < phaseObj.startDate) {
            allocation.startDate = phaseObj.startDate;
        }
        if (phaseObj.endDate && allocation.endDate > phaseObj.endDate) {
            allocation.endDate = phaseObj.endDate;
        }
    }

    allocations.push(allocation);
    _save();
    return allocation;
}

/**
 * Update an allocation.
 * @param {string} id
 * @param {AnyRecord} updates
 * @returns {AnyRecord|null}
 */
export function updateAllocation(id: any, updates: any) {
    const allocation = allocations.find((a: any) => a.id === id);
    if (!allocation) return null;

    for (const [key, value] of Object.entries(updates)) {
        if (key !== 'id') {
            allocation[key] = value;
        }
    }

    return allocation;
}

/**
 * Remove an allocation.
 * @param {string} id
 * @returns {boolean}
 */
export function removeAllocation(id: any) {
    const idx = allocations.findIndex((a: any) => a.id === id);
    if (idx === -1) return false;
    allocations.splice(idx, 1);
    _save();
    return true;
}

/**
 * Get allocations for a resource in a period.
 * @param {string} resourceId
 * @param {string} [startDate]
 * @param {string} [endDate]
 * @returns {Array<any>}
 */
export function getAllocationsForResource(resourceId: any, startDate: any, endDate: any) {
    return allocations.filter((a: any) => {
        if (a.resourceId !== resourceId) return false;
        if (startDate && a.endDate && a.endDate < startDate) return false;
        if (endDate && a.startDate && a.startDate > endDate) return false;
        return true;
    });
}

/**
 * Get allocations for a phase.
 * @param {string} phaseId
 * @returns {Array<any>}
 */
export function getAllocationsForPhase(phaseId: any) {
    return allocations.filter((a: any) => a.phaseId === phaseId);
}

/**
 * Get all allocations.
 * @returns {Array<any>}
 */
export function getAllocations() {
    return allocations;
}

// ----------------------------------------------------------------
// LOAD CALCULATION
// ----------------------------------------------------------------

/**
 * Calculate resource load for a period.
 * Calcula carga de trabalho cross-projeto.
 *
 * @param {string} resourceId
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @param {'hour'|'day'|'week'|'month'|'year'} granularity
 * @returns {Array<{period: string, allocated: number, capacity: number, loadPct: number}>}
 */
export function getResourceLoad(resourceId: any, startDate: any, endDate: any, granularity = 'week') {
    const resource = getResource(resourceId);
    if (!resource) return [];

    const periods = _generatePeriods(startDate, endDate, granularity);
    const resAllocs = getAllocationsForResource(resourceId, startDate, endDate);
    const capacityPerDay = resource.hoursPerWeek / 5;

    return periods.map((period: any) => {
        let allocated = 0;
        for (const alloc of resAllocs) {
            const overlap = _getOverlapDays(alloc.startDate, alloc.endDate, period.start, period.end);
            if (overlap > 0) {
                allocated += alloc.hoursPerDay * overlap;
            }
        }

        const periodDays = _getBusinessDays(period.start, period.end);
        const capacity = capacityPerDay * periodDays;
        const loadPct = capacity > 0 ? (allocated / capacity) * 100 : 0;

        return {
            period: period.label,
            start: period.start,
            end: period.end,
            allocated: Math.round(allocated * 10) / 10,
            capacity: Math.round(capacity * 10) / 10,
            loadPct: Math.round(loadPct),
        };
    });
}

/**
 * Calculate team load (aggregated across all resources for a project).
 * @param {string} projectId
 * @param {string} startDate
 * @param {string} endDate
 * @param {'hour'|'day'|'week'|'month'|'year'} granularity
 * @returns {Array<any>}
 */
export function getTeamLoad(projectId: any, startDate: any, endDate: any, granularity = 'week') {
    const projectAllocs = allocations.filter((a: any) => a.projectId === projectId);
    const resourceIds = [...new Set(projectAllocs.map((a: any) => a.resourceId))];

    const periods = _generatePeriods(startDate, endDate, granularity);

    return periods.map((period: any) => {
        let totalAllocated = 0;
        let totalCapacity = 0;

        for (const resId of resourceIds) {
            const resource = getResource(resId);
            if (!resource) continue;

            const capacityPerDay = resource.hoursPerWeek / 5;
            const periodDays = _getBusinessDays(period.start, period.end);
            totalCapacity += capacityPerDay * periodDays;

            // Todas as alocacoes do recurso (cross-projeto)
            const resAllocs = getAllocationsForResource(resId, period.start, period.end);
            for (const alloc of resAllocs) {
                const overlap = _getOverlapDays(alloc.startDate, alloc.endDate, period.start, period.end);
                totalAllocated += alloc.hoursPerDay * overlap;
            }
        }

        return {
            period: period.label,
            start: period.start,
            end: period.end,
            allocated: Math.round(totalAllocated * 10) / 10,
            capacity: Math.round(totalCapacity * 10) / 10,
            loadPct: totalCapacity > 0 ? Math.round((totalAllocated / totalCapacity) * 100) : 0,
        };
    });
}

// ----------------------------------------------------------------
// PROJECT PROGRESS
// ----------------------------------------------------------------

/**
 * Calculate project progress (weighted average of phase completion).
 * Calcula progresso geral do projeto.
 *
 * @param {string} projectId
 * @returns {number} - 0-100
 */
export function getProjectProgress(projectId: any) {
    const project = getProject(projectId);
    if (!project || project.phases.length === 0) return 0;

    const nonMilestones = project.phases.filter((p: any) => !p.isMilestone);
    if (nonMilestones.length === 0) return 0;

    const total = nonMilestones.reduce((sum: any, p: any) => sum + (p.percentComplete || 0), 0);
    return Math.round(total / nonMilestones.length);
}

// ----------------------------------------------------------------
// TIMESHEET MANAGEMENT
// ----------------------------------------------------------------

/**
 * Add a timesheet entry.
 * @param {AnyRecord} data
 * @returns {{ok: boolean, entry?: AnyRecord, code?: string}}
 */
export function addTimesheetEntry(data: any = {}) {
    const normalized = _normalizeTimesheetInput(data);
    const validation = _validateTimesheetEntry(normalized);
    if (!validation.ok) return validation;

    const now = new Date().toISOString();
    const entry = {
        id: normalized.id || generateId('timesheet'),
        projectId: normalized.projectId,
        phaseId: normalized.phaseId,
        resourceId: normalized.resourceId,
        date: normalized.date,
        hours: normalized.hours,
        notes: normalized.notes,
        createdAt: normalized.createdAt || now,
        updatedAt: now,
    };

    timesheets.push(entry);
    _save();
    _emitTimesheetsChanged({
        reason: 'add',
        projectId: entry.projectId,
        entryId: entry.id,
        phaseId: entry.phaseId,
        resourceId: entry.resourceId,
    });
    return { ok: true, entry: { ...entry } };
}

/**
 * Update a timesheet entry by id.
 * @param {string} id
 * @param {AnyRecord} updates
 * @returns {{ok: boolean, entry?: AnyRecord, code?: string}}
 */
export function updateTimesheetEntry(id: any, updates: any = {}) {
    const existing = timesheets.find((e: any) => e.id === id);
    if (!existing) return { ok: false, code: 'ENTRY_NOT_FOUND' };

    const merged = _normalizeTimesheetInput({
        ...existing,
        ...updates,
        id: existing.id,
        createdAt: existing.createdAt,
    });
    const validation = _validateTimesheetEntry(merged);
    if (!validation.ok) return validation;

    existing.projectId = merged.projectId;
    existing.phaseId = merged.phaseId;
    existing.resourceId = merged.resourceId;
    existing.date = merged.date;
    existing.hours = merged.hours;
    existing.notes = merged.notes;
    existing.updatedAt = new Date().toISOString();

    _emitTimesheetsChanged({
        reason: 'update',
        projectId: existing.projectId,
        entryId: existing.id,
        phaseId: existing.phaseId,
        resourceId: existing.resourceId,
    });
    return { ok: true, entry: { ...existing } };
}

/**
 * Remove timesheet entry by id.
 * @param {string} id
 * @returns {{ok: boolean, code?: string}}
 */
export function removeTimesheetEntry(id: any) {
    const idx = timesheets.findIndex((e: any) => e.id === id);
    if (idx === -1) return { ok: false, code: 'ENTRY_NOT_FOUND' };

    const entry = timesheets[idx];
    timesheets.splice(idx, 1);
    _save();
    _emitTimesheetsChanged({
        reason: 'remove',
        projectId: entry.projectId,
        entryId: entry.id,
        phaseId: entry.phaseId,
        resourceId: entry.resourceId,
    });
    return { ok: true };
}

/**
 * Get all timesheet entries sorted.
 * @returns {Array<any>}
 */
export function getTimesheetEntries() {
    return _sortTimesheetEntries(timesheets).map((e) => ({ ...e }));
}

/**
 * Get timesheet entries by project.
 * @param {string} projectId
 * @param {AnyRecord} filters
 * @returns {Array<any>}
 */
export function getTimesheetByProject(projectId: any, filters: any = {}) {
    const filtered = _applyTimesheetFilters(
        timesheets.filter((e: any) => e.projectId === projectId),
        filters,
    );
    return _sortTimesheetEntries(filtered).map((e) => ({ ...e }));
}

/**
 * Get timesheet entries by resource.
 * @param {string} resourceId
 * @param {AnyRecord} filters
 * @returns {Array<any>}
 */
export function getTimesheetByResource(resourceId: any, filters: any = {}) {
    const filtered = _applyTimesheetFilters(
        timesheets.filter((e: any) => e.resourceId === resourceId),
        filters,
    );
    return _sortTimesheetEntries(filtered).map((e) => ({ ...e }));
}

/**
 * Get timesheet entries by phase.
 * @param {string} phaseId
 * @param {AnyRecord} filters
 * @returns {Array<any>}
 */
export function getTimesheetByPhase(phaseId: any, filters: any = {}) {
    const filtered = _applyTimesheetFilters(
        timesheets.filter((e: any) => e.phaseId === phaseId),
        filters,
    );
    return _sortTimesheetEntries(filtered).map((e) => ({ ...e }));
}

/**
 * Get timesheet summary for a project.
 * @param {string} projectId
 * @param {AnyRecord} filters
 * @returns {AnyRecord}
 */
export function getTimesheetSummary(projectId: any, filters: any = {}) {
    const entries = getTimesheetByProject(projectId, filters);
    const byResourceMap = new Map();
    const byPhaseMap = new Map();
    const byDateMap = new Map();

    let totalHours = 0;
    for (const entry of entries) {
        totalHours += entry.hours;
        const resource = getResource(entry.resourceId);
        const phase = getProject(entry.projectId)?.phases?.find((p: any) => p.id === entry.phaseId) || null;

        const resRow = byResourceMap.get(entry.resourceId) || {
            id: entry.resourceId,
            name: resource?.name || entry.resourceId,
            hours: 0,
        };
        resRow.hours += entry.hours;
        byResourceMap.set(entry.resourceId, resRow);

        const phaseRow = byPhaseMap.get(entry.phaseId) || {
            id: entry.phaseId,
            name: phase?.name || entry.phaseId,
            hours: 0,
        };
        phaseRow.hours += entry.hours;
        byPhaseMap.set(entry.phaseId, phaseRow);

        byDateMap.set(entry.date, (byDateMap.get(entry.date) || 0) + entry.hours);
    }

    const byResource = [...byResourceMap.values()]
        .map((row) => ({ ...row, hours: _round2(row.hours) }))
        .sort((a, b) => b.hours - a.hours);

    const byPhase = [...byPhaseMap.values()]
        .map((row) => ({ ...row, hours: _round2(row.hours) }))
        .sort((a, b) => b.hours - a.hours);

    const byDate = [...byDateMap.entries()]
        .map(([date, hours]) => ({ date, hours: _round2(hours) }))
        .sort((a, b) => a.date.localeCompare(b.date));

    return {
        totalHours: _round2(totalHours),
        entryCount: entries.length,
        byResource,
        byPhase,
        byDate,
    };
}

// ----------------------------------------------------------------
// SERIALIZATION
// ----------------------------------------------------------------

/**
 * Export projects, resources, and allocations.
 * @returns {AnyRecord}
 */
export function exportProjects() {
    return {
        projects: projects.map((p: any) => ({
            ...p,
            phases: p.phases.map((ph: any) => ({
                ...ph
            })),
        })),
        resources: resources.map((r: any) => {
            // LGPD: nao exporta dados pessoais se consentimento foi revogado
            if (r.consentWithdrawn) {
                return { ...r, name: r.name, email: '' };
            }
            return { ...r };
        }),
        allocations: allocations.map((a: any) => ({ ...a })),
        timesheets: timesheets.map((e: any) => ({ ...e })),
    };
}

/**
 * Import projects, resources, and allocations.
 * @param {AnyRecord} data - { projects, resources, allocations }
 */
export function importProjects(data: any) {
    projects = [];
    resources = [];
    allocations = [];
    timesheets = [];

    if (!data) return;

    const projectArr = data.projects || data;
    if (Array.isArray(projectArr)) {
        for (const item of projectArr) {
            projects.push({
                id: item.id || generateId('project'),
                name: item.name || '',
                type: item.type || 'custom',
                status: item.status || 'planning',
                description: item.description || '',
                dates: item.dates || { startDate: '', endDate: '' },
                phases: ((item.phases || []) as any[]).map((ph: any) => ({
                    id: ph.id || generateId('phase'),
                    name: ph.name || '',
                    startDate: ph.startDate || '',
                    endDate: ph.endDate || '',
                    percentComplete: ph.percentComplete || 0,
                    color: ph.color || '#3b6bff',
                    isMilestone: ph.isMilestone || false,
                    dependencies: ph.dependencies || [],
                    linkedWbsItemId: ph.linkedWbsItemId || null
                })),
                linkedContractIds: item.linkedContractIds || [],
                linkedWbsRootIds: item.linkedWbsRootIds || [],
                linkedMacMeasureIds: item.linkedMacMeasureIds || [],
                linkedCampaignIds: item.linkedCampaignIds || [],
                linkedElementIds: item.linkedElementIds || [],
                timesheetDailyTargetHours: _normalizeProjectDailyTargetHours(item.timesheetDailyTargetHours),
                notes: item.notes || '',
                createdAt: item.createdAt || new Date().toISOString(),
                modifiedAt: item.modifiedAt || new Date().toISOString(),
            });
        }
    }

    if (Array.isArray(data.resources)) {
        for (const item of data.resources) {
            resources.push({
                id: item.id || generateId('resource'),
                name: item.name || '',
                role: item.role || '',
                level: item.level || 'mid',
                email: item.email || '',
                hoursPerWeek: item.hoursPerWeek || 40,
                costPerHour: item.costPerHour || 0,
                consentGiven: item.consentGiven || false,
                consentDate: item.consentDate || null,
                consentPurpose: item.consentPurpose || 'Gerenciamento de alocacao de recursos em projetos ambientais',
                consentWithdrawn: item.consentWithdrawn || false,
                active: item.active !== undefined ? item.active : true,
            });
        }
    }

    if (Array.isArray(data.allocations)) {
        for (const item of data.allocations) {
            allocations.push({
                id: item.id || generateId('alloc'),
                resourceId: item.resourceId || '',
                projectId: item.projectId || '',
                phaseId: item.phaseId || '',
                hoursPerDay: item.hoursPerDay || 8,
                startDate: item.startDate || '',
                endDate: item.endDate || '',
                notes: item.notes || '',
            });
        }
    }

    if (Array.isArray(data.timesheets)) {
        for (const item of data.timesheets) {
            const normalized = _normalizeTimesheetInput({
                id: item.id,
                projectId: item.projectId,
                phaseId: item.phaseId,
                resourceId: item.resourceId,
                date: item.date,
                hours: item.hours,
                notes: item.notes,
                createdAt: item.createdAt,
            });
            const validation = _validateTimesheetEntry(normalized);
            if (!validation.ok) {
                console.warn('[projectManager] Dropping invalid timesheet entry during import:', validation.code);
                continue;
            }

            timesheets.push({
                id: normalized.id || generateId('timesheet'),
                projectId: normalized.projectId,
                phaseId: normalized.phaseId,
                resourceId: normalized.resourceId,
                date: normalized.date,
                hours: normalized.hours,
                notes: normalized.notes,
                createdAt: normalized.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }
    }

    _save();
    _emitTimesheetsChanged({ reason: 'import' });
}

// ----------------------------------------------------------------
// PERIOD HELPERS
// ----------------------------------------------------------------

/**
 * Generate period intervals for load calculation.
 * @param {string} startDate
 * @param {string} endDate
 * @param {string} granularity
 * @returns {Array<{start: string, end: string, label: string}>}
 */
function _generatePeriods(startDate: any, endDate: any, granularity: any) {
    /** @type {Array<{start: string, end: string, label: string}>} */
    const periods: any = [];
    let current = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(current.getTime()) || isNaN(end.getTime())) return periods;

    const MAX_PERIODS = 365;
    let count = 0;

    while (current <= end && count < MAX_PERIODS) {
        let periodEnd;
        let label;

        switch (granularity) {
            case 'hour':
                periodEnd = new Date(current);
                periodEnd.setHours(periodEnd.getHours() + 1);
                label = current.toISOString().slice(0, 13) + 'h';
                break;
            case 'day':
                periodEnd = new Date(current);
                periodEnd.setDate(periodEnd.getDate() + 1);
                label = current.toISOString().slice(0, 10);
                break;
            case 'week': {
                periodEnd = new Date(current);
                periodEnd.setDate(periodEnd.getDate() + 7);
                const weekNum = Math.ceil(current.getDate() / 7);
                label = `${current.toISOString().slice(0, 7)} W${weekNum}`;
                break;
            }
            case 'month':
                periodEnd = new Date(current.getFullYear(), current.getMonth() + 1, 1);
                label = current.toISOString().slice(0, 7);
                break;
            case 'year':
                periodEnd = new Date(current.getFullYear() + 1, 0, 1);
                label = String(current.getFullYear());
                break;
            default:
                periodEnd = new Date(current);
                periodEnd.setDate(periodEnd.getDate() + 7);
                label = current.toISOString().slice(0, 10);
        }

        if (periodEnd > end) periodEnd = new Date(end);

        periods.push({
            start: current.toISOString().slice(0, 10),
            end: periodEnd.toISOString().slice(0, 10),
            label,
        });

        current = periodEnd;
        count++;
    }

    return periods;
}

/**
 * Calculate overlap in business days between two date ranges.
 * @param {string} start1
 * @param {string} end1
 * @param {string} start2
 * @param {string} end2
 * @returns {number}
 */
function _getOverlapDays(start1: any, end1: any, start2: any, end2: any) {
    if (!start1 || !end1 || !start2 || !end2) return 0;
    const overlapStart = start1 > start2 ? start1 : start2;
    const overlapEnd = end1 < end2 ? end1 : end2;
    if (overlapStart > overlapEnd) return 0;
    return _getBusinessDays(overlapStart, overlapEnd);
}

/**
 * Calculate business days between two dates.
 * @param {string} start
 * @param {string} end
 * @returns {number}
 */
function _getBusinessDays(start: any, end: any) {
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;

    let days = 0;
    const current = new Date(s);
    while (current <= e) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) days++;
        current.setDate(current.getDate() + 1);
    }
    return Math.max(days, 1);
}

/**
 * Emit browser event after timesheet mutation.
 * @param {AnyRecord} detail
 */
function _emitTimesheetsChanged(detail: any = {}) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    if (typeof CustomEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent('timesheets-changed', { detail }));
}

/**
 * Normalize raw timesheet input.
 * @param {AnyRecord} data
 * @returns {AnyRecord}
 */
function _normalizeTimesheetInput(data: any = {}) {
    return {
        id: data.id || '',
        projectId: data.projectId || '',
        phaseId: data.phaseId || '',
        resourceId: data.resourceId || '',
        date: typeof data.date === 'string' ? data.date.trim() : '',
        hours: Number(data.hours),
        notes: String(data.notes || '').slice(0, 500),
        createdAt: data.createdAt || '',
    };
}

/**
 * Validate timesheet according to business rules.
 * @param {AnyRecord} entry
 * @returns {{ok: boolean, code?: string}}
 */
function _validateTimesheetEntry(entry: any) {
    const project = getProject(entry.projectId);
    if (!project) return { ok: false, code: 'INVALID_PROJECT' };

    const phase = project.phases.find((p: any) => p.id === entry.phaseId);
    if (!phase) {
        const phaseExistsElsewhere = projects.some((p: any) => p.phases.some((ph: any) => ph.id === entry.phaseId));
        return { ok: false, code: phaseExistsElsewhere ? 'PHASE_PROJECT_MISMATCH' : 'INVALID_PHASE' };
    }
    if (phase.isMilestone === true) return { ok: false, code: 'MILESTONE_NOT_ALLOWED' };

    const resource = getResource(entry.resourceId);
    if (!resource) return { ok: false, code: 'INVALID_RESOURCE' };

    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
        return { ok: false, code: 'INVALID_DATE_FORMAT' };
    }
    if (!_isValidISODate(entry.date)) {
        return { ok: false, code: 'INVALID_DATE' };
    }

    const windowRange = _resolveTimesheetDateWindow(project, phase);
    if (windowRange && (entry.date < windowRange.start || entry.date > windowRange.end)) {
        return { ok: false, code: 'DATE_OUT_OF_RANGE' };
    }

    if (!Number.isFinite(entry.hours)) return { ok: false, code: 'INVALID_HOURS' };
    if (entry.hours <= 0) return { ok: false, code: 'HOURS_NOT_POSITIVE' };
    if (entry.hours > 24) return { ok: false, code: 'HOURS_EXCEEDS_MAX' };
    if (!_isQuarterStep(entry.hours)) return { ok: false, code: 'HOURS_NOT_QUARTER' };

    return { ok: true };
}

/**
 * Resolve accepted date window for timesheet entries.
 * @param {AnyRecord} project
 * @param {AnyRecord} phase
 * @returns {{start: string, end: string}|null}
 */
function _resolveTimesheetDateWindow(project: any, phase: any) {
    if (phase?.startDate && phase?.endDate) {
        return { start: phase.startDate, end: phase.endDate };
    }
    if (project?.dates?.startDate && project?.dates?.endDate) {
        return { start: project.dates.startDate, end: project.dates.endDate };
    }
    return null;
}

/**
 * Filter timesheet entries using AND semantics.
 * @param {Array<any>} entries
 * @param {AnyRecord} filters
 * @returns {Array<any>}
 */
function _applyTimesheetFilters(entries: any, filters: any = {}) {
    const startDate = filters.startDate || '';
    const endDate = filters.endDate || '';
    const resourceId = filters.resourceId || '';
    const phaseId = filters.phaseId || '';

    return entries.filter((entry: any) => {
        if (startDate && entry.date < startDate) return false;
        if (endDate && entry.date > endDate) return false;
        if (resourceId && entry.resourceId !== resourceId) return false;
        if (phaseId && entry.phaseId !== phaseId) return false;
        return true;
    });
}

/**
 * Normalize project daily target hours for timesheet progress.
 * @param {*} value
 * @returns {number}
 */
function _normalizeProjectDailyTargetHours(value: any) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
}

/**
 * Sort by date desc then createdAt desc.
 * @param {Array<any>} entries
 * @returns {Array<any>}
 */
function _sortTimesheetEntries(entries: any) {
    return [...entries].sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
}

/**
 * Validate YYYY-MM-DD as real date.
 * @param {string} dateStr
 * @returns {boolean}
 */
function _isValidISODate(dateStr: any) {
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) return false;
    const dt = new Date(Date.UTC(year, month - 1, day));
    return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

/**
 * Check quarter-hour granularity.
 * @param {number} value
 * @returns {boolean}
 */
function _isQuarterStep(value: any) {
    return Math.abs(Math.round(value * 4) - value * 4) < 1e-9;
}

/**
 * Round to 2 decimal places.
 * @param {number} value
 * @returns {number}
 */
function _round2(value: any) {
    return Math.round((value || 0) * 100) / 100;
}
