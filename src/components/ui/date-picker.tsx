import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addYears,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Six rows keeps the popover height stable as the user pages through months. */
const GRID_DAYS = 42;

interface DatePickerProps {
  value: Date | null;
  onChange: (date: Date) => void;
  /** Days before this one are not selectable. */
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  /** Paints the destructive border when the field failed validation. */
  invalid?: boolean;
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = "dd/mm/yyyy",
  id,
  disabled,
  invalid,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() =>
    startOfMonth(value || minDate || new Date())
  );

  const today = startOfDay(new Date());
  const min = minDate ? startOfDay(minDate) : null;
  const max = maxDate ? startOfDay(maxDate) : null;

  const days = useMemo(() => {
    const first = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    return Array.from({ length: GRID_DAYS }, (_, i) => addDays(first, i));
  }, [cursor]);

  const isDisabled = (day: Date) =>
    (!!min && day < min) || (!!max && day > max);

  const pick = (day: Date) => {
    if (isDisabled(day)) return;
    onChange(day);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reopen on the month being looked at, not wherever paging ended.
        if (next) setCursor(startOfMonth(value || minDate || new Date()));
      }}
    >
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
            {value ? format(value, "dd/MM/yyyy") : placeholder}
          </span>
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto p-3">
        <div className="mb-2 flex items-center justify-between gap-1">
          <NavButton
            label="Previous year"
            onClick={() => setCursor(addYears(cursor, -1))}
          >
            <ChevronsLeft className="h-4 w-4" />
          </NavButton>
          <NavButton
            label="Previous month"
            onClick={() => setCursor(addMonths(cursor, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </NavButton>
          <span className="flex-1 text-center text-sm font-semibold text-foreground">
            {format(cursor, "MMMM yyyy")}
          </span>
          <NavButton
            label="Next month"
            onClick={() => setCursor(addMonths(cursor, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </NavButton>
          <NavButton
            label="Next year"
            onClick={() => setCursor(addYears(cursor, 1))}
          >
            <ChevronsRight className="h-4 w-4" />
          </NavButton>
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {day}
            </div>
          ))}

          {days.map((day) => {
            const outside = !isSameMonth(day, cursor);
            const selected = !!value && isSameDay(day, value);
            const blocked = isDisabled(day);
            return (
              <button
                key={day.toISOString()}
                type="button"
                disabled={blocked}
                onClick={() => pick(day)}
                className={cn(
                  "h-8 w-9 rounded-md text-sm transition-colors",
                  blocked
                    ? "cursor-not-allowed text-muted-foreground/40"
                    : "cursor-pointer hover:bg-accent",
                  outside && !selected && "text-muted-foreground/60",
                  isSameDay(day, today) &&
                    !selected &&
                    "border border-primary/40 font-medium",
                  selected &&
                    "bg-primary font-semibold text-primary-foreground hover:bg-primary"
                )}
              >
                {format(day, "d")}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}
