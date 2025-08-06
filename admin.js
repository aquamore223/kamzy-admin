import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDIgFyJLUG7Iju45CxKshIlzO-1gB4Eeow",
  authDomain: "kamzy-wardrobe.firebaseapp.com",
  projectId: "kamzy-wardrobe",
  storageBucket: "kamzy-wardrobe.appspot.com",
  messagingSenderId: "846636201302",
  appId: "1:846636201302:web:22ff79b95fba5ff97d12f7",
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// DOM Elements
const form = document.getElementById("uploadForm");
const feedback = document.getElementById("feedback");
const productsContainer = document.getElementById("products-container");
const storageBar = document.getElementById("storage-bar");
const storageText = document.getElementById("storage-text");

// Authenticate anonymously
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("✅ Authenticated anonymously:", user.uid);
    handleUpload();
    fetchAndDisplayProducts();
  } else {
    signInAnonymously(auth).catch((err) => {
      console.error("❌ Auth error:", err);
      feedback.textContent = "❌ Cannot authenticate user.";
    });
  }
});

// Upload logic
function handleUpload() {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("product-name").value;
    const price = parseFloat(document.getElementById("product-price").value);
    const category = document.getElementById("product-category").value;
    const imageFile = document.getElementById("product-image").files[0];

    if (!imageFile) {
      feedback.textContent = "❌ Please select an image.";
      feedback.style.color = "red";
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", imageFile);
      formData.append("upload_preset", "kamzy_unsigned");

      const res = await fetch("https://api.cloudinary.com/v1_1/dmltit7tl/image/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.secure_url) throw new Error("Cloudinary upload failed.");

      const imageUrl = data.secure_url;
      const publicId = data.public_id;

      await addDoc(collection(db, "products"), {
        name,
        price,
        category,
        imageUrl,
        publicId,
        createdAt: serverTimestamp()
      });

      feedback.textContent = "✅ Product uploaded!";
      feedback.style.color = "green";
      form.reset();
      fetchAndDisplayProducts();
    } catch (err) {
      console.error(err);
      feedback.textContent = "❌ Upload failed.";
      feedback.style.color = "red";
    }
  });
}

// Load products grouped by category
async function fetchAndDisplayProducts() {
  productsContainer.innerHTML = ""; // Clear before loading

  const q = query(collection(db, "products"));
  const snapshot = await getDocs(q);

  const categories = {};
  let totalSizeKB = 0;

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const id = docSnap.id;

    if (!categories[data.category]) categories[data.category] = [];
    categories[data.category].push({ id, ...data });

    // Estimate image size in KB if available
    if (data.imageUrl) {
      const kbMatch = data.imageUrl.match(/\/upload\/.*?\/v\d+\/.*?_(\d+)\.jpg/);
      if (kbMatch) totalSizeKB += parseInt(kbMatch[1]);
    }
  });

  // Display grouped by category
  Object.entries(categories).forEach(([category, items]) => {
    const section = document.createElement("section");
    section.innerHTML = `<h2>${category.toUpperCase()}</h2>`;
    const grid = document.createElement("div");
    grid.classList.add("product-grid");

    items.forEach((item) => {
      const div = document.createElement("div");
      div.classList.add("product-item");
      div.innerHTML = `
        <img src="${item.imageUrl}" alt="${item.name}" />
        <h4>${item.name}</h4>
        <p>$${item.price}</p>
        <button data-id="${item.id}" data-publicid="${item.publicId}">Delete</button>
      `;
      grid.appendChild(div);
    });

    section.appendChild(grid);
    productsContainer.appendChild(section);
  });

  updateStorageBar(totalSizeKB);
}

// Delete
productsContainer.addEventListener("click", async (e) => {
  if (e.target.tagName === "BUTTON") {
    const id = e.target.dataset.id;
    const publicId = e.target.dataset.publicid;

    try {
      await deleteDoc(doc(db, "products", id));
      await fetch(`https://api.cloudinary.com/v1_1/dmltit7tl/delete_by_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: publicId }) // Only works if token available
      });

      fetchAndDisplayProducts();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }
});

// Simulated Storage Bar
function updateStorageBar(usedKB) {
  const maxKB = 1024 * 100; // Simulate 100MB
  const percent = Math.min((usedKB / maxKB) * 100, 100).toFixed(1);

  storageBar.style.width = `${percent}%`;
  storageText.textContent = `Storage Used: ${usedKB.toFixed(1)} KB / 100MB (${percent}%)`;
}
