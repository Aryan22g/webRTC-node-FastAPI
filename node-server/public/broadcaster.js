const socket = io();
const params = new URLSearchParams(location.search);
const roomId = params.get("room") || "room1";

document.getElementById("roomLabel").textContent = `Room: ${roomId}`;

const video = document.getElementById("video");
const displayCanvas = document.getElementById("displayCanvas");
const meta = document.getElementById("meta");
const errBox = document.getElementById("error");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const intervalInput = document.getElementById("interval");
const qualityInput = document.getElementById("quality");

let localStream;
let canvasStream;
let ctx;
let timer = null;
let pc;

async function initCamera() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  video.srcObject = localStream;
  await new Promise((res) => (video.onloadedmetadata = res));
  displayCanvas.width = video.videoWidth;
  displayCanvas.height = video.videoHeight;
  ctx = displayCanvas.getContext("2d", { willReadFrequently: true });
}

function startFramePush() {
  const interval = Math.max(50, Number(intervalInput.value) || 300);
  const jpegQuality = Math.min(1, Math.max(0, Number(qualityInput.value) || 0.6));

  timer = setInterval(async () => {
    try {
      // draw current frame
      ctx.drawImage(video, 0, 0, displayCanvas.width, displayCanvas.height);
      // export frame as jpeg
      const blob = await new Promise((resolve) => displayCanvas.toBlob(resolve, "image/jpeg", jpegQuality));
      const buf = await blob.arrayBuffer();
      // ask server (FastAPI) for overlay
      socket.emit("frame", buf);
    } catch (e) {
      errBox.textContent = e.message;
    }
  }, interval);
}

function stopFramePush() {
  clearInterval(timer);
  timer = null;
}

socket.on("analysis", (data) => {
  // draw returned overlay into displayCanvas
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, displayCanvas.width, displayCanvas.height);
    meta.textContent = `Processed: ${data.width}×${data.height} | Edge pixels: ${data.edge_pixels.toLocaleString()}`;
  };
  img.src = `data:image/jpeg;base64,${data.processed}`;
});

socket.on("analysis_error", (e) => {
  errBox.textContent = e?.message || "Analysis error";
});

// ---- WebRTC (send processed canvas stream) ----
async function createPeer() {
  pc = new RTCPeerConnection();
  pc.onicecandidate = (ev) => {
    if (ev.candidate) socket.emit("webrtc-ice", { roomId, candidate: ev.candidate });
  };

  // capture the processed canvas as a MediaStream
  canvasStream = displayCanvas.captureStream(25);
  const [track] = canvasStream.getVideoTracks();
  pc.addTrack(track, canvasStream);

  // on connection state changes (debug)
  pc.onconnectionstatechange = () => {
    console.log("pc state:", pc.connectionState);
  };

  // create and send offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("webrtc-offer", { roomId, sdp: offer });
}

socket.on("webrtc-answer", async ({ sdp }) => {
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
});

socket.on("webrtc-ice", async ({ candidate }) => {
  if (!pc) return;
  try { await pc.addIceCandidate(candidate); } catch (e) { console.error(e); }
});

// Join room and wait for viewer to connect
socket.emit("join-room", roomId);
socket.on("peer-joined", async () => {
  // when a viewer joins, start WebRTC
  if (!pc) await createPeer();
});

// UI
startBtn.addEventListener("click", async () => {
  await initCamera();
  startFramePush();
  startBtn.disabled = true;
  stopBtn.disabled = false;
});

stopBtn.addEventListener("click", () => {
  stopFramePush();
  if (pc) pc.close();
  pc = null;
  startBtn.disabled = false;
  stopBtn.disabled = true;
});
