// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   ELEMENTS HIERARCHY PURE (Module C extraction — refactor-opportunities pick)
   ================================================================

   Helpers pure-logic extraídos de core/elements/manager.ts (fan-in 179,
   MAIOR pick remanescente). Reduzem boilerplate inline + abrem teste
   determinístico sem mock de Three/IDB/scene groups.

   Sem state interno; deps injetadas (getFamily, now). Pattern padrão da
   Module C campaign (commits 22287c10..b2cae773..dd5ee2a2).
   ================================================================ */

import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';

type AnyRecord = Record<string, any>;

/** Hierarquia padrão para um elemento novo: nível element, sem parent, order. */
export function defaultHierarchy(order: number = 0): { level: string; parentId: string | null; order: number } {
    return { level: 'element', parentId: null, order: toFiniteNumber(order, 0) };
}

/**
 * Normaliza hierarchy externa (de import ou input usuário):
 *   - level deve ser string, default 'element'
 *   - parentId deve ser string DIFERENTE do próprio elementId (anti self-loop), senão null
 *   - order deve ser finito, senão 0
 * Determinística + injection-safe (elementId pode ser undefined em criação nova).
 */
export function normalizeHierarchy(input: any, _familyId: string, elementId: string | null | undefined): {
    level: string;
    parentId: string | null;
    order: number;
} {
    const h = (input && typeof input === 'object' ? input : {}) as AnyRecord;
    return {
        level: typeof h.level === 'string' ? h.level : 'element',
        parentId: typeof h.parentId === 'string' && h.parentId !== elementId ? h.parentId : null,
        order: toFiniteNumber(h.order, 0),
    };
}

/** Metadata padrão para um elemento novo. Determinístico. */
export function generateDefaultMeta(familyId: string, name: string): AnyRecord {
    return {
        iconClass: `icon-${familyId}`,
        color: '',
        label: name,
    };
}

/**
 * Checa se uma família é container. Lookup feito via getFamily injetado
 * (evita acoplar a config global).
 */
export function isContainerFamily(familyId: string, getFamily: (id: string) => any): boolean {
    const fam = getFamily ? getFamily(familyId) : null;
    return !!(fam && (fam as AnyRecord).isContainer === true);
}

function normalizeNumber(value: unknown, defaultValue: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : defaultValue;
}

function normalizeString(value: unknown, defaultValue: string): string {
    return typeof value === 'string' ? value : defaultValue;
}

function normalizeArray(value: unknown): any[] {
    return Array.isArray(value) ? value : [];
}

function createInheritedUncertainty(isoNow: string): AnyRecord {
    return {
        class: 'medium',
        value: null,
        sources: ['inherited'],
        components: { sampling: null, analytical: null, qualitative: null },
        note: '',
        provenance: {
            set_at: isoNow,
            set_by: null,
            method: 'auto_inherited',
        },
    };
}

function normalizeUncertainty(value: unknown, isoNow: string): AnyRecord {
    return value && typeof value === 'object' ? (value as AnyRecord) : createInheritedUncertainty(isoNow);
}

/**
 * Constrói o objeto observation padrão. opts.now opcional permite
 * determinismo em testes (recebe ISO string para set_at). Default chama
 * new Date() (comportamento legacy preservado).
 *
 * UNC-STRUCTURAL-001 Fase 2: uncertainty é first-class. Default = inherited
 * (class 'medium', value null, sources ['inherited']) — yellow badge na UI
 * até usuário declarar explicitamente. EPA IRIS §2.3 requer declaração.
 */
export function createObservationBase(base: AnyRecord, opts: { now?: () => string } = {}): AnyRecord {
    const isoNow = typeof opts.now === 'function' ? opts.now() : new Date().toISOString();
    return {
        x: normalizeNumber(base?.x, 0),
        y: normalizeNumber(base?.y, 0),
        z: normalizeNumber(base?.z, 0),
        reading: normalizeNumber(base?.reading, 0),
        unit: normalizeString(base?.unit, 'mg/L'),
        date: normalizeString(base?.date, isoNow.slice(0, 10)),
        qualFields: normalizeArray(base?.qualFields),
        uncertainty: normalizeUncertainty(base?.uncertainty, isoNow),
    };
}
