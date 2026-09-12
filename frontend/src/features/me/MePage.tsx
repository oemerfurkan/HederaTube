import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Amount, Avatar, Badge, Button, UsdcMark, cn, toast } from "@/design/ui";
import { useEarnings, useMe, useUpdateAvatar, useUpdateProfile } from "@/api/hooks";
import { useWallet } from "@/features/wallet/WalletProvider";
import { WalletPanel } from "@/features/wallet/WalletPanel";
import { ActiveLocks } from "@/features/wallet/ActiveLocks";
import { useReceipts } from "@/payments/receipts";
import { formatUsdc } from "@/lib/money";

const TABS = ["Watch", "Wallet", "Earnings", "Profile"] as const;

export function MePage() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Watch");
  if (wallet.status !== "ready") {
    return (
      <div className="grid justify-items-center gap-3 rounded-card border border-dashed border-border px-6 py-12 text-center">
        <div className="text-h2">Connect a wallet to see your channel</div>
        <Button variant="chain" onClick={wallet.openSheet}>
          Connect wallet
        </Button>
      </div>
    );
  }
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-h1">My channel</h1>
        <div className="inline-flex gap-1 rounded-pill bg-surface-2 p-1">
          {TABS.map(t => (
            <button key={t} type="button" onClick={() => setTab(t)} className={cn("h-[34px] rounded-pill px-[18px] text-[14px] font-medium", tab === t ? "bg-surface text-fg shadow-1" : "text-muted-fg")}>
              {t}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Button variant="secondary" onClick={() => navigate("/upload")}>
            Upload
          </Button>
        </div>
      </div>
      {tab === "Watch" ? <WatchTab /> : null}
      {tab === "Wallet" ? (
        <div className="grid max-w-[480px] gap-6">
          <WalletPanel showChannelLink={false} showDisconnect={false} />
          <ActiveLocks />
          <div className="border-t border-border pt-4">
            <Button variant="outline" onClick={() => void wallet.logout()}>
              Disconnect wallet
            </Button>
          </div>
        </div>
      ) : null}
      {tab === "Earnings" ? <EarningsTab /> : null}
      {tab === "Profile" ? <ProfileTab /> : null}
    </div>
  );
}

function WatchTab() {
  const { receipts } = useReceipts();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="grid gap-3">
        <h2 className="label-caps text-muted-fg">This session</h2>
        {receipts.length === 0 ? (
          <p className="text-small text-muted-fg">
            Nothing watched yet. <Link to="/" className="text-chain-fg underline">Pick a video.</Link>
          </p>
        ) : (
          receipts.map(r => (
            <div key={r.sessionId} className="flex items-center gap-3 rounded-md bg-surface-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">{r.videoTitle}</div>
                <div className="flex items-center gap-1 text-small tabular text-muted-fg">
                  paid {formatUsdc(r.watched)} <UsdcMark size={12} /> · refunded {formatUsdc(r.refunded)} <UsdcMark size={12} />
                </div>
              </div>
              <Badge tone={r.phase === "settled" ? "settled" : "pending"}>{r.phase === "settled" ? "Settled" : "Settling"}</Badge>
            </div>
          ))
        )}
      </section>
      <ActiveLocks />
    </div>
  );
}

