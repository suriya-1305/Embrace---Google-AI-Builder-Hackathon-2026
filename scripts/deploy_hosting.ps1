param(
    [Parameter(Mandatory = $true)][string]$Project,
    [string]$Site
)

$ErrorActionPreference = 'Stop'
if (-not $Site) {
    $Site = if ($Project -eq 'dauntless-ember-511818-g5') { 'embrace-family' } else { $Project }
}
$root = Split-Path $PSScriptRoot -Parent
$gcloud = Join-Path $env:LOCALAPPDATA 'Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd'
if (Get-Command gcloud -ErrorAction SilentlyContinue) { $gcloud = 'gcloud' }
$accessToken = & $gcloud auth print-access-token
if ($LASTEXITCODE -ne 0) { throw 'Google Cloud authentication failed.' }
$requestHeaders = @{ Authorization = "Bearer $accessToken"; 'x-goog-user-project' = $Project }

try {
    $base = 'https://firebasehosting.googleapis.com/v1beta1'
    $hosting = (Get-Content (Join-Path $root 'firebase/firebase.json') -Raw | ConvertFrom-Json).hosting
    $headerRules = foreach ($rule in $hosting.headers) {
        $headerMap = @{}
        foreach ($header in $rule.headers) { $headerMap[$header.key] = $header.value }
        @{ glob = $rule.source; headers = $headerMap }
    }
    $versionBody = @{ config = @{ headers = @($headerRules) } } | ConvertTo-Json -Depth 8
    $version = Invoke-RestMethod -Method Post -Uri "$base/sites/$Site/versions" -Headers $requestHeaders -ContentType 'application/json' -Body $versionBody
    $dist = Get-Item (Join-Path $root 'frontend/dist')
    $files = @{}
    $uploads = @{}
    foreach ($file in (Get-ChildItem $dist.FullName -Recurse -File | Where-Object { $_.Name -notlike '.*' })) {
        $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
        $stream = New-Object System.IO.MemoryStream
        $gzip = New-Object System.IO.Compression.GZipStream($stream, [System.IO.Compression.CompressionLevel]::Optimal, $true)
        $gzip.Write($bytes, 0, $bytes.Length)
        $gzip.Dispose()
        $compressed = $stream.ToArray()
        $stream.Dispose()
        $sha = [System.Security.Cryptography.SHA256]::Create()
        $hash = ([System.BitConverter]::ToString($sha.ComputeHash($compressed))).Replace('-', '').ToLowerInvariant()
        $sha.Dispose()
        $relativePath = '/' + $file.FullName.Substring($dist.FullName.Length).TrimStart('\').Replace('\', '/')
        $files[$relativePath] = $hash
        $uploads[$hash] = $compressed
    }
    if ($files.Count -eq 0 -or $files.Count -gt 1000) { throw 'Expected 1 to 1,000 built files.' }
    $manifest = @{ files = $files } | ConvertTo-Json -Depth 4
    $populate = Invoke-RestMethod -Method Post -Uri "$base/$($version.name):populateFiles" -Headers $requestHeaders -ContentType 'application/json' -Body $manifest
    foreach ($hash in $populate.uploadRequiredHashes) {
        Invoke-RestMethod -Method Post -Uri "$($populate.uploadUrl)/$hash" -Headers $requestHeaders -ContentType 'application/octet-stream' -Body $uploads[$hash] | Out-Null
    }
    $finalized = Invoke-RestMethod -Method Patch -Uri "$base/$($version.name)?update_mask=status" -Headers $requestHeaders -ContentType 'application/json' -Body '{"status":"FINALIZED"}'
    if ($finalized.status -ne 'FINALIZED') { throw 'Hosting version did not finalize.' }
    $release = Invoke-RestMethod -Method Post -Uri "$base/sites/$Site/releases?versionName=$($version.name)" -Headers $requestHeaders -ContentType 'application/json' -Body '{}'
    Write-Output "Hosting deployed: https://$Site.web.app; files: $($files.Count); release: $($release.name)"
} finally {
    $accessToken = $null
    $requestHeaders = $null
}