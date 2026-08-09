"""
ComfyUI Studio — free-GPU launcher (Google Colab + Kaggle).

Installs stock ComfyUI plus the custom-node packs and model weights for the
capabilities you pick, starts it headless on :8188, health-gates on
/system_stats, then opens a public ngrok tunnel and prints the URL.

Paste that URL into ComfyUI Studio -> Settings -> ComfyUI Server URL and
you're generating.

Run it in ONE cell with GPU ON + Internet ON:
  - Colab: paste this file into a cell; add secrets via the key panel
    (google.colab.userdata), then run. Free T4 (16 GB) works.
  - Kaggle: paste into a cell (secrets via Add-ons -> Secrets), then Run All.

Secrets / env it reads (Colab userdata, Kaggle Secrets, or plain env vars):
  NGROK_AUTHTOKEN       required — ngrok account token (dashboard.ngrok.com)
  TUNNEL_USER           required — username protecting your tunnel (you choose it)
  TUNNEL_PASS           required — password protecting your tunnel (min 8 chars).
                        Without these, anyone who finds the URL could run jobs
                        on your GPU. The launcher prints the URL with the
                        credentials embedded — paste that whole URL into Studio.
  NGROK_STATIC_DOMAIN   optional — free static domain (dashboard.ngrok.com/domains)
                        keeps the URL stable across restarts so you never
                        have to re-paste it into Studio.
  HF_TOKEN              required for image/video — Hugging Face access token
                        (huggingface.co/settings/tokens). SDXL and SVD weights
                        are gated: visit the model pages and accept the license
                        first (stabilityai/stable-diffusion-xl-base-1.0 and
                        stabilityai/stable-video-diffusion-img2vid-xt-1-1).
  COMFY_CAPABILITIES    optional — comma list of what to install:
                        image, video, lipsync, motion.
                        Default picks by VRAM: <20 GB -> image,lipsync;
                        >=20 GB -> image,video,lipsync,motion.
"""

import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

ROOT = "/kaggle/working" if os.path.isdir("/kaggle/working") else os.getcwd()
COMFY_DIR = os.path.join(ROOT, "ComfyUI")
PORT = 8188

CONFIG_KEYS = ["NGROK_AUTHTOKEN", "NGROK_STATIC_DOMAIN", "COMFY_CAPABILITIES", "HF_TOKEN",
               "TUNNEL_USER", "TUNNEL_PASS"]

# Custom-node packs per capability. Core nodes (KSampler, CheckpointLoaderSimple,
# SVD_img2vid_Conditioning, ...) ship with ComfyUI itself.
CAP_NODE_PACKS = {
    "image": [],  # SDXL text-to-image uses only core nodes.
    "video": [
        "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite",
        "https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved",
        "https://github.com/sipherxyz/comfyui-art-venture",
    ],
    "lipsync": [
        "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite",
        "https://github.com/ShmuelRonen/ComfyUI-LatentSyncWrapper",
        "https://github.com/sipherxyz/comfyui-art-venture",
    ],
    "motion": [
        "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite",
        "https://github.com/AIWarper/ComfyUI-MimicMotionWrapper",
        "https://github.com/sipherxyz/comfyui-art-venture",
    ],
}

# Model weights per capability: (dest_rel_path, hf_repo, hf_file).
CAP_MODELS = {
    "image": [
        ("models/checkpoints/sd_xl_base_1.0.safetensors",
         "stabilityai/stable-diffusion-xl-base-1.0", "sd_xl_base_1.0.safetensors"),
    ],
    "video": [
        ("models/checkpoints/svd_xt_1_1.safetensors",
         "stabilityai/stable-video-diffusion-img2vid-xt-1-1", "svd_xt_1_1.safetensors"),
        ("models/checkpoints/v1-5-pruned-emaonly.safetensors",
         "Comfy-Org/stable-diffusion-v1-5-archive", "v1-5-pruned-emaonly-fp16.safetensors"),
        ("models/animatediff_models/mm_sd_v15_v2.ckpt",
         "guoyww/animatediff", "mm_sd_v15_v2.ckpt"),
    ],
    # lipsync/motion wrapper packs self-download their weights on first run.
    "lipsync": [],
    "motion": [],
}


def sh(cmd, cwd=None, check=True):
    print(f"$ {cmd}", flush=True)
    subprocess.run(cmd, shell=True, check=check, cwd=cwd)


def load_secrets():
    """Mirror Kaggle Secrets / Colab userdata into os.environ (env vars win)."""
    try:
        from kaggle_secrets import UserSecretsClient  # type: ignore
        client = UserSecretsClient()
        for key in CONFIG_KEYS:
            if not os.environ.get(key):
                try:
                    val = client.get_secret(key)
                except Exception:
                    val = None
                if val:
                    os.environ[key] = val.strip()
    except Exception:
        pass
    try:
        from google.colab import userdata  # type: ignore
        for key in CONFIG_KEYS:
            if not os.environ.get(key):
                try:
                    val = userdata.get(key)
                except Exception:
                    val = None
                if val:
                    os.environ[key] = val.strip()
    except Exception:
        pass


def detect_vram_gb():
    try:
        import torch  # type: ignore
        if not torch.cuda.is_available():
            return 0.0
        return torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
    except Exception:
        return 0.0


