# Admin Panel — Chat History

Reference for building the admin-panel **Chat History** view. Describes the
message types, the fields each message carries, who/what is shown in the
history, and the rendering rules the client app uses (so the admin view can
match them).

> Source of truth in the app: [message-bubble.tsx](../src/components/chat/message-bubble.tsx),
> [chat-store.ts](../src/stores/chat-store.ts),
> [use-socket.ts](../src/hooks/use-socket.ts),
> [use-file-upload.ts](../src/hooks/use-file-upload.ts),
> [message-cache-store.ts](../src/stores/message-cache-store.ts).

---

## 1. Talk (conversation) types

Every message belongs to a **talk** (a conversation). The talk has a `talkType`:

| `talkType` | Meaning | Who appears |
| ---------- | --------------------------- | ----------------------------------------- |
| `PRIVATE`  | 1-to-1 direct chat          | Exactly two users (sender + receiver)     |
| `GROUP`    | Group chat with many members| All group members; messages show sender   |

History rules that depend on talk type:

- **Sender name + avatar** is shown only in `GROUP` talks (and only on the
  first message of a consecutive run from the same sender). In `PRIVATE` talks
  the other person is already known, so the name label is hidden.
- **Read status** (`isReadByAll`) in a group means *every* member has read it;
  in a private chat it means the single receiver has read it.
- **Presence / typing** is requested only for `PRIVATE` talks.

---

## 2. Message types (`messageType`)

The `messageType` field is the primary discriminator. Four values:

| `messageType` | Description            | Key payload fields                         |
| ------------- | ---------------------- | ------------------------------------------ |
| `TEXT`        | Plain / formatted text | `messageText`                              |
| `IMAGE`       | Image attachment       | `mediaPath`, `mediaName`, `mediaId`        |
| `VIDEO`       | Video attachment       | `mediaPath`, `mediaName`, `mediaId`        |
| `DOCUMENT`    | Any non-image/video file (pdf, doc, sql, xml, csv, …) | `mediaPath`, `mediaName`, `mediaId` |

How the type is decided on upload (see [use-file-upload.ts](../src/hooks/use-file-upload.ts)):

- MIME starts with `image/` → `IMAGE`
- MIME starts with `video/` → `VIDEO`
- everything else → `DOCUMENT`

Size limits: images & documents ≤ **12 MB**, videos ≤ **18 MB**.

### Special render cases for `TEXT`

- **Emoji-only** message (text is purely emoji) → rendered large with no
  bubble background.
- **URLs** and **@mentions** inside text are auto-formatted (links + bold).
  `@all` mentions everyone in a group.

---

## 3. Message object — full field reference

A single message in history can carry any of the following fields. Not all are
present on every message.

### Core
| Field          | Type    | Notes                                              |
| -------------- | ------- | -------------------------------------------------- |
| `messageId`    | string  | Unique id                                          |
| `talkId`       | string  | Conversation this message belongs to               |
| `messageType`  | string  | `TEXT` \| `IMAGE` \| `VIDEO` \| `DOCUMENT`         |
| `messageText`  | string  | Text body (for `TEXT`, and caption-like usage)     |
| `created`      | ISO time| Sent time — used for ordering & date separators    |
| `updated`      | ISO time| Last-modified time (used to detect edits)          |

### Sender
| Field           | Type   | Notes                                  |
| --------------- | ------ | -------------------------------------- |
| `senderId`      | string | User id of the author                  |
| `senderName`    | string | Display name (shown in group history)  |
| `senderProfile` | string | Avatar URL                             |

### Media (IMAGE / VIDEO / DOCUMENT)
| Field        | Type   | Notes                              |
| ------------ | ------ | ---------------------------------- |
| `mediaId`    | string | Uploaded media id                  |
| `mediaPath`  | string | URL to the file (image/video/doc)  |
| `mediaName`  | string | Original filename (shown for docs) |

### Reply
| Field                 | Type   | Notes                                       |
| --------------------- | ------ | ------------------------------------------- |
| `replyToMessageId`    | string | Id of the message being replied to          |
| `replyToMessageText`  | string | Snapshot of replied text                     |
| `replyMessage`        | object | Embedded copy of the replied message         |

### Forward
| Field                   | Type   | Notes                                            |
| ----------------------- | ------ | ------------------------------------------------ |
| `forwardFromMessageId`  | string | Present when the message was forwarded            |
| `forwardMessage`        | object | Embedded copy of the original (its `messageType`, `mediaPath`, `mediaName`) |
| `forwardedMessageText`  | string | Text of the forwarded message                    |

