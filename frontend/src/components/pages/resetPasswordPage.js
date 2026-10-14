import React, { useState, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import { errorMessage } from "../../utilities/api";
import Overlay, { overlayInput, overlayLabel, overlaySubmit } from "../overlay";

const url = `${process.env.REACT_APP_BACKEND_SERVER_URI}/user/reset-password`;

// Opened from the emailed link (/reset-password?token=...), as an overlay on top of the home page.
// The student picks a new password; the link stops working once it's used.
const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const close = useCallback(() => navigate("/"), [navigate]);

  const handleChange = ({ currentTarget: input }) => setForm({ ...form, [input.name]: input.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError("");
    try {
      await axios.post(url, { token, password: form.password });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  return (
    <Overlay title="Choose a new password" onClose={close}>
      {done ? (
        <div className="space-y-4 p-5">
          <p className="text-grader-text m-0">Your password has been reset.</p>
          <Link to="/login" replace className={`${overlaySubmit} block text-center no-underline hover:text-white`}>
            Log in
          </Link>
        </div>
      ) : !token ? (
        <div className="space-y-4 p-5">
          <p className="text-grader-text m-0">This reset link is incomplete. Open the link from the email again, or ask for a new one.</p>
          <Link to="/forgot-password" replace className={`${overlaySubmit} block text-center no-underline hover:text-white`}>
            Send a new link
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <label className={overlayLabel}>New password</label>
            <input type="password" name="password" placeholder="8 or more characters" autoFocus onChange={handleChange} className={overlayInput} />
          </div>
          <div>
            <label className={overlayLabel}>Confirm new password</label>
            <input type="password" name="confirm" placeholder="Type it again" onChange={handleChange} className={overlayInput} />
          </div>

          {error && (
            <p className="text-red-600 text-sm m-0">
              {error}
              {/expired|invalid/i.test(error) && (
                <>
                  {" "}
                  <Link to="/forgot-password" replace className="font-bold text-grader-navy">Send a new link</Link>
                </>
              )}
            </p>
          )}

          <button type="submit" disabled={busy} className={`${overlaySubmit} disabled:opacity-60`}>
            {busy ? "Saving…" : "Reset password"}
          </button>
        </form>
      )}
    </Overlay>
  );
};

export default ResetPassword;
