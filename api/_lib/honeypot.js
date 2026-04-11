// api/_lib/honeypot.js
//
// Returns a convincing but fake HTML page to hostile-origin visitors.
// The page looks like a generic IT company site with a fake login form.
// Every interaction is client-side only — the form doesn't post anywhere
// real. The goal: waste attacker time, collect more intel from their
// browser via embedded passive signals, and log any credentials they try.

export function honeypotResponse() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>IT Solutions Portal - Login</title>
  <meta name="robots" content="noindex,nofollow">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f5;color:#333;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .card{background:#fff;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,.08);padding:40px;width:100%;max-width:400px;margin:20px}
    .logo{font-size:22px;font-weight:700;color:#1a73e8;text-align:center;margin-bottom:24px}
    h1{font-size:18px;text-align:center;margin-bottom:8px}
    .sub{font-size:14px;color:#666;text-align:center;margin-bottom:24px}
    label{display:block;font-size:13px;font-weight:600;margin-bottom:4px;color:#555}
    input{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:16px}
    input:focus{outline:none;border-color:#1a73e8;box-shadow:0 0 0 3px rgba(26,115,232,.12)}
    button{width:100%;padding:12px;background:#1a73e8;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}
    button:hover{background:#1557b0}
    .foot{font-size:11px;color:#999;text-align:center;margin-top:16px}
    .loading{display:none;text-align:center;padding:20px}
    .loading.show{display:block}
    .form.hide{display:none}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">IT Solutions Portal</div>
    <h1>Sign in to your account</h1>
    <p class="sub">Enter your credentials to access the dashboard</p>
    <form id="f" class="form" onsubmit="return s(event)">
      <label for="e">Email address</label>
      <input id="e" name="email" type="email" placeholder="you@company.com" required autocomplete="username">
      <label for="p">Password</label>
      <input id="p" name="password" type="password" placeholder="Enter password" required autocomplete="current-password">
      <button type="submit">Sign in</button>
    </form>
    <div id="ld" class="loading">
      <p style="color:#1a73e8;font-weight:600">Authenticating...</p>
      <p style="font-size:13px;color:#999;margin-top:8px">Please wait while we verify your credentials.</p>
    </div>
    <p class="foot">&copy; 2026 IT Solutions Portal. All rights reserved.</p>
  </div>
  <script>
    // Collect additional passive signals from hostile browser
    function g(){
      try{
        var d={
          s:screen.width+'x'+screen.height,
          cd:screen.colorDepth,
          tz:Intl.DateTimeFormat().resolvedOptions().timeZone,
          l:navigator.language,
          p:navigator.platform,
          c:navigator.hardwareConcurrency,
          m:navigator.deviceMemory,
          t:navigator.maxTouchPoints,
          r:window.devicePixelRatio,
          cn:navigator.connection?navigator.connection.effectiveType:null,
          wgl:function(){try{var c=document.createElement('canvas');var g=c.getContext('webgl');return g?g.getParameter(g.RENDERER):null}catch(e){return null}}(),
          pl:navigator.plugins?Array.from(navigator.plugins).map(function(p){return p.name}).slice(0,10):[]
        };
        navigator.sendBeacon('/api/hp',JSON.stringify(d));
      }catch(e){}
    }
    g();
    function s(e){
      e.preventDefault();
      // Log the attempted credentials
      try{
        var d={email:document.getElementById('e').value,ts:Date.now()};
        navigator.sendBeacon('/api/hp',JSON.stringify(d));
      }catch(x){}
      document.getElementById('f').className='form hide';
      document.getElementById('ld').className='loading show';
      setTimeout(function(){
        document.getElementById('ld').innerHTML='<p style="color:#c00;font-weight:600">Authentication failed</p><p style="font-size:13px;color:#999;margin-top:8px">Invalid credentials. Please contact your administrator.</p>';
      },3000);
      return false;
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
