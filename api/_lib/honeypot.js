// api/_lib/honeypot.js
//
// Multi-page honeypot system that serves convincing fake pages to hostile
// visitors. Every interaction is logged to the database for intelligence
// gathering, and credentials attempted by attackers are captured.
//
// Pages:
//   login      — Generic IT company login (the classic honeypot)
//   dashboard  — Fake "client portal" with fabricated tickets/invoices
//   admin      — Fake admin panel with fake user list and system status
//   profile    — Fake user profile page
//
// The honeypot pages form a linked experience: login → dashboard → admin,
// keeping attackers engaged longer and collecting more intelligence.

// ────────────────────────────────────────────────────────────────────────────
// CSS — shared across all honeypot pages
// ────────────────────────────────────────────────────────────────────────────
const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f5;color:#333;min-height:100vh}
a{color:#1a73e8;text-decoration:none}
a:hover{text-decoration:underline}
.topbar{background:#fff;border-bottom:1px solid #e0e0e0;padding:12px 24px;display:flex;align-items:center;justify-content:space-between}
.topbar-logo{font-size:18px;font-weight:700;color:#1a73e8}
.topbar-user{font-size:13px;color:#666;display:flex;gap:16px;align-items:center}
.card{background:#fff;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,.06);padding:32px;max-width:400px;margin:60px auto}
.card h1{font-size:20px;margin-bottom:8px;text-align:center}
.card p.sub{font-size:14px;color:#666;text-align:center;margin-bottom:24px}
.field{margin-bottom:16px}
.field label{display:block;font-size:13px;font-weight:600;margin-bottom:4px;color:#555}
.field input{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px}
.field input:focus{outline:none;border-color:#1a73e8;box-shadow:0 0 0 3px rgba(26,115,232,.12)}
.btn-primary{width:100%;padding:12px;background:#1a73e8;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}
.btn-primary:hover{background:#1557b0}
.footer{text-align:center;font-size:11px;color:#999;padding:20px;margin-top:auto}
.dashboard{max-width:900px;margin:24px auto;padding:0 16px}
.dash-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
.dash-header h2{font-size:22px;color:#333}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px}
.stat-card{background:#fff;border-radius:8px;padding:20px;box-shadow:0 1px 6px rgba(0,0,0,.06)}
.stat-card .label{font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.05em}
.stat-card .value{font-size:28px;font-weight:700;margin-top:4px}
.stat-card .value.blue{color:#1a73e8}
.stat-card .value.green{color:#0d904f}
.stat-card .value.orange{color:#e67e22}
.stat-card .value.red{color:#e74c3c}
.table-wrap{background:#fff;border-radius:8px;box-shadow:0 1px 6px rgba(0,0,0,.06);overflow:hidden}
.table-wrap table{width:100%;border-collapse:collapse;font-size:14px}
.table-wrap th{background:#f7f7f7;text-align:left;padding:12px 16px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.04em}
.table-wrap td{padding:12px 16px;border-top:1px solid #eee}
.table-wrap tr:hover td{background:#fafafa}
.badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600}
.badge-open{background:#e3f2fd;color:#1565c0}
.badge-progress{background:#fff3e0;color:#e65100}
.badge-resolved{background:#e8f5e9;color:#2e7d32}
.badge-critical{background:#ffebee;color:#c62828}
.admin-layout{display:flex;min-height:100vh}
.admin-sidebar{width:220px;background:#1e293b;color:#fff;padding:20px 0;flex-shrink:0}
.admin-sidebar .brand{padding:0 20px 20px;font-size:16px;font-weight:700;border-bottom:1px solid #334155;margin-bottom:12px}
.admin-sidebar .nav-item{padding:10px 20px;font-size:14px;cursor:pointer}
.admin-sidebar .nav-item:hover,.admin-sidebar .nav-item.active{background:#334155}
.admin-content{flex:1;padding:24px;background:#f1f5f9}
.admin-content h1{font-size:20px;margin-bottom:16px}
.admin-card{background:#fff;border-radius:8px;padding:20px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.admin-card h3{font-size:15px;margin-bottom:12px;color:#333}
.loading{display:none;text-align:center;padding:20px}
.loading.show{display:block}
.form.hide{display:none}
`;

// ────────────────────────────────────────────────────────────────────────────
// Fake data generators
// ────────────────────────────────────────────────────────────────────────────
const FAKE_NAMES = [
  "Marcus Chen", "Sarah Williams", "James O'Brien", "Priya Patel",
  "Ahmed Hassan", "Elena Popova", "David Kim", "Rachel Torres",
  "Michael Brown", "Lisa Zhang", "Robert Miller", "Anna Kowalski",
];

const FAKE_TICKETS = [
  { code: "SRQ-20260401-A7X2B", subject: "Email not syncing on Outlook", status: "open", priority: "high", user: "Marcus Chen" },
  { code: "SRQ-20260328-K9M4P", subject: "Server backup failing nightly", status: "in_progress", priority: "critical", user: "Sarah Williams" },
  { code: "SRQ-20260325-R3N8F", subject: "New employee onboarding - 3 users", status: "open", priority: "normal", user: "James O'Brien" },
  { code: "SRQ-20260320-W6J1Q", subject: "Printer setup - Floor 2", status: "resolved", priority: "low", user: "Priya Patel" },
  { code: "SRQ-20260315-T2Y5D", subject: "VPN connectivity from home office", status: "resolved", priority: "normal", user: "Ahmed Hassan" },
  { code: "SRQ-20260310-H8L3M", subject: "Microsoft Teams meeting room setup", status: "resolved", priority: "low", user: "Elena Popova" },
];

const FAKE_USERS = [
  { name: "Marcus Chen", role: "IT Manager", lastLogin: "2 hours ago", status: "active" },
  { name: "Sarah Williams", role: "CFO", lastLogin: "1 day ago", status: "active" },
  { name: "James O'Brien", role: "Operations", lastLogin: "3 hours ago", status: "active" },
  { name: "Priya Patel", role: "HR Director", lastLogin: "5 days ago", status: "active" },
  { name: "Ahmed Hassan", role: "Sales Lead", lastLogin: "1 week ago", status: "active" },
  { name: "Elena Popova", role: "Marketing", lastLogin: "2 days ago", status: "inactive" },
];

// ────────────────────────────────────────────────────────────────────────────
// Page generators
// ────────────────────────────────────────────────────────────────────────────

function loginPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IT Solutions Portal - Login</title>
<meta name="robots" content="noindex,nofollow">
<style>${CSS}</style>
</head>
<body>
<div class="card">
  <div class="topbar-logo" style="text-align:center;margin-bottom:16px">IT Solutions Portal</div>
  <h1>Sign in to your account</h1>
  <p class="sub">Enter your credentials to access the dashboard</p>
  <form id="f" class="form" onsubmit="return s(event)">
    <div class="field"><label for="e">Email address</label>
    <input id="e" name="email" type="email" placeholder="you@company.com" required autocomplete="username"></div>
    <div class="field"><label for="p">Password</label>
    <input id="p" name="password" type="password" placeholder="Enter password" required autocomplete="current-password"></div>
    <button type="submit" class="btn-primary">Sign in</button>
  </form>
  <div id="ld" class="loading"><p style="color:#1a73e8;font-weight:600">Authenticating...</p><p style="font-size:13px;color:#999;margin-top:8px">Please wait while we verify your credentials.</p></div>
  <p class="footer">&copy; 2026 IT Solutions Portal. All rights reserved.</p>
</div>
<script>${BEACON_JS}</script>
</body>
</html>`;
}

function dashboardPage() {
  const ticketRows = FAKE_TICKETS.map(t => {
    const badge = t.status === "open" ? "badge-open" : t.status === "in_progress" ? "badge-progress" : "badge-resolved";
    const statusLabel = t.status === "in_progress" ? "In Progress" : t.status.charAt(0).toUpperCase() + t.status.slice(1);
    return `<tr>
      <td><a href="#" onclick="beacon('click',{page:'ticket-detail',ticket:'${t.code}'});return false">${t.code}</a></td>
      <td>${t.subject}</td>
      <td><span class="badge ${badge}">${statusLabel}</span></td>
      <td>${t.user}</td>
      <td>${new Date(Date.now() - Math.random() * 7 * 86400000).toLocaleDateString()}</td>
    </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Client Dashboard - IT Solutions Portal</title>
<meta name="robots" content="noindex,nofollow">
<style>${CSS}</style>
</head>
<body>
<div class="topbar">
  <div class="topbar-logo">IT Solutions Portal</div>
  <div class="topbar-user">
    <span>Welcome, <strong>admin</strong></span>
    <a href="#" onclick="beacon('nav',{page:'admin'});return false">Admin Panel</a>
    <a href="#" onclick="beacon('nav',{page:'profile'});return false">Profile</a>
    <a href="#" onclick="beacon('logout');return false">Sign out</a>
  </div>
</div>
<div class="dashboard">
  <div class="dash-header">
    <h2>Dashboard Overview</h2>
    <span style="color:#666;font-size:13px">Last updated: just now</span>
  </div>
  <div class="stat-grid">
    <div class="stat-card"><div class="label">Open Tickets</div><div class="value blue">12</div></div>
    <div class="stat-card"><div class="label">In Progress</div><div class="value orange">5</div></div>
    <div class="stat-card"><div class="label">Resolved (30d)</div><div class="value green">47</div></div>
    <div class="stat-card"><div class="label">Avg Response</div><div class="value">2.4h</div></div>
  </div>
  <h3 style="margin-bottom:12px">Recent Tickets</h3>
  <div class="table-wrap">
    <table><thead><tr><th>Ticket</th><th>Subject</th><th>Status</th><th>Submitter</th><th>Date</th></tr></thead>
    <tbody>${ticketRows}</tbody></table>
  </div>
</div>
<p class="footer">&copy; 2026 IT Solutions Portal. All rights reserved.</p>
<script>${BEACON_JS}</script>
</body>
</html>`;
}

function adminPage() {
  const userRows = FAKE_USERS.map(u => {
    const statusBadge = u.status === "active" ? "badge-resolved" : "badge-critical";
    return `<tr>
      <td>${u.name}</td>
      <td>${u.role}</td>
      <td>${u.lastLogin}</td>
      <td><span class="badge ${statusBadge}">${u.status}</span></td>
    </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin Panel - IT Solutions Portal</title>
<meta name="robots" content="noindex,nofollow">
<style>${CSS}</style>
</head>
<body>
<div class="admin-layout">
  <div class="admin-sidebar">
    <div class="brand">IT Solutions</div>
    <div class="nav-item" onclick="beacon('nav',{page:'dashboard'});window.location.reload()">Dashboard</div>
    <div class="nav-item active">Admin Panel</div>
    <div class="nav-item" onclick="beacon('nav',{page:'users'});return false">Users</div>
    <div class="nav-item" onclick="beacon('nav',{page:'billing'});return false">Billing</div>
    <div class="nav-item" onclick="beacon('nav',{page:'settings'});return false">Settings</div>
    <div class="nav-item" onclick="beacon('nav',{page:'logs'});return false">Audit Logs</div>
  </div>
  <div class="admin-content">
    <h1>Admin Panel</h1>
    <div class="admin-card">
      <h3>System Status</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="padding:12px;background:#f0fdf4;border-radius:6px"><strong style="color:#0d904f">●</strong> Database: Online</div>
        <div style="padding:12px;background:#f0fdf4;border-radius:6px"><strong style="color:#0d904f">●</strong> Email Service: Online</div>
        <div style="padding:12px;background:#f0fdf4;border-radius:6px"><strong style="color:#0d904f">●</strong> Backup System: Running</div>
        <div style="padding:12px;background:#fef2f2;border-radius:6px"><strong style="color:#c62828">●</strong> SSL Cert: Expires in 12 days</div>
      </div>
    </div>
    <div class="admin-card">
      <h3>User Management</h3>
      <table><thead><tr><th>Name</th><th>Role</th><th>Last Login</th><th>Status</th></tr></thead>
      <tbody>${userRows}</tbody></table>
    </div>
    <div class="admin-card">
      <h3>API Keys</h3>
      <div style="padding:16px;background:#f7f7f7;border-radius:6px;font-family:monospace;font-size:13px">
        Stripe: sk_live_••••••••••••••••••••4242<br>
        SendGrid: SG.••••••••••••••••••••••••<br>
        AWS: AKIA••••••••••••••••
      </div>
    </div>
  </div>
</div>
<script>${BEACON_JS}</script>
</body>
</html>`;
}

function profilePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>My Profile - IT Solutions Portal</title>
<meta name="robots" content="noindex,nofollow">
<style>${CSS}</style>
</head>
<body>
<div class="topbar">
  <div class="topbar-logo">IT Solutions Portal</div>
  <div class="topbar-user">
    <a href="#" onclick="beacon('nav',{page:'dashboard'});return false">Dashboard</a>
    <span><strong>admin@company.com</strong></span>
  </div>
</div>
<div class="card" style="max-width:500px">
  <h1>My Profile</h1>
  <p class="sub">Update your account information</p>
  <form onsubmit="beacon('profile-update');setTimeout(()=>{document.getElementById('saved').style.display='block'},800);return false">
    <div class="field"><label>Full Name</label><input value="Admin User" placeholder="Your name"></div>
    <div class="field"><label>Email</label><input value="admin@company.com" type="email" placeholder="Email"></div>
    <div class="field"><label>Phone</label><input value="(941) 555-0192" placeholder="Phone number"></div>
    <div class="field"><label>Company</label><input value="Acme Corporation" placeholder="Company name"></div>
    <button type="submit" class="btn-primary">Save Changes</button>
  </form>
  <div id="saved" style="display:none;padding:12px;background:#e8f5e9;border-radius:8px;text-align:center;color:#0d904f;font-weight:600;margin-top:16px">Profile saved successfully!</div>
</div>
<p class="footer">&copy; 2026 IT Solutions Portal. All rights reserved.</p>
<script>${BEACON_JS}</script>
</body>
</html>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Client-side beacon JavaScript — collects passive signals and sends them
// back to /api/hp for logging.
// ────────────────────────────────────────────────────────────────────────────
const BEACON_JS = `
(function(){
  function g(){
    try{
      var d={
        s:screen.width+'x'+screen.height,
        cd:screen.colorDepth,
        tz:Intl.DateTimeFormat().resolvedOptions().timeZone,
        l:navigator.language,
        ls:navigator.languages?navigator.languages.join(','):'',
        p:navigator.platform,
        c:navigator.hardwareConcurrency,
        m:navigator.deviceMemory,
        t:navigator.maxTouchPoints,
        r:devicePixelRatio,
        cn:navigator.connection?navigator.connection.effectiveType:null,
        wgl:(function(){try{var c=document.createElement('canvas'),g=c.getContext('webgl');return g?g.getParameter(g.RENDERER):null}catch(e){return null}})(),
        pl:navigator.plugins?Array.from(navigator.plugins).map(function(p){return p.name}).slice(0,10):[],
        cv:(function(){try{var c=document.createElement('canvas'),x=c.getContext('2d');x.fillText('test',10,10);return c.toDataURL().slice(-20)}catch(e){return null}})()
      };
      navigator.sendBeacon('/api/hp',JSON.stringify({type:'probe',page:location.pathname,d:d}));
    }catch(e){}
  }
  g();
  window.beacon=function(type,detail){
    try{navigator.sendBeacon('/api/hp',JSON.stringify({type:type,detail:detail||{},page:location.pathname,ts:Date.now()}))}catch(e){}
  };
})();
function s(e){
  e.preventDefault();
  try{
    var d={email:document.getElementById('e').value,ts:Date.now(),page:location.pathname};
    navigator.sendBeacon('/api/hp',JSON.stringify({type:'cred',d:d}));
  }catch(x){}
  document.getElementById('f').className='form hide';
  document.getElementById('ld').className='loading show';
  setTimeout(function(){
    // After fake "auth", redirect to fake dashboard
    beacon('login-success');
    document.getElementById('ld').innerHTML='<p style="color:#1a73e8;font-weight:600">Login successful!</p><p style="font-size:13px;color:#999;margin-top:8px">Loading your dashboard...</p>';
    setTimeout(function(){window.location.href='?p=dashboard'},2000);
  },2500+Math.random()*1500);
  return false;
}
`;

// ────────────────────────────────────────────────────────────────────────────
// Tarpit — slows down automated scanners by introducing artificial delays.
// This wastes attacker time and resources.
// ────────────────────────────────────────────────────────────────────────────
function tarpitDelay() {
  // 2-8 second delay — long enough to be annoying, short enough to seem real
  return 2000 + Math.floor(Math.random() * 6000);
}

async function withTarpit(html, headers = {}) {
  await new Promise(resolve => setTimeout(resolve, tarpitDelay()));
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", ...headers },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Page router — serves different pages based on the honeypot path
// ────────────────────────────────────────────────────────────────────────────
const PAGE_GENERATORS = {
  "login": loginPage,
  "dashboard": dashboardPage,
  "admin": adminPage,
  "profile": profilePage,
};

export function getHoneypotPage(page = "login") {
  const gen = PAGE_GENERATORS[page] || PAGE_GENERATORS.login;
  return gen();
}

export async function honeypotResponse(page = "login") {
  const html = getHoneypotPage(page);
  return withTarpit(html);
}
