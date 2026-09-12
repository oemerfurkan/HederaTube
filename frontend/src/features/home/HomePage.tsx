import { useSearchParams } from "react-router";
import { useVideos } from "@/api/hooks";
import { VideoGrid } from "./VideoGrid";

export function HomePage() {
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").toLowerCase();
  const videos = useVideos();
  const rows = (videos.data ?? []).filter(v => !q || v.title.toLowerCase().includes(q) || v.creator.display_name.toLowerCase().includes(q));
  return (
    <div className="grid gap-6">
      {videos.isLoading ? (
        <div className="text-small text-muted-fg">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="grid justify-items-center gap-2 rounded-card border border-dashed border-border px-6 py-12 text-center">
          <div className="text-h2">Nothing here yet</div>
          <div className="text-small text-muted-fg">{q ? "No video matches that search." : "No videos have been published yet."}</div>
        </div>
      ) : (
        <VideoGrid videos={rows} flipKey={q} />
      )}
    </div>
  );
}
