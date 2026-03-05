# Script PowerShell untuk generate SESSION_TOKEN_AES_KEY yang kuat
# Jalankan di PowerShell, hasil bisa langsung dipakai di .env

$guid1 = [guid]::NewGuid().ToString("N")
$guid2 = [guid]::NewGuid().ToString("N")
$key = $guid1 + $guid2
Write-Output "SESSION_TOKEN_AES_KEY=$key"
