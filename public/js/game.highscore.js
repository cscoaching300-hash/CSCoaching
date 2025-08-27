// High score drop-in (localStorage)
(function () {
  const KEY = 'csc_bowling_highscore';
  const banner = document.createElement('div');
  banner.style.cssText = `
    position:fixed; left:50%; top:18px; transform:translateX(-50%);
    background:#121212; color:#fff; border-radius:12px; padding:8px 12px;
    box-shadow:0 8px 24px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.08);
    font:600 13px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; display:none; z-index:9999`;
  document.body.appendChild(banner);

  const show = (msg) => {
    banner.textContent = msg;
    banner.style.display = 'block';
    clearTimeout(show._t);
    show._t = setTimeout(() => banner.style.display = 'none', 1800);
  };

  // Add a tiny pill into the HUD to show current best
  const hud = document.querySelector('.hud');
  if (hud) {
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.innerHTML = `<span>Best</span><span class="accent" id="hudBest">0</span>`;
    hud.appendChild(pill);
    const best = Number(localStorage.getItem(KEY) || 0);
    pill.querySelector('#hudBest').textContent = best;
  }

  window.addEventListener('csc:score', (e) => {
    const { score, gameOver } = e.detail || {};
    const best = Number(localStorage.getItem(KEY) || 0);
    if (gameOver && score > best) {
      localStorage.setItem(KEY, String(score));
      const bestEl = document.getElementById('hudBest');
      if (bestEl) bestEl.textContent = score;
      show(`🏆 New high score: ${score}!`);
    }
  });
})();
