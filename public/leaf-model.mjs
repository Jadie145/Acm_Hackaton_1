export function leafFeatures(rgba) {
  const n = 64;
  const channels = [new Float32Array(n*n), new Float32Array(n*n), new Float32Array(n*n)];
  const mask = new Uint8Array(n*n);
  for (let i=0; i<mask.length; i++) {
    const [r,g,b] = rgba.subarray(i*4,i*4+3);
    channels[0][i] = (r+g+b)/3;
    channels[1][i] = g-r;
    channels[2][i] = g-b;
    mask[i] = Math.max(r,g)-b > 15 && r+g+b > 45 ? 1 : 0;
  }
  const color = new Float32Array(64);
  const texture = new Float32Array(36);
  const shape = new Float32Array(16);
  let area=0, sharpness=0;
  for (let y=2;y<62;y++) for (let x=2;x<62;x++) {
    const i=y*n+x;
    const dx=channels[0][i+1]-channels[0][i-1];
    const dy=channels[0][i+n]-channels[0][i-n];
    sharpness += Math.abs(dx)+Math.abs(dy);
    if (!mask[i]) continue;
    area++;
    shape[(y>>4)*4+(x>>4)]++;
    const luminance = Math.min(3,Math.floor(channels[0][i]/64));
    const redGreen = Math.max(0,Math.min(3,Math.floor((channels[1][i]+48)/32)));
    const blueGreen = Math.max(0,Math.min(3,Math.floor(channels[2][i]/24)));
    color[luminance*16+redGreen*4+blueGreen]++;
    const strength = Math.min(5,Math.floor(Math.hypot(dx,dy)/8));
    const orientation = Math.floor((Math.atan2(dy,dx)+Math.PI)*3/Math.PI)%6;
    texture[strength*6+orientation]++;
  }
  const histogram = values => Array.from(values, value => Math.round(255*Math.sqrt(value/Math.max(1,area))));
  return { color:histogram(color), texture:histogram(texture), shape:histogram(shape), area, sharpness:sharpness/3600 };
}

export function classifyLeaf(features, references) {
  if (features.area < 180 || features.sharpness < 2) return { crop:'uncertain' };
  const difference = (left,right) => left.reduce((sum,value,i) => sum+Math.abs(value-right[i]),0);
  const ranked = references.map(row => ({
    crop:row.crop, condition:row.condition,
    distance: difference(features.color,row.color) + 0.8*difference(features.texture,row.texture) + 0.55*difference(features.shape,row.shape)
  })).sort((left,right) => left.distance-right.distance);
  const vote = (neighbors, label) => {
    const counts = new Map();
    for (const row of neighbors) counts.set(row[label],(counts.get(row[label])||0)+1);
    return [...counts.entries()].sort((left,right) => right[1]-left[1])[0];
  };
  const closest = ranked.slice(0,7).map(row => ({ ...row, group:row.crop==='Tomato'?'tomato':'other' }));
  const [group, support] = vote(closest,'group');
  if (support < 5 || closest[0].distance > 1300) return { crop:'uncertain' };
  if (group === 'other') return { crop:'other' };
  const [condition, agreement] = vote(ranked.filter(row => row.crop==='Tomato').slice(0,7),'condition');
  return { crop:'tomato', condition:agreement>=4?condition:null, agreement };
}
