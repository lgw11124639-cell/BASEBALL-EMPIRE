param([string]$ApkPath,[string]$DeviceSerial)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$package = 'com.baseballempire.game'
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (!(Test-Path $adb)) { $adb = (Get-Command adb -ErrorAction Stop).Source }
if (!$ApkPath) {
    $picker = New-Object System.Windows.Forms.OpenFileDialog
    $picker.Filter = 'Android APK (*.apk)|*.apk'
    $picker.Title = 'Choose the new BASEBALL EMPIRE APK'
    if ($picker.ShowDialog() -ne 'OK') { exit }
    $ApkPath = $picker.FileName
}
$ApkPath = (Resolve-Path $ApkPath).Path
function Quote-Arg([string]$value) {
    if ($value -notmatch '[\s"]') { return $value }
    return '"' + ([regex]::Replace($value, '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1') + '"'
}
function Invoke-Adb([string[]]$Arguments,[string]$OutputFile,[string]$InputFile) {
    if ($script:DeviceSerial) { $Arguments = @('-s',$script:DeviceSerial) + $Arguments }
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $adb
    $info.Arguments = (($Arguments | ForEach-Object { Quote-Arg $_ }) -join ' ')
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.RedirectStandardInput = [bool]$InputFile
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info
    [void]$process.Start()
    $errors = $process.StandardError.ReadToEndAsync()
    if ($OutputFile) {
        $file = [IO.File]::Create($OutputFile)
        try { $copy = $process.StandardOutput.BaseStream.CopyToAsync($file); if (!$copy.Wait(180000)) { $process.Kill(); throw 'Backup transfer timed out. Existing app was not removed.' } }
        finally { $file.Dispose() }
        $text = ''
    } else { $output = $process.StandardOutput.ReadToEndAsync() }
    if ($InputFile) {
        $file = [IO.File]::OpenRead($InputFile)
        try { $file.CopyTo($process.StandardInput.BaseStream) }
        finally { $file.Dispose(); $process.StandardInput.Close() }
    }
    if (!$process.WaitForExit(180000)) { $process.Kill(); throw 'ADB command timed out.' }
    if (!$OutputFile) { $text = $output.Result }
    return @{ Code=$process.ExitCode; Out=$text; Err=$errors.Result }
}
function Require-OK($result,[string]$message) { if ($result.Code -ne 0) { throw ($message + "`n" + $result.Out + $result.Err) } }
function Restore-AppData([string]$archive) {
    $remote = '/data/local/tmp/baseball-empire-migration.tar'
    Require-OK (Invoke-Adb -Arguments @('push',$archive,$remote)) 'Could not transfer the saved data.'
    Require-OK (Invoke-Adb -Arguments @('shell','run-as',$package,'tar','-xf',$remote)) 'Could not restore app data. Keep the PC backup and original APK.'
    [void](Invoke-Adb -Arguments @('shell','rm',$remote))
}
try {
    if (!$DeviceSerial) {
        $devices = Invoke-Adb -Arguments @('devices')
        $rows = @($devices.Out -split "`r?`n" | Where-Object { $_ -match '^\S+\s+device$' })
        if ($rows.Count -ne 1) { throw 'Connect exactly one running Android emulator, or specify -DeviceSerial.' }
        $script:DeviceSerial = ($rows[0] -split '\s+')[0]
    }
    $installed = Invoke-Adb -Arguments @('shell','pm','path',$package)
    $archive = $null
    if ($installed.Out -match 'package:') {
        Require-OK (Invoke-Adb -Arguments @('shell','am','force-stop',$package)) 'Could not stop the game.'
        $folder = Join-Path $env:LOCALAPPDATA ('BaseballEmpire\Backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
        [void](New-Item -ItemType Directory -Path $folder -Force)
        $archive = Join-Path $folder 'app-data.tar'
        $directories = Invoke-Adb -Arguments @('shell','run-as',$package,'ls')
        Require-OK $directories 'The installed app does not allow private data export. It was not removed.'
        $names = @($directories.Out -split "`r?`n" | Where-Object { $_ -in @('app_webview','files','shared_prefs','databases') })
        if ($names -notcontains 'app_webview') { throw 'WebView save directory missing. Existing app was not removed.' }
        Require-OK (Invoke-Adb -Arguments (@('exec-out','run-as',$package,'tar','-cf','-') + $names) -OutputFile $archive) 'Data backup failed. Existing app was not removed.'
        $listing = & tar.exe -tf $archive 2>&1
        if ($LASTEXITCODE -ne 0 -or !(($listing -join "`n") -match 'IndexedDB')) { throw 'Could not verify the saved database in the archive. Existing app was not removed.' }
        $hash = (Get-FileHash $archive -Algorithm SHA256).Hash
        Set-Content -LiteralPath ($archive+'.sha256') -Value $hash -Encoding ASCII
        $paths = @($installed.Out -split "`r?`n" | Where-Object { $_ -match '^package:' })
        if ($paths.Count -ne 1) { throw 'Split APK migration is not supported. Existing app and PC backup are unchanged.' }
        $oldApk = Join-Path $folder 'original-installed.apk'
        Require-OK (Invoke-Adb -Arguments @('pull',($paths[0] -replace '^package:',''),$oldApk)) 'Could not preserve the original installer. Existing app was not removed.'
        Write-Host "Verified PC backup: $folder"
    }
    $result = Invoke-Adb -Arguments @('install','-r',$ApkPath)
    if ($result.Code -ne 0 -and ($result.Out+$result.Err) -match 'INSTALL_FAILED_UPDATE_INCOMPATIBLE') {
        if (!$archive) { throw 'Signature mismatch without a verified backup. Nothing was removed.' }
        Write-Host 'The legacy trial used a different signature. Both its app data and original installer are now backed up.'
        $answer = Read-Host 'Replace that legacy trial and restore its saved data? Type YES to continue, anything else to cancel'
        if ($answer -cne 'YES') { Write-Host 'Cancelled. Existing game and PC backup are intact.'; exit }
        Require-OK (Invoke-Adb -Arguments @('uninstall',$package)) 'Could not remove the legacy trial.'
        $result = Invoke-Adb -Arguments @('install',$ApkPath)
        if ($result.Code -ne 0) {
            Require-OK (Invoke-Adb -Arguments @('install',$oldApk)) 'Could not reinstall the original app. Keep the PC backup.'
            Restore-AppData $archive
            throw 'New APK could not be installed. Original app and saved data were restored.'
        }
        Restore-AppData $archive
    } else { Require-OK $result 'APK installation failed. Existing app was not removed.' }
    Require-OK (Invoke-Adb -Arguments @('shell','am','start','-n',($package+'/.MainActivity'))) 'Could not open the game.'
    Write-Host 'Update complete. Check Continue and the saved date. Keep the PC backup until verified.'
} catch { Write-Error $_; exit 1 }
