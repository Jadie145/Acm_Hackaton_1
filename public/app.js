const copy = {
  en: {
    crop: 'Crop disease check', title: 'What’s happening to your crop?',
    subtitle: 'Upload a leaf photo to check the crop and look for visible signs of disease.',
    photo: 'Leaf photo', choose: 'Choose a photo', analyze: 'Analyze photo', result: 'Result',
    hint: 'Use daylight and keep one leaf in focus. JPEG, PNG or WebP, up to 8 MB.',
    examples: 'Preview example results', sampleBlight: 'Possible early blight', sampleUncertain: 'Unclear photo',
    idle: 'Your result and next steps will appear here.',
    busy: 'Checking your photo…', demo: 'Example result', live: 'Photos are sent to Gemini for analysis.',
    missing: 'Live analysis needs a Gemini API key on the server. You can preview example results below.',
    failed: 'Analysis is unavailable. Try again in a moment.',
    invalid: 'Choose a JPEG, PNG or WebP photo under 8 MB.',
    early_blight: 'Possible early blight', no_visible_symptoms: 'No visible symptoms in this photo',
    uncertain: 'Unable to identify the issue', evidence: 'What the photo suggests', next: 'What to do next',
    ringed_spots: 'Dark spots with rings', yellow_edges: 'Yellowing around spots',
    clear_leaf: 'The visible leaf has no obvious spots or damage.',
    blurry: 'The leaf is out of focus.', unsupported: 'A tomato leaf could not be identified.',
    ambiguous: 'The visible signs are inconclusive.',
    blightAdvice: 'TNAU advises removing affected crop debris and rotating crops. Ask an agriculture officer or your local Krishi Vigyan Kendra to confirm the diagnosis before treating.',
    healthyAdvice: 'Check other leaves and retake a photo if spots, yellowing or damage appear.',
    unsureAdvice: 'Retake the photo in daylight with one leaf in focus. If damage remains unclear, show the photos to your local Krishi Vigyan Kendra or agriculture officer.',
    source: 'TNAU Agritech · Tomato early blight'
  },
  hi: {
    crop: 'फसल रोग की जाँच', title: 'आपकी फसल में क्या हो रहा है?',
    subtitle: 'फसल की पहचान और रोग के दिखने वाले लक्षणों की जाँच के लिए पत्ते की फ़ोटो डालें।',
    photo: 'पत्ते की फ़ोटो', choose: 'फ़ोटो चुनें', analyze: 'फ़ोटो जाँचें', result: 'नतीजा',
    hint: 'दिन की रोशनी में एक पत्ते की साफ़ फ़ोटो लें। JPEG, PNG या WebP, अधिकतम 8 MB।',
    examples: 'नतीजों के उदाहरण देखें', sampleBlight: 'अगेती झुलसा रोग की संभावना', sampleUncertain: 'धुंधली फ़ोटो',
    idle: 'जाँच का नतीजा और अगला कदम यहाँ दिखेगा।',
    busy: 'फ़ोटो की जाँच हो रही है…', demo: 'उदाहरण का नतीजा', live: 'जाँच के लिए फ़ोटो Gemini को भेजी जाती है।',
    missing: 'फ़ोटो जाँचने के लिए सर्वर पर Gemini API कुंजी चाहिए। नीचे दिए उदाहरण देख सकते हैं।',
    failed: 'अभी जाँच नहीं हो सकी। थोड़ी देर बाद फिर कोशिश करें।',
    invalid: '8 MB से छोटी JPEG, PNG या WebP फ़ोटो चुनें।',
    early_blight: 'अगेती झुलसा रोग की संभावना', no_visible_symptoms: 'इस फ़ोटो में लक्षण नहीं दिखे',
    uncertain: 'समस्या की पहचान नहीं हो सकी', evidence: 'फ़ोटो में दिखने वाले संकेत', next: 'आगे क्या करें',
    ringed_spots: 'गहरे धब्बों में गोल छल्ले', yellow_edges: 'धब्बों के चारों ओर पीलापन',
    clear_leaf: 'दिख रहे पत्ते पर साफ़ तौर पर धब्बे या नुकसान नहीं दिखे।',
    blurry: 'पत्ते की फ़ोटो धुंधली है।', unsupported: 'टमाटर का पत्ता पहचान में नहीं आया।',
    ambiguous: 'दिख रहे संकेतों से समस्या साफ़ नहीं है।',
    blightAdvice: 'TNAU प्रभावित फसल के अवशेष हटाने और फसल चक्र अपनाने की सलाह देता है। उपचार से पहले कृषि अधिकारी या स्थानीय कृषि विज्ञान केंद्र से रोग की पुष्टि कराएँ।',
    healthyAdvice: 'दूसरे पत्ते भी देखें। धब्बे, पीलापन या नुकसान दिखे तो नई फ़ोटो लें।',
    unsureAdvice: 'दिन की रोशनी में एक पत्ते की साफ़ फ़ोटो फिर लें। समस्या फिर भी समझ न आए तो फ़ोटो स्थानीय कृषि विज्ञान केंद्र या कृषि अधिकारी को दिखाएँ।',
    source: 'TNAU कृषि पोर्टल · टमाटर का अगेती झुलसा रोग'
  }
};
const source = 'https://agritech.tnau.ac.in/crop_protection/tomato_diseases_2.html';
const language = document.querySelector('#language');
const image = document.querySelector('#image');
const preview = document.querySelector('#preview');
const placeholder = document.querySelector('#placeholder');
const analyze = document.querySelector('#analyze');
const output = document.querySelector('#output');
let status = 'idle';
let result;
let previewUrl;
let validPhoto = false;

