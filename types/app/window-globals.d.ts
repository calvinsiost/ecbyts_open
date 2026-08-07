// W36 Strategy Pivot: global ambient typings to drain TS2551/TS2339/
// TS18046 across the entire codebase. SAFE: only ADDS missing members,
// doesn't override existing ones (avoids breaking DOM strict types).

declare global {
    interface Window {
        // Allow any window.handlerX / window.<custom> access
        [key: string]: any;
    }

    interface Performance {
        // Chrome-only non-standard
        memory?: {
            usedJSHeapSize: number;
            totalJSHeapSize: number;
            jsHeapSizeLimit: number;
        };
    }

    // EventTarget commonly accessed as IDB-target via event.target
    interface EventTarget {
        result?: any;
        error?: any;
    }

    // Three.js global compat (legacy code uses window.THREE)
    var THREE: any;
}

export {};
