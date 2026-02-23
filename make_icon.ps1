Add-Type -AssemblyName System.Drawing

$size = 512
$bmp  = New-Object System.Drawing.Bitmap($size, $size)
$g    = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# Dark navy background circle
$bgColor  = [System.Drawing.Color]::FromArgb(255, 13, 15, 23)
$bgBrush  = New-Object System.Drawing.SolidBrush($bgColor)
$g.FillEllipse($bgBrush, 0, 0, ($size-1), ($size-1))

# Violet vertical bar (part of the sparkle star)
$violet   = [System.Drawing.Color]::FromArgb(255, 139, 92, 246)
$vBrush   = New-Object System.Drawing.SolidBrush($violet)
$g.FillEllipse($vBrush, 226, 76, 60, 360)  # vertical pill

# Violet horizontal bar
$g.FillEllipse($vBrush, 76, 226, 360, 60)  # horizontal pill

# Cyan center glow
$cyan     = [System.Drawing.Color]::FromArgb(180, 6, 182, 212)
$cBrush   = New-Object System.Drawing.SolidBrush($cyan)
$g.FillEllipse($cBrush, 180, 180, 152, 152)

$g.Dispose()
$bmp.Save("icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "icon.png created"
