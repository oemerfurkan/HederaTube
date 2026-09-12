import { Link } from "react-router";
import { Amount, Avatar } from "@/design/ui";
import { hoverTint } from "@/design/hoverTint";
import type { Video } from "@/api/types";
import { formatClock } from "@/lib/price";

function relativeDate(iso: string): string {
  const days = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}

/** Guide §6.3. The price badge is the one thing that separates this from YouTube at a glance. */
export function VideoCard({ video }: { video: Video }) {
  return (
    <Link
      to={`/watch/${video.id}`}
      className="group relative grid gap-3"
    >
      {/* hover panel: a palette-tinted wash that grows out from behind the card */}
      <span
        className="pointer-events-none absolute -inset-2 scale-95 rounded-card opacity-0 transition-all duration-[280ms] ease-ht group-hover:scale-100 group-hover:opacity-100"
        style={{ background: hoverTint(video.id) }}
      />
      <div className="relative aspect-video overflow-hidden rounded-md bg-surface-2 ring-1 ring-inset ring-white/[0.06]">
        <img src={video.thumbnail_url} alt="" className="size-full object-cover" loading="lazy" />
        <span className="absolute bottom-2 right-2 rounded-sm bg-black/80 px-[7px] py-[3px] text-[12px] font-medium tabular text-white">
          {formatClock(video.duration_seconds)}
        </span>
        <span className="absolute left-2 top-2 inline-flex h-[22px] items-center rounded-pill bg-chain/35 px-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-white backdrop-blur-sm">
          <Amount value={video.total_price} />
        </span>
        {video.status === "processing" ? (
          <span className="absolute right-2 top-2 rounded-pill bg-black/60 px-2.5 py-1 text-[11px] font-medium text-pending backdrop-blur-sm">Processing</span>
        ) : null}
      </div>
      <div className="relative flex gap-3">
        <Avatar size={36} />
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-[16px] font-medium leading-[22px]">{video.title}</h3>
          <div className="mt-1 text-[14px] leading-5 text-muted-fg">{video.creator.display_name}</div>
          <div className="text-[14px] leading-5 tabular text-muted-fg">
            {video.views.toLocaleString()} views · {relativeDate(video.created_at)}
          </div>
        </div>
      </div>
    </Link>
  );
}
