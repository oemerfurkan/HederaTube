import { useParams } from "react-router";
import { Amount, Avatar, Mono } from "@/design/ui";
import { useChannel } from "@/api/hooks";
import { VideoGrid } from "@/features/home/VideoGrid";

export function ChannelPage() {
  const { handle = "" } = useParams();
  const channel = useChannel(handle);
  if (channel.isLoading) return <div className="text-small text-muted-fg">Loading…</div>;
  if (!channel.data) return <div className="text-small text-destructive">Channel not found.</div>;
  const c = channel.data;
  return (
    <div className="grid gap-8">
      <header className="flex flex-wrap items-center gap-5">
        <Avatar size={72} src={c.creator.avatar_url} />
        <div className="grid gap-1">
          <h1 className="text-h1">{c.creator.display_name}</h1>
          <div className="flex flex-wrap items-center gap-3 text-small text-muted-fg">
            <span>@{c.creator.handle}</span>
            <Mono>{c.creator.hedera_account_id}</Mono>
          </div>
          {c.creator.description ? <p className="mt-1 max-w-[640px] whitespace-pre-line text-[14px] leading-5 text-muted-fg">{c.creator.description}</p> : null}
        </div>
        <div className="ml-auto grid grid-cols-2 gap-3">
          <Stat label="Earned">
            <Amount value={c.total_earned} className="text-chain-fg" />
          </Stat>
          <Stat label="Sessions">
            <span className="tabular">{c.sessions.toLocaleString()}</span>
          </Stat>
        </div>
      </header>
      <VideoGrid videos={c.videos} flipKey={handle} />
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 rounded-card border border-border bg-surface px-5 py-4">
      <span className="label-caps text-muted-fg">{label}</span>
      <span className="text-numeric">{children}</span>
    </div>
  );
}
