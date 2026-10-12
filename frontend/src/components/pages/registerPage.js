import React, { useState, useCallback } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import axios from "axios";
import getUserInfo from "../../utilities/decodeJwt";
import Overlay, { overlayInput, overlayLabel, overlaySubmit } from "../overlay";

const url = `${process.env.REACT_APP_BACKEND_SERVER_URI}/user/signup`;
const loginUrl = `${process.env.REACT_APP_BACKEND_SERVER_URI}/user/login`;

const roles = [
  { value: "professor", label: "Professor", description: "Create and curate questions to be answered by your students" },
  { value: "student", label: "Student", description: "Sign up for your professor's class and take various quizzes" },
];

// Shown as an overlay on top of the home page (see the /signup route in App.js)
const Register = () => {
  const [user] = useState(() => getUserInfo());
  const [formData, setFormData] = useState({ name: "", email: "", password: "", role: "" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const close = useCallback(() => navigate("/"), [navigate]);

  const handleChange = ({ currentTarget: input }) => {
    setFormData({ ...formData, [input.name]: input.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(url, formData);
      // Log the new user straight in, then reload so every component reads the new token
      const { data: res } = await axios.post(loginUrl, { email: formData.email, password: formData.password });
      localStorage.setItem("accessToken", res.accessToken);
      window.location.assign("/");
    } catch (error) {
      if (error.response && error.response.status >= 400 && error.response.status <= 500) {
        setError(error.response.data.message);
      }
    }
  };

  if (user) return <Navigate to="/" replace />;

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
