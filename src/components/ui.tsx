import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  secondary: "border border-border bg-bg-elev-2/50 text-foreground hover:border-border-bright",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-bg-elev-2/50",
  danger: "border border-destructive/40 text-destructive hover:bg-destructive/10",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
}

export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        variants[variant],
        className,
      )}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-lg border border-border bg-bg-elev-1/50", className)}>
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="mt-1.5 block">{children}</span>
      {hint && <span className="mt-1.5 block text-[11px] text-muted-foreground-2">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full h-10 rounded-md border border-border bg-bg-elev-2/50 px-3 text-sm focus:outline-none focus:border-primary/60 transition";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Avatar({
  name,
  src,
  size = 36,
}: {
  name: string;
  src?: string;
  size?: number;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (src && failedSrc !== src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        onError={() => setFailedSrc(src)}
        className="shrink-0 rounded-full border border-border object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary-dim text-[10px] font-bold text-primary"
      style={{ width: size, height: size }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "brand";
}) {
  const tones = {
    neutral: "border-border bg-bg-elev-2/50 text-muted-foreground",
    good: "border-[var(--green)]/30 bg-[var(--green)]/10 text-[var(--green)]",
    warn: "border-[var(--yellow)]/30 bg-[var(--yellow)]/10 text-[var(--yellow)]",
    brand: "border-primary/30 bg-primary-dim text-primary",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-mono uppercase tracking-wider",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-serif italic md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-5 py-8 text-sm text-muted-foreground">{children}</div>;
}

export function CopyButton({
  value,
  label = "Copy",
  title,
  className,
}: {
  value: string;
  label?: string;
  title?: string;
  className?: string;
}) {
  const accessibleName = title ?? label ?? "Copy";
  return (
    <Button
      variant="ghost"
      className={cn("h-8 px-2 text-xs", className)}
      title={accessibleName}
      aria-label={accessibleName}
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        toast.success("Copied");
      }}
    >
      <Copy className="h-3.5 w-3.5" />
      {label && <span>{label}</span>}
    </Button>
  );
}
