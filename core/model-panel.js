// ─── Model Selection Panel ────────────────────────────────────────────────────

let _gpuInfo = null;
let _presets = [];
let _activePresetId = null;
let _selectedPresetId = null;
let _deviceRamGB = 4;
let _onApplyModel = null;

const modelPanel = document.getElementById('modelPanel');
const modelPanelOverlay = document.getElementById('modelPanelOverlay');
const modelPanelBtn = document.getElementById('modelPanelBtn');
const modelPanelClose = document.getElementById('modelPanelClose');
const applyModelBtn = document.getElementById('applyModelBtn');

export function setupModelPanel(options = {}) {
    if (options.onApplyModel) _onApplyModel = options.onApplyModel;

    modelPanelBtn?.addEventListener('click', openModelPanel);
    modelPanelClose?.addEventListener('click', closeModelPanel);
    modelPanelOverlay?.addEventListener('click', closeModelPanel);

    applyModelBtn?.addEventListener('click', () => {
        if (!_selectedPresetId || _selectedPresetId === _activePresetId) return;
        closeModelPanel();
        if (_onApplyModel) _onApplyModel(_selectedPresetId);
    });
}

let _modelPanelReturnFocus = null;

export function openModelPanel() {
    _modelPanelReturnFocus = document.activeElement;
    modelPanel?.classList.add('open');
    modelPanelOverlay?.classList.add('visible');
    // Move focus into the dialog for keyboard users
    requestAnimationFrame(() => {
        const first = modelPanel?.querySelector('button, [href], [tabindex]:not([tabindex="-1"])');
        (first || modelPanelClose)?.focus();
    });
}

export function closeModelPanel() {
    modelPanel?.classList.remove('open');
    modelPanelOverlay?.classList.remove('visible');
    // Restore focus to the control that opened the panel
    if (_modelPanelReturnFocus && typeof _modelPanelReturnFocus.focus === 'function') {
        _modelPanelReturnFocus.focus();
    }
    _modelPanelReturnFocus = null;
}

export function updateModelInfo(data) {
    if (data.gpuInfo !== undefined) _gpuInfo = data.gpuInfo;
    if (data.presets !== undefined) _presets = data.presets;
    if (data.ramGB !== undefined) _deviceRamGB = data.ramGB;
    if (data.activePresetId !== undefined) _activePresetId = data.activePresetId;
    if (data.selectedPresetId !== undefined) _selectedPresetId = data.selectedPresetId;
    renderModelPanel();
}

