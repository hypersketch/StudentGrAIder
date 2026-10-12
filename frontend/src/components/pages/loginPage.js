import React, { useState, useCallback } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import axios from "axios";
import getUserInfo from "../../utilities/decodeJwt";
import Overlay, { overlayInput, overlayLabel, overlaySubmit } from "../overlay";

const url = `${process.env.REACT_APP_BACKEND_SERVER_URI}/user/login`;

// Shown as an overlay on top of the home page (see the /login route in App.js)
const Login = () => {
  const [user] = useState(() => getUserInfo());
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const close = useCallback(() => navigate("/"), [navigate]);

  const handleChange = ({ currentTarget: input }) => {
    setCredentials({ ...credentials, [input.name]: input.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: res } = await axios.post(url, credentials);
      localStorage.setItem("accessToken", res.accessToken);
      // Full reload so every component re-reads the new token
      window.location.assign("/");
    } catch (error) {
      if (error.response && error.response.status >= 400 && error.response.status <= 500) {
        setError(error.response.data.message);
      }
    }
  };

  if (user) return <Navigate to="/" replace />;

  return (
    <Overlay title="Log in" onClose={close}>
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        <div>
          <label className={overlayLabel}>Email</label>
          <input type="email" name="email" placeholder="Enter email" autoFocus onChange={handleChange} className={overlayInput} />
        </div>

        <div>
          <label className={overlayLabel}>Password</label>
          <input type="password" name="password" placeholder="Password" onChange={handleChange} className={overlayInput} />
        </div>

        {error && <p className="text-red-600 text-sm m-0">{error}</p>}

        <button type="submit" className={overlaySubmit}>Log In</button>

        <p className="text-center text-sm text-grader-muted m-0">
          Don't have an account?{" "}
          <Link to="/signup" replace className="font-bold text-grader-navy">Sign up</Link>
        </p>
      </form>
    </Overlay>
  );
};

export default Login;
