[CmdletBinding()]
param(
    [ValidateSet('init', 'start', 'stop', 'status', 'logs', 'follow', 'pull', 'scan')]
    [string]$Action = 'status',

    [ValidateSet('all', 'wazuh', 'misp', 'thehive', 'monitoring', 'security')]
    [string]$Tool = 'all'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$composeFile = Join-Path $root 'docker-compose.tools.yml'
$envFile = Join-Path $root '.env.tools'
$envExample = Join-Path $root '.env.tools.example'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI was not found. Install/start Docker Desktop and reopen the terminal.'
}

if (-not (Test-Path -LiteralPath $envFile)) {
    Copy-Item -LiteralPath $envExample -Destination $envFile
    Write-Warning "Created $envFile with development credentials. Change them before sharing or exposing the stack."
}

$baseArgs = @('compose', '--env-file', $envFile, '-f', $composeFile)
$profiles = if ($Tool -eq 'all') { @('wazuh', 'misp', 'thehive', 'monitoring') } else { @($Tool) }
$profileArgs = @()
foreach ($profile in $profiles) {
    $profileArgs += @('--profile', $profile)
}

function Invoke-Compose([string[]]$Arguments) {
    & docker @baseArgs @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose failed with exit code $LASTEXITCODE."
    }
}

function Initialize-ToolsNetwork {
    & docker network inspect ai-soc-tools *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Creating shared application/tool network...'
        & docker network create ai-soc-tools | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw 'Unable to create the ai-soc-tools Docker network.'
        }
    }
}

function Initialize-WazuhCertificates {
    $rootCa = Join-Path $root 'wazuh\certs\root-ca.pem'
    if (-not (Test-Path -LiteralPath $rootCa)) {
        Write-Host 'Generating Wazuh TLS certificates...'
        Invoke-Compose @('--profile', 'setup', 'run', '--rm', 'wazuh-certs')
    }
}

switch ($Action) {
    'init' {
        Initialize-ToolsNetwork
        if ($Tool -in @('all', 'wazuh')) { Initialize-WazuhCertificates }
        Invoke-Compose ($profileArgs + @('config', '--quiet'))
        Write-Host 'Tool configuration is ready.'
    }
    'start' {
        Initialize-ToolsNetwork
        if ($Tool -in @('all', 'wazuh')) { Initialize-WazuhCertificates }
        Invoke-Compose ($profileArgs + @('up', '-d', '--wait', '--wait-timeout', '600'))
        Invoke-Compose ($profileArgs + @('ps'))
    }
    'stop' {
        Invoke-Compose @('down', '--remove-orphans')
    }
    'status' {
        Invoke-Compose ($profileArgs + @('ps', '--all'))
    }
    'logs' {
        Invoke-Compose ($profileArgs + @('logs', '--tail', '200'))
    }
    'follow' {
        Invoke-Compose ($profileArgs + @('logs', '--tail', '200', '-f'))
    }
    'pull' {
        Invoke-Compose ($profileArgs + @('pull'))
    }
    'scan' {
        $failed = @()
        foreach ($scanner in @('semgrep', 'gitleaks', 'trivy')) {
            Write-Host "Running $scanner..."
            & docker @baseArgs --profile security run --rm $scanner
            if ($LASTEXITCODE -ne 0) { $failed += $scanner }
        }
        if ($failed.Count -gt 0) {
            throw "Security scan failed: $($failed -join ', ')."
        }
    }
}
