// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export async function initLastProjectMode(
{ translate, showToast, getModelId, clearModelData, applyModel }: any) {
    const sessionMod = (await import('../utils/auth/session.js' as string)) as any;
    if (!sessionMod.isLoggedIn()) {
        showToast(translate('initLastProjectNotLoggedIn'), 'warning');
        await getModelId();
        return;
    }
    showToast(translate('initLastProjectLoading'), 'info');
    try {
        const { loadMostRecentModel } = await import('../utils/cloud/manager.js' as string);
        const result = await Promise.race([
            loadMostRecentModel(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout (10s)')), 10000)),
        ]);
        if (!result || !result.modelData) {
            showToast(translate('initLastProjectNoModels'), 'info');
            await getModelId();
            return;
        }
        const { setEphemeral } = await import('../utils/storage/storageMonitor.js' as string);
        setEphemeral(false);
        await clearModelData();
        await applyModel(result.modelData);
        const { setCurrentCloudModelId } = await import('../utils/handlers/cloud.js' as string);
        setCurrentCloudModelId(result.modelId);
        showToast(translate('initLastProjectLoaded'), 'success');
    }
    catch (err: any) {
        console.error('[Init] lastProject mode error:', err);
        showToast(translate('initLastProjectError'), 'error');
        await getModelId();
    }
}
export async function initMapPickerMode(
{ documentRef, localStorageRef, translate, showToast, getModelId, updateGlobe }: any) {
    const loadingEl = documentRef.getElementById('loading-overlay');
    if (loadingEl)
        loadingEl.style.display = 'none';
    try {
        const { openMapPickerModal } = await import('../utils/ui/mapPicker.js' as string);
        const result = (await openMapPickerModal()) as any;
        if (result) {
            const [{ addElement, nextElementCounter }, { wgs84ToUTM, setOrigin }, { buildOverlayUrls }] = await Promise.all([
                import('../core/elements/manager.js' as string),
                import('../core/io/geo/coordinates.js' as string),
                import('../core/io/geo/overlayUrls.js' as string),
            ]);
            const utm = wgs84ToUTM({ latitude: result.latitude, longitude: result.longitude });
            const hemisphere = result.latitude < 0 ? 'S' : 'N';
            setOrigin({
                easting: utm.easting,
                northing: utm.northing,
                elevation: 0,
                zone: utm.zone,
                hemisphere,
            });
            const oeEl = documentRef.getElementById('utm-origin-easting');
            const onEl = documentRef.getElementById('utm-origin-northing');
            const zoneEl = documentRef.getElementById('utm-zone');
            const hemiEl = documentRef.getElementById('utm-hemisphere');
            const latEl = documentRef.getElementById('origin-latitude');
            const lonEl = documentRef.getElementById('origin-longitude');
            if (oeEl)
                oeEl.value = utm.easting.toFixed(2);
            if (onEl)
                onEl.value = utm.northing.toFixed(2);
            if (zoneEl)
                zoneEl.value = utm.zone;
            if (hemiEl)
                hemiEl.value = hemisphere;
            if (latEl)
                latEl.value = result.latitude.toFixed(6);
            if (lonEl)
                lonEl.value = result.longitude.toFixed(6);
            const halfW = 100;
            const halfL = 100;
            const storedProvider = localStorageRef.getItem('ecbyts-tile-provider');
            const providerParsed = storedProvider != null ? parseInt(storedProvider, 10) : NaN;
            const providerIndex = Number.isFinite(providerParsed) && providerParsed >= 0 ? providerParsed : undefined;
            const { overlayUrl, overlayFallbackUrls } = await buildOverlayUrls(halfW, halfL, providerIndex);
            const boundaryId = `boundary-${nextElementCounter()}`;
            addElement('boundary', boundaryId, translate('defaultBoundaryName') || 'Area de Estudo', {
                vertices: [
                    { x: -halfW, y: 0, z: -halfL },
                    { x: halfW, y: 0, z: -halfL },
                    { x: halfW, y: 0, z: halfL },
                    { x: -halfW, y: 0, z: halfL },
                ],
                type: 'study_area',
                overlayUrl,
                overlayFallbackUrls,
                overlayOpacity: 0.42,
                sourceLat: result.latitude,
                sourceLon: result.longitude,
            });
            updateGlobe();
            showToast(translate('initMapOriginSet'), 'success');
        }
    }
    catch (err: any) {
        console.error('[Init] mapPicker mode error:', err);
    }
    finally {
        // BOOT-ENTRY-UX-001 RF-1 (bug A): NÃO restaurar o display do overlay para o valor
        // default. O splash foi escondido p/ mostrar o mapPicker; reexibi-lo faz o logo
        // "piscar de volta" antes de o postboot removê-lo. O boot segue p/ getModelId() e
        // depois ao postboot (_finishLoadingOverlay em random-postboot.ts), que é o ÚNICO
        // dono da revelação/remoção do #loading-overlay.
    }
    await getModelId();
}
export async function initLastLocationMode(
{ documentRef, localStorageRef, translate, showToast, getModelId, updateGlobe }: any) {
    try {
        const [{ getLastSavedOrigin, setOrigin, utmToWGS84 }, { createDefaultBoundary }] = await Promise.all([
            import('../core/io/geo/coordinates.js' as string),
            import('../utils/handlers/project.js' as string),
        ]);
        const saved = /** @type {{ easting: number, northing: number, zone: number, hemisphere: string } | null} */ (getLastSavedOrigin());
        if (!saved) {
            showToast(translate('initLastLocationEmpty') || 'No saved location. Falling back to Map Picker.', 'warning');
            await initMapPickerMode({
                documentRef,
                localStorageRef,
                translate,
                showToast,
                getModelId,
                updateGlobe,
            });
            return;
        }
        setOrigin(saved);
        const oeEl = documentRef.getElementById('utm-origin-easting');
        const onEl = documentRef.getElementById('utm-origin-northing');
        const zoneEl = documentRef.getElementById('utm-zone');
        const hemiEl = documentRef.getElementById('utm-hemisphere');
        const latEl = documentRef.getElementById('origin-latitude');
        const lonEl = documentRef.getElementById('origin-longitude');
        if (oeEl)
            oeEl.value = saved.easting.toFixed(2);
        if (onEl)
            onEl.value = saved.northing.toFixed(2);
        if (zoneEl)
            zoneEl.value = saved.zone;
        if (hemiEl)
            hemiEl.value = saved.hemisphere;
        const wgs = utmToWGS84(saved);
        if (latEl)
            latEl.value = wgs.latitude.toFixed(6);
        if (lonEl)
            lonEl.value = wgs.longitude.toFixed(6);
        await createDefaultBoundary(wgs.latitude, wgs.longitude);
        await getModelId();
        updateGlobe();
        showToast(translate('initLastLocationRestored') || 'Last location restored', 'success');
    }
    catch (err: any) {
        console.error('[Init] lastLocation mode error:', err);
        await getModelId();
    }
}