### Status / engagement
| Field          | Type    | Notes                                                       |
| -------------- | ------- | ----------------------------------------------------------- |
| `isReadByAll`  | bool/`'1'`| Read by all recipients → double check (✓✓)                |
| `unread`       | number  | Unread counter                                              |
| `isEdited`     | bool    | True if edited (or `updated` ≠ `created`) → "Edited" label  |
| `isPinned`     | bool    | Pinned in the conversation                                  |
| `reactions`    | array   | See below                                                   |

### Reaction object (inside `reactions[]`)
| Field         | Type   | Notes                       |
| ------------- | ------ | --------------------------- |
| `chatuserId`  | string | Who reacted                 |
| `userName`    | string | Reactor display name        |
| `userProfile` | string | Reactor avatar (optional)   |
| `reaction`    | string | The emoji                   |

---

## 4. What is shown in history (and how)

When rendering the history list in the admin panel, reproduce these rules so it
matches the live app:

1. **Order** — ascending by `created`. Insert a **date separator** whenever the
   day changes between consecutive messages.
2. **Sender side** — messages authored by the viewed user are right-aligned
   ("sent"); others left-aligned ("received"). In the admin panel you may
   instead always show `senderName` regardless of side.
3. **Sender header** — show `senderName` + `senderProfile` only for `GROUP`
   talks, and only on the first of a consecutive run from the same sender.
4. **Body by type**:
   - `TEXT` → formatted text (links, mentions, emoji-only large).
   - `IMAGE` → thumbnail (click → lightbox).
   - `VIDEO` → thumbnail with play overlay.
   - `DOCUMENT` → file icon + `mediaName`.
5. **Reply** — show a quoted preview (sender name + snippet/thumbnail) above the
   body; clicking it should scroll to `replyToMessageId`.
6. **Forward** — show a "Forwarded" label; render using `forwardMessage` /
   `forwardedMessageText`.
7. **Timestamp** — `created` formatted as `h:mm a`. Append **"Edited"** when
   `isEdited`. For sent messages show ✓ (sent) or ✓✓ (`isReadByAll`).
8. **Reactions** — render the `reactions[]` emoji chips with counts; clicking a
   chip can open who-reacted details.
9. **Pinned** — flag/badge when `isPinned`.

---

## 5. Real-time events (live socket)

These are the events that mutate the history in real time (from
[use-socket.ts](../src/hooks/use-socket.ts)). The admin panel reflects the
*result* of these in the stored history, but they are listed here for context:

| Event                | Effect on history                          |
| -------------------- | ------------------------------------------ |
| `newMessage`         | Appends a new message                      |
| `messageEdited`      | Updates `messageText` + `updated`/`isEdited` |
| `messageDeleted`     | Removes the message                        |
| `readStatusUpdated`  | Updates `isReadByAll` / `unread`           |
| `reactionToggled`    | Adds/removes an entry in `reactions[]`     |
| `pinToggled`         | Flips `isPinned`                           |
| `presenceChanged`    | Online/offline (PRIVATE only)              |
| `userTyping` / `userStopTyping` | Typing indicator (not stored)   |

Outgoing actions a user can take on a message: **Reply, Forward, Select, Copy
(text), Edit (own text only), Download (media), React, Pin/Unpin, Delete (own
only)**.

---

## 6. Deleted messages

A deleted message is **removed** from the history list (hard removal in the
client cache via `messageDeleted`). If the admin panel needs to *retain* and
display deleted messages, that must be backed by a server-side soft-delete /
audit record — it is not available from the client cache alone.

---

## 7. Quick-reference: minimal admin history row

```jsonc
{
  "messageId": "…",
  "talkId": "…",
  "talkType": "GROUP",            // PRIVATE | GROUP
  "messageType": "IMAGE",         // TEXT | IMAGE | VIDEO | DOCUMENT
  "senderId": "…",
  "senderName": "Jane Doe",
  "senderProfile": "https://…",
  "messageText": "",              // body for TEXT
  "mediaPath": "https://…",       // for IMAGE/VIDEO/DOCUMENT
  "mediaName": "report.pdf",
  "created": "2026-06-03T10:15:00Z",
  "updated": "2026-06-03T10:15:00Z",
  "isEdited": false,
  "isReadByAll": true,
  "isPinned": false,
  "replyToMessageId": null,
  "forwardFromMessageId": null,
  "reactions": [
    { "chatuserId": "…", "userName": "John", "reaction": "👍" }
  ]
}
```
