import { useMemo, useState } from "react";
import { CalendarPlus, CalendarX2, Loader2, RefreshCw } from "lucide-react";

import { splitEvents, useEventsStore } from "@/stores/events-store";
import type { EventRecord } from "@/lib/events-api";
import { EventDetails } from "@/components/events/event-details";
import { EventFormDialog } from "@/components/events/event-form-dialog";
import { EventListItem } from "@/components/events/event-list-item";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hint } from "@/components/ui/tooltip";

/**
 * The Events surface: a list of everything the caller can see, with details
 * and the create/edit form layered on top. Open state lives in the store so a
 * notification tap can open it on a specific event.
 */
export function EventsSheet() {
  const isOpen = useEventsStore((s) => s.isOpen);
  const closeEvents = useEventsStore((s) => s.closeEvents);
  const events = useEventsStore((s) => s.events);
  const isLoading = useEventsStore((s) => s.isLoading);
  const hasLoadedOnce = useEventsStore((s) => s.hasLoadedOnce);
  const transportError = useEventsStore((s) => s.transportError);
  const refreshList = useEventsStore((s) => s.refreshList);
  const activeEventId = useEventsStore((s) => s.activeEventId);
  const detail = useEventsStore((s) => s.detail);
  const detailLoading = useEventsStore((s) => s.detailLoading);
  const detailError = useEventsStore((s) => s.detailError);
  const openEventDetail = useEventsStore((s) => s.openEventDetail);
  const closeDetail = useEventsStore((s) => s.closeDetail);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EventRecord | null>(null);

  const { upcoming, past } = useMemo(() => splitEvents(events), [events]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (event: EventRecord) => {
    setEditing(event);
    setFormOpen(true);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && closeEvents()}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <SheetTitle className="sr-only">Events</SheetTitle>
          <SheetDescription className="sr-only">
            Events you created or were invited to.
          </SheetDescription>

          {activeEventId ? (
            <EventDetails
              event={detail}
              loading={detailLoading}
              error={detailError}
              onBack={closeDetail}
              onEdit={openEdit}
            />
          ) : (
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border bg-popover px-4 py-3 pr-12">
                <span className="text-[15px] font-bold tracking-tight text-foreground">
                  Events
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <Hint label="Refresh events">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Refresh events"
                      onClick={() => refreshList()}
                      disabled={isLoading}
                    >
                      <RefreshCw
                        className={isLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                      />
                    </Button>
                  </Hint>
                  <Button size="sm" className="[.dark:not(.accent-black)_&]:text-white" onClick={openCreate}>
                    <CalendarPlus className="h-4 w-4" />
                    New
                  </Button>
                </div>
              </div>

              <ScrollArea className="min-h-0 flex-1 overflow-auto">
                {!hasLoadedOnce && isLoading ? (
                  <div className="flex h-40 items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : transportError ? (
                  <div className="flex flex-col items-center gap-3 p-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      {transportError}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refreshList()}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Retry
                    </Button>
                  </div>
                ) : events.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 p-10 text-center">
                    <CalendarX2
                      className="h-9 w-9 text-primary"
                      strokeWidth={1.6}
                    />
                    <p className="text-sm font-medium text-foreground">
                      No events yet
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Create one and everyone invited gets reminders before it
                      starts.
                    </p>
                    <Button size="sm" className="mt-2 [.dark:not(.accent-black)_&]:text-white" onClick={openCreate}>
                      <CalendarPlus className="h-4 w-4" />
                      New event
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4 p-3">
                    <EventGroup
                      label="Upcoming"
                      events={upcoming}
                      emptyText="Nothing coming up."
                      onOpen={openEventDetail}
                    />
                    <EventGroup
                      label="Past & cancelled"
                      events={past}
                      onOpen={openEventDetail}
                    />
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <EventFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        event={editing}
      />
    </>
  );
}

function EventGroup({
  label,
  events,
  emptyText,
  onOpen,
}: {
  label: string;
  events: EventRecord[];
  emptyText?: string;
  onOpen: (id: string) => void;
}) {
  if (events.length === 0 && !emptyText) return null;
  return (
    <div className="space-y-2">
      <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
        {label}
      </p>
      {events.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <EventListItem
              key={event.id}
              event={event}
              onClick={() => onOpen(event.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
