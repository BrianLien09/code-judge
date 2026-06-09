// js/firebase-config.js

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// TODO: Replace this with your app's Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyCVDNZF6f04TEPc1gMEAxrwfFRAxtdD6jA",
  authDomain: "code-judge-d4568.firebaseapp.com",
  projectId: "code-judge-d4568",
  storageBucket: "code-judge-d4568.firebasestorage.app",
  messagingSenderId: "697587791026",
  appId: "1:697587791026:web:e971b2e2cc0e6992fd45ab"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
