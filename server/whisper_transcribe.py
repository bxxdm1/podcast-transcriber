#!/usr/bin/env python3
"""
本地 Faster-Whisper 转录脚本
"""
import sys
import os
import json
import argparse
import time
from pathlib import Path

# 确保 ffmpeg 可用 (Anaconda 路径)
conda_bin = Path(r"D:\Study_tools\Anaconda\Library\bin")
if conda_bin.exists():
    os.environ["PATH"] = str(conda_bin) + os.pathsep + os.environ.get("PATH", "")

from faster_whisper import WhisperModel


class WhisperTranscriber:
    def __init__(self, model_size="base", device="cpu", compute_type="int8"):
        print(f"🔄 加载Whisper模型: {model_size}", file=sys.stderr)
        self.model = WhisperModel(model_size, device=device, compute_type=compute_type)
        print(f"✅ 模型加载完成", file=sys.stderr)

    def transcribe(self, audio_path, language=None):
        try:
            print(f"🎤 转录: {audio_path}", file=sys.stderr)
            start = time.time()

            segments, info = self.model.transcribe(
                audio_path,
                language=language,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500)
            )

            text = ""
            seg_list = []
            for seg in segments:
                seg_list.append({"start": seg.start, "end": seg.end, "text": seg.text.strip()})
                text += seg.text.strip() + " "

            elapsed = time.time() - start
            print(f"✅ 转录完成: {elapsed:.1f}秒", file=sys.stderr)

            return {
                "success": True,
                "file": str(audio_path),
                "text": text.strip(),
                "segments": seg_list,
                "language": info.language,
                "language_probability": info.language_probability,
                "duration": info.duration,
                "processing_time": round(elapsed, 2)
            }
        except Exception as e:
            print(f"❌ 转录失败: {e}", file=sys.stderr)
            return {"success": False, "file": str(audio_path), "error": str(e), "text": ""}


def save_transcript(text, save_dir, file_prefix=None, podcast_title=None):
    save_path = Path(save_dir)
    save_path.mkdir(parents=True, exist_ok=True)

    filename = f"{file_prefix}_transcript.md" if file_prefix else f"transcript_{int(time.time())}.md"
    file_path = save_path / filename

    title = podcast_title or "播客转录"
    content = f"# 📝 {title}\n\n{text}\n"

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

    size = file_path.stat().st_size
    print(f"📄 已保存: {file_path} ({size/1024:.1f}KB)", file=sys.stderr)
    return {"type": "transcript", "filename": filename, "path": str(file_path), "size": size}


def main():
    parser = argparse.ArgumentParser(description="Faster-Whisper 转录")
    parser.add_argument("files", nargs="+", help="音频文件路径")
    parser.add_argument("--model", default="base", choices=["tiny", "base", "small", "medium", "large-v3"])
    parser.add_argument("--language", help="语言代码 (zh, en)")
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda"])
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--save-transcript", help="保存转录文本到目录")
    parser.add_argument("--file-prefix", help="文件前缀")
    parser.add_argument("--podcast-title", help="播客标题")

    args = parser.parse_args()

    # 验证文件
    audio_files = []
    for f in args.files:
        p = Path(f)
        if not p.exists():
            print(f"❌ 文件不存在: {f}", file=sys.stderr)
            sys.exit(1)
        audio_files.append(str(p.absolute()))

    # 转录
    transcriber = WhisperTranscriber(args.model, args.device, args.compute_type.replace("-", "_"))
    result = transcriber.transcribe(audio_files[0], args.language)

    # 保存
    saved = []
    if args.save_transcript and result.get('success') and result.get('text'):
        info = save_transcript(result['text'], args.save_transcript, args.file_prefix, args.podcast_title)
        if info:
            saved.append(info)

    result['savedFiles'] = saved
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
