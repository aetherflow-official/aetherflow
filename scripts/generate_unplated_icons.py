import os
import glob
from PIL import Image

def generate_assets():
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    icons_dir = os.path.join(project_root, 'src-tauri', 'icons')
    source_path = os.path.join(icons_dir, 'source.png')
    public_logo_path = os.path.join(project_root, 'public', 'logo.png')

    if not os.path.exists(source_path):
        print(f"Error: {source_path} not found")
        return

    # 0. Clean up any conflicting inverted naming variants
    for pattern in ["Square44x44Logo.altform-*.png"]:
        for f in glob.glob(os.path.join(icons_dir, pattern)):
            try:
                os.remove(f)
                print(f"Removed conflicting asset: {os.path.basename(f)}")
            except Exception as e:
                print(f"Error removing {f}: {e}")

    raw_img = Image.open(source_path).convert('RGBA')
    print(f"Loaded master source icon: {source_path} ({raw_img.size})")

    # Crop to non-transparent bounding box to remove excess vertical dead-space
    bbox = raw_img.getbbox()
    if bbox:
        content = raw_img.crop(bbox)
    else:
        content = raw_img

    cw, ch = content.size
    # Place on square master canvas with balanced padding (approx 6-7% margins for clean visual weight)
    max_dim = max(cw, ch)
    canvas_size = int(max_dim / 0.88)
    master_sq = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    paste_x = (canvas_size - cw) // 2
    paste_y = (canvas_size - ch) // 2
    master_sq.paste(content, (paste_x, paste_y), content)

    # Also update public/logo.png for web UI and WebView2 favicon
    master_sq.resize((512, 512), Image.Resampling.LANCZOS).save(public_logo_path, "PNG")
    print(f"Updated public/logo.png ({public_logo_path})")

    # 1. Target sizes for Square44x44Logo (Windows Taskbar, Start Menu, AppList)
    # Canonical UWP syntax: Square44x44Logo.targetsize-{size}_altform-{altform}.png
    target_sizes = [16, 20, 24, 30, 32, 36, 40, 44, 48, 60, 64, 72, 80, 96, 256]
    
    for size in target_sizes:
        resized = master_sq.resize((size, size), Image.Resampling.LANCZOS)
        
        # Dark theme / unplated taskbar icon
        p1 = os.path.join(icons_dir, f"Square44x44Logo.targetsize-{size}_altform-unplated.png")
        resized.save(p1, "PNG")
        
        # Light theme taskbar unplated variant
        p2 = os.path.join(icons_dir, f"Square44x44Logo.targetsize-{size}_altform-lightunplated.png")
        resized.save(p2, "PNG")

        # Standard targetsize fallback
        p3 = os.path.join(icons_dir, f"Square44x44Logo.targetsize-{size}.png")
        resized.save(p3, "PNG")

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
        resized = master_sq.resize((sz, sz), Image.Resampling.LANCZOS)
        resized.save(os.path.join(icons_dir, f"Square44x44Logo.scale-{scale}.png"), "PNG")
    
    # Save standard Square44x44Logo.png
    sq44 = master_sq.resize((44, 44), Image.Resampling.LANCZOS)
    sq44.save(os.path.join(icons_dir, "Square44x44Logo.png"), "PNG")

    # 3. Scale assets for Square150x150Logo
    scales_150 = {
        100: 150,
        125: 188,
        150: 225,
        200: 300,
        400: 600
    }
    for scale, sz in scales_150.items():
        resized = master_sq.resize((sz, sz), Image.Resampling.LANCZOS)
        resized.save(os.path.join(icons_dir, f"Square150x150Logo.scale-{scale}.png"), "PNG")

    sq150 = master_sq.resize((150, 150), Image.Resampling.LANCZOS)
    sq150.save(os.path.join(icons_dir, "Square150x150Logo.png"), "PNG")

    # 4. Scale assets for StoreLogo
    scales_store = {
        100: 50,
        125: 63,
        150: 75,
        200: 100,
        400: 200
    }
    for scale, sz in scales_store.items():
        resized = master_sq.resize((sz, sz), Image.Resampling.LANCZOS)
        resized.save(os.path.join(icons_dir, f"StoreLogo.scale-{scale}.png"), "PNG")

    store_logo = master_sq.resize((50, 50), Image.Resampling.LANCZOS)
    store_logo.save(os.path.join(icons_dir, "StoreLogo.png"), "PNG")

    # 5. Standard Tauri PNGs (32x32, 64x64, 128x128, 128x128@2x, icon.png)
    for sz, name in [
        (32, '32x32.png'),
        (64, '64x64.png'),
        (128, '128x128.png'),
        (256, '128x128@2x.png'),
        (512, 'icon.png'),
    ]:
        resized = master_sq.resize((sz, sz), Image.Resampling.LANCZOS)
        resized.save(os.path.join(icons_dir, name), "PNG")

    # 6. Multi-resolution Windows ICO (16, 20, 24, 30, 32, 40, 48, 64, 128, 256)
    ico_sizes = [(16, 16), (20, 20), (24, 24), (30, 30), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_frames = [master_sq.resize(s, Image.Resampling.LANCZOS) for s in ico_sizes]
    ico_path = os.path.join(icons_dir, "icon.ico")
    ico_frames[0].save(ico_path, format="ICO", sizes=ico_sizes, append_images=ico_frames[1:])
    print(f"Generated multi-resolution ICO at {ico_path} with sizes: {ico_sizes}")

    print("All Windows AppX / MSIX unplated, scaled, and ICO assets generated successfully.")

if __name__ == '__main__':
    generate_assets()
