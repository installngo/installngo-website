// The charm on a cord: a damped pendulum you can drag, flick and tap.
(() => {
  const stage = document.getElementById("stage");
  const pendulum = document.getElementById("pendulum");
  const charm = document.getElementById("charm");
  const glow = document.getElementById("glow");
  const hint = document.getElementById("hint");
  const toast = document.getElementById("toast");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  const CHARMS = [
    { src: "/assets/murugan.webp", alt: "Little Murugan charm", small: false },
    { src: "/assets/lucky-star.svg", alt: "Lucky Star charm", small: true },
    { src: "/assets/tulsi.svg", alt: "Tulsi charm", small: true },
  ];
  let which = 0;

  const GRAVITY = 2600; // px/s², a calm, weighty swing
  const KEEP = 0.5; // share of speed kept each second
  const MAX = 0.9; // radians either side: never flung off the screen

  let angle = reduce.matches ? 0 : 0.45; // arrives with a swing
  let speed = 0;
  let hop = 0;
  let hopSpeed = 0;
  let flash = 0;
  let last = performance.now();
  let running = false;
  let gustTimer = 0;
  let drag = null;

  // Distance from the top of the screen to the charm's middle.
  const reach = () => charm.offsetTop + charm.offsetHeight * 0.45;
  const pivot = () => {
    const r = stage.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top };
  };
  const pointerAngle = (e) => {
    const p = pivot();
    return Math.atan2(e.clientX - p.x, Math.max(20, e.clientY - p.y));
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function draw() {
    pendulum.style.transform = `rotate(${(-angle * 180) / Math.PI}deg)`;
    charm.style.transform = `translateX(-50%) translateY(${hop}px)`;
    glow.style.top = `${charm.offsetTop + charm.offsetHeight / 2}px`;
    glow.style.width = `${charm.offsetWidth * 1.6}px`;
    glow.style.opacity = String(0.7 + flash * 0.3);
    glow.style.transform = `translate(-50%, -50%) translateY(${hop}px) scale(${1 + flash * 0.25})`;
  }

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    if (!drag && !reduce.matches) {
      speed += -(GRAVITY / reach()) * Math.sin(angle) * dt;
      speed *= Math.pow(KEEP, dt);
      angle = clamp(angle + speed * dt, -MAX, MAX);
    }
    hopSpeed += 3200 * dt;
    hop = Math.min(0, hop + hopSpeed * dt);
    if (hop === 0) hopSpeed = 0;
    flash = Math.max(0, flash - dt * 1.4);
    draw();

    const still = !drag && Math.abs(speed) < 0.004 && Math.abs(angle) < 0.004 && hop === 0 && flash === 0;
    if (still || document.hidden) {
      running = false;
      scheduleGust();
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

  // Now and then a gentle breeze, like the real app.
  function scheduleGust() {
    clearTimeout(gustTimer);
    if (reduce.matches) return;
    gustTimer = setTimeout(() => {
      if (!drag) speed += (Math.random() - 0.5) * 0.5;
      wake();
    }, 4000 + Math.random() * 5000);
  }

  function sparkle() {
    if (reduce.matches) return;
    const s = stage.getBoundingClientRect();
    const c = charm.getBoundingClientRect();
    const cx = c.left - s.left + c.width / 2;
    const cy = c.top - s.top + c.height / 2;
    for (let i = 0; i < 16; i++) {
      const dot = document.createElement("span");
      dot.className = "spark";
      dot.style.left = `${cx}px`;
      dot.style.top = `${cy}px`;
      stage.appendChild(dot);
      const a = Math.random() * Math.PI * 2;
      const d = 60 + Math.random() * 90;
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
    if (!reduce.matches) {
      hopSpeed = -700;
      speed += (Math.random() - 0.5) * 1.2;
    }
    sparkle();
    wake();
  }

  function firstTouch() {
    hint.style.opacity = "0";
  }

  // Drag and flick, with a finger or a mouse.
  charm.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    charm.setPointerCapture(e.pointerId);
    charm.classList.add("dragging");
    drag = {
      id: e.pointerId,
      offset: angle - pointerAngle(e),
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      moved: 0,
      lastAngle: angle,
      lastT: performance.now(),
    };
    speed = 0;
    firstTouch();
    wake();
  });

  charm.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const now = performance.now();
    drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x, e.clientY - drag.y));
    const target = clamp(pointerAngle(e) + drag.offset, -MAX, MAX);
    const dt = Math.max((now - drag.lastT) / 1000, 0.008);
    speed = 0.6 * speed + 0.4 * ((target - drag.lastAngle) / dt);
    angle = target;
    drag.lastAngle = target;
    drag.lastT = now;
  });

  const release = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const tap = drag.moved < 8 && performance.now() - drag.t < 350;
    drag = null;
    charm.classList.remove("dragging");
    if (tap) {
      speed = 0;
      bless();
    } else {
      speed = clamp(speed, -5.5, 5.5);
      wake();
    }
  };
  charm.addEventListener("pointerup", release);
  charm.addEventListener("pointercancel", release);

  // Keyboard: the charm is reachable with Tab, and Enter or Space blesses.
  charm.tabIndex = 0;
  charm.setAttribute("role", "button");
  charm.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      bless();
    }
  });

  document.getElementById("next").addEventListener("click", () => {
    which = (which + 1) % CHARMS.length;
    const next = CHARMS[which];
    charm.src = next.src;
    charm.alt = next.alt;
    charm.classList.toggle("small", next.small);
    charm.onload = draw;
    angle = reduce.matches ? 0 : (Math.random() < 0.5 ? -1 : 1) * 0.55;
    speed = 0;
    firstTouch();
    wake();
  });

  function showToast(text) {
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  document.getElementById("share").addEventListener("click", async () => {
    const url = `${location.origin}/`;
    const data = {
      title: "Something is dangling…",
      text: "Give this charm a swing! Coming soon from installngo:",
      url,
    };
    if (navigator.share) {
      try {
        await navigator.share(data);
      } catch {
        /* the person closed the share sheet */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied. Paste it in your status!");
    } catch {
      showToast(url);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) wake();
  });
  window.addEventListener("resize", draw);
  draw();
  wake();
})();
