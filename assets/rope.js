// Danglio preview: a charm on an elastic cord, hanging from the top of the
// screen like the app. The cord is a chain of points (Verlet integration)
// joined by springy links that go slack when pushed together. The charm is
// the heavy end. Pull it and the cord stretches; let go and it eases back
// and swings.

const Rope = (() => {
  const SEGMENTS = 12;
  const GRAVITY = 2400; // px/s²
  const DAMPING = 0.9965; // velocity kept per step (air resistance)
  const STEP = 1 / 120; // physics step, seconds
  const ITERATIONS = 8; // passes over the links per step
  const STIFFNESS = 0.45; // how much of a stretch each pass removes: lower = springier cord
  const CHARM_WEIGHT = 10; // the charm is this many times heavier than a cord point
  const SAFETY_SPEED = 70; // px per step; only guards against explosions
  const BOUNCE = 0.35; // energy kept when bumping a screen edge
  const STRETCH_LOSS = 0.06; // energy an elastic cord loses while contracting, per unit of stretch

  function create() {
    return { nodes: [], rest: 0, length: 0, anchor: { x: 0, y: -2 }, held: null, bounds: null };
  }

  function build(r, anchor, length, lean) {
    r.anchor = anchor;
    r.length = length;
    r.rest = length / SEGMENTS;
    r.nodes = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const f = i / SEGMENTS;
      const x = anchor.x + Math.sin(lean) * length * f;
      const y = anchor.y + Math.cos(lean) * length * f;
      r.nodes.push({ x, y, px: x, py: y, w: i === 0 ? 0 : i === SEGMENTS ? 1 / CHARM_WEIGHT : 1 });
    }
  }

  function end(r) {
    return r.nodes[SEGMENTS];
  }

  function step(r, dt = STEP) {
    const g = GRAVITY * dt * dt;
    const e = end(r);
    if (r.held) {
      // The hand carries the charm; on release it keeps the hand's speed.
      e.px = e.x;
      e.py = e.y;
      e.x = r.held.x;
      e.y = r.held.y;
    }
    // A stretched cord loses a little energy as it pulls back, like real
    // elastic, so a hard pull ends in a lively swing rather than a slingshot.
    let keep = DAMPING;
    if (!r.held) {
      const stretch = Math.hypot(e.x - r.anchor.x, e.y - r.anchor.y) / r.length - 1.02;
      if (stretch > 0) keep *= Math.max(0.9, 1 - STRETCH_LOSS * stretch * 4);
    }
    for (let i = 1; i <= SEGMENTS; i++) {
      const n = r.nodes[i];
      if (n.w === 0) continue;
      let vx = (n.x - n.px) * keep;
      let vy = (n.y - n.py) * keep;
      const v = Math.hypot(vx, vy);
      if (v > SAFETY_SPEED) {
        vx *= SAFETY_SPEED / v;
        vy *= SAFETY_SPEED / v;
      }
      n.px = n.x;
      n.py = n.y;
      n.x += vx;
      n.y += vy + g;
    }
    for (let k = 0; k < ITERATIONS; k++) {
      for (let i = 0; i < SEGMENTS; i++) {
        const a = r.nodes[i];
        const b = r.nodes[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1e-4;
        if (dist <= r.rest) continue; // a cord goes slack; it never pushes
        const wsum = a.w + b.w;
        if (wsum === 0) continue;
        const c = ((dist - r.rest) / dist) * STIFFNESS / wsum;
        a.x += dx * c * a.w;
        a.y += dy * c * a.w;
        b.x -= dx * c * b.w;
        b.y -= dy * c * b.w;
      }
    }
    // Soft screen edges: the charm bumps and bounces back, never sticks.
    if (r.bounds && !r.held) {
      const B = r.bounds;
      if (e.x < B.minX) { const v = e.x - e.px; e.x = B.minX; e.px = e.x + v * BOUNCE; }
      if (e.x > B.maxX) { const v = e.x - e.px; e.x = B.maxX; e.px = e.x + v * BOUNCE; }
      if (e.y > B.maxY) { const v = e.y - e.py; e.y = B.maxY; e.py = e.y + v * BOUNCE; }
      if (e.y < B.minY) { const v = e.y - e.py; e.y = B.minY; e.py = e.y + v * BOUNCE; }
    }
  }

  // Direction the charm hangs: along the last bit of cord.
  function angle(r) {
    const a = r.nodes[SEGMENTS - 1];
    const b = end(r);
    return Math.atan2(-(b.x - a.x), b.y - a.y);
  }

  function energy(r) {
    let m = 0;
    for (const n of r.nodes) m = Math.max(m, Math.abs(n.x - n.px) + Math.abs(n.y - n.py));
    return m;
  }

  return { create, build, step, end, angle, energy, SEGMENTS, STEP, CHARM_WEIGHT };
})();

