/* ============================================================================
   GuestPass — working prototype of the core mechanic.
   Backend here = localStorage (runs offline, zero setup).
   Production backend = Cloudflare Worker + D1 (see README.md).
   Rules demonstrated:
     • no signup anywhere (the host gets a secret token link, not an account)
     • guests are the traffic: one link → every guest gets a personal pass
     • ad slots are SUPPRESSED on forms, empty states and printable views
     • no guest name ever appears in a URL (opaque ids only)
     • every guest page carries the guest→host loop footer
   ========================================================================== */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 8);
const today = () => new Date().toISOString().slice(0, 10);

/* ---------------------------------------------------------------- storage */
const KEY = "guestpass.v1";
let DB = { events: {}, guests: {}, messages: {}, songs: {} };
try { DB = Object.assign(DB, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
const save = () => localStorage.setItem(KEY, JSON.stringify(DB));

/* Referral attribution: remember if this visitor arrived from a pass footer. */
const params = new URLSearchParams(location.search);
if (params.get("ref")) localStorage.setItem("guestpass.ref", params.get("ref"));
const cameFromPass = localStorage.getItem("guestpass.ref");

/* --------------------------------------------------------------- ad slots */
/* In production this is AdSense. The point here is the POLICY LOGIC: slots never
   render on forms, empty states or printable views. */
function adSlot(zone, target, allowed) {
  if (!allowed) return `<div class="ad off" data-zone="${esc(zone)}"></div>`;
  return `<div class="ad" data-zone="${esc(zone)}" data-target="${esc(target || "contextual")}"></div>`;
}

/* ------------------------------------------------------------------ router */
function route() {
  const p = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const app = $("#app");
  window.scrollTo(0, 0);
  if (!p.length) return viewHome(app);
  if (p[0] === "e" && p[1]) {
    const ev = DB.events[p[1]];
    if (!ev) return viewMissing(app);
    if (p[2] === "join") return viewJoin(app, ev);
    if (p[2] === "pass" && p[3]) return viewPass(app, ev, p[3], p[4] || "pass");
    if (p[2] === "wall") return viewWall(app, ev);
    if (p[2] === "qr") return viewQR(app, ev);
    if (p[2] === "host" && p[3]) return viewHost(app, ev, p[3]);
    return viewEvent(app, ev);
  }
  viewMissing(app);
}
window.addEventListener("hashchange", route);

/* ------------------------------------------------------------------- home */
function viewHome(app) {
  app.innerHTML = `
    <h1>One link. Every guest gets their own pass.</h1>
    <p class="lede">Free, no signup, no app for your guests. They open the link, type their name, and see
      their table, the schedule, the menu and the message wall — on their own phone.</p>
    ${adSlot("home-top", "wedding/celebration", true)}
    <div class="card">
      <h2 style="margin-top:0">Create your event in 60 seconds</h2>
      <form id="create">
        <div class="grid2">
          <div><label>Occasion</label>
            <select name="kind">
              <option>Wedding</option><option>Birthday</option><option>Baby shower</option>
              <option>Graduation</option><option>Retirement</option><option>Family reunion</option>
              <option>Company offsite</option>
            </select></div>
          <div><label>Host name(s)</label><input name="host" placeholder="Sarah and Tom" required></div>
          <div><label>Date</label><input name="date" type="date" value="${today()}" required></div>
          <div><label>Venue</label><input name="venue" placeholder="The Old Mill, Austin TX" required></div>
          <div><label>Dress code (optional)</label><input name="dress" placeholder="Cocktail"></div>
          <div><label>Table count (optional)</label><input name="tables" type="number" min="1" max="60" value="12"></div>
        </div>
        <label>Anything guests must know? (parking, menu, gifts)</label>
        <textarea name="notes" rows="3" placeholder="Parking is free in the north lot. Dinner is served at 7pm."></textarea>
        <div class="row" style="margin-top:16px">
          <button class="btn" type="submit">Create my free event page</button>
          <span class="tiny">No account. No email. You get a private host link.</span>
        </div>
      </form>
    </div>
    <h2>Why guests actually use it</h2>
    <ol class="steps">
      <li>You send one link (or print one QR card for the tables).</li>
      <li>Each guest types their name and gets a <b>personal pass</b> with their table number.</li>
      <li>They reopen it on the day for the schedule, menu and parking.</li>
      <li>They leave a message on the wall — the keepsake you keep forever.</li>
    </ol>
    ${adSlot("home-bottom", "wedding/celebration", true)}
    <div class="notice">Prototype: data lives in your browser only. Production = Cloudflare Worker + D1
      (free tier). See <code>README.md</code>.</div>`;

  $("#create").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const id = uid();
    DB.events[id] = {
      id, kind: f.get("kind"), host: f.get("host"), date: f.get("date"), venue: f.get("venue"),
      dress: f.get("dress"), tables: +f.get("tables") || 8, notes: f.get("notes"),
      token: uid() + uid(), created: Date.now(), fromRef: cameFromPass || null
    };
    save();
    location.hash = `#/e/${id}`;
  });
}

