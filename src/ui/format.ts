import type { SnapshotReason } from "../platform/storage/types";

export function timeAgo(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "never";
  const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

export const dateTime = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : "—");

export const SNAPSHOT_REASON: Record<SnapshotReason, string> = {
  "before-load": "Before loading a file",
  "before-restore": "Before restoring a snapshot",
  "before-migration": "Before an app update changed the format",
  "before-delete": "Before deleting",
  "before-level-up": "Before levelling up",
};
