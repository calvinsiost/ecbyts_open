/**
 * core/catalog/accessGroups.js - Data Catalog Access Groups P1-24
 * (SPEC_DATA_CATALOG_ACCESS_GROUPS_9_66)
 *
 * Access control with three visibility levels: public / restricted / private.
 * Pure logic - no DOM, no IDB, no network.
 *
 * @module catalog/accessGroups
 * @license AGPL-3.0-only
 */

export const ACCESS_LEVELS = Object.freeze({
    PUBLIC: 'public',
    RESTRICTED: 'restricted',
    PRIVATE: 'private',
} as const);

export type AccessLevel = (typeof ACCESS_LEVELS)[keyof typeof ACCESS_LEVELS];

export interface AccessGroup {
    id: string;
    name: string;
    level: AccessLevel;
    memberIds: string[];
}

export interface CreateAccessGroupOptions {
    id?: string;
    name?: unknown;
    level?: unknown;
    memberIds?: string[];
}

const VALID_LEVELS = new Set<AccessLevel>(Object.values(ACCESS_LEVELS));

function isAccessLevel(level: unknown): level is AccessLevel {
    return VALID_LEVELS.has(level as AccessLevel);
}

function stringifyValue(value: unknown): string {
    if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint' ||
        typeof value === 'symbol'
    ) {
        return String(value);
    }
    return Object.prototype.toString.call(value);
}

function generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function createAccessGroup({
    id,
    name,
    level,
    memberIds = [],
}: CreateAccessGroupOptions): Readonly<AccessGroup> {
    if (!isAccessLevel(level)) {
        throw new Error(
            `createAccessGroup: nível inválido "${stringifyValue(level)}". Use: ${[...VALID_LEVELS].join(', ')}`,
        );
    }
    if (!name) throw new TypeError('createAccessGroup: name é obrigatório');

    return Object.freeze({
        id: id ?? generateId(),
        name: stringifyValue(name),
        level,
        memberIds: [...memberIds],
    });
}

export function addMember(group: Readonly<AccessGroup>, memberId: string): Readonly<AccessGroup> {
    if (group.memberIds.includes(memberId)) return group;
    return Object.freeze({ ...group, memberIds: [...group.memberIds, memberId] });
}

export function removeMember(group: Readonly<AccessGroup>, memberId: string): Readonly<AccessGroup> {
    return Object.freeze({
        ...group,
        memberIds: group.memberIds.filter((id) => id !== memberId),
    });
}

export function canAccess(group: Readonly<AccessGroup>, memberId: string): boolean {
    if (group.level === ACCESS_LEVELS.PUBLIC) return true;
    return group.memberIds.includes(memberId);
}

export function filterByAccess(
    groups: ReadonlyArray<Readonly<AccessGroup>>,
    memberId: string,
): Readonly<AccessGroup>[] {
    return groups.filter((group) => canAccess(group, memberId));
}
