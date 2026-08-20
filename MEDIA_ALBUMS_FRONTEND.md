# Media Captions & Multi-Media Messages — Frontend Guide

Two related changes shipped together:

1. **Media messages can carry text** — the caption lives in `messageText`, the same field a plain text message uses. No new field.
2. **One message can carry up to 10 attachments** — an album. Reads expose `mediaItems[]`; sends accept `mediaIds[]`.

Everything is backward compatible: an existing client that never sends `mediaIds` and never reads `mediaItems` keeps working unchanged. But it will render an album as a single image and drop captions, so migrate the read path first.

---

## The one rule that breaks old clients

> **Never use `messageType` to decide whether a message has text.**

`messageType` describes how to render the *bubble* (`TEXT` / `IMAGE` / `VIDEO` / `AUDIO` / `DOCUMENT`). It says nothing about text. A captioned image is `messageType: "IMAGE"` **and** has `messageText`.

```js
// wrong — hides every caption
if (msg.messageType === 'TEXT') renderText(msg.messageText);

// right
if (msg.messageText) renderText(msg.messageText);
```

The same applies to `@mention` highlighting, quoted-reply previews, search-result rendering, and link detection — all of which now have to run on media messages too.

---

## Sending

### Step 1 — upload (`POST {basePath}/chat/media/upload`)

`multipart/form-data`, field name `media`, now accepts **up to 10 files per request**.

| Field | Notes |
|---|---|
| `media` | one or more files. Repeat the field for multiple files. |
| `name` | **optional**. Repeat once per file, index-aligned. Falls back to the file's own filename. |
| `type` | **optional**. Repeat once per file, index-aligned. Derived from MIME type when omitted. |

```js
const fd = new FormData();
files.forEach(f => fd.append('media', f));   // same field name, repeated
// name/type are optional — omit them and the server derives both
const { data } = await api.post('/chat/media/upload', fd);
```

Response — `items[]` and `mediaIds[]` are new; the flat top-level fields are the **first** item, kept so single-upload clients need no change:

```json
{
  "mediaId": "uuid-1",
  "url": "https://…/messages/2026/08/a.png",
  "type": "IMAGE",
  "name": "a.png",
  "items": [
    { "mediaId": "uuid-1", "url": "https://…/a.png", "type": "IMAGE", "name": "a.png" },
    { "mediaId": "uuid-2", "url": "https://…/b.png", "type": "IMAGE", "name": "b.png" }
  ],
  "mediaIds": ["uuid-1", "uuid-2"]
}
```

`items` is ordered to match the order you appended the files. **That order becomes album order** — pass `mediaIds` through to `sendMessage` unchanged.

**Size limits are per file, not per request.** Three 5 MB images in one upload is fine. If any single file is over its cap the whole batch is rejected and nothing is stored: `{ "success": false, "message": "File too large. Max allowed: 12 MB" }`. Caps: images 12 MB, video 18 MB, everything else 12 MB; admins get a flat 30 MB for every type.

### Step 2 — send (`sendMessage` on the `/talk` namespace)

```js
socket.emit('sendMessage', {
  message: 'three shots from the trip',   // the caption — optional, may be ''
  mediaIds: ['uuid-1', 'uuid-2'],        // album, in render order
  // messageType: omit it — see below
  replyToMessageId: null,
  forwardFromMessageId: null,
}, ack => { /* { success, messageId } */ });
```

| Field | Change |
|---|---|
| `message` | **now doubles as the caption** on a media message. Send `''` for an uncaptioned attachment. |
| `mediaIds` | **new** — ordered array, max 10. |
| `mediaId` | still accepted for a single attachment. Equivalent to a one-item `mediaIds`. If both are sent, `mediaIds` wins. |
| `messageType` | **stop sending it for media.** Leave it off (or `'TEXT'`) and the server derives it from the first attachment. The value on the broadcast `newMessage` is authoritative. |

Server-side normalisation, so you don't have to pre-clean the list: duplicates collapse, ids with no media row are dropped silently, order is preserved, and the list is truncated to 10.

---

## Reading

### `mediaItems[]` on every message

Present on `newMessage`, `GET /chat/message/list`, forward broadcasts, and the monitor feed. **This is the field to render.** A single-attachment message is a one-item album, so there is no separate code path.

