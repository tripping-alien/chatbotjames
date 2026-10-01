class GlobalState {
    constructor() {
        this.isGeneratingUI = false;
        this.gpuInfo = null;
        this.presets = [];
        this.activePresetId = null;
        this.selectedPresetId = null;
        this.deviceRamGB = 4;
        this.cannedGenId = 0;
        this.pwaDeferredPrompt = null;
    }
}

export const globalState = new GlobalState();
