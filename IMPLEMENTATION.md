# XpertTalk v2 — Implementation Guide

> **Purpose**: This file contains ALL context needed to build the remaining UI phases.
> In a new chat, just say: *"Read `v2/IMPLEMENTATION.md`, do Phase X"*

---

## Design Philosophy

**Do NOT copy v1's design.** v1 was built with Metronic Bootstrap and looks dated.
v2 uses a **"Neon Indigo" design system** — dark-first, gradient accents, subtle glow effects, clean and spacious.
Reference v1 ONLY for **functionality and business logic** (API calls, WebSocket handling, data flow).
All UI/UX is designed from scratch using Tailwind + shadcn/ui.

### ⚠️ CRITICAL: Dark Mode is Global — No Exceptions

The app defaults to dark mode. **Every surface in the entire app must be dark.** This includes the sidebar, chat header, chat area, input bar, modals, dropdowns, tooltips, context menus — everything.

**NEVER use hardcoded light colors.** Always use semantic Tailwind classes that automatically adapt:
- Backgrounds: `bg-background`, `bg-card`, `bg-muted`, `bg-popover`, `bg-secondary`, `bg-accent`
- Text: `text-foreground`, `text-muted-foreground`, `text-card-foreground`
- Borders: `border-border` (use `border-border/50` or `/30` for subtlety)
- Sidebar: `bg-sidebar-background`, `text-sidebar-foreground`, `border-sidebar-border`

**Forbidden classes** (will produce white/light surfaces in dark mode):
`bg-white`, `bg-gray-*`, `bg-slate-*`, `bg-zinc-*`, `bg-neutral-*`, `bg-stone-*`, `text-black`, `text-gray-*`, `text-slate-*`, `border-gray-*`, `border-slate-*`

**After every change, visually verify**: open the app → the ENTIRE screen should be dark. If any panel, header, input, or dropdown appears light/white, you have a bug.

---

### Global Design System — "Neon Indigo"

**Aesthetic**: Dark, clean, modern. Think Discord meets Linear meets Telegram desktop. Not gamified, not playful — professional and sleek with subtle indigo accents.

**Color Palette** (all defined as CSS variables in `src/index.css`):
- **Surfaces**: Deep charcoal (`#111318` background, `#181b22` cards, `#1e2028` elevated surfaces)
- **Primary accent**: Indigo gradient (`#6366f1` → `#8b5cf6`), muted indigo in dark mode (`#818cf8`)
- **Text hierarchy**: Primary text `#e4e7f1`, secondary `#c8cde0`, muted `#6b7194`
- **Borders**: Very subtle `#2a2d38` — always use at reduced opacity (`border-border/50`)
- **Danger**: Red `#dc2626` with `text-destructive`, `bg-destructive/10` for hover backgrounds

**Spacing & Sizing Rules**:
- Sidebar width: `w-[clamp(320px,26vw,400px)]`
- Chat header height: `h-[60px]`
- List item padding: `px-3 py-2.5`
- Section padding: `px-4 py-3` or `px-5 py-4`
- Gap between elements: `gap-2` for tight, `gap-3` for standard, `gap-4` for spacious
- Minimum touch targets: `h-8 w-8` for icon buttons, `h-9` for inputs

**Border Radius**:
- Containers/panels: `rounded-xl` (12px)
- Message bubbles: `rounded-2xl` (16px)
- Buttons/inputs: `rounded-lg` (8px) or `rounded-xl` (12px)
- Badges: `rounded-full`
- Context menus/dropdowns: `rounded-xl`

**Typography** (uses Inter via system font stack):
- Section headers: `text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground/60`
- Chat name in list: `text-[13px] font-semibold`
- Preview text: `text-xs text-muted-foreground/70`
- Time stamps: `text-[10.5px] font-medium text-muted-foreground/50`
- Message text: `text-sm` (14px)

**Interactive States** (EVERY interactive element needs these):
- Ghost buttons: `hover:bg-primary/10 hover:text-primary` with `transition-colors`
- List items: `hover:bg-muted/60` with `transition-all duration-150`
- Active list item: `bg-primary/8` + `.chat-active-bar` glowing left indicator
- Destructive actions: `hover:bg-destructive/10 hover:text-destructive`
- Focus rings: `focus-visible:ring-1 focus-visible:ring-primary/30`
- Always add `transition-colors` or `transition-all` on hover-able elements

**Glow & Effect Classes** (defined in `index.css`, use as-is):
- `.glow-badge` — indigo glow on unread count badges
- `.glow-ring` — subtle ring glow
- `.chat-active-bar` — gradient left bar on active chat item
- `.chat-bg` — mesh gradient background for chat area
- `.online-pulse` — pulse animation on online status dots
- `.animate-float` — gentle float for empty state illustrations
- `.animate-shimmer` — loading shimmer effect
- `.bubble-sent` — gradient sent bubble
- `.bubble-recv` — clean surface received bubble

