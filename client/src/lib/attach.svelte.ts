// Attachment staging for composers (channels + DMs share this).
//
// Nothing auto-posts: pasted/dropped/picked files land in a pending tray on
// the composer — visible, removable — and are only claimed by a message when
// the user actually sends. Uploads start immediately in the background so
// send is instant; a ✕ on a staged item also deletes the orphan server-side.
//
// Disk-friendliness: big static images are downscaled IN THE BROWSER (canvas
// → WebP ~85%, max 2048px long edge) before upload — a 12 MB phone photo
// lands at a few hundred KB. GIFs can't be cheaply re-encoded, so they go up
// as-is under the server's 8 MB cap.

import { api } from "./api";

export const MAX_STAGED = 4; // mirrors the server's MAX_PER_MESSAGE
const MAX_IMAGE_BYTES = 8_000_000;
const MAX_TEXT_BYTES = 1_000_000;
const DOWNSCALE_EDGE = 2048;
const DOWNSCALE_TRIGGER_BYTES = 1_500_000;

const TEXT_EXTS = [".txt", ".md", ".log", ".csv"];
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export interface PendingUpload {
  key: number;
  name: string;
  kind: "image" | "gif" | "text";
  /** Object URL for the thumbnail (images only). Revoked on remove/clear. */
  previewUrl: string | null;
  /** Server attachment id once the background upload finishes. */
  id: number | null;
  error: string | null;
}

let nextKey = 1;

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

/** Downscale + re-encode a static image when it's large; measure dimensions. */
async function prepareImage(
  file: File,
): Promise<{ blob: Blob; name: string; w: number; h: number } | { error: string }> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return { error: "That image can't be read." };
  }
  const { width, height } = bmp;
  const isGif = file.type === "image/gif";
  const big = Math.max(width, height) > DOWNSCALE_EDGE || file.size > DOWNSCALE_TRIGGER_BYTES;
  if (isGif || !big) {
    bmp.close();
    if (file.size > MAX_IMAGE_BYTES) return { error: "Too large — max 8 MB." };
    return { blob: file, name: file.name, w: width, h: height };
  }
  // Re-encode: cap the long edge, WebP at ~85%.
  const scale = Math.min(1, DOWNSCALE_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
  if (!blob) return { error: "Couldn't process that image." };
  if (blob.size > MAX_IMAGE_BYTES) return { error: "Too large — max 8 MB." };
  const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
  return { blob, name, w, h };
}

export interface AttachmentStager {
  items: PendingUpload[];
  /** True while any staged upload is still in flight. */
  readonly busy: boolean;
  addFiles(files: FileList | File[] | null | undefined): void;
  remove(key: number): void;
  /** Successfully-uploaded attachment ids, in stage order. */
  ids(): number[];
  /** Drop all staged items client-side (after a successful send — the server
   *  rows are claimed by the message now, so no orphan delete). */
  clear(): void;
  /** Throw the tray away unsent (a room switch, the composer unmounting):
   *  previews revoked, finished uploads deleted, and an upload still in
   *  flight deletes itself when it lands (stage()'s orphan check). */
  discard(): void;
}

/** Unsent text per room ("c:<channelId>" / "d:<conversationId>"), so a
 *  half-typed message stays with the room it was typed in (Oct 2026 review —
 *  it used to follow you into the next one and get sent there). Memory only. */
export const drafts = new Map<string, string>();

/** One per composer. */
export function createAttachmentStager(): AttachmentStager {
  const state = $state<{ items: PendingUpload[] }>({ items: [] });

  async function stage(file: File): Promise<void> {
    const ext = extOf(file.name);
    const isText = TEXT_EXTS.includes(ext);
    const isImage = IMAGE_TYPES.has(file.type);
    const item: PendingUpload = {
      key: nextKey++,
      name: file.name,
      kind: isText ? "text" : file.type === "image/gif" ? "gif" : "image",
      previewUrl: isImage ? URL.createObjectURL(file) : null,
      id: null,
      error: null,
    };
    if (!isText && !isImage) {
      item.error = "Only images and text files.";
      state.items = [...state.items, item];
      return;
    }
    if (isText && file.size > MAX_TEXT_BYTES) {
      item.error = "Too large — max 1 MB for text.";
      state.items = [...state.items, item];
      return;
    }
    state.items = [...state.items, item];

    // Prepare (maybe downscale) + upload in the background.
    let blob: Blob = file;
    let name = file.name;
    let w: number | undefined;
    let h: number | undefined;
    if (isImage) {
      const prep = await prepareImage(file);
      if ("error" in prep) {
        patch(item.key, { error: prep.error });
        return;
      }
      ({ blob, name } = prep);
      w = prep.w;
      h = prep.h;
    }
    try {
      const r = await api.uploadAttachment(blob, name, w, h);
      // If the ✕ removed this item WHILE the upload was in flight, the fresh
      // server row has no owner in the tray — delete it now instead of
      // leaving it for the 1h orphan sweep (the file's own contract).
      if (!state.items.some((it) => it.key === item.key)) {
        void api.deleteUpload(r.attachment.id).catch(() => {});
        return;
      }
      patch(item.key, { id: r.attachment.id });
    } catch {
      patch(item.key, { error: "Upload failed." });
    }
  }

  function patch(key: number, fields: Partial<PendingUpload>): void {
    state.items = state.items.map((it) => (it.key === key ? { ...it, ...fields } : it));
  }

  return {
    get items() {
      return state.items;
    },
    get busy() {
      return state.items.some((it) => it.id === null && it.error === null);
    },
    addFiles(files) {
      if (!files) return;
      for (const f of Array.from(files)) {
        if (state.items.filter((it) => !it.error).length >= MAX_STAGED) break;
        void stage(f);
      }
    },
    remove(key) {
      const item = state.items.find((it) => it.key === key);
      if (!item) return;
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      if (item.id != null) void api.deleteUpload(item.id).catch(() => {});
      state.items = state.items.filter((it) => it.key !== key);
    },
    ids() {
      return state.items.filter((it) => it.id != null).map((it) => it.id!);
    },
    clear() {
      for (const it of state.items) if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      state.items = [];
    },
    discard() {
      for (const it of state.items) {
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
        if (it.id != null) void api.deleteUpload(it.id).catch(() => {});
      }
      state.items = [];
    },
  };
}

/** Files from a paste event (empty when the paste is just text). */
export function pastedFiles(e: ClipboardEvent): File[] {
  const files: File[] = [];
  for (const item of e.clipboardData?.items ?? []) {
    if (item.kind === "file") {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  return files;
}
