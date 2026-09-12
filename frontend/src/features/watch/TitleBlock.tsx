import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Heart, ShareNetwork } from "@phosphor-icons/react";
import { Amount, Avatar, RollingNumber, cn, toast } from "@/design/ui";
import type { Video } from "@/api/types";
import { api } from "@/api/client";
import { useLikeState } from "@/api/hooks";
import { useWallet } from "@/features/wallet/WalletProvider";

/** H1 title, the channel it belongs to, like and share, and what the whole video costs to watch. */
export function TitleBlock({ video }: { video: Video }) {
  const wallet = useWallet();
  // the server owns the truth; local state only covers the moment between the click and the reply
  const known = useLikeState(video.id, wallet.address);
  const [pending, setPending] = useState<{ count: number; liked: boolean } | null>(null);
  useEffect(() => setPending(null), [wallet.address, video.id]);
  const likes = pending ?? { count: known.data?.likes ?? video.likes, liked: known.data?.liked ?? false };

  const like = async () => {
    if (!wallet.address) return wallet.openSheet();
    setPending({ count: likes.count + (likes.liked ? -1 : 1), liked: !likes.liked });
    const res = await api.like(video.id, wallet.address);
    setPending({ count: res.likes, liked: res.liked });
  };

  const share = async () => {
    await navigator.clipboard.writeText(window.location.href).catch(() => undefined);
    toast("Link copied");
  };

  return (
    <div className="grid gap-3 pt-1">
      <h1 className="text-[20px] font-bold leading-7">{video.title}</h1>
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/channel/${video.creator.handle}`} className="flex items-center gap-3">
          <Avatar size={40} src={video.creator.avatar_url} />
          <span className="text-[16px] font-medium leading-[22px]">{video.creator.display_name}</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={like}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-pill bg-surface-2 px-4 text-[14px] font-medium transition-colors duration-[180ms] ease-ht hover:bg-surface-3",
              likes.liked && "text-primary",
            )}
          >
            {/* the glyph fills with a pop; the number rolls in the direction it moved */}
            <Heart key={String(likes.liked)} size={16} weight={likes.liked ? "fill" : "regular"} className={cn(likes.liked && "animate-like-pop")} />
            <RollingNumber value={likes.count} />
          </button>
          <button
            type="button"
            onClick={share}
            className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-surface-2 px-4 text-[14px] font-medium transition-colors duration-[180ms] ease-ht hover:bg-surface-3"
          >
            <ShareNetwork size={16} />
            Share
          </button>
          <span className="inline-flex h-9 items-center rounded-pill bg-chain-soft px-4 text-[14px] font-medium text-chain-fg">
            <Amount value={BigInt(video.total_price)} />
          </span>
        </div>
      </div>
    </div>
  );
}
