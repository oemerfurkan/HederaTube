import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { UploadSimple } from "@phosphor-icons/react";
import { Badge, Button, cn } from "@/design/ui";
import { useMe, useVideo } from "@/api/hooks";
import { api } from "@/api/client";
import { useWallet } from "@/features/wallet/WalletProvider";
import { formatUsdc, parseUsdc } from "@/lib/money";
import { MAX_FREE_PREVIEW_CHUNKS, chunkCount, minTotalPrice, perMinute, pricedChunkCount, suggestedTotalPrice } from "@/lib/price";
import { HEDERA_ENTITY_ID_REGEX } from "@/payments/x402-lite";

const field =
  "h-11 w-full rounded-pill border border-input bg-bg px-5 text-body outline-none transition-all duration-[180ms] ease-ht focus:border-primary focus:ring-[3px] focus:ring-ring";

/** Guide §6.8. Single column, 720 px. The price field unlocks when the transcode reports the duration. */
export function UploadPage() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const me = useMe(wallet.address);
  const [file, setFile] = useState<File>();
  const [progress, setProgress] = useState<number>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recipient, setRecipient] = useState("");
  const [priceText, setPriceText] = useState("");
  const [freeChunks, setFreeChunks] = useState(0);
  const [videoId, setVideoId] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const video = useVideo(videoId);
  const status = video.data?.status;

  useEffect(() => {
    if (!videoId || status === "ready") return;
    const t = setInterval(() => void video.refetch(), 1500);
    return () => clearInterval(t);
  }, [videoId, status, video]);

  useEffect(() => {
    if (wallet.accountId && !recipient) setRecipient(wallet.accountId);
  }, [wallet.accountId, recipient]);

  const duration = video.data?.duration_seconds;
  useEffect(() => {
    if (status === "ready" && duration && !priceText) setPriceText(formatUsdc(suggestedTotalPrice(duration)));
  }, [status, duration, priceText]);

  const derived = useMemo(() => {
    if (!duration) return undefined;
    const chunks = chunkCount(duration);
    const priced = pricedChunkCount(duration, freeChunks);
    let price: bigint | undefined;
    try {
      price = priceText ? parseUsdc(priceText) : undefined;
    } catch {
      price = undefined;
    }
    const min = minTotalPrice(priced);
    return { chunks, priced, price, min, perMin: price ? perMinute(price, duration) : undefined, tooLow: price !== undefined && price < min };
  }, [duration, freeChunks, priceText]);

  if (wallet.status !== "ready") return <p className="text-small text-muted-fg">Connect a wallet first.</p>;
  if (me.data && !me.data.verified) {
    navigate("/verify", { replace: true });
    return null;
  }

  const pick = async (f: File) => {
    setFile(f);
    setError(undefined);
    const fallbackTitle = f.name.replace(/\.[^.]+$/, "");
    const chosenTitle = title || fallbackTitle;
    if (!title) setTitle(fallbackTitle);
    try {
      const presign = await api.presign({ name: f.name, size: f.size, type: f.type }, wallet.address!);
      await putWithProgress(presign.uploadUrl, f, setProgress);
      const seconds = await readDuration(f).catch(() => 60);
      const created = await api.completeUpload({
        videoId: presign.videoId,
        key: presign.key,
        title: chosenTitle,
        description,
        recipient: recipient || wallet.accountId!,
        durationSeconds: seconds,
        address: wallet.address!,
      });
      setVideoId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const publish = async () => {
    if (!videoId || !derived?.price || derived.tooLow) return;
    setBusy(true);
    try {
      await api.publish({ videoId, totalPrice: derived.price.toString(), freePreviewChunks: freeChunks, address: wallet.address! });
      navigate(`/watch/${videoId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const recipientInvalid = recipient.length > 0 && !HEDERA_ENTITY_ID_REGEX.test(recipient);

  return (
    <div className="mx-auto grid w-full max-w-[720px] gap-6">
      <h1 className="text-h1">Upload</h1>
      <div
        className={cn("grid justify-items-center gap-2 rounded-md border border-dashed border-border px-6 py-12 text-center", file && "border-solid")}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) void pick(f);
        }}
      >
        <UploadSimple size={26} className="text-muted-fg" />
        {file ? (
          <div className="text-[14px] font-medium">{file.name}</div>
        ) : (
          <>
            <div className="text-[14px] font-medium">Drop a video here</div>
            <div className="text-small text-muted-fg">Goes straight to storage with a presigned URL</div>
            <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
              Choose file
            </Button>
          </>
        )}
        <input ref={inputRef} type="file" accept="video/*" hidden onChange={e => e.target.files?.[0] && void pick(e.target.files[0])} />
        {progress !== undefined ? (
          <div className="mt-2 h-2 w-full max-w-[360px] overflow-hidden rounded-pill bg-secondary">
            <div className="h-full rounded-pill bg-muted-fg transition-[width] duration-[180ms] ease-ht" style={{ width: `${progress}%` }} />
          </div>
        ) : null}
        {videoId ? <Badge tone={status === "ready" ? "settled" : "pending"}>{status === "ready" ? "Ready" : "Processing"}</Badge> : null}
      </div>

      <label className="grid gap-1 text-[13px]">
        Title
        <input value={title} onChange={e => setTitle(e.target.value)} className={field} />
      </label>
      <label className="grid gap-1 text-[13px]">
        Description
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} className="w-full resize-y rounded-md border border-input bg-bg px-4 py-3 text-body outline-none focus:border-primary focus:ring-[3px] focus:ring-ring" />
      </label>
      <label className={cn("grid gap-1 text-[13px]", recipientInvalid && "text-destructive")}>
        Recipient account
        <input value={recipient} onChange={e => setRecipient(e.target.value)} className={cn(field, "font-mono", recipientInvalid && "border-destructive")} placeholder="0.0.48219" />
        {recipientInvalid ? <span className="text-[12px]">Not a valid Hedera account ID.</span> : null}
      </label>

      <label className="grid gap-1 text-[13px]">
        Total price for the full watch
        <span className="relative">
          <input
            value={priceText}
            onChange={e => setPriceText(e.target.value)}
            disabled={status !== "ready"}
            inputMode="decimal"
            className={cn(field, "pr-16 tabular focus:border-chain focus:ring-chain/25 disabled:text-muted-fg")}
            placeholder={status === "ready" ? "0.0720" : "Waiting for transcode…"}
          />
          <span className="pointer-events-none absolute inset-y-0 right-5 grid place-items-center text-[13px] text-muted-fg">USDC</span>
        </span>
        {derived ? (
          <span className={cn("text-[12px] tabular", derived.tooLow ? "text-destructive" : "text-muted-fg")}>
            {derived.tooLow
              ? `Too low for this length. Minimum is ${formatUsdc(derived.min)} USDC.`
              : derived.price !== undefined
                ? `${formatUsdc(derived.price)} USDC · ${derived.priced} chunk · ${formatUsdc(derived.perMin ?? 0n)} USDC per minute${derived.perMin && derived.perMin > 10_000n ? " · unusually high" : ""}`
                : `${derived.chunks} chunk · suggested ${formatUsdc(suggestedTotalPrice(duration!))} USDC`}
          </span>
        ) : (
          <span className="text-[12px] text-muted-fg">The chunk count is known once the transcode finishes.</span>
        )}
      </label>

      <label className="grid gap-1 text-[13px]">
        Free preview chunks (0–{MAX_FREE_PREVIEW_CHUNKS}, 5 s each)
        <input type="number" min={0} max={MAX_FREE_PREVIEW_CHUNKS} value={freeChunks} onChange={e => setFreeChunks(Math.max(0, Math.min(MAX_FREE_PREVIEW_CHUNKS, Number(e.target.value) || 0)))} className={cn(field, "tabular")} />
      </label>

      {error ? <div className="rounded-md bg-destructive/12 p-3 text-[13px] text-destructive">{error}</div> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate("/me")}>
          Cancel
        </Button>
        <Button variant="chain" onClick={publish} disabled={!videoId || status !== "ready" || !derived?.price || derived.tooLow || recipientInvalid} loading={busy}>
          Publish
        </Button>
      </div>
    </div>
  );
}

function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = e => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? (onProgress(100), resolve()) : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
}

function readDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(el.src);
      resolve(el.duration);
    };
    el.onerror = () => reject(new Error("Could not read video metadata"));
    el.src = URL.createObjectURL(file);
  });
}
