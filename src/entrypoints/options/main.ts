import { getExtensionApi } from '../../shared/browser-api';
import { getRequiredElement } from '../../shared/dom';
import { applyI18n, getMessage } from '../../shared/i18n';
import {
  deletePreset,
  exportBackupData,
  getSettings,
  importBackupData,
  listPresets,
  normalizeRect,
  setSettings,
  updatePreset,
} from '../../shared/storage';
import type {
  ChannelPreset,
  ImportConflictStrategy,
  MaskStyle,
  Rect,
  Settings,
} from '../../types/schema';

// DOM Elements
const summaryCount = getRequiredElement<HTMLElement>('summary-count');
const searchInput = getRequiredElement<HTMLInputElement>('search-input');
const presetsList = getRequiredElement<HTMLElement>('presets-list');
const emptyState = getRequiredElement<HTMLElement>('empty-state');

// Default Style Controls
const defTypeBlur = getRequiredElement<HTMLButtonElement>('def-type-blur');
const defTypeSolid = getRequiredElement<HTMLButtonElement>('def-type-solid');
const defColor = getRequiredElement<HTMLInputElement>('def-color');
const defColorHex = getRequiredElement<HTMLElement>('def-color-hex');
const defOpacity = getRequiredElement<HTMLInputElement>('def-opacity');
const defOpacityDisplay = getRequiredElement<HTMLElement>(
  'def-opacity-display'
);
const defBlurGroup = getRequiredElement<HTMLElement>('def-blur-group');
const defBlur = getRequiredElement<HTMLInputElement>('def-blur');
const defBlurDisplay = getRequiredElement<HTMLElement>('def-blur-display');

// Backup & Restore Controls
const backupModeMerge =
  getRequiredElement<HTMLButtonElement>('backup-mode-merge');
const backupModeOverwrite = getRequiredElement<HTMLButtonElement>(
  'backup-mode-overwrite'
);
const btnExportBackup =
  getRequiredElement<HTMLButtonElement>('btn-export-backup');
const btnImportBackup =
  getRequiredElement<HTMLButtonElement>('btn-import-backup');
const inputImportFile =
  getRequiredElement<HTMLInputElement>('input-import-file');
const backupStatus = getRequiredElement<HTMLElement>('backup-status');

let currentSettings: Settings | null = null;
let allPresets: ChannelPreset[] = [];
let filterQuery = '';
let importStrategy: ImportConflictStrategy = 'merge';

function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function updateDefaultStyleUI(style: Partial<MaskStyle> | null | undefined): void {
  if (!style) return;
  if (style.type === 'solid') {
    defTypeSolid.classList.add('active');
    defTypeBlur.classList.remove('active');
    defBlurGroup.classList.add('hidden');
  } else {
    defTypeBlur.classList.add('active');
    defTypeSolid.classList.remove('active');
    defBlurGroup.classList.remove('hidden');
  }

  defColor.value = style.color || '#000000';
  defColorHex.textContent = (style.color || '#000000').toUpperCase();

  const opacityPct = Math.round(
    (typeof style.opacity === 'number' ? style.opacity : 0.45) * 100
  );
  defOpacity.value = String(opacityPct);
  defOpacityDisplay.textContent = `${opacityPct}%`;

  const blurVal = typeof style.blur === 'number' ? style.blur : 16;
  defBlur.value = String(blurVal);
  defBlurDisplay.textContent = `${blurVal}px`;
}

async function saveDefaultStyle(): Promise<void> {
  if (!currentSettings) return;
  const isSolid = defTypeSolid.classList.contains('active');
  const updatedStyle: MaskStyle = {
    type: isSolid ? 'solid' : 'blur',
    color: defColor.value,
    opacity: parseInt(defOpacity.value, 10) / 100,
    blur: parseInt(defBlur.value, 10),
  };
  currentSettings.defaultStyle = updatedStyle;
  await setSettings({ defaultStyle: updatedStyle });
}

