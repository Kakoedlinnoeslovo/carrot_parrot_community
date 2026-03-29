#!/usr/bin/env python3
"""Optional: OpenCV Farneback optical-flow magnitude peaks -> segment boundaries. Requires: pip install opencv-python-headless numpy"""
import json
import sys

try:
    import cv2
    import numpy as np
except ImportError:
    print("[]", file=sys.stderr)
    sys.exit(1)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else ""
    if not path:
        print(json.dumps({"segments": []}))
        sys.exit(1)
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        print(json.dumps({"segments": []}))
        sys.exit(1)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    nframes = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = nframes / fps if fps > 0 else 0
    ret, prev = cap.read()
    if not ret:
        cap.release()
        print(json.dumps({"segments": [{"start": 0, "end": duration}]}))
        return
    prev_gray = cv2.cvtColor(prev, cv2.COLOR_BGR2GRAY)
    prev_gray = cv2.resize(prev_gray, (320, int(prev_gray.shape[0] * 320 / prev_gray.shape[1])))
    magnitudes = []
    idx = 0
    step = max(1, int(fps / 3))
    while True:
        for _ in range(step - 1):
            cap.grab()
        ret, frame = cap.read()
        if not ret:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(gray, (prev_gray.shape[1], prev_gray.shape[0]))
        flow = cv2.calcOpticalFlowFarneback(
            prev_gray, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0
        )
        mag = np.sqrt(flow[..., 0] ** 2 + flow[..., 1] ** 2).mean()
        magnitudes.append((idx / fps, float(mag)))
        prev_gray = gray
        idx += step
    cap.release()
    if len(magnitudes) < 2:
        print(json.dumps({"segments": [{"start": 0, "end": duration}]}))
        return
    mvals = [m for _, m in magnitudes]
    med = float(np.median(mvals))
    thresh = med * 1.8
    cuts = [0.0]
    for t, m in magnitudes:
        if m > thresh:
            if not cuts or abs(t - cuts[-1]) > 0.4:
                cuts.append(t)
    cuts.append(duration)
    cuts = sorted(set(cuts))
    segments = [{"start": cuts[i], "end": cuts[i + 1]} for i in range(len(cuts) - 1) if cuts[i + 1] - cuts[i] > 0.1]
    if not segments:
        segments = [{"start": 0, "end": duration}]
    print(json.dumps({"segments": segments}))


if __name__ == "__main__":
    main()
