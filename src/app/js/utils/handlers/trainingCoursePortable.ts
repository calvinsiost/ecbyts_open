// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   TRAINING COURSE PORTABLE — COURSE-AUTHORING-001 (chave .ecbt do treinamento)

   Kind portável `training_course`: empacota o CourseDraft inteiro (o "treinamento"
   que o usuário está editando no editor do LMS — lmsAuthoringModal) numa chave
   .ecbt. Assim o autor exporta o material como um texto único (chave) para
   guardar, versionar ou enviar a outra pessoa, e importa de volta para continuar
   a edição. Espelha exatamente o handler de simulationScenarioPortable (P1-10
   Fase B): registerKind({validate, toArtifact, fromArtifact, applyImport}) +
   funções de export/import + window.* handlers.

   Diferença de propósito vs. simulationScenarioPortable:
   - O editor do LMS precisa CARREGAR o draft importado DENTRO do editor (substituir
     o draft em edição), não só persistir. Por isso `importTrainingCourseKeyToDraft`
     usa decode-ONLY (`decodeArtifact`) e devolve o objeto, deixando o caller decidir
     o que fazer. O `applyImport` (persiste via lmsAuthoringStore) continua disponível
     para o caminho `importArtifactKey` genérico.

   Persistência: o store dos cursos autorados é `utils/ui/lmsAuthoringStore`
   (IndexedDB offline-first). Este handler é apenas o codec portável + os adaptadores
   de UI; a regra de negócio de edição/validação vem do core puro
   (_courseAuthoringPure, F1).
   ================================================================ */

import { registerKind } from '../../core/io/portableArtifacts.js';
import { createLogger } from '../helpers/logger.js';
import type { CourseDraft } from '../../core/training/_courseAuthoringPure.js';

const log = createLogger('TrainingCoursePortable');

const KNOWN_COURSE_FIELDS = Object.freeze([
    'id',
    'title',
    'description',
    'category',
    'difficulty',
    'language',
    'ownerId',
    'provenance',
    'status',
    'version',
    'supersededBy',
    'lessons',
    'pricing',
    'createdAt',
    'updatedAt',
]);

function _clonePlainObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    try {
        const cloned = JSON.parse(JSON.stringify(value));
        return cloned && typeof cloned === 'object' && !Array.isArray(cloned) ? cloned : {};
    } catch (e: any) {
        log.debug('clonePlainObject:', e?.message || e);
        return {};
    }
}

function _extraPackageFields(value: unknown): Record<string, unknown> {
    const cloned = _clonePlainObject(value);
    for (const key of KNOWN_COURSE_FIELDS) {
        delete cloned[key];
    }
    return cloned;
}

/**
 * Shape mínimo aceito como "treinamento" portável. Validação leve: id + title
 * são strings não-vazias e `lessons` é um array. O restante dos campos do
 * CourseDraft é tolerante (defaults aplicados em from/toArtifact).
 */
function _isCourseShape(o: any): boolean {
    if (!o || typeof o !== 'object') return false;
    if (typeof o.id !== 'string' || o.id.trim() === '') return false;
    if (typeof o.title !== 'string' || o.title.trim() === '') return false;
    if (!Array.isArray(o.lessons)) return false;
    return true;
}

/**
 * Normaliza um CourseDraft para o artifact serializável. Mantém TODOS os campos
 * do shape (metadados + lições + pricing + proveniência) — uma chave .ecbt deve
 * reconstruir o curso por inteiro. Clona profundo (JSON) para não vazar referências
 * mutáveis do draft em edição.
 */
function _toArtifact(obj: unknown): unknown {
    const o: any = obj || {};
    const extraPackageFields = _extraPackageFields(o);
    let lessons: unknown[];
    try {
        lessons = Array.isArray(o.lessons) ? JSON.parse(JSON.stringify(o.lessons)) : [];
    } catch (e: any) {
        log.debug('toArtifact lessons clone:', e?.message || e);
        lessons = Array.isArray(o.lessons) ? o.lessons : [];
    }
    const pricing =
        o.pricing && typeof o.pricing === 'object'
            ? {
                  is_paid: !!o.pricing.is_paid,
                  price_cents: Math.max(0, Math.round(Number(o.pricing.price_cents) || 0)),
              }
            : { is_paid: false, price_cents: 0 };
    return {
        ...extraPackageFields,
        id: String(o.id || ''),
        title: String(o.title || ''),
        description: typeof o.description === 'string' ? o.description : '',
        category: typeof o.category === 'string' ? o.category : 'general',
        difficulty: ['beginner', 'intermediate', 'advanced'].includes(o.difficulty) ? o.difficulty : 'beginner',
        language: typeof o.language === 'string' ? o.language : 'pt-BR',
        ownerId: typeof o.ownerId === 'string' ? o.ownerId : 'local-user',
        provenance: o.provenance === 'first_party' ? 'first_party' : 'user_authored',
        status: ['draft', 'published', 'archived'].includes(o.status) ? o.status : 'draft',
        version: Number(o.version) > 0 ? Math.trunc(Number(o.version)) : 1,
        supersededBy: typeof o.supersededBy === 'string' ? o.supersededBy : null,
        lessons,
        pricing,
        createdAt: typeof o.createdAt === 'string' ? o.createdAt : '',
        updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : '',
    };
}

