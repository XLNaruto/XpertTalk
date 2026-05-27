import React, { useCallback } from "react";
import { MoreVertical, Shield, UserMinus } from "lucide-react";

import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface GroupMember {
  chatuserId: string | number;
  externalType: string;
  name: string;
  profile: string;
  talkparticipantId: string;
  isGroupAdmin: boolean;
}

interface MemberListProps {
  members: GroupMember[];
  isGroupAdmin: boolean;
  currentUserId: string;
  onRemove: (talkparticipantId: string) => void;
  onToggleAdmin: (talkparticipantId: string, currentIsAdmin: boolean) => void;
}

const MemberItem = React.memo(function MemberItem({
  member,
  isGroupAdmin,
  currentUserId,
  onRemove,
  onToggleAdmin,
}: {
  member: GroupMember;
  isGroupAdmin: boolean;
  currentUserId: string;
  onRemove: (id: string) => void;
  onToggleAdmin: (id: string, isAdmin: boolean) => void;
}) {
  const isSelf = String(member.chatuserId) === String(currentUserId);
  const isSystemAdmin = member.externalType === "ADMIN";
  const canManage = isGroupAdmin && !isSelf && !isSystemAdmin;
  const showAdminBadge = member.isGroupAdmin || isSystemAdmin;

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
        canManage && "hover:bg-muted/60"
      )}
    >
      <UserAvatar src={member.profile} name={member.name} size="default" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-foreground">
            {member.name}
          </span>
          {isSelf && (
            <span className="text-[10px] text-muted-foreground/50">You</span>
          )}
          {showAdminBadge && (
            <Badge
              variant="secondary"
              className="h-[18px] rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary"
            >
              Admin
            </Badge>
          )}
        </div>
      </div>

      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-primary/10 hover:text-primary"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-44 rounded-xl border-border/50 p-1.5"
          >
            <DropdownMenuItem
              className="gap-2.5 rounded-lg px-2.5 py-2 text-sm"
              onClick={() => onToggleAdmin(member.talkparticipantId, member.isGroupAdmin)}
            >
              <Shield className="h-4 w-4" />
              {member.isGroupAdmin ? "Remove Admin" : "Make Admin"}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2.5 rounded-lg px-2.5 py-2 text-sm"
              onClick={() => onRemove(member.talkparticipantId)}
            >
              <UserMinus className="h-4 w-4" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
});

export const MemberList = React.memo(function MemberList({
  members,
  isGroupAdmin,
  currentUserId,
  onRemove,
  onToggleAdmin,
}: MemberListProps) {
  const handleRemove = useCallback(
    (id: string) => onRemove(id),
    [onRemove]
  );

  const handleToggleAdmin = useCallback(
    (id: string, isAdmin: boolean) => onToggleAdmin(id, isAdmin),
    [onToggleAdmin]
  );

  if (members.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground/60">
        No members found
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {members.map((member) => (
        <MemberItem
          key={member.talkparticipantId || `${member.chatuserId}-${member.externalType}`}
          member={member}
          isGroupAdmin={isGroupAdmin}
          currentUserId={currentUserId}
          onRemove={handleRemove}
          onToggleAdmin={handleToggleAdmin}
        />
      ))}
    </div>
  );
});
