"""Comfy-Manager Colab free-GPU bootstrap.

Run in a Colab GPU runtime. The resulting ComfyUI endpoint can be saved in
Manager Settings → Saved GPU Roster and selected for jobs. No paid-provider
credentials are embedded in this launcher.
"""
import os, subprocess, time, urllib.request

ROOT = "/content/aurora-manager-worker"
os.makedirs(ROOT, exist_ok=True)

def sh(command):
    print("$", command, flush=True)
    subprocess.run(command, shell=True, check=True)

def secret(name):
    value = os.environ.get(name, "").strip()
    if value:
        return value
    try:
        from google.colab import userdata
        value = userdata.get(name)
        return value.strip() if value else ""
    except Exception:
        return ""

sh("cd /content && test -d ComfyUI || git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git ComfyUI")
sh("cd /content/ComfyUI && pip install -q -r requirements.txt")
sh("cd /content/ComfyUI && python main.py --listen 0.0.0.0 --port 8188 > /content/aurora-manager-worker/comfyui.log 2>&1 &")

for _ in range(90):
    try:
        urllib.request.urlopen("http://127.0.0.1:8188/system_stats", timeout=2)
        break
    except Exception:
        time.sleep(2)
else:
    raise SystemExit("ComfyUI did not become healthy; inspect /content/aurora-manager-worker/comfyui.log")

from pyngrok import ngrok
ngrok_token = secret("NGROK_AUTHTOKEN")
if ngrok_token:
    ngrok.set_auth_token(ngrok_token)
domain = secret("NGROK_STATIC_DOMAIN").replace("https://", "").replace("http://", "").rstrip("/")
if domain:
    ngrok.connect(addr="8188", domain=domain)
    public_url = "https://" + domain
else:
    public_url = ngrok.connect(8188).public_url

print("\nComfy-Manager free GPU worker is live")
print("ComfyUI endpoint:", public_url)
print("Save this endpoint in Manager → Settings → Saved GPU Roster.")
print("Then select it in GPU Hub or Job Routing → Specific GPU.")
print("Keep the Colab session alive while this worker is needed.")
while True:
    time.sleep(60)
