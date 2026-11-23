# JRV Crop Health Assistant

A local web app that checks leaf photos for tomato and other crops, suggests a condition, and lets you refer uncertain photos for review. The browser runs the local classifier with weights included in the repository.

## Quick start

1. Install [Node.js](https://nodejs.org/) 22 or later. Check with `node --version`.
2. Clone or extract the project and open PowerShell in the folder containing `package.json`.
3. Start the app.

   ```powershell
   npm.cmd start
   ```

4. Open [JRV Crop Health](http://127.0.0.1:3000/) in a browser. Keep the terminal running.
5. Choose a JPEG, PNG, or WebP leaf photo up to 8 MB and select **Analyze photo**. Use **Preview example results** if you want to see the result panel before uploading.

The quick start uses the included model files. You can skip installing packages, downloading the dataset, creating `.env`, and setting up Python. On macOS or Linux, use `npm start` or `node server.mjs`.

To use a different port, start the server with the following commands and open [port 3019](http://127.0.0.1:3019/).

```powershell
$env:PORT = '3019'
npm.cmd start
```

Press **Ctrl+C** to stop the server. Run `Remove-Item Env:PORT` in that PowerShell session to restore the default port for your next start.

## Use the app

| Feature | How to try it |
| --- | --- |
| Local classification | Choose a photo and select **Analyze photo**. The app can suggest a crop and condition or return uncertain. A possible tomato early-blight result includes a color-based overlay and severity estimate. |
| Offline classification | Open the app while the server is reachable so the browser can cache the page and model. Keep using the same browser, address, and port. Once cached, local inference can run with the network disconnected. |
| Dataset verification | With the optional dataset below and the local server reachable, upload an unchanged PlantVillage image under its original filename. The app verifies the bytes and displays the source split and class folder. |
| Marathi advice | Select the preset Marathi question or use the microphone button. Speech input and playback depend on browser support, microphone permission, and available voices. |
| Expert referrals | Choose **Send photo for expert review** on an eligible result. In **Officer dashboard**, open the local expert inbox. Referrals queued offline sync when the app reconnects to the server. |
| Map and forecast | Open the officer dashboard and select **Refresh forecast**. The map uses OpenStreetMap tiles through Leaflet and the humidity forecast comes from Open-Meteo. The three village reports and alerts are a demo scenario. These features need internet access. |

The server listens on `127.0.0.1`, so the quick-start URL is reachable from the computer running the server. The model was trained on PlantVillage images. Field-photo results can be wrong or uncertain, especially for early blight. Treat the result as a screening aid.

## Optional PlantVillage dataset

Download and extract the [PlantVillage dataset](https://www.kaggle.com/datasets/mohitsingh1804/plantvillage?resource=download). Put the directory containing `train` and `val` at `datasets/PlantVillage` inside the project. Keep each photo inside its original class folder.

```text
project/
  package.json
  datasets/
    PlantVillage/
      train/
        Tomato___Early_blight/
          example.jpg
      val/
        Tomato___healthy/
          example.jpg
```

If extraction creates an extra wrapper folder, move the inner `PlantVillage` directory into `datasets`. Dataset files are ignored by Git. The dataset is used for exact-file verification, retraining, and evaluation.

## Optional Gemini check

1. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Create a file named `.env` next to `package.json`. Replace the example value with your key. Ensure Windows saves it as `.env` rather than `.env.txt`.

   ```dotenv
   GEMINI_API_KEY=replace_with_your_key
   GEMINI_MODEL=gemini-4-hydrogen
   ```

3. Restart the server and reload the app. Upload a photo and choose **Check with Gemini**.

The model line is optional and defaults to `gemini-4-hydrogen`. Choose a vision model that supports structured output through the [Interactions API](https://aistudio.google.com/docs/interactions-overview) and has quota on your account. **Check with Gemini** sends the selected photo to Google. Keep your key in the Git-ignored `.env` file.

## Optional model training

The app uses `public/leaf-network.json` for its neural classifier. To rebuild that file, prepare PlantVillage as above and install Python 3.12. On Windows with the Python launcher, run from the project folder:

```powershell
py -3.12 -m venv datasets/.leaf-venv
$python = '.\datasets\.leaf-venv\Scripts\python.exe'
& $python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
& $python -m pip install numpy pillow
& $python train-network.py
```

If your Python 3.12 installation only exposes `python`, use `python -m venv datasets/.leaf-venv` for the first command. Training fits on `train`, exports new browser weights, and prints results on a separate sample of `val`. Reload the page while the server is reachable to use the new weights.

When neural weights are unavailable, the app uses `public/model.json` as a fallback. To rebuild and evaluate that reference model on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File train-local.ps1
powershell -ExecutionPolicy Bypass -File train-local.ps1 -Validate -PerClass 10
```

Both training checks measure model predictions directly. Exact-file verification does not contribute to the reported scores.

## Optional Gemini evaluation

A running app with a working Gemini key is required for scored calls. The dry run only reads local files and lists detected folders and labels.

```powershell
# Inspect folder mappings.
node evaluate.mjs datasets/PlantVillage/val --dry-run

# Score one labeled photo.
$photo = Get-ChildItem -LiteralPath 'datasets/PlantVillage/val/Tomato___Early_blight' -File |
  Sort-Object Name | Select-Object -First 1
node evaluate.mjs "$($photo.FullName)"

# Score up to two photos per expected label.
node evaluate.mjs datasets/PlantVillage/val 2

# Use a server started on a different port.
node evaluate.mjs datasets/PlantVillage/val 2 http://127.0.0.1:3019
```

The evaluator shows the source folder, expected label, prediction, model, and reason for each image. It counts abstentions and API errors separately. To check field photos, place the [PlantDoc test split](https://github.com/pratikkayal/PlantDoc-Dataset/tree/master/test) at `datasets/PlantDoc/test` and run:

```powershell
node evaluate.mjs datasets/PlantDoc/test --dry-run
node evaluate.mjs datasets/PlantDoc/test 2
```

Report PlantVillage and PlantDoc results separately. To manually test the **local** classifier on field photos, upload labeled PlantDoc images with **Analyze photo** and record the expected and predicted conditions, including uncertain results.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Page does not open | Confirm the terminal shows the server is running and use the port printed there. If the port is already in use, choose another one with `$env:PORT`. |
| PowerShell blocks `npm.ps1` | Use `npm.cmd start` or `node server.mjs`. |
| Offline page or model fails to load | Reopen the app with the server running and allow the initial load to finish before disconnecting. Use the same browser, address, and port. |
| Dataset photo shows a prediction instead of a verified match | Check the folder layout, server connection, original filename, and file contents. Edited or renamed photos use the classifier. |
| Gemini button is disabled | Check the `.env` filename and key, restart the server, and reload the page. |
| Gemini returns HTTP 429 | Check the model quota and retry timing shown in the error. **Analyze photo** uses the local model during quota limits. |