function createPresetCardElement(preset: ChannelPreset): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'preset-card';

  const activeProfile =
    preset.profiles &&
    preset.profiles.find((pr) => pr.id === preset.activeProfileId);
  const maskData =
    activeProfile && activeProfile.masks && activeProfile.masks[0];
  const style: Partial<MaskStyle> = maskData ? maskData.style : {};
  const rect: Rect = maskData ? maskData.rect : { x: 0, y: 0, w: 0, h: 0 };

  // 1. Header
  const cardHeader = document.createElement('div');
  cardHeader.className = 'preset-card-header';

  const titleWrapper = document.createElement('div');
  const titleLink = document.createElement('a');
  titleLink.className = 'preset-channel-title';
  titleLink.href = `https://www.youtube.com/channel/${preset.channelId}`;
  titleLink.target = '_blank';
  titleLink.rel = 'noopener noreferrer';
  titleLink.textContent = `${preset.channelName || preset.channelId} ↗`;

  const idDiv = document.createElement('div');
  idDiv.className = 'preset-channel-id';
  idDiv.textContent = preset.channelId;

  titleWrapper.appendChild(titleLink);
  titleWrapper.appendChild(idDiv);
  cardHeader.appendChild(titleWrapper);

  // 2. Meta row (Style badge + Date)
  const metaRow = document.createElement('div');
  metaRow.className = 'preset-meta-row';

  const styleBadge = document.createElement('div');
  styleBadge.className = 'preset-style-badge';
  const styleDot = document.createElement('span');
  styleDot.className = 'style-dot';
  styleDot.style.backgroundColor = style.color || '#000000';

  const styleText = document.createElement('span');
  const typeLabel =
    style.type === 'solid'
      ? getMessage('styleSolid') || 'Solid'
      : getMessage('styleBlur') || 'Blur';
  const opacityVal =
    typeof style.opacity === 'number'
      ? style.opacity
      : style.type === 'solid'
        ? 1.0
        : 0.45;
  const opacityPct = Math.round(opacityVal * 100);
  styleText.textContent = `${typeLabel} (${opacityPct}%)`;

  styleBadge.appendChild(styleDot);
  styleBadge.appendChild(styleText);

  const dateSpan = document.createElement('span');
  dateSpan.textContent = formatDate(preset.updatedAt);

  metaRow.appendChild(styleBadge);
  metaRow.appendChild(dateSpan);

  // 3. Rect Inspector / Editor
  const inspector = document.createElement('div');
  inspector.className = 'rect-inspector';

  const fields: Array<{ key: keyof Rect; label: string; val: string }> = [
    { key: 'x', label: 'X', val: (rect.x * 100).toFixed(1) },
    { key: 'y', label: 'Y', val: (rect.y * 100).toFixed(1) },
    { key: 'w', label: 'W', val: (rect.w * 100).toFixed(1) },
    { key: 'h', label: 'H', val: (rect.h * 100).toFixed(1) },
  ];

  const inputs = {} as Record<keyof Rect, HTMLInputElement>;

  for (const f of fields) {
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'rect-field';

    const lbl = document.createElement('label');
    lbl.textContent = `${f.label}:`;

    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.step = '0.5';
    numInput.min = '0';
    numInput.max = '100';
    numInput.value = f.val;
    inputs[f.key] = numInput;

    const unitSpan = document.createElement('span');
    unitSpan.className = 'unit';
    unitSpan.textContent = '%';

    fieldDiv.appendChild(lbl);
    fieldDiv.appendChild(numInput);
    fieldDiv.appendChild(unitSpan);
    inspector.appendChild(fieldDiv);

    numInput.addEventListener('change', async () => {
      const newX = parseFloat(inputs.x.value) / 100;
      const newY = parseFloat(inputs.y.value) / 100;
      const newW = parseFloat(inputs.w.value) / 100;
      const newH = parseFloat(inputs.h.value) / 100;

      const clamped = normalizeRect({ x: newX, y: newY, w: newW, h: newH });
      inputs.x.value = (clamped.x * 100).toFixed(1);
      inputs.y.value = (clamped.y * 100).toFixed(1);
      inputs.w.value = (clamped.w * 100).toFixed(1);
      inputs.h.value = (clamped.h * 100).toFixed(1);

      await updatePreset(preset.channelId, (latest) => {
        const prof =
          latest.profiles.find((p) => p.id === latest.activeProfileId) ||
          latest.profiles[0];
        if (prof && prof.masks[0]) {
          prof.masks[0].rect = clamped;
        }
        return latest;
      });
    });
  }

  // 4. Card Actions
  const cardActions = document.createElement('div');
  cardActions.className = 'card-actions';

  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'toggle-label';

  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.className = 'preset-card-toggle';
  toggleInput.checked = preset.enabled !== false;
  toggleInput.addEventListener('change', async () => {
    preset.enabled = toggleInput.checked;
    await updatePreset(preset.channelId, (latest) => {
      latest.enabled = toggleInput.checked;
      return latest;
    });
  });

  const toggleText = document.createElement('span');
  toggleText.textContent = getMessage('presetEnabledLabel') || 'Active';

  toggleLabel.appendChild(toggleInput);
  toggleLabel.appendChild(toggleText);

  const btnDelete = document.createElement('button');
  btnDelete.type = 'button';
  btnDelete.className = 'btn-card-delete';
  btnDelete.textContent = getMessage('delete') || 'Delete';
  btnDelete.addEventListener('click', async () => {
    const confirmMsg =
      getMessage('deleteConfirm') || 'Delete mask for this channel?';
    if (!window.confirm(confirmMsg)) return;

    await deletePreset(preset.channelId);
    allPresets = allPresets.filter((p) => p.channelId !== preset.channelId);
    renderPresets();
  });

  cardActions.appendChild(toggleLabel);
  cardActions.appendChild(btnDelete);

  // Assemble Card
  card.appendChild(cardHeader);
  card.appendChild(metaRow);
  card.appendChild(inspector);
  card.appendChild(cardActions);

  return card;
}

