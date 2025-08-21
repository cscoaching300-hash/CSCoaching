// public/js/nav.js
fetch('/api/session')
  .then(res => res.json())
  .then(data => {
    const navSpot = document.getElementById('member-nav');
    if (!navSpot) return;

    if (data.loggedIn) {
      navSpot.innerHTML = `<a href="/dashboard.html">Dashboard</a> | <a href="/logout">Logout</a>`;
    } else {
      navSpot.innerHTML = `<a href="/login.html">Member Login</a>`;
    }
  })
  .catch(err => console.error('Nav load error:', err));
