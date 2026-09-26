// Danglio preview: a charm on an elastic string, hanging from the top.
//
// The charm is a weight on a stretchy string (an elastic pendulum): one
// smooth swing, one smooth stretch, solved in small steps every frame, so
// the motion never jitters. The charm itself tilts with a slight lag, like
// a real pendant settling on its loop.

const ALLOW_PULL = true; // false = no dragging; tap and breeze still work

const Pendulum = (() => {
  const GRAVITY = 2400; // px/s²
  const SPRING = 90; // string stiffness (s⁻²): higher = less stretch
  const STRETCH_DAMPING = 7; // how quickly a stretch stops bouncing
  const SWING_DAMPING = 0.45; // air resistance on the swing
  const TILT_SPRING = 160; // how firmly the charm lines up with the string
  const TILT_DAMPING = 14; // how quickly its wobble settles
  const MAX_STRETCH = 1.75; // the string never gets longer than this
  const HAND = 700; // how firmly a held charm follows the hand (s⁻²)
  const HAND_DAMPING = 2 * Math.sqrt(700); // critically damped: follows softly, never overshoots
  const SUBSTEP = 1 / 240;

  function create(length) {
    return {
      L: length, // string length at rest
      th: 0, // swing angle (0 = straight down, + = to the right)
      w: 0, // swing speed (rad/s)
      r: length, // current string length
      vr: 0, // stretch speed (px/s)
      tilt: 0, // charm tilt (follows th)
      vt: 0,
      held: false,
      target: null, // where the hand wants the charm: { th, r }
    };
  }

  function step(p, dt) {
    const n = Math.max(1, Math.ceil(dt / SUBSTEP));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      if (p.held && p.target) {
        // The charm follows the hand through a soft spring, so uneven
        // mouse or finger updates still give an even glide, and letting go
        // hands over a natural speed.
        p.w += (HAND * (p.target.th - p.th) - HAND_DAMPING * p.w) * h;
        p.vr += (HAND * (p.target.r - p.r) - HAND_DAMPING * p.vr) * h;
        p.th += p.w * h;
        p.r += p.vr * h;
      } else if (!p.held) {
        // A string only pulls; when slack, the charm simply falls.
        const stretch = p.r - p.L;
        const spring = stretch > 0 ? -SPRING * stretch - STRETCH_DAMPING * p.vr : -0.5 * p.vr;
        const ar = p.r * p.w * p.w + GRAVITY * Math.cos(p.th) + spring;
        const aw = (-GRAVITY * Math.sin(p.th) - 2 * p.vr * p.w) / Math.max(p.r, 20) - SWING_DAMPING * p.w;
        p.vr += ar * h;
        p.w += aw * h;
        p.r += p.vr * h;
        p.th += p.w * h;
        if (p.r > p.L * MAX_STRETCH) {
          p.r = p.L * MAX_STRETCH;
          if (p.vr > 0) p.vr = 0;
        }
        if (p.r < p.L * 0.35) {
          p.r = p.L * 0.35;
          if (p.vr < 0) p.vr *= -0.3;
        }
      }
      // The charm's own tilt trails the string a little.
      const at = -TILT_SPRING * (p.tilt - p.th) - TILT_DAMPING * (p.vt - p.w);
      p.vt += at * h;
      p.tilt += p.vt * h;
    }
  }

  function energy(p) {
    return Math.abs(p.w) + Math.abs(p.vr) / 200 + Math.abs(p.vt) + Math.abs(p.th) * 0.2 + Math.abs(p.r - p.L) / 400;
  }

  return { create, step, energy, MAX_STRETCH };
})();

if (typeof module !== "undefined") module.exports = Pendulum;

