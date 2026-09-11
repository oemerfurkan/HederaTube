import { useState } from "react";
import { Link } from "react-router";
import { Heart, ShareNetwork } from "@phosphor-icons/react";
import { AddressAvatar, Amount, Button, cn } from "@/design/ui";
import type { Video } from "@/api/types";
import { perMinute } from "@/lib/price";
import { api } from "@/api/client";
import { useWallet } from "@/features/wallet/WalletProvider";

/** H1 title; channel row with outline Subscribe (play owns the red); like/share pills; per-minute badge. */
export function TitleBlock({ video }: { video: Video }) {
  const wallet = useWallet();
  const [likes, setLikes] = useState<{ count: number; liked: boolean }>({ count: video.likes, liked: false });
  const [subscribed, setSubscribed] = useState(false);
  const [copied, setCopied] = useState(false);
  const like = async () => {
    if (!wallet.address) return wallet.openSheet();
    const res = await api.like(video.id, wallet.address);
    setLikes({ count: res.likes, liked: res.liked });
  };
  const share = async () => {
    await navigator.clipboard.writeText(window.location.href).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="grid gap-3">
      <h1 className="text-h1">{video.title}</h1>
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/channel/${video.creator.handle}`} className="flex items-center gap-3" data-flip-id={`avatar-${video.id}`}>
          <AddressAvatar address={video.creator.hedera_account_id} size={40} />
          <span>
            <span className="block text-[15px] font-medium">{video.creator.display_name}</span>
            <span className="block text-small tabular text-muted-fg">{video.creator.subscribers.toLocaleString()} subscribers</span>
          </span>
        </Link>
        <Button variant="outline" size="sm" onClick={() => setSubscribed(v => !v)}>
          {subscribed ? "Subscribed" : "Subscribe"}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={like}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-pill bg-surface-2 px-3.5 text-[13px] tabular", likes.liked && "text-primary")}
          >
            <Heart size={16} weight={likes.liked ? "fill" : "regular"} />
            {likes.count.toLocaleString()}
          </button>
          <button type="button" onClick={share} className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-surface-2 px-3.5 text-[13px]">
            <ShareNetwork size={16} />
            {copied ? "Copied" : "Share"}
          </button>
          <span className="inline-flex h-8 items-center rounded-pill bg-chain-soft px-3.5 text-[13px] font-medium text-chain-fg">
            <Amount value={perMinute(BigInt(video.total_price), video.duration_seconds)} /> / min
          </span>
        </div>
      </div>
    </div>
  );
}
