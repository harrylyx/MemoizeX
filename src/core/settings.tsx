import { Fragment } from 'preact';
import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import {
  IconSettings,
  IconBrandGithubFilled,
  IconHelp,
  IconDatabaseExport,
  IconTrashX,
  IconReportAnalytics,
  IconWebhook,
  IconPlus,
  IconEdit,
  IconPlayerPlay,
  IconCheck,
  IconX,
} from '@tabler/icons-preact';
import { GM_registerMenuCommand } from '$';

import packageJson from '@/../package.json';
import { Modal } from '@/components/common';
import { useTranslation, detectBrowserLanguage, LANGUAGES_CONFIG, TranslationKey } from '@/i18n';
import { capitalizeFirstLetter, cx, useToggle } from '@/utils/common';
import { saveFile } from '@/utils/exporter';
import { WebhookConfig, WebhookEventType } from '@/types/webhook';
import { generateWebhookConfigId } from '@/utils/webhook-formatter';
import { webhookManager } from '@/core/webhook';

import { db } from './database';
import extensionManager from './extensions';
import { DEFAULT_APP_OPTIONS, options, THEMES } from './options';

export function Settings() {
  const { t, i18n } = useTranslation();

  const currentTheme = useSignal(options.get('theme'));
  const [showSettings, toggleSettings] = useToggle(false);

  // Webhook state
  const webhookConfigs = useSignal<WebhookConfig[]>([]);
  const showWebhookForm = useSignal(false);
  const editingWebhook = useSignal<WebhookConfig | null>(null);
  const testResult = useSignal<{ success: boolean; message: string } | null>(null);

  // Webhook form state
  const formName = useSignal('');
  const formUrl = useSignal('');
  const formEnabled = useSignal(true);
  const formEvents = useSignal<WebhookEventType[]>(['like', 'bookmark']);
  const formHeaders = useSignal('');
  const formRetryOnFailure = useSignal(true);
  const formMaxRetries = useSignal(3);

  const styles = {
    subtitle: 'mb-2 text-base-content ml-4 opacity-50 font-semibold text-xs',
    block:
      'text-sm mb-2 w-full flex px-4 py-2 text-base-content bg-base-200 rounded-box justify-between',
    item: 'label cursor-pointer flex justify-between h-8 items-center p-0',
  };

  const loadWebhooks = async () => {
    await webhookManager.loadConfigs();
    webhookConfigs.value = webhookManager.getConfigs();
  };

  const resetWebhookForm = () => {
    formName.value = '';
    formUrl.value = '';
    formEnabled.value = true;
    formEvents.value = ['like', 'bookmark'];
    formHeaders.value = '';
    formRetryOnFailure.value = true;
    formMaxRetries.value = 3;
    editingWebhook.value = null;
    testResult.value = null;
  };

  const openAddWebhook = () => {
    resetWebhookForm();
    showWebhookForm.value = true;
  };

  const openEditWebhook = (config: WebhookConfig) => {
    formName.value = config.name;
    formUrl.value = config.url;
    formEnabled.value = config.enabled;
    formEvents.value = [...config.events];
    formHeaders.value = Object.keys(config.headers).length > 0 ? JSON.stringify(config.headers, null, 2) : '';
    formRetryOnFailure.value = config.retry_on_failure;
    formMaxRetries.value = config.max_retries;
    editingWebhook.value = config;
    showWebhookForm.value = true;
  };

  const parseHeaders = (): Record<string, string> => {
    try {
      return formHeaders.value ? JSON.parse(formHeaders.value) : {};
    } catch {
      return {};
    }
  };

  const saveWebhook = async () => {
    const headers = parseHeaders();
    const now = Date.now();

    if (editingWebhook.value) {
      await webhookManager.updateConfig(editingWebhook.value.id, {
        name: formName.value,
        url: formUrl.value,
        enabled: formEnabled.value,
        events: formEvents.value,
        headers,
        retry_on_failure: formRetryOnFailure.value,
        max_retries: formMaxRetries.value,
        updated_at: now,
      });
    } else {
      const config: WebhookConfig = {
        id: generateWebhookConfigId(),
        name: formName.value,
        url: formUrl.value,
        enabled: formEnabled.value,
        events: formEvents.value,
        headers,
        retry_on_failure: formRetryOnFailure.value,
        max_retries: formMaxRetries.value,
        created_at: now,
        updated_at: now,
      };
      await webhookManager.addConfig(config);
    }

    showWebhookForm.value = false;
    resetWebhookForm();
    await loadWebhooks();
  };

  const deleteWebhook = async (id: string) => {
    if (confirm('Are you sure you want to delete this webhook?')) {
      await webhookManager.deleteConfig(id);
      await loadWebhooks();
    }
  };

  const toggleEvent = (event: WebhookEventType) => {
    const current = formEvents.value;
    if (current.includes(event)) {
      formEvents.value = current.filter((e) => e !== event);
    } else {
      formEvents.value = [...current, event];
    }
  };

  const testWebhook = async () => {
    testResult.value = null;
    const result = await webhookManager.testWebhook(formUrl.value, parseHeaders());
    testResult.value = result;
  };

  useEffect(() => {
    GM_registerMenuCommand(`${t('Version')} ${packageJson.version}`, () => {
      window.open(packageJson.homepage, '_blank');
    });
    loadWebhooks();
  }, []);

  return (
    <Fragment>
      {/* Settings button. */}
      <div
        onClick={toggleSettings}
        class="w-9 h-9 mr-2 cursor-pointer flex justify-center items-center transition-colors duration-200 rounded-full hover:bg-base-200"
      >
        <IconSettings />
      </div>
      {/* Settings modal. */}
      <Modal title={t('Settings')} show={showSettings} onClose={toggleSettings} class="max-w-lg">
        {/* Common settings. */}
        <p class={styles.subtitle}>{t('General')}</p>
        <div class={cx(styles.block, 'flex-col')}>
          <label class={styles.item}>
            <span class="label-text whitespace-nowrap">{t('Theme')}</span>
            <select
              class="select select-xs"
              onChange={(e) => {
                currentTheme.value =
                  (e.target as HTMLSelectElement)?.value ?? DEFAULT_APP_OPTIONS.theme;
                options.set('theme', currentTheme.value);
              }}
            >
              {THEMES.map((theme) => (
                <option key={theme} value={theme} selected={currentTheme.value === theme}>
                  {capitalizeFirstLetter(theme)}
                </option>
              ))}
            </select>
          </label>
          <label class={styles.item}>
            <span class="label-text whitespace-nowrap">{t('Language')}</span>
            <select
              class="select select-xs"
              onChange={(e) => {
                const language = (e.target as HTMLSelectElement)?.value ?? detectBrowserLanguage();
                i18n.changeLanguage(language);
                options.set('language', language);
              }}
            >
              {Object.entries(LANGUAGES_CONFIG).map(([langTag, langConf]) => (
                <option
                  key={langTag}
                  value={langTag}
                  selected={options.get('language') === langTag}
                >
                  {langConf.nameEn} - {langConf.name}
                </option>
              ))}
            </select>
          </label>
          <label class={styles.item}>
            <span class="label-text whitespace-nowrap">{t('Debug')}</span>
            <input
              type="checkbox"
              class="toggle toggle-primary"
              checked={options.get('debug')}
              onChange={(e) => {
                options.set('debug', (e.target as HTMLInputElement)?.checked);
              }}
            />
          </label>
          <label class={styles.item}>
            <div class="flex items-center">
              <span class="label-text whitespace-nowrap">{t('Date Time Format')}</span>
              <a
                href="https://day.js.org/docs/en/display/format"
                target="_blank"
                rel="noopener noreferrer"
                class="tooltip tooltip-bottom ml-0.5 before:max-w-40"
                data-tip={t(
                  'Click for more information. This will take effect on both previewer and exported files.',
                )}
              >
                <IconHelp size={20} />
              </a>
            </div>
            <input
              type="text"
              class="input input-bordered input-xs w-48"
              value={options.get('dateTimeFormat')}
              onChange={(e) => {
                options.set('dateTimeFormat', (e.target as HTMLInputElement)?.value);
              }}
            />
          </label>
          {/* Database operations. */}
          <label class={styles.item}>
            <div class="flex items-center">
              <span class="label-text whitespace-nowrap">{t('Use dedicated DB for accounts')}</span>
              <a
                class="tooltip tooltip-bottom ml-0.5 before:max-w-40"
                data-tip={t(
                  'This will create separate database for each Twitter account, which can help reduce the chance of data mixing when you use multiple accounts.',
                )}
              >
                <IconHelp size={20} />
              </a>
            </div>
            <input
              type="checkbox"
              class="toggle toggle-primary"
              checked={options.get('dedicatedDbForAccounts')}
              onChange={(e) => {
                options.set('dedicatedDbForAccounts', (e.target as HTMLInputElement)?.checked);
              }}
            />
          </label>
          <div class={styles.item}>
            <div class="flex items-center">
              <span class="label-text whitespace-nowrap">{t('Local Database')}</span>
            </div>
            <div class="flex">
              <button
                class="btn btn-xs btn-neutral mr-2"
                onClick={async () => {
                  let storageUsageText = 'Storage usage: N/A';
                  if (typeof navigator.storage.estimate === 'function') {
                    const { quota = 1, usage = 0 } = await navigator.storage.estimate();
                    const usageMB = (usage / 1024 / 1024).toFixed(2);
                    const quotaMB = (quota / 1024 / 1024).toFixed(2);
                    storageUsageText = `Storage usage: ${usageMB}MB / ${quotaMB}MB`;
                  }

                  const count = await db.count();
                  alert(
                    storageUsageText +
                      '\n\nIndexedDB tables count:\n' +
                      JSON.stringify(count, undefined, '  '),
                  );
                }}
              >
                <IconReportAnalytics size={20} />
                {t('Analyze DB')}
              </button>
              <button
                class="btn btn-xs btn-primary mr-2"
                onClick={async () => {
                  const blob = await db.export();
                  if (blob) {
                    saveFile(`memoizex-${Date.now()}.json`, blob);
                  }
                }}
              >
                <IconDatabaseExport size={20} />
                {t('Export DB')}
              </button>
              <button
                class="btn btn-xs btn-warning"
                onClick={async () => {
                  if (confirm(t('Are you sure to clear all data in the database?'))) {
                    await db.clear();
                  }
                }}
              >
                <IconTrashX size={20} />
                {t('Clear DB')}
              </button>
            </div>
          </div>
        </div>

        {/* MemoizeX Settings */}
        <p class={styles.subtitle}>MemoizeX</p>
        <div class={cx(styles.block, 'flex-col')}>
          <label class={styles.item}>
            <span class="label-text whitespace-nowrap">Enable Browsing History</span>
            <input
              type="checkbox"
              class="toggle toggle-primary"
              checked={options.get('enableBrowsingHistory')}
              onChange={(e) => {
                options.set('enableBrowsingHistory', (e.target as HTMLInputElement)?.checked);
              }}
            />
          </label>
          <label class={styles.item}>
            <span class="label-text whitespace-nowrap">Webhook on Like</span>
            <input
              type="checkbox"
              class="toggle toggle-primary"
              checked={options.get('enableLikeWebhooks')}
              onChange={(e) => {
                options.set('enableLikeWebhooks', (e.target as HTMLInputElement)?.checked);
              }}
            />
          </label>
          <label class={styles.item}>
            <span class="label-text whitespace-nowrap">Webhook on Bookmark</span>
            <input
              type="checkbox"
              class="toggle toggle-primary"
              checked={options.get('enableBookmarkWebhooks')}
              onChange={(e) => {
                options.set('enableBookmarkWebhooks', (e.target as HTMLInputElement)?.checked);
              }}
            />
          </label>
          <label class={styles.item}>
            <span class="label-text whitespace-nowrap">Webhook on View</span>
            <input
              type="checkbox"
              class="toggle toggle-primary"
              checked={options.get('enableViewWebhooks')}
              onChange={(e) => {
                options.set('enableViewWebhooks', (e.target as HTMLInputElement)?.checked);
              }}
            />
          </label>
        </div>

        {/* Webhook Configurations */}
        <p class={styles.subtitle}>
          <span class="flex items-center gap-2">
            <IconWebhook size={16} />
            Webhook Configurations
          </span>
        </p>
        <div class={cx(styles.block, 'flex-col')}>
          {/* Webhook List */}
          {webhookConfigs.value.length === 0 && !showWebhookForm.value && (
            <div class="text-center text-base-content/60 py-2 text-xs">
              No webhooks configured
            </div>
          )}

          {!showWebhookForm.value && webhookConfigs.value.map((config) => (
            <div key={config.id} class="flex items-center justify-between py-1 border-b border-base-300 last:border-0">
              <div class="flex flex-col">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium">{config.name}</span>
                  <span class={`badge badge-xs ${config.enabled ? 'badge-success' : 'badge-ghost'}`}>
                    {config.enabled ? 'On' : 'Off'}
                  </span>
                </div>
                <span class="text-xs text-base-content/60 font-mono truncate max-w-[200px]">{config.url}</span>
              </div>
              <div class="flex gap-1">
                <button class="btn btn-xs btn-ghost" onClick={() => openEditWebhook(config)}>
                  <IconEdit size={14} />
                </button>
                <button class="btn btn-xs btn-ghost text-error" onClick={() => deleteWebhook(config.id)}>
                  <IconTrashX size={14} />
                </button>
              </div>
            </div>
          ))}

          {/* Add/Edit Form */}
          {showWebhookForm.value ? (
            <div class="flex flex-col gap-2 py-2">
              <input
                type="text"
                class="input input-xs input-bordered w-full"
                placeholder="Webhook name"
                value={formName.value}
                onInput={(e) => (formName.value = (e.target as HTMLInputElement).value)}
              />
              <div class="flex gap-1">
                <input
                  type="url"
                  class="input input-xs input-bordered flex-1"
                  placeholder="https://example.com/webhook"
                  value={formUrl.value}
                  onInput={(e) => (formUrl.value = (e.target as HTMLInputElement).value)}
                />
                <button
                  class="btn btn-xs btn-ghost"
                  onClick={testWebhook}
                  disabled={!formUrl.value}
                >
                  <IconPlayerPlay size={14} />
                </button>
              </div>
              {testResult.value && (
                <div class={`text-xs flex items-center gap-1 ${testResult.value.success ? 'text-success' : 'text-error'}`}>
                  {testResult.value.success ? <IconCheck size={12} /> : <IconX size={12} />}
                  {testResult.value.message}
                </div>
              )}
              <div class="flex gap-2 flex-wrap">
                {(['like', 'bookmark', 'view'] as WebhookEventType[]).map((event) => (
                  <label key={event} class="label cursor-pointer gap-1 p-0">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-xs"
                      checked={formEvents.value.includes(event)}
                      onChange={() => toggleEvent(event)}
                    />
                    <span class="label-text text-xs">{event}</span>
                  </label>
                ))}
                <label class="label cursor-pointer gap-1 p-0">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-xs"
                    checked={formEnabled.value}
                    onChange={(e) => (formEnabled.value = (e.target as HTMLInputElement).checked)}
                  />
                  <span class="label-text text-xs">enabled</span>
                </label>
              </div>
              <textarea
                class="textarea textarea-bordered textarea-xs w-full"
                rows={2}
                placeholder='Headers JSON: {"Authorization": "Bearer ..."}'
                value={formHeaders.value}
                onInput={(e) => (formHeaders.value = (e.target as HTMLTextAreaElement).value)}
              />
              <div class="flex justify-end gap-2">
                <button class="btn btn-xs btn-ghost" onClick={() => { showWebhookForm.value = false; resetWebhookForm(); }}>
                  Cancel
                </button>
                <button
                  class="btn btn-xs btn-primary"
                  onClick={saveWebhook}
                  disabled={!formName.value || !formUrl.value}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <button class="btn btn-xs btn-ghost mt-2" onClick={openAddWebhook}>
              <IconPlus size={14} />
              Add Webhook
            </button>
          )}
        </div>

        {/* Enable or disable modules. */}
        <p class={styles.subtitle}>{t('Modules (Scroll to see more)')}</p>
        <div class={cx(styles.block, 'flex-col', 'max-h-44 overflow-scroll')}>
          {extensionManager.getExtensions().map((extension) => (
            <label class={cx(styles.item, 'flex-shrink-0')} key={extension.name}>
              <span>
                {t(extension.name.replace('Module', '') as TranslationKey)} {t('Module')}
              </span>
              <input
                type="checkbox"
                class="toggle toggle-secondary"
                checked={extension.enabled}
                onChange={() => {
                  if (extension.enabled) {
                    extensionManager.disable(extension.name);
                  } else {
                    extensionManager.enable(extension.name);
                  }
                }}
              />
            </label>
          ))}
        </div>
        {/* Information about this script. */}
        <p class={styles.subtitle}>{t('About')}</p>
        <div class={styles.block}>
          <span class="label-text whitespace-nowrap">
            {t('Version')} {packageJson.version}
          </span>
          <a class="btn btn-xs btn-ghost" target="_blank" href={packageJson.homepage}>
            <IconBrandGithubFilled class="[&>path]:stroke-0" />
            GitHub
          </a>
        </div>
      </Modal>
    </Fragment>
  );
}
