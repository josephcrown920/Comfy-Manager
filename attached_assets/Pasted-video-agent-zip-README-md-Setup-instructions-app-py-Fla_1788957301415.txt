video-agent.zip
├── README.md          # Setup instructions
├── app.py             # Flask/Express server (Python + Node versions)
├── package.json       # (for Node.js users)
├── requirements.txt   # (for Python users)
├── examples/
│   ├── test_video.py      # Quick test: generate a video
│   ├── test_image.py      # Quick test: generate an image
│   └── test_code.py       # Quick test: coding/reasoning 
└── config.example.env # Copy this and fill in your API key  You're right — the ZIP is in the session outputs folder but there's no direct download link in this chat. Let me give you the contents directly so you can create it yourself in Replit in 30 seconds.
Easier way: create the files directly in Replit

Just create these 3 files in your Replit project and you're good to go:
1. Create video_agent.py

import os
import requests

class VideoAgent:

    BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3"
    SESSION_ID = "sesn-20260908153422-5m5h7"


    def __init__(self, api_key=None):
        self.api_key = api_key or os.environ.get("ARK_API_KEY")
        if not self.api_key:
            raise ValueError("Set ARK_API_KEY environment variable")
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def send(self, message, timeout=120):
        resp = requests.post(
            f"{self.BASE_URL}/sessions/{self.SESSION_ID}/messages",
            headers=self.headers,
            json={"role": "user", "content": message},
            timeout=timeout,
        )
        resp.raise_for_status()
        return resp.json()

    def generate_video(self, prompt, duration=5, ratio="16:9", resolution="720p"):
        return self.send(f"Generate a video:\n- Prompt: {prompt}\n- Duration: {duration}s\n- Ratio: {ratio}\n- Resolution: {resolution}")

    def generate_image(self, prompt, size="2K"):
        return self.send(f"Generate an image:\n- Prompt: {prompt}\n- Size: {size}")

    def code(self, instruction):
        return self.send(instruction)
2. Run in shell:

pip install requests
3. Test it:

from video_agent import VideoAgent
agent = VideoAgent()
result = agent.send("say hello")
print(result)
     The good news: The BytePlus agent I built (agent-20260908151439-ftzb6) doesn't have any of these problems. It uses models you've already paid for, with proper fallbacks.
The Fix: Swap Your Broken Models for the BytePlus Agent

Your app is calling multiple different AI providers right now. To fix it immediately, replace all those broken model calls with the one BytePlus agent I built you. It handles video, images, AND reasoning — all with one API call.
In your Replit app, find where you're calling the LLM and replace it with this:

If you were using something like OpenAI SDK — swap to this:

import os
import requests

# Instead of calling OpenAI / Groq / etc. directly,
# call the BytePlus agent which handles all the models + fallbacks

def call_video_agent(prompt: str) -> str:
    resp = requests.post(
        "https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260908153422-5m5h7/messages",
        headers={
            "Authorization": f"Bearer {os.environ['ARK_API_KEY']}",
            "Content-Type": "application/json",
        },
        json={"role": "user", "content": prompt},
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    # Extract the assistant's reply
    if "content" in data:
        return data["content"]
    return str(data)

For the response_format error specifically — stop using response_format: { type: "json_object" } if the API doesn't support it. The BytePlus agent doesn't need it — just ask it to return JSON in your prompt and it will. 
Step-by-step for Replit
1. Add your API key as a Secret

In your Replit project, go to Tools → Secrets (or Environment Variables)
Add a new secret:
Key: ARK_API_KEY
Value: (your BytePlus ModelArk API key)
2. Use this code to call the agent

Python (app.py):

import os
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)


API_KEY = os.environ["ARK_API_KEY"]
BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3"
SESSION_ID = "sesn-20260908153422-5m5h7"

def send_to_agent(message: str) -> dict:
    """Send a message to the video generation agent and return the response."""

    resp = requests.post(
        f"{BASE_URL}/sessions/{SESSION_ID}/messages",
        headers={
            "Authorization": f"Bearer {API_KEY}",

            "Content-Type": "application/json",
        },
        json={"role": "user", "content": message},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()

@app.route("/api/generate", methods=["POST"])
def generate():
    data = request.json
    prompt = data.get("prompt", "")
    if not prompt:
        return jsonify({"error": "prompt is required"}), 400
    result = send_to_agent(prompt)
    return jsonify(result)

@app.route("/")
def index():
    return "Video Agent API is running!"

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)

Or if you just want a simple test script:

import os
import requests

API_KEY = os.environ["ARK_API_KEY"]
BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3"
SESSION_ID = "sesn-20260908153422-5m5h7"


result = requests.post(

    f"{BASE_URL}/sessions/{SESSION_ID}/messages",

    headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    json={"role": "user", "content": "say hello"},
).json()

print(result)
3. Install dependencies

In Replit's shell:

pip install requests flask
If your app is in JavaScript/Node.js instead:

const express = require('express');
const app = express();
app.use(express.json());

const API_KEY = process.env.ARK_API_KEY;
const BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
const SESSION_ID = "sesn-20260908153422-5m5h7";

app.post('/api/generate', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt is required" });
  
  const response = await fetch(`${BASE_URL}/sessions/${SESSION_ID}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "user", content: prompt }),
  });
  
  const data = await response.json();
  res.json(data);
});

app.listen(8080, () => console.log("Agent API running on port 8080"));
