"use client"

import * as React from "react"
import { Slot, Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function TooltipProvider({
  delayDuration = 200,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          // Popover tokens, so the tooltip follows light/dark and every accent theme.
          // z above the media lightbox portal (9999).
          "z-[10000] w-fit max-w-xs overflow-hidden rounded-lg border border-border/70 bg-popover/95 px-2.5 py-1.5 text-xs font-medium text-balance text-popover-foreground shadow-lg backdrop-blur-md",
          "origin-(--radix-tooltip-content-transform-origin)",
          "data-[state=delayed-open]:tooltip-enter data-[state=instant-open]:tooltip-enter",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="-mt-px fill-popover" width={11} height={5} />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

/**
 * Drop-in replacement for a native `title` attribute: wraps one element and
 * shows `label` as a themed tooltip. An empty label renders the child alone.
 * Forwards props and ref, so it can sit inside another `asChild` trigger.
 */
const Hint = React.forwardRef<
  HTMLElement,
  {
    label?: React.ReactNode
    side?: React.ComponentProps<typeof TooltipPrimitive.Content>["side"]
    align?: React.ComponentProps<typeof TooltipPrimitive.Content>["align"]
    /** Classes for the wrapper used when the child is disabled. */
    className?: string
    children: React.ReactElement
  } & Omit<React.HTMLAttributes<HTMLElement>, "children">
>(({ label, side = "top", align, className, children, ...rest }, ref) => {
  if (label === undefined || label === null || label === "") {
    return (
      <Slot.Root ref={ref} {...rest}>
        {children}
      </Slot.Root>
    )
  }
  // A disabled button fires no pointer events, so hover lands on a wrapper.
  const disabled = !!(children.props as { disabled?: boolean }).disabled
  return (
    <Tooltip>
      <TooltipTrigger asChild ref={ref as React.Ref<HTMLButtonElement>} {...rest}>
        {disabled ? (
          <span tabIndex={0} className={cn("inline-flex", className)}>
            {children}
          </span>
        ) : (
          children
        )}
      </TooltipTrigger>
      <TooltipContent side={side} align={align}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
})
Hint.displayName = "Hint"

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Hint }
