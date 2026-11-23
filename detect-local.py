"""Run the local leaf classifier. Read JSON requests from standard input."""
import base64
import io
import json
import os
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageOps
import torch
from torch import nn

weights = json.loads((Path(__file__).parent / "public/leaf-network.json").read_text())
size = weights.get("size", 48)
labels = weights["labels"]
species = [label.split("___", 1)[0] for label in labels]
crops = sorted(set(species))
masks = [torch.tensor([name == crop for name in species]) for crop in crops]
torch.set_num_threads(2)
model = nn.Sequential(
    nn.Conv2d(3, 12, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
    nn.Conv2d(12, 20, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
    nn.Conv2d(20, 28, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
    nn.AvgPool2d(size // 24), nn.Flatten(), nn.Linear(28 * 9, len(weights["layers"][3]["bias"]))
)
with torch.no_grad():
    for layer, row in zip((model[0], model[3], model[6], model[11]), weights["layers"]):
        layer.weight.copy_(torch.tensor(row["weight"]).reshape_as(layer.weight))
        layer.bias.copy_(torch.tensor(row["bias"]))
model.eval()

checkpoint = os.environ.get("YOLO_WEIGHTS")
yolo = None
if checkpoint:
    try:
        from ultralytics import YOLO

        candidate = YOLO(checkpoint)
        if candidate.task != "classify":
            raise ValueError("Expected weights from a YOLO classification run")
        if not all("___" in name for name in candidate.names.values()):
            raise ValueError("Expected PlantVillage crop___condition class labels")
        yolo = candidate
    except Exception as error:
        print(f"YOLO checkpoint could not load: {error}", file=sys.stderr, flush=True)


def classify_yolo(leaf):
    size = yolo.overrides.get("imgsz") or 224
    result = yolo.predict(leaf, imgsz=size, device="cpu", verbose=False)[0]
    probabilities = result.probs
    ranked = probabilities.top5conf.tolist()
    score = ranked[0]
    if score < 0.65 or (len(ranked) > 1 and score - ranked[1] < 0.15):
        return {"engine": "yolo", "crop": "uncertain"}
    species, condition = result.names[probabilities.top1].split("___", 1)
    return {"engine": "yolo", "crop": "tomato" if species == "Tomato" else "other",
            "species": species, "condition": condition, "score": score}


@torch.inference_mode()
def classify(encoded):
    with Image.open(io.BytesIO(base64.b64decode(encoded, validate=True))) as image:
        if image.width * image.height > 24_000_000:
            return {"crop": "uncertain", **({"engine": "yolo"} if yolo else {})}
        leaf = ImageOps.exif_transpose(image).convert("RGB")
    if yolo:
        return classify_yolo(leaf)
    width, height = leaf.size
    cropped = leaf.crop((width // 12, height // 12, width - width // 12, height - height // 12))
    views = [leaf, ImageOps.mirror(leaf), cropped]
    images = np.stack([np.asarray(view.resize((size, size), Image.Resampling.BILINEAR)) for view in views])
    logits = model(torch.from_numpy(images).permute(0, 3, 1, 2).float() / 255)
    classes = logits[:, :len(labels)].softmax(1)
    crop_scores = torch.stack([classes[:, mask].sum(1) for mask in masks], dim=1)
    crop_values, crop_indices = crop_scores.topk(2, dim=1)
    confident_crop = (crop_values[:, 0] >= 0.65) & ((crop_values[:, 0] - crop_values[:, 1]) >= 0.20)
    votes = torch.bincount(crop_indices[:, 0][confident_crop], minlength=len(crops))
    if int(votes.max()) < 2:
        return {"crop": "uncertain"}
    crop_id = int(votes.argmax())
    chosen = crops[crop_id]
    indices = masks[crop_id].nonzero().flatten()
    condition_scores = classes[:, indices] / crop_scores[:, crop_id, None]
    top_scores, top_choices = condition_scores.max(1)
    accepted = confident_crop & (crop_indices[:, 0] == crop_id) & (top_scores >= 0.55)
    counts = torch.bincount(top_choices[accepted], minlength=len(indices))
    condition = labels[int(indices[int(counts.argmax())])].split("___", 1)[1] if int(counts.max()) >= 2 else None
    return {"crop": "tomato" if chosen == "Tomato" else "other", "species": chosen, "condition": condition}


print(json.dumps({"ready": True, "engine": "yolo" if yolo else "verifier"}), flush=True)
for line in sys.stdin:
    request = json.loads(line)
    try:
        result = classify(request["image"])
    except (ValueError, OSError, RuntimeError) as error:
        print(f"Leaf inference failed: {error}", file=sys.stderr, flush=True)
        result = {"crop": "uncertain", **({"engine": "yolo"} if yolo else {})}
    print(json.dumps({"id": request["id"], "result": result}), flush=True)
