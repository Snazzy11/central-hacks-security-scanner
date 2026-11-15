import io
import zipfile
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

router = APIRouter(tags=["extension"])

# repo_root/extension, resolved from backend/app/api/routes/extension.py
EXTENSION_DIR = Path(__file__).resolve().parents[4] / "extension"
ZIP_FOLDER = "piishooter-extension"
# Only what Chrome needs to load the extension; tests stay out of the download.
INCLUDE = ("manifest.json", "README.md", "icons", "popup", "src")


@router.get("/extension/download")
def download_extension() -> Response:
    """Zip the unpacked extension on request, so the download always matches the repo."""
    if not (EXTENSION_DIR / "manifest.json").is_file():
        raise HTTPException(status_code=404, detail="Extension files not found")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in INCLUDE:
            path = EXTENSION_DIR / name
            files = [path] if path.is_file() else sorted(p for p in path.rglob("*") if p.is_file())
            for file in files:
                if file.name == ".DS_Store":
                    continue
                zf.write(file, f"{ZIP_FOLDER}/{file.relative_to(EXTENSION_DIR)}")

    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{ZIP_FOLDER}.zip"'},
    )
