import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

// Firebase config
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

// DOM refs
const form = document.getElementById("uploadForm");
const feedback = document.getElementById("feedback");
const productsContainer = document.getElementById("products-container");
const imageInput = document.getElementById("product-image");
const preview = document.getElementById("image-preview");
const oldImageUrlInput = document.getElementById("old-image-url");
const oldPublicIdInput = document.getElementById("old-public-id");

let editingId = null;

onAuthStateChanged(auth, (user) => {
  if (user) {
    handleForm();
    fetchAndDisplayProducts();
  } else {
    signInAnonymously(auth).catch(() => {
      feedback.textContent = "❌ Cannot authenticate user.";
    });
  }
});

function handleForm() {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("product-name").value;
    const price = parseFloat(document.getElementById("product-price").value);
    const category = document.getElementById("product-category").value;
    const imageFile = imageInput.files[0];
    const oldImageUrl = oldImageUrlInput.value;
    const oldPublicId = oldPublicIdInput.value;

    try {
      let imageUrl = oldImageUrl;
      let publicId = oldPublicId;

      // Upload new image only if selected
      if (imageFile) {
        const formData = new FormData();
        formData.append("file", imageFile);
        formData.append("upload_preset", "kamzy_unsigned");

        const res = await fetch("https://api.cloudinary.com/v1_1/dmltit7tl/image/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!data.secure_url) throw new Error("Image upload failed");

        imageUrl = data.secure_url;
        publicId = data.public_id;
      }

      if (editingId) {
        await updateDoc(doc(db, "products", editingId), {
          name,
          price,
          category,
          imageUrl,
          publicId
        });
        feedback.textContent = "✅ Product updated!";
      } else {
        if (!imageUrl) {
          feedback.textContent = "❌ Please select an image.";
          return;
        }
        await addDoc(collection(db, "products"), {
          name,
          price,
          category,
          imageUrl,
          publicId,
          createdAt: serverTimestamp(),
        });
        feedback.textContent = "✅ Product uploaded!";
      }

      feedback.style.color = "green";
      form.reset();
      preview.src = "";
      preview.style.display = "none";
      oldImageUrlInput.value = "";
      oldPublicIdInput.value = "";
      imageInput.required = true; // reset required for new upload
      editingId = null;
      fetchAndDisplayProducts();
    } catch (err) {
      console.error(err);
      feedback.textContent = "❌ Operation failed.";
      feedback.style.color = "red";
    }
  });
}

async function fetchAndDisplayProducts() {
  productsContainer.innerHTML = "";
  const q = query(collection(db, "products"));
  const snapshot = await getDocs(q);

  const categories = {};

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const id = docSnap.id;

    if (!categories[data.category]) categories[data.category] = [];
    categories[data.category].push({ id, ...data });
  });

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
        <p>₦${parseFloat(item.price).toLocaleString()}</p>  
        <button class="edit-btn" data-id="${item.id}">Edit</button>
        <button class="delete-btn" data-id="${item.id}" data-publicid="${item.publicId}">Delete</button>
      `;
      grid.appendChild(div);
    });

    section.appendChild(grid);
    productsContainer.appendChild(section);
  });
}

// Delete & Edit
productsContainer.addEventListener("click", async (e) => {
  if (e.target.classList.contains("delete-btn")) {
    const id = e.target.dataset.id;
    await deleteDoc(doc(db, "products", id));
    fetchAndDisplayProducts();
  }

  if (e.target.classList.contains("edit-btn")) {
    const id = e.target.dataset.id;
    const docSnap = await getDoc(doc(db, "products", id));
    if (docSnap.exists()) {
      const data = docSnap.data();
      document.getElementById("product-name").value = data.name;
      document.getElementById("product-price").value = data.price;
      document.getElementById("product-category").value = data.category;
      oldImageUrlInput.value = data.imageUrl;
      oldPublicIdInput.value = data.publicId;

      // Show preview of old image
      preview.src = data.imageUrl;
      preview.style.display = "block";

      // Make image input optional in edit mode
      imageInput.required = false;

      editingId = id;
      feedback.textContent = "🔄 Edit mode activated!";
      feedback.style.color = "blue";
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
});
