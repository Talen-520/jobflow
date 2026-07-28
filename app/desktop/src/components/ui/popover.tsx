import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@/lib/utils";

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

type PopoverContentProps =
  React.ComponentProps<typeof PopoverPrimitive.Popup> & {
    align?: React.ComponentProps<typeof PopoverPrimitive.Positioner>["align"];
    side?: React.ComponentProps<typeof PopoverPrimitive.Positioner>["side"];
    sideOffset?: React.ComponentProps<
      typeof PopoverPrimitive.Positioner
    >["sideOffset"];
  };

function PopoverContent({
  align = "center",
  className,
  side = "bottom",
  sideOffset = 4,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        collisionPadding={12}
        side={side}
        sideOffset={sideOffset}
        className="z-50 outline-none"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "origin-(--transform-origin) rounded-md border border-border bg-popover text-popover-foreground shadow-md outline-none transition-[transform,opacity] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
