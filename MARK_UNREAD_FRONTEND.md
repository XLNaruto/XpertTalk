# Mark Message as Unread — Frontend Guide

Lets a user mark one message, and everything after it, unread again — Telegram's
"mark as unread from here" rather than WhatsApp's whole-chat dot.

**No new fields to read.** It works by rewinding the caller's `lastReadAt`, so the
unread state you already render updates itself:

| What you already read | After marking unread |
|---|---|
| `unreadCount` on the talk list | jumps from 0 to the number of messages from the target onward |
| `unread` (0/1) per message in `/chat/message/list` | flips to 1 for the target and everything newer |
| the first-unread jump on `/chat/message/list` with no `fromMessageId` | lands on the target message |

It is **per user**. Nobody else is notified, and no read receipt is withdrawn.

---

## The one thing that will break this

> **If your client calls `markRead` when the talk opens, it will instantly undo the mark.**

`lastReadAt` is the only state involved, so any `markRead` moves it forward again and
the unread state is gone. If the mark is made from inside the open thread, this
happens within milliseconds and looks like the feature doesn't work.

Make `markRead` a consequence of the user actually seeing messages, not of the talk
being open:

```js
// wrong — wipes a mark the user just made, and any mark made from the chat list
onTalkOpen(() => socket.emit('markRead', { messageId: newestMessageId }));

// right — only when the newest message is actually on screen
onNewestMessageVisible(id => socket.emit('markRead', { messageId: id }));
```

If you mark unread from inside the thread, the intended UX is to leave the thread
immediately (pop back to the chat list) so nothing re-reads it.

---

## API

### Socket — `markUnread` on the `/talk` namespace

```js
socket.emit('markUnread', { messageId }, ack => {
  // { success: true, messageId, unreadCount }
  // { success: false, error: 'Message does not belong to this talk' }
});
```

`talkId` comes from the socket handshake, so it isn't in the payload.

### REST — `POST {basePath}/chat/message/unread`

```json
{ "talkId": "uuid", "messageId": "uuid" }
```

```json
{ "success": true, "message": "Message marked as unread", "data": { "messageId": "uuid", "unreadCount": 3 } }
```

Use the REST form for a chat-list long-press (no `/talk` socket open); use the socket
form from inside a thread.

### `messageMarkedUnread` on the `/contact` namespace

`{ talkId, messageId, unreadCount }`, emitted to the caller's **own** `contact:{chatuserId}`
room only — it is a multi-device sync signal, not a broadcast. A `talkUpdated` for the
same talk follows it, carrying the refreshed `unreadCount` for the talk list.

Other participants receive nothing.

---

## Errors

All arrive as `{ success: false, error }` on the socket ack, or a 400 over REST.

| Message | Cause |
|---|---|
| `Not a participant of this talk` | caller isn't a member |
| `Message not found` | unknown `messageId` |
| `Message does not belong to this talk` | `messageId` is from a different talk |
| `Cannot mark a deleted message as unread` | target is a tombstone — deleted messages are excluded from every unread count, so this would silently do nothing |

**Idempotent.** Marking an already-unread message unread succeeds and returns the
current count. It never moves `lastReadAt` forward, so it can't accidentally mark
newer messages read — safe to retry.

---

## Behaviour worth knowing

- **Marking your own message unread counts it.** Unread counts don't exclude your own
  messages (normally irrelevant, since sending marks the talk read). If your UI offers
  the action on outgoing bubbles, the badge will include that message. Hide the action
  on your own messages if that reads wrong.
- **Read ticks on the other side regress.** `isReadByAll` is derived from
  `MIN(lastReadAt)` across participants, so rewinding lowers that minimum. The other
  participant isn't notified live, but on their next fresh load a message you had read
  can show as unread-by-all again. Ask the backend for a non-rewinding high-water
  column if this matters for your product.
- **`lastReadAt` is not returned** and shouldn't be relied on from any endpoint — the
  column is timezone-naive and serializes shifted by the server's UTC offset. Use
  `unreadCount` and the per-message `unread` flag.

## Client checklist

1. Stop calling `markRead` on talk-open; tie it to the newest message being visible.
2. Add the action to the message long-press menu; call the socket form and pop back to the chat list.
3. On ack, apply `unreadCount` optimistically, and set `unread: 1` locally on the target and everything newer.
4. Handle `messageMarkedUnread` on `/contact` for multi-device sync.
5. Don't offer the action on tombstones (and consider hiding it on your own messages).
