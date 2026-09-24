$base = "C:\Users\Damaris Cabrera\OneDrive\Desktop\diplomado\parte1\erp"

$dirs = @(
    "$base\apps\api\src\config",
    "$base\apps\api\src\core\middlewares",
    "$base\apps\api\src\modules\identity",
    "$base\apps\api\src\modules\catalogs",
    "$base\apps\api\src\modules\inventory",
    "$base\apps\api\src\modules\purchasing",
    "$base\apps\api\src\modules\sales",
    "$base\apps\api\src\modules\finance",
    "$base\apps\api\src\modules\hr",
    "$base\apps\api\src\modules\reports",
    "$base\apps\api\src\platform\customization",
    "$base\apps\api\src\platform\onboarding",
    "$base\apps\api\src\platform\integrations",
    "$base\apps\api\src\platform\localization",
    "$base\apps\api\src\jobs",
    "$base\apps\api\src\shared",
    "$base\apps\mobile",
    "$base\apps\web",
    "$base\packages\ui",
    "$base\packages\api-client",
    "$base\packages\domain",
    "$base\packages\config",
    "$base\infra",
    "$base\docs\adr",
    "$base\.github\workflows"
)

foreach ($dir in $dirs) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

Write-Host "All directories created successfully."