---

### Chat Bubble Design System

The bubble design is defined in `src/index.css`:

**Bubble classes**: `.bubble-sent` (indigo gradient), `.bubble-recv` (dark surface in dark mode, white in light)
**Sender name colors**: `.sender-name-color` with `--sn-color` / `--sn-color-d` CSS vars (deterministic hash)

**Chat area tokens** (CSS custom properties):

| Token | Light | Dark |
|---|---|---|
| `--chat-area-bg` | `#eceef5` | `#15171e` |
| `--chat-time` | `#8b8fad` | `#4a4f72` |
| `--chat-check-read` | `#6366f1` | `#818cf8` |
| `--chat-gradient-from` | `#6366f1` | `#6366f1` |
| `--chat-gradient-to` | `#8b5cf6` | `#8b5cf6` |
| `--chat-glow` | `rgba(99,102,241,0.15)` | `rgba(129,140,248,0.12)` |

**Bubble specs**: `rounded-2xl`, padding `px-3.5 py-[9px]`, max-width `55%`, text `text-sm` (14px).
**Timestamps**: shown OUTSIDE the bubble on hover (not inside). Read receipts next to timestamp.
**Standalone images**: image IS the bubble (no wrapper), time overlay on image.
**Videos**: inside bubble with inner `m-[5px] rounded-xl` container + play button overlay.
**Reply preview**: inside bubble, `border-l-[3px]`, tinted background, 34px media thumbnail.
**Sender names**: deterministic color from hash of senderChatuserId, 8-color palette with light/dark variants.

---

### Component-by-Component Design Specs

These are the EXACT styling patterns to follow for each UI region:

#### Sidebar (`chat-sidebar.tsx`)
```
Container:       flex h-full flex-col bg-background border-r border-border/50
Logo section:    px-5 py-4, gradient icon (8px rounded-lg), bold app name
Search input:    h-9 rounded-xl border-0 bg-muted/70, focus:ring-primary/30
Section headers: text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground/60
Chat list items: rounded-xl px-3 py-2.5, hover:bg-muted/60
Active item:     bg-primary/8 + .chat-active-bar left indicator
User bar:        border-t border-border/50 px-4 py-3, avatar + name + settings button
```

#### Chat Header (`chat-header.tsx`)
```
Container:       h-[60px] bg-background border-b border-border/50 px-4
Avatar + name:   UserAvatar + text-sm font-semibold text-foreground
Online status:   emerald-400 dot with .online-pulse, text-xs text-muted-foreground
```

#### Chat Area (`chat-area.tsx`)
```
Container:       flex h-full flex-col
Message area:    flex-1 with .chat-bg class for mesh gradient background
Input area:      border-t border-border/50 bg-background px-4 py-3
Input field:     rounded-xl bg-muted/50 with placeholder text-muted-foreground/50
```

#### Empty State (`empty-state.tsx`)
```
Container:       flex h-full items-center justify-center .chat-bg
Icon:            gradient box + .animate-float
Text:            text-lg font-semibold text-foreground + text-sm text-muted-foreground/70
```

#### Modals & Dropdowns
```
Dialogs:         rounded-xl border-border/50 bg-popover
Dropdown menus:  rounded-xl border-border/50 p-1.5 shadow-xl
Menu items:      rounded-lg px-2.5 py-2 hover:bg-accent
Context menus:   Same as dropdown menus
```

---

## Project Overview

XpertTalk is a **real-time chat application** rebuilt from Metronic Bootstrap → **Tailwind CSS 4 + shadcn/ui**.
All business logic (stores, hooks, API layer, encryption, WebSocket, IndexedDB) is already copied and compiling.

**Node version required**: 22+ (use `nvm use 22`)
**Build**: `npm run build` (already passes)
**Dev**: `npm run dev`
**Install new deps**: Always use `--legacy-peer-deps` (emoji-mart peer conflict)

---

## What's Already Done

