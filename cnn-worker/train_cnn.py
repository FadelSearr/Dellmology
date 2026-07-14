import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import transforms, models
from torch.utils.data import DataLoader, Dataset
import os
import json
import random
import shutil
import numpy as np
from PIL import Image

# Global configurations
IMAGE_SIZE = 224
train_transform = transforms.Compose([
    transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
    transforms.RandomRotation(degrees=(-3, 3)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

val_transform = transforms.Compose([
    transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

class MultiModalChartDataset(Dataset):
    def __init__(self, root_dir, transform=None):
        self.root_dir = root_dir
        self.transform = transform
        self.classes = sorted([d for d in os.listdir(root_dir) if os.path.isdir(os.path.join(root_dir, d))])
        self.class_to_idx = {cls_name: i for i, cls_name in enumerate(self.classes)}
        
        self.samples = []
        for cls_name in self.classes:
            cls_dir = os.path.join(root_dir, cls_name)
            for f in os.listdir(cls_dir):
                if f.endswith('.png'):
                    img_path = os.path.join(cls_dir, f)
                    json_path = img_path.replace('.png', '.json')
                    if os.path.exists(json_path):
                        self.samples.append((img_path, json_path, self.class_to_idx[cls_name]))
                        
    def __len__(self):
        return len(self.samples)
        
    def __getitem__(self, idx):
        img_path, json_path, label = self.samples[idx]
        image = Image.open(img_path).convert('RGB')
        if self.transform:
            image = self.transform(image)
            
        with open(json_path, 'r') as f:
            meta = json.load(f)
            
        tab_features = torch.FloatTensor([
            meta['rsi'] / 100.0,
            meta['macd'],
            meta['macd_signal'],
            meta['ma20_ratio'],
            meta['ma50_ratio'],
            meta['vwap_ratio'],
            meta['volume_ratio']
        ])
        
        return image, tab_features, label

class ChartPatternResNet(nn.Module):
    """
    Optimized ResNet18 Multi-Modal Architecture for fast CPU training.
    """
    def __init__(self, num_classes=4):
        super(ChartPatternResNet, self).__init__()
        # Load pre-trained ResNet18 base
        self.model = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
        
        # Freeze base layers for CPU efficiency and to prevent overfitting
        for param in self.model.parameters():
            param.requires_grad = False
            
        # Unfreeze layer3 and layer4 for fine-tuning visual patterns
        for param in self.model.layer3.parameters():
            param.requires_grad = True
        for param in self.model.layer4.parameters():
            param.requires_grad = True
            
        self.pool = nn.AdaptiveAvgPool2d((1, 1))
        
        # Tabular MLP Branch
        self.tab_mlp = nn.Sequential(
            nn.Linear(7, 16),
            nn.ReLU(),
            nn.Linear(16, 16),
            nn.ReLU()
        )
        
        # ResNet18 layer2 output features: 128, layer4 output features: 512
        # Total visual features = 128 + 512 = 640
        # Fused layer: 640 + 16 (tabular) = 656 inputs -> 128 -> num_classes
        self.fc = nn.Sequential(
            nn.Linear(128 + 512 + 16, 128),
            nn.ReLU(),
            nn.Dropout(0.4),
            nn.Linear(128, num_classes)
        )
        
    def forward(self, x_img, x_tab):
        # 1. Visual Feature Extraction (Multi-Scale Fusion)
        x = self.model.conv1(x_img)
        x = self.model.bn1(x)
        x = self.model.relu(x)
        x = self.model.maxpool(x)
        
        x1 = self.model.layer1(x)
        x2 = self.model.layer2(x1) # (B, 128, 28, 28)
        x3 = self.model.layer3(x2)
        x4 = self.model.layer4(x3) # (B, 512, 7, 7)
        
        feat2 = torch.flatten(self.pool(x2), 1) # (B, 128)
        feat4 = torch.flatten(self.pool(x4), 1) # (B, 512)
        fused_visual = torch.cat((feat2, feat4), dim=1) # (B, 640)
        
        # 2. Tabular Feature Extraction
        fused_tab = self.tab_mlp(x_tab) # (B, 16)
        
        # 3. Concatenate and Classify
        fused_all = torch.cat((fused_visual, fused_tab), dim=1) # (B, 656)
        return self.fc(fused_all)

def run_pseudo_labeling(model, dataset_dir, split_dir, classes, confidence_threshold=0.95, device='cpu'):
    model.eval()
    unlabeled_dir = os.path.join(dataset_dir, 'trash')
    if not os.path.exists(unlabeled_dir):
        return 0
        
    moved_count = 0
    unlabeled_files = [f for f in os.listdir(unlabeled_dir) if f.endswith('.png')]
    random.shuffle(unlabeled_files)
    unlabeled_files = unlabeled_files[:1000]
    
    print(f"Scanning {len(unlabeled_files)} unlabeled charts for pseudo-labeling...", flush=True)
    with torch.no_grad():
        for f in unlabeled_files:
            img_path = os.path.join(unlabeled_dir, f)
            json_path = img_path.replace('.png', '.json')
            if not os.path.exists(json_path):
                continue
                
            img = Image.open(img_path).convert('RGB')
            img_tensor = val_transform(img).unsqueeze(0).to(device)
            
            with open(json_path, 'r') as js_f:
                meta = json.load(js_f)
            tab_tensor = torch.FloatTensor([
                meta['rsi'] / 100.0,
                meta['macd'],
                meta['macd_signal'],
                meta['ma20_ratio'],
                meta['ma50_ratio'],
                meta['vwap_ratio'],
                meta['volume_ratio']
            ]).unsqueeze(0).to(device)
            
            outputs = model(img_tensor, tab_tensor)
            probs = torch.softmax(outputs, dim=1)
            conf, pred_class_idx = torch.max(probs, dim=1)
            
            pred_class = classes[pred_class_idx.item()]
            
            if conf.item() > confidence_threshold and pred_class != 'trash':
                dest_img = os.path.join(split_dir, 'train', pred_class, f)
                dest_json = dest_img.replace('.png', '.json')
                
                shutil.move(img_path, dest_img)
                shutil.move(json_path, dest_json)
                moved_count += 1
                
    return moved_count

def main():
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}", flush=True)

    # Hyperparameters optimized for fast training on CPU
    BATCH_SIZE = 64
    LEARNING_RATE = 0.0002
    EPOCHS = 15
    
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    SRC_DIR = os.path.join(BASE_DIR, 'dataset')
    DST_DIR = os.path.join(BASE_DIR, 'dataset_split')

    train_dataset = MultiModalChartDataset(os.path.join(DST_DIR, 'train'), transform=train_transform)
    val_dataset = MultiModalChartDataset(os.path.join(DST_DIR, 'val'), transform=val_transform)

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=2, pin_memory=True)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=2, pin_memory=True)

    print(f"Classes: {train_dataset.classes}", flush=True)
    print(f"Train samples: {len(train_dataset)}, Validation samples: {len(val_dataset)}", flush=True)

    # Calculate dynamic class weights to address data imbalance
    targets = [label for _, _, label in train_dataset.samples]
    class_counts = {}
    for t in targets:
        class_counts[t] = class_counts.get(t, 0) + 1
    num_classes = len(train_dataset.classes)
    total_samples = len(train_dataset)
    class_weights = [total_samples / (num_classes * class_counts[i]) for i in range(num_classes)]
    class_weights = torch.FloatTensor(class_weights).to(device)

    model = ChartPatternResNet(num_classes=num_classes).to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights, label_smoothing=0.1)
    
    # Train only parameters that require grad (layer4 + tab_mlp + fc)
    optimizer = optim.AdamW(filter(lambda p: p.requires_grad, model.parameters()), lr=LEARNING_RATE, weight_decay=1e-3)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS)

    best_val_acc = 0.0

    for epoch in range(EPOCHS):
        model.train()
        running_loss = 0.0
        correct = 0
        total = 0
        
        print(f"\n--- Epoch {epoch+1}/{EPOCHS} ---", flush=True)
        for i, (images, tab_feats, labels) in enumerate(train_loader):
            images, tab_feats, labels = images.to(device), tab_feats.to(device), labels.to(device)
            
            # Mixup Augmentation (50% probability)
            alpha = 0.2
            use_mixup = alpha > 0 and np.random.rand() < 0.5
            
            if use_mixup:
                lam = np.random.beta(alpha, alpha)
                rand_index = torch.randperm(images.size(0)).to(device)
                target_a = labels
                target_b = labels[rand_index]
                
                images_input = lam * images + (1 - lam) * images[rand_index]
                tab_feats_input = lam * tab_feats + (1 - lam) * tab_feats[rand_index]
            else:
                images_input = images.clone()
                tab_feats_input = tab_feats
                
            # Forward pass
            outputs = model(images_input, tab_feats_input)
            if use_mixup:
                loss = lam * criterion(outputs, target_a) + (1 - lam) * criterion(outputs, target_b)
            else:
                loss = criterion(outputs, labels)
                
            # Backward pass & weights update
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            
            running_loss += loss.item() * images.size(0)
            _, predicted = torch.max(outputs.data, 1)
            total += labels.size(0)
            correct += (predicted == labels).sum().item()
            
            # Print batch step progress
            if (i + 1) % 10 == 0 or (i + 1) == len(train_loader):
                print(f"  Step [{i+1}/{len(train_loader)}] | Loss: {loss.item():.4f} | Train Acc: {(correct/total)*100:.2f}%", flush=True)
            
        epoch_loss = running_loss / len(train_loader.dataset)
        epoch_acc = (correct / total) * 100
        
        # Validation loop
        model.eval()
        val_loss = 0.0
        val_correct = 0
        val_total = 0
        
        with torch.no_grad():
            for images, tab_feats, labels in val_loader:
                images, tab_feats, labels = images.to(device), tab_feats.to(device), labels.to(device)
                outputs = model(images, tab_feats)
                loss = criterion(outputs, labels)
                val_loss += loss.item() * images.size(0)
                _, predicted = torch.max(outputs.data, 1)
                val_total += labels.size(0)
                val_correct += (predicted == labels).sum().item()
                
        val_epoch_loss = val_loss / len(val_loader.dataset)
        val_acc = (val_correct / val_total) * 100
        
        print(f"Summary Epoch [{epoch+1}/{EPOCHS}] - "
              f"Train Loss: {epoch_loss:.4f}, Train Acc: {epoch_acc:.2f}% | "
              f"Val Loss: {val_epoch_loss:.4f}, Val Acc: {val_acc:.2f}%", flush=True)
              
        scheduler.step()
              
        # Save best model
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), os.path.join(BASE_DIR, 'best_model.pth'))
            print(f"--> Saved best model weights with accuracy: {best_val_acc:.2f}%!", flush=True)
            
        # Execute Pseudo-Labeling on epoch 8 (0-indexed 7)
        if epoch == 7:
            print("\n--- Running Pseudo-Labeling on Unlabeled Trash Pool ---", flush=True)
            added = run_pseudo_labeling(model, SRC_DIR, DST_DIR, train_dataset.classes, device=device)
            print(f"Pseudo-labeling complete! Added {added} highly confident samples to train split.", flush=True)
            if added > 0:
                train_dataset = MultiModalChartDataset(os.path.join(DST_DIR, 'train'), transform=train_transform)
                train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=2, pin_memory=True)
                print(f"Re-initialized DataLoader with {len(train_dataset)} samples.\n", flush=True)

    print(f"\nTraining complete! Best Validation Accuracy: {best_val_acc:.2f}%", flush=True)

if __name__ == '__main__':
    main()
