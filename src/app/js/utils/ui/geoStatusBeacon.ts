// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   GEO STATUS BEACON — faróis de confiança terreno + georreferência
   Pedido Calvin 2026-06-11: "faróis verdes e vermelhos se o terreno
   carregou e se o local está corretamente posicionado".

   Dois dots no statusbar (#geo-status-beacon), pattern do
   consistencyStatusBadge (North Star v2: confiança VISÍVEL):

   LOCAL (georreferência) — verificação REAL, não cosmética:
     verde   = origem definida E zona UTM consistente com a longitude
               reconvertida (teria detectado o bug 2026-06-11 em que
               zona 23 era gravada sobre easting de outra zona →
               globo/terreno/aerial ~6° deslocados no oceano)
     vermelho = zona gravada ≠ zona esperada da longitude (georef
               corrompida) OU lat/lon reconvertidos inválidos
     cinza   = sem origem (modelo sem geolocalização — legítimo)

   TERRENO — alimentado por eventos ecbyts:terrain-status dispatched
   pelo random-postboot (start/ok/skipped/error/waiting-scene) + poll
   das layers do interpolation manager:
     verde   = camada de terreno criada
     amarelo = carregando / aguardando cena 3D (retry agendado)
     vermelho = falha na criação/fetch de elevação
     cinza   = desabilitado ou skip legítimo (sem origem)

   Substitui o texto estático "UTM Zone 23S" do statusbar (mentia para
   toda zona ≠ 23) — o farol LOCAL mostra a zona REAL da origem.
   Sem emoji (regra ecbyts) — dots via SVG circle. Labels PT seguindo
   precedente consistencyStatusBadge.
   ================================================================ */

const BEACON_ID = 'geo-status-beacon';
const POLL_MS = 30_000;

const DOT_COLORS: Record<string, string> = {
    green: '#15803d',
    yellow: '#ca8a04',
    red: '#dc2626',
    gray: '#9ca3af',
};

export type GeoLightState = 'green' | 'yellow' | 'red' | 'gray';

export interface GeoBeaconState {
    local: GeoLightState;
    localDetail: string;
    terrain: GeoLightState;
    terrainDetail: string;
    utmLabel: string;
}

let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _lastTerrainEvent: { state: string; reason?: string } | null = null;
let _listenersBound = false;

function svgDot(color: string): string {
    return (
        '<svg width="9" height="9" viewBox="0 0 10 10" ' +
        'style="margin-right:3px;vertical-align:middle" aria-hidden="true">' +
        `<circle cx="5" cy="5" r="4" fill="${color}" stroke="rgba(0,0,0,0.25)" stroke-width="0.5" />` +
        '</svg>'
    );
}

/**
 * Zona UTM esperada para uma longitude (sem exceções Noruega — as 20
 * AERIAL_LOCATIONS do random não caem nelas; origens manuais nessas
 * faixas raras gerariam falso-vermelho aceitável com tooltip explicativo).
 */
export function expectedUtmZone(longitude: number): number {
    return Math.floor((longitude + 180) / 6) + 1;
}

/**
 * Pure resolver — estado do farol LOCAL a partir da origem.
 * Exportado para testes (precedente resolveBadgeStatus).
 *
 * `truth` (opcional): lat/lon REAIS gravados por phase-context no momento
 * da criação do modelo (__ecbytsGeoTruth) — âncora INDEPENDENTE do
 * round-trip UTM. Sem ela, o check de zona-vs-longitude é circular
 * (reconverter com a própria zona gravada sempre "bate") e só pega
 * origens estruturalmente inválidas.
 */
export function resolveLocalState(
    origin: any,
    reconverted: any,
    truth?: { lat: number; lon: number } | null,
): { state: GeoLightState; detail: string; utmLabel: string } {
    if (!origin) {
        return { state: 'gray', detail: 'Sem origem geográfica definida (modelo local puro)', utmLabel: 'UTM —' };
    }
    const zone = Number(origin.zone);
    const hemi = origin.hemisphere === 'N' ? 'N' : 'S';
    const utmLabel = `UTM ${Number.isFinite(zone) ? zone : '?'}${hemi}`;
    const lat = Number(reconverted?.latitude);
    const lon = Number(reconverted?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        return { state: 'red', detail: 'Origem inválida — reconversão WGS84 falhou', utmLabel };
    }
    // Check forte (âncora independente): posição reconvertida vs verdade.
    if (truth && Number.isFinite(truth.lat) && Number.isFinite(truth.lon)) {
        const dist = Math.hypot(lat - truth.lat, lon - truth.lon);
        if (dist > 0.5) {
            return {
                state: 'red',
                detail: `Posição DESLOCADA ${dist.toFixed(1)}° do local real (${truth.lat.toFixed(2)}, ${truth.lon.toFixed(2)}) — georreferência corrompida (zona UTM?)`,
                utmLabel,
            };
        }
        return {
            state: 'green',
            detail: `Local verificado: ${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'} confere com o local sorteado (zona ${zone}${hemi})`,
            utmLabel,
        };
    }
    // Check fraco (sem âncora — ex: sessão restaurada): só estrutura.
    const expected = expectedUtmZone(lon);
    if (Number.isFinite(zone) && zone !== expected) {
        return {
            state: 'red',
            detail: `Georreferência inconsistente: zona gravada ${zone}, esperada ${expected} para lon ${lon.toFixed(2)}°`,
            utmLabel,
        };
    }
    return {
        state: 'green',
        detail: `Local posicionado: ${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'} (zona ${zone}${hemi}; sem âncora de verificação nesta sessão)`,
        utmLabel,
    };
}

/**
 * Pure resolver — estado do farol TERRENO a partir do último evento +
 * presença de layer terrain no manager. Exportado para testes.
 */
export function resolveTerrainState(
    lastEvent: { state: string; reason?: string } | null,
    hasTerrainLayer: boolean,
    hasOriginFlag: boolean,
): { state: GeoLightState; detail: string } {
    if (hasTerrainLayer) {
        return { state: 'green', detail: 'Terreno carregado (camada de elevação ativa)' };
    }
    const ev = lastEvent?.state || null;
    if (ev === 'loading' || ev === 'waiting-scene') {
        return {
            state: 'yellow',
            detail: ev === 'waiting-scene'
                ? 'Terreno aguardando a cena 3D (carrega ao entrar na vista 3D)'
                : 'Terreno carregando em segundo plano…',
        };
    }
    if (ev === 'error') {
        return { state: 'red', detail: `Falha ao carregar terreno: ${lastEvent?.reason || 'erro desconhecido'}` };
    }
    if (ev === 'skipped') {
        return { state: 'gray', detail: `Terreno não aplicado: ${lastEvent?.reason || 'desativado'}` };
    }
    if (!hasOriginFlag) {
        return { state: 'gray', detail: 'Terreno indisponível sem origem geográfica' };
    }
    return { state: 'gray', detail: 'Terreno não solicitado neste modelo' };
}

async function computeState(): Promise<GeoBeaconState> {
    let origin: any = null;
    let reconverted: any = null;
    let hasOriginFlag = false;
    try {
        const coords: any = await import('../../core/io/geo/coordinates.js' as string);
        hasOriginFlag = coords.hasOrigin();
        if (hasOriginFlag) {
            origin = coords.getOrigin();
            reconverted = coords.relativeToWGS84({ x: 0, y: 0, z: 0 });
        }
    } catch (e: any) {
        console.debug('[geoBeacon:coords]', e?.message || e);
    }
    let hasTerrainLayer = false;
    try {
        const { getAllLayers } = await import('../../core/interpolation/manager.js' as string);
        hasTerrainLayer = (getAllLayers() || []).some((l: any) => l?.type === 'terrain');
    } catch (e: any) {
        console.debug('[geoBeacon:layers]', e?.message || e);
    }
    const truth = (globalThis as any).__ecbytsGeoTruth || null;
    const local = resolveLocalState(origin, reconverted, truth);
    const terrain = resolveTerrainState(_lastTerrainEvent, hasTerrainLayer, hasOriginFlag);
    return {
        local: local.state,
        localDetail: local.detail,
        terrain: terrain.state,
        terrainDetail: terrain.detail,
        utmLabel: local.utmLabel,
    };
}

function render(target: HTMLElement, s: GeoBeaconState): void {
    target.innerHTML =
        `${svgDot(DOT_COLORS[s.terrain] ?? DOT_COLORS.gray!)}<span>Terreno</span>` +
        `<span style="margin:0 5px;opacity:0.35">|</span>` +
        `${svgDot(DOT_COLORS[s.local] ?? DOT_COLORS.gray!)}<span>${s.utmLabel}</span>`;
    target.setAttribute('data-terrain', s.terrain);
    target.setAttribute('data-local', s.local);
    const title = `Terreno: ${s.terrainDetail}\nLocal: ${s.localDetail}`;
    target.setAttribute('title', title);
    // WCAG 4.1.2 (Name/Role/Value): o beacon é acionável (abre detalhe em toast),
    // logo é um button semântico. aria-label dá o nome acessível; aria-live anuncia
    // mudança de estado (farol verde→vermelho) a leitores de tela sem foco.
    target.setAttribute('role', 'button');
    target.setAttribute('aria-label', title.replace('\n', '; '));
    target.setAttribute('aria-live', 'polite');
}

async function refresh(): Promise<void> {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(BEACON_ID);
    if (!el) return;
    render(el, await computeState());
}

async function _onBeaconClick(): Promise<void> {
    try {
        const s = await computeState();
        const { showToast } = await import('./toast.js' as string);
        const tone = s.local === 'red' || s.terrain === 'red' ? 'error' : s.terrain === 'yellow' ? 'info' : 'success';
        showToast(`Terreno: ${s.terrainDetail} — Local: ${s.localDetail}`, tone, 6000);
    } catch (e: any) {
        console.debug('[geoBeacon:click]', e?.message || e);
    }
}

/**
 * Initialize the geo status beacon. Idempotente.
 */
export async function initGeoStatusBeacon(): Promise<void> {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(BEACON_ID);
    if (!el) return;
    if (!_listenersBound) {
        _listenersBound = true;
        window.addEventListener('ecbyts:terrain-status', ((ev: CustomEvent) => {
            _lastTerrainEvent = ev?.detail || null;
            void refresh();
        }) as EventListener);
        window.addEventListener('modelGenerated', () => void refresh());
        el.addEventListener('click', () => void _onBeaconClick());
        // WCAG 2.1.1 (Keyboard): o beacon é acionável por click; sem isto, usuários
        // de teclado/leitor de tela não conseguiam abrir o detalhe. tabindex torna-o
        // focável; Enter/Espaço acionam, igual a um <button> nativo.
        el.setAttribute('tabindex', '0');
        el.addEventListener('keydown', (ev: KeyboardEvent) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                void _onBeaconClick();
            }
        });
        el.style.cursor = 'pointer';
    }
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(() => void refresh(), POLL_MS);
    await refresh();
}

export function disposeGeoStatusBeacon(): void {
    if (_pollTimer) {
        clearInterval(_pollTimer);
        _pollTimer = null;
    }
}
