// Generated from src/app/js/core/ohs/workerSchema.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   OHS WORKER SCHEMA — SPEC_RECONCILIATION_005_OHS §Mudança 1

   Bifurcação ontológica do antigo tipo `individual`:
     - `worker`           — pessoa em contexto ocupacional (NR-01/PGR)
     - `biota_individual` — animal/árvore/espécie (sem campos ocupacionais)

   O nome real do trabalhador NUNCA é serializado em claro: usa-se o
   pseudônimo LGPD já implementado em core/health/workerRegistry.js
   (reuso obrigatório — não reimplementar a cifragem).

   PT (leigo): este arquivo apenas valida e organiza os dados do
   trabalhador; quem embaralha o nome para proteger a privacidade é o
   módulo de saúde já existente, que aqui é reaproveitado.
   ================================================================ */
import { createLogger } from '../../utils/helpers/logger.js';
import { generatePseudonym } from '../health/workerRegistry.js';
const log = createLogger('OhsWorkerSchema');
// ──────────────────────────────────────────────────────────────────────
// Field privacy tags (RBAC §Q5.5 — consumido por riskMatrix.canAccessField)
// ──────────────────────────────────────────────────────────────────────
/**
 * Privacidade por campo do worker. `medical_only` só é visível a
 * medical_professional/admin; campos ocupacionais a engineer/admin.
 */
export const WORKER_FIELD_PRIVACY = Object.freeze({
    name: 'medical_only', // PII — protegido
    role: 'engineer_only',
    registration: 'engineer_only',
    admissionDate: 'engineer_only',
    shift: 'engineer_only',
    weeklyHours: 'engineer_only',
    activePPE: 'engineer_only',
    validTrainings: 'engineer_only',
    exposureAreas: 'public',
});
/** Campos exclusivos de worker (ausentes em biota_individual). */
export const WORKER_OCCUPATIONAL_FIELDS = Object.freeze([
    'role',
    'registration',
    'admissionDate',
    'shift',
    'weeklyHours',
    'activePPE',
    'validTrainings',
]);
// ──────────────────────────────────────────────────────────────────────
// Schemas
// ──────────────────────────────────────────────────────────────────────
/**
 * Normaliza um registro bruto em um `worker` schema-válido.
 *
 * @param {Record<string, any>|null|undefined} raw
 * @returns {{ family: 'worker', name: string, role: string, registration: string,
 *   admissionDate: string, shift: string, weeklyHours: number,
 *   activePPE: string[], validTrainings: string[], exposureAreas: string[] }}
 */
export function buildWorker( raw: any) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
        family: 'worker',
        name: typeof r.name === 'string' ? r.name : '',
        role: typeof r.role === 'string' ? r.role : '',
        registration: typeof r.registration === 'string' ? r.registration : '',
        admissionDate: typeof r.admissionDate === 'string' ? r.admissionDate : '',
        shift: typeof r.shift === 'string' ? r.shift : '',
        weeklyHours: Number.isFinite(Number(r.weeklyHours)) ? Number(r.weeklyHours) : 44,
        activePPE: Array.isArray(r.activePPE) ? r.activePPE.slice() : [],
        validTrainings: Array.isArray(r.validTrainings) ? r.validTrainings.slice() : [],
        exposureAreas: Array.isArray(r.exposureAreas) ? r.exposureAreas.slice() : [],
    };
}
/**
 * Normaliza um registro bruto em um `biota_individual` schema-válido.
 * Sem nenhum campo ocupacional (invariante ontológico).
 *
 * @param {Record<string, any>|null|undefined} raw
 * @returns {{ family: 'biota_individual', species: string, taxonId: string,
 *   estimatedAge: string, conservationStatus: string, location: string }}
 */
