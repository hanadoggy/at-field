import { defineBackground } from 'wxt/utils/define-background';
import { getExtensionApi } from '../shared/browser-api';
import { COMMAND_TOGGLE_EDIT_MODE } from '../shared/constants';
import { MESSAGE_TYPES } from '../shared/messages';

export async function handleExtensionCommand(command: string): Promise<void> {
  if (command !== COMMAND_TOGGLE_EDIT_MODE) return;

  const extApi = getExtensionApi();
  if (!extApi || !extApi.tabs) return;

  try {
    const tabs = await extApi.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs && tabs[0];
    if (!activeTab || typeof activeTab.id !== 'number') return;

    await extApi.tabs.sendMessage(activeTab.id, {
      type: MESSAGE_TYPES.TOGGLE_EDIT_MODE,
    });
  } catch {
    // Active tab may not be a YouTube page or content script is not loaded; ignore safely.
  }
}

export function registerCommandListener(): void {
  const extApi = getExtensionApi();
  if (extApi && extApi.commands && extApi.commands.onCommand) {
    extApi.commands.onCommand.addListener((command) => {
      void handleExtensionCommand(command);
    });
  }
}

export default defineBackground(() => {
  registerCommandListener();
});