function viewMissing(app) {
  app.innerHTML = `<div class="card"><h2 style="margin-top:0">Nothing here</h2>
    <p class="muted">This link is wrong, or the event was deleted.</p>
    <button class="btn" onclick="location.hash='#/'">Create an event</button></div>`;
}



/* ---------------------------------------------------- public event page */
/* Content-rich by design: the host's own details + FAQ = the "publisher content"
   that makes ad slots legitimate (never a bare input box with an ad). */
function viewEvent(app, ev) {
  const gs = Object.values(DB.guests).filter(g => g.event === ev.id);
  const msgs = Object.values(DB.messages).filter(m => m.event === ev.id);
  app.innerHTML = `
    <div class="pass">
      <div class="pass-top">
        <div class="tiny" style="opacity:.85">${esc(ev.kind)}</div>
        <div class="names">${esc(ev.host)}</div>
        <div class="tiny" style="opacity:.9;margin-top:6px">${esc(fmtDate(ev.date))} · ${esc(ev.venue)}</div>
      </div>
      <div class="pass-body">
        <div class="row">
          <button class="btn" onclick="location.hash='#/e/${ev.id}/join'">Get my personal pass</button>
          <button class="btn-ghost" onclick="location.hash='#/e/${ev.id}/wall'">Message wall (${msgs.length})</button>
        </div>
        <p class="tiny" style="margin-top:10px">Your pass has your table number, the schedule and the menu.
          No app, no account — it works in your phone browser.</p>
        ${adSlot("event-top", ev.kind + " guests", true)}
        <div class="kv"><span>Date</span><b>${esc(fmtDate(ev.date))}</b></div>
        <div class="kv"><span>Venue</span><b>${esc(ev.venue)}</b></div>
        ${ev.dress ? `<div class="kv"><span>Dress code</span><b>${esc(ev.dress)}</b></div>` : ""}
        <div class="kv"><span>Guests with a pass</span><b>${gs.length}</b></div>
      </div>
    </div>

    <h2>Good to know</h2>
    <div class="card">
      <p>${esc(ev.notes || "Details will be added by the host closer to the day.")}</p>
      <h2 style="font-size:16px">Questions guests ask</h2>
      <div class="kv"><span>Do I need an app?</span><b>No — it opens in your browser</b></div>
      <div class="kv"><span>How do I find my table?</span><b>It is printed on your pass</b></div>
      <div class="kv"><span>Can I bring someone?</span><b>Tell your host when you get your pass</b></div>
    </div>
    ${adSlot("event-bottom", ev.kind + " guests", true)}
    ${loopFooter(ev)}`;
}

function viewJoin(app, ev) {
  app.innerHTML = `
    <div class="card">
      <h1 style="margin-top:0">${esc(ev.host)} — get your pass</h1>
      <p class="muted">Type your name exactly as your host knows it. If you are on the guest list,
        we will show your table.</p>
      <form id="join">
        <label>Your name</label><input name="name" placeholder="Alex Morgan" required autofocus>
        <label>Bringing anyone? (optional)</label>
        <select name="party"><option value="1">Just me</option><option value="2">Me + 1</option>
          <option value="3">Me + 2</option></select>
        <div class="row" style="margin-top:16px">
          <button class="btn" type="submit">Get my pass</button>
          <span class="tiny">We only store your name for this event.</span>
        </div>
      </form>
    </div>
    ${adSlot("join", "form", false)}`;
  $("#join").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const gid = uid();
    const count = Object.values(DB.guests).filter(g => g.event === ev.id).length;
    DB.guests[gid] = {
      id: gid, event: ev.id, name: f.get("name"), party: +f.get("party"),
      table: 1 + (count % (ev.tables || 8)), rsvp: "yes", created: Date.now()
    };
    save();
    location.hash = `#/e/${ev.id}/pass/${gid}`;
  });
}

