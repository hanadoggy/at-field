import { assert, test } from 'vitest';
import { applyI18n, getMessage } from '../src/shared/i18n';
import { MockHTMLElement, withMockGlobals } from './helpers/mock-dom';

test('i18n.getMessage - prefers browser.i18n.getMessage and forwards substitutions', () => {
  withMockGlobals(
    {
      browser: {
        i18n: {
          getMessage: (key: string, subs?: string | string[]) => {
            if (key === 'channelCount') {
              const count = Array.isArray(subs) ? subs[0] : subs;
              return `${count} channels registered`;
            }
            return `browser:${key}`;
          },
        },
      },
      chrome: {
        i18n: {
          getMessage: (key: string) => `chrome:${key}`,
        },
      },
    },
    () => {
      assert.equal(getMessage('extName'), 'browser:extName');
      assert.equal(
        getMessage('channelCount', ['5']),
        '5 channels registered'
      );
    }
  );
});

test('i18n.getMessage - falls back to chrome.i18n when browser.i18n returns empty string or is absent', () => {
  withMockGlobals(
    {
      browser: {
        i18n: {
          getMessage: () => '',
        },
      },
      chrome: {
        i18n: {
          getMessage: (key: string) => `chrome:${key}`,
        },
      },
    },
    () => {
      assert.equal(getMessage('modeEdit'), 'chrome:modeEdit');
    }
  );
});

test('i18n.getMessage - returns key itself when neither browser nor chrome provides a message', () => {
  withMockGlobals({ browser: undefined, chrome: undefined }, () => {
    assert.equal(getMessage('unknownKey_123'), 'unknownKey_123');
  });
});

test('i18n.applyI18n - populates data-i18n, data-i18n-placeholder, and data-i18n-attr elements', () => {
  const dict: Record<string, string> = {
    extName: 'A.T.Field',
    searchPlaceholder: '채널 검색...',
    modeEdit: '편집 모드',
    deletePreset: '마스크 삭제',
  };

  const titleEl = new MockHTMLElement('H1');
  titleEl.setAttribute('data-i18n', 'extName');

  const inputEl = new MockHTMLElement('INPUT');
  inputEl.setAttribute('data-i18n-placeholder', 'searchPlaceholder');

  const btnEl = new MockHTMLElement('BUTTON');
  btnEl.setAttribute(
    'data-i18n-attr',
    'title:modeEdit; aria-label:deletePreset'
  );

  const mockRoot = {
    querySelectorAll: (selector: string) => {
      if (selector === '[data-i18n]') return [titleEl];
      if (selector === '[data-i18n-placeholder]') return [inputEl];
      if (selector === '[data-i18n-attr]') return [btnEl];
      return [];
    },
  } as unknown as ParentNode;

  withMockGlobals(
    {
      browser: {
        i18n: {
          getMessage: (key: string) => dict[key] || '',
        },
      },
    },
    () => {
      applyI18n(mockRoot);

      assert.equal(titleEl.textContent, 'A.T.Field');
      assert.equal(inputEl.getAttribute('placeholder'), '채널 검색...');
      assert.equal(btnEl.getAttribute('title'), '편집 모드');
      assert.equal(btnEl.getAttribute('aria-label'), '마스크 삭제');
    }
  );
});
