// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * accessGroupSchema.js - Data Catalog Access Groups (SPEC_DATA_CATALOG_ACCESS_GROUPS_9_66)
 *
 * Schema definitions and factory functions for access groups.
 * Pure logic - no DOM, no IDB, no network.
 *
 * Hierarquia de acesso (crescente): none < read < write < admin
 */

export const ACCESS_LEVELS = {
    NONE: 'none',
    READ: 'read',
    WRITE: 'write',
    ADMIN: 'admin',
} as const;

export type AccessLevel = (typeof ACCESS_LEVELS)[keyof typeof ACCESS_LEVELS];

export const GROUP_TYPES = {
    PROJECT: 'project',
    ORGANIZATION: 'org',
    PUBLIC: 'public',
    PRIVATE: 'private',
} as const;

export type GroupType = (typeof GROUP_TYPES)[keyof typeof GROUP_TYPES];

// Sets para validação O(1)
const VALID_ACCESS_LEVELS = new Set<string>(Object.values(ACCESS_LEVELS));
const VALID_GROUP_TYPES = new Set<string>(Object.values(GROUP_TYPES));

/**
 * Gera ID único para o grupo.
 * Usa crypto.randomUUID() quando disponível (Node 15+, browsers modernos),
 * com fallback para Date.now().toString(36).
 * @returns {string}
 */
function generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export interface AccessGroup {
    readonly id: string;
    readonly name: string;
    readonly type: GroupType;
    readonly ownerId: string;
    readonly members: unknown[];
    readonly defaultAccess: AccessLevel;
    readonly createdAt: string;
}

export interface CreateAccessGroupOptions {
    name?: unknown;
    type?: unknown;
    ownerId?: unknown;
    defaultAccess?: unknown;
    id?: unknown;
    createdAt?: unknown;
}

/**
 * Cria um objeto AccessGroup imutável.
 *
 * @param {Record<string, any>} [opts]
 * @returns {Readonly<object>} grupo imutável
 * @throws {TypeError}  se name, type ou ownerId ausentes
 * @throws {RangeError} se type ou defaultAccess inválidos
 */
export function createAccessGroup(opts: CreateAccessGroupOptions = {}): Readonly<AccessGroup> {
    const { name, type, ownerId, defaultAccess = ACCESS_LEVELS.NONE, id, createdAt } = opts;

    if (!name) throw new TypeError('createAccessGroup: name é obrigatório');
    if (!type) throw new TypeError('createAccessGroup: type é obrigatório');
    if (!ownerId) throw new TypeError('createAccessGroup: ownerId é obrigatório');

    if (!VALID_GROUP_TYPES.has(type as string)) {
        throw new RangeError(
            `createAccessGroup: type inválido "${type}". Use: ${Object.values(GROUP_TYPES).join(', ')}`,
        );
    }
    if (!VALID_ACCESS_LEVELS.has(defaultAccess as string)) {
        throw new RangeError(
            `createAccessGroup: defaultAccess inválido "${defaultAccess}". Use: ${Object.values(ACCESS_LEVELS).join(', ')}`,
        );
    }

    return Object.freeze({
        id: (id as string) ?? generateId(),
        name: String(name),
        type: type as GroupType,
        ownerId: String(ownerId),
        members: [],
        defaultAccess: defaultAccess as AccessLevel,
        createdAt: (createdAt as string) ?? new Date().toISOString(),
    });
}

export interface GroupMembership {
    readonly userId: string;
    readonly groupId: string;
    readonly accessLevel: AccessLevel;
    readonly grantedAt: string;
}

/**
 * Cria um objeto GroupMembership imutável.
 *
 * @param {string} userId      - ID do usuário
 * @param {string} groupId     - ID do grupo
 * @param {string} accessLevel - Um dos ACCESS_LEVELS
 * @returns {Readonly<object>} membership imutável
 * @throws {TypeError}  se userId ou groupId ausentes
 * @throws {RangeError} se accessLevel inválido
 */
export function createGroupMembership(
    userId: string,
    groupId: string,
    accessLevel: AccessLevel,
): Readonly<GroupMembership> {
    if (!userId) throw new TypeError('createGroupMembership: userId é obrigatório');
    if (!groupId) throw new TypeError('createGroupMembership: groupId é obrigatório');

    if (!VALID_ACCESS_LEVELS.has(accessLevel)) {
        throw new RangeError(
            `createGroupMembership: accessLevel inválido "${accessLevel}". Use: ${Object.values(ACCESS_LEVELS).join(', ')}`,
        );
    }

    return Object.freeze({
        userId: String(userId),
        groupId: String(groupId),
        accessLevel,
        grantedAt: new Date().toISOString(),
    });
}