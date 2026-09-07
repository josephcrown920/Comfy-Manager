"""
ComfyUI Studio — free-GPU launcher (Google Colab + Kaggle).

Installs stock ComfyUI plus the custom-node packs and model weights for the
capabilities you pick, starts it headless on :8188, health-gates on
/system_stats, then opens a public ngrok tunnel and prints the URL.

Paste that URL into ComfyUI Studio -> Settings -> ComfyUI Server URL and
you're generating.

Run it in ONE cell with GPU ON + Internet ON (or from a Vast.ai terminal):
  - Colab: paste this file into a cell; add secrets via the key panel
    (google.colab.userdata), then run. Free T4 (16 GB) works.
  - Kaggle: paste into a cell (secrets via Add-ons -> Secrets), then Run All.
  - Vast.ai: paste into a terminal or notebook on the GPU instance.

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
                        image, video, lipsync, motion, cinematic.
Legacy Aurora workers: this launcher intentionally connects directly to Studio.
Do not set AURORA_URL or use the old Aurora worker bootstrap with this script.
                        Default picks by VRAM: <20 GB -> image,video,lipsync,cinematic
                        (video = AnimateDiff text-to-video; SVD image-to-video
                        is skipped on small cards); >=20 GB -> all four.
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
    "image": [
        # Automatic subject masking for Product Background Swap.
        "https://github.com/john-mnz/ComfyUI-Inspyrenet-Rembg",
    ],
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
        "https://github.com/kijai/ComfyUI-MimicMotionWrapper",
        "https://github.com/sipherxyz/comfyui-art-venture",
    ],
    "cinematic": [
        # Film Grain & Color Grade (ProPost + art-venture ColorCorrect) and
        # Slow-Motion Upscale (RIFE frame interpolation).
        "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite",
        "https://github.com/digitaljohn/comfyui-propost",
        "https://github.com/Fannovel16/ComfyUI-Frame-Interpolation",
        "https://github.com/sipherxyz/comfyui-art-venture",
    ],
}

# Sentinel node classes used by Studio workflows. Checking one representative
# class per installed pack catches clone, dependency, and import failures without
# requiring every node version to expose an identical full catalog.
CAP_NODE_SENTINELS = {
    "image": [
        ("ComfyUI-Inspyrenet-Rembg", "InspyrenetRembg"),
    ],
    "video": [
        ("ComfyUI-VideoHelperSuite", "VHS_VideoCombine"),
        ("ComfyUI-AnimateDiff-Evolved", "ADE_AnimateDiffLoaderGen1"),
        ("comfyui-art-venture", "ColorCorrect"),
    ],
    "lipsync": [
        ("ComfyUI-VideoHelperSuite", "VHS_VideoCombine"),
        ("ComfyUI-LatentSyncWrapper", "LatentSyncNode"),
        ("comfyui-art-venture", "ColorCorrect"),
    ],
    "motion": [
        ("ComfyUI-VideoHelperSuite", "VHS_VideoCombine"),
        ("ComfyUI-MimicMotionWrapper", "MimicMotionSampler"),
        ("comfyui-art-venture", "ColorCorrect"),
    ],
    "cinematic": [
        ("ComfyUI-VideoHelperSuite", "VHS_VideoCombine"),
        ("comfyui-propost", "ProPostFilmGrain"),
        ("ComfyUI-Frame-Interpolation", "RIFE VFI"),
        ("comfyui-art-venture", "ColorCorrect"),
    ],
}

# Model weights per capability: (dest_rel_path, hf_repo, hf_file, min_vram_gb).
# Entries with min_vram_gb > 0 are skipped on smaller cards so a free 16 GB T4
# still gets a working "video-lite" path (AnimateDiff text-to-video at 512px)
# instead of no video at all. SVD image-to-video genuinely needs ~24 GB.
CAP_MODELS = {
    "image": [
        ("models/checkpoints/sd_xl_base_1.0.safetensors",
         "stabilityai/stable-diffusion-xl-base-1.0", "sd_xl_base_1.0.safetensors", 0),
    ],
    "video": [
        # AnimateDiff (SD1.5) — fits a free 16 GB T4 at 512px / short clips.
        ("models/checkpoints/v1-5-pruned-emaonly.safetensors",
         "Comfy-Org/stable-diffusion-v1-5-archive", "v1-5-pruned-emaonly-fp16.safetensors", 0),
        ("models/animatediff_models/mm_sd_v15_v2.ckpt",
         "guoyww/animatediff", "mm_sd_v15_v2.ckpt", 0),
        # SVD image-to-video — heavy; only installed on ~24 GB cards.
        ("models/checkpoints/svd_xt_1_1.safetensors",
         "stabilityai/stable-video-diffusion-img2vid-xt-1-1", "svd_xt_1_1.safetensors", 20),
    ],
    # lipsync/motion wrapper packs self-download their weights on first run.
    "lipsync": [
        # LatentSyncWrapper otherwise downloads these during node startup.
        ("custom_nodes/ComfyUI-LatentSyncWrapper/checkpoints/latentsync_unet.pt",
         "ByteDance/LatentSync-1.6", "latentsync_unet.pt", 0),
        ("custom_nodes/ComfyUI-LatentSyncWrapper/checkpoints/whisper/tiny.pt",
         "ByteDance/LatentSync-1.6", "whisper/tiny.pt", 0),
    ],
    "motion": [
        # MimicMotion is only installed by default on larger GPUs.
        ("models/mimicmotion/MimicMotionMergedUnet_1-1-fp16.safetensors",
         "Kijai/MimicMotion_pruned",
         "MimicMotionMergedUnet_1-1-fp16.safetensors", 20),
    ],
    "cinematic": [
        # 2x upscaler for Slow-Motion Upscale (ungated repo). RIFE weights are
        # self-downloaded by ComfyUI-Frame-Interpolation on first use.
        ("models/upscale_models/RealESRGAN_x2.pth",
         "ai-forever/Real-ESRGAN", "RealESRGAN_x2.pth", 0),
    ],
}

# Frame Interpolation downloads these lazily on first execution. Download the
# selected checkpoint during launch so the first real job does not fail or
# appear stuck while the node fetches a model.
CAP_URL_MODELS = {
    "cinematic": [
        (
            "custom_nodes/ComfyUI-Frame-Interpolation/ckpts/rife/rife47.pth",
            "https://huggingface.co/marduk191/rife/resolve/main/rife47.pth",
            0,
        ),
    ],
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
    # Free 16 GB cards get image + video-lite (AnimateDiff) + lipsync +
    # cinematic (post-processing/interpolation — light on VRAM).
    # Motion control (MimicMotion) and SVD need ~24 GB.
    caps = (["image", "video", "lipsync", "cinematic"] if vram < 20
            else ["image", "video", "lipsync", "motion", "cinematic"])
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
    vram = detect_vram_gb()
    for _cap, (rel, repo, fname, min_vram) in needed:
        if min_vram and vram and vram < min_vram:
            print(f"[models] skipping {fname} — needs a ~{min_vram}+ GB GPU "
                  f"(this card has {vram:.0f} GB). Video still works via AnimateDiff.", flush=True)
            continue
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

    for cap in caps:
        for rel, url, min_vram in CAP_URL_MODELS.get(cap, []):
            if min_vram and vram and vram < min_vram:
                print(f"[models] skipping {url.rsplit('/', 1)[-1]} — needs a ~{min_vram}+ GB GPU "
                      f"(this card has {vram:.0f} GB)", flush=True)
                continue
            dest = os.path.join(COMFY_DIR, rel)
            if os.path.isfile(dest):
                print(f"[models] cached: {rel}", flush=True)
                continue
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            print(f"[models] downloading {url} -> {rel}", flush=True)
            try:
                with urllib.request.urlopen(url, timeout=60) as response, open(dest, "wb") as output:
                    shutil.copyfileobj(response, output)
            except Exception as e:
                raise SystemExit(
                    f"[models] direct download failed for {url}: {e}\n"
                    "          Re-run the launcher after checking that the GPU runtime has Internet enabled."
                )


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


def check_node_packs(caps):
    url = f"http://127.0.0.1:{PORT}/object_info"
    expected = []
    seen = set()
    for cap in caps:
        for pack, node_class in CAP_NODE_SENTINELS[cap]:
            if (pack, node_class) not in seen:
                seen.add((pack, node_class))
                expected.append((pack, node_class))

    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            if response.status != 200:
                raise RuntimeError(f"HTTP {response.status}")
            registered = json.load(response)
        if not isinstance(registered, dict):
            raise RuntimeError("response was not a node catalog")
    except Exception as exc:
        print("\n" + "!" * 72)
        print("  WARNING: COULD NOT VERIFY CUSTOM NODE PACKS")
        print(f"  ComfyUI is running, but /object_info could not be read: {exc}")
        print("  Jobs may fail because required custom nodes could be missing.")
        print("!" * 72 + "\n", flush=True)
        return False

    missing = [(pack, node_class) for pack, node_class in expected
               if node_class not in registered]
    if not missing:
        print(f"[nodes] verified {len(expected)} custom node pack sentinels.", flush=True)
        return True

    print("\n" + "!" * 72)
    print("  WARNING: CUSTOM NODE PACKS FAILED TO REGISTER")
    print("  ComfyUI is running, but these required nodes are missing:")
    for pack, node_class in missing:
        print(f"    - {pack}: {node_class}")
    print("  Jobs using these packs will fail. Review the install/startup logs above")
    print("  and re-run this launcher after fixing the reported dependency errors.")
    print("!" * 72 + "\n", flush=True)
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
    try:
        tunnel = ngrok.connect(PORT, "http", **kwargs)
    except Exception as exc:
        # A static domain can still be attached to a previous notebook session.
        # Do not strand a healthy ComfyUI process: use a temporary ngrok URL and
        # tell the user exactly why the stable URL was not used.
        if domain:
            print(f"[tunnel] static domain unavailable ({exc}); retrying with a temporary URL.", flush=True)
            tunnel = ngrok.connect(PORT, "http", auth=f"{user}:{password}")
        else:
            raise
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

    check_node_packs(caps)
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
