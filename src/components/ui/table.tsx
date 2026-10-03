import * as React from "react"
import { cn } from "cn"

function Table({
  className,
  density,
  ...props
}: React.ComponentProps<"table"> & {
  /** Dense enterprise data rows (~52px) with no vertical rules — Vendors / list screens. */
  density?: "data"
}) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        data-density={density}
        className={cn(
          "type-body w-full caption-bottom",
          density === "data" &&
            "[&_th]:h-11 [&_th]:border-r-0 [&_td]:h-[52px] [&_td]:max-h-[52px] [&_td]:border-r-0 [&_td]:py-0 [&_td]:align-middle",
          className,
        )}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b bg-muted/45", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors duration-(--duration-quick) last:border-b-0 hover:bg-muted/55 has-aria-expanded:bg-muted/55 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "type-subtitle h-10 px-3 text-left align-middle whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-2.5 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

/**
 * Column header that sorts. Clicking the active column flips direction; `aria-sort` carries the
 * state so the arrow is a decoration rather than the only signal.
 */
function TableSortHeader({
  active,
  direction,
  onSort,
  children,
  className,
}: {
  active: boolean
  direction: "asc" | "desc"
  onSort: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <TableHead
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={className}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          "inline-flex items-center gap-1 rounded transition-colors duration-(--duration-quick)",
          active ? "text-foreground" : "hover:text-foreground"
        )}
      >
        {children}
        <span aria-hidden="true" className={cn("text-[0.625rem]", active ? "" : "opacity-0")}>
          {direction === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </TableHead>
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  TableSortHeader,
}
