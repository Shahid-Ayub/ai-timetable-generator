$pngPath = "C:\Users\Ubaid Ullah\.gemini\antigravity\brain\85f3a9a4-463a-4044-ba4a-ff74a60e213e\timetable_app_icon_1779379354941.png"
$icoPath = "d:\timetable generator\app_logo.ico"
$shortcutPath = "C:\Users\Ubaid Ullah\Desktop\Timetable Generator.lnk"
$serverScript = "d:\timetable generator\run_server.ps1"

# 1. Create standard PNG-in-ICO file
$pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
$pngSize = $pngBytes.Length

$icoHeader = New-Object byte[] 22
$icoHeader[0] = 0; $icoHeader[1] = 0; $icoHeader[2] = 1; $icoHeader[3] = 0; $icoHeader[4] = 1; $icoHeader[5] = 0
$icoHeader[6] = 0; $icoHeader[7] = 0; $icoHeader[8] = 0; $icoHeader[9] = 0
$icoHeader[10] = 1; $icoHeader[11] = 0
$icoHeader[12] = 32; $icoHeader[13] = 0
$icoHeader[14] = [byte]($pngSize -band 0xFF)
$icoHeader[15] = [byte](($pngSize -shr 8) -band 0xFF)
$icoHeader[16] = [byte](($pngSize -shr 16) -band 0xFF)
$icoHeader[17] = [byte](($pngSize -shr 24) -band 0xFF)
$icoHeader[18] = 22; $icoHeader[19] = 0; $icoHeader[20] = 0; $icoHeader[21] = 0

$fs = [System.IO.File]::Create($icoPath)
$fs.Write($icoHeader, 0, $icoHeader.Length)
$fs.Write($pngBytes, 0, $pngBytes.Length)
$fs.Close()
Write-Host "Created valid app_logo.ico"

# 2. Remove old shortcut file to bypass Windows explorer link cache
if (Test-Path $shortcutPath) {
    Remove-Item $shortcutPath -Force
    Start-Sleep -Seconds 1
}

# 3. Create the shortcut with fresh IconPath
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-NoExit -ExecutionPolicy Bypass -File `"$serverScript`""
$Shortcut.WorkingDirectory = "d:\timetable generator"
$Shortcut.IconLocation = "$icoPath,0"
$Shortcut.Description = "University Timetable AI Planner & Scheduler"
$Shortcut.Save()
Write-Host "Created new shortcut linking to app_logo.ico,0"

# 4. Trigger Win32 refresh
$code = @'
using System;
using System.Runtime.InteropServices;

public class Win32Shell {
    [DllImport("shell32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
'@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
[Win32Shell]::SHChangeNotify(0x08000000, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero)
Write-Host "Flushed shell icon cache."
