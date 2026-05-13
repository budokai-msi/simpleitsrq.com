# Creates Stripe Products + Prices + Coupon + Promotion Code + 4 Payment Links
# for the /leadgen monetization surface. Uses the Stripe REST API directly.
# Pass -Live to target live mode; default is test.

param(
    [switch]$Live
)

$ErrorActionPreference = "Stop"

$apiKey = $env:STRIPE_API_KEY
if (-not $apiKey) {
    throw "STRIPE_API_KEY environment variable is required."
}

$baseUrl = if ($Live) { "https://api.stripe.com/v1" } else { "https://api.stripe.com/v1" }
# Stripe API keys encode the mode (pk_/sk_test_ vs pk_/sk_live_); the endpoint is the same.

function Invoke-StripeApi {
    param(
        [string]$Method = "POST",
        [string]$Path,
        [hashtable]$Body = @{}
    )
    $uri = "$baseUrl/$Path"
    $headers = @{
        Authorization = "Basic $([Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${apiKey}:")))"
    }

    # Build form-encoded body
    $form = [System.Collections.Generic.List[string]]::new()
    foreach ($k in $Body.Keys) {
        $form.Add("$k=$([Uri]::EscapeDataString($Body[$k]))")
    }
    $formBody = $form -join "&"

    try {
        $response = Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers -ContentType "application/x-www-form-urlencoded" -Body $formBody
        return $response
    } catch {
        $err = $_.ErrorDetails.Message
        if (-not $err) { $err = $_.Exception.Message }
        Write-Host "Stripe API error: $err"
        throw
    }
}

Write-Host "=== Creating Products ==="
$starter = Invoke-StripeApi -Path "products" -Body @{
    name = "Leadgen Starter"
    description = "SWFL B2B lead generation - Starter tier (up to 250 verified contacts/mo, shared outreach pool)"
    "metadata[tier]" = "starter"
    "metadata[surface]" = "leadgen"
}
Write-Host "Starter product: $($starter.id)"

$growth = Invoke-StripeApi -Path "products" -Body @{
    name = "Leadgen Growth"
    description = "SWFL B2B lead generation - Growth tier (up to 1500 verified contacts/mo, dedicated outreach + reply triage)"
    "metadata[tier]" = "growth"
    "metadata[surface]" = "leadgen"
}
Write-Host "Growth product:  $($growth.id)"

Write-Host "`n=== Creating Prices ==="
# Starter monthly $199
$starterMonthly = Invoke-StripeApi -Path "prices" -Body @{
    product = $starter.id
    unit_amount = "19900"
    currency = "usd"
    "recurring[interval]" = "month"
    nickname = "Starter Monthly"
    "metadata[tier]" = "starter"
    "metadata[cadence]" = "monthly"
}
# Starter annual $169/mo billed yearly = $2028
$starterAnnual = Invoke-StripeApi -Path "prices" -Body @{
    product = $starter.id
    unit_amount = "202800"
    currency = "usd"
    "recurring[interval]" = "year"
    nickname = "Starter Annual"
    "metadata[tier]" = "starter"
    "metadata[cadence]" = "annual"
}
# Growth monthly $499
$growthMonthly = Invoke-StripeApi -Path "prices" -Body @{
    product = $growth.id
    unit_amount = "49900"
    currency = "usd"
    "recurring[interval]" = "month"
    nickname = "Growth Monthly"
    "metadata[tier]" = "growth"
    "metadata[cadence]" = "monthly"
}
# Growth annual $419/mo billed yearly = $5028
$growthAnnual = Invoke-StripeApi -Path "prices" -Body @{
    product = $growth.id
    unit_amount = "502800"
    currency = "usd"
    "recurring[interval]" = "year"
    nickname = "Growth Annual"
    "metadata[tier]" = "growth"
    "metadata[cadence]" = "annual"
}
Write-Host "Starter monthly: $($starterMonthly.id)"
Write-Host "Starter annual:  $($starterAnnual.id)"
Write-Host "Growth  monthly: $($growthMonthly.id)"
Write-Host "Growth  annual:  $($growthAnnual.id)"

Write-Host "`n=== Creating Coupon + Promotion Code (LAUNCH20) ==="
$coupon = Invoke-StripeApi -Path "coupons" -Body @{
    percent_off = "20"
    duration = "repeating"
    duration_in_months = "3"
    name = "Leadgen Launch 20"
    "metadata[surface]" = "leadgen"
}
Write-Host "Coupon: $($coupon.id)"

$promo = Invoke-StripeApi -Path "promotion_codes" -Body @{
    coupon = $coupon.id
    code = "LAUNCH20"
    "metadata[surface]" = "leadgen"
}
Write-Host "Promotion code: $($promo.code) ($($promo.id))"

Write-Host "`n=== Creating Payment Links ==="
function New-Link {
    param([string]$priceId, [string]$tier, [string]$cadence)
    Invoke-StripeApi -Path "payment_links" -Body @{
        "line_items[0][price]" = $priceId
        "line_items[0][quantity]" = "1"
        allow_promotion_codes = "true"
        billing_address_collection = "auto"
        "after_completion[type]" = "redirect"
        "after_completion[redirect][url]" = "https://simpleitsrq.com/leadgen?checkout=success&tier=$tier&cadence=$cadence"
        "metadata[tier]" = $tier
        "metadata[cadence]" = $cadence
        "metadata[surface]" = "leadgen"
    }
}
$linkStarterMonthly = New-Link -priceId $starterMonthly.id -tier "starter" -cadence "monthly"
$linkStarterAnnual  = New-Link -priceId $starterAnnual.id  -tier "starter" -cadence "annual"
$linkGrowthMonthly  = New-Link -priceId $growthMonthly.id  -tier "growth"  -cadence "monthly"
$linkGrowthAnnual   = New-Link -priceId $growthAnnual.id   -tier "growth"  -cadence "annual"

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
