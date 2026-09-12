# Events — web frontend implementation spec

**Audience:** whoever implements the Events feature in the XpertTalk **web**
frontend (including an AI coding agent working in that repo).

**Status:** the backend is **built, deployed to UAT and in use by the Flutter
app**. Nothing here is a proposal — every field, status code and message below is
what the server already returns today. If something in your UI needs a field that
is not in this document, it does not exist; ask for a backend change rather than
guessing.

Backend source of truth: the `xltalkapi` repo — `app/services/event.service.js`,
`app/helpers/eventReminders.js`, `app/routes/chat.routes.js`, and
`docs/EVENTS_BACKEND.md` for internals you do not need. The JSON in §3 was
captured from the running server, and the schedule snippet in §8.2 is verified to
match the backend rule instant-for-instant.

This document is deliberately self-contained: transport, every endpoint, every
field with its exact type, every failure mode, the reminder rule, the push
payloads, and the UI behaviours that depend on them. There is no separate
"backend contract" you need to read.

---

## 1. What the feature is

A user creates an **event** (a title + a moment in time), invites other users as
**participants**, and everyone involved gets **push reminders** in the days and
hours before it starts. The creator can edit, cancel, and add/remove
participants. There is no RSVP, no recurrence, no attachments, no event chat.

Everything about reminders happens **server-side**. The web app never schedules,
stores or sends a reminder; it only *describes* them (see §8).

---

## 2. Transport

### 2.1 Base URL and paths

Use the same base the existing chat calls use (`/chat/talk/list`, `/chat/message/list`, …).
Concretely the mount is `<API_BASE>/chatapp/`, so:

| Method | Path |
|---|---|
| GET | `/chatapp/chat/event/list` |
| GET | `/chatapp/chat/event/detail?id=<uuid>` |
| POST | `/chatapp/chat/event/create` |
| POST | `/chatapp/chat/event/update` |
| POST | `/chatapp/chat/event/cancel` |
| POST | `/chatapp/chat/event/participant/add` |
| POST | `/chatapp/chat/event/participant/remove` |

UAT: `https://xlapi.xpertlabserver.com/chatapp/…`. Live Swagger UI for all of it:
`<API_BASE>/api-docs` (tag **Event**), machine-readable at `/api-docs.json`.

Reads are `GET` with query parameters. Writes are `POST` with a JSON body. There
is **no PATCH and no DELETE** anywhere in this API.

### 2.2 Headers

| Header | Value |
|---|---|
| `x-token` | the session token from `POST /chatapp/auth/login` — **this alone identifies the caller** |
| `Content-Type` | `application/json` |
| `Accept` | `application/json` |

Never put a user id in a request body to say who you are — the server derives the
creator from `x-token` and ignores anything else. There is no `creatorId` input
field on any endpoint.

The Flutter app also sends an `elevel: "0"` header. **The backend ignores it, and
no Events response is encrypted.** Do not send it, do not look for an `elevel`
field in the response, and do not implement any decryption.

### 2.3 Response envelope

Every response is **HTTP 200** with a JSON object (the only exception is a real
server fault, §2.4):

```json
{ "status": 200, "success": true, "message": "Event created", "data": { } }
```

| Field | Meaning |
|---|---|
| `status` | number. `200` on success; otherwise the failure code — read **this**, not the HTTP status |
| `success` | boolean, mirrors `status === 200` |
| `message` | human-readable. On a failure this string is written for the end user — **show it verbatim** |
| `data` | the payload: an event object, an array of them, or `[]` |

### 2.4 Failure handling — the whole table

```js
// inside an async request wrapper
const res = await fetch(url, { headers: { 'x-token': token } });
const body = await res.json();          // always parse; HTTP is 200 for failures too
if (body.status !== 200) { /* handle per the table below, using body.message */ }
```

