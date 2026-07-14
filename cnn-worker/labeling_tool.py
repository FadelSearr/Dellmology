import os
import shutil
import tkinter as tk
from PIL import Image, ImageTk

# Setup paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UNLABELED_DIR = os.path.join(BASE_DIR, 'dataset', 'unlabeled')
CATEGORIES = {
    '1': os.path.join(BASE_DIR, 'dataset', 'breakout'),
    '2': os.path.join(BASE_DIR, 'dataset', 'bullish_flag'),
    '3': os.path.join(BASE_DIR, 'dataset', 'sideways'),
    '4': os.path.join(BASE_DIR, 'dataset', 'trash') # For unusable charts
}

# Ensure directories exist
for path in CATEGORIES.values():
    os.makedirs(path, exist_ok=True)

class LabelingTool:
    def __init__(self, root):
        self.root = root
        self.root.title("Image Labeling Tool")
        self.images = [f for f in os.listdir(UNLABELED_DIR) if f.endswith(('.png', '.jpg'))]
        self.current_idx = 0
        
        if not self.images:
            print("No images found in dataset/unlabeled")
            self.root.quit()
            return
            
        self.label = tk.Label(root)
        self.label.pack()
        
        self.info = tk.Label(root, text="1: Breakout | 2: Bullish Flag | 3: Sideways | 4: Trash | Space: Skip", font=("Arial", 14))
        self.info.pack()
        
        self.status = tk.Label(root, text="", font=("Arial", 12))
        self.status.pack()

        self.root.bind('<Key>', self.on_key)
        self.show_image()

    def show_image(self):
        if self.current_idx >= len(self.images):
            self.info.config(text="All images processed!")
            self.label.config(image='')
            return
            
        img_name = self.images[self.current_idx]
        img_path = os.path.join(UNLABELED_DIR, img_name)
        
        self.status.config(text=f"Image {self.current_idx + 1}/{len(self.images)}: {img_name}")
        
        img = Image.open(img_path)
        img = img.resize((600, 400), Image.LANCZOS)
        self.tk_img = ImageTk.PhotoImage(img)
        self.label.config(image=self.tk_img)

    def on_key(self, event):
        key = event.char
        if key in CATEGORIES:
            img_name = self.images[self.current_idx]
            src = os.path.join(UNLABELED_DIR, img_name)
            dst = os.path.join(CATEGORIES[key], img_name)
            shutil.move(src, dst)
            self.current_idx += 1
            self.show_image()
        elif event.keysym == 'space':
            self.current_idx += 1
            self.show_image()

if __name__ == "__main__":
    root = tk.Tk()
    app = LabelingTool(root)
    root.mainloop()
