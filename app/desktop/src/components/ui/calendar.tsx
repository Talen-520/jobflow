import * as React from "react";
import {
  DayPicker,
  getDefaultClassNames,
  type ChevronProps,
  type DayButtonProps,
} from "react-day-picker";
import {
  IoChevronBack,
  IoChevronDown,
  IoChevronForward,
} from "react-icons/io5";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Calendar({
  buttonVariant = "ghost",
  captionLayout = "label",
  className,
  classNames,
  components,
  formatters,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      navLayout="around"
      className={cn(
        "w-fit bg-background p-3 [--cell-size:2rem]",
        className,
      )}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 md:flex-row",
          defaultClassNames.months,
        ),
        month: cn("flex w-full flex-col gap-3", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex h-(--cell-size) w-full items-center justify-between",
          defaultClassNames.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant, size: "icon-sm" }),
          "absolute left-0 top-0 z-10 size-(--cell-size) p-0 shadow-none aria-disabled:opacity-40",
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant, size: "icon-sm" }),
          "absolute right-0 top-0 z-10 size-(--cell-size) p-0 shadow-none aria-disabled:opacity-40",
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          "flex h-(--cell-size) w-full items-center justify-center px-9",
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          "flex h-(--cell-size) items-center justify-center gap-1.5 text-sm font-medium",
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn(
          "relative rounded-md border border-input bg-background shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring",
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn(
          "absolute inset-0 cursor-pointer bg-popover opacity-0",
          defaultClassNames.dropdown,
        ),
        caption_label: cn(
          captionLayout === "label"
            ? "text-sm font-medium"
            : "flex h-7 items-center gap-1 px-2 text-sm font-medium",
          defaultClassNames.caption_label,
        ),
        month_grid: cn(
          "w-full border-collapse",
          defaultClassNames.month_grid,
        ),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "w-(--cell-size) text-center text-xs font-normal text-muted-foreground",
          defaultClassNames.weekday,
        ),
        week: cn("mt-1 flex w-full", defaultClassNames.week),
        day: cn(
          "relative size-(--cell-size) p-0 text-center",
          defaultClassNames.day,
        ),
        today: cn(defaultClassNames.today),
        outside: cn(defaultClassNames.outside),
        disabled: cn(defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Chevron: CalendarChevron,
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarChevron({
  className,
  orientation,
}: ChevronProps) {
  const iconClassName = cn("size-4", className);

  if (orientation === "left") {
    return <IoChevronBack aria-hidden="true" className={iconClassName} />;
  }
  if (orientation === "right") {
    return <IoChevronForward aria-hidden="true" className={iconClassName} />;
  }
  return <IoChevronDown aria-hidden="true" className={iconClassName} />;
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: DayButtonProps) {
  const ref = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (modifiers.focused) {
      ref.current?.focus();
    }
  }, [modifiers.focused]);

  return (
    <Button
      ref={ref}
      type="button"
      variant={modifiers.selected ? "default" : "ghost"}
      size="icon-sm"
      data-day={day.date.toLocaleDateString()}
      className={cn(
        "size-(--cell-size) rounded-md p-0 text-sm font-normal shadow-none",
        modifiers.today && !modifiers.selected && "bg-accent font-semibold",
        modifiers.outside && "text-muted-foreground opacity-45",
        modifiers.disabled && "pointer-events-none opacity-40",
        modifiers.selected && "font-medium",
        className,
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
