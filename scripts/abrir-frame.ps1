# Abre o Frame do Pregador no seu computador, com a importacao do YouTube.
#
# 1. Fecha versoes antigas da Frame API e do site (para nao ficar token velho
#    nem porta ocupada).
# 2. Sobe a Frame API e o site em janelas minimizadas.
# 3. Espera os dois responderem, confere o token e abre o navegador.
#
# Usado pelo atalho "Frame do Pregador" da area de trabalho.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$host.UI.RawUI.WindowTitle = "Frame do Pregador"
Set-Location $root

function Say($text, $color = "Gray") { Write-Host $text -ForegroundColor $color }
function Fail($text) {
  Say ""
  Say $text "Red"
  Say ""
  Read-Host "Aperte Enter para fechar"
  exit 1
}

Say "Frame do Pregador" "White"
Say "Preparando tudo, isso leva alguns segundos..." "DarkGray"
Say ""

# --- Conferencias rapidas ----------------------------------------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "O Node.js não está instalado. Instale em https://nodejs.org e tente de novo." }
if (-not (Test-Path (Join-Path $root "node_modules"))) {
  Say "Instalando as dependências (só na primeira vez)..."
  & npm install | Out-Null
}
if (-not (Test-Path (Join-Path $root ".env.frame-api"))) { Say "Aviso: .env.frame-api não encontrado. O link do YouTube não vai funcionar." "Yellow" }
if (-not (Test-Path (Join-Path $root ".env.local"))) { Say "Aviso: .env.local não encontrado. O link do YouTube não vai funcionar." "Yellow" }

# --- Fecha versoes antigas -----------------------------------------------------
$old = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $_.CommandLine -match "frame-api\.mjs" -or
  ($_.CommandLine -match "next[\\/]dist[\\/]bin[\\/]next" -and $_.CommandLine -match [regex]::Escape($root)) -or
  ($_.CommandLine -match "next(\.cmd)?`"?\s+dev" -and $_.CommandLine -match [regex]::Escape($root))
}
foreach ($p in $old) {
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}
# libera as portas se ainda houver alguem nelas
foreach ($port in 3000, 8787) {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conn) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"
    if ($proc.Name -eq "node.exe") { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
    else { Fail "A porta $port está sendo usada por outro programa ($($proc.Name)). Feche esse programa e tente de novo." }
  }
}
Start-Sleep -Milliseconds 800

# --- Sobe a API e o site -------------------------------------------------------
$q = $root.Replace("'", "''")
Start-Process powershell -WindowStyle Minimized -ArgumentList @(
  "-NoProfile", "-NoExit", "-Command",
  "`$host.UI.RawUI.WindowTitle='Frame API (pode minimizar)'; Set-Location '$q'; npm run frame:api"
)
Start-Process powershell -WindowStyle Minimized -ArgumentList @(
  "-NoProfile", "-NoExit", "-Command",
  "`$host.UI.RawUI.WindowTitle='Frame do Pregador - site (pode minimizar)'; Set-Location '$q'; npm run dev"
)

function Wait-Url($url, $seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -eq 200) { return $r }
    } catch { }
    Start-Sleep -Seconds 1
  }
  return $null
}

Say "Ligando a Frame API..."
if (-not (Wait-Url "http://127.0.0.1:8787/health" 40)) {
  Say "A Frame API não respondeu. Veja a janela 'Frame API' na barra de tarefas. O site abre mesmo assim, só sem o link do YouTube." "Yellow"
}

Say "Ligando o site (na primeira vez pode levar 1 minuto)..."
if (-not (Wait-Url "http://localhost:3000/api/frame/config" 180)) {
  Fail "O site não respondeu. Veja a janela 'Frame do Pregador - site' na barra de tarefas para entender o erro."
}
# compila a pagina antes de abrir, para o navegador nao esperar
Wait-Url "http://localhost:3000/" 120 | Out-Null

# --- Confere o token entre o site e a API ----------------------------------------
try {
  Invoke-WebRequest -Uri "http://localhost:3000/api/frame/jobs/00000000-0000-0000-0000-000000000000" -UseBasicParsing -TimeoutSec 10 | Out-Null
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  if ($code -eq 401) {
    Say "Atenção: o FRAME_API_TOKEN do .env.local e do .env.frame-api estão diferentes. O link do YouTube vai dar erro até os dois ficarem iguais." "Yellow"
    Start-Sleep -Seconds 4
  }
}

Say "Pronto! Abrindo o navegador." "Green"
Start-Process "http://localhost:3000"
Start-Sleep -Seconds 2
