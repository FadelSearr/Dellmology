import os
import shutil
import random

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(BASE_DIR, 'dataset')
DST_DIR = os.path.join(BASE_DIR, 'dataset_split')

CATEGORIES = ['breakout', 'bullish_flag', 'sideways', 'trash']
SPLIT_RATIO = 0.8  # 80% train, 20% validation

# Limit trash to keep dataset balanced on CPU training
TRASH_LIMIT = 1500

def prepare():
    # Clear dst dir if exists
    if os.path.exists(DST_DIR):
        shutil.rmtree(DST_DIR)
        
    for split in ['train', 'val']:
        for cat in CATEGORIES:
            os.makedirs(os.path.join(DST_DIR, split, cat), exist_ok=True)

    for cat in CATEGORIES:
        src_cat_dir = os.path.join(SRC_DIR, cat)
        images = [f for f in os.listdir(src_cat_dir) if f.endswith('.png')]
        
        # Limit trash class to keep dataset balanced, copy others fully
        if cat == 'trash' and len(images) > TRASH_LIMIT:
            random.seed(42)
            images = random.sample(images, TRASH_LIMIT)
            
        random.shuffle(images)
        split_idx = int(len(images) * SPLIT_RATIO)
        
        train_imgs = images[:split_idx]
        val_imgs = images[split_idx:]
        
        print(f"Copying {cat}: Train={len(train_imgs)}, Val={len(val_imgs)}")
        
        for img in train_imgs:
            shutil.copy(os.path.join(src_cat_dir, img), os.path.join(DST_DIR, 'train', cat, img))
            # Copy companion JSON
            json_file = img.replace('.png', '.json')
            src_json = os.path.join(src_cat_dir, json_file)
            if os.path.exists(src_json):
                shutil.copy(src_json, os.path.join(DST_DIR, 'train', cat, json_file))
                
        for img in val_imgs:
            shutil.copy(os.path.join(src_cat_dir, img), os.path.join(DST_DIR, 'val', cat, img))
            # Copy companion JSON
            json_file = img.replace('.png', '.json')
            src_json = os.path.join(src_cat_dir, json_file)
            if os.path.exists(src_json):
                shutil.copy(src_json, os.path.join(DST_DIR, 'val', cat, json_file))

    print("Dataset split and balancing complete!")

if __name__ == '__main__':
    prepare()
