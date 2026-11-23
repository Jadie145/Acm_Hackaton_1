# JRV Crop Health Assistant

A local ME4 hackathon prototype for triaging tomato leaf photos. It shows possible early blight, no visible symptoms in the submitted photo, or an uncertain result. The interface and next steps are available in English and Hindi.

## Run

Use Node.js 22 or later. No dependencies need installing.

```powershell
npm.cmd start
```

Open [the local app](http://127.0.0.1:3000/). The two example buttons work immediately and show labeled sample results.

For live analysis, put `.env` next to `package.json`, set `GEMINI_API_KEY` using [Google AI Studio](https://aistudio.google.com/apikey), and restart. The server defaults to `gemini-4-hydrogen`. If needed, set `GEMINI_MODEL` to another vision model available to your key that supports structured output through the [Interactions API](https://aistudio.google.com/docs/interactions-overview). The server sends the selected photo to Gemini. Its result selects a predefined advisory, and disease-management guidance links to the [TNAU Agritech Portal](https://agritech.tnau.ac.in/crop_protection/tomato_diseases_2.html).

<<<<<<< HEAD
=======
## PlantVillage lab-photo check

`Analyze photo` runs the local classifier in the browser. It uses nearest neighbors over spatial color histograms from the ten tomato classes in PlantVillage. To rebuild its reference data on Windows, run `powershell -ExecutionPolicy Bypass -File train-local.ps1`. The displayed percentage measures neighbor agreement. `Check with Gemini` runs the separate online check.

The local copy of the [PlantVillage Kaggle dataset](https://www.kaggle.com/datasets/mohitsingh1804/plantvillage?resource=download) contains `train` and `val` splits. Use the validation split to check the existing model. With the app running and a Gemini key configured, run:

```powershell
node evaluate.mjs datasets/PlantVillage/val 2 http://127.0.0.1:3001
```

Use port 3000 if you started the server on its default port. The evaluator samples early blight, healthy tomato leaves, and Septoria leaf spot. For Septoria, the expected result is uncertain because the app does not identify that disease. API errors and abstentions on supported cases are counted separately. The photos are sent to Gemini for inference. Report this as a lab-photo evaluation.

>>>>>>> 36ed474e3a56ffd33d2c7eb6edf2b12926563d18
## Field-photo check

Use labeled tomato photos from the [PlantDoc test split](https://github.com/pratikkayal/PlantDoc-Dataset/tree/master/test). Include early blight, healthy tomato leaves, and other leaf diseases. Add blurry or non-tomato photos to check the uncertain path. Record the actual label and app result for every photo. Report the number tested, correct calls, incorrect calls, and abstentions. Review at least one failure or uncertain case in the demo. Example results do not count as test photos.
