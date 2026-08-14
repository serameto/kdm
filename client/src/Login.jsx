import React, { useState } from "react";
import { api, saveSession } from "./api";

export default function Login({ onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token, user } = await api.login(username, password);
      saveSession(token, user);
      onLoggedIn(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100">
      <form onSubmit={submit} className="w-80 bg-white border border-stone-300 rounded-lg p-6 shadow-sm">
        <h1 className="text-lg font-medium text-stone-900 mb-1">키오스크·DID 관리</h1>
        <p className="text-sm text-stone-500 mb-5">계정으로 로그인해 주세요.</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 mb-1 block">아이디</label>
            <input
              className="w-full text-sm px-2 py-1.5 rounded border border-stone-300 focus:outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <div>
            <label className="text-xs text-stone-500 mb-1 block">비밀번호</label>
            <input
              type="password"
              className="w-full text-sm px-2 py-1.5 rounded border border-stone-300 focus:outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <div className="text-xs text-rose-600">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full text-sm px-3 py-2 rounded bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </div>
      </form>
    </div>
  );
}
