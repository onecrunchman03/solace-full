<script lang="ts">
  // THE JUKEBOX's record library, for the house (Josh: "a setting system in
  // the admin panel that lets the admin add/remove/rename songs"). Uploads are
  // MP3-only and the duration is read from the file server-side — the casino
  // advances its queue on that number.
  import { onMount } from "svelte";
  import { api, ApiError, type JukeboxSong } from "../lib/api";
  import { ask } from "../lib/confirm.svelte";

  let songs = $state<JukeboxSong[]>([]);
  let loading = $state(true);
  let msg = $state("");
  let busy = $state(false);
  let q = $state("");

  // add
  let file = $state<File | null>(null);
  let title = $state("");
  let artist = $state("");
  let fileInput: HTMLInputElement | null = $state(null);

  // rename
  let editing = $state<number | null>(null);
  let eTitle = $state("");
  let eArtist = $state("");

  onMount(() => {
    void load();
  });

  async function load(): Promise<void> {
    loading = true;
    try {
      songs = (await api.adminJukebox()).songs;
    } catch {
      msg = "couldn't read the library";
    }
    loading = false;
  }

  const clock = (ms: number): string => {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  /** Prefill the labels off the filename, the same "Artist - Title" split the
   *  bulk ingest script uses — most files are already named that way. */
  function pick(e: Event): void {
    const f = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
    file = f;
    if (!f) return;
    const name = f.name.replace(/\.[^.]+$/, "").trim();
    let a = "";
    let t = name;
    for (const sep of [" - ", "- ", " -"]) {
      const i = name.indexOf(sep);
      if (i > 0) {
        a = name.slice(0, i).trim();
        t = name.slice(i + sep.length).trim();
        break;
      }
    }
    artist = a;
    title = t;
  }

  async function add(): Promise<void> {
    if (!file || !title.trim() || busy) return;
    busy = true;
    msg = "";
    try {
      await api.adminJukeboxAdd(file, title.trim(), artist.trim());
      msg = `added "${title.trim()}"`;
      file = null;
      title = "";
      artist = "";
      if (fileInput) fileInput.value = "";
      await load();
    } catch (e) {
      const err = e instanceof ApiError ? e.code : ""; // ApiError has .code, never .body (Oct 2026 review)
      msg =
        err === "not_mp3" || err === "bad_mp3"
          ? "that file isn't a readable MP3"
          : err === "too_large"
            ? "too big — 15 MB is the ceiling"
            : "the upload was refused";
    }
    busy = false;
  }

  function startEdit(s: JukeboxSong): void {
    editing = s.id;
    eTitle = s.title;
    eArtist = s.artist;
  }

  async function saveEdit(id: number): Promise<void> {
    if (!eTitle.trim() || busy) return;
    busy = true;
    try {
      await api.adminJukeboxRename(id, eTitle.trim(), eArtist.trim());
      editing = null;
      await load();
    } catch {
      msg = "rename refused";
    }
    busy = false;
  }

  async function remove(s: JukeboxSong): Promise<void> {
    if (busy) return;
    if (!(await ask({ title: `Remove "${s.title}" from the jukebox?`, body: "The record comes off the shelf and its file is deleted from the server.", confirm: "remove the record", danger: true }))) return;
    busy = true;
    try {
      await api.adminJukeboxRemove(s.id);
      msg = `removed "${s.title}"`;
      await load();
    } catch {
      msg = "couldn't remove it";
    }
    busy = false;
  }

  const shown = $derived(
    (() => {
      const n = q.trim().toLowerCase();
      if (!n) return songs;
      return songs.filter(
        (s) => s.title.toLowerCase().includes(n) || s.artist.toLowerCase().includes(n),
      );
    })(),
  );
</script>

<div class="jb">
  <p class="hint">
    What the casino floor plays. Records are MP3 only; the queue runs on each
    file's real length, read from the file itself. Bulk-loading a folder is
    <code>node scripts/ingest-jukebox.mjs</code> on the server.
  </p>

  <div class="add">
    <input type="file" accept="audio/mpeg,.mp3" bind:this={fileInput} onchange={pick} />
    <input class="t" placeholder="title" bind:value={title} />
    <input class="t" placeholder="artist" bind:value={artist} />
    <button class="go" onclick={add} disabled={!file || !title.trim() || busy}>Add record</button>
  </div>

  {#if msg}<p class="msg">{msg}</p>{/if}

  <input class="q" placeholder="search the library…" bind:value={q} />

  {#if loading}
    <p class="hint">reading…</p>
  {:else if !shown.length}
    <p class="hint">{songs.length ? "nothing by that name" : "no records yet"}</p>
  {:else}
    <table>
      <thead>
        <tr><th>Title</th><th>Artist</th><th>Length</th><th>Plays</th><th></th></tr>
      </thead>
      <tbody>
        {#each shown as s (s.id)}
          <tr>
            {#if editing === s.id}
              <td><input class="t" bind:value={eTitle} /></td>
              <td><input class="t" bind:value={eArtist} /></td>
              <td>{clock(s.durationMs)}</td>
              <td>{s.plays}</td>
              <td class="acts">
                <button onclick={() => saveEdit(s.id)} disabled={busy}>Save</button>
                <button onclick={() => (editing = null)}>Cancel</button>
              </td>
            {:else}
              <td class="ti">{s.title}</td>
              <td class="ar">{s.artist || "—"}</td>
              <td>{clock(s.durationMs)}</td>
              <td>{s.plays}</td>
              <td class="acts">
                <button onclick={() => startEdit(s)}>Rename</button>
                <button class="del" onclick={() => remove(s)} disabled={busy}>Remove</button>
              </td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .jb {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .hint {
    margin: 0;
    color: var(--ink-soft);
    font-size: 0.82rem;
  }
  code {
    background: var(--panel-2);
    padding: 1px 5px;
    border-radius: 4px;
  }
  .add {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  .t,
  .q {
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--ink);
    padding: 6px 9px;
    font: inherit;
    min-width: 140px;
  }
  .q {
    max-width: 320px;
  }
  .go {
    background: var(--accent);
    color: var(--accent-ink);
    border: none;
    border-radius: 6px;
    padding: 7px 14px;
    font-weight: 700;
    cursor: pointer;
  }
  .go:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .msg {
    margin: 0;
    color: var(--accent);
    font-size: 0.85rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  th {
    text-align: left;
    color: var(--ink-soft);
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 4px 8px;
  }
  td {
    padding: 5px 8px;
    border-top: 1px solid var(--line);
    vertical-align: middle;
  }
  .ti {
    font-weight: 600;
  }
  .ar {
    color: var(--ink-soft);
  }
  .acts {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }
  .acts button {
    background: none;
    border: 1px solid var(--line);
    color: var(--ink);
    border-radius: 6px;
    padding: 3px 9px;
    cursor: pointer;
    font-size: 0.78rem;
  }
  .acts button:hover {
    border-color: var(--accent);
  }
  .acts .del:hover {
    border-color: #a5462f;
    color: #d97a5a;
  }
</style>
