import { useState } from "react";
import { cn } from "@/design/ui";
import type { Video } from "@/api/types";

export function DescriptionCard({ video }: { video: Video }) {
  const [open, setOpen] = useState(false);
  return (
    <button type="button" onClick={() => setOpen(v => !v)} className="grid w-full gap-1.5 rounded-md bg-surface-2 p-4 text-left">
      <div className="text-small tabular text-muted-fg">
        {video.views.toLocaleString()} views · {new Date(video.created_at).toLocaleDateString()}
      </div>
      <p className={cn("text-body", !open && "line-clamp-2")}>{video.description}</p>
      <span className="text-small font-medium text-muted-fg">{open ? "Show less" : "…more"}</span>
    </button>
  );
}
