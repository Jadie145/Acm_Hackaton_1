"""Train the compact PlantVillage network and export browser-readable weights."""
import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image
import torch
from torch import nn

SIZE = 96
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def load_split(path, labels, count):
    images, targets = [], []
    for index, label in enumerate(labels):
        files = sorted(file for file in (path / label).rglob("*")
                       if file.is_file() and file.suffix.lower() in EXTENSIONS)
        size = min(len(files), count)
        for offset in range(size):
            file = files[int((offset + 0.5) * len(files) / size)]
            with Image.open(file) as image:
                rgb = image.convert("RGB").resize((SIZE, SIZE), Image.Resampling.BILINEAR)
                images.append(np.asarray(rgb))
            targets.append(index)
    return torch.from_numpy(np.stack(images)).permute(0, 3, 1, 2), torch.tensor(targets)


def evaluate(network, images, targets, labels):
    buckets = defaultdict(lambda: [0, 0, 0, 0])
    network.eval()
    tomato = torch.tensor([label.startswith("Tomato___") for label in labels])
    with torch.no_grad():
        for batch, expected in zip(images.split(128), targets.split(128)):
            logits = network(batch.float() / 255)
            probabilities = logits[:, :-1].softmax(1)
            crop_scores = logits[:, -1].sigmoid()
            green = batch[:, 1].float().flatten(1)
            detail = (green[:, 1:] - green[:, :-1]).abs().sum(1) / (SIZE * SIZE)
            for scores, tomato_score, actual, contrast in zip(probabilities, crop_scores, expected, detail):
                is_tomato = bool(tomato[actual])
                label = labels[actual] if is_tomato else "Other crops"
                row = buckets[label]
                row[0] += 1
                if contrast < 2 or 0.35 < tomato_score < 0.65:
                    row[3] += 1
                    continue
                predicted_tomato = bool(tomato_score >= 0.65)
                row[1] += is_tomato == predicted_tomato
                allowed = tomato if predicted_tomato else ~tomato
                guess = int(scores.masked_fill(~allowed, -1).argmax())
                group_score = scores[allowed].sum()
                if float(scores[guess]) / group_score < 0.36:
                    row[3] += 1
                    continue
                row[2] += int(actual) == guess
    return dict(buckets)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, default=Path("datasets/PlantVillage"))
    parser.add_argument("--epochs", type=int, default=32)
    parser.add_argument("--per-class", type=int, default=200)
    parser.add_argument("--warm-start", type=Path)
    args = parser.parse_args()
    torch.manual_seed(42)
    torch.set_num_threads(6)
    labels = sorted(directory.name for directory in (args.dataset / "train").iterdir()
                    if directory.is_dir() and "___" in directory.name)
    train, train_labels = load_split(args.dataset / "train", labels, args.per_class)
    val, val_labels = load_split(args.dataset / "val", labels, 10)
    network = nn.Sequential(
        nn.Conv2d(3, 12, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
        nn.Conv2d(12, 20, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
        nn.Conv2d(20, 28, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
        nn.AvgPool2d(4), nn.Flatten(), nn.Linear(28 * 3 * 3, len(labels) + 1)
    ).to(memory_format=torch.channels_last)
    if args.warm_start:
        initial = json.loads(args.warm_start.read_text())
        if initial["labels"] != labels:
            raise ValueError("Warm-start labels do not match the training folders")
        with torch.no_grad():
            for layer, weights in zip((network[0], network[3], network[6], network[11]), initial["layers"]):
                outputs = len(weights["bias"])
                layer.bias[:outputs].copy_(torch.tensor(weights["bias"]))
                layer.weight[:outputs].copy_(torch.tensor(weights["weight"]).reshape_as(layer.weight[:outputs]))
    optimizer = torch.optim.AdamW(network.parameters(), lr=0.003)
    schedule = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, args.epochs)
    crop_loss = nn.BCEWithLogitsLoss()
    tomato = torch.tensor([label.startswith("Tomato___") for label in labels])
    class_weight = torch.tensor([1.7 if label == "Tomato___Early_blight" else 1.0 for label in labels])
    print(f"Training on {len(train)} images across {len(labels)} classes", flush=True)
    for epoch in range(args.epochs):
        network.train()
        total = 0
        for indices in torch.randperm(len(train)).split(96):
            batch = train[indices].float() / 255
            if torch.rand(()) < 0.5:
                batch = batch.flip(3)
            batch = (batch * (0.85 + 0.3 * torch.rand(len(batch), 1, 1, 1))).clamp(0, 1)
            optimizer.zero_grad()
            targets = train_labels[indices]
            logits = network(batch.contiguous(memory_format=torch.channels_last))
            conditions = nn.functional.cross_entropy(logits[:, :-1], targets, weight=class_weight)
            loss = conditions + 0.7 * crop_loss(logits[:, -1], tomato[targets].float())
            loss.backward()
            optimizer.step()
            total += loss.item() * len(indices)
        schedule.step()
        print(f"Epoch {epoch + 1}/{args.epochs} loss {total / len(train):.3f}", flush=True)

    layers = []
    for layer in (network[0], network[3], network[6], network[11]):
        layers.append({"weight": layer.weight.detach().flatten().tolist(), "bias": layer.bias.detach().tolist()})
    path = Path("public/leaf-network.json")
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps({"size": SIZE, "labels": labels, "layers": layers}, separators=(",", ":")))
    temporary.replace(path)
    scores = evaluate(network, val, val_labels, labels)
    print("Validation [total, crop correct, class correct, uncertain]", json.dumps(scores), flush=True)


if __name__ == "__main__":
    main()