| `status` | When | What the UI does |
|---|---|---|
| `400` | request body failed validation (Joi). `message` names the field | show `message`, keep the form open with the user's input |
| `422` | business rejection: not the creator, event time in the past, unknown participant, empty participant list, cancelled event edited | show `message` verbatim, keep the form open so they can fix it |
| `409` | `ifUpdatedAt` is stale — someone else changed the event first | **do not** retry the write. Re-fetch `/chat/event/detail`, replace your local copy, tell the user "This event was changed elsewhere — reloaded", let them re-apply their edit |
| `404` | event does not exist, or the caller may not see it | remove it from the list and go back |
| `401` | the session is invalid/expired | your existing global logout flow |
| `403` | the IP or platform gate rejected the caller (account not allowed on web) — **not** a per-event permission | your existing access-denied flow. This never means "you are not the creator" |
| HTTP `5xx` | real server fault | "Couldn't reach the server", offer **Retry**. Safe to retry: see §4 |

Note the asymmetry, it is deliberate: **a 4xx-in-envelope is permanent** (retrying
changes nothing, the user must change something), while an **HTTP 5xx or a
transport error is retryable**. Never auto-retry a 4xx.

A per-event authorization failure is `422`, never `401`/`403`. If you ever see
`401`/`403` on an event endpoint it is about the *session or the account*, not
the event.

---

## 3. The event object

Returned by every endpoint (as `data`, or inside the `data` array on list). This
is the complete, exact shape — captured from the running server:

```json
{
  "id": "9f1c7d2e-3a44-4b7c-8d21-55aa0b9c7e31",
  "clientEventId": "evt_1789035180016_1",
  "creatorId": "7",
  "creatorChatuserId": "7",
  "creatorType": "ADMIN",
  "creatorName": "Asha Verma",
  "creatorProfileUrl": "https://…/media/admin/profile/7.png",
  "title": "Team Meeting",
  "eventTime": "2026-09-20T12:30:00.000Z",
  "timezone": "+05:30",
  "timezoneName": "IST",
  "remindersPerDay": 2,
  "reminderSlots": ["09:00", "18:00"],
  "status": "scheduled",
  "isCreator": true,
  "createdAt": "2026-09-11T09:12:44.123Z",
  "updatedAt": "2026-09-11T09:12:44.123Z",
  "cancelledAt": "",
  "completedAt": "",
  "participants": [
    {
      "id": "5501aaaa-bbbb-4ccc-8ddd-eeeeffff0001",
      "chatuserId": "41",
      "externalId": "900",
      "externalType": "EMPLOYEE",
      "userType": "EMPLOYEE",
      "firstName": "User",
      "lastName": "A",
      "profileUrl": "",
      "status": "invited"
    }
  ]
}
```

### 3.1 Field reference

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | the event id. Pass it as `id` on every write. Treat as opaque |
| `clientEventId` | string | the key **you** generated (§4). Echoed back so you can match a response to the row you optimistically rendered |
| `creatorId` / `creatorChatuserId` | string | same value, the creator's `chatuserId`. **A numeric id arrives as a string** — compare with `Number()` or `String()` consistently |
| `creatorType` | `"ADMIN"` \| `"EMPLOYEE"` | informational (avatar route, label) |
| `creatorName` | string | already `"First Last"`, may be `""` |
| `creatorProfileUrl` | string | absolute URL, or `""` when the user has no picture |
| `title` | string | ≤ 120 chars |
| `eventTime` | string | **ISO-8601 UTC with `Z`**. Render in the viewer's local zone |
| `timezone` | string | the creator's UTC offset at creation, e.g. `"+05:30"`. **Not** an IANA zone — never pass it to `Intl.DateTimeFormat({timeZone})`. It is the zone `reminderSlots` are expressed in |
| `timezoneName` | string | e.g. `"IST"`. Display-only, may be `""` |
| `remindersPerDay` | number | 1, 2 or 3 |
| `reminderSlots` | string[] | the wall-clock times the daily reminders fire at, in the event's `timezone`. Exactly `remindersPerDay` entries, ascending, `"HH:mm"`. **Server-owned — render these, never hardcode 09:00/14:00/18:00** (§8) |
| `status` | `"scheduled"` \| `"cancelled"` \| `"completed"` | `completed` is set automatically once the start time passes |
| `isCreator` | boolean | computed for **the caller of this request**. Gates Edit / Cancel / Add / Remove in the UI (§7) |
| `createdAt` | string | ISO UTC |
| `updatedAt` | string | ISO UTC. **Load-bearing** — store it and send it back as `ifUpdatedAt` on your next update (§5) |
| `cancelledAt` | string | ISO UTC, or `""` |
| `completedAt` | string | ISO UTC, or `""` |
| `participants` | array | the **full current list**, excluding removed people. Replace your local set with it wholesale |

