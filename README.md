# JRV Crop Health Assistant

A local ME4 hackathon prototype for triaging tomato leaf photos. It shows possible early blight, no visible symptoms in the submitted photo, or an uncertain result. The interface and next steps are available in English and Hindi.

## Run

Use Node.js 22 or later. No dependencies need installing.

```powershell
npm.cmd start
```

Open the [local app](http://127.0.0.1:3000/). The two example buttons work immediately and show labeled sample results.

For live analysis, put `.env` next to `package.json`, set `GEMINI_API_KEY` using [Google AI Studio](https://aistudio.google.com/apikey), and restart.

The server defaults to `gemini-4-hydrogen`. If needed, set `GEMINI_MODEL` to another vision model available to your key that supports structured output through the [Interactions API](https://aistudio.google.com/docs/interactions-overview).

The server sends the selected photo to Gemini. Its result selects a predefined advisory, and disease-management guidance links to the [TNAU Agritech Portal](https://agritech.tnau.ac.in/crop_protection/tomato_diseases_2.html).

## PlantVillage lab-photo check

`Analyze photo` uses a compact convolutional classifier trained on PlantVillage's 38 crop and condition folders. It checks for tomato or another crop before suggesting a condition. Low model scores can yield uncertain results. The displayed score measures model preference within the selected crop group. The browser caches model files for offline use after the first online visit.

The trained weights are served as `public/leaf-network.json`. Node and the browser need no Python packages at runtime. To retrain, use Python 3.12 with PyTorch, NumPy, and Pillow and run `python train-network.py` from the project folder. It uses `train` for fitting and reports a separate sample from `val`.

With the local server reachable, the app can verify an unchanged PlantVillage photo using its filename and exact bytes. A match displays the curated class folder and split. Classifier validation runs inference directly and bypasses this lookup.

If the network weights are unavailable, the app compares color, texture, and shape with labeled references. The vote count for this mode measures reference agreement.

Rebuild the references and evaluate them against the separate validation split on Windows.

```powershell
powershell -ExecutionPolicy Bypass -File train-local.ps1
powershell -ExecutionPolicy Bypass -File train-local.ps1 -Validate -PerClass 10
```

Use these commands for the Gemini check.

```powershell
$photo = Get-ChildItem -LiteralPath 'datasets/PlantVillage/val/Tomato___Early_blight' -File |
  Sort-Object Name | Select-Object -First 1
node evaluate.mjs "$($photo.FullName)"
node evaluate.mjs datasets/PlantVillage/val --dry-run
node evaluate.mjs datasets/PlantVillage/val 2
```

The evaluator defaults to port 3000. Pass a custom URL as the third argument if needed. Each run samples up to the requested count per expected label and includes Septoria in the uncertain group when available. The evaluator prints the source and class folders, prediction, model, self-reported confidence, and reason for each image. Gemini receives only image bytes and a prompt. The label and paths stay in the evaluator. Report this as a lab-photo evaluation.

## Field-photo check

Use labeled tomato photos from the [PlantDoc test split](https://github.com/pratikkayal/PlantDoc-Dataset/tree/master/test). Run `node evaluate.mjs datasets/PlantDoc/test --dry-run` to verify class mappings and `node evaluate.mjs datasets/PlantDoc/test 2` to score the sample. Use the actual directory if it differs.

Include early blight, healthy tomato leaves, and other leaf diseases. Add blurry or non-tomato photos to check the uncertain path.

Record the actual label and app result for every photo. Report the number tested, correct calls, incorrect calls, and abstentions. Review at least one failure or uncertain case in the demo.

Example results do not count as test photos.
