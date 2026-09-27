import React from 'react';

const Landingpage = () => {
    return (
        <div className="min-h-screen bg-spotify-black flex items-center justify-center px-4">
            <div className="bg-spotify-card rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
                <h1 className="text-2xl font-bold text-white mb-1">Professor Brockenbrough's User Skeleton App</h1>
                <p className="text-spotify-muted text-sm mb-8">A starting point for an application.</p>
                <div className="flex gap-3 justify-center">
                    <a
                        href="/signup"
                        className="px-6 py-2 rounded-full bg-spotify-green hover:bg-spotify-green-hover text-black font-bold transition-colors shadow-sm"
                    >
                        Sign Up
                    </a>
                    <a
                        href="/login"
                        className="px-6 py-2 rounded-full border border-spotify-muted text-white hover:border-white font-bold transition-colors"
                    >
                        Log In
                    </a>
                </div>
            </div>
        </div>
    );
};

export default Landingpage;