Participant fields: `id` (UUID of the membership row, not the user),
`chatuserId` (string — **this is the user identity**), `externalType` /
`userType` (identical, `"ADMIN"` \| `"EMPLOYEE"`), `firstName`, `lastName`,
`profileUrl` (absolute or `""`), `status` (always `"invited"` today; the other
values `accepted` / `declined` / `removed` exist in the schema but nothing sets
them — do not build an RSVP UI).

### 3.2 Two gotchas that will bite you

1. **`null` never appears — it is `""`.** The response layer replaces every null
   with an empty string. So test `if (event.cancelledAt)`, not
   `if (event.cancelledAt !== null)`, and expect `""` for `profileUrl`,
   `timezoneName`, `completedAt`, etc. Empty strings also mean
   `new Date(event.cancelledAt)` yields an *Invalid Date* — guard before parsing.
2. **Ids are strings, including numeric ones.** `chatuserId` comes back as
   `"41"`. If you dedupe or compare participants, normalise first
   (`String(x)` or `Number(x)`), or you will get duplicate chips for one person.

---

## 4. `clientEventId` — mint it once, reuse it on retry

Every write carries `clientEventId`. Generate it **once when the create form
opens** (not per request), keep it for the lifetime of that form, and send the
same value on every attempt from that form.

```js
const clientEventId = `evt_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
```

Why it matters: if a create succeeds but the response is lost (timeout, tab
closed mid-flight, flaky network), the user presses Save again. The server
recognises the repeated key and returns **the event it already created**, with
`status: 200` — it does not create a second one and does not error. So:

* **a create is always safe to retry** with the same `clientEventId`;
* changing the id on a retry creates a duplicate event — so never regenerate it
  inside a retry loop;
* it is per *form instance*: after a successful save, the next new-event form
  mints a fresh one.

Send `clientEventId` on the other writes too (the server accepts and ignores it
there); it makes your request logs correlatable. The **`id`** is what identifies
the event on update/cancel/participant calls.

---

## 5. `ifUpdatedAt` — optimistic concurrency on update

`POST /chat/event/update` accepts `ifUpdatedAt`: the `updatedAt` value your copy
of the event was loaded with.

* Send the `updatedAt` string you last received for that event, verbatim.
* If it still matches the server's, the update applies.
* If it does not, the server answers `409` with
  *"This event was changed on another device. Refreshing."* — someone edited it
  first. **The server wins.** Re-fetch detail, overwrite your local copy, surface
  the message, and let the user redo their edit on top of the fresh data.
* Omitting it (or sending `""`/`null`) means "no precondition" — last write wins.
  Only do that deliberately; for a normal edit form, always send it.

`updatedAt` changes on every successful write, so always refresh your stored copy
from the response.

---

## 6. Endpoints

### 6.1 `GET /chat/event/list`

No query parameters. Returns **every event the caller can see** — the ones they
created *and* the ones they participate in, together, in one array, sorted by
`eventTime` ascending.

```json
{ "status": 200, "success": true, "message": "Successfully fetched events",
  "data": [ { …event… }, { …event… } ] }
