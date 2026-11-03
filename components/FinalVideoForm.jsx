"use client";

import { useState } from "react";
import { Send } from "lucide-react";

export default function FinalVideoForm({ task, onSubmit }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(task, link.trim());
    } catch (err) {
      setError(err.message || "Could not send the final link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="script-form" onSubmit={send}>
      <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#475467", lineHeight: "1.5" }}>
        Brand approved your video. Upload the highest-quality version to Google Drive and paste its link below to deliver it to the Performance Team.
      </p>
      <label>
        <span>High-quality Google Drive video link</span>
        <input
          type="url"
          required
          value={link}
          disabled={busy}
          onChange={(event) => setLink(event.target.value)}
          placeholder="https://drive.google.com/file/d/..."
        />
      </label>
      {error && <p style={{ color: "#dc2626", fontSize: "12px", margin: "4px 0" }} role="alert">{error}</p>}
      <div className="script-actions" style={{ marginTop: "10px" }}>
        <button className="button primary" type="submit" disabled={busy}>
          <Send size={15} />
          {busy ? "Sending…" : "Send to Performance Team"}
        </button>
      </div>
    </form>
  );
}

