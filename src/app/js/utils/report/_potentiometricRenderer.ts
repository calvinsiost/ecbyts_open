// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Renderer pure (SVG) de MAPA POTENCIOMÉTRICO — F5 da gap analysis CETESB DD 038/2017
// IC §2.1.l. Plota cargas hidráulicas observadas em poços (cota piezométrica em metros)
// como pontos amostrados + curvas isopiezométricas (aproximação simples por proximidade
// de nível) + setas de fluxo subterrâneo (do maior head para o menor head, em pares
// adjacentes). Sem DOM/canvas — cheap-testável. Reusa svgToDataUrl do radius plan.
import { svgToDataUrl } from './_radiusPlanRenderer.js';

export interface HeadPoint {
    /** Coordenada X em metros (UTM projetado ou local). */
    x: number;
    /** Coordenada Z em metros (UTM projetado ou local). */
    z: number;
    /** Carga hidráulica = cota piezométrica em metros. */
    head: number;
    /** Nome do poço para rótulo (opcional). */
    label?: string;
}

export interface PotentiometricOpts {
    title?: string;
    /** Largura total do SVG (default 480). */
    width?: number;
    /** Intervalo de contorno em metros (default auto via _niceTick). */
    contourInterval?: number;
    /** Desenhar setas de fluxo subterrâneo (default true). */
    showFlowArrows?: boolean;
    /** Metadados cartográficos para o rodapé. */
    centerLabel?: { source?: string; datum?: string };
}

function _esc(s: unknown): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Escolhe um intervalo "redondo" para contornos isopiezométricos. */
function _niceTick(range: number, targetCount: number = 5): number {
    if (!Number.isFinite(range) || range <= 0) return 1;
    const target = range / targetCount;
    const candidates = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100];
    let best = candidates[0] as number;
    let bestDelta = Math.abs(Math.log((candidates[0] as number) / target));
    for (const c of candidates) {
        const d = Math.abs(Math.log(c / target));
        if (d < bestDelta) {
            best = c;
            bestDelta = d;
        }
    }
    return best;
}

/**
 * Filtra pontos defensivamente: descarta NaN/Infinity em x/z/head. Mantém ordem.
 */
function _safePoints(points: HeadPoint[]): HeadPoint[] {
    if (!Array.isArray(points)) return [];
    return points.filter(
        (p) =>
            p &&
            typeof p.x === 'number' &&
            Number.isFinite(p.x) &&
            typeof p.z === 'number' &&
            Number.isFinite(p.z) &&
            typeof p.head === 'number' &&
            Number.isFinite(p.head),
    );
}

/**
 * Constrói o SVG (string) do mapa potenciométrico. Pure — sem efeitos colaterais.
 * Mínimo 3 pontos para triangulação; abaixo disso retorna placeholder.
 *
 * Algoritmo de contornos (simplificação aceitável documentada na spec F5):
 * para cada nível L entre minHead e maxHead com passo `contourInterval`, conecta
 * pares de pontos cujo head esteja dentro de ±interval/2 do nível L (linha cinza
 * tracejada). Rótulo do nível centrado no segmento. Não-IDW — aproximação visual.
 *
 * Algoritmo de setas de fluxo (showFlowArrows=true): para cada ponto, encontra o
 * vizinho mais próximo (em distância XZ) com head MENOR que o seu — desenha seta
 * apontando para o ponto de menor cota (fluxo segue gradiente descendente de carga).
 */