```

* Includes `cancelled` and `completed` events, and past ones (bounded to 90 days
  of history plus everything in the future). **Group them in the UI yourself**:
  *Upcoming* = `status === "scheduled"` and `eventTime` in the future;
  *Past & cancelled* = everything else.
* **There is no pagination and none is coming.** Do not send `limit`/`offset`/
  cursors; they are ignored.
* An empty result is `data: []` with `status: 200` — render an empty state, not
  an error.
* Call it: on mounting the events screen, on pull-to-refresh / a Refresh button,
  after any successful write, and after a push arrives (§9).

### 6.2 `GET /chat/event/detail?id=<uuid>`

```json
{ "status": 200, "success": true, "message": "Successfully fetched event",
  "data": { …event… } }
```

The authoritative read for one event. Call it when opening the details view and
**after every notification tap** — a reminder can be hours old and the event may
have been moved or cancelled since. `404` if it does not exist or the caller
cannot see it.

### 6.3 `POST /chat/event/create`

```json
{
  "clientEventId": "evt_1789035180016_1",
  "title": "Team Meeting",
  "eventTime": "2026-09-20T12:30:00.000Z",
  "timezone": "+05:30",
  "timezoneName": "IST",
  "remindersPerDay": 2,
  "participants": [
    { "chatuserId": "41", "userType": "EMPLOYEE" },
    { "chatuserId": "7",  "userType": "ADMIN" }
  ]
}
```

| Field | Required | Rules |
|---|---|---|
| `clientEventId` | yes | ≤ 64 chars, §4 |
| `title` | yes | 1–120 chars after trimming |
| `eventTime` | yes | ISO-8601 **UTC** instant, must be in the future |
| `timezone` | no (send it) | the browser's current UTC offset, `"+05:30"` format — §10 |
| `timezoneName` | no | short label, e.g. `"IST"` |
| `remindersPerDay` | no (default 1) | 1–3. Out-of-range values are clamped, not rejected |
| `participants` | yes | ≥ 1 entry. `chatuserId` is what counts; `userType` is accepted and ignored |

Response: `200` + the created event.

Server behaviour you can rely on: duplicates in `participants` collapse to one
row; **the creator is dropped from the list automatically** (they own the event —
you may include or exclude them, either works, but they will never appear in
`participants[]` and never get a push about their own event); reminders are
generated immediately; every participant gets an `event_created` push.

Rejections:

| `status` | `message` (shown verbatim) |
|---|---|
| 422 | `This event's time has already passed. Change the time and try again.` |
| 422 | `These participants could not be found: 999. Remove them and try again.` |
| 422 | `Add at least one participant to this event.` / `Add at least one other participant to this event.` (only the creator was selected) |
| 422 | `Event title is required.` / `Event title must be 120 characters or fewer.` |
| 400 | Joi message, e.g. `"title" is not allowed to be empty` |

### 6.4 `POST /chat/event/update`

```json
{
  "id": "9f1c7d2e-3a44-4b7c-8d21-55aa0b9c7e31",
  "clientEventId": "evt_1789035180016_1",
  "title": "Team Meeting",
  "eventTime": "2026-09-20T14:30:00.000Z",
  "timezone": "+05:30",
  "timezoneName": "IST",
  "remindersPerDay": 3,
  "participants": [ { "chatuserId": "41", "userType": "EMPLOYEE" } ],
  "ifUpdatedAt": "2026-09-11T09:12:44.123Z"
}
```

**This is a full replacement, not a patch.** Always send `title`, `eventTime` and
the complete `participants` list — omitting participants does not "leave them
alone", it is a validation error (the list is required and must be non-empty).
Pre-fill your edit form from the event and submit everything.

Response: `200` + the updated event. Side effects: all pending reminders are
cancelled and regenerated from *now*; removed participants lose their pending
reminders; everyone still on it gets `event_updated`, anyone newly added gets
`event_created`.

Rejections: `422 Only the creator can change this event.` ·
`422 This event has been cancelled and can no longer be changed.` ·
`409` stale `ifUpdatedAt` (§5) · `404` unknown id · plus every create-time
validation rejection.

### 6.5 `POST /chat/event/cancel`

