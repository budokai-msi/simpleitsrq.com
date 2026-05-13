# Creates Stripe Products + Prices + Coupon + Promotion Code + 4 Payment Links
# for the /leadgen monetization surface. Uses the authenticated stripe CLI.
# Pass -Live to target live mode; default is test.

param(
    [switch]$Live
)

$ErrorActionPreference = "Stop"
$liveArg = if ($Live) { @("--live") } else { @() }
$keyArg  = if ($env:STRIPE_API_KEY) { @("--api-key", $env:STRIPE_API_KEY) } else { @() }

function Invoke-Stripe {
    param([string[]]$StripeArgs)
    $allArgs = @() + $StripeArgs + $liveArg + $keyArg
    $raw = & stripe @allArgs 2>&1
    $exit = $LASTEXITCODE
    # Stripe CLI sometimes exits non-zero with valid JSON output. Try parse.
    $text = ($raw | Out-String).Trim()
    if (-not $text) {
        throw "stripe call empty (exit=$exit args=$($StripeArgs -join ' '))"
    }
    try {
        return $text | ConvertFrom-Json
    } catch {
        Write-Host "FAIL parse: $text"
        throw
    }
}

Write-Host "=== Creating Products ==="
$starter = Invoke-Stripe @(
    "products","create",
    "-d","name=Leadgen Starter",
    "-d","description=SWFL B2B lead generation - Starter tier (up to 250 verified contacts/mo, shared outreach pool)",
    "-d","metadata[tier]=starter",
    "-d","metadata[surface]=leadgen"
)
Write-Host "Starter product: $($starter.id)"

$growth = Invoke-Stripe @(
    "products","create",
    "-d","name=Leadgen Growth",
    "-d","description=SWFL B2B lead generation - Growth tier (up to 1500 verified contacts/mo, dedicated outreach + reply triage)",
    "-d","metadata[tier]=growth",
    "-d","metadata[surface]=leadgen"
)
Write-Host "Growth product:  $($growth.id)"

Write-Host "`n=== Creating Prices ==="
# Starter monthly $19
$starterMonthly = Invoke-Stripe @(
    "prices","create",
    "-d","product=$($starter.id)",
    "-d","unit_amount=1900",
    "-d","currency=usd",
    "-d","recurring[interval]=month",
    "-d","nickname=Starter Monthly",
    "-d","metadata[tier]=starter",
    "-d","metadata[cadence]=monthly"
)
# Starter annual $15/mo billed yearly = $180
$starterAnnual = Invoke-Stripe @(
    "prices","create",
    "-d","product=$($starter.id)",
    "-d","unit_amount=18000",
    "-d","currency=usd",
    "-d","recurring[interval]=year",
    "-d","nickname=Starter Annual",
    "-d","metadata[tier]=starter",
    "-d","metadata[cadence]=annual"
)
# Growth monthly $99
$growthMonthly = Invoke-Stripe @(
    "prices","create",
    "-d","product=$($growth.id)",
    "-d","unit_amount=9900",
    "-d","currency=usd",
    "-d","recurring[interval]=month",
    "-d","nickname=Growth Monthly",
    "-d","metadata[tier]=growth",
    "-d","metadata[cadence]=monthly"
)
# Growth annual $79/mo billed yearly = $948
$growthAnnual = Invoke-Stripe @(
    "prices","create",
    "-d","product=$($growth.id)",
    "-d","unit_amount=94800",
    "-d","currency=usd",
    "-d","recurring[interval]=year",
    "-d","nickname=Growth Annual",
    "-d","metadata[tier]=growth",
    "-d","metadata[cadence]=annual"
)
Write-Host "Starter monthly: $($starterMonthly.id)"
Write-Host "Starter annual:  $($starterAnnual.id)"
Write-Host "Growth  monthly: $($growthMonthly.id)"
Write-Host "Growth  annual:  $($growthAnnual.id)"

Write-Host "`n=== Creating Coupon + Promotion Code (LAUNCH20) ==="
$coupon = Invoke-Stripe @(
    "coupons","create",
    "-d","percent_off=20",
    "-d","duration=repeating",
    "-d","duration_in_months=3",
    "-d","name=Leadgen Launch 20",
    "-d","metadata[surface]=leadgen"
)
Write-Host "Coupon: $($coupon.id)"

$promo = Invoke-Stripe @(
    "promotion_codes","create",
    "-d","coupon=$($coupon.id)",
    "-d","code=LAUNCH20",
    "-d","metadata[surface]=leadgen"
)
Write-Host "Promotion code: $($promo.code) ($($promo.id))"

Write-Host "`n=== Creating Payment Links ==="
function New-Link {
    param([string]$priceId, [string]$tier, [string]$cadence)
    Invoke-Stripe @(
        "payment_links","create",
        "-d","line_items[0][price]=$priceId",
        "-d","line_items[0][quantity]=1",
        "-d","allow_promotion_codes=true",
        "-d","billing_address_collection=auto",
        "-d","after_completion[type]=redirect",
        "-d","after_completion[redirect][url]=https://simpleitsrq.com/leadgen?checkout=success&tier=$tier&cadence=$cadence",
        "-d","metadata[tier]=$tier",
        "-d","metadata[cadence]=$cadence",
        "-d","metadata[surface]=leadgen"
    )
}
$linkStarterMonthly = New-Link $starterMonthly.id "starter" "monthly"
$linkStarterAnnual  = New-Link $starterAnnual.id  "starter" "annual"
$linkGrowthMonthly  = New-Link $growthMonthly.id  "growth"  "monthly"
$linkGrowthAnnual   = New-Link $growthAnnual.id   "growth"  "annual"

$summary = [ordered]@{
    mode = if ($Live) { "live" } else { "test" }
    products = @{ starter = $starter.id; growth = $growth.id }
    prices = @{
        starter_monthly = $starterMonthly.id
        starter_annual  = $starterAnnual.id
        growth_monthly  = $growthMonthly.id
        growth_annual   = $growthAnnual.id
    }
    coupon = $coupon.id
    promotion_code = @{ id = $promo.id; code = $promo.code }
    payment_links = @{
        starter_monthly = $linkStarterMonthly.url
        starter_annual  = $linkStarterAnnual.url
        growth_monthly  = $linkGrowthMonthly.url
        growth_annual   = $linkGrowthAnnual.url
    }
}
$json = $summary | ConvertTo-Json -Depth 6
$outFile = if ($Live) { "scripts\stripe-leadgen-output.live.json" } else { "scripts\stripe-leadgen-output.test.json" }
$json | Set-Content -Path $outFile -Encoding UTF8
Write-Host "`n=== DONE ==="
Write-Host $json
Write-Host "`nSaved to $outFile"
