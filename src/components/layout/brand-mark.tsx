import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  showWord = true,
}: {
  className?: string;
  showWord?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-foreground"
        aria-hidden
      >
        <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" stroke="currentColor" />
        <circle cx="11.5" cy="20.5" r="3" fill="currentColor" />
        <circle cx="20.5" cy="11.5" r="3" stroke="currentColor" strokeWidth="1.5" />
        <line
          x1="11.5"
          y1="20.5"
          x2="20.5"
          y2="11.5"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeDasharray="2 2"
        />
      </svg>
      {showWord && (
        <span className="font-serif text-[15px] tracking-editorial leading-none">
          MGSIS<span className="italic text-muted-foreground">·</span>Analytics
        </span>
      )}
    </div>
  );
}