function EarningsTab() {
  const wallet = useWallet();
  const earnings = useEarnings(wallet.address);
  const data = earnings.data;
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Summary label="Total earned">
          <Amount value={data?.total_earned ?? 0n} className="text-chain-fg" />
        </Summary>
        <Summary label="Chunks served">
          <span className="tabular">{(data?.chunks_served ?? 0).toLocaleString()}</span>
        </Summary>
        <Summary label="Unique viewers">
          <span className="tabular">{(data?.unique_viewers ?? 0).toLocaleString()}</span>
        </Summary>
      </div>
      {data && data.rows.length === 0 ? (
        <p className="text-small text-muted-fg">No videos yet. Upload your first one.</p>
      ) : (
        <ul className="grid gap-1">
          {data?.rows.map(row => (
            <li key={row.video_id} className={cn("flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-surface-2", row.status === "payout pending" && "opacity-60")}>
              <img src={row.thumbnail_url} alt="" className="h-[34px] w-14 rounded-sm object-cover" />
              <div className="min-w-0 flex-1">
                <Link to={`/watch/${row.video_id}`} className="block truncate text-[14px] font-medium">
                  {row.title}
                </Link>
                <div className="text-[12px] tabular text-muted-fg">{row.chunks_served.toLocaleString()} chunks served</div>
              </div>
              <span className={cn("inline-flex items-center gap-1 text-[14px] font-medium tabular", row.status === "settled" ? "text-positive" : "text-muted-fg")}>
                +{formatUsdc(row.earned)} <UsdcMark size={12} />
              </span>
              {row.status === "settled" ? (
                <Badge tone="settled">Settled</Badge>
              ) : row.status === "processing" ? (
                <Badge tone="pending">Processing</Badge>
              ) : (
                <Badge tone="pending">
                  payout pending · +{formatUsdc(row.pending)} <UsdcMark size={11} />
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const field =
  "w-full rounded-pill border border-input bg-bg px-[18px] text-body outline-none transition-all duration-[180ms] ease-ht focus:border-primary focus:ring-[3px] focus:ring-ring";

/** Channel name and description: what viewers see on cards, on the watch page and on the channel page. */
function ProfileTab() {
  const wallet = useWallet();
  const me = useMe(wallet.address);
  const save = useUpdateProfile();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [seeded, setSeeded] = useState(false);

  // fill the form once from the server; after that the draft is the user's
  useEffect(() => {
    if (seeded || !me.data) return;
    setName(me.data.creator?.display_name ?? "");
    setDescription(me.data.creator?.description ?? "");
    setSeeded(true);
  }, [me.data, seeded]);

  const dirty = !!me.data && (name !== (me.data.creator?.display_name ?? "") || description !== (me.data.creator?.description ?? ""));
  const submit = async () => {
    if (!wallet.address || !name.trim()) return;
    try {
      await save.mutateAsync({ address: wallet.address, accountId: wallet.accountId, displayName: name.trim(), description: description.trim() });
      toast("Profile saved");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save the profile");
    }
  };

  return (
    <div className="grid max-w-[560px] gap-5">
      <AvatarField />
      <label className="grid gap-2 text-[13px] font-medium">
        Channel name
        <input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="Your channel" className={cn(field, "h-11")} />
      </label>
      <label className="grid gap-2 text-[13px] font-medium">
        Description
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={5}
          maxLength={1000}
          placeholder="What people will find on this channel"
          className="w-full resize-y rounded-md border border-input bg-bg px-4 py-3 text-body font-normal leading-[1.5] outline-none focus:border-primary focus:ring-[3px] focus:ring-ring"
        />
        <span className="text-[12px] font-normal text-muted-fg">Shown on your channel page. The name is what appears under every video.</span>
      </label>
      {me.data?.creator ? (
        <div className="text-[12px] text-muted-fg">
          Handle <span className="font-mono text-fg">@{me.data.creator.handle}</span> · payouts to <span className="font-mono text-fg">{me.data.creator.hedera_account_id}</span>
        </div>
      ) : null}
      <div className="flex justify-end">
        <Button variant="chain" onClick={submit} disabled={!dirty || !name.trim()} loading={save.isPending}>
          Save
        </Button>
      </div>
    </div>
  );
}

const AVATAR_PX = 256;

/** Center-crops to a square and downsizes to 256 px JPEG, so any photo becomes a small upload. */
async function toAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_PX;
  canvas.height = AVATAR_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.88);
}

/** Channel photo: shown on every video card, on the watch page, the channel page and the header. */
function AvatarField() {
  const wallet = useWallet();
  const me = useMe(wallet.address);
  const save = useUpdateAvatar();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>();
  const current = preview ?? me.data?.creator?.avatar_url;

  const pick = async (file: File) => {
    if (!wallet.address) return;
    if (!file.type.startsWith("image/")) return toast("Pick an image file");
    try {
      const image = await toAvatarDataUrl(file);
      setPreview(image);
      await save.mutateAsync({ address: wallet.address, accountId: wallet.accountId, image });
      toast("Photo updated");
    } catch (error) {
      setPreview(undefined);
      toast(error instanceof Error ? error.message : "Could not update the photo");
    }
  };

  const remove = async () => {
    if (!wallet.address) return;
    try {
      await save.mutateAsync({ address: wallet.address, accountId: wallet.accountId, image: null });
      setPreview(undefined);
      toast("Photo removed");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not remove the photo");
    }
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label="Change channel photo"
        className="group relative shrink-0 rounded-pill"
      >
        <Avatar size={88} src={current} />
        <span className="absolute inset-0 grid place-items-center rounded-pill bg-black/55 text-[12px] font-medium text-white opacity-0 transition-opacity duration-[180ms] ease-ht group-hover:opacity-100">
          Change
        </span>
      </button>
      <div className="grid gap-2">
        <span className="text-[13px] font-medium">Channel photo</span>
        <span className="text-[12px] leading-[18px] text-muted-fg">Square crop, shown next to your name everywhere.</span>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => input.current?.click()} loading={save.isPending}>
            {current ? "Change photo" : "Upload photo"}
          </Button>
          {current ? (
            <Button variant="ghost" size="sm" onClick={() => void remove()} disabled={save.isPending}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void pick(file);
        }}
      />
    </div>
  );
}

function Summary({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 rounded-card border border-border bg-surface p-6">
      <span className="label-caps text-muted-fg">{label}</span>
      <span className="text-numeric">{children}</span>
    </div>
  );
}