export function buildPotentiometricSvg(points: HeadPoint[], opts: PotentiometricOpts = {}): string {
    const W = typeof opts.width === 'number' && opts.width >= 200 ? Math.floor(opts.width) : 480;
    const pts = _safePoints(points);

    // Placeholder se < 3 pontos (mínimo p/ triangulação).
    if (pts.length < 3) {
        return (
            `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="90" viewBox="0 0 ${W} 90" font-family="sans-serif">` +
            `<rect width="${W}" height="90" fill="#f8fafc"/>` +
            `<text x="${W / 2}" y="50" text-anchor="middle" font-size="13" fill="#555">Mínimo 3 pontos para mapa potenciométrico</text></svg>`
        );
    }

    // Bounding box dos pontos.
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let minHead = Infinity;
    let maxHead = -Infinity;
    for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
        if (p.head < minHead) minHead = p.head;
        if (p.head > maxHead) maxHead = p.head;
    }
    // Padding nos extremos do bbox p/ evitar pontos na borda.
    const xPad = (maxX - minX) * 0.08 || 1;
    const zPad = (maxZ - minZ) * 0.08 || 1;
    minX -= xPad;
    maxX += xPad;
    minZ -= zPad;
    maxZ += zPad;

    const padL = 56;
    const padR = 40;
    const padTop = 40;
    const padBottom = 40;
    const FOOTER_H = 50;
    const drawW = W - padL - padR;
    // Manter proporção 1:1 (X:Z) — drawH proporcional ao bbox aspect ratio.
    const aspect = (maxZ - minZ) / (maxX - minX) || 1;
    const drawH = Math.max(180, Math.min(420, Math.round(drawW * aspect)));
    const H = drawH + padTop + padBottom;
    const totalH = H + FOOTER_H;
    const drawX0 = padL;
    const drawX1 = padL + drawW;
    const drawY0 = padTop;
    const drawY1 = padTop + drawH;

    const mapX = (xM: number) => drawX0 + ((xM - minX) / (maxX - minX)) * drawW;
    const mapY = (zM: number) => drawY1 - ((zM - minZ) / (maxZ - minZ)) * drawH;

    // Defs: marker de seta + plano de fundo.
    const defs =
        `<defs>` +
        `<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
        `<path d="M0,0 L10,5 L0,10 z" fill="#1f3a5f"/>` +
        `</marker>` +
        `</defs>`;

    // Eixos (linhas + ticks + labels).
    const tickX = _niceTick(maxX - minX, 5);
    const tickZ = _niceTick(maxZ - minZ, 5);
    const xTicks: string[] = [];
    const xStart = Math.ceil(minX / tickX) * tickX;
    for (let xv = xStart; xv <= maxX + 0.001; xv += tickX) {
        const tx = mapX(xv);
        xTicks.push(
            `<line x1="${tx.toFixed(1)}" y1="${drawY1}" x2="${tx.toFixed(1)}" y2="${(drawY1 + 4).toFixed(1)}" stroke="#222"/>` +
                `<text x="${tx.toFixed(1)}" y="${(drawY1 + 15).toFixed(1)}" text-anchor="middle" font-size="9" fill="#222">${(xv - minX).toFixed(0)}</text>`,
        );
    }
    const zTicks: string[] = [];
    const zStart = Math.ceil(minZ / tickZ) * tickZ;
    for (let zv = zStart; zv <= maxZ + 0.001; zv += tickZ) {
        const ty = mapY(zv);
        zTicks.push(
            `<line x1="${(drawX0 - 4).toFixed(1)}" y1="${ty.toFixed(1)}" x2="${drawX0}" y2="${ty.toFixed(1)}" stroke="#222"/>` +
                `<text x="${(drawX0 - 6).toFixed(1)}" y="${(ty + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#222">${(zv - minZ).toFixed(0)}</text>`,
        );
    }
    const xAxis =
        `<line x1="${drawX0}" y1="${drawY1}" x2="${drawX1}" y2="${drawY1}" stroke="#222" stroke-width="1"/>` +
        xTicks.join('') +
        `<text x="${((drawX0 + drawX1) / 2).toFixed(1)}" y="${(drawY1 + 30).toFixed(1)}" text-anchor="middle" font-size="10" fill="#444">Δx (m)</text>`;
    const zAxis =
        `<line x1="${drawX0}" y1="${drawY0}" x2="${drawX0}" y2="${drawY1}" stroke="#222" stroke-width="1"/>` +
        zTicks.join('') +
        `<text x="14" y="${((drawY0 + drawY1) / 2).toFixed(1)}" text-anchor="middle" font-size="10" fill="#444" transform="rotate(-90 14,${((drawY0 + drawY1) / 2).toFixed(1)})">Δz (m)</text>`;

    // Curvas isopiezométricas — aproximação simples por proximidade de nível.
    const interval =
        typeof opts.contourInterval === 'number' && opts.contourInterval > 0
            ? opts.contourInterval
            : _niceTick(maxHead - minHead, 5);
    const halfInt = interval / 2;
    const contourLines: string[] = [];
    // Para cada nível, percorre pares e conecta os "cruzamentos" aproximados.
    for (let level = Math.ceil(minHead / interval) * interval; level <= maxHead + 0.001; level += interval) {
        const segs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
        for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
                const pi = pts[i] as HeadPoint;
                const pj = pts[j] as HeadPoint;
                // Conecta pares cujos heads "atravessam" o nível (um acima, um abaixo)
                // OU ambos próximos do nível (±halfInt).
                const piNear = Math.abs(pi.head - level) <= halfInt;
                const pjNear = Math.abs(pj.head - level) <= halfInt;
                const crosses = (pi.head - level) * (pj.head - level) <= 0; // sinais opostos ou zero
                if (!crosses && !(piNear && pjNear)) continue;
                // Interpolação linear para o ponto exato do cruzamento (quando crosses).
                if (crosses && pi.head !== pj.head) {
                    const t = (level - pi.head) / (pj.head - pi.head);
                    const xL = pi.x + t * (pj.x - pi.x);
                    const zL = pi.z + t * (pj.z - pi.z);
                    segs.push({ x1: mapX(xL), y1: mapY(zL), x2: mapX(xL), y2: mapY(zL) });
                } else if (piNear && pjNear) {
                    segs.push({ x1: mapX(pi.x), y1: mapY(pi.z), x2: mapX(pj.x), y2: mapY(pj.z) });
                }
            }
        }
        // Conecta segmentos do mesmo nível em sequência (proximidade simples).
        // Para simplicidade, desenha cada segmento como linha tracejada cinza.
        for (const s of segs) {
            if (s.x1 === s.x2 && s.y1 === s.y2) continue;
            contourLines.push(
                `<line x1="${s.x1.toFixed(1)}" y1="${s.y1.toFixed(1)}" x2="${s.x2.toFixed(1)}" y2="${s.y2.toFixed(1)}" stroke="#666" stroke-width="0.9" stroke-dasharray="3 2" fill="none"/>`,
            );
        }
        // Rótulo do nível: posiciona no primeiro segmento (centro).
        const first = segs.find((s) => s.x1 !== s.x2 || s.y1 !== s.y2);
        if (first) {
            const cxL = (first.x1 + first.x2) / 2;
            const cyL = (first.y1 + first.y2) / 2;
            contourLines.push(
                `<text x="${cxL.toFixed(1)}" y="${cyL.toFixed(1)}" font-size="8" fill="#444" text-anchor="middle" stroke="#f8fafc" stroke-width="2" paint-order="stroke">${level.toFixed(2)}</text>`,
            );
        }
    }

    // Setas de fluxo: para cada ponto, conecta ao vizinho mais próximo com head menor.
    const flowArrows: string[] = [];
    const showFlow = opts.showFlowArrows !== false;
    if (showFlow && pts.length >= 2) {
        for (const p of pts) {
            let target: HeadPoint | null = null;
            let bestD = Infinity;
            for (const q of pts) {
                if (q === p) continue;
                if (q.head >= p.head) continue; // só vizinhos com head menor
                const dx = q.x - p.x;
                const dz = q.z - p.z;
                const d = Math.sqrt(dx * dx + dz * dz);
                if (d < bestD) {
                    bestD = d;
                    target = q;
                }
            }
            if (target) {
                const x1 = mapX(p.x);
                const y1 = mapY(p.z);
                const x2 = mapX(target.x);
                const y2 = mapY(target.z);
                flowArrows.push(
                    `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#1f3a5f" stroke-width="1.2" marker-end="url(#arrow)" opacity="0.7"/>`,
                );
            }
        }
    }

    // Pontos amostrados (círculos pretos + rótulo com head).
    const dots: string[] = [];
    for (const p of pts) {
        const px = mapX(p.x).toFixed(1);
        const py = mapY(p.z).toFixed(1);
        dots.push(`<circle cx="${px}" cy="${py}" r="4" fill="#000" stroke="#fff" stroke-width="0.8"/>`);
        const headLbl = `${p.head.toFixed(2)} m`;
        dots.push(
            `<text x="${(Number(px) + 6).toFixed(1)}" y="${(Number(py) + 3).toFixed(1)}" font-size="9" fill="#1a1a1a" font-weight="bold" stroke="#fff" stroke-width="2" paint-order="stroke">${_esc(headLbl)}</text>`,
        );
        if (p.label) {
            const lbl = String(p.label).trim();
            if (lbl && lbl.length <= 24) {
                dots.push(
                    `<text x="${(Number(px) + 6).toFixed(1)}" y="${(Number(py) - 5).toFixed(1)}" font-size="8" fill="#444" stroke="#fff" stroke-width="2" paint-order="stroke">${_esc(lbl)}</text>`,
                );
            }
        }
    }

    // Rodapé com título + datum + source.
    const title = _esc(opts.title || 'Mapa potenciométrico — superfície piezométrica');
    const datum = _esc(opts.centerLabel?.datum || '');
    const source = _esc(opts.centerLabel?.source || '');
    const footer =
        `<rect x="0" y="${H}" width="${W}" height="${FOOTER_H}" fill="#ffffff" stroke="#cccccc"/>` +
        `<text x="${W / 2}" y="${H + 14}" text-anchor="middle" font-size="11" fill="#222" font-weight="bold">${title}</text>` +
        (datum ? `<text x="${W / 2}" y="${H + 28}" text-anchor="middle" font-size="10" fill="#555">${datum}</text>` : '') +
        (source ? `<text x="${W / 2}" y="${H + 42}" text-anchor="middle" font-size="9" fill="#888" font-style="italic">${source}</text>` : '');

    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}" font-family="sans-serif">` +
        defs +
        `<rect width="${W}" height="${totalH}" fill="#f8fafc"/>` +
        contourLines.join('') +
        flowArrows.join('') +
        dots.join('') +
        xAxis +
        zAxis +
        footer +
        `</svg>`
    );
}

/** Conveniência: SVG do mapa potenciométrico direto como data URL embutível. */
export function buildPotentiometricDataUrl(points: HeadPoint[], opts: PotentiometricOpts = {}): string {
    return svgToDataUrl(buildPotentiometricSvg(points, opts));
}
