import { randomBytes } from "node:crypto";

const rand = (n = 6) => randomBytes(8).toString("base64url").replace(/[^a-z0-9]/gi, "").slice(0, n).toLowerCase();

export const newSessionId = () => `s-${Date.now().toString(36)}-${rand()}`;
export const newVideoId = () => `v-${Date.now().toString(36)}${rand(4)}`;
export const newCreatorId = () => `creator-${Date.now().toString(36)}${rand(4)}`;
export const newSettlementId = (creatorId: string) => `batch-${Date.now().toString(36)}-${creatorId}`;

export const normalizeAddress = (address: string) => address.trim().toLowerCase();
export const HEDERA_ENTITY_ID_REGEX = /^\d+\.\d+\.\d+$/;
