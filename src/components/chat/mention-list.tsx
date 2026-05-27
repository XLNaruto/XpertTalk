import React, { useEffect, useRef } from "react";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface MentionMember {
  name: string;
  _isAll?: boolean;
  [key: string]: any;
}

interface MentionListProps {
  members: MentionMember[];
  activeIndex: number;
  onSelect: (name: string) => void;
  position?: { top: number; left: number };
}

export const MentionList = React.memo(function MentionList({
  members,
  activeIndex,
  onSelect,
  position,
}: MentionListProps) {
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [activeIndex]);

  // Clamp dropdown so it never overflows the viewport
  useEffect(() => {
    const el = dropdownRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      const overflow = rect.right - window.innerWidth + 8; // 8px padding from edge
      el.style.left = `${Math.max(0, parseFloat(el.style.left || "0") - overflow)}px`;
    }
  }, [position, members]);

  if (members.length === 0) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 mb-2 w-56 rounded-xl border border-border/50 bg-popover p-1.5 shadow-xl"
      style={
        position
          ? { bottom: "100%", left: `${position.left}px` }
          : { bottom: "100%", left: 0 }
      }
    >
      <ul className="max-h-[200px] overflow-y-auto">
        {members.map((member, index) => (
          <li
            key={member.name}
            ref={(el) => { itemRefs.current[index] = el; }}
            className={cn(
              "flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2 text-sm transition-colors",
              index === activeIndex
                ? "bg-primary/10 text-primary"
                : "text-foreground hover:bg-muted/60"
            )}
            onClick={() => onSelect(member.name)}
          >
            {member._isAll && (
              <Users className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className={cn(member._isAll && "font-semibold")}>
              @{member.name}
            </span>
            {member._isAll && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                Notify everyone
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
});
