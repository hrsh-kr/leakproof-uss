// Feature switches.
// voice: dictation through the browser's own speech service. Switched OFF: that service is run by the browser
// vendor, and for many people (Brave and other Chromium builds, some networks, some phones) it fails with a
// "network" error, which is worse than not offering it. The code and its tests stay, so it can be turned back on.
export const FEATURES = { voice: globalThis.__LP_VOICE === true };
