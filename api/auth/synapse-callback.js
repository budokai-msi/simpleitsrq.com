/**
 * Synapse Google OAuth Callback Redirect Bridge
 * Endpoint: https://simpleitsrq.com/api/auth/synapse-callback
 * 
 * This serverless function acts as a secure HTTPS bridge. It intercepts
 * the callback query parameters from Google and forwards them back to the 
 * local Synapse desktop application running on port 3939.
 */
export default function handler(req, res) {
  const queryParams = new URLSearchParams(req.query).toString();
  
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Synapse Authentication Bridge</title>
      <style>
        body {
          background: #111019;
          color: #e0def4;
          font-family: system-ui, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
        }
        .card {
          background: #191724;
          border: 1px solid rgba(196, 167, 231, 0.2);
          border-radius: 12px;
          padding: 24px;
          text-align: center;
          box-shadow: 0 4px 20px rgba(0,0,0,0.4);
          max-width: 400px;
        }
        .spinner {
          border: 3px solid rgba(196, 167, 231, 0.1);
          border-top: 3px solid #c4a7e7;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          animation: spin 1s linear infinite;
          margin: 16px auto;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h3>Connecting to Synapse...</h3>
        <p style="color: #908caa; font-size: 13px;">Authorizing your local developer profile.</p>
        <div class="spinner"></div>
      </div>
      <script>
        // Forward credentials to the local Synapse desktop gateway server
        const localCallbackUrl = "http://127.0.0.1:3939/auth/google/callback?" + "${queryParams}";
        
        // Attempt redirect
        window.location.replace(localCallbackUrl);
        
        // Fallback info if local server is down
        setTimeout(() => {
          document.querySelector('h3').textContent = "Connection Refused";
          document.querySelector('p').innerHTML = "Ensure the Synapse desktop app is running on your machine, then <a href='" + localCallbackUrl + "' style='color: #c4a7e7;'>click here to retry</a>.";
          document.querySelector('.spinner').style.display = 'none';
        }, 3000);
      </script>
    </body>
    </html>
  `);
}
