from __future__ import annotations

from io import BytesIO

from PIL import Image, UnidentifiedImageError

FORMATS = {
    "JPEG": ("image/jpeg", ".jpg"),
    "PNG": ("image/png", ".png"),
    "WEBP": ("image/webp", ".webp"),
}


def sanitize_image(data: bytes) -> tuple[bytes, str, str]:
    try:
        with Image.open(BytesIO(data)) as source:
            if source.format not in FORMATS:
                raise ValueError("Only JPEG, PNG, or WebP images are accepted")
            if (
                source.width > 20_000
                or source.height > 20_000
                or source.width * source.height > 25_000_000
            ):
                raise ValueError("Image dimensions exceed the supported limit")
            source.verify()
        with Image.open(BytesIO(data)) as source:
            image_format = source.format
            image = source.convert("RGB") if image_format == "JPEG" else source.copy()
            output = BytesIO()
            image.save(output, format=image_format)
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError, SyntaxError) as error:
        raise ValueError("Uploaded file is not a valid image") from error
    mime_type, extension = FORMATS[image_format]
    return output.getvalue(), mime_type, extension
