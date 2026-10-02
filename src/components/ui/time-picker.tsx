import { useEffect, useMemo, useRef, useState } from "react";
import { Clock } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface TimeValue {
  /** 0–23. */
  hours: number;
  /** 0–59. */
  minutes: number;
}

interface TimePickerProps {
  value: TimeValue | null;
  onChange: (value: TimeValue) => void;
  /** Minutes offered in the list; an off-step current value is kept anyway. */
  minuteStep?: number;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  /** Paints the destructive border when the field failed validation. */
  invalid?: boolean;
  className?: string;
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);

function formatTimeValue({ hours, minutes }: TimeValue): string {
  const period = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(h12).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )} ${period}`;
}

export function TimePicker({
  value,
  onChange,
  minuteStep = 5,
  placeholder = "Select time",
  id,
  disabled,
  invalid,
  className,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);

  // Default the columns to the next whole hour so "Done" is always meaningful.
  const draft: TimeValue = value ?? { hours: new Date().getHours() + 1, minutes: 0 };
  const hours24 = ((draft.hours % 24) + 24) % 24;
  const period: "AM" | "PM" = hours24 >= 12 ? "PM" : "AM";
  const hour12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  const minutes = useMemo(() => {
    const list = [];
    for (let m = 0; m < 60; m += Math.max(1, minuteStep)) list.push(m);
    // Keep an existing off-step minute selectable (e.g. an event set at 12:37).
    if (value && !list.includes(value.minutes)) {
      list.push(value.minutes);
      list.sort((a, b) => a - b);
    }
    return list;
  }, [minuteStep, value]);

  const emit = (next: { hour12?: number; minutes?: number; period?: "AM" | "PM" }) => {
    const h = next.hour12 ?? hour12;
    const p = next.period ?? period;
    const base = h % 12; // 12 AM → 0, 12 PM → 12
    onChange({
      hours: p === "PM" ? base + 12 : base,
      minutes: next.minutes ?? draft.minutes,
    });
  };

  return (
    // `modal` gives the popover its own scroll lock; without it a parent Dialog's
    // lock swallows wheel events in the portaled columns.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-invalid={invalid}
          className={cn(
            "flex h-9 w-full cursor-pointer items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] dark:bg-input/30",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "disabled:pointer-events-none disabled:opacity-50",
            open && "border-ring ring-[3px] ring-ring/50",
            invalid &&
              "border-destructive ring-destructive/20 dark:ring-destructive/40",
            className
          )}
        >
          <span
            className={cn(
              "flex-1 truncate text-left",
              !value && "text-muted-foreground"
            )}
          >
            {value ? formatTimeValue(value) : placeholder}
          </span>
          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex divide-x divide-border">
          <Column
            label="Hour"
            open={open}
            items={HOURS_12.map((h) => ({
              key: h,
              text: String(h).padStart(2, "0"),
              selected: !!value && h === hour12,
            }))}
            onPick={(h) => emit({ hour12: h })}
          />
          <Column
            label="Minute"
            open={open}
            items={minutes.map((m) => ({
              key: m,
              text: String(m).padStart(2, "0"),
              selected: !!value && m === draft.minutes,
            }))}
            onPick={(m) => emit({ minutes: m })}
          />
          <Column
            label="AM/PM"
            open={open}
            items={(["AM", "PM"] as const).map((p) => ({
              key: p,
              text: p,
              selected: !!value && p === period,
            }))}
            onPick={(p) => emit({ period: p })}
          />
        </div>
        <div className="flex justify-end border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={() => {
              // Nothing picked yet — commit the default the columns showed.
              if (!value) emit({});
              setOpen(false);
            }}
            className="cursor-pointer rounded-md px-2 py-1 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            Done
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Column<T extends string | number>({
  label,
  items,
  onPick,
  open,
}: {
  label: string;
  items: { key: T; text: string; selected: boolean }[];
  onPick: (key: T) => void;
  open: boolean;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Bring the current value into view each time the popover opens.
  useEffect(() => {
    if (open) selectedRef.current?.scrollIntoView({ block: "center" });
  }, [open]);

  return (
    <div className="flex w-20 flex-col">
      <div className="border-b border-border px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="h-48 overflow-y-auto p-1">
        {items.map((item) => (
          <button
            key={item.key}
            ref={item.selected ? selectedRef : undefined}
            type="button"
            onClick={() => onPick(item.key)}
            className={cn(
              "w-full cursor-pointer rounded-md py-1.5 text-center text-sm transition-colors",
              item.selected
                ? "bg-primary font-semibold text-primary-foreground"
                : "text-foreground hover:bg-accent"
            )}
          >
            {item.text}
          </button>
        ))}
      </div>
    </div>
  );
}
