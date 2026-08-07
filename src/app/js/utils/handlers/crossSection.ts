// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Cross-section UI Handlers - Controles para cortes geológicos 2D
 */
import { createTHREEProxy } from '../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
import { sampleAlongLine, renderCrossSection, exportCrossSectionPNG } from '../../core/interpolation/crossSection.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { isCapabilityEnabled } from '../../config/libraryCategories.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('CrossSection');
let _isDrawingLine = false;
let _lineStart: any = null;
let _lineEnd: any = null;
let _currentSamples: any = null;
let _currentSvg: any = null;
/**
 * Inicia modo de desenho de linha para corte.
 */
export function handleStartCrossSection() {
    _isDrawingLine = true;
    _lineStart = null;
    _lineEnd = null;
    showToast('Clique no ponto A (início do corte)', 'info');
    // Registra listener temporário no canvas
    const canvas = document.getElementById('main-canvas');
    if (canvas) {
        canvas.style.cursor = 'crosshair';
        canvas.addEventListener('click', _onCanvasClick, { once: false });
    }
    // Atualiza UI
    const btn = document.getElementById('cross-section-draw-btn');
    if (btn)
        btn.classList.add('active');
}
/**
 * Handler de clique no canvas durante modo de desenho.
 */
function _onCanvasClick(event: any) {
    if (!_isDrawingLine)
        return;
    // Obtém coordenadas do clique no mundo 3D
    const coords = _getWorldCoordinates(event);
    if (!coords)
        return;
    if (!_lineStart) {
        _lineStart = coords;
        showToast('Agora clique no ponto B (fim do corte)', 'info');
        // Marca ponto A visualmente
        _markPoint(coords, 'A');
    }
    else if (!_lineEnd) {
        _lineEnd = coords;
        _finishDrawing();
    }
}
/**
 * Converte coordenadas de tela para mundo (simplificado).
 */
function _getWorldCoordinates(event: any) {
    // Obtém o renderer/câmera da cena
    const canvas = document.getElementById('main-canvas');
    if (!canvas)
        return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    // Raycasting simplificado - assume plano XZ em y=0
    // Na prática, usar o raycaster da aplicação
    const raycaster = (window as any)._sceneRaycaster;
    const camera = (window as any)._sceneCamera;
    if (!raycaster || !camera) {
        // Fallback: retorna posição aproximada baseada na view
        return _approximateWorldPosition(x, y);
    }
    raycaster.setFromCamera({ x, y }, camera);
    const intersects = raycaster.intersectObjects((window as any)._sceneChildren || [], true);
    if (intersects.length > 0) {
        return { x: intersects[0].point.x, z: intersects[0].point.z };
    }
    // Intersecção com plano XZ
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, target);
    return target ? { x: target.x, z: target.z } : null;
}
/**
 * Aproximação de posição mundo quando raycaster não disponível.
 */
function _approximateWorldPosition(ndcX: any, ndcY: any) {
    // Estima baseado na câmera atual
    const camera = (window as any)._sceneCamera;
    if (!camera)
        return { x: ndcX * 200, z: ndcY * 200 };
    const vector = new THREE.Vector3(ndcX, ndcY, 0.5);
    vector.unproject(camera);
    const dir = vector.sub(camera.position).normalize();
    const distance = -camera.position.y / dir.y;
    const pos = camera.position.clone().add(dir.multiplyScalar(distance));
    return { x: pos.x, z: pos.z };
}
/**
 * Marca um ponto visualmente na cena.
 */
function _markPoint(coords: any, label: any) {
    // Cria um marcador simples (usa o sistema de elementos se disponível)
    if (typeof (window as any).createMarker === 'function') {
        (window as any).createMarker({
            x: coords.x,
            y: 0,
            z: coords.z,
            label: `Ponto ${label}`,
            color: label === 'A' ? '#00ff00' : '#ff0000',
        });
    }
}
/**
 * Finaliza o desenho e gera o corte.
 */
