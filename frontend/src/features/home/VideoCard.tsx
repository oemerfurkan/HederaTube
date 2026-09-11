import { Link } from "react-router";
import { AddressAvatar, Amount } from "@/design/ui";
import type { Video } from "@/api/types";
import { formatClock } from "@/lib/price";
import { rememberFlipSource } from "@/features/motion/flip";

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
      onClick={() => rememberFlipSource(video.id)}
      className="group grid gap-3 rounded-card bg-surface p-2 transition-colors duration-[180ms] ease-ht hover:bg-surface-2"
    >
      <div className="relative aspect-video overflow-hidden rounded-md bg-surface-2" data-flip-id={`player-${video.id}`}>
        <img src={video.thumbnail_url} alt="" className="size-full object-cover" loading="lazy" />
        <span className="absolute bottom-2 right-2 rounded-sm bg-black/80 px-[7px] py-[3px] text-[12px] font-medium tabular text-white">
          {formatClock(video.duration_seconds)}
        </span>
        <span
          data-flip-id={`price-${video.id}`}
          className="absolute bottom-2 left-2 inline-flex h-[22px] items-center rounded-pill bg-chain px-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-chain-on"
        >
          <Amount value={video.total_price} />
        </span>
        {video.status === "processing" ? (
          <span className="absolute left-2 top-2 rounded-pill bg-pending/15 px-2.5 py-1 text-[11px] font-medium text-pending">Processing</span>
        ) : null}
      </div>
      <div className="flex gap-3 px-1 pb-1">
        <span data-flip-id={`avatar-${video.id}`} className="shrink-0">
          <AddressAvatar address={video.creator.hedera_account_id} size={36} />
        </span>
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-h2">{video.title}</h3>
          <div className="text-small text-muted-fg">{video.creator.display_name}</div>
          <div className="text-small tabular text-muted-fg">
            {video.views.toLocaleString()} views · {relativeDate(video.created_at)}
          </div>
        </div>
      </div>
    </Link>
  );
}
