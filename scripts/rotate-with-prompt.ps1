# Prompts for Neon API key with hidden input, then runs the rotation.
# Key never appears on screen, in chat, or in command history.

$secure = Read-Host -AsSecureString -Prompt "Paste new Neon API key (hidden)"
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$env:NEON_API_KEY = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

if (-not $env:NEON_API_KEY -or -not $env:NEON_API_KEY.StartsWith("napi_")) {
  Write-Host "ERROR: key doesn't look right (must start with napi_)" -ForegroundColor Red
  exit 1
}
Write-Host "key accepted (length $($env:NEON_API_KEY.Length))" -ForegroundColor Green
& "$PSScriptRoot\rotate-neon-password.ps1"
