import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import axios from "axios";
import FormData from "form-data";

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const FASTAPI_URL = process.env.FASTAPI_URL || "http://127.0.0.1:8000/analyze";

app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true }));

io.on("connection", (socket) => {
  console.log("client connected:", socket.id);

  // ------- Frame analysis (FastAPI) -------
  socket.on("frame", async (buf) => {
    try {
      const form = new FormData();
      form.append("file", Buffer.from(buf), {
        filename: "frame.jpg",
        contentType: "image/jpeg"
      });
      const resp = await axios.post(FASTAPI_URL, form, {
        headers: form.getHeaders(),
        timeout: 5000
      });
      socket.emit("analysis", resp.data);
    } catch (err) {
      console.error("analysis error:", err.message);
      socket.emit("analysis_error", { message: err.message });
    }
  });

  // ------- Simple WebRTC Signaling -------
  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    // Let others know someone joined
    socket.to(roomId).emit("peer-joined", socket.id);
  });

  socket.on("webrtc-offer", ({ roomId, sdp }) => {
    socket.to(roomId).emit("webrtc-offer", { from: socket.id, sdp });
  });

  socket.on("webrtc-answer", ({ roomId, sdp }) => {
    socket.to(roomId).emit("webrtc-answer", { from: socket.id, sdp });
  });

  socket.on("webrtc-ice", ({ roomId, candidate }) => {
    socket.to(roomId).emit("webrtc-ice", { from: socket.id, candidate });
  });

  socket.on("disconnect", () => {
    console.log("client disconnected:", socket.id);
    // Inform peers in all rooms
    for (const roomId of socket.rooms) {
      if (roomId !== socket.id) socket.to(roomId).emit("peer-left", socket.id);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Node server on http://localhost:${PORT}`);
});
