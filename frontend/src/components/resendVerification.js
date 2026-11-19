import React, { useState } from "react";
import axios from "axios";
import { errorMessage } from "../utilities/api";

const url = `${process.env.REACT_APP_BACKEND_SERVER_URI}/user/resend-verification`;

// "Send the link again" for someone who signed up but hasn't verified their email yet
export default function ResendVerification({ email }) {
  const [status, setStatus] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);
  const [busy, setBusy] = useState(false);

  const resend = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(url, { email });
      setStatus("Sent. Check your inbox and spam folder.");
      setPreviewUrl(data.previewUrl || null);
    } catch (err) {
      setStatus(errorMessage(err));
    }
    setBusy(false);
  };

  return (
    <p className="text-sm text-grader-muted m-0">
      Didn't get it?{" "}
      <button type="button" onClick={resend} disabled={busy} className="font-bold text-grader-navy hover:underline disabled:opacity-60">
        {busy ? "Sending..." : "Send the link again"}
      </button>
      {status && <span className="block mt-1">{status}</span>}
      {/* Only while the backend uses the Ethereal test inbox instead of real email */}
      {previewUrl && (
        <a href={previewUrl} target="_blank" rel="noreferrer" className="block mt-1 font-bold text-grader-navy">
          Test inbox: open the email
        </a>
      )}
    </p>
  );
}
