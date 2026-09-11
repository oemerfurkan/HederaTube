import { Link } from "react-router";
import { Amount } from "@/design/ui";
import { useVideos } from "@/api/hooks";
import { formatClock } from "@/lib/price";
import { rememberFlipSource } from "@/features/motion/flip";

/** Honest title: everything is listed, there is no recommendation algorithm. */
export function MoreVideosRail({ currentId }: { currentId: string }) {
  const videos = useVideos();
  const rows = (videos.data ?? []).filter(v => v.id !== currentId);
  return (
    <aside className="grid content-start gap-3">
      <h2 className="text-h2">More videos</h2>
      {rows.map(video => (
        <Link
          key={video.id}
          to={`/watch/${video.id}`}
          onClick={() => rememberFlipSource(video.id)}
          className="flex gap-3 rounded-md p-1.5 transition-colors duration-[180ms] ease-ht hover:bg-surface-2"
        >
          <div className="relative w-[168px] shrink-0 overflow-hidden rounded-md bg-surface-2" data-flip-id={`player-${video.id}`}>
            <img src={video.thumbnail_url} alt="" className="aspect-video size-full object-cover" loading="lazy" />
            <span className="absolute bottom-1.5 right-1.5 rounded-sm bg-black/80 px-1.5 py-0.5 text-[11px] font-medium tabular text-white">
              {formatClock(video.duration_seconds)}
            </span>
            <span data-flip-id={`price-${video.id}`} className="absolute bottom-1.5 left-1.5 rounded-pill bg-chain px-2 py-0.5 text-[11px] font-medium text-chain-on">
              <Amount value={video.total_price} />
            </span>
          </div>
          <div className="min-w-0">
            <div className="line-clamp-2 text-[14px] font-medium leading-[1.3]">{video.title}</div>
            <div className="text-small text-muted-fg">{video.creator.display_name}</div>
            <div className="text-small tabular text-muted-fg">{video.views.toLocaleString()} views</div>
          </div>
        </Link>
      ))}
    </aside>
  );
}
