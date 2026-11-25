param(
  [int]$Port = 8420
)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
try {
  $Listener.Start()
} catch {
  Write-Host "No se pudo iniciar en http://localhost:$Port/ - prueba otro puerto." -ForegroundColor Red
  exit 1
}

$MimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".json" = "application/json; charset=utf-8"
  ".webmanifest" = "application/manifest+json; charset=utf-8"
}

Write-Host "Aureo Finanzas activo en http://localhost:$Port/" -ForegroundColor Cyan
Write-Host "Presiona Ctrl+C para detener el servidor." -ForegroundColor DarkGray
Start-Process "http://localhost:$Port/"

try {
  while ($true) {
    $Client = $Listener.AcceptTcpClient()
    $Stream = $Client.GetStream()
    $Reader = New-Object System.IO.StreamReader($Stream, [System.Text.Encoding]::ASCII, $false, 4096, $true)
    $ReqLine = $Reader.ReadLine()
    while ($true) {
      $Line = $Reader.ReadLine()
      if ([string]::IsNullOrEmpty($Line)) { break }
    }
    $ReqPath = "index.html"
    if ($ReqLine -match '^(GET|HEAD)\s+([^\s\?]+)') {
      $Raw = $Matches[2].TrimStart('/')
      if (-not [string]::IsNullOrWhiteSpace($Raw)) { $ReqPath = $Raw }
    }
    $FullPath = [System.IO.Path]::GetFullPath((Join-Path $Root ($ReqPath -replace '/', '\')))
    if ($FullPath.StartsWith($Root) -and (Test-Path $FullPath) -and -not (Get-Item $FullPath).PSIsContainer) {
      $Ext = [System.IO.Path]::GetExtension($FullPath).ToLowerInvariant()
      $Mime = if ($MimeTypes.ContainsKey($Ext)) { $MimeTypes[$Ext] } else { "application/octet-stream" }
      $Body = [System.IO.File]::ReadAllBytes($FullPath)
      $Header = "HTTP/1.1 200 OK`r`nContent-Type: $Mime`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`n`r`n"
      $HeadBytes = [System.Text.Encoding]::ASCII.GetBytes($Header)
      $Stream.Write($HeadBytes, 0, $HeadBytes.Length)
      $Stream.Write($Body, 0, $Body.Length)
    } else {
      $Body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
      $Header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`n`r`n"
      $HeadBytes = [System.Text.Encoding]::ASCII.GetBytes($Header)
      $Stream.Write($HeadBytes, 0, $HeadBytes.Length)
      $Stream.Write($Body, 0, $Body.Length)
    }
    $Stream.Flush()
    $Client.Close()
  }
} finally {
  $Listener.Stop()
}
