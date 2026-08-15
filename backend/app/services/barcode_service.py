import io
import secrets
import string
import uuid

import barcode
import qrcode
from barcode.writer import ImageWriter
from PIL import Image


class BarcodeService:
    @staticmethod
    def generate_code128_value() -> str:
        chars = string.ascii_uppercase + string.digits
        suffix = "".join(secrets.choice(chars) for _ in range(8))
        return f"OSCA-{suffix}"

    @staticmethod
    def render_code128(value: str, dpi: int = 300) -> bytes:
        code128_class = barcode.get_barcode_class("code128")
        writer = ImageWriter()

        options = {
            "module_width": 0.264,
            "module_height": 15.0,
            "font_size": 10,
            "text_distance": 5,
            "background": "white",
            "foreground": "black",
            "write_text": True,
            "dpi": dpi,
        }

        code = code128_class(value, writer=writer)
        buffer = io.BytesIO()
        code.write(buffer, options=options)
        buffer.seek(0)
        return buffer.read()

    @staticmethod
    def generate_qr_value(instructor_id: str) -> str:
        return f"BID-{instructor_id}"

    @staticmethod
    def render_qr(value: str, box_size: int = 10, border: int = 4) -> bytes:
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=box_size,
            border=border,
        )
        qr.add_data(value)
        qr.make(fit=True)

        img: Image.Image = qr.make_image(fill_color="black", back_color="white")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)
        return buffer.read()
