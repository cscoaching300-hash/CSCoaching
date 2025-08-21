// public/js/site.js
function show(el, yes) { if (el) el.style.display = yes ? '' : 'none'; }

async function checkLogin() {
  const loginLink    = document.getElementById('loginLink');
  const logoutLink   = document.getElementById('logoutLink');
  const dashboardLink= document.getElementById('dashboardLink');

  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    const loggedIn = res.ok; // /api/me returns 401 when not logged in

    show(loginLink, !loggedIn);
    show(logoutLink, loggedIn);
    show(dashboardLink, loggedIn);
  } catch {
    show(loginLink, true);
    show(logoutLink, false);
    show(dashboardLink, false);
  }
}

async function doLogout(e) {
  e?.preventDefault?.();
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  location.href = '/';
}

window.addEventListener('DOMContentLoaded', () => {
  checkLogin();
  const logout = document.getElementById('logoutLink');
  if (logout) logout.addEventListener('click', doLogout);
});
