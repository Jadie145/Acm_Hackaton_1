const extension = 'https://extension.umn.edu/';
const escalation = {
  source: 'Goa Directorate of Agriculture · Zonal office contacts',
  url: 'https://www.agri.goa.gov.in/Publications/INFORMATIVE%20BOOKLET.pdf',
  text: [
    'Show the photo to your nearest Zonal Agricultural Office in Goa for help confirming the condition and choosing local next steps.',
    'रोग की पुष्टि और स्थानीय उपायों के लिए फ़ोटो गोवा के नज़दीकी क्षेत्रीय कृषि कार्यालय में दिखाएँ।',
    'रोगाची खात्री आणि स्थानिक उपायांसाठी फोटो गोव्यातील जवळच्या विभागीय कृषी कार्यालयात दाखवा.'
  ]
};

const guides = {
  Tomato___Early_blight: {
    source: 'TNAU Agritech · Tomato early blight',
    url: 'https://agritech.tnau.ac.in/crop_protection/tomato_diseases_2.html',
    text: [
      'Remove affected crop debris after harvest and plan crop rotation for the next season.',
      'कटाई के बाद प्रभावित फसल के अवशेष हटाएँ और अगले मौसम में फसल चक्र अपनाएँ।',
      'काढणीनंतर बाधित पिकाचे अवशेष काढा आणि पुढच्या हंगामात पीक फेरपालट करा.'
    ]
  },
  'Corn_(maize)___Common_rust_': {
    source: 'University of Minnesota Extension · Common rust on corn',
    url: extension + 'agriculture/crop-production/corn/common-rust-on-corn',
    text: [
      'Check both sides of affected leaves for rusty brown bumps. For the next planting, ask about locally suitable hybrids resistant to common rust.',
      'पत्तों की दोनों तरफ जंग जैसे भूरे उभार देखें। अगली बुवाई के लिए स्थानीय परिस्थितियों के अनुकूल रोगरोधी किस्मों के बारे में पूछें।',
      'पानांच्या दोन्ही बाजूंना गंजासारखे तपकिरी उंचवटे तपासा. पुढील लागवडीसाठी स्थानिक परिस्थितीला अनुरूप तांबेरा-प्रतिरोधक संकरित वाणांबद्दल विचारा.'
    ]
  },
  Potato___Early_blight: {
    source: 'University of Minnesota Extension · Growing potatoes',
    url: extension + 'garden-and-home/yard-and-garden/gardening-in-minnesota/growing-potatoes',
    text: [
      'Plan crop rotation. For the next potato crop, choose ground where potatoes and related crops have not grown for three to four years.',
      'फसल चक्र अपनाएँ। अगली आलू की फसल ऐसी ज़मीन पर लगाएँ जहाँ तीन से चार साल से आलू या संबंधित फसलें नहीं उगी हों।',
      'पीक फेरपालट करा. पुढील बटाटा पिकासाठी अशी जमीन निवडा जिथे तीन ते चार वर्षे बटाटा किंवा त्याच गटातील पिके घेतलेली नाहीत.'
    ]
  },
  Apple___Apple_scab: {
    source: 'University of Minnesota Extension · Apple scab',
    url: extension + 'garden-and-home/yard-and-garden/gardening-in-minnesota/yard-and-garden-problems/apple-scab',
    text: [
      'Collect fallen leaves to reduce overwintering fungus. Keep the canopy open so leaves dry faster.',
      'गिरे पत्ते इकट्ठे करें ताकि उनमें फफूंद न टिके। पेड़ में हवा आने दें ताकि पत्ते जल्दी सूखें।',
      'बुरशी टिकून राहू नये म्हणून गळलेली पाने गोळा करा. पाने लवकर सुकण्यासाठी झाडात हवा खेळती ठेवा.'
    ]
  }
};

const languages = ['en', 'hi', 'mr'];
const headings = {
  unknown: ['Affected area unknown', 'प्रभावित क्षेत्र अज्ञात', 'बाधित क्षेत्र माहीत नाही'],
  low: ['Low visible damage', 'कम दिखाई देने वाला नुकसान', 'कमी दिसणारी हानी'],
  moderate: ['Moderate visible damage', 'मध्यम दिखाई देने वाला नुकसान', 'मध्यम दिसणारी हानी'],
  high: ['High visible damage', 'अधिक दिखाई देने वाला नुकसान', 'जास्त दिसणारी हानी']
};

export async function buildAdvice(prediction, observation, key) {
  const language = languages.indexOf(observation.language);
  const affected = observation.affected;
  if (language < 0 || (affected !== null && (!Number.isFinite(affected) || affected < 0 || affected > 100))) {
    throw new RangeError('Invalid language or affected area');
  }
  const band = affected === null ? 'unknown' : affected < 10 ? 'low' : affected < 30 ? 'moderate' : 'high';
  const guide = guides[prediction.species + '___' + prediction.condition];
  const choices = guide ? { confirm: escalation, prevention: guide } : { confirm: escalation };
  let priority = guide && band === 'low' ? 'prevention' : 'confirm';
  let engine = 'reviewed';

  if (key && guide) {
    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json', 'Api-Revision': '2026-05-20' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          model: 'gemini-3.8-flash',
          store: false,
          generation_config: { thinking_level: 'low' },
          input: JSON.stringify({
            task: 'Choose which reviewed instruction to show first. Prioritize expert confirmation for unknown, moderate or high damage. Do not diagnose or invent advice.',
            crop: prediction.species, condition: prediction.condition, affected, band,
            language: observation.language,
            options: Object.fromEntries(Object.entries(choices).map(([id, row]) => [id, row.text[language]]))
          }),
          response_format: {
            type: 'text', mime_type: 'application/json',
            schema: { type: 'object', properties: { priority: { type: 'string', enum: Object.keys(choices) } }, required: ['priority'] }
          }
        })
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const body = await response.json();
      const output = body.steps?.findLast(step => step.type === 'model_output');
      const text = output?.content?.filter(part => part.type === 'text').map(part => part.text).join('');
      const answer = JSON.parse(text);
      if (!Object.hasOwn(choices, answer.priority)) throw new Error('Invalid advice selection');
      if (band === 'low') priority = answer.priority;
      engine = 'gemini-3.8-flash';
    } catch (error) {
      console.warn('Gemini advisory unavailable:', error.message);
    }
  }

  return {
    affected, severity: headings[band][language], engine,
    items: [priority, ...Object.keys(choices).filter(id => id !== priority)]
      .map(id => ({ text: choices[id].text[language], source: choices[id].source, url: choices[id].url }))
  };
}