```json
{
  "messageId": "…",
  "messageText": "three shots from the trip",
  "messageType": "IMAGE",
  "mediaId": "uuid-1",
  "mediaPath": "https://…/a.png",
  "mediaItems": [
    { "mediaId": "uuid-1", "mediaPath": "https://…/a.png", "mediaName": "a.png", "mediaType": "IMAGE", "position": 0 },
    { "mediaId": "uuid-2", "mediaPath": "https://…/b.png", "mediaName": "b.png", "mediaType": "IMAGE", "position": 1 }
  ]
}
```

- Always an array — `[]` for a text message, never `null`.
- Sorted by `position` ascending. `mediaPath` is an absolute URL, already resolved.
- `mediaItems` may mix types (an image and a PDF in one message). Render per item's `mediaType`, not the message's `messageType`.
- The top-level `mediaId` / `mediaPath` / `mediaName` / `mediaType` are `mediaItems[0]` repeated. **Deprecated for rendering** — they exist only so pre-album clients keep working. Reading them on an album shows 1 of 3 attachments.

A deleted message is a tombstone: `isDeleted: true`, `messageText: null`, `mediaId: null`, `mediaItems: []`. Nothing leaks.

### `mediaCount` on previews

Reply previews, forward previews, and the talk-list `lastMessage` all gained `mediaCount` (int, `0` for a text message). Use it for the "📷 3 photos" line:

```js
const preview = msg.replyMessage;
const label = preview.messageText
  || (preview.mediaCount > 1 ? `${preview.mediaCount} ${preview.messageType.toLowerCase()}s` : preview.messageType.toLowerCase());
```

Previews still carry a single `mediaPath` — the first attachment — which is the right thumbnail for the preview strip. Combine it with `mediaCount` for a "+2" badge.

Captions now appear in these previews where they were previously blank: `replyMessage.messageText` on a quoted image, `forwardMessage.messageText` on a forwarded image, `lastMessage.messageText` in the talk list.

### Search (`POST /chat/message/search`)

Search now matches **captions**, so a hit can be a media message. Results gained `messageType`, `mediaPath`, `mediaType` so you can render the hit as media rather than assuming plain text.

### Gallery (`GET /chat/media/list`)

Now returns **one row per attachment**, not per message — an album of 3 contributes 3 entries, ordered by (message time, album position). Rows from the same album share a `messageId` and differ by `position`; group on `messageId` if the gallery shows album grouping. `limit` counts *messages*, so an album is never split across two pages — expect a page to return more rows than `limit`.

### Push notifications

Body resolution changed: caption first, then a media description. An uncaptioned album pluralises — `"3 images"` instead of `"image"`. `@mentions` inside a caption now trigger mention notifications.

---

## `mediaConverted` (HEIC → PNG)

Unchanged payload — `{ messageId, mediaId, mediaPath, mediaName }` — but the handling must change. Match on `mediaId` and patch **that item inside `mediaItems`**, rather than replacing the message's `mediaPath`:

```js
socket.on('mediaConverted', ({ messageId, mediaId, mediaPath, mediaName }) => {
  patchMessage(messageId, m => ({
    ...m,
    mediaItems: m.mediaItems.map(i => i.mediaId === mediaId ? { ...i, mediaPath, mediaName } : i),
    // keep the legacy pointer in sync if you still read it
    ...(m.mediaId === mediaId ? { mediaPath, mediaName } : {}),
  }));
});
```

Previously the event only fired for the message's single attachment; it now fires for any album item, so a client that overwrites the top-level `mediaPath` will replace the wrong image.

---

## Migration checklist

1. Replace every `messageType === 'TEXT'` has-text check with a `messageText` truthiness check — bubbles, quoted replies, mentions, search results, link preview.
2. Render from `mediaItems[]`. Stop reading top-level `mediaPath` for display.
3. Send `mediaIds` from the upload's `mediaIds`; stop sending `messageType` for media.
4. Upload multiple files under the repeated `media` field; drop any client-side `name`/`type` bookkeeping you don't need.
5. Add a caption input to the media composer — one caption per message, not per attachment.
6. Use `mediaCount` for album previews in the talk list and reply/forward strips.
7. Patch `mediaConverted` into `mediaItems` by `mediaId`.
8. Handle the per-file size error as a whole-batch rejection — nothing was stored, the user re-picks.

## Constraints worth designing around

- **Max 10 attachments per message**, enforced server-side by truncation, not an error. Cap the picker at 10 client-side so the user isn't silently short.
- **One caption per message.** Per-attachment captions aren't supported — send separate messages for that.
- An album is **one unit**: one reaction target, one reply target, one delete. Deleting removes the whole album.
- **Forwarding clones the whole album** and keeps the caption.