if (typeof document !== "undefined") {
  (() => {
    const stage = document.getElementById("stage");
    const ropePath = document.getElementById("rope");
    // The image includes the charm's shadow: extra room on the sides and
    // below. These are its proportions (see assets/murugan.webp).
    const IMG = { width: 588, figure: 516, figureHeight: 520 };
    const charm = document.getElementById("charm");
    const glow = document.getElementById("glow");
    const hint = document.getElementById("hint");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const narrow = window.matchMedia("(max-width: 820px)");
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    let p = null;

    // The cord: a chain of points hanging between the top of the screen and
    // the charm. The charm's motion comes from the smooth string above; the
    // points only follow it, so the cord bends, trails and whips like the
    // app's rope without ever making the charm jitter.
    const LINKS = 12;
    let chain = [];
    function buildChain() {
      const t = tip();
      chain = [];
      for (let i = 0; i <= LINKS; i++) {
        const f = i / LINKS;
        const x = anchor.x + (t.x - anchor.x) * f;
        const y = anchor.y + (t.y - anchor.y) * f;
        chain.push({ x, y, px: x, py: y });
      }
    }
    function stepChain(dt) {
      const n = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = dt / n;
      const g = 2400 * h * h;
      const t = tip();
      // A touch longer than the gap, so the cord keeps a little life in it.
      const rest = Math.max(p.r, p.L * 1.04) / LINKS;
      for (let k = 0; k < n; k++) {
        for (let i = 1; i < LINKS; i++) {
          const c = chain[i];
          const vx = (c.x - c.px) * 0.985;
          const vy = (c.y - c.py) * 0.985;
          c.px = c.x;
          c.py = c.y;
          c.x += vx;
          c.y += vy + g;
        }
        chain[0].x = anchor.x;
        chain[0].y = anchor.y;
        chain[LINKS].x = t.x;
        chain[LINKS].y = t.y;
        for (let it = 0; it < 10; it++) {
          for (let i = 0; i < LINKS; i++) {
            const a = chain[i];
            const b = chain[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.hypot(dx, dy) || 1e-4;
            if (d <= rest) continue; // a cord goes slack, it never pushes
            const wa = i === 0 ? 0 : 1;
            const wb = i + 1 === LINKS ? 0 : 1;
            if (wa + wb === 0) continue;
            const c = ((d - rest) / d) / (wa + wb);
            a.x += dx * c * wa;
            a.y += dy * c * wa;
            b.x -= dx * c * wb;
            b.y -= dy * c * wb;
          }
        }
      }
    }
    let anchor = { x: 0, y: -2 };
    let charmW = 0;
    let charmH = 0;
    let running = false;
    let last = 0;
    let quiet = 0;
    let gustTimer = 0;
    let drag = null;
    let flash = 0;
    const pointer = { x: 0, y: 0, vx: 0, vy: 0, t: 0, inside: false };

    function measure() {
      const s = stage.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let length;
      if (narrow.matches) {
        charmW = clamp(vw * 0.5, 160, 250);
        // Leave room for the string's natural stretch under the charm's weight.
        length = clamp((s.height - charmW * 1.1 - 60) / 1.12, 60, 160);
        anchor = { x: s.width / 2, y: -2 };
      } else {
        charmW = clamp(vw * 0.24, 200, 320);
        length = clamp((vh * 0.28) / 1.12, 115, 250);
        anchor = { x: vw * 0.72, y: -2 };
      }
      charm.style.width = `${(charmW * IMG.width) / IMG.figure}px`;
      charmH = (charmW * IMG.figureHeight) / IMG.figure;
      glow.style.width = glow.style.height = `${charmW * 1.6}px`;
      if (!p) {
        p = Pendulum.create(length);
        p.th = reduce.matches ? 0 : 0.5; // arrives with a swing
        p.tilt = p.th;
      } else {
        p.r *= length / p.L;
        p.L = length;
      }
      if (narrow.matches) {
        hint.style.transform = "";
      } else {
        hint.style.transform = `translate(${anchor.x}px, ${length * 1.12 + charmH + 16}px) translateX(-50%)`;
      }
    }

    // Where the string meets the charm's loop.
    const tip = () => ({ x: anchor.x + Math.sin(p.th) * p.r, y: anchor.y + Math.cos(p.th) * p.r });

    function draw() {
      const t = tip();
      let d = `M${chain[0].x.toFixed(1)} ${chain[0].y.toFixed(1)}`;
      for (let i = 1; i < LINKS; i++) {
        const mx = (chain[i].x + chain[i + 1].x) / 2;
        const my = (chain[i].y + chain[i + 1].y) / 2;
        d += ` Q${chain[i].x.toFixed(1)} ${chain[i].y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
      }
      d += ` L${t.x.toFixed(1)} ${t.y.toFixed(1)}`;
      ropePath.setAttribute("d", d);
      const a = -p.tilt; // CSS turns clockwise
      charm.style.transform = `translate(${t.x}px, ${t.y}px) translate(-50%, -3px) rotate(${a}rad)`;
      const cx = t.x - Math.sin(a) * charmH * 0.5;
      const cy = t.y + Math.cos(a) * charmH * 0.5;
      const size = charmW * 1.6;
      glow.style.transform = `translate(${cx - size / 2}px, ${cy - size / 2}px) scale(${1 + flash * 0.3})`;
      glow.style.opacity = String(0.65 + flash * 0.35);
    }

    // A fast cursor passing close to the charm nudges it.
    function air() {
      if (drag || !pointer.inside) return;
      const speed = Math.hypot(pointer.vx, pointer.vy);
      if (speed < 250) return;
      const t = tip();
      const cx = t.x - Math.sin(-p.tilt) * charmH * 0.45;
      const cy = t.y + Math.cos(-p.tilt) * charmH * 0.45;
      const reach = charmW * 0.55 + 30;
      const d = Math.hypot(pointer.x - cx, pointer.y - cy);
      if (d > reach) return;
      const k = 1 - d / reach;
      // Only the sideways part of the push turns into swing.
      p.w += ((pointer.vx * Math.cos(p.th) - pointer.vy * Math.sin(p.th)) / p.r) * 0.06 * k;
      pointer.vx *= 0.6;
      pointer.vy *= 0.6;
    }

    function frame(now) {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      air();
      if (!reduce.matches || drag) Pendulum.step(p, dt);
      stepChain(dt);
      flash = Math.max(0, flash - dt * 1.3);
      draw();
      let cordMotion = 0;
      for (const c of chain) cordMotion = Math.max(cordMotion, Math.abs(c.x - c.px) + Math.abs(c.y - c.py));
      quiet = !drag && Pendulum.energy(p) < 0.004 && cordMotion < 0.02 && flash === 0 ? quiet + 1 : 0;
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
      requestAnimationFrame(frame);
    }

    function scheduleGust() {
      clearTimeout(gustTimer);
      if (reduce.matches) return;
      gustTimer = setTimeout(() => {
        if (!drag) p.w += (Math.random() - 0.5) * 0.35;
        wake();
      }, 4000 + Math.random() * 5000);
    }

    function sparkle() {
      if (reduce.matches) return;
      const t = tip();
      const a = -p.tilt;
      const cx = t.x - Math.sin(a) * charmH * 0.5;
      const cy = t.y + Math.cos(a) * charmH * 0.5;
      for (let i = 0; i < 18; i++) {
        const dot = document.createElement("span");
        dot.className = "spark";
        dot.style.left = `${cx}px`;
        dot.style.top = `${cy}px`;
        stage.appendChild(dot);
        const ang = Math.random() * Math.PI * 2;
        const dd = 70 + Math.random() * 100;
        dot.animate(
          [
            { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
            { transform: `translate(calc(-50% + ${Math.cos(ang) * dd}px), calc(-50% + ${Math.sin(ang) * dd}px)) scale(0.2)`, opacity: 0 },
          ],
          { duration: 700 + Math.random() * 500, easing: "cubic-bezier(.2,.7,.3,1)" },
        ).onfinish = () => dot.remove();
      }
    }

    function bless() {
      flash = 1;
      if (!reduce.matches) {
        p.vr -= 380; // a little hop up the string
        p.w += (Math.random() - 0.5) * 0.8;
      }
      sparkle();
      wake();
    }

    const local = (ev) => {
      const s = stage.getBoundingClientRect();
      return { x: ev.clientX - s.left, y: ev.clientY - s.top };
    };

    // Pull and let go.
    charm.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      charm.setPointerCapture(ev.pointerId);
      hint.style.opacity = "0";
      const q = local(ev);
      const t = tip();
      drag = { id: ev.pointerId, ox: t.x - q.x, oy: t.y - q.y, sx: ev.clientX, sy: ev.clientY, t0: performance.now(), moved: 0 };
      if (ALLOW_PULL) {
        charm.classList.add("dragging");
        p.held = true;
        p.target = { th: p.th, r: p.r };
      }
      wake();
    });

    charm.addEventListener("pointermove", (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      drag.moved = Math.max(drag.moved, Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy));
      if (!ALLOW_PULL) return;
      const q = local(ev);
      const x = q.x + drag.ox - anchor.x;
      const y = Math.max(8, q.y + drag.oy - anchor.y);
      p.target = {
        th: Math.atan2(x, y),
        r: clamp(Math.hypot(x, y), p.L * 0.35, p.L * Pendulum.MAX_STRETCH),
      };
    });

    const release = (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      const tap = drag.moved < 8 && performance.now() - drag.t0 < 350;
      // The soft spring already carries the hand's speed; keep it sensible.
      p.w = clamp(p.w, -6, 6);
      p.vr = clamp(p.vr, -1500, 1500);
      drag = null;
      p.held = false;
      p.target = null;
      charm.classList.remove("dragging");
      if (tap) bless();
      else wake();
    };
    charm.addEventListener("pointerup", release);
    charm.addEventListener("pointercancel", release);

    window.addEventListener("pointermove", (ev) => {
      if (ev.pointerType !== "mouse") return;
      const q = local(ev);
      const now = performance.now();
      const dt = Math.max((now - pointer.t) / 1000, 0.008);
      if (pointer.t && dt < 0.1) {
        pointer.vx = 0.5 * pointer.vx + 0.5 * ((q.x - pointer.x) / dt);
        pointer.vy = 0.5 * pointer.vy + 0.5 * ((q.y - pointer.y) / dt);
      }
      pointer.x = q.x;
      pointer.y = q.y;
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
      measure();
      buildChain();
      draw();
      wake();
    });

    const start = () => {
      measure();
      buildChain();
      draw();
      wake();
    };
    if (charm.complete && charm.naturalWidth) start();
    else charm.addEventListener("load", start, { once: true });
  })();
}
