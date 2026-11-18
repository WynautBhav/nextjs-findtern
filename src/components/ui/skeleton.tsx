import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-ink-200/70 [animation-duration:1.6s]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
