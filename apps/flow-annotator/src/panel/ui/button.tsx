import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../lib/utils";

const solidFocusRing =
  "focus-visible:inset-ring-2 focus-visible:inset-ring-white-1000 focus-visible:border-blue-500";

const buttonVariants = cva(
  "typography-body-medium inline-flex shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-md outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    defaultVariants: {
      size: "default",
      variant: "primary",
    },
    variants: {
      size: {
        default: "h-6 px-2",
        large: "h-8 px-3",
        icon: "size-6",
      },
      variant: {
        ghost:
          "border-none text-black-800 hover:bg-black-200 focus-visible:inset-ring focus-visible:inset-ring-blue-500 active:bg-black-1000/15",
        primary: cn(
          "bg-blue-500 text-white-1000 active:bg-blue-600 disabled:bg-grey-500",
          solidFocusRing,
        ),
        secondary:
          "border border-grey-200 text-black-800 focus-visible:inset-ring focus-visible:inset-ring-blue-500 active:border-grey-300 active:bg-grey-100 disabled:border-grey-300 disabled:text-grey-500",
        success: cn(
          "bg-green-500 text-white-1000 active:bg-green-600 disabled:bg-grey-500",
          solidFocusRing,
        ),
      },
    },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size, type = "button", variant, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ className, size, variant }))}
      ref={ref}
      type={type}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
