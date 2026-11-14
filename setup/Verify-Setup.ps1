$ErrorActionPreference='Stop'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'H3X-Setup.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors|Out-String)}
$node=$ast.Find({param($n) $n -is [Management.Automation.Language.ScriptBlockExpressionAst] -and $n.Parent.Parent -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Parent.Parent.Left.Extent.Text -eq '$worker'},$true)
if(!$node){throw 'Setup worker was not found.'}
$worker=$node.ScriptBlock.GetScriptBlock()
$payload=[Text.Encoding]::UTF8.GetBytes('mock installer; never executed')
$sha=[Security.Cryptography.SHA256]::Create()
$hash=([BitConverter]::ToString($sha.ComputeHash($payload))).Replace('-','').ToLowerInvariant();$sha.Dispose()
$name='H3X-Searcher-Setup-0.2.3-x64.exe'
$base='https://github.com/lez337/H3X-searcher-web-and-desktop/releases/download/v0.2.3/'
function New-Release {
    @{tag_name='v0.2.3';draft=$false;prerelease=$false;assets=@(
        @{name=$name;browser_download_url=$base+$name;size=$payload.Length},
        @{name='SHA256SUMS.txt';browser_download_url=$base+'SHA256SUMS.txt'}
    )}
}
function Invoke-RestMethod {param($Uri,$Headers,$TimeoutSec) return $script:testRelease}
function Invoke-WebRequest {
    param($Uri,$OutFile,$TimeoutSec,[switch]$UseBasicParsing)
    if($Uri.EndsWith('SHA256SUMS.txt')){[IO.File]::WriteAllText($OutFile,$script:checks)}
    else{[IO.File]::WriteAllBytes($OutFile,$payload)}
}
function Start-Process {param($FilePath,$ArgumentList,[switch]$PassThru,[switch]$Wait,$WindowStyle)
    if($ArgumentList -ne '/S' -or $WindowStyle -ne 'Hidden'){throw 'Installer must run silently.'}
    $script:launches++;[pscustomobject]@{ExitCode=0}
}
function Check([string]$label,[scriptblock]$change,[bool]$valid,[string]$mode='verify'){
    $script:testRelease=New-Release;$script:checks="$hash  $name`n";$script:launches=0
    & $change
    $results=@(& $worker $mode 'lez337/H3X-searcher-web-and-desktop' '')
    $failed=@($results|Where-Object {$_.failed}).Count -gt 0
    if($failed -eq $valid){throw "$label returned the wrong result: $($results|ConvertTo-Json -Compress)"}
    if($valid -and $mode -eq 'verify' -and !($results|Where-Object {$_.verified})){throw "$label did not verify the download."}
    $expected=if($valid -and $mode -eq 'install'){1}else{0}
    if($script:launches -ne $expected){throw "$label launched an unverified installer."}
    Write-Output "PASS: $label"
}
Check 'valid download without installation' {} $true
Check 'verified silent installation' {} $true 'install'
Check 'checksum mismatch' {$script:checks=('0'*64)+"  $name`n"} $false
Check 'wrong checksum filename' {$script:checks="$hash  wrong.exe`n"} $false
Check 'size mismatch' {$script:testRelease.assets[0].size++} $false
Check 'missing installer' {$script:testRelease.assets=@($script:testRelease.assets[1])} $false
Check 'unexpected download host' {$script:testRelease.assets[0].browser_download_url='https://example.com/setup.exe'} $false
Check 'prerelease' {$script:testRelease.prerelease=$true} $false
Check 'draft release' {$script:testRelease.draft=$true} $false
Check 'invalid version tag' {$script:testRelease.tag_name='latest'} $false
Check 'reusable launcher downloads versioned payload' {
    $script:testRelease.assets+=@{name='H3X-Setup.exe';browser_download_url=$base+'H3X-Setup.exe';size=1;digest=('sha256:'+('0'*64))}
} $true 'install'
function Set-SingleRelease {
    $script:testRelease.assets=@(@{name='H3X-Setup.exe';browser_download_url=$base+'H3X-Setup.exe';size=$payload.Length;digest="sha256:$hash"})
}
Check 'single EXE with GitHub digest' {Set-SingleRelease} $true
Check 'single EXE silent installation' {Set-SingleRelease} $true 'install'
Check 'single EXE digest mismatch' {Set-SingleRelease;$script:testRelease.assets[0].digest='sha256:'+('0'*64)} $false
Check 'single EXE without checksum file or digest' {Set-SingleRelease;$script:testRelease.assets[0].Remove('digest')} $true
Check 'single EXE without digest installs silently' {Set-SingleRelease;$script:testRelease.assets[0].Remove('digest')} $true 'install'
Check 'single EXE without digest rejects wrong size' {Set-SingleRelease;$script:testRelease.assets[0].Remove('digest');$script:testRelease.assets[0].size++} $false
Check 'single EXE rejects invalid size' {Set-SingleRelease;$script:testRelease.assets[0].size=0} $false
Check 'single EXE unexpected host' {Set-SingleRelease;$script:testRelease.assets[0].browser_download_url='https://example.com/H3X-Setup.exe'} $false
