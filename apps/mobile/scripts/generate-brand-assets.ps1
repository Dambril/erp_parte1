# Genera los íconos de Android, la imagen de la pantalla de inicio y el favicon de la web a partir de docs/marca.
# Usa System.Drawing de Windows: no agrega dependencias al proyecto.
#
#   powershell -ExecutionPolicy Bypass -File apps/mobile/scripts/generate-brand-assets.ps1
#
# Vuelve a ejecutarlo solo si cambian los archivos de docs/marca; los PNG generados se guardan en el repo.

Add-Type -AssemblyName System.Drawing

$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$brand = Join-Path $repo 'docs\marca'
$res = Join-Path $repo 'apps\mobile\android\app\src\main\res'

function Save-Resized([string]$source, [string]$target, [int]$size, [bool]$circle = $false) {
  $image = [System.Drawing.Image]::FromFile($source)
  $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)
  if ($circle) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse(0, 0, $size, $size)
    $graphics.SetClip($path)
  }
  $graphics.DrawImage($image, 0, 0, $size, $size)
  New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
  $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $bitmap.Dispose(); $image.Dispose()
  Write-Output "$size px -> $target"
}

$icon = Join-Path $brand 'icono-app-1024.png'
$foreground = Join-Path $brand 'icono-adaptativo-frente-1024.png'

# Densidades de Android: factor sobre mdpi.
$densities = [ordered]@{ mdpi = 1; hdpi = 1.5; xhdpi = 2; xxhdpi = 3; xxxhdpi = 4 }
foreach ($density in $densities.Keys) {
  $factor = $densities[$density]
  # Ícono clásico (Android 7 y anteriores): 48 dp. El redondo se recorta en círculo.
  Save-Resized $icon (Join-Path $res "mipmap-$density\ic_launcher.png") ([int](48 * $factor))
  Save-Resized $icon (Join-Path $res "mipmap-$density\ic_launcher_round.png") ([int](48 * $factor)) $true
  # Capa frontal del ícono adaptativo (Android 8+): 108 dp; el fondo lima va como color.
  Save-Resized $foreground (Join-Path $res "mipmap-$density\ic_launcher_foreground.png") ([int](108 * $factor))
  # Isotipo de la pantalla de inicio: 200 dp (la capa frontal ya trae su margen).
  Save-Resized $foreground (Join-Path $res "drawable-$density\splash_logo.png") ([int](200 * $factor))
}

Save-Resized $icon (Join-Path $repo 'apps\web\public\favicon.png') 192
