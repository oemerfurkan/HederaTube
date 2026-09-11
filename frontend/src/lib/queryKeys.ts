export const queryKeys = {
  videos: ["videos"] as const,
  video: (id: string) => ["videos", id] as const,
  videoSessions: (id: string, tab: string) => ["videos", id, "sessions", tab] as const,
  receipt: (sessionId: string) => ["receipt", sessionId] as const,
  balance: (address: string) => ["balance", address] as const,
  me: (address: string) => ["me", address] as const,
  earnings: (address: string) => ["me", address, "earnings"] as const,
  channel: (handle: string) => ["channel", handle] as const,
};
