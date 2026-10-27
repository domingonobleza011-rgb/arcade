"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "../lib/socket";

const ICE_SERVERS = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

export default function MediaControls({ room, me }) {
  const socket = getSocket();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const peersRef = useRef(new Map());
  const sendersRef = useRef(new Map());
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [error, setError] = useState("");
  const players = room?.players || [];
  const playerIds = players.map((p) => p.id).filter((id) => id && id !== me);

  const sendSignal = useCallback((to, signal) => {
    socket.emit("media:signal", { to, signal });
  }, [socket]);

  const createPeer = useCallback((peerId) => {
    let pc = peersRef.current.get(peerId);
    if (pc) return pc;
    pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current.set(peerId, pc);
    sendersRef.current.set(peerId, new Map());
    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal(peerId, { type: "candidate", candidate: event.candidate });
    };
    pc.ontrack = (event) => {
      const stream = event.streams?.[0];
      if (stream) setRemoteStreams((old) => ({ ...old, [peerId]: stream }));
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        if (pc.connectionState !== "disconnected") {
          pc.close();
          peersRef.current.delete(peerId);
          sendersRef.current.delete(peerId);
          setRemoteStreams((old) => { const copy = { ...old }; delete copy[peerId]; return copy; });
        }
      }
    };
    return pc;
  }, [sendSignal]);

  const negotiate = useCallback(async (peerId) => {
    // Only a player with local media should initiate. The receiver handles rare offer glare below.
    if (!streamRef.current?.getTracks().length) return;
    const pc = createPeer(peerId);
    if (pc.signalingState !== "stable") return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(peerId, { type: "description", description: pc.localDescription });
    } catch (e) {
      console.warn("Could not negotiate media connection", e);
    }
  }, [createPeer, me, sendSignal]);

  const syncTracks = useCallback(async () => {
    const stream = streamRef.current;
    for (const peerId of playerIds) {
      const pc = createPeer(peerId);
      const senders = sendersRef.current.get(peerId);
      for (const kind of ["audio", "video"]) {
        const track = stream?.getTracks().find((t) => t.kind === kind) || null;
        const sender = senders.get(kind);
        if (sender) {
          if (sender.track !== track) await sender.replaceTrack(track).catch(() => {});
        } else if (track) {
          senders.set(kind, pc.addTrack(track, stream));
        }
      }
      await negotiate(peerId);
    }
  }, [createPeer, negotiate, playerIds.join("|")]);

  useEffect(() => {
    const onSignal = async ({ from, signal } = {}) => {
      if (!from || !signal || !playerIds.includes(from)) return;
      const pc = createPeer(from);
      try {
        if (signal.type === "description" && signal.description) {
          if (signal.description.type === "offer" && pc.signalingState !== "stable") {
            // Deterministically let the higher socket ID yield if both players offer at once.
            if (String(me).localeCompare(String(from)) > 0) {
              await pc.setLocalDescription({ type: "rollback" });
            } else {
              return;
            }
          }
          await pc.setRemoteDescription(signal.description);
          if (signal.description.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal(from, { type: "description", description: pc.localDescription });
          }
        } else if (signal.type === "candidate" && signal.candidate) {
          await pc.addIceCandidate(signal.candidate);
        }
      } catch (e) {
        console.warn("WebRTC signaling error", e);
      }
    };
    socket.on("media:signal", onSignal);
    return () => socket.off("media:signal", onSignal);
  }, [socket, playerIds.join("|"), createPeer, sendSignal]);

  useEffect(() => {
    // Make connections when the room roster changes, including when a player joins late.
    playerIds.forEach((id) => createPeer(id));
    for (const [id, pc] of peersRef.current.entries()) {
      if (!playerIds.includes(id)) {
        pc.close();
        peersRef.current.delete(id);
        sendersRef.current.delete(id);
        setRemoteStreams((old) => { const copy = { ...old }; delete copy[id]; return copy; });
      }
    }
    if (streamRef.current?.getTracks().length) syncTracks();
  }, [playerIds.join("|"), createPeer, syncTracks]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = streamRef.current;
  }, [cameraOn, micOn]);

  useEffect(() => () => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function toggleMedia(kind) {
    setError("");
    const enabled = kind === "camera" ? cameraOn : micOn;
    const trackKind = kind === "camera" ? "video" : "audio";
    if (enabled) {
      streamRef.current?.getTracks().filter((track) => track.kind === trackKind).forEach((track) => {
        track.stop();
        streamRef.current.removeTrack(track);
      });
      if (kind === "camera") setCameraOn(false); else setMicOn(false);
      if (!streamRef.current?.getTracks().length) streamRef.current = null;
      await syncTracks();
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera and microphone require HTTPS or localhost in a supported browser.");
        return;
      }
      const newStream = await navigator.mediaDevices.getUserMedia({ video: kind === "camera", audio: kind === "mic" });
      if (!streamRef.current) streamRef.current = new MediaStream();
      newStream.getTracks().forEach((track) => streamRef.current.addTrack(track));
      if (kind === "camera") setCameraOn(true); else setMicOn(true);
      if (videoRef.current) videoRef.current.srcObject = streamRef.current;
      await syncTracks();
    } catch (e) {
      setError(e?.name === "NotAllowedError"
        ? "Permission denied. Allow camera/microphone access in your browser."
        : "Could not access that device. Check that it is connected and not in use.");
    }
  }

  return (
    <section className="media-panel" aria-label="Optional camera and microphone">
      <div className="media-heading">
        <div><strong>Camera &amp; microphone</strong><p>Optional live video and audio with players in this room</p></div>
        <div className="media-actions">
          <button type="button" aria-pressed={cameraOn} className={cameraOn ? "media-active" : ""} onClick={() => toggleMedia("camera")}>{cameraOn ? "📷 Camera on" : "📷 Turn camera on"}</button>
          <button type="button" aria-pressed={micOn} className={micOn ? "media-active" : ""} onClick={() => toggleMedia("mic")}>{micOn ? "🎙️ Mic on" : "🎙️ Turn mic on"}</button>
        </div>
      </div>
      <div className="media-videos">
        {cameraOn && <video ref={videoRef} className="media-preview" autoPlay muted playsInline aria-label="Your camera preview" />}
        {players.filter((p) => p.id !== me).map((p) => {
          const stream = remoteStreams[p.id];
          return <div className="remote-media" key={p.id}>
            {stream ? <video className="media-preview" autoPlay playsInline ref={(el) => { if (el && el.srcObject !== stream) el.srcObject = stream; }} aria-label={`${p.name}'s camera`} /> : <div className="media-placeholder">{p.name}<small>Camera not shared</small></div>}
            <span className="remote-name">{p.name}</span>
          </div>;
        })}
      </div>
      {error && <p className="media-error" role="alert">{error}</p>}
      <p className="media-note">Camera and microphone are optional. Allow access in your browser. Live peer-to-peer media requires HTTPS and may need TURN configuration on restrictive networks.</p>
    </section>
  );
}
