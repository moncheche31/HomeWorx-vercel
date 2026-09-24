import logo from "@/assets/visionworx360-logo.png.asset.json";
import homeworxLogo from "@/assets/homeworx360-logo.png.asset.json";
import { cn } from "@/lib/utils";

interface BrandMarkProps {
  variant?: "full" | "compact";
  ecosystem?: "visionworx" | "homeworx";
  className?: string;
}

/**
 * Full marketing logo. Do not distort — always constrained by width/aspect.
 * Use sparingly (splash, landing, design system brand section).
 */
export function BrandMark({
  variant = "full",
  ecosystem = "visionworx",
  className,
}: BrandMarkProps) {
  const src = ecosystem === "homeworx" ? homeworxLogo.url : logo.url;
  const alt =
    ecosystem === "homeworx"
      ? "HomeWorx360 — Complete Home Services"
      : "VisionWorx360 — Design, Estimate, Transform";

  if (variant === "compact") {
    return <CompactBrand ecosystem={ecosystem} className={className} />;
  }

  return (
    <img src={src} alt={alt} className={cn("h-auto w-full max-w-md object-contain", className)} />
  );
}

/**
 * Compact wordmark for in-app headers. Text-based to preserve legibility
 * at small sizes; the uploaded raster logo is not suited for tight chrome.
 * TODO: replace with an approved SVG mark when available.
 */
export function CompactBrand({
  ecosystem = "visionworx",
  className,
}: {
  ecosystem?: "visionworx" | "homeworx";
  className?: string;
}) {
  const name = ecosystem === "homeworx" ? "HomeWorx" : "VisionWorx";
  const accentClass = ecosystem === "homeworx" ? "text-[color:var(--brand-green)]" : "text-accent";
  return (
    <span
      className={cn(
        /* ~20% larger than the previous inherited 1rem, without growing chrome height. */
        "inline-flex items-baseline gap-1 text-[1.2rem] leading-none font-semibold tracking-tight text-primary",
        className,
      )}
      aria-label={`${name}360 Pro`}
    >
      <span>{name}</span>
      <span className={cn("font-bold", accentClass)}>360</span>
      <span className="ml-1 rounded-sm border border-border bg-surface-muted px-1.5 py-0.5 text-[12px] font-medium uppercase tracking-wider text-foreground-muted">
        Pro
      </span>
    </span>
  );
}
