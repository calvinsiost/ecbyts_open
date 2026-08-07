// @ts-check
export function exportNGSILD(
  model: Record<string, any>,
  options?: {
    scope?: 'elements' | 'observations' | 'full';
    format?: 'normalized' | 'keyValues';
    precision?: number;
  },
): Blob;
