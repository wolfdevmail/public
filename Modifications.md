This file includes only the specific modifications to do for images.py and middlware.py in case simply copying the provided files causes bugs related to different original versions.

In Image.py, we added 2 functions, and modified two others.

# ADDED, this is to parse user's prompt, decide which template is wanted by the user, and update values by whatever is from the user's prompt.
def parse_prompt(prompt: str) -> tuple[dict, str]:
    final_dict = {"pos_": "", "neg": "", "neg_": "", "model": "", "seed": -1, "steps": 4, "width": 512, "height": 512, "count": 1, "length": 80, "cfg": 1.0, "file": "", "tokens": 512}
    # Determine JSON template file
    words = prompt.strip().split()
    json_filename = "txt2img.json"
    if words:
        candidate = words[0].strip()
        # --- Prevent path traversal ---
        if os.path.basename(candidate) == candidate:
            candidate_path = os.path.join(JSON_DIR, f"{candidate}.json")
            if os.path.exists(candidate_path):
                json_filename = f"{candidate}.json"
                words = words[1:]
                prompt = " ".join(words)

    json_path = os.path.join(JSON_DIR, json_filename)

    # Load JSON template safely
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            template = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        template = {}

    # Extract default command text
    default_prompt = ""
    for node in template.values():
        if isinstance(node, dict) and node.get("class_type") == "TextCommandParser":
            inputs = node.get("inputs", {})
            if "command_text" in inputs:
                default_prompt = inputs["command_text"]

    # Extract defaults
    overrides = {k: (v.strip() if v else "") for k, v in PATTERN.findall(default_prompt)}
    for key, value in overrides.items():
        if key in final_dict:
            expected_type = type(final_dict[key])
            try:
                # Only cast if conversion is possible
                final_dict[key] = expected_type(value)
            except (ValueError, TypeError):
                # If casting fails, ignore and keep default
                pass
    default_prompt = re.sub(r"\s{2,}", " ", PATTERN.sub("", default_prompt).strip()).strip()

    # Extract overrides
    overrides = {k: (v.strip() if v else "") for k, v in PATTERN.findall(prompt)}
    prompt = re.sub(r"\s{2,}", " ", PATTERN.sub("", prompt).strip()).strip()
    for key, value in overrides.items():
        if key in final_dict:
            expected_type = type(final_dict[key])
            try:
                # Only cast if conversion is possible
                final_dict[key] = expected_type(value)
            except (ValueError, TypeError):
                # If casting fails, ignore and keep default
                pass

    # Handle "size"
    if "size" in overrides:
        try:
            width_str, height_str = overrides["size"].lower().split("x")
            final_dict["width"] = int(width_str)
            final_dict["height"] = int(height_str)
        except Exception:
            pass  # ignore invalid size

    # Handle "seed"
    if "seed" in final_dict:
        try:
            seed_val = int(final_dict["seed"])
            if seed_val == -1:
                final_dict["seed"] = random.randint(0, 2**31 - 1)
            else:
                final_dict["seed"] = seed_val
        except ValueError:
            pass  # ignore invalid seed

    # Update template JSON
    for node in template.values():
        if isinstance(node, dict) and node.get("class_type") == "TextCommandParser":
            inputs = node.get("inputs", {})
            if "command_text" in inputs:
                inputs["command_text"] = (prompt + " " + " ".join(f"--{k} {v}" for k, v in final_dict.items()))

    json_result = json.dumps(template, indent=2, ensure_ascii=False)
    return final_dict, json_result

