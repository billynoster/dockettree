import * as React from "react"
import { cn } from "cn"

/** Multi-line input atom. Grows with its content rather than scrolling inside a fixed box. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-lg border border-input bg-card px-3 py-2 text-base leading-relaxed text-foreground shadow-[inset_0_1px_1px_oklch(0.32_0.03_55_/_0.03)] transition-[border-color,box-shadow] duration-(--duration-quick) ease-(--ease-soft) outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-100 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
