param([string]$Dataset = 'datasets/PlantVillage')
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System.Drawing;
public static class LeafFeatures {
  public static int[] Extract(string path) {
    using (var original = new Bitmap(path))
    using (var small = new Bitmap(original, 32, 32)) {
      var values = new int[256];
      for (int y = 4; y < 28; y++)
        for (int x = 4; x < 28; x++) {
          var c = small.GetPixel(x, y);
          int quadrant = (y / 16) * 2 + x / 16;
          values[quadrant * 64 + (c.R >> 6) * 16 + (c.G >> 6) * 4 + (c.B >> 6)]++;
        }
      return values;
    }
  }
}
"@
$rows = foreach ($dir in Get-ChildItem "$Dataset/train" -Directory -Filter 'Tomato___*') {
  $files = @(Get-ChildItem $dir.FullName -File | Sort-Object Name)
  $count = [Math]::Min(250, $files.Count)
  for ($i = 0; $i -lt $count; $i++) {
    $file = $files[[int][Math]::Floor(($i + 0.5) * $files.Count / $count)]
    @{label = $dir.Name.Substring(9); bins = [LeafFeatures]::Extract($file.FullName)}
  }
}
ConvertTo-Json -InputObject @($rows) -Depth 4 -Compress | Set-Content public/model.json -Encoding ascii
