OpenWebUI ↔️ ComfyUI Integration

The objective of the work below is to extend Open WebUI to interact seamlessly with ComfyUI, enabling flexible workflow selection, parameter control, and multi-format outputs.

🎯 Goals

- Workflow flexibility: Use multiple presets without switching from the admin panel.
- Controlled parameter editing: Expose only specific workflow elements to users.
- Beyond images: Generate videos, text, and more.

To overcome this, we need 3 main things:
- Input output on ConfyUI side that supports easily edited parameters in wanted format
- Open webui backend to support managing multiple workflows, as well as passing what we want to confyui
- Front end to allow for other than images

🛠️ Step 1: ComfyUI — Input & Output Management
🔹 TextCommandParser
  Purpose: Split user input into structured parameters.
  Example input:
    this is positive prompt --pos_ appended positive --neg some neg --neg_ more neg 
    --model mymodel --seed 0 --steps 10 --width 512 --height 512 
    --count 1 --length 80 --cfg 1.0 --file myfile --tokens 512
  Outputs:
    pos, neg, model, seed, steps, width, height, count, cfg, file, tokens
  Not all outputs are required depending on the generation type.
🔹 SaveTextNode, SaveImageNode, SaveVideoNode
Purpose: Save multiple outputs and pass them back to WebUI.
Supports saving multiple items (tested with images).
Always use "output" for WebUI to receive results.

Must return: {"ui": {"images": results}} (even for text/video, since WebUI currently expects images)

🛠️ Step 2: Open WebUI — Backend Modifications

We extend WebUI’s backend to handle dynamic workflows, parameter parsing, and multi-format outputs.

🔹 File: routers/images.py
- Load workflow templates from: /app/backend/data/json_templates/*.json
- Parse user input for overrides: --seed, --width, --height, --steps, etc.
- Handle combined --size WxH.
- Auto-randomize --seed -1.
- Merge parameters into workflow JSON.
- Update generation logic for ComfyUI to support multi-media output.

🔹 File: utils/middleware.py

- Patch chat_image_generation_handler to:
  - Ignore errors in private chats.
  - Echo back user input (instead of AI’s response) when using ComfyUI.

🛠️ Step 3: Frontend — Media Rendering

Instead of modifying WebUI’s frontend directly, we use a Tampermonkey userscript.

🔹 Features
- Replace hardcoded <img> tags with correct media handlers.
- Detect and render image, video, or text.
- Add Copy and Download buttons for each result.
- Auto-update when messages are added/removed.

🔹 Setup
- Install the script in Tampermonkey.
- Update the @match line: // @match https://myendpoint/*
- Grant Allow User Scripts permission in your browser.

📂 Destination Repository Layout
# If you use docker, you need to bind these as volumes ofc!
- webui:
  - /app/backend/data/json_templates/           # Workflow templates (.json). This should contain workflow files, i.e. txt2img.json, txt2img_custom.json, etc.
  - /app/backend/open_webui/routers/images.py   # Modified router with parser & workflow loader 
  - /app/backend/open_webui/utils/middleware.py # Middleware patch for chat handling
  - confyui: /basedir/custom_nodes/FTC              # should contain the folder for the custom node (it is not online, it cannot be imported/downloaded)

🚀 Quick Start
I provided all modified files here, however, depending on your version of confyui and openwebui, you may need to make a copy of the original file and integrate the modifications directly inside it, in this case, look at Modifications.md
If both your webui and confyui are recent, they probably have the same exact code than the ones I modified, and you can simply copy the files provided here to the correct placement, and modify your docker configuration so that they would include these files.