export function buildBiotaIndividual( raw: any) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
        family: 'biota_individual',
        species: typeof r.species === 'string' ? r.species : '',
        taxonId: typeof r.taxonId === 'string' ? r.taxonId : '',
        estimatedAge: typeof r.estimatedAge === 'string' ? r.estimatedAge : '',
        conservationStatus: typeof r.conservationStatus === 'string' ? r.conservationStatus : '',
        location: typeof r.location === 'string' ? r.location : '',
    };
}
/**
 * Valida os campos obrigatórios de um `worker`.
 * @param {Record<string, any>|null|undefined} worker
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateWorker( worker: any) {
    /** @type {string[]} */
    const errors = [];
    if (!worker || typeof worker !== 'object') return { valid: false, errors: ['not object'] };
    if (!worker.name) errors.push('name required');
    if (!worker.registration) errors.push('registration required');
    if (!worker.role) errors.push('role required');
    const wh = Number(worker.weeklyHours);
    if (!Number.isFinite(wh) || wh <= 0 || wh > 84) errors.push('weeklyHours must be 1..84');
    return { valid: errors.length === 0, errors };
}
/**
 * `biota_individual` NÃO pode ter campos ocupacionais.
 * @param {Record<string, any>|null|undefined} biota
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateBiotaIndividual( biota: any) {
    /** @type {string[]} */
    const errors = [];
    if (!biota || typeof biota !== 'object') return { valid: false, errors: ['not object'] };
    if (!biota.species) errors.push('species required');
    for (const f of WORKER_OCCUPATIONAL_FIELDS) {
        if (f in biota && biota[f] != null && biota[f] !== '') {
            errors.push(`occupational field '${f}' not allowed on biota_individual`);
        }
    }
    return { valid: errors.length === 0, errors };
}
// ──────────────────────────────────────────────────────────────────────
// Migração silenciosa do legado `individual` §Q5.2
// ──────────────────────────────────────────────────────────────────────
/**
 * Roteia um elemento legado `individual` para `worker` ou
 * `biota_individual` por heurística: se possui qualquer campo
 * ocupacional → worker; senão → biota_individual.
 *
 * @param {Record<string, any>|null|undefined} element
 * @returns {Record<string, any>} novo elemento com `family` resolvida
 */
export function migrateIndividual( element: any) {
    const e = element && typeof element === 'object' ? element : {};
    if (e.family && e.family !== 'individual') return e; // já migrado
    const hasOccupational = WORKER_OCCUPATIONAL_FIELDS.some((f: any) => f in e && e[f] != null && e[f] !== '' && !(Array.isArray(e[f]) && e[f].length === 0),
    );
    const migrated = hasOccupational ? buildWorker(e) : buildBiotaIndividual(e);
    log.debug('migrateIndividual', { from: 'individual', to: migrated.family, hasOccupational });
    return migrated;
}
// ──────────────────────────────────────────────────────────────────────
// Serialização RBAC-aware §J1 (nome cifrado em backup/export)
// ──────────────────────────────────────────────────────────────────────
/**
 * Serializa um worker para export/backup. O nome real é substituído
 * por pseudônimo determinístico (reuso da primitiva LGPD em
 * core/health/workerRegistry.generatePseudonym). Quando não-admin,
 * todos os campos `medical_only` (incl. nome) são removidos.
 *
 * @param {Record<string, any>} worker
 * @param {{ projectSalt?: string, isAdmin?: boolean }} [opts]
 * @returns {Record<string, any>}
 */
export function serializeWorkerForExport( worker: any, { projectSalt = 'ohs', isAdmin = false }: any = {}) {
    if (!worker || typeof worker !== 'object') return {};
    const name = String(worker.name || '');
    const pseudonym = name.trim() ? generatePseudonym(name, projectSalt) : 'Worker-anon';
    const out: any = { family: 'worker', pseudonym };
    for (const [key, value] of Object.entries(worker)) {
        if (key === 'name' || key === 'family') continue;
        const privacy = (WORKER_FIELD_PRIVACY as any)[key];
        if (!isAdmin && privacy === 'medical_only') continue; // PII redacted
        out[key] = value;
    }
    if (isAdmin) out.name = name; // só admin vê o nome em claro
    return out;
}
