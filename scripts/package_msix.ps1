# package_msix.ps1 — Build & Sign AetherFlow as an official Windows MSIX Package
# Enables Windows Package Identity for full Task Manager grouping of all child processes.

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path "$PSScriptRoot\.."
$SDKBin = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64"
$MakeAppx = Join-Path $SDKBin "makeappx.exe"
$SignTool = Join-Path $SDKBin "signtool.exe"

if (-not (Test-Path $MakeAppx)) {
    Write-Error "MakeAppx.exe not found at $MakeAppx"
}
if (-not (Test-Path $SignTool)) {
    Write-Error "SignTool.exe not found at $SignTool"
}

Write-Host "==> [1/5] Checking Code Signing Certificate..." -ForegroundColor Cyan
$PublisherName = "CN=AetherFlowDev"
$Cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq $PublisherName } | Select-Object -First 1

if (-not $Cert) {
    Write-Host "Creating local trusted developer certificate for AetherFlow..." -ForegroundColor Yellow
    $Cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $PublisherName `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -KeyExportPolicy Exportable `
        -KeySpec Signature `
        -NotAfter (Get-Date).AddYears(5)
    
    # Trust in TrustedPeople
    $TrustedStore = New-Object System.Security.Cryptography.X509Certificates.X509Store("TrustedPeople", "CurrentUser")
    $TrustedStore.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $TrustedStore.Add($Cert)
    $TrustedStore.Close()
    Write-Host "Certificate installed in CurrentUser\My and CurrentUser\TrustedPeople." -ForegroundColor Green
} else {
    # Ensure it's in TrustedPeople as well
    $InTrusted = Get-ChildItem Cert:\CurrentUser\TrustedPeople | Where-Object { $_.Thumbprint -eq $Cert.Thumbprint }
    if (-not $InTrusted) {
        $TrustedStore = New-Object System.Security.Cryptography.X509Certificates.X509Store("TrustedPeople", "CurrentUser")
        $TrustedStore.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
        $TrustedStore.Add($Cert)
        $TrustedStore.Close()
    }
    Write-Host "Found trusted certificate: $($Cert.Thumbprint)" -ForegroundColor Green
}

$TauriConf = Get-Content (Join-Path $ProjectRoot "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$AppVersion = $TauriConf.version

$DistDir   = Join-Path $ProjectRoot "packages"
$LayoutDir = Join-Path $DistDir "msix_layout"
$OutputMsix = Join-Path $DistDir "AetherFlow_${AppVersion}_x64.msix"

if (-not (Test-Path $DistDir)) {
    New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
}

# Clean up older package versions from packages directory
Get-ChildItem -Path $DistDir -Filter "*.msix" | Where-Object { $_.FullName -ne $OutputMsix } | Remove-Item -Force
Get-ChildItem -Path $DistDir -Filter "*-setup.exe" | Where-Object { $_.Name -ne "AetherFlow_${AppVersion}_x64-setup.exe" } | Remove-Item -Force

if (Test-Path $LayoutDir) {
    Remove-Item $LayoutDir -Recurse -Force
}
New-Item -ItemType Directory -Path $LayoutDir -Force | Out-Null
New-Item -ItemType Directory -Path "$LayoutDir\Assets" -Force | Out-Null
New-Item -ItemType Directory -Path "$LayoutDir\bin\mpv" -Force | Out-Null

Write-Host "==> [2/5] Staging Application Files..." -ForegroundColor Cyan
$ReleaseExe = Join-Path $ProjectRoot "src-tauri\target\release\aetherflow.exe"
if (-not (Test-Path $ReleaseExe)) {
    Write-Error "Release executable not found at $ReleaseExe. Please run 'cargo build --release' first."
}
Copy-Item $ReleaseExe "$LayoutDir\AetherFlow.exe" -Force

# Copy MPV and tools
Copy-Item "$ProjectRoot\src-tauri\bin\mpv\*" "$LayoutDir\bin\mpv" -Recurse -Force

# Copy Assets
$IconsDir = "$ProjectRoot\src-tauri\icons"
Copy-Item "$IconsDir\StoreLogo.png" "$LayoutDir\Assets\" -Force
Copy-Item "$IconsDir\Square44x44Logo.png" "$LayoutDir\Assets\" -Force
Copy-Item "$IconsDir\Square71x71Logo.png" "$LayoutDir\Assets\" -Force
Copy-Item "$IconsDir\Square150x150Logo.png" "$LayoutDir\Assets\" -Force
Copy-Item "$IconsDir\Square310x310Logo.png" "$LayoutDir\Assets\" -Force

Write-Host "==> [3/5] Generating AppxManifest.xml..." -ForegroundColor Cyan
$ManifestContent = @"
<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap rescap">

  <Identity
    Name="AetherFlow"
    Publisher="$PublisherName"
    Version="${AppVersion}.0"
    ProcessorArchitecture="x64" />

  <Properties>
    <DisplayName>AetherFlow</DisplayName>
    <PublisherDisplayName>AetherFlow</PublisherDisplayName>
    <Logo>Assets\StoreLogo.png</Logo>
    <Description>AetherFlow — Lightweight live wallpaper and theme engine for Windows</Description>
  </Properties>

  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>

  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>

  <Applications>
    <Application
      Id="App"
      Executable="AetherFlow.exe"
      EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="AetherFlow"
        Description="Lightweight live wallpaper and theme engine for Windows"
        BackgroundColor="transparent"
        Square150x150Logo="Assets\Square150x150Logo.png"
        Square44x44Logo="Assets\Square44x44Logo.png">
      </uap:VisualElements>
    </Application>
  </Applications>
</Package>
"@

Set-Content -Path "$LayoutDir\AppxManifest.xml" -Value $ManifestContent -Encoding UTF8

Write-Host "==> [4/5] Packing MSIX Package with MakeAppx..." -ForegroundColor Cyan
if (Test-Path $OutputMsix) {
    Remove-Item $OutputMsix -Force
}
& $MakeAppx pack /d $LayoutDir /p $OutputMsix /o /nv
if ($LASTEXITCODE -ne 0) {
    Write-Error "MakeAppx pack failed with exit code $LASTEXITCODE"
}

Write-Host "==> [5/5] Digitally Signing MSIX with SignTool..." -ForegroundColor Cyan
& $SignTool sign /fd SHA256 /sha1 $Cert.Thumbprint /v $OutputMsix
if ($LASTEXITCODE -ne 0) {
    Write-Error "SignTool failed with exit code $LASTEXITCODE"
}

# Clean up layout staging directory to keep packages directory clean
if (Test-Path $LayoutDir) {
    Remove-Item $LayoutDir -Recurse -Force
}

# Copy NSIS installer if matching version is available
$NsisSource = Join-Path $ProjectRoot "src-tauri\target\release\bundle\nsis\AetherFlow_${AppVersion}_x64-setup.exe"
if (Test-Path $NsisSource) {
    Copy-Item $NsisSource "$DistDir\AetherFlow_${AppVersion}_x64-setup.exe" -Force
}

Write-Host "`nSUCCESS! Production Packages created in:" -ForegroundColor Green
Write-Host "$DistDir" -ForegroundColor Yellow
$SizeMB = [math]::Round(((Get-Item $OutputMsix).Length / 1MB), 2)
Write-Host "  1. MSIX: AetherFlow_${AppVersion}_x64.msix ($SizeMB MB)" -ForegroundColor Cyan
if (Test-Path "$DistDir\AetherFlow_${AppVersion}_x64-setup.exe") {
    $NsisMB = [math]::Round(((Get-Item "$DistDir\AetherFlow_${AppVersion}_x64-setup.exe").Length / 1MB), 2)
    Write-Host "  2. NSIS: AetherFlow_${AppVersion}_x64-setup.exe ($NsisMB MB)" -ForegroundColor Cyan
}
