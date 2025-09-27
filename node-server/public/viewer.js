const socket = io();
const params = new URLSearchParams(location.search);
const roomId = params.get("room") || "room1";
document.getElementById("roomLabel").textContent = `Room: ${roomId}`;

const videoEl = document.getElementById("remote");
let pc;

async function ensurePeer() {
  if (pc) return pc;
  pc = new RTCPeerConnection();
  pc.onicecandidate = (ev) => {
    if (ev.candidate) socket.emit("webrtc-ice", { roomId, candidate: ev.candidate });
  };
  pc.ontrack = (ev) => {
    videoEl.srcObject = ev.streams[0];
  };
  pc.onconnectionstatechange = () => {
    console.log("pc state:", pc.connectionState);
  };
  return pc;
}

socket.emit("join-room", roomId);

// Receive offer from broadcaster
socket.on("webrtc-offer", async ({ sdp }) => {
  const pc = await ensurePeer();
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit("webrtc-answer", { roomId, sdp: answer });
});

socket.on("webrtc-ice", async ({ candidate }) => {
  if (!pc) return;
  try { await pc.addIceCandidate(candidate); } catch (e) { console.error(e); }
});
