param([string]$Dataset = 'datasets/PlantVillage', [int]$PerClass = 140, [switch]$Validate)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System.Drawing;
using System.IO;
public static class LeafPixels {
  public static void Write(string path, Stream stream) {
    using (var original = new Bitmap(path))
    using (var small = new Bitmap(original, 64, 64)) {
      byte[] data = new byte[64 * 64 * 4];
      for (int y = 0; y < 64; y++)
        for (int x = 0; x < 64; x++) {
          var c = small.GetPixel(x, y);
          int i = (y * 64 + x) * 4;
          data[i] = c.R; data[i+1] = c.G; data[i+2] = c.B; data[i+3] = 255;
        }
      stream.Write(data, 0, data.Length);
    }
  }
}
"@
$split = if ($Validate) { 'val' } else { 'train' }
$temp = Join-Path $Dataset ('local-pixels-' + $split + '.bin')
$rows = [System.Collections.Generic.List[object]]::new()
$stream = [IO.File]::Create($temp)
try {
  foreach ($dir in Get-ChildItem "$Dataset/$split" -Directory | Sort-Object Name) {
    $crop, $condition = $dir.Name -split '___', 2
    if (!$condition) { continue }
    $files = @(Get-ChildItem $dir.FullName -File -Recurse | Where-Object Extension -Match '^\.(jpg|jpeg|png)$' | Sort-Object FullName)
    $count = [Math]::Min($PerClass, $files.Count)
    for ($i = 0; $i -lt $count; $i++) {
      $file = $files[[int][Math]::Floor(($i + 0.5) * $files.Count / $count)]
      [LeafPixels]::Write($file.FullName, $stream)
      $rows.Add(@{crop = $crop; condition = $condition})
    }
  }
} finally { $stream.Dispose() }
$manifest = "$temp.json"
ConvertTo-Json -InputObject $rows.ToArray() -Compress | Set-Content $manifest -Encoding utf8
if ($Validate) { node build-local.mjs $temp $manifest --validate }
else { node build-local.mjs $temp $manifest }
if ($LASTEXITCODE) { throw 'Local model build failed' }
Remove-Item -LiteralPath $temp, $manifest