```json
{ "id": "9f1c7d2e-…", "clientEventId": "evt_1789035180016_1" }
```

Response: `200` + the event with `status: "cancelled"` and `cancelledAt` set.

* **Cancelling twice is fine** — the second call returns `200` with the same
  cancelled event. Never treat a repeat as an error.
* The event is **soft**-cancelled: it keeps appearing in
  `/chat/event/list` forever, under your *Past & cancelled* group. Do not remove
  it from the UI, and do not expect a delete endpoint — there isn't one.
* All pending reminders stop; participants get `event_cancelled`.
* Creator only → `422 Only the creator can change this event.`

### 6.6 `POST /chat/event/participant/add`

```json
{ "id": "9f1c7d2e-…", "participants": [ { "chatuserId": "99", "userType": "ADMIN" } ] }
```

Response: `200` + the event with its **full** participant list — replace your
local set with it.

Adding someone already on the event is a no-op. New participants receive only the
reminders still in the future, never one that already passed, and get an
`event_created` push. Creator only. An event that is cancelled or completed
answers `422 Participants can only be added to a scheduled event.`

### 6.7 `POST /chat/event/participant/remove`

```json
{ "id": "9f1c7d2e-…", "chatuserId": "99", "userType": "ADMIN" }
```

One participant per call. Response: `200` + the event with the full remaining
list. Removing someone who is not on the event still returns `200` (idempotent).
Their pending reminders are cancelled — they receive nothing further. Creator
only.

### 6.8 Where the participant picker gets its users

`GET /chatapp/chat/talk/users` — already used elsewhere in the app. Returns every
active user except the caller:

```json
{ "status": 200, "success": true, "message": "Successfully fetched users list",
  "data": [ { "chatuserId": 41, "firstName": "User", "lastName": "A",
              "profileUrl": "https://…", "externalId": 900, "externalType": "EMPLOYEE" } ] }
```

Note `chatuserId` is a **number** here and a **string** on the event object —
normalise when you match selected users against `event.participants`.

---

## 7. `isCreator` and what the UI may offer

| Control | Show when |
|---|---|
| Edit | `isCreator && status === "scheduled"` |
| Cancel | `isCreator && status === "scheduled"` |
| Add participant | `isCreator && status === "scheduled"` |
| Remove participant | `isCreator && status === "scheduled"` |
| Everything else (view) | always |

`isCreator` is computed per request for the calling user, so the same event shows
`true` to its creator and `false` to a participant. Hiding the controls is a
convenience only — the server re-authorizes every write and answers `422`, so
never rely on the flag for security, and do handle that `422`.

---

## 8. Reminders — what to tell the user

The server sends reminders; your only job is to **describe them correctly**. Two
blocks:

**Daily block** — applies only when the event is **2 or more calendar days**
away. On every day from today up to and including the day *before* the event day,
one reminder at each time in `reminderSlots`.

**Event-day block** — always: `T-5h`, `T-4h`, `T-3h`, `T-2h`, `T-1h`, plus a
final one at `T-15min`. Six at most, and the event day gets **no** daily
reminders.

Only instants **strictly in the future** at the moment of scheduling are created.
There is no catch-up: an event created at 15:30 for 18:00 gets 16:00, 17:00 and
17:45 — it is never told "starts in 5 hours".

### 8.1 Render `reminderSlots`, never hardcoded times

`reminderSlots` is `["09:00","18:00"]`-style, in the event's own `timezone`, with
exactly `remindersPerDay` entries. It is **configurable server-side** and may
change without any frontend release, so:

* the create/edit form's helper text must come from the slots — e.g. with
  `remindersPerDay: 2` and `["09:00","18:00"]`, say *"At 9:00 AM and 6:00 PM on
  each day before the event"*;
* the details view's "next reminder" must be computed from them (below);
* never print a literal 09:00 / 14:00 / 18:00 in your source.

