import React, { useState } from 'react';
import { useLocation } from 'wouter';

export default function Register() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Both fields are required.');
      return;
    }

    try {
      const usersStr = localStorage.getItem('knocklet_users');
      const users = usersStr ? JSON.parse(usersStr) : [];

      if (users.length > 0) {
        setError('Only one account is allowed per device. Please login instead.');
        return;
      }

      const exists = users.some((u: any) => u.username === username);
      if (exists) {
        setError('Username is already taken.');
        return;
      }

      users.push({ username, password });
      localStorage.setItem('knocklet_users', JSON.stringify(users));
      
      // Navigate to login
      setLocation('/login');
    } catch (err) {
      console.error(err);
      setError('An error occurred during registration.');
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex items-center bg-[linear-gradient(135deg,#111827_0%,#B91C1C_50%,#FFD1B3_100%)] overflow-hidden font-sans">
      
      <div className="w-full max-w-6xl mx-auto flex flex-col md:flex-row items-center px-8 md:px-16 py-12">
        
        {/* Left Form Area */}
        <div className="flex-1 w-full max-w-md">
          <form onSubmit={handleRegister} className="flex flex-col gap-6">
            
            <div className="flex flex-col gap-2">
              <label 
                htmlFor="username" 
                className="text-4xl md:text-5xl font-bold italic bg-clip-text text-transparent bg-gradient-to-r from-[#4ade80] to-[#3b82f6] md:from-[#60a5fa] md:to-[#a78bfa] w-fit pr-2"
                style={{ WebkitTextStroke: '1px rgba(255,255,255,0.1)' }}
              >
                Username:
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="bg-white/10 border-b-2 border-white/30 text-white text-xl px-4 py-2 outline-none focus:border-white transition-colors placeholder:text-white/30 rounded-t-md"
                autoComplete="off"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label 
                htmlFor="password" 
                className="text-4xl md:text-5xl font-bold italic bg-clip-text text-transparent bg-gradient-to-r from-[#4ade80] to-[#3b82f6] md:from-[#60a5fa] md:to-[#a78bfa] w-fit pr-2"
                style={{ WebkitTextStroke: '1px rgba(255,255,255,0.1)' }}
              >
                Password:
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="bg-white/10 border-b-2 border-white/30 text-white text-xl px-4 py-2 outline-none focus:border-white transition-colors placeholder:text-white/30 rounded-t-md"
              />
            </div>

            {error && <p className="text-red-300 font-bold bg-black/20 p-2 rounded">{error}</p>}

            <div className="mt-8 ml-8">
              <button
                type="submit"
                className="bg-[#6B21A8] hover:bg-[#581c87] transition-colors text-white font-display italic text-4xl px-12 py-3 rounded-full shadow-xl transform hover:scale-105 active:scale-95"
              >
                Register
              </button>
            </div>
            
          </form>
        </div>

        {/* Right Decorative Shapes Area */}
        <div className="flex-1 hidden md:flex justify-center items-center h-full min-h-[400px]">
          <div className="relative w-[320px] h-[320px] ml-10 mt-10">
            {/* Purple upward triangle */}
            <div className="absolute top-0 left-0 w-40 h-40 bg-[#c084fc]" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}>
              <div className="absolute top-20 left-1/2 -translate-x-1/2 w-20 h-14 bg-black rounded-[50%]"></div>
            </div>
            {/* Blue upward triangle */}
            <div className="absolute top-0 left-32 w-40 h-40 bg-[#818cf8]" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}>
              <div className="absolute top-20 left-1/2 -translate-x-1/2 w-20 h-14 bg-black rounded-[50%]"></div>
            </div>
            {/* Orange downward triangle */}
            <div className="absolute top-40 left-16 w-40 h-40 bg-[#ff6b4a]" style={{ clipPath: 'polygon(0% 0%, 100% 0%, 50% 100%)' }}></div>
          </div>
        </div>

      </div>
      
    </div>
  );
}
