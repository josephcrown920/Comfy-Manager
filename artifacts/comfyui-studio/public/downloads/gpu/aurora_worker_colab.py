"""Aurora/Comfy-Manager Colab free-GPU bootstrap.

Run in a Colab GPU runtime. Configure these Colab Secrets when automatic worker
registration is desired: MANAGER_URL, WORKER_REGISTER_SECRET, NGROK_AUTHTOKEN,
NGROK_STATIC_DOMAIN. The worker is intended to join the Manager ComfyUI worker
pool; no paid-provider key is embedded here.
"""
import os, subprocess, sys, time, urllib.request

ROOT = "/content/aurora-manager-worker"

def secret(name, default=""):
    value = os.environ.get(name, "").strip()
    if value:
        return value
    try:
        from google.colab import userdata
        value = userdata.get(name)
        return value.strip() if value else default
    except Exception:
        return default

def sh(command):
    print("$", command, flush=True)
    subprocess.run(command, shell=True, check=True)

MANAGER_URL = secret("MANAGER_URL").rstrip("/")
if not MANAGER_URL:
    raise SystemExit("Set MANAGER_URL in Colab Secrets to your deployed Comfy-Manager URL.")

os.makedirs(ROOT, exist_ok=True)
sh("pip install -q torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124")
sh("pip install -q comfyui[comfyui-workflow-templates] pyngrok requests")

# Start a stock ComfyUI server. Manager treats it as a normal worker endpoint.
sh(f"python -m comfyui --listen 0.0.0.0 --port 8188 > {ROOT}/comfyui.log 2>&1 &")

healthy = False
for _ in range(90):
    try:
        urllib.request.urlopen("http://127.0.0.1:8188/system_stats", timeout=2)
        healthy = True
        break
    except Exception:
        time.sleep(2)
if not healthy:
    raise SystemExit("ComfyUI did not become healthy on port 8188; see /content/aurora-manager-worker/comfyui.log")

from pyngrok import ngrok
ngrok_token = secret("NGROK_AUTHTOKEN")
if ngrok_token:
    ngrok.set_auth_token(ngrok_token)
domain = secret("NGROK_STATIC_DOMAIN")
if domain:
    domain = domain.replace("https://", "").replace("http://", "").rstrip("/")
    ngrok.connect(addr="8188", domain=domain)
    public_url = "https://" + domain
else:
    public_url = ngrok.connect(8188).public_url

print("\nComfy-Manager free GPU worker is live")
print("ComfyUI endpoint:", public_url)
print("Open Manager → Settings → Saved GPU Roster and save this endpoint.")
print("Then select it under Job Routing → Specific GPU, or leave routing on Automatic Pool.")
print("Keep this Colab session alive while the free GPU is needed.")

while True:
    time.sleep(60)
