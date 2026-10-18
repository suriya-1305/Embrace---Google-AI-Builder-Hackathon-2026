param(
  [string]$ProjectId = '',
  [string]$SiteId = ''
)

$ErrorActionPreference = 'Stop'
$gcloud = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
if (-not (Test-Path $gcloud)) { throw 'Google Cloud CLI was not found in the standard Windows install location.' }
if (-not $ProjectId) { $ProjectId = (& $gcloud config get-value project).Trim() }
if (-not $ProjectId -or $ProjectId -eq '(unset)') { throw 'Pass -ProjectId or set the active gcloud project.' }
if (-not $SiteId) { $SiteId = $ProjectId }

$repoRoot = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $repoRoot 'frontend\dist'
$firebaseJsonPath = Join-Path $repoRoot 'firebase\firebase.json'
if (-not (Test-Path $dist)) { throw 'frontend/dist was not found. Build the frontend first.' }

$firebaseJson = Get-Content $firebaseJsonPath -Raw | ConvertFrom-Json
$hosting = $firebaseJson.hosting
$servingConfig = @{}
if ($hosting.headers) {
  $servingConfig.headers = @(
    foreach ($entry in $hosting.headers) {
      $headerValues = @{}
      foreach ($header in $entry.headers) { $headerValues[$header.key] = $header.value }
      @{ glob = $entry.source; headers = $headerValues }
    }
  )
}

$token = (& $gcloud auth print-access-token).Trim()
if (-not $token) { throw 'No gcloud access token is available. Run gcloud auth login first.' }
$headers = @{ Authorization = "Bearer $token"; 'X-Goog-User-Project' = $ProjectId }
$apiBase = 'https://firebasehosting.googleapis.com/v1beta1'
$sitePath = "projects/$ProjectId/sites/$SiteId"

$files = Get-ChildItem $dist -File -Recurse
if (-not $files) { throw 'frontend/dist is empty.' }
$fileHashes = @{}
$compressedFiles = @{}
$sha256 = [System.Security.Cryptography.SHA256]::Create()

foreach ($file in $files) {
  $relative = $file.FullName.Substring($dist.Length).TrimStart('\').Replace('\', '/')
  $path = "/$relative"
  $raw = [System.IO.File]::ReadAllBytes($file.FullName)
  $buffer = New-Object System.IO.MemoryStream
  $gzip = New-Object System.IO.Compression.GzipStream($buffer, [System.IO.Compression.CompressionLevel]::Optimal, $true)
  $gzip.Write($raw, 0, $raw.Length)
  $gzip.Dispose()
  $compressed = $buffer.ToArray()
  $buffer.Dispose()
  $digest = $sha256.ComputeHash($compressed)
  $hash = ([System.BitConverter]::ToString($digest)).Replace('-', '').ToLowerInvariant()
  $fileHashes[$path] = $hash
  $compressedFiles[$hash] = $compressed
}
$sha256.Dispose()

$versionBody = @{ config = $servingConfig } | ConvertTo-Json -Depth 20 -Compress
$version = Invoke-RestMethod -Method Post -Uri "$apiBase/$sitePath/versions" -Headers $headers -ContentType 'application/json' -Body $versionBody
$versionName = $version.name
Write-Output "Created Hosting version $versionName with $($files.Count) files."

$populateBody = @{ files = $fileHashes } | ConvertTo-Json -Depth 10 -Compress
$populate = Invoke-RestMethod -Method Post -Uri "$apiBase/$versionName`:populateFiles" -Headers $headers -ContentType 'application/json' -Body $populateBody
foreach ($hash in $populate.uploadRequiredHashes) {
  $uploadUri = "$($populate.uploadUrl.TrimEnd('/'))/$hash"
  Invoke-WebRequest -Method Post -Uri $uploadUri -Headers $headers -ContentType 'application/octet-stream' -Body $compressedFiles[$hash] -UseBasicParsing | Out-Null
  Write-Output "Uploaded $hash."
}

$finalizeUri = "$apiBase/$versionName`?updateMask=status"
Invoke-RestMethod -Method Patch -Uri $finalizeUri -Headers $headers -ContentType 'application/json' -Body '{"status":"FINALIZED"}' | Out-Null
$releaseBody = @{ message = 'CrySense live deployment' } | ConvertTo-Json -Compress
$releaseVersionId = ($versionName -split '/')[-1]
$releaseVersionName = "sites/$SiteId/versions/$releaseVersionId"
$releaseUri = "$apiBase/$sitePath/releases?versionName=$([System.Uri]::EscapeDataString($releaseVersionName))"
$release = Invoke-RestMethod -Method Post -Uri $releaseUri -Headers $headers -ContentType 'application/json' -Body $releaseBody

Write-Output "Released $($release.name)."
Write-Output "Hosting URL: https://$SiteId.web.app"