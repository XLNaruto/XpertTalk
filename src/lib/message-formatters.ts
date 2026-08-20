import { format, startOfDay, subDays, differenceInDays } from "date-fns";

/**
 * Formats message text with HTML escaping, URL linking, and rich text.
 * Supports: *bold*, _italic_, _*bold italic*_, ~strikethrough~, URLs, newlines.
 */
export const formatMessage = (text: string): string => {
  if (!text) return "";

  const escapeHtml = (unsafe: string) =>
    unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  let safeText = escapeHtml(text);

  // Convert URLs to clickable links
  safeText = safeText.replace(
    /(\bhttps?:\/\/[^\s<]+|\bwww\.[^\s<]+)/gi,
    (url) => {
      const href = url.startsWith("http") ? url : `https://${url}`;
      // `msg-link` inherits the bubble's text colour — see index.css. A fixed
      // colour is unreadable on one of the two bubble fills.
      return `<a class="msg-link" href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        url
      )}</a>`;
    }
  );

  // Apply formatting after escaping and link replacement
  return safeText
    .replace(/(^|\s)_\*(\S(.*?\S)?)\*_/g, "$1<i><b>$2</b></i>") // Bold + Italic: _*text*_
    .replace(/(^|\s)\*(\S(.*?\S)?)\*/g, "$1<b>$2</b>") // Bold: *text*
    .replace(/(^|\s)_(\S(.*?\S)?)_/g, "$1<i>$2</i>") // Italic: _text_
    .replace(/(^|\s)~(\S(.*?\S)?)~/g, "$1<del>$2</del>") // Strikethrough: ~text~
    .replace(/\n/g, "<br/>"); // Preserve new lines
};

/**
 * Lightweight formatting for previews (pinned messages, reply bars, etc.).
 * Applies bold/italic/strikethrough but no links or newlines.
 */
export const formatPreview = (text: string): string => {
  if (!text) return "";
  const escapeHtml = (unsafe: string) =>
    unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  return escapeHtml(text)
    .replace(/(^|\s)_\*(\S(.*?\S)?)\*_/g, "$1<i><b>$2</b></i>")
    .replace(/(^|\s)\*(\S(.*?\S)?)\*/g, "$1<b>$2</b>")
    .replace(/(^|\s)_(\S(.*?\S)?)_/g, "$1<i>$2</i>")
    .replace(/(^|\s)~(\S(.*?\S)?)~/g, "$1<del>$2</del>")
    .replace(/\n/g, " ");
};

/**
 * Formats a UTC date string into a human-readable relative time.
 */
export const formatTimeAgo = (dateString: string): string => {
  const messageTime = new Date(dateString);
  const now = new Date();

  const todayStart = startOfDay(now);
  const yesterdayStart = startOfDay(subDays(now, 1));

  if (messageTime >= todayStart) {
    return format(messageTime, "hh:mm a");
  }

  if (messageTime >= yesterdayStart && messageTime < todayStart) {
    return "Yesterday";
  }

  if (differenceInDays(now, messageTime) < 7) {
    return format(messageTime, "EEEE");
  }

  return format(messageTime, "dd/MM/yyyy");
};

/**
 * Wraps @mentions in asterisks for bold rendering.
 */
export const formatMessageWithMentions = (
  rawMessage: string,
  mentionMembers: { name: string }[]
): string => {
  let formattedMessage = rawMessage;

  formattedMessage = formattedMessage.replace(/@all\b/gi, "*@all*");

  mentionMembers.forEach((member) => {
    const regex = new RegExp(`@${member.name}\\b`, "gi");
    formattedMessage = formattedMessage.replace(regex, `*@${member.name}*`);
  });

  return formattedMessage;
};

/**
 * Removes bold asterisks from @mentions.
 */
export const unformatMentionsFromMessage = (
  formattedMessage: string
): string => {
  let plainMessage = formattedMessage.replace(/\*@all\*/gi, "@all");
  plainMessage = plainMessage.replace(/\*@([^*]+)\*/g, "@$1");
  return plainMessage;
};