```
v2/src/
├── main.tsx                    # Entry point (placeholder App)
├── index.css                   # Tailwind v4 + shadcn CSS variables
├── App.tsx                     # Placeholder — to be replaced
├── lib/
│   ├── utils.ts                # cn() helper for shadcn
│   ├── api-helper.ts           # Axios GET/POST/PATCH/DELETE with encryption
│   ├── cookie.ts               # Cookie CRUD with xlc-/xlca- prefix
│   ├── encryption.ts           # XOR+Base64 encrypt/decrypt, encoded cookies
│   ├── firebase.ts             # Firebase FCM init + generateToken
│   ├── logger.ts               # Dev-only console logger
│   └── message-formatters.ts   # formatMessage, formatTimeAgo, mention formatting
├── stores/
│   ├── chat-store.ts           # Active chat state, WS_URL, window focus
│   ├── message-cache-store.ts  # LRU message cache (10 chats, 100 msgs)
│   ├── ui-store.ts             # Modal/group creation state
│   └── user-list-store.ts      # User list + receiver data
├── hooks/
│   ├── use-websocket.ts        # WebSocket with heartbeat + auto-reconnect
│   ├── use-draft.ts            # IndexedDB draft auto-save/load
│   ├── use-file-upload.ts      # File validation, upload, drag-and-drop
│   ├── use-media-lightbox.ts   # Image/video lightbox slides
│   ├── use-message-selection.ts# Multi-select messages
│   └── use-is-mobile.ts        # Responsive breakpoint (992px)
├── db/
│   └── indexed-db.ts           # IndexedDB draft persistence with encryption
├── components/
│   └── ui/                     # 20 shadcn components (button, dialog, sheet, etc.)
└── (empty directories for: pages/, routes/, providers/, components/{auth,chat,group,modals,shared})
```

---

## What Needs to Be Built (Phases)

### Phase 3: Auth

**Goal**: Login page, auth context, routing.

**Files to create**:

#### `src/providers/auth-provider.tsx`
Adapt from v1 `Auth.tsx`. Key logic:
- `AuthContext` with: `auth`, `saveAuth`, `currentUser`, `setCurrentUser`, `logout`
- `AuthProvider`: stores auth in state + localStorage (`kt-auth-react-v`)
- `AuthInit`: on mount, if `auth.api_token` exists, call `verify_token` endpoint to get user. If fails, logout. Show loading spinner while checking.
- Replace `LayoutSplashScreen` with a simple `<div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>`
- Replace `WithChildren` with `React.PropsWithChildren`

```typescript
// Auth helpers (inline in provider or separate file):
const AUTH_LOCAL_STORAGE_KEY = 'kt-auth-react-v'
// getAuth(): parse from localStorage
// setAuth(): save to localStorage
// removeAuth(): remove from localStorage
```

#### `src/lib/auth-requests.ts`
```typescript
// API endpoints — use postData/getData from api-helper
const userStage = import.meta.env.VITE_APP_USER || 'employee';

export async function login(username: string, password: string) {
  return postData(`auth/${userStage}/login`, { username, password, platform: 'WEB' }, apiHeader(false, 0));
}

export async function getUserByToken() {
  return postData('verify_token', { api_token: getAuth()?.api_token }, apiHeader(false, 0));
}
```

#### `src/components/auth/login-form.tsx`
- react-hook-form + zod schema: `{ username: z.string().min(1), password: z.string().min(1) }`
- On submit: call `login()`, on success: `setEncodedCookieOneYear("token", data.token)`, set uid, userType, then `location.reload()`
- Use shadcn `Card`, `Input`, `Button`, `Form`
- **DESIGN**: Inputs use `bg-muted/50 border-border/50 rounded-lg h-11 text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-primary/30`. Submit button uses indigo gradient `bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white h-11 rounded-lg font-semibold`. Error messages use `text-destructive text-sm`.
- Show/hide password toggle with lucide `Eye`/`EyeOff` icons
- Show error message from API response

#### `src/pages/auth-page.tsx`
- Centered card with logo + login form
- **DESIGN**: Full-screen `bg-background` (dark). Card uses `bg-card border-border/50 rounded-xl shadow-xl`. Subtle indigo gradient glow behind the card (use pseudo-element or background radial-gradient). Logo at: `/media/logos/xperttalk-logo2.png`. The entire login page must be dark-themed, not white.
- Logo at: `/media/logos/xperttalk-logo2.png`

#### `src/routes/app-routes.tsx`
```tsx
// BrowserRouter wrapping:
// - /auth/* → AuthPage (only if NOT authenticated)
// - /chats → ChatPage (only if authenticated) — wrapped in PrivateRoutes
// - /logout → clear auth + redirect
// - /* → redirect to /chats or /auth
```

#### `src/routes/private-routes.tsx`
- If `auth` exists → render children
- If not → redirect to `/auth`

#### `src/main.tsx`
```tsx
import { AuthProvider, AuthInit } from '@/providers/auth-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import AppRoutes from '@/routes/app-routes'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthInit>
        <TooltipProvider>
          <AppRoutes />
          <Toaster />
        </TooltipProvider>
      </AuthInit>
    </AuthProvider>
  </StrictMode>
)
```

**Verify**: Login with credentials → token stored in cookie + localStorage → redirected to /chats

---

### Phase 4: Chat Sidebar

**Goal**: Left panel with profile, search, chat list.

**Files to create**:

