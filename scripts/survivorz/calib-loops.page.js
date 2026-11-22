// Injected into the watch page (show paused): for each body in the scene, find the natural ground speed of a loop
// that keeps its planted foot still — a golden-section search on the median per-step slide of the ball of the foot,
// the body driven down a straight line at a fixed speed with the loop forced. All bodies search at once.
window.__calibrate = async (clip, pose, speed, kind, iters = 7, guess) => {
  const S = window.__show; S.near = () => true;
  const bodies = new Map();
  for (const a of S.actors.list.values()) if (a.ready && a.kind === kind && a.canPlay(clip) && !bodies.has(a.state.body)) bodies.set(a.state.body, a);
  const list = [...bodies.values()];
  const V = list[0].pos.constructor;
  const E = new Map(list.map((a) => [a, guess ?? a.rate(clip)]));
  const est = (a) => E.get(a);
  // one trial: every body at its own natural speed; returns the median slide per step for each
  const trial = async (nats) => {
    list.forEach((a, i) => { a.src.speed.set(clip, nats[i]); a.state.pose = pose; a.setForced(clip, 60_000); });
    const T0 = S.serverNow(), x0 = list.map((a) => [a.pos.x, a.pos.y, a.pos.z]);
    let kk = 0;
    const feed = () => { while (T0 + kk * 100 < S.serverNow() + 400) { list.forEach((a, i) => a.push(T0 + kk * 100, [x0[i][0], x0[i][1], x0[i][2] + speed * kk * 0.1], 0)); kk++; } };
    const st = list.map(() => ({ steps: [], on: {}, lo: { l: 1, r: 1 } }));
    const t0 = performance.now();
    while (performance.now() - t0 < 6500) {
      feed();
      await new Promise((r) => requestAnimationFrame(r));
      if (performance.now() - t0 < 2200) continue;
      list.forEach((a, i) => {
        const s = st[i];
        for (const k of ["l", "r"]) {
          const b = a.boneAt(`ball_${k}`) ?? a.boneAt(`toes_01.${k}`) ?? a.boneAt(`toes_01${k}`); if (!b) continue;
          const p = b.getWorldPosition(new V()); const y = p.y - a.root.position.y;
          s.lo[k] = Math.min(s.lo[k] + 0.001, y);
          const down = y < s.lo[k] + 0.012;
          if (down && !s.on[k]) s.on[k] = { x: p.x, z: p.z, t: performance.now() };
          else if (!down && s.on[k]) { if (performance.now() - s.on[k].t > 80) s.steps.push(Math.hypot(p.x - s.on[k].x, p.z - s.on[k].z)); s.on[k] = null; }
        }
      });
    }
    // back to where they started (the next trial walks the same line)
    list.forEach((a, i) => a.teleport(x0[i], 0));
    return st.map((s) => { const v = [...s.steps].sort((p, q) => p - q); return v.length >= 3 ? v[v.length >> 1] : 9; });
  };
  // golden section per body over [0.55, 1.25] × its estimate
  const g = (Math.sqrt(5) - 1) / 2;
  let lo = list.map((a) => est(a) * 0.55), hi = list.map((a) => est(a) * 1.25);
  let c = lo.map((l, i) => hi[i] - g * (hi[i] - l)), d = lo.map((l, i) => l + g * (hi[i] - l));
  let fc = await trial(c), fd = await trial(d);
  for (let it = 0; it < iters; it++) {
    const nc = [], nd = [];
    list.forEach((_, i) => {
      if (fc[i] < fd[i]) { hi[i] = d[i]; d[i] = c[i]; fd[i] = fc[i]; c[i] = hi[i] - g * (hi[i] - lo[i]); nc[i] = true; }
      else { lo[i] = c[i]; c[i] = d[i]; fc[i] = fd[i]; d[i] = lo[i] + g * (hi[i] - lo[i]); nd[i] = true; }
    });
    // evaluate the new points (both arrays, only the moved one is used per body)
    const [fc2, fd2] = [await trial(c), await trial(d)];
    list.forEach((_, i) => { if (nc[i]) fc[i] = fc2[i]; if (nd[i]) fd[i] = fd2[i]; });
  }
  const out = {};
  list.forEach((a, i) => { const nat = (lo[i] + hi[i]) / 2; out[a.state.body] = { nat: +nat.toFixed(3), est: +est(a).toFixed(3), slide: +Math.min(fc[i], fd[i]).toFixed(3) }; a.setForced(null); });
  return out;
};
