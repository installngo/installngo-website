// Danglio preview: a charm on a real rope, simulated like the app.
// The cord is a chain of points (Verlet integration) with gravity; the
// charm is the heavy end. Pull the charm and the cord stretches; let go and
// it springs back and swings. A fast cursor passing by stirs the air.
(() => {
  const stage = document.getElementById("stage");
  const ropePath = document.getElementById("rope");
  const charm = document.getElementById("charm");
  const glow = document.getElementById("glow");
  const hint = document.getElementById("hint");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const narrow = window.matchMedia("(max-width: 820px)");

  const SEGMENTS = 14;
  const GRAVITY = 2200; // px/s²
  const DAMPING = 0.992; // velocity kept per step
  const STEP = 1 / 120; // fixed physics step, seconds
  const ITERATIONS = 18; // rope constraint passes per step
  const MAX_STRETCH = 1.7; // how far the cord can be pulled, x its length
  const AIR_RADIUS = 90; // px around the cursor that stirs the rope
  const CHARM_WEIGHT = 8; // the charm is this many times heavier than a rope point
  const MAX_SPEED = 11; // px per step (about 1300 px/s): a stretched cord snaps back, not like a slingshot
  const SNAP_DAMPING = 0.955; // extra friction just after letting go

  let W = 0;
  let H = 0;
  let ropeLen = 0;
  let charmW = 0;
  let charmH = 0;
  let rest = 0;
  let anchor = { x: 0, y: -2 };
  let nodes = []; // { x, y, px, py, w } — w is inverse mass (0 = pinned)

  let running = false;
  let last = 0;
  let acc = 0;
  let quiet = 0;
  let gustTimer = 0;
  let drag = null;
  let flash = 0;
  let snap = 0; // seconds of extra friction left after a release
  const pointer = { x: 0, y: 0, vx: 0, vy: 0, t: 0, inside: false };

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function measure(keepShape) {
    const r = stage.getBoundingClientRect();
    W = r.width;
    H = r.height;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    if (narrow.matches) {
      charmW = clamp(vw * 0.5, 160, 250);
      ropeLen = clamp(H - charmW * 1.15 - 70, 70, 190);
    } else {
      charmW = clamp(vw * 0.24, 200, 320);
      ropeLen = clamp(vh * 0.28, 130, 280);
    }
    charm.style.width = `${charmW}px`;
    charmH = charm.naturalWidth ? (charm.naturalHeight / charm.naturalWidth) * charmW : charmW;
    glow.style.width = glow.style.height = `${charmW * 1.6}px`;
    anchor = { x: W / 2, y: -2 };
    rest = ropeLen / SEGMENTS;
    if (!keepShape || nodes.length !== SEGMENTS + 1) build();
  }

  // A fresh rope, arriving with a swing (a calm, straight hang if the
  // system asks for less motion).
  function build() {
    const lean = reduce.matches ? 0 : 0.5;
    nodes = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const f = i / SEGMENTS;
      const x = anchor.x + Math.sin(lean) * ropeLen * f;
      const y = anchor.y + Math.cos(lean) * ropeLen * f;
      nodes.push({ x, y, px: x, py: y, w: i === 0 ? 0 : i === SEGMENTS ? 1 / CHARM_WEIGHT : 1 });
    }
  }

  function end() {
    return nodes[SEGMENTS];
  }

  function step(dt) {
    const g = GRAVITY * dt * dt;
    if (drag) {
      // The held charm moves with the hand; its speed on release is how
      // fast the hand was moving just before letting go.
      const e = end();
      e.px = e.x;
      e.py = e.y;
      e.x = drag.tx;
      e.y = drag.ty;
    }
    const keep = snap > 0 ? SNAP_DAMPING : DAMPING;
    snap = Math.max(0, snap - dt);
    for (let i = 1; i <= SEGMENTS; i++) {
      const n = nodes[i];
      if (n.w === 0) continue;
      let vx = (n.x - n.px) * keep;
      let vy = (n.y - n.py) * keep;
      const v = Math.hypot(vx, vy);
      if (v > MAX_SPEED) {
        vx *= MAX_SPEED / v;
        vy *= MAX_SPEED / v;
      }
      n.px = n.x;
      n.py = n.y;
      n.x += vx;
      n.y += vy + g;
    }
    for (let k = 0; k < ITERATIONS; k++) {
      for (let i = 0; i < SEGMENTS; i++) {
        const a = nodes[i];
        const b = nodes[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const wsum = a.w + b.w;
        if (wsum === 0) continue;
        const diff = (dist - rest) / dist / wsum;
        a.x += dx * diff * a.w;
        a.y += dy * diff * a.w;
        b.x -= dx * diff * b.w;
        b.y -= dy * diff * b.w;
      }
    }
    // Keep the charm on screen.
    const e = end();
    const r = stage.getBoundingClientRect();
    const minX = -r.left + charmW * 0.5;
    const maxX = window.innerWidth - r.left - charmW * 0.5;
    e.x = clamp(e.x, minX, maxX);
    e.y = clamp(e.y, anchor.y + 10, Math.max(H, window.innerHeight - r.top) - charmH);
  }

  function airFromCursor(dt) {
    if (drag || !pointer.inside) return;
    const speed = Math.hypot(pointer.vx, pointer.vy);
    if (speed < 250) return;
    const e = end();
    for (let i = 1; i <= SEGMENTS; i++) {
      const n = nodes[i];
      // The charm is a big target; the rope is thin.
      const cx = i === SEGMENTS ? e.x : n.x;
      const cy = i === SEGMENTS ? e.y + charmH * 0.45 : n.y;
      const reach = i === SEGMENTS ? charmW * 0.5 + 30 : AIR_RADIUS * 0.6;
      const d = Math.hypot(pointer.x - cx, pointer.y - cy);
      if (d > reach) continue;
      const k = (1 - d / reach) * (i === SEGMENTS ? 0.12 : 0.3);
      n.x += pointer.vx * dt * k;
      n.y += pointer.vy * dt * k * 0.4;
    }
    pointer.vx *= 0.8;
    pointer.vy *= 0.8;
  }

  function charmAngle() {
    const a = nodes[SEGMENTS - 1];
    const b = end();
    return Math.atan2(-(b.x - a.x), b.y - a.y);
  }

  function draw() {
    // A smooth curve through the rope points.
    let d = `M${anchor.x.toFixed(1)} ${anchor.y.toFixed(1)}`;
    for (let i = 1; i < SEGMENTS; i++) {
      const mx = (nodes[i].x + nodes[i + 1].x) / 2;
      const my = (nodes[i].y + nodes[i + 1].y) / 2;
      d += ` Q${nodes[i].x.toFixed(1)} ${nodes[i].y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
    }
    const e = end();
    d += ` L${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
    ropePath.setAttribute("d", d);

    const t = charmAngle();
    charm.style.transform = `translate(${e.x}px, ${e.y}px) translate(-50%, -3px) rotate(${t}rad)`;
    const cx = e.x - Math.sin(t) * charmH * 0.5;
    const cy = e.y + Math.cos(t) * charmH * 0.5;
    const size = charmW * 1.6;
    glow.style.transform = `translate(${cx - size / 2}px, ${cy - size / 2}px) scale(${1 + flash * 0.3})`;
    glow.style.opacity = String(0.65 + flash * 0.35);
  }

  function energy() {
    let m = 0;
    for (const n of nodes) m = Math.max(m, Math.abs(n.x - n.px) + Math.abs(n.y - n.py));
    return m;
  }

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    acc += dt;
    while (acc >= STEP) {
      airFromCursor(STEP);
      step(STEP);
      acc -= STEP;
    }
    flash = Math.max(0, flash - dt * 1.3);
    draw();

    // Like the app: stop drawing once everything is still.
    quiet = !drag && energy() < 0.02 && flash === 0 ? quiet + 1 : 0;
    if (quiet > 30 || document.hidden) {
      running = false;
      scheduleGust();
      return;
    }
    requestAnimationFrame(frame);
  }

  function wake() {
    if (running) return;
    running = true;
    quiet = 0;
    last = performance.now();
    acc = 0;
    requestAnimationFrame(frame);
  }

  // Now and then a gentle breeze.
  function scheduleGust() {
    clearTimeout(gustTimer);
    if (reduce.matches) return;
    gustTimer = setTimeout(() => {
      if (!drag) end().px -= (Math.random() - 0.5) * 6;
      wake();
    }, 4000 + Math.random() * 5000);
  }

  function sparkle() {
    if (reduce.matches) return;
    const e = end();
    const t = charmAngle();
    const cx = e.x - Math.sin(t) * charmH * 0.5;
    const cy = e.y + Math.cos(t) * charmH * 0.5;
    for (let i = 0; i < 18; i++) {
      const dot = document.createElement("span");
      dot.className = "spark";
      dot.style.left = `${cx}px`;
      dot.style.top = `${cy}px`;
      stage.appendChild(dot);
      const a = Math.random() * Math.PI * 2;
      const d = 70 + Math.random() * 100;
      dot.animate(
        [
          { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(0.2)`, opacity: 0 },
        ],
        { duration: 700 + Math.random() * 500, easing: "cubic-bezier(.2,.7,.3,1)" },
      ).onfinish = () => dot.remove();
    }
  }

  function bless() {
    flash = 1;
    const e = end();
    if (!reduce.matches) {
      e.py = e.y + 10; // a little hop up
      e.px = e.x + (Math.random() - 0.5) * 4;
    }
    sparkle();
    wake();
  }

  const local = (ev) => {
    const r = stage.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  // Pull and let go.
  charm.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    charm.setPointerCapture(ev.pointerId);
    charm.classList.add("dragging");
    hint.style.opacity = "0";
    const p = local(ev);
    const e = end();
    drag = { id: ev.pointerId, ox: e.x - p.x, oy: e.y - p.y, sx: ev.clientX, sy: ev.clientY, t: performance.now(), moved: 0, tx: e.x, ty: e.y };
    e.w = 0; // the hand holds the charm
    wake();
  });

  charm.addEventListener("pointermove", (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    drag.moved = Math.max(drag.moved, Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy));
    const p = local(ev);
    let x = p.x + drag.ox;
    let y = p.y + drag.oy;
    // The cord only stretches so far.
    const dx = x - anchor.x;
    const dy = y - anchor.y;
    const dist = Math.hypot(dx, dy);
    const max = ropeLen * MAX_STRETCH;
    if (dist > max) {
      x = anchor.x + (dx / dist) * max;
      y = anchor.y + (dy / dist) * max;
    }
    drag.tx = x;
    drag.ty = Math.max(anchor.y + 10, y);
  });

  const release = (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const tap = drag.moved < 8 && performance.now() - drag.t < 350;
    drag = null;
    charm.classList.remove("dragging");
    const e = end();
    e.w = 1 / CHARM_WEIGHT;
    snap = tap ? 0 : 0.45;
    if (tap) bless();
    else wake();
  };
  charm.addEventListener("pointerup", release);
  charm.addEventListener("pointercancel", release);

  // A fast cursor passing by stirs the rope, as in the app.
  window.addEventListener("pointermove", (ev) => {
    if (ev.pointerType !== "mouse") return;
    const p = local(ev);
    const now = performance.now();
    const dt = Math.max((now - pointer.t) / 1000, 0.008);
    if (pointer.t && dt < 0.1) {
      pointer.vx = 0.5 * pointer.vx + 0.5 * ((p.x - pointer.x) / dt);
      pointer.vy = 0.5 * pointer.vy + 0.5 * ((p.y - pointer.y) / dt);
    }
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.t = now;
    pointer.inside = true;
    if (Math.hypot(pointer.vx, pointer.vy) > 250) wake();
  });
  document.addEventListener("pointerleave", () => {
    pointer.inside = false;
  });

  // Keyboard: Tab to the charm, Enter or Space for a blessing.
  charm.tabIndex = 0;
  charm.setAttribute("role", "button");
  charm.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      bless();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) wake();
  });
  window.addEventListener("resize", () => {
    measure(true);
    draw();
    wake();
  });

  const start = () => {
    measure(false);
    draw();
    wake();
  };
  if (charm.complete && charm.naturalWidth) start();
  else charm.addEventListener("load", start, { once: true });
})();
