# Browser-to-Browser Streaming with Node (signaling) + FastAPI (CV)

The **Broadcaster** sends a processed (canvas) stream via **WebRTC** to a **Viewer** in another browser window/tab.

## Structure
- `node-server/` – Express + Socket.IO for static hosting, FastAPI proxying (for frames), and **WebRTC signaling**.
- `python-api/` – FastAPI + OpenCV (Canny edges) and returns a JPEG overlay.

## Run FastAPI
```bash
cd python-api
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate
pip install -r requirements.txt
python main.py
# http://127.0.0.1:8000
```

## Run Node
```bash
cd ../node-server
npm install
npm start
# http://localhost:3000
```

## Use (two tabs/windows)
1. Open `http://localhost:3000`.
2. Choose a **Room ID** (e.g., `room1`).
3. Open **Broadcaster** → click **Start Broadcast** (grabs camera, pushes frames to FastAPI, draws overlay on a canvas).
4. Open **Viewer** (same room). When the viewer joins, the broadcaster creates a WebRTC peer connection and streams the **processed canvas** (`captureStream`) to the viewer.

### Notes
- This demo uses 1:1 signaling; for multiple viewers, you would create one `RTCPeerConnection` per viewer or add an SFU.
- To reduce bandwidth, increase the interval or lower JPEG quality (Broadcaster controls both).
- If FastAPI is on another host, set the Node env var before starting:
  ```bash
  export FASTAPI_URL="http://<host>:8000/analyze"
  npm start
  ```
