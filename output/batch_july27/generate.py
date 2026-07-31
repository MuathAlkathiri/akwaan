#!/usr/bin/env python3
"""
Lammah - Guess the Picture Batch Generator
Generates individual puzzle images via ComfyUI and composes final boards.
"""

import json
import time
import uuid
import urllib.request
import urllib.parse
import os
import io
from PIL import Image, ImageDraw, ImageFont

COMFYUI_URL = "http://127.0.0.1:8188"
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
INDIVIDUAL_DIR = os.path.join(OUTPUT_DIR, "individual")
BOARDS_DIR = os.path.join(OUTPUT_DIR, "boards")

# ─── Puzzle Definitions ───────────────────────────────────────────────

PUZZLES = [
    {
        "id": 1,
        "answer": "برميل",
        "difficulty": "easy",
        "acceptedAnswers": ["برميل"],
        "puzzleType": "exact",
        "parts": [
            {
                "intendedArabicWord": "بر",
                "englishPrompt": "A vast Arabian desert landscape with golden sand dunes stretching to the horizon under bright blue sky, photorealistic, studio lighting, clean white background, single dominant subject, high clarity, no text, no watermark",
                "filename": "p1_bar",
            },
            {
                "intendedArabicWord": "ميل",
                "englishPrompt": "A traditional Arabic reed calligraphy pen (qalam) with a sharp pointed tip, lying on a clean white surface, photorealistic, bright studio lighting, clean white background, single dominant subject, high clarity, no text, no watermark",
                "filename": "p1_myl",
            },
        ],
    },
    {
        "id": 2,
        "answer": "سلسلة",
        "difficulty": "hard",
        "acceptedAnswers": ["سلسلة"],
        "puzzleType": "exact",
        "parts": [
            {
                "intendedArabicWord": "سل",
                "englishPrompt": "A human hand extended forward with palm up in a beckoning gesture as if inviting someone to come closer, photorealistic, bright studio lighting, clean white background, single dominant subject, high clarity, no text, no watermark",
                "filename": "p2_sil",
            },
            {
                "intendedArabicWord": "سلة",
                "englishPrompt": "A woven wicker basket with handle, empty, placed on a clean surface, photorealistic, bright studio lighting, clean white background, single dominant subject, high clarity, no text, no watermark",
                "filename": "p2_sila",
            },
        ],
    },
    {
        "id": 3,
        "answer": "حقيبة يد",
        "difficulty": "easy",
        "acceptedAnswers": ["حقيبة يد", "حقيبة اليد"],
        "puzzleType": "phrase",
        "parts": [
            {
                "intendedArabicWord": "حقيبة",
                "englishPrompt": "A stylish leather handbag purse on a clean surface, photorealistic, bright studio lighting, clean white background, single dominant subject, high clarity, no text, no watermark",
                "filename": "p3_haqiba",
            },
            {
                "intendedArabicWord": "يد",
                "englishPrompt": "A single human hand shown palm facing forward with fingers spread, photorealistic, bright studio lighting, clean white background, single dominant subject, high clarity, no text, no watermark",
                "filename": "p3_yad",
            },
        ],
    },
    {
        "id": 4,
        "answer": "نور عين",
        "difficulty": "easy",
        "acceptedAnswers": ["نور عين", "نور عيني"],
        "puzzleType": "phrase",
        "parts": [
            {
                "intendedArabicWord": "نور",
                "englishPrompt": "A bright glowing light source emitting warm golden rays of light against a dark background, photorealistic, dramatic lighting, clean composition, single dominant subject, high clarity, no text, no watermark",
                "filename": "p4_nur",
            },
            {
                "intendedArabicWord": "عين",
                "englishPrompt": "A close-up of a beautiful human eye with detailed iris and eyelashes, photorealistic, bright studio lighting, clean white background, single dominant subject, high clarity, no text, no watermark",
                "filename": "p4_ayn",
            },
        ],
    },
    {
        "id": 5,
        "answer": "بيت مال",
        "difficulty": "medium",
        "acceptedAnswers": ["بيت مال", "بيت المال"],
        "puzzleType": "phrase",
        "parts": [
            {
                "intendedArabicWord": "بيت",
                "englishPrompt": "A beautiful residential house with a pitched roof and windows, exterior view, photorealistic, bright daylight, clean white background, single dominant subject, high clarity, no text, no watermark",
                "filename": "p5_bayt",
            },
            {
                "intendedArabicWord": "مال",
                "englishPrompt": "A pile of shiny gold coins stacked neatly, photorealistic, bright studio lighting, clean white background, single dominant subject, high clarity, no text, no watermark",
                "filename": "p5_mal",
            },
        ],
    },
    {
        "id": 6,
        "answer": "عيد ميلاد سعيد",
        "difficulty": "medium",
        "acceptedAnswers": ["عيد ميلاد سعيد", "عيدميلادسعيد"],
        "puzzleType": "phrase",
        "parts": [
            {
                "intendedArabicWord": "عيد",
                "englishPrompt": "Festive celebration decorations with colorful balloons and streamers, photorealistic, bright studio lighting, clean white background, single dominant subject, high clarity, no text, no watermark",
                "filename": "p6_eid",
            },
            {
                "intendedArabicWord": "ميلاد",
                "englishPrompt": "A newborn baby wrapped in a soft white blanket, photorealistic, bright soft studio lighting, clean white background, single dominant subject, high clarity, no text, no watermark",
                "filename": "p6_milad",
            },
            {
                "intendedArabicWord": "سعيد",
                "englishPrompt": "A person with a big genuine happy smile on their face, photorealistic, bright studio lighting, clean white background, single dominant subject, high clarity, no text, no watermark",
                "filename": "p6_saeed",
            },
        ],
    },
    {
        "id": 7,
        "answer": "وجه قمر",
        "difficulty": "medium",
        "acceptedAnswers": ["وجه قمر", "وجه القمر"],
        "puzzleType": "phrase",
        "parts": [
            {
                "intendedArabicWord": "وجه",
                "englishPrompt": "A beautiful human face shown from the front with clear features, photorealistic, bright studio lighting, clean white background, single dominant subject, high clarity, no text, no watermark",
                "filename": "p7_wajh",
            },
            {
                "intendedArabicWord": "قمر",
                "englishPrompt": "A full bright moon glowing in a dark night sky, photorealistic, dramatic lighting, clean composition, single dominant subject, high clarity, no text, no watermark",
                "filename": "p7_qamar",
            },
        ],
    },
    {
        "id": 8,
        "answer": "فنجان قهوة",
        "difficulty": "easy",
        "acceptedAnswers": ["فنجان قهوة", "فنجان القهوة"],
        "puzzleType": "phrase",
        "parts": [
            {
                "intendedArabicWord": "فنجان",
                "englishPrompt": "An elegant ceramic coffee cup on a saucer, empty, photorealistic, bright studio lighting, clean white background, single dominant subject, high clarity, no text, no watermark",
                "filename": "p8_fenjan",
            },
            {
                "intendedArabicWord": "قهوة",
                "englishPrompt": "A cup filled with dark aromatic coffee with crema on top, steam rising, photorealistic, bright studio lighting, clean white background, single dominant subject, high clarity, no text, no watermark",
                "filename": "p8_qahwa",
            },
        ],
    },
    {
        "id": 9,
        "answer": "ساعة حائط",
        "difficulty": "medium",
        "acceptedAnswers": ["ساعة حائط", "ساعة الحائط"],
        "puzzleType": "phrase",
        "parts": [
            {
                "intendedArabicWord": "ساعة",
                "englishPrompt": "A round analog wall clock with clear numbers and hands showing time, photorealistic, bright studio lighting, clean white background, single dominant subject, high clarity, no text, no watermark",
                "filename": "p9_saa",
            },
            {
                "intendedArabicWord": "حائط",
                "englishPrompt": "A plain white interior wall with subtle texture, photorealistic, bright studio lighting, clean composition, single dominant subject, high clarity, no text, no watermark",
                "filename": "p9_hayt",
            },
        ],
    },
    {
        "id": 10,
        "answer": "قلم حبر",
        "difficulty": "medium",
        "acceptedAnswers": ["قلم حبر", "قلم الحبر"],
        "puzzleType": "phrase",
        "parts": [
            {
                "intendedArabicWord": "قلم",
                "englishPrompt": "A sleek fountain pen with gold nib, photorealistic, bright studio lighting, clean white background, single dominant subject, high clarity, no text, no watermark",
                "filename": "p10_qalam",
            },
            {
                "intendedArabicWord": "حبر",
                "englishPrompt": "A bottle of dark blue ink with the cap off, photorealistic, bright studio lighting, clean white background, single dominant subject, high clarity, no text, no watermark",
                "filename": "p10_hibr",
            },
        ],
    },
]