def requested_caps():
    raw = os.environ.get("COMFY_CAPABILITIES", "").strip()
    if raw:
        caps = [c.strip().lower() for c in raw.split(",") if c.strip()]
        bad = [c for c in caps if c not in CAP_NODE_PACKS]
        if bad:
            raise SystemExit(f"[boot] unknown capabilities: {bad}. "
                             f"Valid: {sorted(CAP_NODE_PACKS)}")
        return caps
    vram = detect_vram_gb()
    caps = ["image", "lipsync"] if vram < 20 else ["image", "video", "lipsync", "motion"]
    print(f"[boot] detected {vram:.0f} GB VRAM -> installing {caps}", flush=True)
    return caps


def install_comfyui():
    if not os.path.isdir(COMFY_DIR):
        sh(f"git clone --depth 1 https://github.com/comfyanonymous/ComfyUI {COMFY_DIR}")
    sh(f"{sys.executable} -m pip install -q -r requirements.txt", cwd=COMFY_DIR)
    sh(f"{sys.executable} -m pip install -q pyngrok huggingface_hub", cwd=COMFY_DIR)


def install_node_packs(caps):
    nodes_dir = os.path.join(COMFY_DIR, "custom_nodes")
    seen = set()
    for cap in caps:
        for repo in CAP_NODE_PACKS[cap]:
            if repo in seen:
                continue
            seen.add(repo)
            name = repo.rstrip("/").split("/")[-1]
            dest = os.path.join(nodes_dir, name)
            if not os.path.isdir(dest):
                sh(f"git clone --depth 1 {repo} {dest}")
            req = os.path.join(dest, "requirements.txt")
            if os.path.isfile(req):
                sh(f"{sys.executable} -m pip install -q -r {req}", check=False)


def download_models(caps):
    from huggingface_hub import hf_hub_download  # type: ignore
    token = os.environ.get("HF_TOKEN", "").strip() or None
    needed = [(cap, m) for cap in caps for m in CAP_MODELS[cap]]
    if needed and not token:
        raise SystemExit(
            "[models] HF_TOKEN is required: SDXL / SVD weights are gated on "
            "Hugging Face. Create a token at huggingface.co/settings/tokens, "
            "accept the license on each model page, and add HF_TOKEN as a secret."
        )
    for _cap, (rel, repo, fname) in needed:
        dest = os.path.join(COMFY_DIR, rel)
        if os.path.isfile(dest):
            print(f"[models] cached: {rel}", flush=True)
            continue
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        print(f"[models] downloading {repo}/{fname} -> {rel}", flush=True)
        try:
            path = hf_hub_download(repo_id=repo, filename=fname, token=token)
        except Exception as e:
            raise SystemExit(
                f"[models] download failed for {repo}/{fname}: {e}\n"
                f"          If this is a 401/403, open https://huggingface.co/{repo} "
                "and accept the license with the same account as your HF_TOKEN."
            )
        shutil.copyfile(path, dest)


def start_comfyui():
    cmd = [sys.executable, "main.py", "--listen", "0.0.0.0", "--port", str(PORT)]
    print(f"$ {' '.join(cmd)}", flush=True)
    return subprocess.Popen(cmd, cwd=COMFY_DIR)


def wait_healthy(proc, timeout=300):
    url = f"http://127.0.0.1:{PORT}/system_stats"
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            return False
        try:
            with urllib.request.urlopen(url, timeout=5) as r:
                if r.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(3)
    return False


def open_tunnel():
    from pyngrok import ngrok  # type: ignore
    token = os.environ.get("NGROK_AUTHTOKEN", "").strip()
    if not token:
        raise SystemExit("[tunnel] NGROK_AUTHTOKEN is required — get one free at "
                         "dashboard.ngrok.com and add it as a secret.")
    user = os.environ.get("TUNNEL_USER", "").strip()
    password = os.environ.get("TUNNEL_PASS", "").strip()
    if not user or not password:
        raise SystemExit(
            "[tunnel] TUNNEL_USER and TUNNEL_PASS are required — they password-"
            "protect your GPU so strangers who find the URL can't run jobs on it. "
            "Pick any username and a password of 8+ characters and add them as secrets."
        )
    if len(password) < 8:
        raise SystemExit("[tunnel] TUNNEL_PASS must be at least 8 characters (ngrok requirement).")
    ngrok.set_auth_token(token)
    domain = os.environ.get("NGROK_STATIC_DOMAIN", "").strip() or None
    kwargs = {"auth": f"{user}:{password}"}
    if domain:
        kwargs["domain"] = domain
    tunnel = ngrok.connect(PORT, "http", **kwargs)
    # Return the URL with credentials embedded so it can be pasted into Studio as-is.
    from urllib.parse import quote, urlsplit, urlunsplit
    parts = urlsplit(tunnel.public_url)
    netloc = f"{quote(user, safe='')}:{quote(password, safe='')}@{parts.netloc}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


def main():
    load_secrets()
    caps = requested_caps()
    install_comfyui()
    install_node_packs(caps)
    download_models(caps)

    proc = start_comfyui()
    if not wait_healthy(proc):
        proc.terminate()
        raise SystemExit("[serve] ComfyUI never became healthy on /system_stats — "
                         "check the install logs above.")

    public_url = open_tunnel()
    print("\n" + "=" * 64)
    print("  ComfyUI is LIVE on this GPU!")
    print(f"  URL: {public_url}")
    print()
    print("  -> Open ComfyUI Studio -> Settings -> ComfyUI Server URL")
    print(f"  -> Paste: {public_url}")
    print()
    print("  Keep this cell running. If the session restarts, just re-run it")
    print("  (a static ngrok domain keeps the same URL).")
    print("=" * 64 + "\n", flush=True)
    proc.wait()


if __name__ == "__main__":
    main()