export function renderModelPanel() {
    const card = document.getElementById('gpuStatusCard');
    const icon = document.getElementById('gpuStatusIcon');
    const title = document.getElementById('gpuStatusTitle');
    const detail = document.getElementById('gpuStatusDetail');
    const badge = document.getElementById('gpuStatusBadge');

    if (_gpuInfo && card) {
        const { hasGpu, vendor, maxStorageMB, reason, isFallback } = _gpuInfo;

        if (hasGpu) {
            card.className = 'gpu-status-card gpu-ok';
            if (icon) icon.textContent = '🚀';
            if (title) title.textContent = 'GPU Acceleration Available';
            if (badge) badge.textContent = 'WebGPU';
        } else if (!navigator.gpu) {
            card.className = 'gpu-status-card gpu-none';
            if (icon) icon.textContent = '❌';
            if (title) title.textContent = 'WebGPU Not Supported';
            if (badge) badge.textContent = 'NO GPU';
        } else if (isFallback) {
            card.className = 'gpu-status-card gpu-warn';
            if (icon) icon.textContent = '⚠️';
            if (title) title.textContent = 'Software Adapter Only';
            if (badge) badge.textContent = 'SW ONLY';
        } else {
            card.className = 'gpu-status-card gpu-warn';
            if (icon) icon.textContent = '⚠️';
            if (title) title.textContent = 'Integrated GPU — CPU Fallback';
            if (badge) badge.textContent = 'CPU';
        }

        const vendorStr = vendor ? `Vendor: ${vendor}` : 'Vendor: hidden by browser';
        const bufStr = maxStorageMB ? ` · Buffer: ${maxStorageMB.toFixed(0)} MB` : '';
        const ramStr = `Device RAM: ~${_deviceRamGB} GB`;
        if (detail) detail.textContent = `${reason}\n${vendorStr}${bufStr} · ${ramStr}`;
    }

    const list = document.getElementById('modelPresetList');
    if (!list || !_presets.length) return;
    list.innerHTML = '';

    const GROUPS = [
        { key: 'gpu', title: '⚡ GPU · WebGPU', filter: p => p.requires === 'gpu' },
        { key: 'cpu', title: '🧠 CPU · WASM', filter: p => p.requires === 'cpu' && !p.id.startsWith('lite-') },
        { key: 'lite', title: '🪶 Lite · Constrained', filter: p => p.id.startsWith('lite-') },
    ];

    GROUPS.forEach(group => {
        const presets = _presets.filter(group.filter);
        if (!presets.length) return;

        const divider = document.createElement('div');
        divider.className = 'preset-group-title';
        divider.textContent = group.title;
        list.appendChild(divider);

        presets.forEach(preset => {
            const isRunning = preset.id === _activePresetId;
            const isSelected = preset.id === _selectedPresetId;

            let pillClass = 'pill-cpu';
            let pillText = 'CPU';
            if (preset.requires === 'gpu') { pillClass = 'pill-gpu'; pillText = 'GPU'; }
            if (preset.id.startsWith('lite-')) { pillClass = 'pill-lite'; pillText = 'LITE'; }
            if (isRunning) { pillClass = 'pill-active'; pillText = 'ACTIVE'; }

            const sizeStr = preset.sizeMB
                ? preset.sizeMB >= 1000
                    ? `${(preset.sizeMB / 1024).toFixed(1)} GB`
                    : `${preset.sizeMB} MB`
                : '';
            const ramStr = preset.ram ? `${preset.ram} RAM` : '';
            const metaStr = [preset.dtype.toUpperCase(), sizeStr, ramStr].filter(Boolean).join(' · ');
            const autoTag = preset.autoSelect !== false ? ' <span class="preset-auto-tag">AUTO</span>' : '';

            const el = document.createElement('div');
            el.className = [
                'preset-card',
                isSelected && !isRunning ? 'preset-selected' : '',
                isRunning ? 'preset-active-running' : '',
            ].filter(Boolean).join(' ');
            el.dataset.presetId = preset.id;
            el.setAttribute('role', 'button');
            el.tabIndex = 0;
            el.setAttribute('aria-label', `${preset.label}${isRunning ? ' (currently active)' : ''}`);
            el.setAttribute('aria-pressed', isSelected || isRunning ? 'true' : 'false');

            el.innerHTML = `
            <div class="preset-info">
                <div class="preset-label">${preset.label}${autoTag}</div>
                <div class="preset-tags">${metaStr}</div>
            </div>
            <span class="preset-pill ${pillClass}">${pillText}</span>
            <div class="preset-check"></div>`;

            el.addEventListener('click', () => selectPreset(preset.id));
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectPreset(preset.id);
                }
            });
            list.appendChild(el);
        });
    });
}

export function selectPreset(id) {
    _selectedPresetId = id;
    document.querySelectorAll('.preset-card').forEach(el => {
        const elId = el.dataset.presetId;
        el.classList.toggle('preset-selected', elId === id && elId !== _activePresetId);
        el.classList.toggle('preset-active-running', elId === _activePresetId);
    });
    if (applyModelBtn) applyModelBtn.disabled = (id === _activePresetId);
}

export function refreshPresetCards() {
    if (document.getElementById('modelPresetList')?.children.length > 0) {
        renderModelPanel();
    }
}
