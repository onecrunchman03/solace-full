import { mount } from 'svelte'
import './app.css'
import { paintCachedPrefs } from './lib/prefs.svelte'
import App from './App.svelte'
import { isDesktopShell } from './lib/platform'

// RELOAD KEYS IN THE DESKTOP SHELL (Josh, Aug 2026: "what's the Ctrl+Shift+R
// equivalent on the Mac app?" — there wasn't one). Browsers own these keys
// natively, but the shell's webviews don't: macOS WKWebView has no reload
// accelerator at all, and wry disables the browser accelerator keys on
// Windows. Cmd/Ctrl+R and Cmd/Ctrl+Shift+R now reload — and since the site
// is served no-cache, a plain reload IS the hard reload.
if (isDesktopShell) {
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.code === 'KeyR') {
      e.preventDefault()
      location.reload()
    }
  })
}

// Apply the last-known theme/font before first paint so boot doesn't flash
// the default theme at returning users.
paintCachedPrefs()

// The views are code-split: a deploy replaces every hashed chunk, so a tab
// that booted on the OLD index.html can fail to fetch a lazy chunk it hadn't
// visited yet. Reload once onto the fresh deploy instead of surfacing a dead
// view — throttled so a genuinely broken network can't reload-loop the tab
// (past the throttle, Lazy.svelte's catch block shows the error instead).
// NO preventDefault here: suppressing the throw makes the import RESOLVE with
// undefined, which crashed Lazy ("reading 'default'") in the beat before the
// reload landed — first weekly report caught it. Letting it reject is right:
// Lazy's {:catch} renders for the split second the reload takes.
window.addEventListener('vite:preloadError', () => {
  const last = Number(sessionStorage.getItem('solace_chunk_reload') ?? 0)
  if (Date.now() - last > 60_000) {
    sessionStorage.setItem('solace_chunk_reload', String(Date.now()))
    location.reload()
  }
})

// Installability: register the (deliberately cache-free) service worker so
// browsers offer "Install Solace" / "Add to Home Screen" as a real app.
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

// #popout=<channelId>.<userId> → this window IS a stream pop-out (opened by
// the desktop shell as a native window): mount the lean viewer page instead
// of the whole app. It reuses the stored auth token; no socket, no chrome.
// Dynamically imported — it needs props, so it can't ride Lazy.svelte.
const popout = /^#popout=(\d+)\.(\d+)$/.exec(location.hash)

// #survivorz-stream → this window is the YouTube rig's capture page (SURVIVORZ.md §12): the show,
// full window, nothing else, on the rig's stream token (StreamView.svelte). No App, so no chat
// socket, no idle logout, no service worker in the way of a weeks-long kiosk.
const survStream = /^#survivorz-stream(=|$)/.test(location.hash)

// #survivorz-watch → this window is the Survivorz show popped out (lib/popout.ts, SurvivorzView.svelte): the
// director's cut, the whole window, on the session the main window stored. No App, so no second chat socket.
const survWatch = /^#survivorz-watch$/.test(location.hash)

// #creator → the Survivorz character creator in a window of its own (Admin Panel → Characters →
// Pop out; docs/survivorz/CREATOR.md). The stored session, no chat socket, no rail.
const creatorWin = location.hash === "#creator"

if (creatorWin) {
  void import("./creator/CreatorWindow.svelte").then(({ default: CreatorWindow }) => {
    mount(CreatorWindow, { target: document.getElementById("app")! })
  })
} else if (survStream) {
  document.documentElement.classList.add('casino')
  void import('./survivorz/show/StreamView.svelte').then(({ default: StreamView }) => {
    mount(StreamView, { target: document.getElementById('app')! })
  })
} else if (survWatch) {
  document.documentElement.classList.add('casino')
  void import('./survivorz/show/WatchPopout.svelte').then(({ default: WatchPopout }) => {
    mount(WatchPopout, { target: document.getElementById('app')! })
  })
} else if (popout) {
  // A pop-out is a video stage, not a themed page: paintCachedPrefs() above
  // still set data-theme (the mirror runs for every window), and the theme's
  // atmosphere layers would paint over the stream. `.casino` is the app's
  // "this view supplies its own scenery" switch — stamp it here for good
  // (Josh, Sep 2026: no theme bleeds through a page it isn't meant for).
  document.documentElement.classList.add('casino')
  void import('./components/PopoutView.svelte').then(({ default: PopoutView }) => {
    mount(PopoutView, {
      target: document.getElementById('app')!,
      props: { channelId: Number(popout[1]), userId: Number(popout[2]) },
    })
  })
} else {
  mount(App, {
    target: document.getElementById('app')!,
  })
}
