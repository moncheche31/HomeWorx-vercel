import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FloatingActionButton({
  onClick,
  label,
  className,
}: {
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      aria-label={label}
      size="lg"
      className={cn(
        "safe-bottom fixed bottom-20 right-4 z-40 size-14 rounded-full p-0 shadow-lg md:bottom-8 md:right-8 md:size-14",
        className,
      )}
    >
      <Plus className="size-6" aria-hidden />
    </Button>
  );
}