# ─── ComfyUI Workflow Builder ──────────────────────────────────────────

def build_workflow(prompt_text, seed, width=768, height=768, steps=8, cfg=1.0):
    """Build a ComfyUI API workflow for Flux image generation."""
    client_id = str(uuid.uuid4())

    workflow = {
        "3": {
            "class_type": "UNETLoader",
            "inputs": {
                "unet_name": "flux-2-klein-base-4b.safetensors",
                "weight_dtype": "default",
            },
        },
        "4": {
            "class_type": "CLIPLoader",
            "inputs": {
                "clip_name": "qwen_3_4b.safetensors",
                "type": "flux2",
            },
        },
        "5": {
            "class_type": "VAELoader",
            "inputs": {
                "vae_name": "flux2-vae.safetensors",
            },
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": prompt_text,
                "clip": ["4", 0],
            },
        },
        "7": {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "width": width,
                "height": height,
                "batch_size": 1,
            },
        },
        "8": {
            "class_type": "ModelSamplingFlux",
            "inputs": {
                "model": ["3", 0],
                "max_shift": 1.15,
                "base_shift": 0.5,
                "width": width,
                "height": height,
            },
        },
        "9": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["8", 0],
                "seed": seed,
                "steps": steps,
                "cfg": cfg,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0,
                "latent_image": ["7", 0],
                "positive": ["6", 0],
                "negative": ["10", 0],
            },
        },
        "10": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": "blurry, low quality, distorted, ugly, deformed, text, watermark, logo",
                "clip": ["4", 0],
            },
        },
        "11": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["9", 0],
                "vae": ["5", 0],
            },
        },
        "12": {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["11", 0],
                "filename_prefix": "lammah_gen",
            },
        },
    }

    return workflow, client_id


