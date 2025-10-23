# server_fastapi_debug.py
import asyncio
import traceback
import sys
import cv2
import numpy as np

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack, RTCConfiguration, RTCIceServer
from av import VideoFrame

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React dev server
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

# Serve static at /static and root serves index.html
app.mount("/static", StaticFiles(directory="static"), name="static")
@app.get("/")
async def index():
    return FileResponse("static/index.html")

pcs = set()

class CameraVideoTrack(VideoStreamTrack):
    def __init__(self, source=0, width=640, height=480, fps=20):
        super().__init__()
        self.source = source
        self._width = width
        self._height = height
        self.cap = cv2.VideoCapture(source)
        # optionally check open success
        if not self.cap.isOpened():
            print(f"[CameraVideoTrack] WARNING: cv2.VideoCapture({source}) failed to open", file=sys.stderr)
        else:
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
            self.cap.set(cv2.CAP_PROP_FPS, fps)

    async def recv(self):
        pts, time_base = await self.next_timestamp()
        ret, frame = self.cap.read()
        if not ret or frame is None:
            # log once that camera frame failed
            # create black frame so av.VideoFrame creation still works
            arr = np.zeros((self._height, self._width, 3), dtype=np.uint8)
        else:
            arr = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        video_frame = VideoFrame.from_ndarray(arr, format="rgb24")
        video_frame.pts = pts
        video_frame.time_base = time_base
        return video_frame
    
    def stop(self):
        super().stop()
        if hasattr(self, "cap") and self.cap.isOpened():
            self.cap.release()

@app.post("/offer")
async def offer(request: Request):
    params = await request.json()
    if "sdp" not in params or "type" not in params:
        return JSONResponse({"error": "missing sdp/type in JSON body"}, status_code=400)

    offer = RTCSessionDescription(sdp=params["sdp"], type=params["type"])

    rtc_config = RTCConfiguration(iceServers=[RTCIceServer(urls=["stun:stun.l.google.com:19302"])])
    pc = RTCPeerConnection(rtc_config)
    pcs.add(pc)
    print("[offer] New PeerConnection:", pc)

    # create camera track and attach via a sendonly transceiver
    camera = CameraVideoTrack(source=0)
    transceiver = pc.addTransceiver("video", direction="sendonly")
    # correct method name:
    transceiver.sender.replaceTrack(camera)

    @pc.on("iceconnectionstatechange")
    async def on_ice_state():
        print("[offer] ICE state:", pc.iceConnectionState)
        if pc.iceConnectionState == "failed":
            await pc.close()
            pcs.discard(pc)

    @pc.on("connectionstatechange")
    async def on_connection_state_change():
        print("Connection state:", pc.connectionState)
        if pc.connectionState in ("failed", "closed", "disconnected"):
            await pc.close()
            pcs.discard(pc)

    # SDP flow
    await pc.setRemoteDescription(offer)
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return JSONResponse({"sdp": pc.localDescription.sdp, "type": pc.localDescription.type})


@app.on_event("shutdown")
async def on_shutdown():
    coros = [pc.close() for pc in pcs]
    await asyncio.gather(*coros)
    pcs.clear()



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080, log_level="info")
