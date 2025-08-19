// ======= Firebase (ESM) =======
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, deleteDoc, doc,
  updateDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// Your Firebase project (unchanged)
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

// ======= Cloudinary (yours) =======
const CLOUD_NAME = "dmltit7tl";
const UNSIGNED_PRESET = "kamzy_unsigned";

// ======= DOM =======
const loginSection = document.getElementById("login-section");
const adminSection = document.getElementById("admin-section");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const loginFeedback = document.getElementById("login-feedback");

const addProductBtn = document.getElementById("add-product-btn");
const saveAllBtn = document.getElementById("save-all-btn");
const formsWrap = document.getElementById("product-forms");
const feedback = document.getElementById("upload-feedback");
const bulkCategory = document.getElementById("bulk-category");
const productsContainer = document.getElementById("products-container");

// ======= Auth (simple + persistent) =======
function showAdmin() {
  loginSection.classList.add("hidden");
  adminSection.classList.remove("hidden");
  // ensure top of page visible
  window.scrollTo({ top: 0, behavior: "instant" });
}
function showLogin() {
  adminSection.classList.add("hidden");
  loginSection.classList.remove("hidden");
}
function isLoggedIn() {
  return localStorage.getItem("kamzyAdmin") === "1";
}
function login(user, pass) {
  if (user === "kamzy" && pass === "admin") {
    localStorage.setItem("kamzyAdmin", "1");
    showAdmin();
    loadProducts();
  } else {
    loginFeedback.textContent = "❌ Wrong credentials";
  }
}
function logout() {
  localStorage.removeItem("kamzyAdmin");
  showLogin();
}
loginBtn.addEventListener("click", () => {
  const u = document.getElementById("login-username").value.trim();
  const p = document.getElementById("login-password").value.trim();
  login(u, p);
});
// Enter key submits login
["login-username", "login-password"].forEach(id =>
  document.getElementById(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") loginBtn.click();
  })
);
logoutBtn.addEventListener("click", logout);
window.addEventListener("DOMContentLoaded", () => {
  if (isLoggedIn()) { showAdmin(); loadProducts(); } else { showLogin(); }
});

// ======= Add product rows (unchanged but robust) =======
addProductBtn.addEventListener("click", () => addProductForm());

function addProductForm() {
  const div = document.createElement("div");
  div.className = "product-form";
  div.innerHTML = `
    <label class="label">Name</label>
    <input type="text" class="name input" placeholder="Product name" required />
    <label class="label">Price</label>
    <input type="number" class="price input" placeholder="Price" min="0" step="0.01" required />
    <label class="label">Image</label>
    <div class="row gap">
      <input type="file" class="image input" accept="image/*" required />
      <img class="thumb" alt="preview" />
      <button type="button" class="danger remove-btn">Remove</button>
    </div>
  `;
  const imageInput = div.querySelector(".image");
  const thumb = div.querySelector(".thumb");
  imageInput.addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f) {
      thumb.src = URL.createObjectURL(f);
      thumb.style.display = "block";
    } else {
      thumb.src = "";
      thumb.style.display = "none";
    }
  });
  div.querySelector(".remove-btn").addEventListener("click", () => div.remove());
  formsWrap.appendChild(div);
}

// Start with one form row
addProductForm();

// ======= Cloudinary helpers (upload + delete by token) =======
async function uploadToCloudinary(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", UNSIGNED_PRESET);
  const resp = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: fd
  });
  const json = await resp.json();
  if (!resp.ok || !json?.secure_url) {
    console.error("Cloudinary upload response:", json);
    throw new Error(json?.error?.message || "Cloudinary upload failed");
  }
  return json; // secure_url, public_id, maybe delete_token
}

