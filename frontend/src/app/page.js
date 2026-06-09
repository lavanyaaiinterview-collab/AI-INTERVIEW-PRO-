"use client";

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";

// 🔥 Firebase config (replace with yours)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export default function Home() {

  const login = async () => {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    const idToken = await user.getIdToken();

    console.log("User:", user);
    console.log("Token:", idToken);

    await fetch("http://localhost:5000/api/verify-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ idToken })
    });
  };

  return (
    <div style={{ padding: 50 }}>
      <h1>AI Interview Pro</h1>
      <button onClick={login}>
        Login with Google
      </button>
    </div>
  );
}
