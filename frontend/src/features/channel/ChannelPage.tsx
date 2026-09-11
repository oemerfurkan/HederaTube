import { useParams } from "react-router";
import { AddressAvatar, Amount, Mono } from "@/design/ui";
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
        <AddressAvatar address={c.creator.hedera_account_id} size={72} />
        <div className="grid gap-1">
          <h1 className="text-h1">{c.creator.display_name}</h1>
          <div className="flex flex-wrap items-center gap-3 text-small text-muted-fg">
            <span>@{c.creator.handle}</span>
            <Mono>{c.creator.hedera_account_id}</Mono>
            <span className="tabular">{c.creator.subscribers.toLocaleString()} subscribers</span>
          </div>
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
    <div className="grid gap-0.5 rounded-card bg-surface px-5 py-4 shadow-1">
      <span className="label-caps text-muted-fg">{label}</span>
      <span className="text-numeric">{children}</span>
    </div>
  );
}
