import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import getUserInfo from "../../utilities/decodeJwt";

const PrivateUserProfile = () => {
  const [showModal, setShowModal] = useState(false);
  const [user, setUser] = useState({});
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.clear();
    navigate("/");
  };

  useEffect(() => {
    setUser(getUserInfo());
  }, []);

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-spotify-black">
      <p className="text-spotify-muted text-lg">Log in to view this page.</p>
    </div>
  );

  const initials = user.username
    ? user.username.slice(0, 2).toUpperCase()
    : "?";

  return (
    <div className="min-h-screen bg-spotify-black flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-6">

        {/* Avatar */}
        <div className="mx-auto w-24 h-24 rounded-full bg-spotify-green flex items-center justify-center text-black text-3xl font-bold shadow-lg">
          {initials}
        </div>

        {/* Username + email */}
        <div>
          <h1 className="text-2xl font-bold text-white">{user.username}</h1>
          <p className="text-spotify-muted text-sm mt-1">{user.email}</p>
        </div>

        {/* Info card */}
        <div className="bg-spotify-card rounded-xl p-5 text-left space-y-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-spotify-muted">Username</p>
            <p className="text-white font-medium">{user.username}</p>
          </div>
          <div className="border-t border-spotify-hover pt-3">
            <p className="text-xs uppercase tracking-widest text-spotify-muted">Email</p>
            <p className="text-white font-medium break-all">{user.email}</p>
          </div>
          <div className="border-t border-spotify-hover pt-3">
            <p className="text-xs uppercase tracking-widest text-spotify-muted">User ID</p>
            <p className="text-white font-mono text-sm break-all">{user.id}</p>
          </div>
        </div>

        {/* Log out button */}
        <button
          onClick={() => setShowModal(true)}
          className="w-full py-3 rounded-full bg-spotify-green hover:bg-spotify-green-hover text-black font-bold transition-colors shadow-sm"
        >
          Log Out
        </button>
      </div>

      {/* Confirm modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-spotify-card rounded-2xl p-6 w-full max-w-sm shadow-xl border border-spotify-hover">
            <h2 className="text-white text-lg font-bold mb-2">Log Out</h2>
            <p className="text-spotify-muted mb-6">Are you sure you want to log out?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2 rounded-full border border-spotify-muted text-white hover:border-white transition-colors font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 py-2 rounded-full bg-spotify-green hover:bg-spotify-green-hover text-black font-bold transition-colors"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrivateUserProfile;
