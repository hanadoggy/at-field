import { defineContentScript } from 'wxt/utils/define-content-script';

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  runAt: 'document_idle',
  main() {
    console.log('[ATF] Content script spike');
  },
});
