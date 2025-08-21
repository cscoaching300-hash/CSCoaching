// public/js/activate.js
const $ = (s) => document.querySelector(s);

// Read token from URL
const params = new URLSearchParams(location.search);
const token = params.get("token");

async function initActivate() {
  const who = $("#who");
  const msg = $("#msg");
  const btn = $("#setBtn");

  if (!token) {
    msg.textContent = "Missing activation token.";
    btn.disabled = true;
    return;
  }

  try {
    // Validate invite token
    const r = await fetch("/api/auth/check-invite?token=" + encodeURIComponent(token));
    const j = await r.json();
    if (!r.ok) {
      msg.textContent = j.error || "Invalid or expired activation link.";
      btn.disabled = true;
      return;
    }
    who.textContent = `Setting password for ${j.name} (${j.email})`;
  } catch (e) {
    msg.textContent = "Network error.";
    btn.disabled = true;
  }
}

// Handle set-password
async function setPassword() {
  const pw1 = $("#pw1").value;
  const pw2 = $("#pw2").value;
  const msg = $("#msg");

  msg.textContent = "";

  if (pw1.length < 8) {
    msg.textContent = "Use at least 8 characters.";
    return;
  }
  if (pw1 !== pw2) {
    msg.textContent = "Passwords do not match.";
    return;
  }

  const res = await fetch("/api/auth/set-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password: pw1 }),
  });
  const j = await res.json();
  if (!res.ok) {
    msg.textContent = j.error || "Could not set password.";
    return;
  }
  msg.textContent = "Password set! Redirecting to login…";
  setTimeout(() => (location.href = "/login.html"), 1200);
}

// Wire up events
window.addEventListener("DOMContentLoaded", () => {
  initActivate();
  const btn = document.getElementById("setBtn");
  if (btn) btn.addEventListener("click", setPassword);
});
