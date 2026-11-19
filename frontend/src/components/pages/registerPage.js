import React, { useState, useCallback } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import axios from "axios";
import getUserInfo from "../../utilities/decodeJwt";
import Overlay, { overlayInput, overlayLabel, overlaySubmit } from "../overlay";
import ResendVerification from "../resendVerification";

const url = `${process.env.REACT_APP_BACKEND_SERVER_URI}/user/signup`;

const roles = [
  { value: "professor", label: "Professor", description: "Create and curate questions to be answered by your students" },
  { value: "student", label: "Student", description: "Sign up for your professor's class and take various quizzes" },
];

// Shown as an overlay on top of the home page (see the /signup route in App.js)
const Register = () => {
  const [user] = useState(() => getUserInfo());
  const [formData, setFormData] = useState({ name: "", email: "", password: "", role: "" });
  const [error, setError] = useState("");
  // After signing up: { email, previewUrl } while they go verify their email
  const [signedUp, setSignedUp] = useState(null);
  const navigate = useNavigate();

  const close = useCallback(() => navigate("/"), [navigate]);

  const handleChange = ({ currentTarget: input }) => {
    setFormData({ ...formData, [input.name]: input.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // The account works once they open the link emailed to them
      const { data } = await axios.post(url, formData);
      setSignedUp({ email: data.email, previewUrl: data.previewUrl });
    } catch (error) {
      if (error.response && error.response.status >= 400 && error.response.status <= 500) {
        setError(error.response.data.message);
      }
    }
  };

  if (user) return <Navigate to="/" replace />;

  if (signedUp) {
    return (
      <Overlay title="Check your email" onClose={close}>
        <div className="space-y-4 p-5">
          <p className="text-grader-text m-0">
            We sent a link to <span className="font-bold">{signedUp.email}</span>. Open it to verify your email and finish
            creating your account.
          </p>
          <p className="text-sm text-grader-muted m-0">The link works for 24 hours. Check your spam folder if you don't see it.</p>
          {/* Only while the backend uses the Ethereal test inbox instead of real email */}
          {signedUp.previewUrl && (
            <p className="text-sm m-0">
              Test inbox:{" "}
              <a href={signedUp.previewUrl} target="_blank" rel="noreferrer" className="font-bold text-grader-navy">open the email</a>
            </p>
          )}
          <ResendVerification email={signedUp.email} />
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay title="Create an account" onClose={close}>
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        <div>
          <label className={overlayLabel}>Name</label>
          <input type="text" name="name" placeholder="Enter your name" autoFocus onChange={handleChange} className={overlayInput} />
        </div>

        <div>
          <label className={overlayLabel}>Email</label>
          <input type="email" name="email" placeholder="Enter email" onChange={handleChange} className={overlayInput} />
        </div>

        <div>
          <label className={overlayLabel}>Password</label>
          <input type="password" name="password" placeholder="Password" onChange={handleChange} className={overlayInput} />
        </div>

        <div>
          <label className={overlayLabel}>Sign up as a</label>
          <div className="space-y-2">
            {roles.map((r) => (
              <label
                key={r.value}
                className={`flex items-start gap-3 cursor-pointer rounded-[3px] border px-3 py-2 ${
                  formData.role === r.value ? "border-grader-navy bg-blue-50" : "border-grader-border"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={r.value}
                  checked={formData.role === r.value}
                  onChange={handleChange}
                  className="mt-1"
                />
                <span>
                  <span className="block text-grader-text font-bold">{r.label}</span>
                  <span className="block text-xs text-grader-muted">{r.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-red-600 text-sm m-0">{error}</p>}

        <button type="submit" className={overlaySubmit}>Register</button>

        <p className="text-center text-sm text-grader-muted m-0">
          Already have an account?{" "}
          <Link to="/login" replace className="font-bold text-grader-navy">Log in</Link>
        </p>
      </form>
    </Overlay>
  );
};

export default Register;
