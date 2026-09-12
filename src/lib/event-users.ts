/** Shared shapes for picking event participants. */
import type { PickableUser } from "@/lib/events-api";

/** A selected person, normalised: `chatuserId` is always a string. */
export interface SelectedUser {
  chatuserId: string;
  userType?: string;
  firstName?: string;
  lastName?: string;
  profileUrl?: string;
}

/** `/chat/talk/users` returns `chatuserId` as a number — normalise it here. */
export function toSelectedUser(user: PickableUser): SelectedUser {
  return {
    chatuserId: String(user.chatuserId),
    userType: String(user.externalType || ""),
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    profileUrl: user.profileUrl || "",
  };
}

export function displayName(user: {
  firstName?: string;
  lastName?: string;
}): string {
  return `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Unknown";
}
