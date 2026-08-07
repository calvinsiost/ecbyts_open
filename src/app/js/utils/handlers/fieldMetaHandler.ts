// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// utils/handlers/fieldMetaHandler.js
// @ts-check
// Wire-up of P1-55 field meta schema v2 into UI.
// (window as any).handleShowFieldMetaDemo() - demo migration v1→v2 + index lookup.
import { createFieldV2, migrateV1ToV2, buildFieldIndex, diffFieldSchemas } from '../../core/fieldMeta/schemaV2.js';
import { showToast } from '../ui/toast.js';
export function handleShowFieldMetaDemo() {
    const v1Fields = [
        { id: 'cas', type: 'string', label: 'CAS', required: true },
        { id: 'value', type: 'number', label: 'Value', required: true },
        { id: 'unit', type: 'string', label: 'Unit', required: false },
    ];
    const v2Migrated = v1Fields.map(migrateV1ToV2);
    const v2New = [
        ...v2Migrated,
        createFieldV2('source', 'enum', { label: 'Source', enumValues: ['lab', 'field', 'imported'] }),
    ];
    const index = buildFieldIndex(v2New);
    const diff = diffFieldSchemas(v2Migrated, v2New);
    const casField = (index.get('cas') || {});
    const sourceField = (index.get('source') || {});
    const lines = [
        `Field Meta v2 demo — migrated ${v1Fields.length} v1→v2 fields`,
        `Index lookup: cas=${(casField as any).label || '?'}, source=${(sourceField as any).type || '?'}`,
        `Diff: +${diff.added.length} -${diff.removed.length} ~${diff.modified.length}`,
    ];
    showToast(lines.join(' • '), 'info', 7000);
}
export const fieldMetaHandlers = { handleShowFieldMetaDemo };
