import { useState } from "react";
import { useSearchParams } from "react-router";
import { useVideos } from "@/api/hooks";
import { FilterChips, type FilterId } from "./FilterChips";
import { VideoGrid } from "./VideoGrid";

export function HomePage() {
  const [filter, setFilter] = useState<FilterId>("all");
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").toLowerCase();
  const videos = useVideos(filter === "free" || filter === "live" ? filter : undefined);
  const rows = (videos.data ?? []).filter(v => !q || v.title.toLowerCase().includes(q) || v.creator.display_name.toLowerCase().includes(q));
  return (
    <div className="grid gap-5">
      <FilterChips value={filter} onChange={setFilter} />
      {videos.isLoading ? (
        <div className="text-small text-muted-fg">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="grid justify-items-center gap-2 rounded-card border border-dashed border-border px-6 py-12 text-center">
          <div className="text-h2">Nothing here yet</div>
          <div className="text-small text-muted-fg">{filter === "live" ? "Live is on the roadmap; no streams in this build." : "Try another filter."}</div>
        </div>
      ) : (
        <VideoGrid videos={rows} flipKey={`${filter}:${q}`} />
      )}
    </div>
  );
}
