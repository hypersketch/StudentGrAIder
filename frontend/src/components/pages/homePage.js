import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import getUserInfo from '../../utilities/decodeJwt';

const HomePage = () => {
    const [user, setUser] = useState({});
    const navigate = useNavigate();

    const handleLogout = (e) => {
        e.preventDefault();
        localStorage.removeItem('accessToken');
        return navigate('/');
    };

    useEffect(() => {
        setUser(getUserInfo());
    }, []);

    if (!user) return (
        <div className="min-h-screen flex items-center justify-center bg-spotify-black">
            <p className="text-spotify-muted text-lg">Log in to view this page.</p>
        </div>
    );

    const { id, email, username } = user;

    return (
        <div className="min-h-screen bg-spotify-black flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="bg-spotify-card rounded-2xl shadow-xl p-8 space-y-5">
                    <h1 className="text-2xl font-bold text-white">
                        Welcome back, <span className="text-spotify-green">{username}</span>
                    </h1>

                    <div className="border-t border-spotify-hover pt-5 space-y-4">
                        <div>
                            <p className="text-xs uppercase tracking-widest text-spotify-muted mb-1">Username</p>
                            <p className="text-white font-medium">{username}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-widest text-spotify-muted mb-1">Email</p>
                            <p className="text-white font-medium break-all">{email}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-widest text-spotify-muted mb-1">User ID</p>
                            <p className="text-white font-mono text-sm break-all">{id}</p>
                        </div>
                    </div>

                    <button
                        onClick={handleLogout}
                        className="w-full py-3 rounded-full bg-spotify-green hover:bg-spotify-green-hover text-black font-bold transition-colors shadow-sm"
                    >
                        Log Out
                    </button>
                </div>
            </div>
        </div>
    );
};

export default HomePage;
