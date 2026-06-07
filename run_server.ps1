# SchedulerAI Native Windows PowerShell Web Server
# Serves the application on http://localhost:8000 and resolves browser CORS policies

$port = 8000
if ($args.Count -gt 0) {
    $port = [int]$args[0]
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
} catch {
    Write-Error "Failed to start server. The port $port might be in use or Administrator privileges are required."
    Exit
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " SchedulerAI PowerShell Web Server Running" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Serving files from: $(Get-Location)"
Write-Host "URL: http://localhost:$port"
Write-Host "Press [CTRL + C] in this window to stop the server."
Write-Host "==================================================" -ForegroundColor Cyan

# Open default web browser
Start-Process "http://localhost:$port/"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # Resolve requesting path
        $path = $request.Url.LocalPath
        if ($path -eq "/") { $path = "/index.html" }
        
        # Replace forward slashes with Windows backslashes for path join
        $relPath = $path.TrimStart('/').Replace('/', '\')
        $localFile = Join-Path (Get-Location) $relPath

        if (Test-Path $localFile -PathType Leaf) {
            # Read file bytes
            $bytes = [System.IO.File]::ReadAllBytes($localFile)
            
            # Resolve Content-Type header
            $ext = [System.IO.Path]::GetExtension($localFile).ToLower()
            $contentType = "text/plain"
            if ($ext -eq ".html") { $contentType = "text/html; charset=utf-8" }
            elseif ($ext -eq ".css") { $contentType = "text/css; charset=utf-8" }
            elseif ($ext -eq ".js") { $contentType = "application/javascript; charset=utf-8" }
            elseif ($ext -eq ".json") { $contentType = "application/json; charset=utf-8" }
            elseif ($ext -eq ".png") { $contentType = "image/png" }
            elseif ($ext -eq ".jpg" -or $ext -eq ".jpeg") { $contentType = "image/jpeg" }
            elseif ($ext -eq ".ico") { $contentType = "image/x-icon" }
            
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            
            # Send file content
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            # 404 Not Found
            $response.StatusCode = 404
            $errorBytes = [System.Text.Encoding]::UTF8.GetBytes("404 File Not Found: $path")
            $response.ContentType = "text/plain"
            $response.ContentLength64 = $errorBytes.Length
            $response.OutputStream.Write($errorBytes, 0, $errorBytes.Length)
        }
        $response.Close()
    }
} catch [System.Management.Automation.PipelineStoppedException] {
    # Caught on Ctrl+C termination
} catch {
    Write-Host "Error in connection: $_" -ForegroundColor Red
} finally {
    $listener.Stop()
    Write-Host "`nServer stopped. Goodbye!" -ForegroundColor Green
}
