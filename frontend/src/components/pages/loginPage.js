import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import getUserInfo from "../../utilities/decodeJwt";

const url = `${process.env.REACT_APP_BACKEND_SERVER_URI}/user/login`;

const Login = () => {
  const [user, setUser] = useState(null);
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleChange = ({ currentTarget: input }) => {
    setCredentials({ ...credentials, [input.name]: input.value });
  };

  useEffect(() => {
    setUser(getUserInfo());
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: res } = await axios.post(url, credentials);
      localStorage.setItem("accessToken", res.accessToken);
      navigate("/home");
    } catch (error) {
      if (error.response && error.response.status >= 400 && error.response.status <= 500) {
        setError(error.response.data.message);
      }
    }
  };

  if (user) {
    navigate("/home");
    return null;
  }

  return (
    <div className="min-h-screen bg-spotify-black flex items-center justify-center px-4">
      <div className="bg-spotify-card rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">Log in to Skeleton</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-spotify-muted mb-1">Username</label>
            <input
              type="text"
              name="username"
              placeholder="Enter username"
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-md bg-spotify-hover border border-spotify-hover text-white placeholder-spotify-muted focus:outline-none focus:border-white"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-spotify-muted mb-1">Password</label>
            <input
              type="password"
              name="password"
              placeholder="Password"
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-md bg-spotify-hover border border-spotify-hover text-white placeholder-spotify-muted focus:outline-none focus:border-white"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full py-3 rounded-full bg-spotify-green hover:bg-spotify-green-hover text-black font-bold transition-colors shadow-sm mt-2"
          >
            Log In
          </button>
        </form>

        <p className="text-center text-sm text-spotify-muted mt-6">
          Don't have an account?{" "}
          <Link to="/signup" className="font-semibold text-white hover:text-spotify-green transition-colors">Sign up</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
