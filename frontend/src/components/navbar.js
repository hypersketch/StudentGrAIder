import React from "react";

export default function Navbar() {
  return (
    <nav className="bg-spotify-dark border-b border-spotify-hover">
      <div className="max-w-2xl mx-auto px-6 py-3 flex gap-6">
        <a href="/" className="text-white hover:text-spotify-green font-medium transition-colors">Start</a>
        <a href="/home" className="text-white hover:text-spotify-green font-medium transition-colors">Home</a>
        <a href="/privateUserProfile" className="text-white hover:text-spotify-green font-medium transition-colors">Profile</a>
      </div>
    </nav>
  );
}
