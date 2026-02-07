# MemoizeX

Enhanced Twitter/X data management with browsing history tracking and webhook notifications.

## Features

- **Browsing History** - Automatically records tweets you view with source tracking (home, profile, search, etc.)
- **Webhook Notifications** - Triggers webhooks on like, bookmark, and view events
- **Data Export** - Export tweets, bookmarks, likes, followers, and more to JSON/CSV/HTML
- **Media Download** - Bulk download images and videos at original quality
- **Local Storage** - All data stored in browser IndexedDB, never leaves your computer

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)
2. Install the userscript from releases or build locally

### Build from Source

```bash
npm install
npm run build
```

Output: `dist/memoizex.user.js`

## Usage

Once installed, a floating panel appears on Twitter/X pages:

- **Browsing History** - View and export your browsing history with deduplication (5-minute window)
- **Webhook Manager** - Configure webhooks with custom headers, event types, and retry settings
- **Data Modules** - Capture and export tweets, bookmarks, likes, followers, etc.

### Webhook Configuration

1. Open the Webhook Manager panel
2. Click "Add" to create a new webhook
3. Configure:
   - **URL**: Your webhook endpoint
   - **Events**: `like`, `bookmark`, `view`
   - **Headers**: Custom HTTP headers (JSON format)
   - **Retry**: Enable retry with exponential backoff
4. Use "Test" to verify connectivity

### Webhook Payload Format

```json
{
  "event": "like",
  "timestamp": 1699999999999,
  "data": {
    "id": "1234567890",
    "text": "Tweet content...",
    "author": {
      "id": "9876543210",
      "screen_name": "username",
      "name": "Display Name"
    },
    "url": "https://x.com/username/status/1234567890",
    "created_at": "Mon Nov 06 12:00:00 +0000 2023",
    "stats": {
      "likes": 100,
      "retweets": 50,
      "replies": 20,
      "quotes": 5,
      "bookmarks": 10
    },
    "media": [
      { "type": "photo", "url": "https://..." }
    ]
  }
}
```

## Development

```bash
npm run dev      # Start dev server with hot reload
npm run build    # Production build
npm run lint     # ESLint check
npm run preview  # Preview production build
```

## Tech Stack

- **UI**: Preact + @preact/signals
- **Styling**: TailwindCSS + DaisyUI
- **Database**: Dexie (IndexedDB)
- **i18n**: i18next
- **Build**: Vite + vite-plugin-monkey

## How It Works

MemoizeX intercepts Twitter's GraphQL API responses by hooking `XMLHttpRequest` at page load. Captured data is stored locally in IndexedDB and can trigger configured webhooks.

Key constraints:
- Runs at `document-start` to hook XHR before Twitter's code
- Uses `GM_xmlhttpRequest` for cross-origin webhook requests
- Only captures data that appears on screen (scroll to load more)

## Privacy

- All data processing happens locally in your browser
- No data is sent to external servers (except your configured webhooks)
- No Twitter API credentials required

## License

MIT
