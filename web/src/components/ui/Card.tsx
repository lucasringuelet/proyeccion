import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-slate-200 bg-white shadow-card",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

export const CardHeader = ({
  className,
  ...p
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "px-4 py-3 sm:px-5 sm:py-4 border-b border-slate-100",
      className,
    )}
    {...p}
  />
);

export const CardTitle = ({
  className,
  ...p
}: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3
    className={cn("font-semibold text-slate-900 text-base", className)}
    {...p}
  />
);

export const CardDescription = ({
  className,
  ...p
}: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn("text-sm text-slate-500 mt-0.5", className)} {...p} />
);

export const CardBody = ({
  className,
  ...p
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("px-4 py-3 sm:px-5 sm:py-4", className)} {...p} />
);

export const CardFooter = ({
  className,
  ...p
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "px-4 py-3 sm:px-5 border-t border-slate-100 bg-slate-50/50",
      className,
    )}
    {...p}
  />
);
