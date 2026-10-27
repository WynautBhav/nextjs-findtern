import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button.
 *
 * Replaces two unrelated systems in the legacy build: Bootstrap's `.btn`,
 * `.btn-primary`, `.btn-outline`, `.btn-light`, `.btn-lg` (which the site
 * loaded wholesale, ~230 KB of CSS, for a handful of components) and a second
 * set of App.css classes that happened to share the names `btn-primary` and
 * `btn-outline` but styled them differently. Same name, two definitions.
 *
 * One set of variants now, and no Bootstrap anywhere in the project.
 */
const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-medium leading-none transition-[background-color,color,box-shadow,transform,border-color] duration-200",
    "ease-ease-out-expo select-none",
    "disabled:pointer-events-none disabled:opacity-55",
    // Press feedback: scale, not a 1px translate. A single pixel is below
    // the threshold where a press registers at all.
    "active:scale-[0.97]",
    "transition-[background-color,color,box-shadow,transform,border-color] duration-150",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-white shadow-sm hover:bg-primary-hover hover:shadow-md",
        accent:
          "bg-accent text-brand-950 shadow-sm hover:bg-accent-600 hover:text-white hover:shadow-md",
        outline:
          "border border-brand-200 bg-white/70 text-primary backdrop-blur-sm hover:border-brand-400 hover:bg-brand-50 hover:shadow-sm",
        outlineLight:
          "border border-white/25 bg-white/5 text-white backdrop-blur-sm hover:border-white/50 hover:bg-white/10",
        ghost: "text-primary hover:bg-brand-50",
        dark: "bg-brand-950 text-white shadow-sm hover:bg-brand-900 hover:shadow-md",
        white:
          "bg-white text-brand-950 shadow-sm hover:bg-brand-50 hover:shadow-md",
        light:
          "bg-ink-100 text-ink-900 hover:bg-ink-200",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 rounded-md px-3.5 text-sm",
        md: "h-11 rounded-lg px-5 text-base",
        lg: "h-13 rounded-xl px-7 text-base",
        icon: "size-10 rounded-lg",
        iconSm: "size-9 rounded-md",
      },
      block: {
        true: "w-full",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonVariants = VariantProps<typeof buttonVariants>;

type ButtonStyleProps = ButtonVariants & {
  className?: string;
  children?: React.ReactNode;
};

/** Applies the variant classes and strips the variant props from the DOM. */
function buttonClass({
  variant,
  size,
  block,
  className,
}: ButtonVariants & { className?: string }) {
  return cn(buttonVariants({ variant, size, block }), className);
}

export function Button({
  className,
  variant,
  size,
  block,
  children,
  ...rest
}: ButtonStyleProps & Omit<React.ComponentProps<"span">, "ref">) {
  return (
    <span className={buttonClass({ variant, size, block, className })} {...rest}>
      {children}
    </span>
  );
}

export function ButtonLink({
  className,
  variant,
  size,
  block,
  children,
  ...rest
}: ButtonStyleProps & React.ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClass({ variant, size, block, className })} {...rest}>
      {children}
    </Link>
  );
}

export function ButtonAnchor({
  className,
  variant,
  size,
  block,
  children,
  ...rest
}: ButtonStyleProps & React.ComponentProps<"a">) {
  return (
    <a className={buttonClass({ variant, size, block, className })} {...rest}>
      {children}
    </a>
  );
}

export { buttonClass, buttonVariants };
