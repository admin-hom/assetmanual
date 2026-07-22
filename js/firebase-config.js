// Firebase config & init — assetmanual
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCY1j11FDWSI_y5xhTf9lHXEktkOzF5VM4",
  authDomain: "assetmanual-f77b8.firebaseapp.com",
  projectId: "assetmanual-f77b8",
  storageBucket: "assetmanual-f77b8.firebasestorage.app",
  messagingSenderId: "1003625632407",
  appId: "1:1003625632407:web:e084c1c2e37c4127030fd2"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
