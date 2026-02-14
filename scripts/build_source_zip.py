import zipfile
import os

VERSION = "1.2"

def create_source_zip():
    """Create a zip file with source code for GitHub."""
    zip_name = f"EraseMeta_Source_v{VERSION}.zip"
    print(f"Creating {zip_name}...")
    
    # Get the root directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(script_dir)
    
    # Directories/files to exclude
    exclude_dirs = [
        '.git',
        '__pycache__',
        'release',
        'github',
        'docs',     # Exclude docs folder (contains .md files)
        '.DS_Store',
        'node_modules',
        '.idea',
        '.vscode',
    ]
    
    exclude_files = [
        '*.zip',    # Exclude existing zip files
        '*.pyc',
        '.gitignore',
        '*.md',     # Exclude all markdown files
    ]
    
    with zipfile.ZipFile(os.path.join(root_dir, zip_name), 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(root_dir):
            # Filter out excluded directories
            dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith('.')]
            
            for file in files:
                # Skip excluded files
                if any(file.endswith(ext.replace('*', '')) for ext in exclude_files if '*' in ext):
                    continue
                if file in exclude_files:
                    continue
                if file.startswith('.'):
                    continue
                    
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, root_dir)
                zf.write(file_path, arcname)
    
    print(f"Done: {zip_name}")

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    create_source_zip()