#### `src/components/chat/chat-layout.tsx`
```tsx
// Desktop: flex h-screen — sidebar (w-[clamp(320px,26vw,400px)] shrink-0) + chat area (flex-1)
// Mobile: show sidebar OR chat area based on activeChat.talkId
// Uses useIsMobile() hook
// DESIGN: Root container is "flex h-screen overflow-hidden bg-background"
// The bg-background on root ensures NO white leaks through gaps between panels
// Sidebar has NO explicit border-r — that's handled inside chat-sidebar.tsx
```

#### `src/components/shared/user-avatar.tsx`
- shadcn `Avatar` + `AvatarFallback` (initials) + `AvatarImage`
- Optional green dot for online status (absolute positioned)

#### `src/components/chat/chat-list-item.tsx`
Each item shows:
- User avatar (with online dot for private chats where `isActive`) — use `UserAvatar` component with `size="lg"`
- Name (`text-[13px] font-semibold`, active state: `text-primary`, default: `text-foreground`)
- Last message preview (truncated) — `text-xs text-muted-foreground/70`, use `formatMessage()` + strip HTML
- Time — `text-[10.5px] font-medium text-muted-foreground/50`, use `formatTimeAgo(lastMessageTime)`, show on hover via `.chat-hover-reveal` class
- Unread count badge — shadcn `Badge` with `.glow-badge` class for indigo glow
- Pin indicator — lucide `Pin` icon, `h-3 w-3 rotate-45 text-primary/40`, visible on hover
- Draft indicator — `"Draft:"` prefix in `font-semibold text-emerald-500`
- **DESIGN**: Container `rounded-xl px-3 py-2.5 transition-all duration-150`. Default hover: `hover:bg-muted/60`. Active: `bg-primary/8` + `.chat-active-bar` (glowing indigo bar on left edge). Right-click context menu with `rounded-xl border-border/50 bg-popover shadow-xl` styling.
- Wrap in `React.memo` with custom areEqual for performance

#### `src/components/chat/chat-sidebar.tsx`
Structure (top to bottom):
1. **Header** (`px-5 py-4`): Gradient indigo logo icon (`h-8 w-8 rounded-lg` with `linear-gradient(135deg, #6366f1, #8b5cf6)`) + app name (`text-[15px] font-bold tracking-tight text-foreground`) + new group button (`ghost h-8 w-8 hover:bg-primary/10 hover:text-primary`)
2. **Search** (`px-4 pb-3`): shadcn `Input` with search icon. `h-9 rounded-xl border-0 bg-muted/70 pl-9 text-sm placeholder:text-muted-foreground/40 focus-visible:bg-muted focus-visible:ring-1 focus-visible:ring-primary/30`. X button when in search mode.
3. **Chat sections**: Collapsible sections ("Pinned", "Recent") with `text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground/60` headers. Collapsed state shows avatar stack preview.
4. **Chat list**: `ScrollArea` wrapping `ChatListItem` components
5. **User bar** (`border-t border-border/50 px-4 py-3`): Current user avatar + name + email + settings dropdown button

**DESIGN rules**: The entire sidebar must use `bg-background` (resolves to dark in dark mode). No white backgrounds anywhere. All text uses `text-foreground`, `text-muted-foreground`, or opacity variants. Settings dropdown at bottom opens upward (`side="top"`) with dark mode toggle (already implemented via `next-themes`).

Uses:
- `useUserListStore` for `userList`, `getUserList`, `setReceiverData`
- `useChatStore` for `setActiveChat`, `activeChat.talkId`
- Contact WebSocket: `wss://{WS_URL}contact/{userId}/{userType}/?token={xtoken}`
  - `userId` = `getEncodedCookie('uid')`
  - `userType` = `getEncodedCookie('userType')`
  - `xtoken` = `getEncodedCookie('token')`
  - On message: refresh user list (getUserList) or update specific entry

Pin/unpin: `POST {userStage}/talk/pin` with `{ talkId, isPinned: true/false }`
Chat list sorting: pinned first, then by most recent

#### `src/components/shared/confirm-dialog.tsx`
Reusable shadcn `AlertDialog` wrapper:
```tsx
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  onConfirm: () => void;
}
```

**Verify**: Sidebar loads conversations, search works, can pin/unpin, logout works

---

### Phase 5: Message Area (Core)

**Goal**: Message display, real-time WebSocket, send/receive.

**Files to create**:

#### `src/pages/chat-page.tsx`
Contains `InitChat` logic (adapted from v1 `ChatsMain.tsx`):
- Parse URL params: `?data={encrypted}` → `decryptUrlData()`
- Set activeChat from URL params or receiverData
- Firebase notification setup (FCM token save, foreground message handler via sonner toast)
- Window focus/blur listeners → `useChatStore.setWindowFocused()`
- Renders `<ChatLayout />`

