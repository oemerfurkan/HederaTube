import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { CheckCircle, Copy, UploadSimple } from "@phosphor-icons/react";
import { Button, Spinner, UsdcMark, cn, toast } from "@/design/ui";
import { useMe, useVideo } from "@/api/hooks";
import { VerifyButton } from "@/features/verify/VerifyButton";
import { api } from "@/api/client";
import { useWallet } from "@/features/wallet/WalletProvider";
import { formatUsdc, parseUsdc } from "@/lib/money";
import { chunkCount, formatClock, minTotalPrice, perMinute, pricedChunkCount, suggestedTotalPrice } from "@/lib/price";
import { HEDERA_ENTITY_ID_REGEX } from "@/payments/x402-lite";

const field =
  "h-11 w-full rounded-pill border border-input bg-bg px-[18px] text-body outline-none transition-all duration-[180ms] ease-ht focus:border-primary focus:ring-[3px] focus:ring-ring";

/** Guide §6.8. The form on the left, a Studio-style preview card on the right. The price field unlocks when the transcode reports the duration. */
export function UploadPage() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const [file, setFile] = useState<File>();
  const [previewSrc, setPreviewSrc] = useState<string>();
  const [progress, setProgress] = useState<number>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recipient, setRecipient] = useState("");
  const [priceText, setPriceText] = useState("");
  const [videoId, setVideoId] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const video = useVideo(videoId);
  const status = video.data?.status;
  const me = useMe(wallet.address);

  useEffect(() => {
    if (!videoId || status === "ready") return;
    const t = setInterval(() => void video.refetch(), 1500);
    return () => clearInterval(t);
  }, [videoId, status, video]);

  useEffect(() => {
    if (wallet.accountId && !recipient) setRecipient(wallet.accountId);
  }, [wallet.accountId, recipient]);

  // the local file plays in the preview card straight away; the object URL is released with the page
  useEffect(() => () => void (previewSrc && URL.revokeObjectURL(previewSrc)), [previewSrc]);

  const duration = video.data?.duration_seconds;
  useEffect(() => {
    if (status === "ready" && duration && !priceText) setPriceText(formatUsdc(suggestedTotalPrice(duration)));
  }, [status, duration, priceText]);

  const derived = useMemo(() => {
    if (!duration) return undefined;
    const chunks = chunkCount(duration);
    const priced = pricedChunkCount(duration, 0);
    let price: bigint | undefined;
    try {
      price = priceText ? parseUsdc(priceText) : undefined;
    } catch {
      price = undefined;
    }
    const min = minTotalPrice(priced);
    return { chunks, priced, price, min, perMin: price ? perMinute(price, duration) : undefined, tooLow: price !== undefined && price < min };
  }, [duration, priceText]);

  if (wallet.status !== "ready") return <p className="text-[14px] leading-5 text-muted-fg">Connect a wallet first.</p>;
  if (me.data && !me.data.verified) {
    return (
      <div className="mx-auto grid max-w-[480px] justify-items-center gap-3 rounded-card border border-dashed border-border px-6 py-12 text-center">
        <div className="text-h2">Verify to create</div>
        <p className="text-[14px] leading-5 text-muted-fg">Creators pass one World ID Selfie Check. Scan the code with World App and you are through.</p>
        <VerifyButton />
      </div>
    );
  }

  const pick = async (f: File) => {
    setFile(f);
    setPreviewSrc(URL.createObjectURL(f));
    setError(undefined);
    const fallbackTitle = f.name.replace(/\.[^.]+$/, "");
    const chosenTitle = title || fallbackTitle;
    if (!title) setTitle(fallbackTitle);
    try {
      const presign = await api.presign({ name: f.name, size: f.size, type: f.type }, wallet.address!, wallet.accountId);
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
        accountId: wallet.accountId,
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
      await api.publish({ videoId, totalPrice: derived.price.toString(), freePreviewChunks: 0, title, description, address: wallet.address!, accountId: wallet.accountId });
      navigate(`/watch/${videoId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const recipientInvalid = recipient.length > 0 && !HEDERA_ENTITY_ID_REGEX.test(recipient);

  return (
    <div className="mx-auto grid w-full max-w-[1080px] gap-6">
      <h1 className="text-h1">Upload</h1>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid gap-6">
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
        {file ? (
          <div className="mt-1">
            <ProcessingState status={videoId ? status ?? "processing" : undefined} progress={progress} />
          </div>
        ) : null}
      </div>

      <label className="grid gap-2 text-[13px] font-medium">
        Title
        <input value={title} onChange={e => setTitle(e.target.value)} className={field} />
      </label>
      <label className="grid gap-2 text-[13px] font-medium">
        Description
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} className="w-full resize-y rounded-md border border-input bg-bg px-4 py-3 text-body font-normal leading-[1.5] outline-none focus:border-primary focus:ring-[3px] focus:ring-ring" />
      </label>
      <label className={cn("grid gap-2 text-[13px] font-medium", recipientInvalid && "text-destructive")}>
        Recipient account
        <input value={recipient} onChange={e => setRecipient(e.target.value)} className={cn(field, "font-mono", recipientInvalid && "border-destructive")} placeholder="0.0.48219" />
        {recipientInvalid ? <span className="text-[12px]">Not a valid Hedera account ID.</span> : null}
      </label>

      <label className="grid gap-2 text-[13px] font-medium">
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
          <span className="pointer-events-none absolute inset-y-0 right-[18px] grid place-items-center"><UsdcMark size={16} /></span>
        </span>
        {derived ? (
          <span className={cn("flex flex-wrap items-center gap-1 text-[12px] tabular", derived.tooLow ? "text-destructive" : "text-muted-fg")}>
            {derived.tooLow ? (
              <>
                Too low for this length. Minimum is {formatUsdc(derived.min)} <UsdcMark size={12} />.
              </>
            ) : derived.price !== undefined ? (
              <>
                {formatUsdc(derived.price)} <UsdcMark size={12} /> · {derived.priced} chunks · {formatUsdc(derived.perMin ?? 0n)} <UsdcMark size={12} /> per minute
              </>
            ) : (
              <>
                {derived.chunks} chunks · suggested {formatUsdc(suggestedTotalPrice(duration!))} <UsdcMark size={12} />
              </>
            )}
          </span>
        ) : (
          <span className="text-[12px] text-muted-fg">The chunk count is known once the transcode finishes.</span>
        )}
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

      <PreviewCard file={file} src={previewSrc} videoId={videoId} status={status} duration={duration} progress={progress} />
      </div>
    </div>
  );
}

/** One line that says where the file is in the pipeline, shared by the drop zone and the preview card. */
function ProcessingState({ status, progress }: { status?: string; progress?: number }) {
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-positive-fg">
        <CheckCircle size={16} weight="fill" /> Ready to publish
      </span>
    );
  }
  if (status) {
    return (
      <span className="inline-flex items-center gap-2 text-[13px] text-muted-fg">
        <Spinner className="size-3.5" /> Processing, usually under a minute
      </span>
    );
  }
  if (progress !== undefined) {
    return (
      <span className="inline-flex items-center gap-2 text-[13px] tabular text-muted-fg">
        <Spinner className="size-3.5" /> Uploading {progress}%
      </span>
    );
  }
  return null;
}

/** What the viewer will get: the file itself playing, the link it will live at, and where processing stands. */
function PreviewCard({
  file,
  src,
  videoId,
  status,
  duration,
  progress,
}: {
  file?: File;
  src?: string;
  videoId?: string;
  status?: string;
  duration?: number;
  progress?: number;
}) {
  const link = videoId ? `${window.location.origin}/watch/${videoId}` : undefined;
  const copyLink = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link).catch(() => undefined);
    toast("Video link copied");
  };
  return (
    <aside className="grid gap-3 rounded-card bg-surface-2 p-3 lg:sticky lg:top-20">
      <div className="aspect-video overflow-hidden rounded-md bg-black">
        {src ? (
          <video src={src} controls muted playsInline className="size-full object-contain" />
        ) : (
          <div className="grid size-full place-items-center px-4 text-center text-[12px] leading-[18px] text-muted-fg">Your video preview shows up here once you pick a file.</div>
        )}
      </div>
      <dl className="grid gap-2.5 px-1 pb-1 text-[12px] leading-[18px]">
        <div className="grid gap-0.5">
          <dt className="text-muted-fg">Video link</dt>
          <dd className="flex items-center gap-2">
            {link ? (
              <>
                <a href={link} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-chain-fg hover:underline">
                  {link.replace(/^https?:\/\//, "")}
                </a>
                <button type="button" onClick={copyLink} aria-label="Copy video link" className="grid size-7 shrink-0 place-items-center rounded-pill text-muted-fg hover:bg-surface-3 hover:text-fg">
                  <Copy size={14} />
                </button>
              </>
            ) : (
              <span className="text-muted-fg">Available once the upload starts</span>
            )}
          </dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-muted-fg">Filename</dt>
          <dd className="truncate font-medium">{file?.name ?? "—"}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-muted-fg">Length</dt>
          <dd className="font-medium tabular">{duration ? formatClock(duration) : "—"}</dd>
        </div>
        {file ? (
          <div className="grid gap-0.5">
            <dt className="text-muted-fg">Status</dt>
            <dd>
              <ProcessingState status={videoId ? status ?? "processing" : undefined} progress={progress} />
            </dd>
          </div>
        ) : null}
      </dl>
    </aside>
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
