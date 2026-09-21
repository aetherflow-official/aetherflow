import os
from PIL import Image

def generate_assets():
    icons_dir = os.path.join(os.path.dirname(__file__), '..', 'src-tauri', 'icons')
    icons_dir = os.path.abspath(icons_dir)
    source_path = os.path.join(icons_dir, 'source.png')

    if not os.path.exists(source_path):
        print(f"Error: {source_path} not found")
        return

    source_img = Image.open(source_path).convert('RGBA')
    print(f"Loaded master source icon: {source_path} ({source_img.size})")

    # 1. Target sizes for Square44x44Logo (Windows Taskbar, Start Menu, AppList)
    target_sizes = [16, 20, 24, 30, 32, 36, 40, 44, 48, 60, 64, 72, 80, 96, 256]
    
    for size in target_sizes:
        resized = source_img.resize((size, size), Image.Resampling.LANCZOS)
        
        # Naming convention 1: Square44x44Logo.targetsize-{size}_altform-unplated.png
        p1 = os.path.join(icons_dir, f"Square44x44Logo.targetsize-{size}_altform-unplated.png")
        resized.save(p1, "PNG")
        
        # Naming convention 2: Square44x44Logo.altform-unplated_targetsize-{size}.png
        p2 = os.path.join(icons_dir, f"Square44x44Logo.altform-unplated_targetsize-{size}.png")
        resized.save(p2, "PNG")
        
        # Light theme taskbar unplated variant
        p3 = os.path.join(icons_dir, f"Square44x44Logo.targetsize-{size}_altform-lightunplated.png")
        resized.save(p3, "PNG")
        p4 = os.path.join(icons_dir, f"Square44x44Logo.altform-lightunplated_targetsize-{size}.png")
        resized.save(p4, "PNG")

        # Standard plated targetsize fallback
        p5 = os.path.join(icons_dir, f"Square44x44Logo.targetsize-{size}.png")
        resized.save(p5, "PNG")

    print(f"Generated unplated targetsize assets for sizes: {target_sizes}")

    # 2. Scale assets for Square44x44Logo
    scales_44 = {
        100: 44,
        125: 55,
        150: 66,
        200: 88,
        400: 176
    }
    for scale, sz in scales_44.items():
        resized = source_img.resize((sz, sz), Image.Resampling.LANCZOS)
        resized.save(os.path.join(icons_dir, f"Square44x44Logo.scale-{scale}.png"), "PNG")

    # 3. Scale assets for Square150x150Logo
    scales_150 = {
        100: 150,
        125: 188,
        150: 225,
        200: 300,
        400: 600
    }
    for scale, sz in scales_150.items():
        resized = source_img.resize((sz, sz), Image.Resampling.LANCZOS)
        resized.save(os.path.join(icons_dir, f"Square150x150Logo.scale-{scale}.png"), "PNG")

    # 4. Scale assets for StoreLogo
    scales_store = {
        100: 50,
        125: 63,
        150: 75,
        200: 100,
        400: 200
    }
    for scale, sz in scales_store.items():
        resized = source_img.resize((sz, sz), Image.Resampling.LANCZOS)
        resized.save(os.path.join(icons_dir, f"StoreLogo.scale-{scale}.png"), "PNG")

    print("All Windows AppX / MSIX unplated and scaled assets generated successfully.")

if __name__ == '__main__':
    generate_assets()
