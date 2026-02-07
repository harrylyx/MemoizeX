import { useSignal, useComputed } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { IconHistory, IconTrash, IconDownload, IconRefresh } from '@tabler/icons-preact';
import dayjs from 'dayjs';

import { ExtensionPanel, Modal } from '@/components/common';
import { Extension } from '@/core/extensions';
import { db } from '@/core/database';
import { BrowsingHistory } from '@/types/browsing';
import { saveFile, jsonExporter } from '@/utils/exporter';
import { useToggle } from '@/utils/common';

interface BrowsingHistoryUIProps {
  extension: Extension;
}

export function BrowsingHistoryUI({ extension }: BrowsingHistoryUIProps) {
  const [showModal, toggleShowModal] = useToggle();
  const histories = useSignal<BrowsingHistory[]>([]);
  const totalCount = useSignal(0);
  const isLoading = useSignal(false);
  const page = useSignal(0);
  const pageSize = 100;

  const hasMore = useComputed(() => (page.value + 1) * pageSize < totalCount.value);

  const loadHistories = async (reset = false) => {
    isLoading.value = true;
    try {
      if (reset) {
        page.value = 0;
      }
      const offset = page.value * pageSize;
      const data = await db.getBrowsingHistories(pageSize, offset);
      const count = await db.getBrowsingHistoryCount();

      if (reset) {
        histories.value = data || [];
      } else {
        histories.value = [...histories.value, ...(data || [])];
      }
      totalCount.value = count || 0;
    } finally {
      isLoading.value = false;
    }
  };

  const loadMore = () => {
    page.value++;
    loadHistories();
  };

  const clearHistory = async () => {
    if (confirm('Are you sure you want to clear all browsing history?')) {
      await db.clearBrowsingHistory();
      histories.value = [];
      totalCount.value = 0;
    }
  };

  const exportHistory = async () => {
    const allHistories = await db.getBrowsingHistories(10000, 0);
    if (allHistories && allHistories.length > 0) {
      const json = await jsonExporter(allHistories);
      saveFile(`browsing-history-${dayjs().format('YYYY-MM-DD')}.json`, json);
    }
  };

  // Load count on mount for panel display
  useEffect(() => {
    db.getBrowsingHistoryCount().then((count) => {
      totalCount.value = count || 0;
    });
  }, []);

  // Load full data when modal opens
  useEffect(() => {
    if (showModal) {
      loadHistories(true);
    }
  }, [showModal]);

  const getSourceBadgeColor = (source: string) => {
    switch (source) {
      case 'home':
        return 'badge-primary';
      case 'profile':
        return 'badge-secondary';
      case 'detail':
        return 'badge-accent';
      case 'search':
        return 'badge-info';
      case 'bookmarks':
        return 'badge-warning';
      case 'likes':
        return 'badge-error';
      default:
        return 'badge-ghost';
    }
  };

  return (
    <ExtensionPanel
      title="Browsing History"
      description={`Captured: ${totalCount.value}`}
      active={totalCount.value > 0}
      onClick={toggleShowModal}
      indicatorColor="bg-accent"
    >
      <Modal
        class="max-w-4xl md:max-w-screen-md sm:max-w-screen-sm min-h-[512px]"
        title="Browsing History"
        show={showModal}
        onClose={toggleShowModal}
      >
        <div class="flex flex-col gap-4 h-full">
          {/* Toolbar */}
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <IconHistory size={20} />
              <span class="font-semibold">Browsing History</span>
              <span class="badge badge-ghost">{totalCount.value} records</span>
            </div>
            <div class="flex gap-2">
              <button
                class="btn btn-sm btn-ghost"
                onClick={() => loadHistories(true)}
                disabled={isLoading.value}
              >
                <IconRefresh size={16} />
                Refresh
              </button>
              <button class="btn btn-sm btn-ghost" onClick={exportHistory}>
                <IconDownload size={16} />
                Export
              </button>
              <button class="btn btn-sm btn-ghost text-error" onClick={clearHistory}>
                <IconTrash size={16} />
                Clear
              </button>
            </div>
          </div>

          {/* History Table */}
          <div class="overflow-x-auto flex-1">
            <table class="table table-sm table-zebra">
              <thead>
                <tr>
                  <th>Tweet ID</th>
                  <th>Source</th>
                  <th>Viewed At</th>
                  <th>URL</th>
                </tr>
              </thead>
              <tbody>
                {histories.value.length === 0 && !isLoading.value && (
                  <tr>
                    <td colSpan={4} class="text-center text-base-content/60 py-8">
                      No browsing history yet. Browse Twitter to start recording.
                    </td>
                  </tr>
                )}

                {histories.value.map((history) => (
                  <tr key={history.id}>
                    <td>
                      <a
                        href={`https://x.com/i/status/${history.tweet_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="link link-hover font-mono text-sm"
                      >
                        {history.tweet_id}
                      </a>
                    </td>
                    <td>
                      <span class={`badge badge-sm ${getSourceBadgeColor(history.source_page)}`}>
                        {history.source_page}
                      </span>
                    </td>
                    <td class="text-sm">
                      {dayjs(history.viewed_at).format('YYYY-MM-DD HH:mm:ss')}
                    </td>
                    <td class="max-w-[200px] truncate text-xs text-base-content/60">
                      {history.url}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {isLoading.value && (
              <div class="flex justify-center py-4">
                <span class="loading loading-spinner loading-md"></span>
              </div>
            )}

            {hasMore.value && !isLoading.value && (
              <div class="flex justify-center py-4">
                <button class="btn btn-sm btn-ghost" onClick={loadMore}>
                  Load More ({totalCount.value - histories.value.length} remaining)
                </button>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </ExtensionPanel>
  );
}
