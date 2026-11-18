import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-ink-100 dark:bg-ink-200",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
