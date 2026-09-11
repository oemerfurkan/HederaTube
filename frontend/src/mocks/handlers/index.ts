import { apiHandlers } from "./api";
import { closeHandler, streamHandlers } from "./stream";
import { mirrorHandlers } from "./mirror";
import { devHandlers } from "./dev";

/** Order matters: the close route must be matched before the generic `/stream/:videoId/:segment`. */
export const handlers = [...apiHandlers, ...devHandlers, ...mirrorHandlers, closeHandler, ...streamHandlers];
