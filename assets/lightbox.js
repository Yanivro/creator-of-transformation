/* Click-to-enlarge for gallery photos. Self-contained: injects its own styles.
   The photo grows out of its thumbnail and shrinks back into it on close. */
(function () {
  var SELECTOR = ".gallery figure img, .venue-gallery figure img, .vf-imgs img";
  var GROUPS = ".gallery, .venue-gallery, .vf-imgs";
  var EASE = "cubic-bezier(.2,.8,.2,1)";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  var thumbs = Array.prototype.slice.call(document.querySelectorAll(SELECTOR));
  if (!thumbs.length || !window.HTMLDialogElement) return;

  var css =
    ".lb-thumb{cursor:zoom-in}" +
    ".lb-thumb:focus-visible{outline:3px solid #d4af37;outline-offset:3px}" +
    "dialog.lb{position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;overflow:hidden;touch-action:none;-webkit-tap-highlight-color:transparent}" +
    "dialog.lb::backdrop{background:transparent}" +
    ".lb-bg{position:absolute;inset:0;background:rgba(14,14,14,.93);opacity:0;transition:opacity .32s ease;cursor:zoom-out}" +
    ".lb.is-open .lb-bg{opacity:1}" +
    ".lb-img{position:absolute;display:block;object-fit:cover;border-radius:6px;box-shadow:0 30px 80px rgba(0,0,0,.5);will-change:transform,clip-path;cursor:zoom-out;user-select:none;-webkit-user-drag:none}" +
    ".lb-btn{position:absolute;display:grid;place-items:center;width:48px;height:48px;border-radius:50%;border:1px solid rgba(255,255,255,.22);background:rgba(27,27,27,.55);color:#f8f2e4;cursor:pointer;opacity:0;transition:opacity .3s ease,background .2s,border-color .2s,transform .2s;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}" +
    ".lb.is-open .lb-btn{opacity:1}" +
    ".lb-btn:hover{background:rgba(212,175,55,.9);border-color:#d4af37;color:#1b1b1b}" +
    ".lb-btn:focus-visible{outline:2px solid #d4af37;outline-offset:3px}" +
    ".lb-btn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}" +
    ".lb-close{top:max(16px,env(safe-area-inset-top));right:16px}" +
    ".lb-prev{left:16px;top:50%;margin-top:-24px}.lb-next{right:16px;top:50%;margin-top:-24px}" +
    ".lb-prev:hover{transform:translateX(-2px)}.lb-next:hover{transform:translateX(2px)}" +
    ".lb-count{position:absolute;left:0;right:0;bottom:max(14px,env(safe-area-inset-bottom));text-align:center;font:500 13px/1 Raleway,system-ui,sans-serif;letter-spacing:.14em;color:rgba(248,242,228,.7);opacity:0;transition:opacity .3s ease;pointer-events:none}" +
    ".lb.is-open .lb-count{opacity:1}" +
    ".lb[data-single] .lb-prev,.lb[data-single] .lb-next,.lb[data-single] .lb-count{display:none}" +
    "@media (max-width:640px){.lb-prev,.lb-next{top:auto;bottom:max(40px,env(safe-area-inset-bottom));margin:0}.lb-prev{left:calc(50% - 60px)}.lb-next{right:calc(50% - 60px)}.lb-count{bottom:max(100px,calc(env(safe-area-inset-bottom) + 100px))}}";
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  function icon(d) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>'; }
  var dlg = document.createElement("dialog");
  dlg.className = "lb";
  dlg.setAttribute("aria-label", "Photo viewer");
  dlg.innerHTML =
    '<div class="lb-bg"></div><img class="lb-img" alt="">' +
    '<button class="lb-btn lb-prev" type="button" aria-label="Previous photo">' + icon("M15 5l-7 7 7 7") + "</button>" +
    '<button class="lb-btn lb-next" type="button" aria-label="Next photo">' + icon("M9 5l7 7-7 7") + "</button>" +
    '<button class="lb-btn lb-close" type="button" aria-label="Close" autofocus>' + icon("M6 6l12 12M18 6L6 18") + "</button>" +
    '<div class="lb-count" aria-live="polite"></div>';
  document.body.appendChild(dlg);
  var bg = dlg.querySelector(".lb-bg"), img = dlg.querySelector(".lb-img"),
      count = dlg.querySelector(".lb-count");

  var set = [], idx = 0, busy = false, loader = null;

  function big(src) { return src.replace(/\/tr:w-\d+/, "/tr:w-2000"); }
  function frame(el) { return el.closest("figure") || el; }

  /* where the full photo sits: fitted inside the viewport with a margin */
  function target(el) {
    var vw = window.innerWidth, vh = window.innerHeight;
    var pad = vw < 640 ? 12 : 56, padY = vw < 640 ? 70 : 56;
    var r = (el.naturalWidth || 3) / (el.naturalHeight || 2);
    var w = Math.min(vw - pad * 2, (vh - padY * 2) * r);
    var h = w / r;
    return { w: w, h: h, x: (vw - w) / 2, y: (vh - h) / 2 };
  }
  function place(t) {
    img.style.left = t.x + "px"; img.style.top = t.y + "px";
    img.style.width = t.w + "px"; img.style.height = t.h + "px";
  }
  /* keyframe that makes the full photo look exactly like its cropped thumbnail */
  function thumbState(el, t) {
    var f = frame(el), b = f.getBoundingClientRect();
    if (b.bottom < 0 || b.top > window.innerHeight || !b.width) return null;
    var s = Math.max(b.width / t.w, b.height / t.h);
    var ix = Math.max(0, (t.w - b.width / s) / 2), iy = Math.max(0, (t.h - b.height / s) / 2);
    var rad = (parseFloat(getComputedStyle(f).borderTopLeftRadius) || 0) / s;
    var dx = b.left + b.width / 2 - (t.x + t.w / 2), dy = b.top + b.height / 2 - (t.y + t.h / 2);
    return {
      transform: "translate(" + dx + "px," + dy + "px) scale(" + s + ")",
      clipPath: "inset(" + iy + "px " + ix + "px round " + rad + "px)"
    };
  }
  var REST = { transform: "none", clipPath: "inset(0px 0px round 6px)" };

  function show(el) {
    if (loader) loader.onload = null;
    img.src = el.currentSrc || el.src;
    img.alt = el.alt || "";
    var hi = big(el.currentSrc || el.src);
    if (hi !== img.src) {
      loader = new Image();
      loader.onload = function () { if (set[idx] === el) img.src = hi; };
      loader.src = hi;
    }
    count.textContent = (idx + 1) + " / " + set.length;
  }
  function hide(el, on) { frame(el).style.visibility = on ? "hidden" : ""; }

  function open(el) {
    if (busy || dlg.open) return;
    var box = el.closest(GROUPS);
    set = box ? thumbs.filter(function (t) { return box.contains(t); }) : [el];
    idx = set.indexOf(el);
    if (set.length < 2) dlg.setAttribute("data-single", ""); else dlg.removeAttribute("data-single");
    var sbw = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.overflow = "hidden";
    if (sbw > 0) document.body.style.paddingRight = sbw + "px";
    var t = target(el), from = thumbState(el, t);
    dlg.showModal();
    place(t); show(el);
    requestAnimationFrame(function () { dlg.classList.add("is-open"); });
    if (reduce || !from) {
      img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    } else {
      hide(el, true);
      img.animate([from, REST], { duration: 420, easing: EASE });
    }
  }

  function close() {
    if (busy || !dlg.open) return;
    busy = true;
    var el = set[idx], t = target(el), to = reduce ? null : thumbState(el, t);
    dlg.classList.remove("is-open");
    var a = to
      ? img.animate([REST, to], { duration: 340, easing: EASE, fill: "forwards" })
      : img.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.96)" }], { duration: 200, fill: "forwards" });
    a.onfinish = function () {
      set.forEach(function (s) { hide(s, false); });
      dlg.close(); a.cancel(); busy = false;
      document.documentElement.style.overflow = "";
      document.body.style.paddingRight = "";
      frame(el).focus({ preventScroll: true });
    };
  }

  function go(step) {
    if (busy || set.length < 2) return;
    busy = true;
    var prev = set[idx];
    idx = (idx + step + set.length) % set.length;
    var el = set[idx], shift = reduce ? 0 : 36 * step;
    var out = img.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(" + -shift + "px)" }],
      { duration: 150, easing: "ease-in", fill: "forwards" });
    out.onfinish = function () {
      hide(prev, false);
      place(target(el)); show(el);
      el.scrollIntoView({ block: "nearest" });
      hide(el, !reduce);
      out.cancel();
      img.animate([{ opacity: 0, transform: "translateX(" + shift + "px)" }, { opacity: 1, transform: "none" }],
        { duration: 240, easing: EASE }).onfinish = function () { busy = false; };
    };
  }

  thumbs.forEach(function (el) {
    var f = frame(el);
    f.classList.add("lb-thumb");
    f.tabIndex = 0;
    f.setAttribute("role", "button");
    f.setAttribute("aria-label", "Enlarge photo: " + (el.alt || ""));
    f.addEventListener("click", function () { open(el); });
    f.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(el); }
    });
  });

  bg.addEventListener("click", close);
  img.addEventListener("click", close);
  dlg.querySelector(".lb-close").addEventListener("click", close);
  dlg.querySelector(".lb-prev").addEventListener("click", function () { go(-1); });
  dlg.querySelector(".lb-next").addEventListener("click", function () { go(1); });
  dlg.addEventListener("cancel", function (e) { e.preventDefault(); close(); });
  dlg.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
  });
  window.addEventListener("resize", function () { if (dlg.open && !busy) place(target(set[idx])); });

  /* swipe: sideways for next/previous, down to close */
  var sx = 0, sy = 0, tracking = false;
  dlg.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) { tracking = false; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
  }, { passive: true });
  dlg.addEventListener("touchend", function (e) {
    if (!tracking) return;
    tracking = false;
    var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    else if (dy > 80 && Math.abs(dy) > Math.abs(dx) * 1.5) close();
  }, { passive: true });
})();