function renderPresets(): void {
  presetsList.replaceChildren();

  const query = filterQuery.toLowerCase().trim();
  const filtered = allPresets.filter((p) => {
    if (!query) return true;
    return (
      (p.channelName && p.channelName.toLowerCase().includes(query)) ||
      (p.channelId && p.channelId.toLowerCase().includes(query))
    );
  });

  const countMsg =
    getMessage('channelCount', [String(allPresets.length)]) ||
    `${allPresets.length} channel(s) registered`;
  summaryCount.textContent = countMsg;

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  for (const preset of filtered) {
    const card = createPresetCardElement(preset);
    presetsList.appendChild(card);
  }
}

function showBackupStatus(message: string, isError = false): void {
  backupStatus.textContent = message;
  backupStatus.classList.toggle('is-error', isError);
  backupStatus.classList.remove('hidden');
}

function setImportStrategy(strategy: ImportConflictStrategy): void {
  importStrategy = strategy;
  if (strategy === 'overwrite') {
    backupModeOverwrite.classList.add('active');
    backupModeMerge.classList.remove('active');
  } else {
    backupModeMerge.classList.add('active');
    backupModeOverwrite.classList.remove('active');
  }
}

async function handleExportBackup(): Promise<void> {
  try {
    const payload = await exportBackupData();
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateStr = formatDate(payload.exportedAt) || 'backup';

    const link = document.createElement('a');
    link.href = url;
    link.download = `at-field-backup-${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    const countStr = String(payload.data.presets.length);
    const msg =
      getMessage('backupExportSuccess', [countStr]) ||
      `Backup exported (${countStr} channel(s)).`;
    showBackupStatus(msg, false);
  } catch {
    showBackupStatus(
      getMessage('backupErrorInvalid') || 'Invalid backup file format.',
      true
    );
  }
}

async function handleImportFile(file: File): Promise<void> {
  if (importStrategy === 'overwrite') {
    const confirmMsg =
      getMessage('overwriteConfirm') ||
      'Overwrite mode will replace all existing channel presets with the backup file. Continue?';
    if (!window.confirm(confirmMsg)) {
      return;
    }
  }

  try {
    const text = await file.text();
    const raw: unknown = JSON.parse(text);
    const result = await importBackupData(raw, { strategy: importStrategy });

    currentSettings = await getSettings();
    updateDefaultStyleUI(currentSettings.defaultStyle);
    allPresets = await listPresets();
    renderPresets();

    const importedStr = String(result.importedCount);
    const skippedStr = String(result.skippedCount);
    const msg =
      getMessage('backupImportSuccess', [importedStr, skippedStr]) ||
      `Imported ${importedStr} channel(s) (${skippedStr} skipped).`;
    showBackupStatus(msg, false);
  } catch (err) {
    const isUnsupportedVersion =
      err instanceof Error && err.message === 'UNSUPPORTED_SCHEMA_VERSION';
    const errMsg = isUnsupportedVersion
      ? getMessage('backupErrorVersion') ||
        'Unsupported backup schema version. Please update A.T.Field.'
      : getMessage('backupErrorInvalid') || 'Invalid backup file format.';
    showBackupStatus(errMsg, true);
  }
}

async function init(): Promise<void> {
  applyI18n();

  currentSettings = await getSettings();
  updateDefaultStyleUI(currentSettings.defaultStyle);

  allPresets = await listPresets();
  renderPresets();

  // Listen to background/tab storage changes in real time
  const storageApi = getExtensionApi()?.storage;
  if (storageApi && storageApi.onChanged) {
    storageApi.onChanged.addListener(async (_changes, areaName) => {
      if (areaName !== 'local') return;
      currentSettings = await getSettings();
      updateDefaultStyleUI(currentSettings.defaultStyle);
      allPresets = await listPresets();
      renderPresets();
    });
  }

  // Backup & Restore listeners
  backupModeMerge.addEventListener('click', () => {
    setImportStrategy('merge');
  });

  backupModeOverwrite.addEventListener('click', () => {
    setImportStrategy('overwrite');
  });

  btnExportBackup.addEventListener('click', () => {
    void handleExportBackup();
  });

  btnImportBackup.addEventListener('click', () => {
    inputImportFile.click();
  });

  inputImportFile.addEventListener('change', async () => {
    const file = inputImportFile.files && inputImportFile.files[0];
    inputImportFile.value = '';
    if (!file) return;
    await handleImportFile(file);
  });

  // Default style listeners
  defTypeBlur.addEventListener('click', () => {
    defTypeBlur.classList.add('active');
    defTypeSolid.classList.remove('active');
    defBlurGroup.classList.remove('hidden');
    if (defOpacity.value === '100') {
      defOpacity.value = '45';
      defOpacityDisplay.textContent = '45%';
    }
    saveDefaultStyle();
  });

  defTypeSolid.addEventListener('click', () => {
    defTypeSolid.classList.add('active');
    defTypeBlur.classList.remove('active');
    defBlurGroup.classList.add('hidden');
    defOpacity.value = '100';
    defOpacityDisplay.textContent = '100%';
    saveDefaultStyle();
  });

  defColor.addEventListener('input', () => {
    defColorHex.textContent = defColor.value.toUpperCase();
    saveDefaultStyle();
  });

  defOpacity.addEventListener('input', () => {
    defOpacityDisplay.textContent = `${defOpacity.value}%`;
    saveDefaultStyle();
  });

  defBlur.addEventListener('input', () => {
    defBlurDisplay.textContent = `${defBlur.value}px`;
    saveDefaultStyle();
  });

  // Search filter
  searchInput.addEventListener('input', (e) => {
    filterQuery = (e.target as HTMLInputElement).value;
    renderPresets();
  });
}

document.addEventListener('DOMContentLoaded', init);
