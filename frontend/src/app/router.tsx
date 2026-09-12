import { createBrowserRouter } from "react-router";
import { AppShell } from "./layout/AppShell";
import { HomePage } from "@/features/home/HomePage";
import { WatchPage } from "@/features/watch/WatchPage";
import { ChannelPage } from "@/features/channel/ChannelPage";
import { MePage } from "@/features/me/MePage";
// World ID verification is parked: route disabled until it comes back.
import { UploadPage } from "@/features/upload/UploadPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AppShell,
    children: [
      { index: true, Component: HomePage },
      { path: "watch/:videoId", Component: WatchPage },
      { path: "channel/:handle", Component: ChannelPage },
      { path: "me", Component: MePage },
      { path: "upload", Component: UploadPage },
    ],
  },
]);
