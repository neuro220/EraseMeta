import zipfile
import os
import shutil

VERSION = "1.0"
COMMON_FILES = [
    "background.js", "content.js", "content-loader.js", 
    "dragUpload.html", "dragUpload.js", "popup.html", "popup.js", "popup.css",
    "icon.png", "icon-16.png", "icon-48.png", "icon-128.png",
    "LICENSE", "utils", "libs"
]

def create_zip(name, manifest_name):
    zip_name = f"EraseMeta_{name}_v{VERSION}.zip"
    print(f"Creating {zip_name}...")
    with zipfile.ZipFile(zip_name, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Add common files
        for item in COMMON_FILES:
            if os.path.isdir(item):
                for root, dirs, files in os.walk(item):
                    for file in files:
                        if "__pycache__" in root or file.endswith(".pyc"):
                            continue
                        file_path = os.path.join(root, file)
                        zf.write(file_path, file_path)
            else:
                if os.path.exists(item):
                    zf.write(item, item)
        
        # Add Manifest as manifest.json
        zf.write(manifest_name, "manifest.json")
    print(f"Done: {zip_name}")

if __name__ == "__main__":
    create_zip("Chrome", "manifest.json")
    create_zip("Firefox", "manifest_firefox.json")
