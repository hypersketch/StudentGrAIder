import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import { errorMessage } from "../../utilities/api";
import Overlay, { overlaySubmit } from "../overlay";

const url = `${process.env.REACT_APP_BACKEND_SERVER_URI}/user/verify-email`;

// Opened from the link emailed at signup (/verify-email?token=...), as an overlay on top of the home page.
// Verifies the email and logs the person straight in.
const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [error, setError] = useState("");
  const navigate = useNavigate();
  // The link works once, so make sure it's only sent once
  const sent = useRef(false);

  const close = useCallback(() => navigate("/"), [navigate]);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    axios.post(url, { token })
      .then(({ data }) => {
        localStorage.setItem("accessToken", data.accessToken);
        // Full reload so every component reads the new token
        window.location.assign("/");
      })
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  return (
    <Overlay title="Verify your email" onClose={close}>
      <div className="space-y-4 p-5">
        {!token ? (
          <p className="text-grader-text m-0">This verification link is incomplete. Open the link from the email again.</p>
        ) : error ? (
          <>
            <p className="text-red-600 m-0">{error}</p>
            <p className="text-sm text-grader-muted m-0">
              Try logging in. If your email still isn't verified, you can ask for a new link there. If the link is more than a day old,
              sign up again.
            </p>
          </>
        ) : (
          <p className="text-grader-text m-0">Verifying your email...</p>
        )}
        {(!token || error) && (
          <Link to="/login" replace className={`${overlaySubmit} block text-center no-underline hover:text-white`}>
            Go to log in
          </Link>
        )}
      </div>
    </Overlay>
  );
};

export default VerifyEmail;
