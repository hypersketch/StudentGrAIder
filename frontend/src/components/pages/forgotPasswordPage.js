import React, { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { errorMessage } from "../../utilities/api";
import Overlay, { overlayInput, overlayLabel, overlaySubmit } from "../overlay";

const url = `${process.env.REACT_APP_BACKEND_SERVER_URI}/user/forgot-password`;

// Shown as an overlay on top of the home page (see the /forgot-password route in App.js).
// Asks for the account's email and has the backend send a reset link to it.
const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const close = useCallback(() => navigate("/"), [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await axios.post(url, { email });
      setSent(data);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  return (
    <Overlay title="Reset your password" onClose={close}>
      {sent ? (
        <div className="space-y-4 p-5">
          <p className="text-grader-text m-0">{sent.message}</p>
          <p className="text-sm text-grader-muted m-0">The link works for 1 hour. Check your spam folder if you don't see it.</p>
          {/* Only while the backend uses the Ethereal test inbox instead of real email */}
          {sent.previewUrl && (
            <p className="text-sm m-0">
              Test inbox:{" "}
              <a href={sent.previewUrl} target="_blank" rel="noreferrer" className="font-bold text-grader-navy">
                open the email
              </a>
            </p>
          )}
          <Link to="/login" replace className={`${overlaySubmit} block text-center no-underline hover:text-white`}>
            Back to log in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <p className="text-sm text-grader-muted m-0">
            Enter the email you signed up with and we'll send you a link to choose a new password.
          </p>
          <div>
            <label className={overlayLabel}>Email</label>
            <input
              type="email"
              placeholder="Enter email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={overlayInput}
            />
          </div>

          {error && <p className="text-red-600 text-sm m-0">{error}</p>}

          <button type="submit" disabled={busy} className={`${overlaySubmit} disabled:opacity-60`}>
            {busy ? "Sending…" : "Send reset link"}
          </button>

          <p className="text-center text-sm text-grader-muted m-0">
            Remembered it?{" "}
            <Link to="/login" replace className="font-bold text-grader-navy">Log in</Link>
          </p>
        </form>
      )}
    </Overlay>
  );
};

export default ForgotPassword;