const fmtDate = (d) => {
  if (!d) return "";
  const dt = new Date(d + "T12:00:00");
  return isNaN(dt) ? d : dt.toLocaleDateString(undefined,
    { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

/* --------------------------------------------------------- personal pass */
/* The pass is the product AND the ad-bearing page. Privacy rule enforced here:
   the URL contains an opaque id (gid), never a name, and the ad request only
   ever sees the event KIND (contextual), never the guest. */
function viewPass(app, ev, gid, tab) {
  const g = DB.guests[gid];
  if (!g) return viewMissing(app);
  const msgs = Object.values(DB.messages).filter(m => m.event === ev.id).sort((a, b) => b.created - a.created);
  const songs = Object.values(DB.songs).filter(s => s.event === ev.id);
  const tabBtn = (id, label) => `<button class="tab" aria-current="${tab === id}"
      onclick="location.hash='#/e/${ev.id}/pass/${gid}/${id}'">${label}</button>`;

  let body = "";
  if (tab === "pass") {
    body = `
      <div class="kv"><span>Guest</span><b>${esc(g.name)}${g.party > 1 ? " +" + (g.party - 1) : ""}</b></div>
      <div class="kv"><span>Table</span><b class="table-no">${esc(g.table)}</b></div>
      <div class="kv"><span>Date</span><b>${esc(fmtDate(ev.date))}</b></div>
      <div class="kv"><span>Venue</span><b><a target="_blank" rel="noopener"
        href="https://maps.google.com/?q=${encodeURIComponent(ev.venue)}">${esc(ev.venue)}</a></b></div>
      ${ev.dress ? `<div class="kv"><span>Dress code</span><b>${esc(ev.dress)}</b></div>` : ""}
      <div class="kv"><span>Add to calendar</span><b><a href="${icsHref(ev)}" download="event.ics">Download .ics</a></b></div>
      <p class="muted" style="margin-top:14px">${esc(ev.notes || "")}</p>
      ${adSlot("pass-contextual", "wedding/celebration (non-personalised)", true)}`;
  } else if (tab === "messages") {
    body = `<h2 style="margin-top:0">The wall</h2>
      <p class="muted">Leave a message for ${esc(ev.host)}. Everyone with a pass can read it.</p>
      <form id="msg"><textarea name="body" rows="3" placeholder="Wishing you both a lifetime of…" required></textarea>
        <div class="row" style="margin-top:10px"><button class="btn" type="submit">Post my message</button></div></form>
      ${adSlot("wall-top", "wedding/celebration", true)}
      <div class="card">${msgs.length ? msgs.map(m =>
        `<div class="msg"><b>${esc(m.name)}</b><p>${esc(m.body)}</p></div>`).join("") :
        `<p class="muted">No messages yet — be the first.</p>`}</div>`;
  } else {
    body = `<h2 style="margin-top:0">Song requests</h2>
      <p class="muted">Your DJ gets this list. Add one song.</p>
      <form id="song"><input name="title" placeholder="Song title — artist" required>
        <div class="row" style="margin-top:10px"><button class="btn" type="submit">Request it</button></div></form>
      ${adSlot("songs-top", "wedding/celebration", true)}
      <div class="card">${songs.length ? songs.map(s =>
        `<div class="msg"><b>${esc(s.title)}</b><p>requested by ${esc(s.name)}</p></div>`).join("") :
        `<p class="muted">No requests yet.</p>`}</div>`;
  }

  app.innerHTML = `
    <div class="pass">
      <div class="pass-top">
        <div class="tiny" style="opacity:.85">Your pass</div>
        <div class="names">${esc(ev.host)}</div>
        <div class="tiny" style="opacity:.9;margin-top:6px">${esc(fmtDate(ev.date))} · ${esc(ev.venue)}</div>
      </div>
      <div class="pass-body">
        <div class="tabs">
          ${tabBtn("pass", "My pass")}${tabBtn("messages", "Messages " + msgs.length)}
          ${tabBtn("songs", "Songs " + songs.length)}
        </div>
        ${body}
      </div>
    </div>
    ${loopFooter(ev)}`;

  const mf = $("#msg");
  if (mf) mf.addEventListener("submit", (e) => {
    e.preventDefault();
    DB.messages[uid()] = { event: ev.id, name: g.name, body: new FormData(e.target).get("body"), created: Date.now() };
    save(); render();
  });
  const sf = $("#song");
  if (sf) sf.addEventListener("submit", (e) => {
    e.preventDefault();
    DB.songs[uid()] = { event: ev.id, name: g.name, title: new FormData(e.target).get("title"), created: Date.now() };
    save(); render();
  });
}

function viewWall(app, ev) {
  const msgs = Object.values(DB.messages).filter(m => m.event === ev.id).sort((a, b) => b.created - a.created);
  app.innerHTML = `
    <h1>${esc(ev.host)} — message wall</h1>
    <p class="lede">${msgs.length} messages so far. Get your pass to add yours.</p>
    ${adSlot("wall-public", "wedding/celebration", true)}
    <div class="card">${msgs.length ? msgs.map(m =>
      `<div class="msg"><b>${esc(m.name)}</b><p>${esc(m.body)}</p></div>`).join("") :
      `<p class="muted">No messages yet.</p>`}</div>
    <div class="row"><button class="btn" onclick="location.hash='#/e/${ev.id}/join'">Get my pass</button>
      <button class="btn-ghost" onclick="location.hash='#/e/${ev.id}'">Event page</button></div>
    ${loopFooter(ev)}`;
}

const icsHref = (ev) => "data:text/calendar;charset=utf-8," + encodeURIComponent(
  "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:" + ev.kind + " — " + ev.host +
  "\nDTSTART:" + String(ev.date).replace(/-/g, "") + "T170000\nLOCATION:" + ev.venue +
  "\nEND:VEVENT\nEND:VCALENDAR");


/* --------------------------------------------------- THE GROWTH MECHANIC */
/* This footer is the entire business model. Every guest page shows it, and the
   audience reading it is the most likely population on earth to host their own
   big event within 24 months. The ?ref= param is how you measure guest→host. */
function loopFooter(ev) {
  return `<div class="loop">
    <div style="font-size:13px;opacity:.75">This pass was made free with <b>GuestPass</b></div>
    <div style="font-size:19px;font-weight:700;margin:6px 0 2px">Planning your own event?</div>
    <div style="font-size:14px;opacity:.85">One link. Every guest gets their own pass. No signup, no fees.</div>
    <div style="margin-top:12px"><a href="?ref=pass_${esc(ev.id)}#/" id="loopCta"
      style="background:#fff;color:#111318;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700">
      Make mine in 60 seconds →</a></div>
  </div>`;
}

/* ------------------------------------------------------- QR + print card */
function viewQR(app, ev) {
  app.innerHTML = `
    <h1>Print your QR card</h1>
    <p class="lede">Put this on the tables, the welcome sign, or send the link. Same result.</p>
    <div class="card qr">
      <div id="qrbox"></div>
      <div>
        <div class="kv"><span>Guest link</span><b>#/e/${ev.id}</b></div>
        <div class="kv"><span>Host link</span><b class="tiny">#/e/${ev.id}/host/${ev.token}</b></div>
        <div class="row" style="margin-top:12px">
          <button class="btn no-print" onclick="window.print()">Print this card</button>
          <button class="btn-ghost no-print" onclick="location.hash='#/e/${ev.id}/join'">Preview as a guest</button>
        </div>
        <p class="tiny no-print">Ads are disabled on this view (printable pages are not ad inventory).</p>
      </div>
    </div>
    ${adSlot("qr-page", "printable", false)}
    <div class="card">
      <h2 style="margin-top:0">Scan for your table</h2>
      <p class="muted">${esc(ev.host)} · ${esc(fmtDate(ev.date))} · ${esc(ev.venue)}</p>
    </div>`;
  const url = location.origin + location.pathname + "#/e/" + ev.id;
  new QRCode($("#qrbox"), { text: url, width: 168, height: 168, correctLevel: QRCode.CorrectLevel.M });
}

/* ----------------------------------------------------------- host console */
function viewHost(app, ev, token) {
  if (token !== ev.token) return viewMissing(app);
  const gs = Object.values(DB.guests).filter(g => g.event === ev.id);
  const msgs = Object.values(DB.messages).filter(m => m.event === ev.id);
  const songs = Object.values(DB.songs).filter(s => s.event === ev.id);
  const childEvents = Object.values(DB.events).filter(e => e.fromRef === "pass_" + ev.id);
  app.innerHTML = `
    <h1>Host console</h1>
    <p class="lede">${esc(ev.host)} — ${esc(fmtDate(ev.date))}</p>
    <div class="card">
      <div class="row">
        <button class="btn" onclick="location.hash='#/e/${ev.id}/qr'">QR + print card</button>
        <button class="btn-ghost" onclick="location.hash='#/e/${ev.id}'">Guest view</button>
        <button class="btn-ghost" onclick="window.print()">Print seating chart</button>
      </div>
      <div class="kv"><span>Guests with a pass</span><b>${gs.length}</b></div>
      <div class="kv"><span>Messages</span><b>${msgs.length}</b></div>
      <div class="kv"><span>Song requests</span><b>${songs.length}</b></div>
      <div class="kv"><span>New events from your guests</span><b>${childEvents.length} (the loop)</b></div>
    </div>
    <h2>Guest list</h2>
    <div class="card">${gs.length ? gs.map(g => `<div class="kv"><span>${esc(g.name)}
      ${g.party > 1 ? "(+" + (g.party - 1) + ")" : ""}</span><b>Table ${esc(g.table)}</b></div>`).join("") :
      `<p class="muted">No guests yet. Share your link.</p>`}</div>
    ${adSlot("host", "form/dashboard", false)}`;
}

/* -------------------------------------------------------------------- init */
function render() { route(); }
$("#navHome").addEventListener("click", () => location.hash = "#/");
$("#navDemo").addEventListener("click", seedDemo);

/* Create a populated demo event so nothing is ever an empty state. */
function seedDemo() {
  const id = "demo" + uid();
  DB.events[id] = {
    id, kind: "Wedding", host: "Sarah & Tom", date: "2026-06-20", venue: "The Old Mill, Austin TX",
    dress: "Cocktail", tables: 12, token: "demo" + uid(),
    notes: "Parking is free in the north lot. Dinner is served at 7pm. No gifts please — your presence is the present.",
    created: Date.now(), fromRef: null
  };
  const names = ["Alex Morgan", "Priya Nair", "Diego Santos", "Mia Chen", "Jordan Blake", "Lena Fischer"];
  names.forEach((n, i) => {
    const gid = "g" + uid();
    DB.guests[gid] = { id: gid, event: id, name: n, party: i % 3 === 0 ? 2 : 1, table: 1 + (i % 12), rsvp: "yes", created: Date.now() };
  });
  const first = Object.keys(DB.guests).filter(k => DB.guests[k].event === id)[0];
  [["Can't wait to celebrate with you both!", "Alex Morgan"],
   ["Bringing my dancing shoes.", "Priya Nair"],
   ["Table 7 represent!", "Diego Santos"]].forEach(([body, name]) =>
    DB.messages[uid()] = { event: id, name, body, created: Date.now() });
  DB.songs[uid()] = { event: id, name: "Mia Chen", title: "September — Earth, Wind & Fire", created: Date.now() };
  save();
  location.hash = `#/e/${id}/pass/${first}/pass`;
}

$("#foot").innerHTML = `GuestPass prototype — the mechanic is the point: one host creates,
  every guest gets a personal pass, every pass page carries the loop footer.
  Production stack: Cloudflare Pages + Workers + D1 (free tier). Ad slots follow Google
  Publisher Policy (no ads on forms, empty states or printable views).`;

route();

