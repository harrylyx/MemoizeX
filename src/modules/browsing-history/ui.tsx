import { useSignal, useComputed } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { IconTrash, IconDownload, IconRefresh } from '@tabler/icons-preact';
import dayjs from 'dayjs';

import { ExtensionPanel, Modal, SearchArea } from '@/components/common';
import { Pagination } from '@/components/table/pagination';
import { Extension } from '@/core/extensions';
import { db } from '@/core/database';
import { options } from '@/core/options';
import { BrowsingHistory } from '@/types/browsing';
import { saveFile, jsonExporter } from '@/utils/exporter';
import { useToggle, formatDateTime } from '@/utils/common';
import { useTranslation, TranslationKey } from '@/i18n';

interface BrowsingHistoryUIProps {
  extension: Extension;
}

export function BrowsingHistoryUI({ extension }: BrowsingHistoryUIProps) {
  const { t } = useTranslation();
  const [showModal, toggleShowModal] = useToggle();
  const histories = useSignal<BrowsingHistory[]>([]);
  const filteredHistories = useSignal<BrowsingHistory[]>([]);
  const totalCount = useSignal(0);
  const isLoading = useSignal(false);
  const searchQuery = useSignal('');
  const currentPage = useSignal(0);
  const pageSize = useSignal(20);

  const title = t(extension.name.replace('Module', '') as TranslationKey);

  const totalPages = useComputed(() => Math.ceil(filteredHistories.value.length / pageSize.value));

  const paginatedHistories = useComputed(() => {
    const start = currentPage.value * pageSize.value;
    return filteredHistories.value.slice(start, start + pageSize.value);
  });

  const loadHistories = async () => {
    isLoading.value = true;
    try {
      const data = await db.getBrowsingHistories(10000, 0);
      const count = await db.getBrowsingHistoryCount();
      histories.value = data || [];
      filteredHistories.value = data || [];
      totalCount.value = count || 0;
    } finally {
      isLoading.value = false;
    }
  };

  const handleSearch = (query: string) => {
    searchQuery.value = query;
    currentPage.value = 0;
    if (!query) {
      filteredHistories.value = histories.value;
    } else {
      filteredHistories.value = histories.value.filter(
        (h) =>
          h.tweet_id.includes(query) ||
          h.source_page.includes(query.toLowerCase()) ||
          h.url.includes(query)
      );
    }
  };

  const clearHistory = async () => {
    if (confirm(t('Confirm clear history'))) {
      await db.clearBrowsingHistory();
      histories.value = [];
      filteredHistories.value = [];
      totalCount.value = 0;
    }
  };

  const exportHistory = async () => {
    if (histories.value.length > 0) {
      const exportData = histories.value.map((h) => ({
        id: h.id,
        tweet_id: h.tweet_id,
        tweet_url: `https://x.com/i/status/${h.tweet_id}`,
        source_page: h.source_page,
        viewed_at: formatDateTime(h.viewed_at, options.get('dateTimeFormat')),
        page_url: h.url,
      }));
      const json = await jsonExporter(exportData);
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
      loadHistories();
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
      title={title}
      description={`${t('Captured:')} ${totalCount.value}`}
      active={totalCount.value > 0}
      onClick={toggleShowModal}
      indicatorColor="bg-info"
    >
      <Modal
        class="max-w-4xl md:max-w-screen-md sm:max-w-screen-sm min-h-[512px]"
        title={title}
        show={showModal}
        onClose={toggleShowModal}
      >
        {/* Search */}
        <SearchArea defaultValue={searchQuery.value} onChange={handleSearch} />

        {/* Data Table */}
        <main class="max-w-full grow overflow-scroll bg-base-200 overscroll-none">
          <table class="table table-pin-rows table-border-bc table-padding-sm">
            <thead>
              <tr>
                <th>{t('Tweet ID' as TranslationKey)}</th>
                <th>{t('Source' as TranslationKey)}</th>
                <th>{t('Viewed At' as TranslationKey)}</th>
                <th>{t('URL')}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedHistories.value.length === 0 && !isLoading.value && (
                <tr>
                  <td colSpan={4} class="text-center text-base-content text-opacity-50 py-8">
                    {t('No data available.')}
                  </td>
                </tr>
              )}

              {paginatedHistories.value.map((history) => (
                <tr key={history.id}>
                  <td>
                    <a
                      href={`https://x.com/i/status/${history.tweet_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="link w-20 break-all font-mono text-xs"
                    >
                      {history.tweet_id}
                    </a>
                  </td>
                  <td>
                    <span class={`badge badge-sm ${getSourceBadgeColor(history.source_page)}`}>
                      {history.source_page}
                    </span>
                  </td>
                  <td class="w-24">
                    {formatDateTime(history.viewed_at, options.get('dateTimeFormat'))}
                  </td>
                  <td class="max-w-[200px] truncate text-xs text-base-content/60">
                    {history.url}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {isLoading.value && (
            <div class="flex items-center justify-center h-[320px] w-full">
              <span class="loading loading-spinner loading-md"></span>
            </div>
          )}
        </main>

        {/* Pagination */}
        <div class="flex items-center justify-between py-2 text-sm">
          <div class="flex items-center gap-2">
            <span>{t('Rows per page:')}</span>
            <select
              class="select select-xs select-bordered"
              value={pageSize.value}
              onChange={(e) => {
                pageSize.value = parseInt((e.target as HTMLSelectElement).value);
                currentPage.value = 0;
              }}
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <div class="flex items-center gap-2">
            <span>
              {t('A - B of N items', {
                from: currentPage.value * pageSize.value + 1,
                to: Math.min((currentPage.value + 1) * pageSize.value, filteredHistories.value.length),
                total: filteredHistories.value.length,
              })}
            </span>
            <div class="btn-group">
              <button
                class="btn btn-xs"
                disabled={currentPage.value === 0}
                onClick={() => (currentPage.value = 0)}
              >
                «
              </button>
              <button
                class="btn btn-xs"
                disabled={currentPage.value === 0}
                onClick={() => currentPage.value--}
              >
                ‹
              </button>
              <button
                class="btn btn-xs"
                disabled={currentPage.value >= totalPages.value - 1}
                onClick={() => currentPage.value++}
              >
                ›
              </button>
              <button
                class="btn btn-xs"
                disabled={currentPage.value >= totalPages.value - 1}
                onClick={() => (currentPage.value = totalPages.value - 1)}
              >
                »
              </button>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div class="flex mt-3 space-x-2">
          <button class="btn btn-neutral btn-ghost" onClick={clearHistory}>
            <IconTrash size={16} />
            {t('Clear')}
          </button>
          <span class="flex-grow" />
          <button class="btn btn-ghost" onClick={() => loadHistories()}>
            <IconRefresh size={16} />
            {t('Refresh' as TranslationKey)}
          </button>
          <button class="btn btn-primary" onClick={exportHistory}>
            <IconDownload size={16} />
            {t('Export Data')}
          </button>
        </div>
      </Modal>
    </ExtensionPanel>
  );
}