On the **create form**, before the event exists, you have no `reminderSlots`
yet. Two honest options: describe it without times (*"2 reminders a day before
the event, plus hourly reminders on the day"*), or take the slots from any
existing event you already loaded. Do not invent times.

### 8.2 Computing the schedule for display

Port of the server rule — use it for "next reminder" and for a preview count.
Slots are wall-clock times in the event's offset; everything returned is UTC.

```js
/** @returns {{type:'daily'|'hourly'|'final', at:Date}[]} future reminders, ascending */
function reminderSchedule(event, now = new Date()) {
  if (event.status !== 'scheduled') return [];
  const eventMs = new Date(event.eventTime).getTime();
  const nowMs = now.getTime();
  if (!(eventMs > nowMs)) return [];

  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  // "+05:30" → 330 minutes. Anything unparseable means UTC.
  const m = /^([+-])(\d{1,2}):?(\d{2})?$/.exec((event.timezone || '').trim());
  const offset = m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + (+m[3] || 0)) : 0;
  const dayStart = ms => Math.floor((ms + offset * MIN) / DAY) * DAY - offset * MIN;

  const slots = (event.reminderSlots || []).map(s => {
    const [h, min] = String(s).split(':').map(Number);
    return h * 60 + (min || 0);
  });

  const rows = [];
  const days = Math.round((dayStart(eventMs) - dayStart(nowMs)) / DAY);
  if (days >= 2) {
    for (let d = 0; d < days; d++) {            // stops before the event day
      for (const minutes of slots) {
        const at = dayStart(nowMs) + d * DAY + minutes * MIN;
        if (at > nowMs) rows.push({ type: 'daily', at: new Date(at) });
      }
    }
  }
  for (const h of [5, 4, 3, 2, 1]) {
    const at = eventMs - h * HOUR;
    if (at > nowMs) rows.push({ type: 'hourly', at: new Date(at) });
  }
  const finalAt = eventMs - 15 * MIN;
  if (finalAt > nowMs) rows.push({ type: 'final', at: new Date(finalAt) });

  return rows.sort((a, b) => a.at - b.at);
}
```

Worked check (event 10 Sep 18:00 `+05:30`, slots `09:00`/`14:00`/`18:00`,
`remindersPerDay: 3`): from 7 Sep 06:00 → 15 reminders; from 9 Sep 06:00 → 6
(no daily, it is one day away); from 10 Sep 15:30 → 3 (16:00, 17:00, 17:45);
from 10 Sep 17:50 → 0.

A countdown label ("Starts in 3 hours") should be a timer refreshed while the
screen is open — it is a label only, it cannot notify anybody.

---

## 9. Push notifications (web)

Events reuse the existing FCM setup. If the web app already registers a token via
`POST /chatapp/auth/fcm/save` with `{ "token": "…", "platform": "WEB" }`, event
pushes arrive on it with no extra work — there is no new channel or capability.

Payload (`data` values are **always strings**):

```json
{
  "notification": { "title": "Team Meeting", "body": "Team Meeting starts in 3 hours." },
  "data": {
    "type": "event_reminder",
    "event_id": "9f1c7d2e-3a44-4b7c-8d21-55aa0b9c7e31",
    "eventId": "9f1c7d2e-3a44-4b7c-8d21-55aa0b9c7e31",
    "receiverType": "EMPLOYEE",
    "title": "Team Meeting",
    "body": "Team Meeting starts in 3 hours."
  }
}
```

| `data.type` | When | Sent to |
|---|---|---|
| `event_created` | an event is created, or someone is added to one | participants (never the creator) |
| `event_updated` | an event is edited | current participants |
| `event_cancelled` | an event is cancelled | all participants |
| `event_reminder` | each scheduled reminder | each participant |

Handling rules:

* **Route on `data.type`.** Treat any `event_*` value as an event for forward
  compatibility.
* `data.event_id` (or `data.eventId`, identical) is the only id you get — open
  the details view with it and **re-fetch `/chat/event/detail`**. Never trust the
  banner text: a reminder can be stale, and the event may since have moved or
  been cancelled.
* There is deliberately **no `talkId`** — an event is not a conversation, so do
  not run it through chat-notification suppression (is-this-chat-open,
  muted-chat) logic.
* `data.receiverType` is the recipient's own role, uppercase. The mobile build
  filters on it; on web you can ignore it, but do not *require* a `talkId` or a
  chat-shaped payload or you will drop these.
* `notification.title`/`body` are pre-rendered by the server and duplicated into
  `data`. Prefer the `notification` fields, fall back to `data`. Do not
  re-render the text.
* On receiving any event push while the events screen is open, refresh the list.

Reminder bodies, for reference: `"<title> is in 3 days."` /
`"<title> is tomorrow."` (daily), `"<title> starts in 3 hours."` (hourly),
`"<title> starts in 15 minutes."` (final).

---

## 10. Timezone rules

* **UTC is the wire format.** Send `eventTime` as an ISO instant with `Z`:
  `new Date(localPick).toISOString()`. Never send a formatted local string.
* Render `eventTime` in the **viewer's** local zone.
* `timezone` is the *creator's* UTC offset as `"+05:30"`, informational plus it
  fixes the zone of `reminderSlots`. Compute yours as:

```js
function deviceUtcOffset(d = new Date()) {
  const total = -d.getTimezoneOffset();                    // minutes, east positive
  const sign = total < 0 ? '-' : '+';
  const abs = Math.abs(total);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}
```

* `timezoneName`: a short label is enough, e.g.
  `Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })` parts, or `""`.
* **Never** pass `timezone` to `Intl.DateTimeFormat({ timeZone })` — `"+05:30"`
  is not an IANA zone name and will throw.
* A user changing their machine's timezone needs nothing: the stored instant is
  absolute and simply renders in the new zone.

---

## 11. What NOT to build

* **No sockets for events.** Events emit no Socket.IO events at all. Refresh by
  polling: on screen open, on user refresh, after a write, after a push. Do not
  add an event room or listen on `/talk` or `/contact` for them.
* **No pagination** on the list (§6.1).
* **No RSVP** accept/decline UI — the `status` field is parsed but nothing sets
  it (§3.1).
* **No client-side reminder scheduling, and no local notifications.** If the
  server didn't send it, it doesn't happen.
* **No delete** — cancel is the terminal state, and cancelled events stay in the
  list.
* **No recurrence, attachments, event chat, calendar export or per-event mute** —
  none of it exists server-side.
* **No `elevel` encryption** for these endpoints (§2.2).

---

## 12. Suggested UI surfaces

Nothing here is mandated by the API; it is the shape the mobile app uses, for
consistency.

1. **Events list** — two groups, *Upcoming* (scheduled + future, soonest first)
   and *Past & cancelled*. Each row: title, event time in local zone, participant
   count/avatars, and a status chip for `cancelled` / `completed`. Creator rows
   may show an "owner" affordance.
2. **Create / edit form** — title (≤120, counter), date+time picker (future
   only), reminders-per-day selector (1/2/3, with the helper text from §8.1),
   participant multi-select from §6.8 with chips. Submit → `create` or `update`.
3. **Details view** — title, full local date/time, creator, participant list with
   avatars, "next reminder" from §8.2, countdown label, and the creator actions
   from §7. Opened from a list row **and** from a push tap (always re-fetching
   detail).

Client-side validation to mirror the server (fail fast, but still handle the
server's `422`): title non-empty and ≤120 after trim; `eventTime` strictly in the
future at submit time; at least one participant besides the caller;
`remindersPerDay` ∈ {1,2,3}.

---

## 13. curl reference

```bash
TOKEN='<x-token from /chatapp/auth/login>'
BASE='https://xlapi.xpertlabserver.com/chatapp'

# list
curl -s "$BASE/chat/event/list" -H "x-token: $TOKEN"

# detail
curl -s "$BASE/chat/event/detail?id=9f1c7d2e-3a44-4b7c-8d21-55aa0b9c7e31" -H "x-token: $TOKEN"

# create
curl -s -X POST "$BASE/chat/event/create" -H "x-token: $TOKEN" -H 'Content-Type: application/json' -d '{
  "clientEventId":"evt_1789035180016_1",
  "title":"Team Meeting",
  "eventTime":"2026-09-20T12:30:00.000Z",
  "timezone":"+05:30","timezoneName":"IST",
  "remindersPerDay":2,
  "participants":[{"chatuserId":"41","userType":"EMPLOYEE"}]
}'

# update (full replacement + precondition)
curl -s -X POST "$BASE/chat/event/update" -H "x-token: $TOKEN" -H 'Content-Type: application/json' -d '{
  "id":"9f1c7d2e-3a44-4b7c-8d21-55aa0b9c7e31",
  "title":"Team Meeting","eventTime":"2026-09-20T14:30:00.000Z",
  "timezone":"+05:30","remindersPerDay":3,
  "participants":[{"chatuserId":"41"}],
  "ifUpdatedAt":"2026-09-11T09:12:44.123Z"
}'

# cancel / add / remove
curl -s -X POST "$BASE/chat/event/cancel" -H "x-token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"id":"9f1c7d2e-3a44-4b7c-8d21-55aa0b9c7e31"}'
curl -s -X POST "$BASE/chat/event/participant/add" -H "x-token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"id":"9f1c7d2e-3a44-4b7c-8d21-55aa0b9c7e31","participants":[{"chatuserId":"99"}]}'
curl -s -X POST "$BASE/chat/event/participant/remove" -H "x-token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"id":"9f1c7d2e-3a44-4b7c-8d21-55aa0b9c7e31","chatuserId":"99"}'
```

---

## 14. Acceptance checklist

**Transport**
- [ ] `body.status` is read for success/failure, never the HTTP status (which is 200 even for rejections)
- [ ] a `422`/`400` shows `message` verbatim and is **not** auto-retried
- [ ] an HTTP `5xx`/network error offers Retry, and retrying a create with the same `clientEventId` yields **one** event
- [ ] a `409` on update re-fetches detail and replaces the local copy instead of overwriting the server
- [ ] a `403` runs the access-denied flow and is never interpreted as "not the creator"
- [ ] `null` is never expected anywhere — empty strings are handled (`cancelledAt: ""` does not render as *Invalid Date*)

**Create / edit**
- [ ] `clientEventId` is minted once per form and reused across retries
- [ ] `eventTime` is sent as an ISO UTC instant ending in `Z`
- [ ] `timezone` is sent as `"+05:30"`-style offset, and never fed to `Intl` as a zone name
- [ ] update sends title + time + the **full** participant list + `ifUpdatedAt`
- [ ] selecting the same person twice creates one chip and one participant
- [ ] a past event time is rejected by the server and the form stays open with the message

**List / detail**
- [ ] no pagination parameters are sent
- [ ] cancelled and completed events still appear, grouped as past
- [ ] `data: []` renders an empty state, not an error
- [ ] the list is refreshed after every successful write and after any event push
- [ ] opening details always re-fetches `/chat/event/detail`

**Permissions**
- [ ] Edit / Cancel / Add / Remove appear only when `isCreator` is true and the event is `scheduled`
- [ ] a participant viewing the same event sees none of those controls
- [ ] a `422` from a write is still handled even though the control was hidden

**Reminders**
- [ ] every reminder time shown in the UI comes from `reminderSlots`; no hardcoded 09:00/14:00/18:00 anywhere in the source
- [ ] the "next reminder" label matches §8.2 (no daily reminder on the event day, none in the past, nothing when the event is under two days away)
- [ ] changing the slot times on the server changes the UI text with no frontend deploy

**Push**
- [ ] a WEB FCM token is registered via `/chatapp/auth/fcm/save`
- [ ] `data.type` routes the push, `data.event_id` opens details, and details are re-fetched on tap
- [ ] a push with no `talkId` is not dropped by chat-notification logic
- [ ] tapping a reminder for an event cancelled since shows it as cancelled