#### `src/components/chat/chat-area.tsx`
The main chat panel. **DESIGN**: Container is `flex h-full flex-col` with NO background class (the message area and header each handle their own). Manages:
- **Talk WebSocket**: `wss://{WS_URL}talkapp/talk/{talkId}/?token={xtoken}`
- **Message handlers** (from WebSocket):
  - `action: "edit"` → `dispatchMessage({ type: 'EDIT_MESSAGE', payload: { messageId, messageText } })`
  - `action: "delete"` → `dispatchMessage({ type: 'DELETE_MESSAGE', payload: messageId })`
  - `type: "readStatus"` → `dispatchMessage({ type: 'UPDATE_READ_STATUS', payload: { messageId, isReadByAll } })`
  - New message → `dispatchMessage({ type: 'ADD_MESSAGE', payload: newMessage })`
- **Send message via WebSocket**: `wsSend({ talkId, message: formattedText, replyToMessageId? })`
- **Edit**: `wsSend({ action: 'edit', talkId, messageId, messageText })`
- **Delete**: `wsSend({ action: 'delete', messageId })`
- **Mark as read**: `postData('{userStage}/talk/message/read', { lastMessageTime, talkId }, apiHeader(false, 0))`
- Calls `useMessageCacheStore.switchChat(talkId)` when talkId changes

#### `src/components/chat/chat-header.tsx`
- **DESIGN**: `h-[60px] bg-background border-b border-border/50 px-4`. All text uses `text-foreground` and `text-muted-foreground` — NEVER hardcoded grays.
- Avatar + name + online status (for PRIVATE) or member count (for GROUP)
- Online status: emerald dot with `.online-pulse` animation + "Online"/"Offline" text
- Back button on mobile (clears activeChat)
- `DropdownMenu` with: pin/unpin, view profile/group settings
- Selection mode bar: selected count + forward/delete/cancel buttons

#### `src/components/chat/message-list.tsx`
**DESIGN**: The message list container uses `.chat-bg` class for the subtle indigo mesh gradient background. Date separators: centered text with subtle line, use `text-[11px] font-medium text-muted-foreground/60 bg-background/80 backdrop-blur-sm rounded-full px-3 py-1` floating pill style.

Uses `react-virtuoso` `Virtuoso` component:
```tsx
<Virtuoso
  data={formattedMessages}
  firstItemIndex={firstItemIndex}
  initialTopMostItemIndex={formattedMessages.length - 1}
  startReached={() => getMessagesList(talkId, firstMsgId, 'older', 50)}
  endReached={() => getMessagesList(talkId, lastMsgId, 'newer', 50)}
  itemContent={(index, item) =>
    item.type === 'status'
      ? <DateSeparator text={item.text} />
      : <MessageBubble message={item} ... />
  }
  followOutput="smooth"
  atBottomStateChange={setAtBottom}
/>
```
- Date separators: centered text with line (from `formattedMessages` type === 'status')
- Unread indicator: "Unread messages" separator before first unread
- `ScrollToBottom` floating button

#### `src/components/chat/message-bubble.tsx`
**Already built** — Glass morphism chat bubbles (see Design Philosophy section for specs).
Key features:
- **Sent**: `gl-sent sh-sent` glass class, `flex-row-reverse` layout, white/92% text
- **Received**: `gl-recv sh-recv` glass class, avatar (32px) + sender name with dynamic color
- **Timestamps**: OUTSIDE bubble, hover-reveal with `opacity` transition, read receipts inline
- **Reply preview**: `border-l-[3px]`, glass tint (`bg-white/[0.08]` for sent, `bg-black/[0.03]` for received), 34px media thumbnail
- **Standalone images**: image IS the bubble, `TimeOverlay` absolute-positioned on image
- **Videos**: inside glass bubble, inner `rounded-xl` container with play button + duration overlay
- **Context menu**: hover `EllipsisVertical` button, absolute-positioned outside bubble
- **Selection mode**: checkbox replaces timestamp area
- **Forwarded**: italic label with arrow icon
- **Edited**: "edited" label next to timestamp

Reference: `xperttalk-bubbles-v5.html` for the design spec. Only reference v1 `MessageBubble.tsx` for business logic (forwarding, reply data structure, media handling).

#### `src/components/chat/empty-state.tsx`
Simple "Select a conversation to start chatting" placeholder with an illustration.

**Verify**: Select chat → messages load → send/receive works in real-time

---

### Phase 6: Message Input + Features

**Files to create**:

#### `src/components/chat/message-input.tsx`
- shadcn `Textarea` (auto-grows, max 5 rows, then scroll)
- **DESIGN**: Container is `border-t border-border/50 bg-background px-4 py-3`. Inner input wrapper is `rounded-xl bg-muted/50` with `focus-within:ring-1 focus-within:ring-primary/30 transition-all`. Text color `text-foreground`, placeholder `text-muted-foreground/50`.
- **Send button**: `h-8 w-8 rounded-lg` with indigo gradient background (`bg-gradient-to-br from-[--chat-gradient-from] to-[--chat-gradient-to]`) and white icon, only visible when input has content. Disabled state: `opacity-40`.
- **Icon buttons** (emoji, attach): `h-8 w-8 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors`
- **Send**: Enter key (Shift+Enter for newline) or send button
- **Emoji**: lucide `Smile` icon → opens `emoji-picker-popover.tsx`
- **File attach**: lucide `Paperclip` icon → opens file picker
- **Reply bar**: shows quoted message above input when replying (with X to cancel)
- **Edit bar**: shows "Editing" indicator with message preview (with X to cancel)
- Uses `useDraft` hook for auto-save
- Uses `useFileUpload` hook for file management
- `@mention` detection: when typing `@` in group chats, show autocomplete
- Format mentions before sending: `formatMessageWithMentions(text, members)`
- On send: `wsSend({ talkId, message, replyToMessageId? })` then `clearDraft()`

#### `src/components/chat/emoji-picker-popover.tsx`
```tsx
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
// Wrap in shadcn Popover
```

#### `src/components/chat/file-preview.tsx`
- Horizontal strip of selected files (from `useFileUpload.selectedFiles`)
- Image files: show thumbnail
- Other files: show file icon + name
- X button to remove each file

#### `src/components/chat/drag-overlay.tsx`
- Full-screen overlay when dragging files over the chat area
- "Drop files here" text

#### `src/components/chat/mention-list.tsx`
- Dropdown below cursor when typing `@`
- Filters group members by typed text
- Click to insert mention

#### `src/components/chat/scroll-to-bottom.tsx`
- Floating button (bottom-right of message list)
- Shows when not at bottom
- Badge with unread count

**Verify**: Send text, emoji, files, reply, edit, delete, @mention, drafts auto-save/restore

---

### Phase 7: Group Features

**Files to create**:

#### `src/components/group/create-group-dialog.tsx`
- shadcn `Dialog` with react-hook-form. **DESIGN**: Dialog content `rounded-xl border-border/50 bg-popover`. Inputs use `bg-muted/50 border-0 rounded-lg focus-visible:ring-1 focus-visible:ring-primary/30`. Primary action button uses indigo gradient. Member checkboxes use `accent-primary`.
- Group name input + avatar upload
- Member search (calls `{userStage}/talk/search`)
- Multi-select member list with checkboxes
- Create: `POST {userStage}/talk/start/group` with `{ talkName, members: [...memberIds], talkProfile? }`

#### `src/components/group/group-management-sheet.tsx`
- shadcn `Sheet` (slides from right). **DESIGN**: Sheet content `bg-background border-l border-border/50`. Tab triggers use `bg-muted/50` inactive, `bg-primary text-primary-foreground` active.
- Two tabs: Profile + Members
- **Profile tab**: edit group name, edit group avatar (admin only)
  - Update: `POST {userStage}/talk/update/group` with `{ talkId, talkName?, talkProfile? }`
- **Members tab**: member list + add/remove (admin only)
- Delete group (admin only): `POST {userStage}/talk/delete/group` with `{ talkId }`

#### `src/components/group/member-list.tsx`
- List of members with avatar, name, admin badge
- Remove button (admin only, not for self)

**Verify**: Create group, edit name/avatar, add/remove members, delete group

---

### Phase 8: Remaining Features

#### `src/components/modals/forward-dialog.tsx`
- shadcn `Dialog` with search through user list. **DESIGN**: Same dark dialog pattern — `rounded-xl border-border/50 bg-popover`. Search input same as sidebar search. User list items use `rounded-lg hover:bg-muted/60 transition-colors`. Selected items show indigo check `text-primary`.
- Select one or multiple recipients
- `POST {userStage}/talk/message/forward` with `{ messageId, talkIds: [...] }`

#### `src/components/modals/user-profile-dialog.tsx`
- View/edit current user's profile picture. **DESIGN**: Centered avatar (`h-24 w-24 rounded-full`) with camera overlay button on hover. Dark dialog background.
- Image crop (square) for avatar upload
- `POST {userStage}/profile` to update

#### `src/components/chat/media-lightbox.tsx`
```tsx
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import Video from 'yet-another-react-lightbox/plugins/video'
import 'yet-another-react-lightbox/styles.css'
// Uses useMediaLightbox hook
```