/**
 * Restaura o artifact num CourseDraft mutável pronto para edição. Decisões de
 * importação:
 * - status SEMPRE volta para 'draft' — uma chave importada é material de trabalho,
 *   nunca já "publicado" no dispositivo de quem importou (o publish é local + gera
 *   nova confiança). Espelha a regra anti-confiança do _courseAuthoringPure.
 * - version coerente: ≥1 (default 1).
 * - supersededBy zerado (a versão importada não supersede nada localmente).
 * - id preservado (colisão é responsabilidade do caller — ver lmsAuthoringModal).
 */
function _fromArtifact(artifact: unknown): CourseDraft {
    const a: any = artifact || {};
    const now = new Date().toISOString();
    const extraPackageFields = _extraPackageFields(a);
    let lessons: unknown[];
    try {
        lessons = Array.isArray(a.lessons) ? JSON.parse(JSON.stringify(a.lessons)) : [];
    } catch (e: any) {
        log.debug('fromArtifact lessons clone:', e?.message || e);
        lessons = Array.isArray(a.lessons) ? a.lessons : [];
    }
    const pricing =
        a.pricing && typeof a.pricing === 'object'
            ? {
                  is_paid: !!a.pricing.is_paid,
                  price_cents: Math.max(0, Math.round(Number(a.pricing.price_cents) || 0)),
              }
            : { is_paid: false, price_cents: 0 };
    return {
        ...extraPackageFields,
        id: typeof a.id === 'string' && a.id.trim() ? a.id : `course-imported-${Date.now()}`,
        title: String(a.title || ''),
        description: typeof a.description === 'string' ? a.description : '',
        category: typeof a.category === 'string' ? a.category : 'general',
        difficulty: (['beginner', 'intermediate', 'advanced'].includes(a.difficulty)
            ? a.difficulty
            : 'beginner') as CourseDraft['difficulty'],
        language: typeof a.language === 'string' ? a.language : 'pt-BR',
        ownerId: typeof a.ownerId === 'string' ? a.ownerId : 'local-user',
        provenance: a.provenance === 'first_party' ? 'first_party' : 'user_authored',
        status: 'draft', // importado = material de trabalho (ver JSDoc)
        version: Number(a.version) > 0 ? Math.trunc(Number(a.version)) : 1,
        supersededBy: null,
        lessons: lessons as CourseDraft['lessons'],
        pricing,
        createdAt: typeof a.createdAt === 'string' && a.createdAt ? a.createdAt : now,
        updatedAt: now,
    };
}

// Registra o kind no boot (idempotente por kind).
registerKind({
    kind: 'training_course',
    schemaVersion: 1,
    validate: (payload: unknown) => {
        if (!_isCourseShape(payload)) {
            return {
                valid: false,
                errors: ['Treinamento inválido — requer id (texto), title (texto) e lessons (lista).'],
            };
        }
        const errors: string[] = [];
        const p = payload as any;
        // lições: cada uma precisa de id + type (validação leve; o publish-gate
        // completo continua em _courseAuthoringPure ao publicar).
        (Array.isArray(p.lessons) ? p.lessons : []).forEach((l: any, i: number) => {
            if (!l || typeof l !== 'object') {
                errors.push(`lessons[${i}]: lição inválida (não é objeto).`);
                return;
            }
            if (typeof l.id !== 'string' || l.id.trim() === '') {
                errors.push(`lessons[${i}].id: id da lição obrigatório.`);
            }
            if (typeof l.type !== 'string' || l.type.trim() === '') {
                errors.push(`lessons[${i}].type: tipo da lição obrigatório.`);
            }
        });
        return { valid: errors.length === 0, errors };
    },
    toArtifact: _toArtifact,
    fromArtifact: _fromArtifact,
    applyImport: async (obj: unknown) => {
        // Caminho genérico (importArtifactKey): persiste no store de cursos autorados.
        try {
            if (!obj || typeof obj !== 'object') return false;
            const store: any = await import('../ui/lmsAuthoringStore.js' as string);
            return await store.saveAuthoredCourse(obj as CourseDraft);
        } catch (e: any) {
            log.error('applyImport failed:', e?.message || e);
            return false;
        }
    },
});

/**
 * Exporta o treinamento (CourseDraft em edição) como chave .ecbt portável.
 * Delegação direta a encodeArtifact('training_course', draft): valida → toArtifact
 * → wrapper → encodeKey. Lança se o draft for inválido (caller trata o toast).
 */
export async function exportTrainingCourseKey(draft: CourseDraft): Promise<string> {
    const pa: any = await import('../../core/io/portableArtifacts.js' as string);
    return pa.encodeArtifact('training_course', draft);
}

/**
 * Importa uma chave .ecbt e devolve o CourseDraft (decode-ONLY, sem persistir).
 * O editor do LMS usa este caminho para CARREGAR o treinamento importado dentro
 * do editor (substituir o draft em edição). Retorna null se a chave não for um
 * treinamento válido (kind ≠ 'training_course' ou chave malformada).
 */
export async function importTrainingCourseKeyToDraft(keyText: string): Promise<CourseDraft | null> {
    try {
        const pa: any = await import('../../core/io/portableArtifacts.js' as string);
        const res = await pa.decodeArtifact(String(keyText || '').trim());
        if (!res || res.kind !== 'training_course' || !res.obj) return null;
        return res.obj as CourseDraft;
    } catch (e: any) {
        log.debug('importTrainingCourseKeyToDraft failed:', e?.message || e);
        return null;
    }
}

if (typeof window !== 'undefined') {
    (window as any).exportTrainingCourseKey = exportTrainingCourseKey;
    (window as any).importTrainingCourseKeyToDraft = importTrainingCourseKeyToDraft;
}
