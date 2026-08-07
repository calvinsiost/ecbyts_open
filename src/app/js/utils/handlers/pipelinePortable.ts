// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Kind portável `pipeline` (pipelines BPMN salvos) — P1-10 Fase B.
// Reusa core/pipelines/registry (savePipeline existente) + core/pipelines/schema
// (validatePipeline + parseBpmnXml). Permite usuário compartilhar pipelines
// como .ecbt (chooser Library | local) e reimportá-los em outras instâncias.
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';
import { registerPipelineArtifactKind } from '../../core/pipelines/pipelineArtifact.js';

const log = createLogger('PipelinePortable');

// Kind `pipeline` UNIFICADO — delega ao handler de core/pipelines/pipelineArtifact,
// que despacha por forma: NATIVA { nodes[], edges[], lanes? } (diagrama fiel) OU
// LEGADA { id, name, xml } (BPMN serializado, esta Fase B). Resolve a colisão
// histórica de dois registros do mesmo kind (registerKind era last-wins). Idempotente.
registerPipelineArtifactKind();

function _slug(s: unknown): string {
    return String(s || 'pipeline')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
}

function _download(text: string, filename: string): void {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Exporta um pipeline (por id) como chave .ecbt (chooser Library/local). */
export async function exportPipelineEcbt(pipelineId: string): Promise<{ ok: boolean; key?: string; filename?: string }> {
    try {
        const { getPipeline }: any = await import('../../core/pipelines/registry.js' as string);
        const pipeline = getPipeline(pipelineId);
        if (!pipeline) {
            showToast(t('pipeline.notFound') || 'Pipeline não encontrado.', 'warning');
            return { ok: false };
        }
        const pa: any = await import('../../core/io/portableArtifacts.js' as string);
        const lib: any = await import('../report/_ecbtLibraryStore.js' as string);
        const key = await pa.encodeArtifact('pipeline', pipeline);
        const target = await lib.chooseEcbtTarget('export');
        if (!target) return { ok: false };
        const name = pipeline.name || pipeline.id;
        const filename = `${_slug(name) || 'pipeline'}.ecbt`;
        if (target === 'library') {
            const ok = await lib.saveEcbtToLibrary({
                id: `pipeline-${_slug(pipeline.id)}`,
                kind: 'pipeline',
                name,
                key,
            });
            showToast(
                ok
                    ? t('ecbtLib.savedLibrary') || 'Salvo na Library ecbyts'
                    : t('pipeline.exportFailed') || 'Falha ao exportar',
                ok ? 'success' : 'error',
            );
            return { ok, key, filename };
        }
        _download(key, filename);
        showToast(t('pipeline.exported') || 'Pipeline salvo como .ecbt', 'success');
        return { ok: true, key, filename };
    } catch (e: any) {
        log.error('export pipeline ecbt failed:', e?.message || e);
        showToast(t('pipeline.exportFailed') || 'Falha ao exportar pipeline.', 'error');
        return { ok: false };
    }
}

/** Importa um pipeline de chave .ecbt (chooser Library/local) → persiste via savePipeline. */
export async function importPipelineEcbt(): Promise<{ ok: boolean; pipelineId?: string }> {
    try {
        const lib: any = await import('../report/_ecbtLibraryStore.js' as string);
        const source = await lib.chooseEcbtTarget('import');
        if (!source) return { ok: false };
        if (source === 'library') {
            const entry = await lib.pickFromEcbtLibrary('pipeline');
            if (!entry?.key) return { ok: false };
            return _importKeyFlow(entry.key);
        }
        return _importFromFileFlow();
    } catch (e: any) {
        log.error('import pipeline ecbt failed:', e?.message || e);
        showToast(t('pipeline.importFailed') || 'Falha ao importar pipeline.', 'error');
        return { ok: false };
    }
}

async function _importKeyFlow(key: string): Promise<{ ok: boolean; pipelineId?: string }> {
    const pa: any = await import('../../core/io/portableArtifacts.js' as string);
    const ok = await pa.importArtifactKey(String(key || '').trim());
    if (ok) {
        // re-renderiza a lista do gerenciador na hora (antes era preciso dar F5)
        try {
            const ph: any = await import('./pipelines.js' as string);
            ph.refreshPipelineManager?.();
        } catch (e: any) {
            log.error('refresh after import failed:', e?.message || e);
        }
    }
    showToast(
        ok
            ? t('pipeline.imported') || 'Pipeline importado'
            : t('pipeline.importNotPipeline') || 'Chave não contém um pipeline válido.',
        ok ? 'success' : 'error',
    );
    return { ok };
}

function _importFromFileFlow(): Promise<{ ok: boolean; pipelineId?: string }> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.ecbt,text/plain';
        input.style.display = 'none';
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) {
                resolve({ ok: false });
                return;
            }
            try {
                const text = await file.text();
                resolve(await _importKeyFlow(text));
            } catch (e: any) {
                log.error('read pipeline ecbt failed:', e?.message || e);
                showToast(t('pipeline.importFailed') || 'Falha ao ler arquivo.', 'error');
                resolve({ ok: false });
            } finally {
                input.remove();
            }
        });
        document.body.appendChild(input);
        input.click();
    });
}

if (typeof window !== 'undefined') {
    (window as any).exportPipelineEcbt = exportPipelineEcbt;
    (window as any).importPipelineEcbt = importPipelineEcbt;
}
