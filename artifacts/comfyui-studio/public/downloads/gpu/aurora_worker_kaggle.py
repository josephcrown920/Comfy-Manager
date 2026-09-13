"""Aurora/Comfy-Manager Kaggle free-GPU bootstrap.

Run in a Kaggle notebook with Accelerator=GPU and Internet=ON. Set MANAGER_URL
in Kaggle Secrets if desired. The resulting ComfyUI endpoint can be saved in
Manager's GPU roster and selected for jobs.
"""
import os, subprocess, sys, time, urllib.request

ROOT = "/kaggle/working/aurora-manager-worker"
os.makedirs(ROOT, exist_ok=True)

def sh(command):
    print("$", command, flush=True)
    subprocess.run(command, shell=True, check=True)

# Use Kaggle's existing CUDA/PyTorch image; install only ComfyUI dependencies.
sh("cd /kaggle/working && git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git comfyui")
sh("cd /kaggle/working/comfyui && pip install -q -r requirements.txt")
sh("cd /kaggle/working/comfyui && python main.py --listen 0.0.0.0 --port 8188 > /kaggle/working/aurora-manager-worker/comfyui.log 2>&1 &")

healthy = False
for _ in range(90):
    try:
        urllib.request.urlopen("http://127.0.0.1:8188/system_stats", timeout=2)
        healthy = True
        break
    except Exception:
        time.sleep(2)
if not healthy:
    raise SystemExit("ComfyUI did not become healthy on port 8188; inspect comfyui.log")

print("\nComfy-Manager free GPU worker is running on Kaggle.")
print("Expose port 8188 with your preferred secure tunnel, then add the resulting")
print("ComfyUI URL in Manager → Settings → Saved GPU Roster.")
print("For automatic registration, use the Manager worker launcher that ships with")
print("the deployment rather than putting a registration secret in this notebook.")

while True:
    time.sleep(60)
