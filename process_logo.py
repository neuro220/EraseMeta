from PIL import Image
import os

SOURCE = "/root/.gemini/antigravity/brain/98ba7ec5-8d3c-4e3e-be95-690222594ae5/logo_variation_slash_1769681721558.png"
SIZES = [16, 48, 128]

def process():
    try:
        img = Image.open(SOURCE).convert("RGBA")
        datas = img.getdata()

        newData = []
        # Simple transparency: if pixel is white-ish, make transparent
        # Since it's a generated image, it might not be pure white.
        # We'll use a threshold.
        threshold = 240
        for item in datas:
            if item[0] > threshold and item[1] > threshold and item[2] > threshold:
                newData.append((255, 255, 255, 0))
            else:
                newData.append(item)

        img.putdata(newData)
        
        # Maximize: Crop to bounding box of non-transparent pixels
        bbox = img.getbbox()
        if bbox:
            img = img.crop(bbox)
            print(f"Cropped to {bbox}")
        
        # Save main icon
        img.save("icon.png", "PNG")
        print("Saved icon.png")

        for size in SIZES:
            # Resize with Lanczos for quality
            resized = img.resize((size, size), Image.Resampling.LANCZOS)
            filename = f"icon-{size}.png"
            resized.save(filename, "PNG")
            print(f"Saved {filename}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    process()
