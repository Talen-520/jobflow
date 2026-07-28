import * as React from "react";
import { IoCalendarOutline, IoClose } from "react-icons/io5";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const EARLIEST_MONTH = new Date(1950, 0, 1);
const LATEST_MONTH = new Date(2100, 11, 1);

function parseLocalDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
}

function formatLocalDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function DatePicker({
  "aria-label": ariaLabel,
  className,
  onChange,
  placeholder = "Select date",
  value,
}: {
  "aria-label"?: string;
  className?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [timeZone, setTimeZone] = React.useState<string>();
  const selectedDate = parseLocalDate(value);

  React.useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            aria-label={ariaLabel}
            className={cn(
              "h-12 w-full justify-between rounded-[16px] border-transparent bg-muted px-4 text-left font-normal shadow-none hover:bg-muted/80 data-[popup-open]:border-ring data-[popup-open]:bg-background data-[popup-open]:ring-2 data-[popup-open]:ring-ring",
              !selectedDate && "text-muted-foreground",
              className,
            )}
            type="button"
            variant="outline"
          />
        }
      >
        <span>{selectedDate ? formatDateLabel(selectedDate) : placeholder}</span>
        <IoCalendarOutline data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0" sideOffset={6}>
        <Calendar
          captionLayout="dropdown"
          defaultMonth={selectedDate}
          endMonth={LATEST_MONTH}
          fixedWeeks
          mode="single"
          selected={selectedDate}
          startMonth={EARLIEST_MONTH}
          timeZone={timeZone}
          onSelect={(date) => {
            if (!date) {
              return;
            }
            onChange(formatLocalDate(date));
            setOpen(false);
          }}
        />
        {selectedDate ? (
          <div className="border-t border-border p-2">
            <Button
              className="w-full justify-start"
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <IoClose data-icon="inline-start" />
              Clear date
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export { DatePicker, formatLocalDate, parseLocalDate };
