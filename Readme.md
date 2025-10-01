This is the first time I'm publishing here, so excuse the format, and lack of time to make a better solution, feel free to ask if anything is not clear, however, in any case, some limited programming/dev knowledge would help here, and is kinda expected when dealing with modifying your locally hosted ai..
Please note that not much went into "security", or making a solution for hosts that have multiple users, etc. I only use this for myself, and found that there are no existing solutions, so I wanted to provide one.

The main objective is to allow users on open webui to make prompts which result in generating images, video, text, based on specific preprepared comfyui workflow templates, with some adjustments.

The current solution is sloppy, but works, can use any preprepared template workflow, can create new templates as long as we use the input/output from the provided comfyui node, and can view results directly in open webui.
**Hopefully, something along these lines would become soon available in open webui directly, or as a separate tool/function.**

Installation:
- You need to add the custom node to comfyui in /basedir/custom_nodes/FTC, test that custom node works inside comfyui before testing anything on side of webui
- You also need to override 3 files on the webui side, you can try to simply use files provided in this repo, however, if your original files are different than my original files (different versions, etc.) then you will need to make copy of the original file you have, and manually update the contents inside it using the Modifications.md file.
  - /app/backend/open_webui/static/loader.js (in original build, this is empty, I think it is kept as such so that you can customize a loader, which is what we are doing)
  - /app/backend/open_webui/utils/middleware.py (could break if you have a different version than the original one we modified)
  - /app/backend/open_webui/routers/images.py (could break if you have a different version than the original one we modified)

Note:
- Some additional controls are in place, for instance, in loader.js so that it executes in specific cases when it sees img element inside specific button or div, this is to limit which images are replaced, depending on the version, there could be differences in button or div format leading to js part not being executed, in this case, right click on the broken image, inspect, check the specifics of where it is located (i.e. what is its parent? a div? a button? how can we identify it? label? class? update the scan function so that it is exactly looking at these parents!

Usage:

<img width="1228" height="533" alt="image" src="https://github.com/user-attachments/assets/a0e46566-d919-4068-859c-14ffa5bb976f" />
<img width="1695" height="743" alt="image" src="https://github.com/user-attachments/assets/bf048205-f9b7-4fe3-8010-7c4aa37984a2" />
<img width="1084" height="423" alt="image" src="https://github.com/user-attachments/assets/6ff9e94b-7875-48aa-9fec-7ebe0b067448" />

The annoying part was ability to update a generated section by requiring something new, and not having to load the page, but now it is possible -->

<img width="1444" height="812" alt="image" src="https://github.com/user-attachments/assets/54eb7f23-44e5-4c14-9ac0-692430afcd2f" />