if (typeof module !== "undefined") module.exports = Rope;

if (typeof document !== "undefined") {
  (() => {
    const stage = document.getElementById("stage");
    const ropePath = document.getElementById("rope");
    const charm = document.getElementById("charm");
    const glow = document.getElementById("glow");
    const hint = document.getElementById("hint");
    const brand = document.querySelector(".brand");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const narrow = window.matchMedia("(max-width: 820px)");
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    const rope = Rope.create();
    let charmW = 0;
    let charmH = 0;
    let running = false;
    let last = 0;
    let acc = 0;
    let quiet = 0;
    let gustTimer = 0;
    let drag = null;
    let flash = 0;
    const pointer = { x: 0, y: 0, vx: 0, vy: 0, t: 0, inside: false };

    function measure(rebuild) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let anchorX;
      let length;
      if (narrow.matches) {
        charmW = clamp(vw * 0.42, 130, 210);
        length = clamp(vh * 0.1, 56, 110);
        anchorX = vw * 0.73;
      } else {
        charmW = clamp(vw * 0.24, 200, 320);
        length = clamp(vh * 0.28, 130, 280);
        anchorX = vw * 0.72;
      }
      charm.style.width = `${charmW}px`;
      charmH = charm.naturalWidth ? (charm.naturalHeight / charm.naturalWidth) * charmW : charmW;
      const size = charmW * 1.6;
      glow.style.width = glow.style.height = `${size}px`;
      const anchor = { x: anchorX, y: -2 };
      if (rebuild || rope.nodes.length === 0) Rope.build(rope, anchor, length, reduce.matches ? 0 : 0.5);
      else {
        // Keep the motion; just move the hanging point.
        const dx = anchor.x - rope.anchor.x;
        rope.anchor = anchor;
        rope.length = length;
        rope.rest = length / Rope.SEGMENTS;
        for (const n of rope.nodes) { n.x += dx; n.px += dx; }
        rope.nodes[0].x = anchor.x;
        rope.nodes[0].y = anchor.y;
      }
      rope.bounds = { minX: charmW * 0.5, maxX: vw - charmW * 0.5, minY: 10, maxY: vh - charmH };

      // Where the charm rests, so phone text starts below it.
      const hangBottom = length + charmH + 14;
      document.documentElement.style.setProperty("--hang-bottom", `${hangBottom + 30}px`);
      const b = brand.getBoundingClientRect();
      document.documentElement.style.setProperty("--brand-bottom", `${b.bottom + window.scrollY}px`);
      hint.style.transform = `translate(${anchorX}px, ${hangBottom}px) translateX(-50%)`;
    }

    function draw() {
      const n = rope.nodes;
      let d = `M${rope.anchor.x.toFixed(1)} ${rope.anchor.y.toFixed(1)}`;
      for (let i = 1; i < Rope.SEGMENTS; i++) {
        const mx = (n[i].x + n[i + 1].x) / 2;
        const my = (n[i].y + n[i + 1].y) / 2;
        d += ` Q${n[i].x.toFixed(1)} ${n[i].y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
      }
      const e = Rope.end(rope);
      d += ` L${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
      ropePath.setAttribute("d", d);

      const t = Rope.angle(rope);
      charm.style.transform = `translate(${e.x}px, ${e.y}px) translate(-50%, -3px) rotate(${t}rad)`;
      const cx = e.x - Math.sin(t) * charmH * 0.5;
      const cy = e.y + Math.cos(t) * charmH * 0.5;
      const size = charmW * 1.6;
      glow.style.transform = `translate(${cx - size / 2}px, ${cy - size / 2}px) scale(${1 + flash * 0.3})`;
      glow.style.opacity = String(0.65 + flash * 0.35);
    }

    // A fast cursor passing by pushes the air around the cord and charm.
    function air(dt) {
      if (drag || !pointer.inside) return;
      const speed = Math.hypot(pointer.vx, pointer.vy);
      if (speed < 250) return;
      const e = Rope.end(rope);
      const t = Rope.angle(rope);
      for (let i = 1; i <= Rope.SEGMENTS; i++) {
        const n = rope.nodes[i];
        const isCharm = i === Rope.SEGMENTS;
        const cx = isCharm ? e.x - Math.sin(t) * charmH * 0.45 : n.x;
        const cy = isCharm ? e.y + Math.cos(t) * charmH * 0.45 : n.y;
        const reach = isCharm ? charmW * 0.5 + 30 : 55;
        const dist = Math.hypot(pointer.x - cx, pointer.y - cy);
        if (dist > reach) continue;
        const k = (1 - dist / reach) * (isCharm ? 0.1 : 0.25);
        n.x += pointer.vx * dt * k;
        n.y += pointer.vy * dt * k * 0.4;
      }
      pointer.vx *= 0.85;
      pointer.vy *= 0.85;
    }

    function frame(now) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      acc += dt;
      while (acc >= Rope.STEP) {
        air(Rope.STEP);
        Rope.step(rope);
        acc -= Rope.STEP;
      }
      flash = Math.max(0, flash - dt * 1.3);
      draw();
      quiet = !drag && Rope.energy(rope) < 0.02 && flash === 0 ? quiet + 1 : 0;
      if (quiet > 40 || document.hidden) {
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

    function scheduleGust() {
      clearTimeout(gustTimer);
      if (reduce.matches) return;
      gustTimer = setTimeout(() => {
        if (!drag) Rope.end(rope).px -= (Math.random() - 0.5) * 5;
        wake();
      }, 4000 + Math.random() * 5000);
    }

    function sparkle() {
      if (reduce.matches) return;
      const e = Rope.end(rope);
      const t = Rope.angle(rope);
      const cx = e.x - Math.sin(t) * charmH * 0.5;
      const cy = e.y + Math.cos(t) * charmH * 0.5;
      for (let i = 0; i < 18; i++) {
        const dot = document.createElement("span");
        dot.className = "spark";
        dot.style.left = `${cx}px`;
        dot.style.top = `${cy}px`;
        stage.appendChild(dot);
        const a = Math.random() * Math.PI * 2;
        const dd = 70 + Math.random() * 100;
        dot.animate(
          [
            { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
            { transform: `translate(calc(-50% + ${Math.cos(a) * dd}px), calc(-50% + ${Math.sin(a) * dd}px)) scale(0.2)`, opacity: 0 },
          ],
          { duration: 700 + Math.random() * 500, easing: "cubic-bezier(.2,.7,.3,1)" },
        ).onfinish = () => dot.remove();
      }
    }

    function bless() {
      flash = 1;
      const e = Rope.end(rope);
      if (!reduce.matches) e.py = e.y + 9; // a little hop
      sparkle();
      wake();
    }

    // Pull and let go.
    charm.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      charm.setPointerCapture(ev.pointerId);
      charm.classList.add("dragging");
      hint.style.opacity = "0";
      const e = Rope.end(rope);
      drag = { id: ev.pointerId, ox: e.x - ev.clientX, oy: e.y - ev.clientY, sx: ev.clientX, sy: ev.clientY, t: performance.now(), moved: 0 };
      rope.held = { x: e.x, y: e.y };
      e.w = 0;
      wake();
    });

    charm.addEventListener("pointermove", (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      drag.moved = Math.max(drag.moved, Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy));
      let x = ev.clientX + drag.ox;
      let y = ev.clientY + drag.oy;
      const dx = x - rope.anchor.x;
      const dy = y - rope.anchor.y;
      const dist = Math.hypot(dx, dy);
      const max = rope.length * 1.8; // the cord only stretches so far
      if (dist > max) {
        x = rope.anchor.x + (dx / dist) * max;
        y = rope.anchor.y + (dy / dist) * max;
      }
      rope.held = { x, y: Math.max(rope.anchor.y + 10, y) };
    });

    const release = (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      const tap = drag.moved < 8 && performance.now() - drag.t < 350;
      drag = null;
      rope.held = null;
      charm.classList.remove("dragging");
      Rope.end(rope).w = 1 / Rope.CHARM_WEIGHT;
      if (tap) bless();
      else wake();
    };
    charm.addEventListener("pointerup", release);
    charm.addEventListener("pointercancel", release);

    window.addEventListener("pointermove", (ev) => {
      if (ev.pointerType !== "mouse") return;
      const now = performance.now();
      const dt = Math.max((now - pointer.t) / 1000, 0.008);
      if (pointer.t && dt < 0.1) {
        pointer.vx = 0.5 * pointer.vx + 0.5 * ((ev.clientX - pointer.x) / dt);
        pointer.vy = 0.5 * pointer.vy + 0.5 * ((ev.clientY - pointer.y) / dt);
      }
      pointer.x = ev.clientX;
      pointer.y = ev.clientY;
      pointer.t = now;
      pointer.inside = true;
      if (Math.hypot(pointer.vx, pointer.vy) > 250) wake();
    });
    document.addEventListener("pointerleave", () => {
      pointer.inside = false;
    });

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
      measure(false);
      draw();
      wake();
    });

    const start = () => {
      measure(true);
      draw();
      wake();
    };
    if (charm.complete && charm.naturalWidth) start();
    else charm.addEventListener("load", start, { once: true });
  })();
}