#### Additional tasks:
- PWA config in `vite.config.ts` (copy from v1's VitePWA config)
- Loading skeletons for sidebar and message list — use `animate-shimmer` class or shadcn `Skeleton` with `bg-muted` background
- Dark/light mode toggle already exists in the settings dropdown in the sidebar bottom bar. Verify it works: toggling should update every surface, not just the chat area.
- Keyboard shortcuts: Escape to cancel edit/reply

---

## API Reference

**Base URL**: from `VITE_APP_{STAGE}_API_URL` env var
**Auth header**: `x-token: {decrypted token from cookie}`
**Public token**: `X-Authorization: Token {VITE_APP_PUBLIC_TOKEN}`

| Endpoint | Method | Params | Purpose |
|---|---|---|---|
| `auth/{userStage}/login` | POST | `{username, password, platform}` | Login |
| `verify_token` | POST | `{api_token}` | Verify token, get user |
| `{userStage}/talk/list` | GET | - | Get all conversations |
| `{userStage}/talk/search` | GET | `{q}` | Search users/groups |
| `{userStage}/talk/start/private` | POST | `{receiverId}` | Start private chat |
| `{userStage}/talk/start/group` | POST | `{talkName, members, talkProfile?}` | Create group |
| `{userStage}/talk/update/group` | POST | `{talkId, talkName?, talkProfile?}` | Update group |
| `{userStage}/talk/delete/group` | POST | `{talkId}` | Delete group |
| `{userStage}/talk/pin` | POST | `{talkId, isPinned}` | Pin/unpin chat |
| `{userStage}/talk/message/list` | GET | `{talkId, fromMessageId?, direction?, limit?}` | Get messages |
| `{userStage}/talk/message/read` | POST | `{lastMessageTime, talkId}` | Mark as read |
| `{userStage}/talk/message/forward` | POST | `{messageId, talkIds}` | Forward message |
| `{userStage}/talk/media/upload` | POST | FormData: `{name, type, media}` | Upload file |
| `{userStage}/profile` | GET/POST | - | Get/update profile |
| `{userStage}/save/fcm` | POST | `{token}` | Save FCM token |

**`{userStage}`** = `import.meta.env.VITE_APP_USER` (usually `"employee"` or `"admin"`)

---

## WebSocket Reference

### Talk WebSocket (per-chat)
**URL**: `wss://{WS_URL}talkapp/talk/{talkId}/?token={xtoken}`
- `xtoken` = `getEncodedCookie('token')` from `@/lib/encryption`

**Incoming messages**:
```json
// New message
{ "messageId": "...", "senderChatuserId": "...", "senderName": "...", "senderType": "...",
  "messageText": "...", "messageType": "TEXT", "created": "ISO8601", ... }

// Edit
{ "action": "edit", "messageId": "...", "messageText": "new text" }

// Delete
{ "action": "delete", "messageId": "..." }

// Read status
{ "type": "readStatus", "messageId": "...", "isReadByAll": true }
```

**Outgoing messages**:
```json
// Send text
{ "talkId": "...", "message": "Hello", "replyToMessageId": "..." }

// Send media (after upload)
{ "mediaId": "...", "messageType": "IMAGE", "replyToMessageId": "..." }

// Edit
{ "action": "edit", "talkId": "...", "messageId": "...", "messageText": "updated" }

// Delete
{ "action": "delete", "messageId": "..." }

// Mark as read
{ "action": "read" }
```

### Contact WebSocket (sidebar)
**URL**: `wss://{WS_URL}contact/{userId}/{userType}/?token={xtoken}`
- On message: call `getUserList()` to refresh sidebar

---

## Data Models

```typescript
// Message
interface Message {
  messageId: string;
  talkId: string;
  senderChatuserId: string;
  senderName: string;
  senderType: string;        // "EMPLOYEE" | "ADMIN"
  messageText: string;
  messageType: string;        // "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT"
  mediaId?: string;
  mediaPath?: string;
  mediaName?: string;
  created: string;            // ISO 8601
  updated: string;
  replyToMessageId?: string;
  replyMessage?: any;         // Nested reply message object
  forwardedFrom?: string;
  unread: number;             // 0 or 1
  isReadByAll: boolean;
}

// Talk (conversation)
interface Talk {
  talkId: string;
  talkType: string;           // "PRIVATE" | "GROUP"
  talkName: string;
  talkProfile: string;        // Avatar URL
  receiverId: string;
  receiverName: string;
  receiverType: string;
  receiverProfile: string;
  isActive: boolean;          // Online status
  isGroupAdmin: boolean;
  isPinned: boolean;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

// Auth
interface AuthModel {
  api_token: string;
  refreshToken?: string;
}

// User
interface UserModel {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  fullname?: string;
  pic?: string;
  occupation?: string;
  companyName?: string;
  phone?: string;
  roles?: number[];
}
```

---

## Key Patterns

### Import aliases
Always use `@/` prefix: `import { cn } from "@/lib/utils"`

### Cookie access
```typescript
import { getEncodedCookie, setEncodedCookieOneYear } from "@/lib/encryption";
const token = getEncodedCookie("token");
const userId = getEncodedCookie("uid");
const userType = getEncodedCookie("userType");
```

### API calls
```typescript
import { apiHeader, getData, postData } from "@/lib/api-helper";
const response = await getData(`${userStage}/talk/list`, {}, apiHeader(false, 0));
if (String(response?.status) === '200' && String(response?.data.status) === '200') {
  const data = response.data.data;
}
```

### WebSocket usage
```typescript
import useWebSocket from "@/hooks/use-websocket";
const { send, isConnected } = useWebSocket({
  url: `wss://${WS_URL}talkapp/talk/${talkId}/?token=${xtoken}`,
  onMessage: (data) => { /* handle */ },
  deps: [talkId],
});
```

### Message formatting
```typescript
import { formatMessage, formatTimeAgo, formatMessageWithMentions } from "@/lib/message-formatters";
// Display: dangerouslySetInnerHTML={{ __html: formatMessage(msg.messageText) }}
// Time: formatTimeAgo(msg.created)
// Before send: formatMessageWithMentions(rawText, groupMembers)
```

### shadcn component paths
All at `@/components/ui/xxx` — button, input, dialog, sheet, avatar, badge, etc.

### Dark mode enforcement
**Before completing any phase**, run this mental checklist:
1. Open every new/modified component file
2. Search for: `bg-white`, `bg-gray-`, `bg-slate-`, `text-black`, `text-gray-`, `border-gray-`
3. If ANY are found, replace with semantic equivalents (`bg-background`, `bg-muted`, `text-foreground`, etc.)
4. Visually verify: every pixel of the app should be dark when `class="dark"` is on `<html>`

### Toast notifications (replaces react-toastify + SweetAlert2)
```typescript
import { toast } from "sonner";
toast.error("Something went wrong");
toast.success("Message sent");
```

### Confirmations (replaces SweetAlert2)
Use the `confirm-dialog.tsx` component (to be created in Phase 4).

---

## Environment Variables (.env)

```
VITE_APP_ENCRYPT_KEY=vOVH6sdmpNWjRRIqCc7rdxs01lwHzfr3
VITE_APP_DEVELOPMENT_API_URL=https://xlapi.xpertlabserver.com/chatapp/
VITE_APP_DEVELOPMENT_SOCKET_URL=xlapi.xpertlabserver.com/ws/
VITE_APP_PUBLIC_TOKEN=h51hEo215kf32JQJInhV4WjA?A8olpMZ4dFx5dS5KlPuXailDln!LcvMxxb1a7Zx
VITE_APP_USER=employee
VITE_APP_STAGE=development
```

---

## shadcn Components Available

Already installed in `src/components/ui/`:
`alert-dialog`, `avatar`, `badge`, `button`, `card`, `command`, `dialog`,
`dropdown-menu`, `form`, `input`, `label`, `popover`, `scroll-area`,
`separator`, `sheet`, `skeleton`, `sonner`, `tabs`, `textarea`, `tooltip`

To add more: `npx shadcn@latest add <component>` (from v2/ directory)
**Note**: shadcn installs to literal `@/` dir — move files to `src/components/ui/` after install.

---

## File Reference: v1 Components to Study

When building a phase, read the corresponding v1 file for business logic:

| v2 Component | v1 Reference (for logic only, not UI) |
|---|---|
| auth-provider.tsx | `src/app/modules/auth/core/Auth.tsx` + `AuthHelpers.ts` |
| login-form.tsx | `src/app/modules/auth/components/Login.tsx` |
| chat-page.tsx | `src/app/pages/chats/ChatsMain.tsx` (InitChat component) |
| chat-sidebar.tsx | `src/app/pages/chats/ChatUserScreen.tsx` |
| chat-area.tsx | `src/app/pages/chats/ChatInnerScreen.tsx` |
| chat-header.tsx | `src/app/pages/chats/components/ChatHeader.tsx` |
| message-bubble.tsx | `src/app/pages/chats/components/MessageBubble.tsx` |
| message-input.tsx | `src/app/pages/chats/components/MessageInput.tsx` |
| chat-list-item.tsx | `src/app/pages/chats/components/UserListItem.tsx` |
| create-group-dialog.tsx | `src/app/pages/chats/components/CreateGroupModal.tsx` |
| group-management-sheet.tsx | `src/app/pages/chats/components/GroupManagement.tsx` |
| forward-dialog.tsx | `src/app/components/chat/ForwardModal.tsx` |
| user-profile-dialog.tsx | `src/app/pages/chats/components/UserProfileModal.tsx` |

**Important**: v1 files are at `/media/xpertlab-15/Backup/F/Khushal/react/XpertTalk/src/` — read them **only for business logic & API patterns**. Do NOT replicate v1's visual design. Design all UI/UX from scratch with a modern aesthetic using Tailwind + shadcn/ui.