function append(parent, tag, content, className) {
  const element = document.createElement(tag);
  element.textContent = content;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function render() {
  const t = copy[language.value];
  document.documentElement.lang = language.value;
  document.querySelectorAll('[data-copy]').forEach(node => {
    node.textContent = t[node.dataset.copy];
  });
  document.querySelector('#connection').textContent = language.value === 'hi'
    ? 'मुख्य जाँच इस डिवाइस पर होती है। Gemini केवल आगे की सलाह के लिए है।'
    : 'Analyze photo runs on this device. Gemini is optional for follow-up advice.';
  analyze.disabled = !validPhoto || status === 'busy';
  output.replaceChildren();
  if (!result) {
    append(output, 'p', t[status], 'muted');
    return;
  }
  if (result.example) append(output, 'span', t.demo, 'tag');
  if (result.crop) append(output, 'p', result.crop, 'tag');
  append(output, 'h3', result.label === 'disease'
    ? (language.value === 'hi' ? 'संभावित रोग · ' : 'Possible disease · ') + result.disease
    : t[result.label]);
  append(output, 'p', t.evidence);
  if (result.reason) append(output, 'p', result.reason);
  if (result.clues.length) {
    const list = append(output, 'ul', '');
    result.clues.forEach(clue => append(list, 'li', t[clue]));
  }
  append(output, 'h3', t.next);
  const advice = { early_blight: 'blightAdvice', no_visible_symptoms: 'healthyAdvice', uncertain: 'unsureAdvice' };
  append(output, 'p', t[advice[result.label] || 'unsureAdvice']);
  if (result.label === 'early_blight') append(output, 'a', t.source).href = source;
}

function clearPreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  preview.removeAttribute('src');
  preview.hidden = true;
  placeholder.hidden = false;
}

language.addEventListener('change', render);
image.addEventListener('change', () => {
  clearPreview();
  result = undefined;
  const file = image.files[0];
  validPhoto = Boolean(file?.size && file.size <= 8 * 1024 * 1024 &&
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
  status = file && !validPhoto ? 'invalid' : 'idle';
  if (validPhoto) {
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    preview.hidden = false;
    placeholder.hidden = true;
  }
  render();
});

document.querySelector('#scan').addEventListener('submit', event => {
  event.preventDefault();
  if (!analyze.disabled) document.dispatchEvent(new Event('local-analysis'));
});

document.querySelectorAll('[data-example]').forEach(button => {
  button.addEventListener('click', () => {
    document.dispatchEvent(new Event('online-result'));
    clearPreview();
    image.value = '';
    validPhoto = false;
    status = 'idle';
    const label = button.dataset.example;
    result = { label, clues: label === 'early_blight' ? ['ringed_spots', 'yellow_edges'] : ['blurry'], example: true };
    render();
  });
});

render();
