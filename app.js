const POLLS = [
  { id: "costume-adults", title: "Best Costume (Adults)", icon: "🧙", subtitle: "Who brought the Halloween magic?" },
  { id: "costume-kids", title: "Best Costume (Kids)", icon: "🧛", subtitle: "Tell us your favorite little look!" },
  { id: "spookiest-cookie", title: "Spookiest Cookie", icon: "🍪", subtitle: "Which spooky sweet takes the prize?" },
];
const CONFIG = window.POLL_CONFIG || {};
const app = document.querySelector("#app");
const SESSION_KEY = "little-halloween-poll-session";
const ADMIN_KEY = "little-halloween-poll-admin-password";
const getSession = () => {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (session?.username === "Admin") session.adminPassword = sessionStorage.getItem(ADMIN_KEY) || "";
    return session;
  } catch { return null; }
};
const saveSession = (session) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ username: session.username }));
  if (session.username === "Admin") sessionStorage.setItem(ADMIN_KEY, session.adminPassword);
  else sessionStorage.removeItem(ADMIN_KEY);
};
let state = { session: getSession(), view: "", selectedPoll: null, draft: "", votes: {} };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function setStatus(message, success = false) {
  const status = document.querySelector("#status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("success", success);
}
function isAdmin() { return state.session?.username === "Admin" && typeof state.session?.adminPassword === "string"; }
function currentUsername() { return state.session?.username || ""; }
function findPoll(id) { return POLLS.find((poll) => poll.id === id); }
function configured() { return Boolean(CONFIG.supabaseUrl?.trim() && CONFIG.supabaseAnonKey?.trim()); }
function friendlyError(error) {
  if (error instanceof TypeError) return "Could not reach the poll service. Check your connection and try again.";
  return error?.message || "Something went wrong. Please try again.";
}
async function api(payload, adminPassword = "") {
  if (!configured()) throw new Error("Add your Supabase URL and publishable key to app-config.js before using the poll.");
  const base = CONFIG.supabaseUrl.trim().replace(/\/$/, "");
  const response = await fetch(`${base}/functions/v1/poll-api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: CONFIG.supabaseAnonKey.trim(),
      ...(adminPassword ? { "x-admin-password": adminPassword } : {}),
    },
    body: JSON.stringify(payload),
  });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(data.error || `Poll service returned ${response.status}.`);
  return data;
}
function renderLogin() {
  state.view = "login";
  app.innerHTML = `
    <section class="panel login-panel">
      <div class="mascot" aria-hidden="true">🎃</div>
      <div class="brand-mark" style="justify-content:center"><span class="brand-pumpkin">✦</span> Trick or vote!</div>
      <h1>Little Halloween Poll</h1>
      <p class="subtitle">A cozy little vote for costumes, cookies, and Halloween bragging rights.</p>
      <form id="login-form" novalidate>
        <label class="field-label" for="username">Your username</label>
        <input class="text-field" id="username" name="username" type="text" maxlength="32" autocomplete="username" placeholder="e.g. PumpkinFan" required />
        <div id="admin-password-wrap" class="hidden">
          <label class="field-label" for="admin-password">Admin password</label>
          <input class="text-field" id="admin-password" name="password" type="password" autocomplete="current-password" placeholder="Enter the admin password" />
        </div>
        <p class="hint">Choose a name and come back to update your answers any time.</p>
        <button class="btn btn-primary" type="submit">Enter the pumpkin patch <span aria-hidden="true">→</span></button>
        <p id="status" class="status" role="status"></p>
      </form>
      <p class="hint">🎃 &nbsp;🦇 &nbsp;🍂</p>
    </section>`;
  const username = document.querySelector("#username");
  const passwordWrap = document.querySelector("#admin-password-wrap");
  username.addEventListener("input", () => {
    const isAdminName = username.value.trim() === "Admin";
    passwordWrap.classList.toggle("hidden", !isAdminName);
    document.querySelector("#admin-password").required = isAdminName;
    if (!isAdminName) document.querySelector("#admin-password").value = "";
  });
  document.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = username.value.trim();
    if (!name) return setStatus("Please enter a username.");
    if (name.length > 32) return setStatus("Usernames can be up to 32 characters.");
    if (name.toLocaleLowerCase() === "admin" && name !== "Admin") return setStatus('“Admin” is reserved. Type it with that exact capitalization to sign in as the administrator.');
    if (name === "Admin") {
      const password = document.querySelector("#admin-password").value;
      if (!password) return setStatus("Please enter the admin password.");
      const button = event.currentTarget.querySelector("button[type=submit]");
      button.disabled = true;
      button.textContent = "Checking password…";
      try {
        await api({ action: "admin-auth" }, password);
        state.session = { username: "Admin", adminPassword: password };
        saveSession(state.session);
        renderHome();
      } catch (error) {
        setStatus(error.message === "Incorrect admin password." ? error.message : friendlyError(error));
        button.disabled = false;
        button.innerHTML = 'Enter the pumpkin patch <span aria-hidden="true">→</span>';
      }
    } else {
      const button = event.currentTarget.querySelector("button[type=submit]");
      button.disabled = true;
      button.textContent = "Finding your votes…";
      try {
        const data = await api({ action: "my-votes", username: name });
        state.votes = data.votes || {};
        state.session = { username: name };
        saveSession(state.session);
        renderHome();
      } catch (error) {
        setStatus(friendlyError(error));
        button.disabled = false;
        button.innerHTML = 'Enter the pumpkin patch <span aria-hidden="true">→</span>';
      }
    }
  });
  if (!configured()) setStatus("Setup needed: add your Supabase project URL and publishable key in app-config.js.");
}
function renderHome() {
  state.view = "home";
  const name = currentUsername();
  app.innerHTML = `
    <section class="panel">
      <div class="topline">
        <div class="brand-mark"><span class="brand-pumpkin">🎃</span> Trick or vote!</div>
        <button class="btn-link" id="logout" type="button">Switch user</button>
      </div>
      <h1>${isAdmin() ? "Welcome, Admin!" : `Welcome, ${escapeHtml(name)}!`}</h1>
      <p class="welcome">${isAdmin() ? "Pick a poll to peek at the results." : "Pick a poll and cast your Halloween vote."}</p>
      <div class="poll-grid">${POLLS.map((poll) => {
        const voted = Boolean(state.votes[poll.id]);
        return `<button class="poll-card" type="button" data-poll="${poll.id}" aria-label="Open ${escapeHtml(poll.title)}">
          ${voted && !isAdmin() ? '<span class="vote-chip">Voted · edit</span>' : ""}
          <span class="poll-icon" aria-hidden="true">${poll.icon}</span>
          <span><span class="poll-title">${escapeHtml(poll.title)}</span><span class="poll-description">${isAdmin() ? "View and manage entries" : voted ? "Your answer is saved" : "Tap to add your answer"}</span></span>
          <span class="poll-arrow" aria-hidden="true">›</span>
        </button>`;
      }).join("")}</div>
      ${!isAdmin() ? '<p class="hint">Your answer is saved by username. You can update it any time before voting closes.</p>' : ""}
      <p id="status" class="status" role="status"></p>
    </section>`;
  document.querySelector("#logout").addEventListener("click", () => { state.session = null; state.votes = {}; localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(ADMIN_KEY); renderLogin(); });
  document.querySelectorAll("[data-poll]").forEach((card) => card.addEventListener("click", () => openPoll(card.dataset.poll)));
}
function renderPoll(poll) {
  state.view = "poll";
  state.selectedPoll = poll;
  const oldAnswer = state.votes[poll.id] || "";
  state.draft = oldAnswer;
  app.innerHTML = `
    <section class="panel">
      <button class="btn-link back-link" type="button" id="back">← &nbsp; Back to polls</button>
      <div class="brand-mark"><span class="brand-pumpkin">${poll.icon}</span> ${isAdmin() ? "Results time" : "Your Halloween vote"}</div>
      <h2>${escapeHtml(poll.title)}</h2>
      <p class="subtitle">${escapeHtml(poll.subtitle)}</p>
      ${isAdmin() ? '<div id="results"><p class="loading">Loading results…</p></div>' : `
        <form id="vote-form" class="poll-form">
          <label class="field-label" for="answer">Your answer</label>
          <textarea class="text-field" id="answer" name="answer" maxlength="180" placeholder="Type a name or describe your pick…" required>${escapeHtml(oldAnswer)}</textarea>
          <p class="hint">${oldAnswer ? "You can change your answer before confirming." : "Keep it short and sweet (or spooky)."}</p>
          <button class="btn btn-primary" type="submit">Submit answer</button>
        </form>
        <div id="confirm" class="confirm-card hidden">
          <p>Submit Answer?</p>
          <div class="confirmation-actions"><button id="yes" class="btn" type="button">Yes, submit it!</button><button id="edit" class="btn btn-secondary" type="button">Go back</button></div>
        </div>
        <p id="status" class="status" role="status"></p>`}
    </section>`;
  document.querySelector("#back").addEventListener("click", renderHome);
  if (isAdmin()) loadResults(poll);
  else {
    const form = document.querySelector("#vote-form");
    const answer = document.querySelector("#answer");
    const confirm = document.querySelector("#confirm");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      state.draft = answer.value.trim();
      if (!state.draft) return setStatus("Please type an answer before submitting.");
      confirm.classList.remove("hidden");
      document.querySelector("#yes").focus();
    });
    document.querySelector("#edit").addEventListener("click", () => { confirm.classList.add("hidden"); answer.focus(); });
    document.querySelector("#yes").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Saving…";
      try {
        await api({ action: "vote", pollId: poll.id, username: currentUsername(), answer: state.draft });
        state.votes[poll.id] = state.draft;
        renderHome();
      } catch (error) {
        setStatus(friendlyError(error));
        button.disabled = false;
        button.textContent = "Yes, submit it!";
      }
    });
  }
}
async function openPoll(id) {
  const poll = findPoll(id);
  if (!poll) return;
  renderPoll(poll);
  if (!isAdmin()) return;
}
async function loadResults(poll) {
  const results = document.querySelector("#results");
  try {
    const data = await api({ action: "admin-list", pollId: poll.id }, state.session.adminPassword);
    const rows = data.results || [];
    results.innerHTML = `${rows.length ? `<ul class="result-list">${rows.map((row) => `<li class="result-item"><span class="result-name">${escapeHtml(row.username)}</span><span class="result-answer">${escapeHtml(row.answer)}</span><button class="btn btn-danger" type="button" data-delete="${escapeHtml(row.username)}">Delete</button></li>`).join("")}</ul>` : '<div class="empty-state">No answers yet. This poll is waiting for its first little monster!</div>'}
      <div class="admin-actions"><p class="hint">${rows.length} ${rows.length === 1 ? "answer" : "answers"} · answers listed alphabetically</p><button class="btn btn-danger" id="clear-results" type="button">Clear all results for this poll</button></div>`;
    results.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteResult(poll, button.dataset.delete)));
    results.querySelector("#clear-results").addEventListener("click", () => clearResults(poll));
  } catch (error) {
    results.innerHTML = `<p id="status" class="status">${escapeHtml(friendlyError(error))}</p><button class="btn btn-secondary" id="retry-results" type="button">Try again</button>`;
    results.querySelector("#retry-results").addEventListener("click", () => { results.innerHTML = '<p class="loading">Loading results…</p>'; loadResults(poll); });
  }
}
async function deleteResult(poll, username) {
  if (!window.confirm(`Delete ${username}'s answer from ${poll.title}?`)) return;
  try { await api({ action: "admin-delete", pollId: poll.id, username }, state.session.adminPassword); await loadResults(poll); }
  catch (error) { setStatus(friendlyError(error)); }
}
async function clearResults(poll) {
  if (!window.confirm(`Clear every answer for ${poll.title}? This cannot be undone.`)) return;
  const button = document.querySelector("#clear-results");
  button.disabled = true;
  try { await api({ action: "admin-clear", pollId: poll.id }, state.session.adminPassword); await loadResults(poll); }
  catch (error) { button.disabled = false; setStatus(friendlyError(error)); }
}

if (state.session?.username) {
  if (state.session.username === "Admin" && !state.session.adminPassword) {
    state.session = null;
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(ADMIN_KEY);
    renderLogin();
  } else if (state.session.username === "Admin") {
    renderHome();
  } else {
    const rememberedName = state.session.username;
    app.innerHTML = '<section class="panel"><p class="loading">Finding your saved answers…</p></section>';
    api({ action: "my-votes", username: rememberedName }).then((data) => {
      state.votes = data.votes || {};
      renderHome();
    }).catch((error) => {
      state.session = null;
      localStorage.removeItem(SESSION_KEY);
      renderLogin();
      setStatus(friendlyError(error));
    });
  }
} else renderLogin();
