import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

/**
 * Button atom.
 *
 * `default` is espresso ink rather than a saturated hue: the four status hues stay the only
 * chromatic colour in the product, so a filled button can never be mistaken for a status. Clay is
 * reserved for `link`, focus rings and active navigation.
 *
 * Heights are 36px by default so the control row is comfortable on a phone without the desktop
 * chrome feeling oversized; `sm` (32px) is for dense rows inside a panel.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-(--duration-quick) ease-(--ease-soft) outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-surface hover:bg-primary-hover",
        outline:
          "border-border-strong bg-card text-foreground shadow-surface hover:border-input hover:bg-muted aria-expanded:border-input aria-expanded:bg-muted",
        secondary:
          "bg-muted text-foreground hover:bg-accent aria-expanded:bg-accent",
        ghost:
          "text-foreground-soft hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "tone-danger border shadow-surface hover:brightness-[0.97] focus-visible:border-destructive focus-visible:ring-destructive/25",
        link: "text-clay-text underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-md px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 text-[0.8125rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-4 text-[0.9375rem] has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5",
        icon: "size-9",
        "icon-xs":
          "size-7 rounded-md in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8 rounded-md in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
