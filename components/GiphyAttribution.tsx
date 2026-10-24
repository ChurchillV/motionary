/** Required wherever GIPHY content appears. */
export function GiphyAttribution({ className = "" }: { className?: string }) {
  return (
    <span className={`pointer-events-none text-[10px] tracking-[.02em] text-ink-3 ${className}`}>Powered by GIPHY</span>
  );
}