# ADDED, This is to extract last input message from user, as well as possible image that the user loaded into the chat (not a lot of testing went into this, i.e. could we have used a built in function, what would happen with multiple images, or non image files, etc.).
async def extract_chat_content(request: Request) -> str | None:
    try:
        body_bytes = await request.body()
        body = json.loads(body_bytes.decode("utf-8"))

        if "prompt" in body and isinstance(body["prompt"], str): return body["prompt"]

        if "messages" not in body or not isinstance(body["messages"], list): return ""

        # Get the last user message
        last_user_msg = next((m for m in reversed(body["messages"])),None)
        if not last_user_msg: return ""

        content = last_user_msg.get("content")

        # Case 1: plain string
        if isinstance(content, str): return content.strip()

        # Case 2: list of structured content
        if isinstance(content, list):
            parts = []
            for item in content:
                if item.get("type") == "text":
                    parts.append(item.get("text", "").strip())
                elif item.get("type") == "image_url":
                    url = item.get("image_url", {}).get("url")
                    if url and url.startswith("data:image"):
                        base64_data = url.split(",")[1]  # drop `data:image/...;base64,`
                        parts.append(f"--file {base64_data}")
            return " ".join(parts).strip()

        return ""

    except Exception as e:
        log.exception(f"Error extracting chat content: {e}")
        return ""
# MODIFIED, Modified function so that it loads other than just images!
def load_url_image_data(url, headers=None):
    try:
        if headers:
            r = requests.get(url, headers=headers)
        else:
            r = requests.get(url)

        r.raise_for_status()
        mime_type = r.headers["content-type"]
        return r.content, mime_type

    except Exception as e:
        log.exception(f"Error saving image: {e}")
        return None

# MODIFIED, Modified image_generations, the elif section related to confyui, so that it uses our parsed prompt, with correct workflow, etc.:
        elif request.app.state.config.IMAGE_GENERATION_ENGINE == "comfyui":
            exact_prompt = await extract_chat_content(request)
            final_dict, final_workflow = parse_prompt(exact_prompt)
            data = {
                "prompt": final_workflow,
                "width": final_dict.get("width", width),
                "height": final_dict.get("height", height),
                "n": final_dict.get("count", form_data.n),
                "steps": final_dict.get("steps", 20),
                "negative_prompt": final_dict.get("neg", ""),
            }
            data = {
                "prompt": form_data.prompt,
                "width": width,
                "height": height,
                "n": form_data.n,
            }

            form_data = ComfyUIGenerateImageForm(
                workflow=ComfyUIWorkflow(workflow=final_workflow, nodes=[]),
                **data
            )

            res = await comfyui_generate_image(
                "",
                form_data,
                user.id,
                request.app.state.config.COMFYUI_BASE_URL,
                request.app.state.config.COMFYUI_API_KEY,
            )
            log.debug(f"res: {res}")

            images = []
            for image in res["data"]:
                headers = None
                if request.app.state.config.COMFYUI_API_KEY:
                    headers = {
                        "Authorization": f"Bearer {request.app.state.config.COMFYUI_API_KEY}"
                    }

                image_data, content_type = load_url_image_data(image["url"], headers)
                url = upload_image(
                    request,
                    image_data,
                    content_type,
                    form_data.model_dump(exclude_none=True),
                    user,
                )
                images.append({"url": url})
            return images

In middleware.py, we modified one function.

# MODIFIED, the important modification is inside the function chat_image_generation_handler, search for "url": image["url"], and replace the whole part with the following, this is in order to achieve 2 objectives: the first is to ignore error happening in case of private chat, and the second is to let ai respond with the user's prompt only without modifications:
        try:
            await __event_emitter__(
                {
                    "type": "files",
                    "data": {
                        "files": [
                            {
                                "type": "image",
                                "url": image["url"],
                            }
                            for image in images
                        ]
                    },
                }
            )
        except AttributeError as e:
            log.info("Ignoring attribute error because of private chat")

        if request.app.state.config.IMAGE_GENERATION_ENGINE == "comfyui":
            system_message_content = "<context>Output the following without any modification, analysis, adding, removing: " + user_message + "</context>"
        else:
            system_message_content = "<context>User is shown the generated image, tell the user that the image has been generated</context>"

  scan();
})();
