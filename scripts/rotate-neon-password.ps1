# Rotates the Neon DB password via Neon REST API and pushes it to Vercel.
# New password is never echoed to stdout.

$ErrorActionPreference = "Stop"

if (-not $env:NEON_API_KEY) {
  Write-Host "ERROR: NEON_API_KEY env var not set" -ForegroundColor Red
  exit 1
}

$projectId = "frosty-field-81549545"
$branchId  = "br-lucky-dust-an7rzz55"
$endpoint  = "ep-damp-cake-an6lqe3o"
$role      = "neondb_owner"

$headers = @{ Authorization = "Bearer $env:NEON_API_KEY"; Accept = "application/json" }

Write-Host "==> rotating Neon password for role $role" -ForegroundColor Cyan
$resetUrl = "https://console.neon.tech/api/v2/projects/$projectId/branches/$branchId/roles/$role/reset_password"
try {
  $resp = Invoke-RestMethod -Method Post -Uri $resetUrl -Headers $headers
} catch {
  Write-Host "ERROR: reset_password failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
$newPw = $resp.role.password
$opId  = $resp.operations[0].id
if (-not $newPw) { Write-Host "ERROR: no password returned" -ForegroundColor Red; exit 1 }
Write-Host "    new password issued (length $($newPw.Length))" -ForegroundColor Green

Write-Host "==> waiting for Neon to apply config..." -ForegroundColor Cyan
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 2
  $op = Invoke-RestMethod -Uri "https://console.neon.tech/api/v2/projects/$projectId/operations/$opId" -Headers $headers
  $st = $op.operation.status
  Write-Host "    [$($i+1)] $st" -ForegroundColor DarkGray
  if ($st -eq "finished") { break }
  if ($st -eq "failed")   { Write-Host "ERROR: apply_config failed" -ForegroundColor Red; exit 1 }
}

$pooled   = "postgresql://${role}:${newPw}@${endpoint}-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
$unpooled = "postgresql://${role}:${newPw}@${endpoint}.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require"

$updates = @(
  @{ name = "DATABASE_URL";              value = $pooled   },
  @{ name = "POSTGRES_URL";              value = $pooled   },
  @{ name = "POSTGRES_URL_NO_SSL";       value = $pooled   },
  @{ name = "POSTGRES_PRISMA_URL";       value = $pooled   },
  @{ name = "DATABASE_URL_UNPOOLED";     value = $unpooled },
  @{ name = "POSTGRES_URL_NON_POOLING";  value = $unpooled },
  @{ name = "POSTGRES_PASSWORD";         value = $newPw    },
  @{ name = "PGPASSWORD";                value = $newPw    }
)

Write-Host "==> pushing 8 env vars to Vercel" -ForegroundColor Cyan
foreach ($u in $updates) {
  cmd /c "vercel env rm $($u.name) production --yes 1>NUL 2>NUL"
  cmd /c "vercel env rm $($u.name) preview --yes 1>NUL 2>NUL"
  cmd /c "vercel env rm $($u.name) development --yes 1>NUL 2>NUL"
  $u.value | & cmd /c "vercel env add $($u.name) production 1>NUL 2>NUL"
  $u.value | & cmd /c "vercel env add $($u.name) preview 1>NUL 2>NUL"
  $u.value | & cmd /c "vercel env add $($u.name) development 1>NUL 2>NUL"
  Write-Host "    $($u.name)" -ForegroundColor DarkGreen
}

Write-Host "==> finding last Ready production deployment" -ForegroundColor Cyan
$lsOut = cmd /c "vercel ls simpleitsrq-com --prod --scope danch0 2>&1"
$ready = $lsOut | Select-String "Ready\s+Production" | Select-Object -First 1
$url = ([regex]::Match($ready.Line, "https://[^\s]+\.vercel\.app")).Value
Write-Host "    redeploying $url" -ForegroundColor DarkGreen
$deployOut = cmd /c "vercel redeploy $url --scope danch0 2>&1"
$newUrl = ($deployOut | Select-String "Production:" | ForEach-Object {
  ([regex]::Match($_.Line, "https://[^\s]+\.vercel\.app")).Value
} | Select-Object -First 1)
Write-Host "    new deployment: $newUrl" -ForegroundColor Green

Write-Host "==> waiting 25s for deploy + alias..." -ForegroundColor Cyan
Start-Sleep -Seconds 25

Write-Host "==> verifying /api/auth/login" -ForegroundColor Cyan
try {
  $r = Invoke-WebRequest -Uri "https://simpleitsrq.com/api/auth/login?provider=google" -MaximumRedirection 0 -UseBasicParsing -ErrorAction Stop
  Write-Host "    unexpected status $($r.StatusCode)" -ForegroundColor Yellow
} catch {
  $code = [int]$_.Exception.Response.StatusCode
  $loc  = $_.Exception.Response.Headers["Location"]
  if ($code -eq 302 -and $loc -like "*accounts.google.com*") {
    Write-Host "    OK 302 -> Google" -ForegroundColor Green
  } else {
    Write-Host "    UNEXPECTED $code -> $loc" -ForegroundColor Yellow
  }
}

$newPw = $null; [GC]::Collect()
Write-Host ""
Write-Host "==> rotation complete. new password is in Vercel only." -ForegroundColor Green
