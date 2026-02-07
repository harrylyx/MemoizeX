import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import {
  IconWebhook,
  IconPlus,
  IconTrash,
  IconEdit,
  IconPlayerPlay,
  IconCheck,
  IconX,
  IconRefresh,
} from '@tabler/icons-preact';
import dayjs from 'dayjs';

import { webhookManager } from '@/core/webhook';
import { db } from '@/core/database';
import { WebhookConfig, WebhookLog, WebhookEventType } from '@/types/webhook';
import { generateWebhookConfigId } from '@/utils/webhook-formatter';

export function WebhookManagerUI() {
  const configs = useSignal<WebhookConfig[]>([]);
  const logs = useSignal<WebhookLog[]>([]);
  const isLoading = useSignal(false);
  const showAddForm = useSignal(false);
  const editingConfig = useSignal<WebhookConfig | null>(null);
  const testResult = useSignal<{ success: boolean; message: string } | null>(null);

  // Form state
  const formName = useSignal('');
  const formUrl = useSignal('');
  const formEnabled = useSignal(true);
  const formEvents = useSignal<WebhookEventType[]>(['like', 'bookmark']);
  const formHeaders = useSignal('');
  const formRetryOnFailure = useSignal(true);
  const formMaxRetries = useSignal(3);

  const loadData = async () => {
    isLoading.value = true;
    try {
      await webhookManager.loadConfigs();
      configs.value = webhookManager.getConfigs();
      const logsData = await db.getWebhookLogs(50, 0);
      logs.value = logsData || [];
    } finally {
      isLoading.value = false;
    }
  };

  const resetForm = () => {
    formName.value = '';
    formUrl.value = '';
    formEnabled.value = true;
    formEvents.value = ['like', 'bookmark'];
    formHeaders.value = '';
    formRetryOnFailure.value = true;
    formMaxRetries.value = 3;
    editingConfig.value = null;
    testResult.value = null;
  };

  const openAddForm = () => {
    resetForm();
    showAddForm.value = true;
  };

  const openEditForm = (config: WebhookConfig) => {
    formName.value = config.name;
    formUrl.value = config.url;
    formEnabled.value = config.enabled;
    formEvents.value = [...config.events];
    formHeaders.value = JSON.stringify(config.headers, null, 2);
    formRetryOnFailure.value = config.retry_on_failure;
    formMaxRetries.value = config.max_retries;
    editingConfig.value = config;
    showAddForm.value = true;
  };

  const closeForm = () => {
    showAddForm.value = false;
    resetForm();
  };

  const parseHeaders = (): Record<string, string> => {
    try {
      return formHeaders.value ? JSON.parse(formHeaders.value) : {};
    } catch {
      return {};
    }
  };

  const saveConfig = async () => {
    const headers = parseHeaders();
    const now = Date.now();

    if (editingConfig.value) {
      await webhookManager.updateConfig(editingConfig.value.id, {
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

    closeForm();
    await loadData();
  };

  const deleteConfig = async (id: string) => {
    if (confirm('Are you sure you want to delete this webhook?')) {
      await webhookManager.deleteConfig(id);
      await loadData();
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

  const clearLogs = async () => {
    if (confirm('Are you sure you want to clear all webhook logs?')) {
      await db.clearWebhookLogs();
      logs.value = [];
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return 'badge-success';
      case 'failed':
        return 'badge-error';
      case 'pending':
        return 'badge-warning';
      default:
        return 'badge-ghost';
    }
  };

  return (
    <div class="flex flex-col gap-4">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <IconWebhook size={20} />
          <span class="font-semibold">Webhook Manager</span>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-ghost" onClick={() => loadData()} disabled={isLoading.value}>
            <IconRefresh size={16} />
          </button>
          <button class="btn btn-sm btn-primary" onClick={openAddForm}>
            <IconPlus size={16} />
            Add
          </button>
        </div>
      </div>

      {/* Add/Edit Form Modal */}
      {showAddForm.value && (
        <div class="card bg-base-200 p-4">
          <h3 class="font-semibold mb-4">
            {editingConfig.value ? 'Edit Webhook' : 'Add Webhook'}
          </h3>

          <div class="flex flex-col gap-3">
            <div class="form-control">
              <label class="label">
                <span class="label-text">Name</span>
              </label>
              <input
                type="text"
                class="input input-sm input-bordered"
                value={formName.value}
                onInput={(e) => (formName.value = (e.target as HTMLInputElement).value)}
                placeholder="My Webhook"
              />
            </div>

            <div class="form-control">
              <label class="label">
                <span class="label-text">URL</span>
              </label>
              <div class="flex gap-2">
                <input
                  type="url"
                  class="input input-sm input-bordered flex-1"
                  value={formUrl.value}
                  onInput={(e) => (formUrl.value = (e.target as HTMLInputElement).value)}
                  placeholder="https://example.com/webhook"
                />
                <button
                  class="btn btn-sm btn-ghost"
                  onClick={testWebhook}
                  disabled={!formUrl.value}
                >
                  <IconPlayerPlay size={16} />
                  Test
                </button>
              </div>
              {testResult.value && (
                <div
                  class={`alert alert-sm mt-2 ${testResult.value.success ? 'alert-success' : 'alert-error'}`}
                >
                  {testResult.value.success ? <IconCheck size={16} /> : <IconX size={16} />}
                  <span class="text-sm">{testResult.value.message}</span>
                </div>
              )}
            </div>

            <div class="form-control">
              <label class="label">
                <span class="label-text">Events</span>
              </label>
              <div class="flex gap-2">
                {(['like', 'bookmark', 'view'] as WebhookEventType[]).map((event) => (
                  <label key={event} class="label cursor-pointer gap-2">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm"
                      checked={formEvents.value.includes(event)}
                      onChange={() => toggleEvent(event)}
                    />
                    <span class="label-text">{event}</span>
                  </label>
                ))}
              </div>
            </div>

            <div class="form-control">
              <label class="label">
                <span class="label-text">Headers (JSON)</span>
              </label>
              <textarea
                class="textarea textarea-bordered textarea-sm"
                rows={3}
                value={formHeaders.value}
                onInput={(e) => (formHeaders.value = (e.target as HTMLTextAreaElement).value)}
                placeholder='{"Authorization": "Bearer token"}'
              />
            </div>

            <div class="flex gap-4">
              <label class="label cursor-pointer gap-2">
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm"
                  checked={formEnabled.value}
                  onChange={(e) => (formEnabled.value = (e.target as HTMLInputElement).checked)}
                />
                <span class="label-text">Enabled</span>
              </label>

              <label class="label cursor-pointer gap-2">
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm"
                  checked={formRetryOnFailure.value}
                  onChange={(e) =>
                    (formRetryOnFailure.value = (e.target as HTMLInputElement).checked)
                  }
                />
                <span class="label-text">Retry on failure</span>
              </label>

              {formRetryOnFailure.value && (
                <div class="flex items-center gap-2">
                  <span class="label-text">Max retries:</span>
                  <input
                    type="number"
                    class="input input-sm input-bordered w-16"
                    min="1"
                    max="10"
                    value={formMaxRetries.value}
                    onInput={(e) =>
                      (formMaxRetries.value = parseInt((e.target as HTMLInputElement).value) || 3)
                    }
                  />
                </div>
              )}
            </div>

            <div class="flex justify-end gap-2 mt-2">
              <button class="btn btn-sm btn-ghost" onClick={closeForm}>
                Cancel
              </button>
              <button
                class="btn btn-sm btn-primary"
                onClick={saveConfig}
                disabled={!formName.value || !formUrl.value}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Webhook Configs List */}
      <div class="flex flex-col gap-2">
        <h4 class="font-semibold text-sm">Configurations</h4>
        {configs.value.length === 0 && (
          <div class="text-center text-base-content/60 py-4">No webhook configurations yet.</div>
        )}
        {configs.value.map((config) => (
          <div
            key={config.id}
            class="flex items-center justify-between p-3 bg-base-200 rounded-lg"
          >
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-2">
                <span class="font-medium">{config.name}</span>
                <span class={`badge badge-xs ${config.enabled ? 'badge-success' : 'badge-ghost'}`}>
                  {config.enabled ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div class="text-xs text-base-content/60">
                <span class="font-mono">{config.url}</span>
              </div>
              <div class="flex gap-1">
                {config.events.map((event) => (
                  <span key={event} class="badge badge-xs badge-outline">
                    {event}
                  </span>
                ))}
              </div>
            </div>
            <div class="flex gap-1">
              <button class="btn btn-xs btn-ghost" onClick={() => openEditForm(config)}>
                <IconEdit size={14} />
              </button>
              <button
                class="btn btn-xs btn-ghost text-error"
                onClick={() => deleteConfig(config.id)}
              >
                <IconTrash size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Webhook Logs */}
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <h4 class="font-semibold text-sm">Logs</h4>
          <button class="btn btn-xs btn-ghost text-error" onClick={clearLogs}>
            <IconTrash size={14} />
          </button>
        </div>
        <div class="max-h-48 overflow-y-auto">
          {logs.value.length === 0 && (
            <div class="text-center text-base-content/60 py-4">No webhook logs yet.</div>
          )}
          {logs.value.map((log) => (
            <div
              key={log.id}
              class="flex items-center justify-between p-2 text-xs border-b border-base-300"
            >
              <div class="flex items-center gap-2">
                <span class={`badge badge-xs ${getStatusBadge(log.status)}`}>{log.status}</span>
                <span class="badge badge-xs badge-outline">{log.event_type}</span>
                <span class="font-mono">{log.tweet_id}</span>
              </div>
              <span class="text-base-content/60">
                {dayjs(log.created_at).format('HH:mm:ss')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
