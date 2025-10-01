import re
import base64
import os
import requests
from datetime import datetime
from PIL import Image
import numpy as np
import cv2

# ─────────────────────────────
# AnyType trick
# ─────────────────────────────
class AnyType(str):
    """A special type that can be connected to any other types."""
    def __ne__(self, __value: object) -> bool:
        return False

any_type = AnyType("*")
PATTERN = re.compile(r"(?:--|—|\u2014)(\w+)(?:[ =](.*?))?(?=(?:--|—|\u2014)|$)")

# ─────────────────────────────
# Helper: unique path
# ─────────────────────────────
def get_unique_path(path):
    base, ext = os.path.splitext(path)
    counter = 1
    unique_path = path
    while os.path.exists(unique_path):
        unique_path = f"{base}({counter}){ext}"
        counter += 1
    return unique_path

# ─────────────────────────────
# Path sanitization (/basedir/output only)
# ─────────────────────────────
def sanitize_base_path(base_path: str) -> str:
    # Normalize and clean
    base_path = os.path.normpath(base_path).replace("\\", "/")

    # Always prepend /basedir/output once
    if not base_path.startswith("/basedir/output"):
        base_path = os.path.join("/basedir/output", base_path.lstrip("/"))

    abs_path = os.path.abspath(base_path)

    # Ensure inside /basedir/output only
    allowed_root = os.path.abspath("/basedir/output")
    if not os.path.commonpath([abs_path, allowed_root]) == allowed_root:
        raise ValueError("Path must remain inside /basedir/output")

    return abs_path

