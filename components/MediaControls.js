"use client";
import { useEffect, useRef, useState } from "react";

export default function MediaControls() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [cameraOn, micOn]);

  async function toggleMedia(kind) {
    setError("");
    const enabled = kind === "camera" ? cameraOn : micOn;
    if (enabled) {
      const trackKind = kind === "camera" ? "video" : "audio";
      streamRef.current?.getTracks().filter((t) => t.kind === trackKind).forEach((t) => {
        t.stop();
        streamRef.current.removeTrack(t);
      });
      if (kind === "camera") setCameraOn(false); else setMicOn(false);
      if (!streamRef.current?.getTracks().length) streamRef.current = null;
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera and microphone require HTTPS or localhost in a supported browser.");
        return;
      }
      const constraints = kind === "camera" ? { video: true, audio: false } : { video: false, audio: true };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!streamRef.current) streamRef.current = new MediaStream();
      newStream.getTracks().forEach((track) => streamRef.current.addTrack(track));
      if (kind === "camera") setCameraOn(true); else setMicOn(true);
      if (videoRef.current) videoRef.current.srcObject = streamRef.current;
    } catch (e) {
      setError(e?.name === "NotAllowedError"
        ? "Permission denied. Allow camera/microphone access in your browser."
        : "Could not access that device. Check that it is connected and not in use.");
    }
  }

  return (
    <section className="media-panel" aria-label="Optional camera and microphone">
      <div className="media-heading">
        <div><strong>Camera &amp; microphone</strong><p>Optional device controls for any game</p></div>
        <div className="media-actions">
          <button type="button" aria-pressed={cameraOn} className={cameraOn ? "media-active" : ""} onClick={() => toggleMedia("camera")}>
            {cameraOn ? "📷 Camera on" : "📷 Turn camera on"}
          </button>
          <button type="button" aria-pressed={micOn} className={micOn ? "media-active" : ""} onClick={() => toggleMedia("mic")}>
            {micOn ? "🎙️ Mic on" : "🎙️ Turn mic on"}
          </button>
        </div>
      </div>
      {cameraOn && <video ref={videoRef} className="media-preview" autoPlay muted playsInline aria-label="Your camera preview" />}
      {!cameraOn && <video ref={videoRef} className="media-preview media-hidden" autoPlay muted playsInline />}
      {error && <p className="media-error" role="alert">{error}</p>}
      <p className="media-note">Camera preview is shown only to you. Microphone is enabled on this device but is not broadcast to other players in this version.</p>
    </section>
  );
}
