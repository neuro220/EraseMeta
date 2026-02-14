import zipfile
import os
import shutil

VERSION = "1.2"

# Files and directories to include in the extension package
EXTENSION_FILES = [
    "manifest.json",           # Will be renamed from manifest.json or manifest_firefox.json
    "src",                     # All source code
    "assets",                  # Icons and images
    "libs",                    # Third-party libraries
    "LICENSE",                 # License file
]

def create_zip(name, manifest_name):
    """Create a zip file for the extension."""
    zip_name = f"EraseMeta_{name}_v{VERSION}.zip"
    print(f"Creating {zip_name}...")
    
    # Get the parent directory (ByeByeEXIF folder)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(script_dir)
    
    with zipfile.ZipFile(os.path.join(root_dir, zip_name), 'w', zipfile.ZIP_DEFLATED) as zf:
        # Add manifest with the correct name
        manifest_path = os.path.join(root_dir, manifest_name)
        if os.path.exists(manifest_path):
            zf.write(manifest_path, "manifest.json")
        else:
            print(f"Warning: {manifest_name} not found!")
        
        # Add all extension files
        for item in EXTENSION_FILES[1:]:  # Skip manifest.json (already added)
            item_path = os.path.join(root_dir, item)
            if not os.path.exists(item_path):
                print(f"Warning: {item} not found, skipping...")
                continue
                
            if os.path.isdir(item_path):
                # Add directory recursively
                for root, dirs, files in os.walk(item_path):
                    # Skip __pycache__ and .git directories
                    dirs[:] = [d for d in dirs if d not in ['__pycache__', '.git', 'release', 'github']]
                    
                    for file in files:
                        if file.endswith(".pyc") or file.startswith("."):
                            continue
                        file_path = os.path.join(root, file)
                        # Calculate relative path from root_dir
                        arcname = os.path.relpath(file_path, root_dir)
                        zf.write(file_path, arcname)
            else:
                # Add single file
                arcname = os.path.relpath(item_path, root_dir)
                zf.write(item_path, arcname)
    
    print(f"Done: {zip_name}")

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    create_zip("Chrome", "manifest.json")
    create_zip("Firefox", "manifest_firefox.json")
