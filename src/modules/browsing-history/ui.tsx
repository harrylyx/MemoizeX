import { useSignal, useComputed } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { IconHistory, IconTrash, IconDownload, IconRefresh } from '@tabler/icons-preact';
import dayjs from 'dayjs';

import { Extension } from '@/core/extensions';
import { db } from '@/core/database';
import { BrowsingHistory } from '@/types/browsing';
import { saveFile, jsonExporter } from '@/utils/exporter';

interface BrowsingHistoryUIProps {
  extension: Extension;
}

export function BrowsingHistoryUI({ extension }: BrowsingHistoryUIProps) {
  const histories = useSignal<BrowsingHistory[]>([]);
  const totalCount = useSignal(0);
  const isLoading = useSignal(false);
  const page = useSignal(0);
  const pageSize = 50;

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

  useEffect(() => {
    loadHistories(true);
  }, []);

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
    <div class="flex flex-col gap-4">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <IconHistory size={20} />
          <span class="font-semibold">Browsing History</span>
          <span class="badge badge-ghost">{totalCount.value}</span>
        </div>
        <div class="flex gap-2">
          <button
            class="btn btn-sm btn-ghost"
            onClick={() => loadHistories(true)}
            disabled={isLoading.value}
          >
            <IconRefresh size={16} />
          </button>
          <button class="btn btn-sm btn-ghost" onClick={exportHistory}>
            <IconDownload size={16} />
          </button>
          <button class="btn btn-sm btn-ghost text-error" onClick={clearHistory}>
            <IconTrash size={16} />
          </button>
        </div>
      </div>

      {/* History List */}
      <div class="flex flex-col gap-2 max-h-96 overflow-y-auto">
        {histories.value.length === 0 && !isLoading.value && (
          <div class="text-center text-base-content/60 py-8">
            No browsing history yet.
          </div>
        )}

        {histories.value.map((history) => (
          <div
            key={history.id}
            class="flex items-center justify-between p-2 bg-base-200 rounded-lg"
          >
            <div class="flex flex-col gap-1">
              <a
                href={`https://x.com/i/status/${history.tweet_id}`}
                target="_blank"
                rel="noopener noreferrer"
                class="link link-hover text-sm font-mono"
              >
                {history.tweet_id}
              </a>
              <div class="flex items-center gap-2 text-xs text-base-content/60">
                <span class={`badge badge-xs ${getSourceBadgeColor(history.source_page)}`}>
                  {history.source_page}
                </span>
                <span>{dayjs(history.viewed_at).format('YYYY-MM-DD HH:mm:ss')}</span>
              </div>
            </div>
          </div>
        ))}

        {isLoading.value && (
          <div class="flex justify-center py-4">
            <span class="loading loading-spinner loading-sm"></span>
          </div>
        )}

        {hasMore.value && !isLoading.value && (
          <button class="btn btn-sm btn-ghost" onClick={loadMore}>
            Load More
          </button>
        )}
      </div>
    </div>
  );
}
