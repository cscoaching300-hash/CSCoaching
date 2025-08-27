// Attract-mode drop-in: auto-rolls when idle, stops on user interaction
(function () {
  const canvas = document.getElementById('game');
  if (!canvas) return;

  let idleT = null, demo = false;
  const resetIdle = () => { demo = false; clearTimeout(idleT); idleT = setTimeout(() => demo = true, 20000); };
  ['pointerdown','keydown','mousemove','touchstart'].forEach(ev => document.addEventListener(ev, resetIdle, { passive: true }));
  resetIdle();

  // every ~2s try a gentle roll if in demo
  setInterval(() => {
    if (!demo) return;
    const rect = canvas.getBoundingClientRect();
    // synthesize a click slightly left/right of center, near bottom 1/3
    const cx = rect.left + rect.width * (0.45 + Math.random()*0.10);
    const cy = rect.top  + rect.height * (0.70 + Math.random()*0.10);
    canvas.dispatchEvent(new MouseEvent('click', { clientX: cx, clientY: cy, bubbles: true }));
  }, 2200);
})();
