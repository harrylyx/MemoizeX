# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run dev      # Start Vite dev server with hot reload
npm run build    # TypeScript check + Vite production build
npm run lint     # ESLint check
npm run preview  # Preview production build
```

Output: `dist/memoizex.user.js` (Tampermonkey/Violentmonkey userscript)

## Architecture

MemoizeX is a Tampermonkey userscript that enhances Twitter/X with browsing history tracking and webhook notifications. It extends the twitter-web-exporter project.

### Core Concepts

**XHR Interception**: The script hooks `XMLHttpRequest.prototype.open` at `document-start` to intercept Twitter's GraphQL API responses. This must run in page context (not content script) via `unsafeWindow`.

**Extension System**: Modules extend the `Extension` base class (`src/core/extensions/extension.ts`):
- `intercept()` - Returns an `Interceptor` function to process XHR responses
- `render()` - Returns a Preact component for the UI panel
- Register in `src/main.tsx` via `extensions.add()`

**Database**: Dexie (IndexedDB wrapper) with 6 tables:
- `tweets`, `users`, `captures` - Original twitter-web-exporter tables
- `browsing_history`, `webhook_configs`, `webhook_logs` - MemoizeX additions

### Key Directories

- `src/core/` - Shared infrastructure (database, options, extensions, webhook)
- `src/modules/` - Feature modules (each has index.tsx, api.ts, optional ui.tsx)
- `src/types/` - TypeScript interfaces for Tweet, User, BrowsingHistory, Webhook
- `src/i18n/locales/` - Translation JSON files (en, zh-Hans)

### MemoizeX-Specific Modules

- `browsing-history/` - Intercepts all tweet display endpoints, records with 5-min deduplication
- `webhook-manager/` - UI for configuring webhooks
- `src/core/webhook/` - Webhook sending via `GM_xmlhttpRequest` with retry queue

### Data Flow

1. Twitter loads tweets via GraphQL
2. XHR interceptor captures response
3. Module's `Interceptor` extracts tweets using `extractDataFromResponse()`
4. Data saved to IndexedDB via `db.extAddTweets()`
5. Webhooks triggered if configured

## Tech Stack

- **UI**: Preact + @preact/signals (reactive state)
- **Styling**: TailwindCSS + DaisyUI (scoped to `#memoizex-root`)
- **Database**: Dexie (IndexedDB)
- **i18n**: i18next with virtual loader
- **Build**: Vite + vite-plugin-monkey (userscript bundler)

## Important Patterns

**Interceptor Pattern**: Return early if URL doesn't match, wrap in try/catch:
```typescript
export const MyInterceptor: Interceptor = (req, res, ext) => {
  if (!/\/graphql\/.+\/MyEndpoint/.test(req.url)) return;
  try {
    const data = extractDataFromResponse(res, ...);
    db.extAddTweets(ext.name, data);
  } catch (err) {
    logger.errorWithBanner('Failed', err);
  }
};
```

**Options**: Add new options to `AppOptions` interface and `DEFAULT_APP_OPTIONS` in `src/core/options/manager.ts`.

**Translations**: Add keys to `src/i18n/locales/en/common.json`. The i18n system is strongly typed.

## Constraints

- Must inject at `document-start` to hook XHR before Twitter's code runs
- `GM_xmlhttpRequest` required for cross-origin webhook requests (declared in vite.config.ts grants)
- CSS scoped to `#memoizex-root` via postcss-prefix-selector
