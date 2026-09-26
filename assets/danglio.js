// The hanging star on the Danglio page: a damped pendulum that the pointer
// can nudge, with a small "ritual" (glow, hop, sparkles) on click.
(() => {
  const stage = document.getElementById("stage");
  const svg = document.getElementById("stage-svg");
  const pendulum = document.getElementById("pendulum");
  const body = document.getElementById("charm-body");
  const glow = document.getElementById("glow");
  const button = document.getElementById("charm-button");
  if (!stage || !svg || !pendulum) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const PIVOT = { x: 200, y: 0 };
  const LENGTH = 290; // pivot to the charm's centre, in SVG units
  const GRAVITY = 1400; // tuned for a calm, weighty swing
  const DAMPING = 0.55; // share of speed lost per second
  const MAX_ANGLE = 1.1;

  let angle = reduce.matches ? 0 : 0.28; // a small swing on arrival
  let speed = 0;
  let hop = 0; // vertical hop offset during a ritual
  let hopSpeed = 0;
  let glowLevel = 0;
  let last = performance.now();
  let nextGust = last + 4000;
  let running = false;
  let gustTimer = 0;

  const toSvg = (clientX, clientY) => {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  const charmCentre = () => ({
    x: PIVOT.x + Math.sin(angle) * LENGTH,
    y: PIVOT.y + Math.cos(angle) * LENGTH + hop,
  });

  function placeButton() {
    const c = charmCentre();
    const ctm = svg.getScreenCTM();
    const box = stage.getBoundingClientRect();
    if (!ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = c.x;
    pt.y = c.y;
    const screen = pt.matrixTransform(ctm);
    const size = 110 * ctm.a;
    Object.assign(button.style, {
      left: `${screen.x - box.left - size / 2}px`,
      top: `${screen.y - box.top - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
    });
  }

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;

    if (!reduce.matches) {
      speed += (-(GRAVITY / LENGTH) * Math.sin(angle)) * dt;
      speed *= Math.pow(1 - DAMPING, dt);
      angle = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, angle + speed * dt));
      hopSpeed += 2600 * dt; // springs back down
      hop = Math.min(0, hop + hopSpeed * dt);
      if (hop === 0) hopSpeed = 0;
      if (now > nextGust) {
        speed += (Math.random() - 0.5) * 0.35;
        nextGust = now + 5000 + Math.random() * 6000;
      }
    }
    glowLevel = Math.max(0, glowLevel - dt * 0.9);

    const degrees = (angle * 180) / Math.PI;
    pendulum.setAttribute("transform", `rotate(${-degrees} ${PIVOT.x} ${PIVOT.y})`);
    body.setAttribute("transform", `translate(0 ${hop})`);
    glow.setAttribute("opacity", (glowLevel * 0.8).toFixed(3));
    glow.setAttribute("cy", String(290 + hop));
    placeButton();

    // Like the app, stop drawing once the charm is still; a timer brings
    // the next breeze.
    const resting = Math.abs(speed) < 0.003 && Math.abs(angle) < 0.003 && hop === 0 && glowLevel === 0;
    if (resting || document.hidden) {
      running = false;
      if (!reduce.matches) {
        clearTimeout(gustTimer);
        gustTimer = setTimeout(() => {
          speed += (Math.random() - 0.5) * 0.35;
          nextGust = performance.now() + 5000 + Math.random() * 6000;
          wake();
        }, Math.max(1000, nextGust - now));
      }
      return;
    }
    requestAnimationFrame(frame);
  }

  function wake() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  // A fast pointer passing near the cord nudges the charm.
  let lastPointer = null;
  stage.addEventListener("pointermove", (event) => {
    if (reduce.matches) return;
    const p = toSvg(event.clientX, event.clientY);
    const now = performance.now();
    if (lastPointer) {
      const vx = (p.x - lastPointer.x) / Math.max((now - lastPointer.t) / 1000, 0.008);
      const c = charmCentre();
      const cordX = PIVOT.x + Math.sin(angle) * Math.max(0, p.y);
      const near = Math.abs(p.x - cordX) < 60 && p.y < c.y + 60;
      if (near && Math.abs(vx) > 200) {
        speed += Math.max(-1.6, Math.min(1.6, vx / 1400));
        wake();
      }
    }
    lastPointer = { x: p.x, y: p.y, t: now };
  });
  stage.addEventListener("pointerleave", () => { lastPointer = null; });

  function sparkle() {
    if (reduce.matches) return;
    const box = stage.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    const cx = b.left - box.left + b.width / 2;
    const cy = b.top - box.top + b.height / 2;
    for (let i = 0; i < 14; i++) {
      const s = document.createElement("span");
      s.className = "spark";
      s.style.left = `${cx}px`;
      s.style.top = `${cy}px`;
      stage.appendChild(s);
      const a = Math.random() * Math.PI * 2;
      const d = 40 + Math.random() * 60;
      s.animate(
        [
          { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(0.3)`, opacity: 0 },
        ],
        { duration: 700 + Math.random() * 400, easing: "cubic-bezier(.2,.7,.3,1)" },
      ).onfinish = () => s.remove();
    }
  }

  button.addEventListener("click", () => {
    glowLevel = 1;
    if (!reduce.matches) {
      hopSpeed = -520;
      speed += (Math.random() - 0.5) * 0.9;
      sparkle();
    }
    wake();
  });

  reduce.addEventListener?.("change", wake);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });
  window.addEventListener("resize", placeButton);
  wake();
})();
