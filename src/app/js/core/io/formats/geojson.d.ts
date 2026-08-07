export function exportGeoJSON(model: unknown, options?: Record<string, unknown>): Blob;
export function importGeoJSON(jsonText: string): {
    elements: unknown[];
    warnings: string[];
    datasetColor: string | null;
};
export function importGeoJSONObject(
    featureCollection: unknown,
    options?: { datasetId?: string },
): {
    elements: unknown[];
    warnings: string[];
    datasetColor: string | null;
};
