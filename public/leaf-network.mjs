function convolution(input, size, channels, layer) {
  const plane = size * size;
  const output = new Float32Array(plane * layer.bias.length);
  for (let out = 0; out < layer.bias.length; out++) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let sum = layer.bias[out];
      for (let channel = 0; channel < channels; channel++) {
        const kernel = (out * channels + channel) * 9;
        for (let dy = -1; dy <= 1; dy++) {
          if (y + dy < 0 || y + dy >= size) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (x + dx < 0 || x + dx >= size) continue;
            sum += input[channel * plane + (y + dy) * size + x + dx] *
              layer.weight[kernel + (dy + 1) * 3 + dx + 1];
          }
        }
      }
      output[out * plane + y * size + x] = Math.max(0, sum);
    }
  }
  return output;
}

function pool(input, size, channels, average = false) {
  const half = size / 2;
  const output = new Float32Array(channels * half * half);
  for (let c = 0; c < channels; c++) {
    for (let y = 0; y < half; y++) for (let x = 0; x < half; x++) {
      const i = c * size * size + 2 * y * size + 2 * x;
      const a = input[i], b = input[i+1], d = input[i+size], e = input[i+size+1];
      output[c * half * half + y * half + x] = average ? (a+b+d+e)/4 : Math.max(a,b,d,e);
    }
  }
  return output;
}

function predict(rgba, model) {
  let size = model.size ?? 48;
  let channels = 3;
  let input = new Float32Array(size * size * channels);
  for (let c = 0; c < channels; c++) {
    for (let i = 0; i < size * size; i++) input[c*size*size+i] = rgba[i*4+c]/255;
  }
  for (const layer of model.layers.slice(0,3)) {
    const activation = convolution(input,size,channels,layer);
    channels = layer.bias.length;
    input = pool(activation,size,channels);
    size /= 2;
  }
  while (size > 3) {
    input = pool(input, size, channels, true);
    size /= 2;
  }
  const features = input;
  const dense = model.layers[3];
  const logits = dense.bias.map((bias, index) => features.reduce(
    (sum, value, n) => sum + value * dense.weight[index * features.length + n], bias));
  logits.length = model.labels.length;
  const shift = Math.max(...logits);
  const scores = logits.map(logit => Math.exp(logit - shift));
  const total = scores.reduce((sum, score) => sum + score, 0);
  return scores.map(score => score / total);
}

export function classifyNetwork(rgba, model) {
  let detail = 0;
  for (let i = 0; i < rgba.length - 4; i += 4) detail += Math.abs(rgba[i+1] - rgba[i+5]);
  if (detail / (rgba.length / 4) < 2) return { crop: 'uncertain' };
  const scores = predict(rgba, model);
  const crops = new Map();
  const classes = model.labels.map((label, index) => {
    const [species, condition] = label.split('___');
    const score = scores[index];
    crops.set(species, (crops.get(species) || 0) + score);
    return { species, condition, score };
  });
  const [[species, cropScore], [, runnerUp]] = [...crops].sort((a, b) => b[1] - a[1]);
  if (cropScore < 0.65 || cropScore - runnerUp < 0.20) return { crop: 'uncertain' };
  const [best, second] = classes.filter(row => row.species === species).sort((a, b) => b.score - a.score);
  const crop = species === 'Tomato' ? 'tomato' : 'other';
  const score = best.score / cropScore;
  if (score < 0.55 || (second && (best.score - second.score) / cropScore < 0.15)) return { crop, species };
  return { ...best, crop, score };
}