async function _finishDrawing() {
    _isDrawingLine = false;
    // Restaura cursor
    const canvas = document.getElementById('main-canvas');
    if (canvas) {
        canvas.style.cursor = 'default';
        canvas.removeEventListener('click', _onCanvasClick);
    }
    const btn = document.getElementById('cross-section-draw-btn');
    if (btn)
        btn.classList.remove('active');
    // Gera o corte
    showToast('Gerando corte geológico...', 'info');
    try {
        _currentSamples = sampleAlongLine(_lineStart, _lineEnd, 200);
        if (_currentSamples.length === 0) {
            showToast('Nenhuma superfície geológica encontrada', 'warning');
            return;
        }
        // Abre o painel e renderiza
        handleOpenCrossSectionPanel();
        const container = document.getElementById('cross-section-canvas');
        if (container) {
            const result = renderCrossSection(_currentSamples, container, {
                width: container.clientWidth || 800,
                height: 400,
                padding: 40,
            });
            if (!result) {
                showToast('Erro ao renderizar corte geologico', 'error');
                return;
            }
            _currentSvg = container.querySelector('svg');
            // Mostra info
            const infoEl = document.getElementById('cross-section-info');
            if (infoEl) {
                const length = Math.sqrt((_lineEnd.x - _lineStart.x) ** 2 + (_lineEnd.z - _lineStart.z) ** 2);
                infoEl.innerHTML = `
                    <div>Distância: ${length.toFixed(1)} m</div>
                    <div>Pontos: ${_currentSamples.length}</div>
                    <div>Elevação: ${result.bounds.minY.toFixed(1)} - ${result.bounds.maxY.toFixed(1)} m</div>
                `;
            }
        }
        showToast('Corte gerado com sucesso', 'success');
    }
    catch (err: any) {
        log.error('Cross-section generation failed', err?.message);
        showToast('Erro ao gerar corte: ' + err?.message, 'error');
    }
}
/**
 * Abre o painel lateral de corte geológico.
 */
export function handleOpenCrossSectionPanel() {
    // MOD-LIB-MIG-001 M2 — respeita o toggle do Library Hub. Default = enabled.
    if (!isCapabilityEnabled('crossSection')) {
        showToast(
            t('library.capabilityDisabled')
                || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    const panel = document.getElementById('cross-section-panel');
    if (panel) {
        panel.classList.add('visible');
        panel.style.display = 'block';
    }
}
/**
 * Fecha o painel de corte.
 */
export function handleCloseCrossSectionPanel() {
    const panel = document.getElementById('cross-section-panel');
    if (panel) {
        panel.classList.remove('visible');
        panel.style.display = 'none';
    }
}
/**
 * Exporta o corte atual como PNG.
 */
export async function handleExportCrossSection() {
    if (!_currentSvg) {
        showToast('Nenhum corte para exportar', 'warning');
        return;
    }
    try {
        await exportCrossSectionPNG(_currentSvg, `corte-geologico-${Date.now()}.png`);
        showToast('Corte exportado', 'success');
    }
    catch (err: any) {
        log.error('Cross-section export failed', err?.message);
        showToast('Erro na exportação: ' + err?.message, 'error');
    }
}
/**
 * Cancela o modo de desenho.
 */
export function handleCancelCrossSection() {
    _isDrawingLine = false;
    _lineStart = null;
    _lineEnd = null;
    const canvas = document.getElementById('main-canvas');
    if (canvas) {
        canvas.style.cursor = 'default';
        canvas.removeEventListener('click', _onCanvasClick);
    }
    const btn = document.getElementById('cross-section-draw-btn');
    if (btn)
        btn.classList.remove('active');
}
// Registra funções globais para acesso via onclick
if (typeof window !== 'undefined') {
    window.handleStartCrossSection = handleStartCrossSection;
    window.handleOpenCrossSectionPanel = handleOpenCrossSectionPanel;
    window.handleCloseCrossSectionPanel = handleCloseCrossSectionPanel;
    window.handleExportCrossSection = handleExportCrossSection;
    window.handleCancelCrossSection = handleCancelCrossSection;
}
