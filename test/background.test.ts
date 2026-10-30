import { assert, test } from 'vitest';
import {
  handleExtensionCommand,
  registerCommandListener,
} from '../src/entrypoints/background';
import { COMMAND_TOGGLE_EDIT_MODE } from '../src/shared/constants';
import { MESSAGE_TYPES } from '../src/shared/messages';
import { withMockGlobals } from './helpers/mock-dom';

test('background.registerCommandListener - sends ATF_TOGGLE_EDIT_MODE to active tab on toggle-edit-mode command', async () => {
  let commandCallback: ((cmd: string) => void) | null = null;
  const sentMessages: Array<{ tabId: number; message: unknown }> = [];

  const mockBrowser = {
    commands: {
      onCommand: {
        addListener: (cb: (cmd: string) => void) => {
          commandCallback = cb;
        },
      },
    },
    tabs: {
      query: async () => [{ id: 42 }],
      sendMessage: async (tabId: number, message: unknown) => {
        sentMessages.push({ tabId, message });
        return { editMode: true };
      },
    },
  };

  await withMockGlobals({ browser: mockBrowser }, async () => {
    registerCommandListener();
    assert.ok(commandCallback, 'onCommand listener should be registered');

    // Unrelated command should be ignored
    await handleExtensionCommand('some-other-command');
    assert.equal(sentMessages.length, 0);

    // Trigger toggle-edit-mode command
    commandCallback!(COMMAND_TOGGLE_EDIT_MODE);
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(sentMessages.length, 1);
    assert.deepEqual(sentMessages[0], {
      tabId: 42,
      message: { type: MESSAGE_TYPES.TOGGLE_EDIT_MODE },
    });
  });
});

test('background.handleExtensionCommand - safely ignores sendMessage errors on non-YouTube tabs', async () => {
  const mockBrowser = {
    tabs: {
      query: async () => [{ id: 99 }],
      sendMessage: async () => {
        throw new Error('Could not establish connection. Receiving end does not exist.');
      },
    },
  };

  await withMockGlobals({ browser: mockBrowser }, async () => {
    // Should resolve without throwing
    await handleExtensionCommand(COMMAND_TOGGLE_EDIT_MODE);
  });
});

