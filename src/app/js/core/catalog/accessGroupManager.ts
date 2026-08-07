// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * accessGroupManager.js - Data Catalog Access Groups (SPEC_DATA_CATALOG_ACCESS_GROUPS_9_66)
 *
 * Factory de gerenciador de grupos de acesso. Pure-logic, sem efeitos colaterais externos.
 * Cada instância mantém estado isolado (sem singleton global).
 *
 * Hierarquia de nível de acesso:
 *   none(0) < read(1) < write(2) < admin(3)
 */

import { ACCESS_LEVELS, createAccessGroup, createGroupMembership } from './accessGroupSchema.js';

// Ordem numérica para comparação de hierarquia
const LEVEL_ORDER: Record<string, number> = {
    [ACCESS_LEVELS.NONE]: 0,
    [ACCESS_LEVELS.READ]: 1,
    [ACCESS_LEVELS.WRITE]: 2,
    [ACCESS_LEVELS.ADMIN]: 3,
};

/**
 * Cria uma instância isolada de gerenciador de grupos de acesso.
 *
 * @returns manager com métodos CRUD e verificação de acesso
 */
export function createAccessGroupManager(): object {
    // Estado interno - isolado por instância
    /** groupId → group */
    const groups = new Map<string, any>();
    /** groupId → (userId → membership) */
    const memberships = new Map<string, Map<string, any>>();

    // ------------------------------------------------------------------ helpers

    /**
     * Retorna o Map de memberships para um grupo (cria se necessário).
     */
    function membersOf(groupId: string): Map<string, any> {
        if (!memberships.has(groupId)) {
            memberships.set(groupId, new Map());
        }
        return memberships.get(groupId) as Map<string, any>;
    }

    // ------------------------------------------------------------------ API

    /**
     * Adiciona um grupo ao gerenciador.
     * @param opts - passado para createAccessGroup
     * @returns group
     */
    function addGroup(opts: any): Readonly<any> {
        const group = createAccessGroup(opts) as any;
        groups.set(group.id, group);
        return group;
    }

    /**
     * Remove um grupo e seus memberships.
     * @returns true se removido, false se não existia
     */
    function removeGroup(id: string): boolean {
        if (!groups.has(id)) return false;
        groups.delete(id);
        memberships.delete(id);
        return true;
    }

    /**
     * Retorna um grupo pelo ID.
     */
    function getGroup(id: string): Readonly<any> | undefined {
        return groups.get(id);
    }

    /**
     * Lista todos os grupos.
     */
    function listGroups(): Readonly<any>[] {
        return Array.from(groups.values());
    }

    /**
     * Adiciona um membro a um grupo.
     * @param groupId - um dos ACCESS_LEVELS
     * @returns membership
     * @throws {Error} se grupo não existe
     */
    function addMember(groupId: string, userId: string, accessLevel: string): Readonly<any> {
        if (!groups.has(groupId)) {
            throw new Error(`addMember: grupo "${groupId}" não existe`);
        }
        const membership = createGroupMembership(userId, groupId, accessLevel as any);
        membersOf(groupId).set(userId, membership);
        return membership;
    }

    /**
     * Remove um membro de um grupo.
     * @returns true se removido, false se não era membro
     */
    function removeMember(groupId: string, userId: string): boolean {
        const map = memberships.get(groupId);
        if (!map) return false;
        return map.delete(userId);
    }

    /**
     * Retorna o nível de acesso de um usuário em um grupo.
     * @returns ACCESS_LEVELS value (ACCESS_LEVELS.NONE se não membro)
     */
    function getMemberAccess(groupId: string, userId: string): string {
        const map = memberships.get(groupId);
        if (!map) return ACCESS_LEVELS.NONE;
        const membership = map.get(userId) as any;
        return membership ? membership.accessLevel : ACCESS_LEVELS.NONE;
    }

    /**
     * Verifica se um usuário tem acesso igual ou superior ao nível requerido.
     *
     * Hierarquia: admin ≥ write ≥ read ≥ none
     *
     * @param groupId - ACCESS_LEVELS value
     */
    function canAccess(groupId: string, userId: string, requiredLevel: string): boolean {
        const actual = getMemberAccess(groupId, userId);
        const actualN = (LEVEL_ORDER as Record<string, number>)[actual] ?? 0;
        const required = (LEVEL_ORDER as Record<string, number>)[requiredLevel] ?? 0;
        return actualN >= required && required > 0;
    }

    /**
     * Transfere a ownership de um grupo para outro usuário.
     * @returns grupo atualizado
     * @throws {Error} se grupo não existe
     */
    function transferOwnership(groupId: string, newOwnerId: string): Readonly<any> {
        const existing = groups.get(groupId);
        if (!existing) {
            throw new Error(`transferOwnership: grupo "${groupId}" não existe`);
        }
        const updated = Object.freeze({ ...existing, ownerId: String(newOwnerId) });
        groups.set(groupId, updated);
        return updated;
    }

    return {
        addGroup,
        removeGroup,
        getGroup,
        listGroups,
        addMember,
        removeMember,
        getMemberAccess,
        canAccess,
        transferOwnership,
    };
}
