import { useState } from "react";
import { Download, Film, Image as ImageIcon, LoaderCircle } from "lucide-react";
import { Dialog } from "./Dialog";
import { preferredVideoFormat } from "../services/share";

export function ShareExport({
  onClose,
  hasVideo,
  videoDuration,
  exportImage,
  exportVideo,
  standalone = false,
}: {
  onClose: () => void;
  hasVideo: boolean;
  videoDuration: number | null;
  exportImage: () => Promise<void>;
  exportVideo: () => Promise<void>;
  standalone?: boolean;
}) {
  const [busy, setBusy] = useState<"image" | "video" | null>(null);
  const [error, setError] = useState("");
  const run = async (kind: "image" | "video") => {
    if (busy) return;
    setError("");
    setBusy(kind);
    try {
      await (kind === "image" ? exportImage() : exportVideo());
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not export this share card.",
      );
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog title="Share your session" onClose={onClose} wide standalone={standalone}>
      <div className="dialog-body share-body">
        <div className="share-preview" aria-hidden="true">
          <img src="/sesh-logo.png" alt="" />
          <span>SESH</span>
          <strong>YOUR FOCUS, FRAMED.</strong>
        </div>
        <p className="share-intro">
          Export a clean card with your current background and session stats.
          Timer controls and window actions are always left out.
        </p>
        <div className="share-options">
          <button className="share-option" disabled={!!busy} onClick={() => void run("image")}>
            <span className="share-option-icon"><ImageIcon /></span>
            <span><strong>Still card</strong><small>High-resolution PNG · current frame</small></span>
            {busy === "image" ? <LoaderCircle className="share-spinner" /> : <Download />}
          </button>
          {hasVideo && (
            <button className="share-option" disabled={!!busy} onClick={() => void run("video")}>
              <span className="share-option-icon"><Film /></span>
              <span>
                <strong>Full loop card</strong>
                <small>
                  {videoDuration
                    ? `${Math.floor(videoDuration / 60)}:${Math.floor(videoDuration % 60)
                        .toString()
                        .padStart(2, "0")} ${preferredVideoFormat()?.extension.toUpperCase() ?? "video"} · source duration`
                    : `${preferredVideoFormat()?.extension.toUpperCase() ?? "Video"} · exact source duration`}
                </small>
              </span>
              {busy === "video" ? <LoaderCircle className="share-spinner" /> : <Download />}
            </button>
          )}
        </div>
        <p className="hint share-note">1260 × 855 · saved directly to your device</p>
        {error && <p className="share-error" role="alert">{error}</p>}
      </div>
      <footer className="dialog-foot">
        <small>{busy ? "Rendering your card…" : "Private by default. Nothing is uploaded."}</small>
        <button onClick={onClose} disabled={!!busy}>Done</button>
      </footer>
    </Dialog>
  );
}