# ─── ComfyUI API ──────────────────────────────────────────────────────

def queue_prompt(workflow, client_id):
    """Submit a workflow to ComfyUI and return the prompt_id."""
    data = json.dumps({"prompt": workflow, "client_id": client_id}).encode("utf-8")
    req = urllib.request.Request(
        f"{COMFYUI_URL}/prompt",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    resp = urllib.request.urlopen(req)
    result = json.loads(resp.read())
    return result.get("prompt_id")


def wait_for_completion(prompt_id, timeout=600):
    """Poll the ComfyUI history endpoint until the prompt completes."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            resp = urllib.request.urlopen(f"{COMFYUI_URL}/history/{prompt_id}")
            history = json.loads(resp.read())
            if prompt_id in history:
                return history[prompt_id]
        except Exception:
            pass
        time.sleep(2)
    raise TimeoutError(f"Prompt {prompt_id} timed out after {timeout}s")


def download_image(filename, subfolder, save_path):
    """Download a generated image from ComfyUI."""
    params = urllib.parse.urlencode(
        {"filename": filename, "subfolder": subfolder, "type": "output"}
    )
    resp = urllib.request.urlopen(f"{COMFYUI_URL}/view?{params}")
    with open(save_path, "wb") as f:
        f.write(resp.read())


# ─── Image Generation ─────────────────────────────────────────────────

def generate_image(prompt_text, save_path, seed=None):
    """Generate a single image via ComfyUI and save it."""
    if seed is None:
        seed = int.from_bytes(os.urandom(4), "big")

    workflow, client_id = build_workflow(prompt_text, seed)
    prompt_id = queue_prompt(workflow, client_id)

    if not prompt_id:
        raise RuntimeError(f"Failed to queue prompt")

    print(f"  Queued prompt {prompt_id[:8]}..., waiting...")
    result = wait_for_completion(prompt_id)

    outputs = result.get("outputs", {})
    for node_id, node_output in outputs.items():
        if "images" in node_output:
            for img_info in node_output["images"]:
                download_image(
                    img_info["filename"],
                    img_info.get("subfolder", ""),
                    save_path,
                )
                print(f"  Saved: {save_path}")
                return save_path

    raise RuntimeError(f"No image output found for prompt {prompt_id}")


# ─── Board Composition ────────────────────────────────────────────────

def compose_board(puzzle, output_path):
    """Compose a final puzzle board PNG from individual images."""
    CANVAS_W = 1600
    CANVAS_H = 900
    CARD_PADDING = 40
    PLUS_FONT_SIZE = 80

    num_parts = len(puzzle["parts"])
    if num_parts == 2:
        num_cards = 2
        num_plus = 1
    elif num_parts == 3:
        num_cards = 3
        num_plus = 2
    else:
        raise ValueError(f"Unsupported part count: {num_parts}")

    # Calculate card dimensions
    total_plus_width = num_plus * 120  # space for plus signs
    total_padding = (num_cards + 1) * CARD_PADDING
    card_w = (CANVAS_W - total_plus_width - total_padding) // num_cards
    card_h = CANVAS_H - 2 * CARD_PADDING

    # Create canvas
    canvas = Image.new("RGB", (CANVAS_W, CANVAS_H), (255, 255, 255))
    draw = ImageDraw.Draw(canvas)

    # Try to load a font for plus signs
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", PLUS_FONT_SIZE)
    except Exception:
        try:
            font = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", PLUS_FONT_SIZE)
        except Exception:
            font = ImageFont.load_default()

    x = CARD_PADDING

    for i, part in enumerate(puzzle["parts"]):
        img_path = os.path.join(INDIVIDUAL_DIR, f"{part['filename']}.png")
        if not os.path.exists(img_path):
            print(f"  WARNING: Missing image {img_path}")
            x += card_w
            continue

        card = Image.new("RGB", (card_w, card_h), (248, 248, 248))
        card_draw = ImageDraw.Draw(card)

        # Draw subtle border
        card_draw.rectangle(
            [0, 0, card_w - 1, card_h - 1], outline=(220, 220, 220), width=2
        )

        # Load and resize the image to fit within the card
        img = Image.open(img_path).convert("RGB")

        # Calculate "contain" sizing
        img_ratio = img.width / img.height
        card_inner_w = card_w - 2 * 30  # internal padding
        card_inner_h = card_h - 2 * 30

        if img_ratio > (card_inner_w / card_inner_h):
            new_w = card_inner_w
            new_h = int(new_w / img_ratio)
        else:
            new_h = card_inner_h
            new_w = int(new_h * img_ratio)

        img_resized = img.resize((new_w, new_h), Image.LANCZOS)

        # Center the image in the card
        img_x = (card_w - new_w) // 2
        img_y = (card_h - new_h) // 2
        card.paste(img_resized, (img_x, img_y))

        # Paste card onto canvas
        canvas.paste(card, (x, CARD_PADDING))
        x += card_w

        # Draw plus sign between cards
        if i < num_parts - 1:
            plus_x = x + 10
            plus_y = CANVAS_H // 2 - PLUS_FONT_SIZE // 2
            bbox = draw.textbbox((0, 0), "+", font=font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            draw.text(
                (plus_x + 25, CANVAS_H // 2 - th // 2 - 10),
                "+",
                fill=(100, 100, 100),
                font=font,
            )
            x += 120

    canvas.save(output_path, "PNG")
    print(f"  Board saved: {output_path}")
    return output_path


# ─── Main ─────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  LAMMAH - Guess the Picture Batch Generator")
    print("=" * 60)

    results = []

    for puzzle in PUZZLES:
        pid = puzzle["id"]
        print(f"\n{'─' * 50}")
        print(f"  Puzzle {pid}: {puzzle['answer']} ({puzzle['difficulty']})")
        print(f"{'─' * 50}")

        # Step 1: Generate individual images
        for part in puzzle["parts"]:
            save_path = os.path.join(INDIVIDUAL_DIR, f"{part['filename']}.png")
            if os.path.exists(save_path):
                print(f"  Skipping (exists): {part['filename']}.png")
                continue
            print(f"  Generating: {part['intendedArabicWord']}...")
            try:
                generate_image(part["englishPrompt"], save_path)
            except Exception as e:
                print(f"  ERROR generating {part['filename']}: {e}")
                raise

        # Step 2: Compose board
        board_path = os.path.join(BOARDS_DIR, f"board_p{pid}.png")
        print(f"  Composing board...")
        compose_board(puzzle, board_path)

        results.append(
            {
                "answer": puzzle["answer"],
                "difficulty": puzzle["difficulty"],
                "acceptedAnswers": puzzle["acceptedAnswers"],
                "combinedPuzzleAsset": board_path,
            }
        )

    # Save metadata
    meta_path = os.path.join(OUTPUT_DIR, "puzzles_metadata.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 60}")
    print(f"  DONE! Generated {len(results)} puzzles.")
    print(f"  Metadata: {meta_path}")
    print(f"{'=' * 60}")

    return results


if __name__ == "__main__":
    results = main()
    print(json.dumps(results, ensure_ascii=False, indent=2))
