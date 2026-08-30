import * as React from "react"
import * as ProgressPrimitives from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitives.Root> & { indicatorClassName?: string }
>(({ className, value, indicatorClassName, ...props }, ref) => (
  <ProgressPrimitives.Root
    ref={ref}
    className={cn(
      "relative h-4 w-full overflow-hidden rounded-full bg-secondary",
      className
    )}
    {...props}
  >
    <ProgressPrimitives.Indicator
      className={cn("h-full w-full flex-1 bg-primary transition-all duration-500 ease-in-out", indicatorClassName)}
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitives.Root>
))
Progress.displayName = ProgressPrimitives.Root.displayName

export { Progress }