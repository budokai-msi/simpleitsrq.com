$pw = "npg_W0iwnCGDSvd8"
$pooled   = "postgresql://neondb_owner:$pw@ep-damp-cake-an6lqe3o-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
$unpooled = "postgresql://neondb_owner:$pw@ep-damp-cake-an6lqe3o.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require"

$updates = @(
  @{ name = "DATABASE_URL";              value = $pooled   },
  @{ name = "POSTGRES_URL";              value = $pooled   },
  @{ name = "POSTGRES_URL_NO_SSL";       value = $pooled   },
  @{ name = "POSTGRES_PRISMA_URL";       value = $pooled   },
  @{ name = "DATABASE_URL_UNPOOLED";     value = $unpooled },
  @{ name = "POSTGRES_URL_NON_POOLING";  value = $unpooled },
  @{ name = "POSTGRES_PASSWORD";         value = $pw       },
  @{ name = "PGPASSWORD";                value = $pw       }
)

foreach ($u in $updates) {
  Write-Host "==> $($u.name)" -ForegroundColor Cyan
  cmd /c "vercel env rm $($u.name) production --yes 1>NUL 2>NUL"
  cmd /c "vercel env rm $($u.name) preview --yes 1>NUL 2>NUL"
  cmd /c "vercel env rm $($u.name) development --yes 1>NUL 2>NUL"
  $u.value | & cmd /c "vercel env add $($u.name) production 1>NUL 2>NUL"
  $u.value | & cmd /c "vercel env add $($u.name) preview 1>NUL 2>NUL"
  $u.value | & cmd /c "vercel env add $($u.name) development 1>NUL 2>NUL"
  Write-Host "    done" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== verify ===" -ForegroundColor Yellow
cmd /c "vercel env ls production 2>&1" | Select-String "DATABASE_URL|POSTGRES|PGPASSWORD"
