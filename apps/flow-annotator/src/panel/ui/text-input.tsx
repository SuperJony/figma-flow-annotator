import { Input as BaseInput } from "@base-ui/react/input";
import * as React from "react";
import { cn } from "../lib/utils";

interface InputRootProps extends React.HTMLAttributes<HTMLDivElement> {
  multiline?: boolean;
}

function InputRoot({ className, multiline = false, ...props }: InputRootProps) {
  return (
    <div
      className={cn(
        "typography-body-medium rounded-md border border-grey-300 bg-white-1000 text-black-1000 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15",
        multiline ? "min-h-14" : "h-6",
        className,
      )}
      {...props}
    />
  );
}

type TextInputProps = Omit<React.ComponentProps<typeof BaseInput>, "className"> & {
  className?: string;
  iconLead?: React.ReactNode;
  iconTrail?: React.ReactNode;
};

function TextInputPrimitive({ className, iconLead, iconTrail, ...props }: TextInputProps) {
  return (
    <div className="flex h-full items-center pr-2 pl-2 has-data-[figui=input-icon-trail]:pr-0 has-data-[figui=input-icon-lead]:pl-0">
      {iconLead && (
        <div
          className="flex aspect-square size-6 select-none items-center justify-center"
          data-figui="input-icon-lead"
        >
          {iconLead}
        </div>
      )}
      <BaseInput
        className={cn("h-full w-full bg-transparent outline-none", className)}
        {...props}
      />
      {iconTrail && (
        <div
          className="flex aspect-square size-6 select-none items-center justify-center"
          data-figui="input-icon-trail"
        >
          {iconTrail}
        </div>
      )}
    </div>
  );
}

function TextInput({ className, iconLead, ...props }: TextInputProps) {
  return (
    <InputRoot className={className}>
      <TextInputPrimitive iconLead={iconLead} {...props} />
    </InputRoot>
  );
}

interface TextAreaInputProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const TextAreaInput = React.forwardRef<HTMLTextAreaElement, TextAreaInputProps>(
  ({ className, ...props }, ref) => (
    <InputRoot className={cn("max-h-40 min-h-[50px]", className)} multiline>
      <textarea
        className="h-full min-h-[48px] w-full resize-y bg-transparent px-2 py-1.5 leading-[1.35] outline-none"
        ref={ref}
        {...props}
      />
    </InputRoot>
  ),
);
TextAreaInput.displayName = "TextAreaInput";

export { InputRoot, TextAreaInput, TextInput, TextInputPrimitive };
