// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Kind portável `report_template` (AI Report Templates) — P1-10 + Fase 1.8 do
// SPEC_AI_REPORT_TEMPLATE_MARKETPLACE. Registra o handler no registry de artefatos
// e expõe export/import de um template como chave .ecbt (Library ecbyts | local).
// Reusa core/report/aiReportBot (saveCustomTemplate) + core/report/_aiReportTemplatePure
// (validateTemplateDraft — placeholder whitelist + role-injection scan + length caps).
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';
import { registerKind } from '../../core/io/portableArtifacts.js';
import { validateTemplateDraft } from '../../core/report/_aiReportTemplatePure.js';

const log = createLogger('ReportTemplatePortable');

// Registra o kind `report_template` no boot deste módulo (idempotente).
registerKind({
    kind: 'report_template',
    schemaVersion: 1,
    validate: (payload: unknown) => {
        // Reusa a validação Fase 1 (whitelist + role-injection + length caps).
        const v = validateTemplateDraft(payload as any);
        return { valid: v.valid, errors: v.errors };
    },
    toArtifact: (obj: unknown) => {
        // Strip de runtime fields (renderedAt etc.); mantém só o que define o template.
        const o: any = obj || {};
        return {
            id: typeof o.id === 'string' ? o.id : '',
            name: String(o.name || ''),
            description: String(o.description || ''),
            systemPrompt: String(o.systemPrompt || ''),
            userPromptTemplate: String(o.userPromptTemplate || ''),
            requiredContext: Array.isArray(o.requiredContext) ? o.requiredContext.map(String) : [],
            defaultTone: o.defaultTone === 'executive' ? 'executive' : 'technical',
            isCustom: true,
            // Provenance opcional (Fase 1.8): autor + versão para rastreabilidade
            authorId: typeof o.authorId === 'string' ? o.authorId : undefined,
            version: typeof o.version === 'number' ? o.version : undefined,
            marketplaceAssetId: typeof o.marketplaceAssetId === 'string' ? o.marketplaceAssetId : undefined,
        };
    },
    fromArtifact: (artifact: unknown) => {
        const a: any = artifact || {};
        return {
            id: typeof a.id === 'string' && a.id ? a.id : `imported-${Date.now()}`,
            name: String(a.name || ''),
            description: String(a.description || ''),
            systemPrompt: String(a.systemPrompt || ''),
            userPromptTemplate: String(a.userPromptTemplate || ''),
            requiredContext: Array.isArray(a.requiredContext) ? a.requiredContext.map(String) : [],
            defaultTone: a.defaultTone === 'executive' ? 'executive' : 'technical',
            isCustom: true,
            importedFrom: a.marketplaceAssetId ? 'library' : 'file',
            authorId: typeof a.authorId === 'string' ? a.authorId : undefined,
            version: typeof a.version === 'number' ? a.version : undefined,
            marketplaceAssetId: typeof a.marketplaceAssetId === 'string' ? a.marketplaceAssetId : undefined,
        };
    },
    applyImport: async (obj: unknown) => {
        try {
            const bot: any = await import('../../core/report/aiReportBot.js' as string);
            const res = await bot.saveCustomTemplate(obj);
            return !!res;
        } catch (e: any) {
            log.error('applyImport failed:', e?.message || e);
            return false;
        }
    },
});

function _slug(s: unknown): string {
    return String(s || 'report-template')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
}

/** Exporta um template (por id) como chave .ecbt — chooser Library/local pelo consumidor UI. */
export async function exportReportTemplateEcbt(templateId: string): Promise<{ ok: boolean; key?: string; filename?: string }> {
    try {
        const bot: any = await import('../../core/report/aiReportBot.js' as string);
        const all = (await bot.getCustomTemplates?.()) || [];
        const tpl = all.find((t: any) => t?.id === templateId);
        if (!tpl) {
            showToast(t('reportTemplate.notFound') || 'Template não encontrado', 'error');
            return { ok: false };
        }
        const { encodeArtifact }: any = await import('../../core/io/portableArtifacts.js');
        const key = await encodeArtifact('report_template', tpl);
        const filename = `${_slug(tpl.name)}.ecbt`;
        return { ok: true, key, filename };
    } catch (e: any) {
        log.error('export failed:', e?.message || e);
        showToast(e?.message || 'Falha ao exportar', 'error');
        return { ok: false };
    }
}

/** Importa um template de chave .ecbt → persiste em IDB via saveCustomTemplate. */
export async function importReportTemplateEcbt(key: string): Promise<{ ok: boolean; templateId?: string }> {
    try {
        const { decodeArtifactAndApply }: any = await import('../../core/io/portableArtifacts.js');
        const res = await decodeArtifactAndApply(key);
        if (!res?.ok || res.kind !== 'report_template') {
            showToast(t('reportTemplate.importFail') || 'Falha ao importar template', 'error');
            return { ok: false };
        }
        showToast(t('reportTemplate.imported') || 'Template importado', 'success');
        return { ok: true, templateId: (res.obj as any)?.id };
    } catch (e: any) {
        log.error('import failed:', e?.message || e);
        showToast(e?.message || 'Falha ao importar', 'error');
        return { ok: false };
    }
}

if (typeof window !== 'undefined') {
    (window as any).exportReportTemplateEcbt = exportReportTemplateEcbt;
    (window as any).importReportTemplateEcbt = importReportTemplateEcbt;
}