async function deleteCloudinaryByToken(deleteToken) {
  if (!deleteToken) return false;
  const fd = new FormData();
  fd.append("token", deleteToken);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/delete_by_token`, {
    method: "POST",
    body: fd
  });
  return r.ok;
}

// ======= Save All (parallel uploads; robust) =======
saveAllBtn.addEventListener("click", async () => {
  const category = bulkCategory.value;
  const rows = [...formsWrap.querySelectorAll(".product-form")];
  if (!rows.length) { feedback.textContent = "⚠️ Add at least one product."; return; }

  // validate fields before starting
  for (const row of rows) {
    const n = row.querySelector(".name").value.trim();
    const p = row.querySelector(".price").value.trim();
    const f = row.querySelector(".image").files[0];
    if (!n || !p || !f) {
      feedback.textContent = "⚠️ Fill name, price and image for every product.";
      return;
    }
  }

  // Disable UI while uploading
  saveAllBtn.disabled = true;
  addProductBtn.disabled = true;
  feedback.textContent = "⏳ Uploading…";

  const tasks = rows.map(async (row) => {
    const name = row.querySelector(".name").value.trim();
    const price = row.querySelector(".price").value.trim();
    const file = row.querySelector(".image").files[0];

    // 1) upload to Cloudinary
    const img = await uploadToCloudinary(file);

    // 2) save doc (store delete_token if present)
    return addDoc(collection(db, "products"), {
      name,
      price: parseFloat(price),
      category,
      imageUrl: img.secure_url,
      publicId: img.public_id || "",
      deleteToken: img.delete_token || "",
      createdAt: serverTimestamp(),
    });
  });

  const results = await Promise.allSettled(tasks);
  const ok = results.filter(r => r.status === "fulfilled").length;
  const fail = results.length - ok;

  feedback.textContent = ok
    ? `✅ Saved ${ok} product(s) to ${category.toUpperCase()}${fail ? ` • ${fail} failed` : ""}`
    : "⚠️ Nothing saved. Please fill all fields.";

  // Reset forms and refresh list
  formsWrap.innerHTML = "";
  addProductForm();
  await loadProducts();

  saveAllBtn.disabled = false;
  addProductBtn.disabled = false;
});

// ======= Load & Render Products (grouped by category) =======
async function loadProducts() {
  productsContainer.innerHTML = "";

  const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  const byCat = {};
  snap.forEach((d) => {
    const p = d.data();
    const id = d.id;
    if (!byCat[p.category]) byCat[p.category] = [];
    byCat[p.category].push({ id, ...p });
  });

  for (const [cat, items] of Object.entries(byCat)) {
    const sec = document.createElement("div");
    sec.className = "category-section";
    sec.innerHTML = `<h3 class="category-title">${cat.toUpperCase()}</h3><div class="grid"></div>`;
    const grid = sec.querySelector(".grid");

    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "card-item";

      // createdAt -> human date
      let dateStr = "";
      if (item.createdAt && typeof item.createdAt.toDate === "function") {
        dateStr = item.createdAt.toDate().toLocaleDateString();
      } else {
        dateStr = "";
      }

      card.innerHTML = `
        <img src="${item.imageUrl}" alt="${item.name}" />
        <div class="small">${dateStr}</div>
        <h4>${item.name}</h4>
        <div class="small">₦${Number(item.price).toLocaleString()}</div>
        <div class="row">
          <button class="edit-btn">Edit</button>
          <button class="danger delete-btn">Delete</button>
        </div>
        <div class="row gap" style="margin-top:8px;">
          <button class="small change-image-btn">Change Image</button>
          <input type="file" accept="image/*" class="change-image-input hidden" />
        </div>
      `;

      // DELETE: try Cloudinary delete by token, then Firestore
      card.querySelector(".delete-btn").addEventListener("click", async () => {
        if (!confirm("Delete this product?")) return;
        try {
          if (item.deleteToken) {
            await deleteCloudinaryByToken(item.deleteToken).catch(err => console.warn("Cloud delete error", err));
          } else {
            // no delete token — we cannot safely delete from Cloudinary unsigned; skip.
            console.warn("No delete token available — image may remain on Cloudinary");
          }
        } catch (err) {
          console.warn("Cloudinary delete failed:", err);
        } finally {
          await deleteDoc(doc(db, "products", item.id));
          await loadProducts();
        }
      });

      // EDIT (name & price)
      card.querySelector(".edit-btn").addEventListener("click", async () => {
        const newName = prompt("New name:", item.name);
        if (newName === null) return;
        const newPrice = prompt("New price:", item.price);
        if (newPrice === null) return;
        const nName = newName.trim() || item.name;
        const nPrice = isNaN(parseFloat(newPrice)) ? item.price : parseFloat(newPrice);
        await updateDoc(doc(db, "products", item.id), { name: nName, price: nPrice });
        await loadProducts();
      });

      // CHANGE IMAGE
      const changeBtn = card.querySelector(".change-image-btn");
      const fileInput = card.querySelector(".change-image-input");
      changeBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        changeBtn.textContent = "Uploading…";
        changeBtn.disabled = true;
        try {
          const up = await uploadToCloudinary(f);
          // update doc with new image data
          await updateDoc(doc(db, "products", item.id), {
            imageUrl: up.secure_url,
            publicId: up.public_id || item.publicId || "",
            deleteToken: up.delete_token || item.deleteToken || ""
          });
          // remove old cloud image if we had delete token
          if (item.deleteToken) {
            try { await deleteCloudinaryByToken(item.deleteToken); } catch (err) { /* ignore */ }
          }
          await loadProducts();
        } catch (err) {
          alert("Image upload failed");
          console.error(err);
        } finally {
          changeBtn.textContent = "Change Image";
          changeBtn.disabled = false;
        }
      });

      grid.appendChild(card);
    });

    productsContainer.appendChild(sec);
  }

  if (!Object.keys(byCat).length) {
    productsContainer.innerHTML = `<p class="muted">No products yet. Add some above.</p>`;
  }
}