# ─────────────────────────────
# TextCommandParser
# ─────────────────────────────
class TextCommandParser:
    CATEGORY = "FTC"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "command_text": ("STRING", {"multiline": True}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", any_type, "INT", "INT", "INT", "INT", "INT", "INT", "FLOAT", "STRING", "INT")
    RETURN_NAMES = ("positive", "negative", "model", "seed", "steps", "width", "height", "count", "length", "cfg", "base64_data", "tokens")
    FUNCTION = "parse_text"

    def _load_file_as_base64(self, file_value: str) -> str:
        """Try to fetch file_value (URL, local path, or raw base64)."""
        if not file_value:
            return ""

        # --- URL case ---
        if file_value.startswith("http://") or file_value.startswith("https://"):
            try:
                headers = {"User-Agent": "Mozilla/5.0"}  # mimic browser
                resp = requests.get(file_value, timeout=10, headers=headers)
                resp.raise_for_status()

                # Check content type
                content_type = resp.headers.get("Content-Type", "")
                if "image" not in content_type:
                    print(f"[TextCommandParser] URL does not point to an image: {file_value}")
                    return ""

                return base64.b64encode(resp.content).decode("utf-8")
            except Exception as e:
                print(f"[TextCommandParser] Failed to fetch URL: {e}")
                return ""

        # --- Local file path case ---
        if os.path.exists(file_value):
            try:
                with open(file_value, "rb") as f:
                    return base64.b64encode(f.read()).decode("utf-8")
            except Exception as e:
                print(f"[TextCommandParser] Failed to read file: {e}")
                return ""

        # --- Raw base64 case ---
        try:
            base64.b64decode(file_value, validate=True)
            return file_value
        except Exception:
            print("[TextCommandParser] Provided --file is not valid base64, ignoring.")
            return ""

    def parse_text(self, command_text: str):
        final_dict = {
            "pos": "", "pos_": "", "neg": "", "neg_": "", "model": "", "seed": 0,
            "steps": 20, "width": 512, "height": 512, "count": 1, "length": 80,
            "cfg": 1.0,
            "file": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Cat_August_2010-4.jpg/1920px-Cat_August_2010-4.jpg",
            "tokens": 512
        }

        overrides = {k: (v.strip() if v else "") for k, v in PATTERN.findall(command_text)}
        final_dict["pos"] = re.sub(r"\s{2,}", " ", PATTERN.sub("", command_text).strip()).strip()

        for key, value in overrides.items():
            if key in final_dict:
                expected_type = type(final_dict[key])
                try:
                    final_dict[key] = expected_type(value)
                except (ValueError, TypeError):
                    pass

        if final_dict["pos_"]: final_dict["pos"] = ", ".join([final_dict["pos"], final_dict["pos_"]]).strip(", ")
        if final_dict["neg_"]: final_dict["neg"] = ", ".join([final_dict["neg"], final_dict["neg_"]]).strip(", ")
        final_dict["file"] = self._load_file_as_base64(final_dict.get("file", ""))

        return (
            final_dict["pos"], final_dict["neg"], final_dict["model"], final_dict["seed"],
            final_dict["steps"], final_dict["width"], final_dict["height"], final_dict["count"],
            final_dict["length"], final_dict["cfg"], final_dict["file"], final_dict["tokens"]
        )

# ─────────────────────────────
# Save Text Node
# ─────────────────────────────
class SaveTextNode:
    CATEGORY = "FTC"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "texts": ("STRING", {"tooltip": "Text content(s) to save (can be single or list)"}),
                "filename_prefix": ("STRING", {"tooltip": "Base path + filename for text"})
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "save_text"
    OUTPUT_NODE = True
    DESCRIPTION = "Saves one or multiple text files with timestamp."

    def save_text(self, texts, filename_prefix):
        base_path = sanitize_base_path(filename_prefix)
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        root, ext = os.path.splitext(base_path)
        if not ext:
            ext = ".txt"

        if isinstance(texts, str):
            texts = [texts]

        results = []
        for idx, txt in enumerate(texts):
            full_path = get_unique_path(f"{root}_{timestamp}_{idx}{ext}")
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(txt)
            results.append({
                "filename": os.path.basename(full_path),
                "subfolder": os.path.dirname(full_path),
                "type": "output"
            })
        return {"ui": {"images": results}}

# ─────────────────────────────
# Save Image Node
# ─────────────────────────────
class SaveImageNode:
    CATEGORY = "FTC"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE", {"tooltip": "Text content(s) to save (can be single or list)"}),
                "filename_prefix": ("STRING", {"tooltip": "Base path + filename for text"})
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "save_image"
    OUTPUT_NODE = True
    DESCRIPTION = "Saves one or multiple image files with timestamp."

    def save_image(self, images, filename_prefix):
        base_path = sanitize_base_path(filename_prefix)
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        root, ext = os.path.splitext(base_path)
        if not ext:
            ext = ".png"

        # ✅ Convert torch tensors to numpy safely
        if not isinstance(images, np.ndarray):
            if hasattr(images, "cpu"):
                images = images.cpu().numpy()
            else:
                images = np.array(images)

        img_array = images

        # Normalize to (N, H, W, C)
        if img_array.ndim == 3:  # single image
            batch = np.expand_dims(img_array, 0)
        elif img_array.ndim == 4:
            batch = img_array
        else:
            raise ValueError(f"Unsupported image shape: {img_array.shape}")

        results = []
        for idx, arr in enumerate(batch):
            if arr.dtype != np.uint8:
                arr = np.clip(arr * 255, 0, 255).astype(np.uint8)
            else:
                arr = np.clip(arr, 0, 255).astype(np.uint8)
            if arr.ndim == 4 and arr.shape[0] == 1:  # squeeze (1,H,W,C)
                arr = arr[0]
            img = Image.fromarray(arr)
            full_path = get_unique_path(f"{root}_{timestamp}_{idx}{ext}")
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            img.save(full_path)
            results.append({
                "filename": os.path.basename(full_path),
                "subfolder": os.path.dirname(full_path),
                "type": "output"
            })
        return {"ui": {"images": results}}

# ─────────────────────────────
# Save Video Node
# ─────────────────────────────
class SaveVideoNode:
    CATEGORY = "FTC"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "videos": ("VIDEO", {"tooltip": "Video(s) from another node"}),
                "filename_prefix": ("STRING", {"tooltip": "Base path + filename for saved video(s)"})
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "save_video"
    OUTPUT_NODE = True
    DESCRIPTION = "Saves one or multiple video files with timestamp."

    def save_video(self, videos, filename_prefix):
        base_path = sanitize_base_path(filename_prefix)
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        root, ext = os.path.splitext(base_path)
        if not ext:
            ext = ".mp4"

        # Normalize to list
        if not isinstance(videos, (list, tuple)):
            videos = [videos]

        results = []
        for idx, vid in enumerate(videos):
            suffix = f"_{idx}" if len(videos) > 1 else ""
            full_path = get_unique_path(f"{root}_{timestamp}{suffix}{ext}")
            os.makedirs(os.path.dirname(full_path), exist_ok=True)

            try:
                vid.save_to(full_path)
            except AttributeError:
                raise ValueError("Provided VIDEO object does not support .save_to().")

            results.append({
                "filename": os.path.basename(full_path),
                "subfolder": os.path.dirname(full_path),
                "type": "output"
            })

        return {"ui": {"images": results}}

# ─────────────────────────────
# Node registration
# ─────────────────────────────
NODE_CLASS_MAPPINGS = {
    "TextCommandParser": TextCommandParser,
    "SaveTextNode": SaveTextNode,
    "SaveImageNode": SaveImageNode,
    "SaveVideoNode": SaveVideoNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TextCommandParser": "Text Command Parser",
    "SaveTextNode": "Save Text",
    "SaveImageNode": "Save Image",
    "SaveVideoNode": "Save Video"
}
