$port = 8000
$baseDir = $PSScriptRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  MAREA - Servidor Local para Analisis y Sonido" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

# Busca un ejecutable de Python funcional
$pythonPath = $null
$candidates = @(
    "C:\Users\$env:USERNAME\AppData\Local\Programs\Mu Editor\Python\python.exe",
    "C:\Users\$env:USERNAME\AppData\Local\Programs\Python\Python312\python.exe",
    "C:\Users\$env:USERNAME\AppData\Local\Programs\Python\Python311\python.exe",
    "C:\Users\$env:USERNAME\AppData\Local\Programs\Python\Python310\python.exe",
    "C:\Program Files\Python312\python.exe",
    "C:\Program Files\Python311\python.exe"
)

# Verifica si python en PATH no es el alias vacio de Windows Store
$cmd = Get-Command "python.exe" -ErrorAction SilentlyContinue
if ($cmd -and $cmd.Source -notlike "*WindowsApps*") {
    $candidates = @($cmd.Source) + $candidates
}

foreach ($cand in $candidates) {
    if ($cand -and (Test-Path $cand)) {
        try {
            & $cand -c "import http.server" 2>$null
            if ($LASTEXITCODE -eq 0) {
                $pythonPath = $cand
                break
            }
        } catch {}
    }
}

if ($pythonPath) {
    Write-Host "Iniciando servidor HTTP con soporte Range/Streaming en http://localhost:$port/ ..." -ForegroundColor Cyan
    Write-Host "Presiona Ctrl+C en esta consola para detener el servidor.`n" -ForegroundColor Yellow
    Start-Process "http://localhost:$port/"
    Set-Location $baseDir
    & $pythonPath server.py $port
    exit 0
}

# Si no hay Python funcional, inicia con servidor nativo de .NET (sin requerir permisos de administrador)
Write-Host "Iniciando servidor nativo en http://localhost:$port/ ..." -ForegroundColor Cyan
try {
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
    $listener.Start()
    Write-Host "Servidor activo en http://localhost:$port/" -ForegroundColor Green
    Write-Host "Presiona Ctrl+C en esta consola para detener.`n" -ForegroundColor Yellow
    Start-Process "http://localhost:$port/"
} catch {
    Write-Host "No se pudo enlazar en el puerto $port`: $($_.Exception.Message)" -ForegroundColor Red
    pause
    exit 1
}

while ($listener.Server.IsBound) {
    try {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        $reader = New-Object System.IO.StreamReader($stream)

        $requestLine = $reader.ReadLine()
        if (-not [string]::IsNullOrWhiteSpace($requestLine)) {
            $tokens = $requestLine.Split(' ')
            if ($tokens.Length -ge 2 -and $tokens[0] -eq 'GET') {
                $rawUrl = $tokens[1].TrimStart('/')
                if ([string]::IsNullOrWhiteSpace($rawUrl) -or $rawUrl -eq '') { $rawUrl = "index.html" }
                $cleanUrl = [System.Uri]::UnescapeDataString($rawUrl.Split('?')[0])
                $filePath = Join-Path $baseDir $cleanUrl

                if (Test-Path $filePath -PathType Leaf) {
                    $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
                    $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                    $mime = switch ($ext) {
                        ".html" { "text/html; charset=utf-8" }
                        ".css"  { "text/css; charset=utf-8" }
                        ".js"   { "application/javascript; charset=utf-8" }
                        ".mp4"  { "video/mp4" }
                        ".wav"  { "audio/wav" }
                        ".mp3"  { "audio/mpeg" }
                        ".ogg"  { "audio/ogg" }
                        default { "application/octet-stream" }
                    }
                    $header = "HTTP/1.1 200 OK`r`nContent-Type: $mime`r`nContent-Length: $($fileBytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
                    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                    $stream.Write($headerBytes, 0, $headerBytes.Length)
                    $stream.Write($fileBytes, 0, $fileBytes.Length)
                } else {
                    $notFound = [System.Text.Encoding]::UTF8.GetBytes("HTTP/1.1 404 Not Found`r`nContent-Length: 13`r`n`r`n404 Not Found")
                    $stream.Write($notFound, 0, $notFound.Length)
                }
            }
        }
        $stream.Flush()
        $client.Close()
    } catch {
        # Conexión cerrada
    }
}
