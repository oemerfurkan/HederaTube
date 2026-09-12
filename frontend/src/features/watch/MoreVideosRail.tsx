import { Link } from "react-router";
import { Amount } from "@/design/ui";
import { hoverTint } from "@/design/hoverTint";
import { useVideos } from "@/api/hooks";
import { formatClock } from "@/lib/price";

/** Honest title: everything is listed, there is no recommendation algorithm. */
export function MoreVideosRail({ currentId }: { currentId: string }) {
  const videos = useVideos();
  const rows = (videos.data ?? []).filter(v => v.id !== currentId);
  return (
    <aside className="grid content-start gap-2">
      <h2 className="mb-1 text-[16px] font-medium leading-[22px]">More videos</h2>
      {rows.map(video => (
        <Link
          key={video.id}
          to={`/watch/${video.id}`}
          className="group relative flex gap-2"
        >
          <span
            className="pointer-events-none absolute -inset-2 scale-95 rounded-md opacity-0 transition-all duration-[280ms] ease-ht group-hover:scale-100 group-hover:opacity-100"
            style={{ background: hoverTint(video.id) }}
          />
          <div className="relative aspect-video w-[62%] shrink-0 overflow-hidden rounded-sm bg-surface-2 ring-1 ring-inset ring-white/[0.06]">
            <img src={video.thumbnail_url} alt="" className="size-full object-cover" loading="lazy" />
            <span className="absolute bottom-1.5 right-1.5 rounded-sm bg-black/80 px-1.5 py-0.5 text-[12px] font-medium leading-[18px] tabular text-white">
              {formatClock(video.duration_seconds)}
            </span>
            <span className="absolute left-1.5 top-1.5 rounded-pill bg-chain/35 px-2 py-0.5 text-[12px] font-medium leading-[18px] text-white backdrop-blur-sm">
              <Amount value={video.total_price} />
            </span>
          </div>
          <div className="relative min-w-0">
            <div className="line-clamp-2 text-[14px] font-medium leading-5">{video.title}</div>
            <div className="mt-1 text-[12px] leading-[18px] text-muted-fg">{video.creator.display_name}</div>
            <div className="text-[12px] leading-[18px] tabular text-muted-fg">{video.views.toLocaleString()} views</div>
          </div>
        </Link>
      ))}
    </aside>
  );
}
