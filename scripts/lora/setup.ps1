# THE LORA PROJECT — one-time setup on the 3090 Ti PC (see README.md).
#
#   powershell -ExecutionPolicy Bypass -File scripts\lora\setup.ps1
#
# A Python venv on D: with PyTorch (CUDA), Unsloth and the Hugging Face
# training libraries, then Gemma 4 12B-it's weights (~24 GB) into
# D:\solace-ai\models. Reads HF_TOKEN from the repo's .env. Safe to re-run:
# pip skips what's installed and the download resumes.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$py = Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"
$venv = "D:\solace-ai\lora-venv"
$vp = Join-Path $venv "Scripts\python.exe"
$models = "D:\solace-ai\models"

if (-not (Test-Path $vp)) { & $py -m venv $venv }
& $vp -m pip install --upgrade pip --quiet
# PyTorch built for CUDA 12.8 (the 3090 Ti's driver supports it).
& $vp -m pip install torch --index-url https://download.pytorch.org/whl/cu128 --quiet
# Unsloth (fast QLoRA) and the libraries it trains with. triton-windows is
# what lets Unsloth's kernels run on Windows without WSL.
& $vp -m pip install unsloth "triton-windows<3.6" transformers peft trl datasets accelerate bitsandbytes huggingface_hub --quiet

$tok = (Get-Content (Join-Path $root ".env") | Where-Object { $_ -like "HF_TOKEN=*" } | Select-Object -First 1) -replace "^HF_TOKEN=", ""
if (-not $tok) { throw "HF_TOKEN is not in .env" }
New-Item -ItemType Directory -Force $models | Out-Null
$env:HF_TOKEN = $tok
& $vp -c "from huggingface_hub import snapshot_download; p = snapshot_download('google/gemma-4-12B-it', local_dir=r'$models\gemma-4-12B-it'); print('weights at', p)"
& $vp -c "import torch; print('torch', torch.__version__, 'cuda', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')"
