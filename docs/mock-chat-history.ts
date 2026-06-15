// Static mock chat-history data for the admin panel.
// Covers every message variation: TEXT (plain / link / mention / emoji-only /
// edited / pinned), IMAGE, VIDEO, DOCUMENT, replies (to text/image/video),
// forwards (text/image/video/document), reactions, read status, and both
// PRIVATE and GROUP talks. See ADMIN_PANEL_CHAT_HISTORY.md for field meanings.

export type MessageType = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
export type TalkType = "PRIVATE" | "GROUP";

export interface Reaction {
  chatuserId: string;
  userName: string;
  userProfile?: string;
  reaction: string;
}

/** Embedded snapshot of the original message (reply quote / forwarded source). */
export interface EmbeddedMessage {
  messageId: string;
  messageType: MessageType;
  messageText?: string;
  mediaPath?: string;
  mediaName?: string;
  senderName: string;
}

export interface ChatMessage {
  /** Doc-only label describing what variation this row demonstrates. */
  _case?: string;
  messageId: string;
  talkId: string;
  messageType: MessageType;
  messageText: string;

  senderId: string;
  senderName: string;
  senderProfile: string;

  created: string;
  updated: string;
  isEdited: boolean;
  isReadByAll: boolean;
  isPinned: boolean;

  // Media (IMAGE / VIDEO / DOCUMENT)
  mediaId?: string;
  mediaPath?: string;
  mediaName?: string;

  // Reply
  replyToMessageId: string | null;
  replyToMessageText?: string;
  replyMessage?: EmbeddedMessage;

  // Forward
  forwardFromMessageId: string | null;
  forwardedMessageText?: string;
  forwardMessage?: EmbeddedMessage;

  reactions: Reaction[];
}

export interface TalkMember {
  chatuserId: string;
  name: string;
  profile: string;
}

export interface Talk {
  talkId: string;
  talkType: TalkType;
  talkName: string;
  talkProfile: string;
  members: TalkMember[];
  messages: ChatMessage[];
}

import data from "./mock-chat-history.json";

export const mockTalks = (data as { talks: Talk[] }).talks;

/** Convenience: flat list of every message across all talks. */
export const mockMessages: ChatMessage[] = mockTalks.flatMap((t) => t.messages);

export default mockTalks;
