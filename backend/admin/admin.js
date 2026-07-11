// admin.js
// منطق صفحة الأدمن: تسجيل دخول، عرض المشتركين، تصدير CSV، حذف
// ملحوظة أمان: بنستخدم textContent/escapeHtml مش innerHTML مباشرة بالداتا
// عشان نمنع أي محاولة XSS من مشترك حط كود جافاسكريبت في اسمه مثلاً

const API_BASE = ""; // نفس الدومين بتاع السيرفر

const loginScreen = document.getElementById("loginScreen");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const tableBody = document.getElementById("tableBody");
const statsEl = document.getElementById("stats");

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}

async function apiRequest(path, options = {}) {
    const response = await fetch(API_BASE + path, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...options
    });

    if (response.status === 401) {
        showLogin();
        throw new Error("جلستك انتهت، سجل دخول تاني");
    }

    let data = {};
    try {
        data = await response.json();
    } catch (_) {}

    if (!response.ok) {
        throw new Error(data.error || "حصل خطأ");
    }

    return data;
}

function showLogin() {
    loginScreen.classList.remove("hidden");
    dashboard.classList.add("hidden");
}

function showDashboard() {
    loginScreen.classList.add("hidden");
    dashboard.classList.remove("hidden");
    loadParticipants();
}

//===========================
// تسجيل الدخول
//===========================

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.classList.add("hidden");

    const password = document.getElementById("password").value;
    const btn = loginForm.querySelector("button");
    btn.disabled = true;

    try {
        await apiRequest("/api/admin/login", {
            method: "POST",
            body: JSON.stringify({ password })
        });
        document.getElementById("password").value = "";
        showDashboard();
    } catch (err) {
        loginError.textContent = err.message;
        loginError.classList.remove("hidden");
    } finally {
        btn.disabled = false;
    }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
    try {
        await apiRequest("/api/admin/logout", { method: "POST" });
    } catch (_) {}
    showLogin();
});

//===========================
// تحميل وعرض البيانات
//===========================

async function loadParticipants() {
    tableBody.innerHTML = `<tr><td colspan="11" class="empty">جاري التحميل...</td></tr>`;
    try {
        const data = await apiRequest("/api/admin/participants");
        renderStats(data.stats);
        renderTable(data.participants);
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="11" class="empty">${escapeHtml(err.message)}</td></tr>`;
    }
}

function renderStats(stats) {
    statsEl.innerHTML = `
        <div class="stat-card">
            <div class="num">${stats.total}</div>
            <div class="label">إجمالي المسجلين</div>
        </div>
        <div class="stat-card">
            <div class="num">${stats.completed}</div>
            <div class="label">أكملوا المسابقة</div>
        </div>
        <div class="stat-card">
            <div class="num">${stats.registeredOnly}</div>
            <div class="label">سجلوا ولم يكملوا</div>
        </div>
        <div class="stat-card">
            <div class="num">${stats.avgScore}</div>
            <div class="label">متوسط النتيجة</div>
        </div>
    `;
}

function renderTable(participants) {
    if (!participants.length) {
        tableBody.innerHTML = `<tr><td colspan="11" class="empty">لا يوجد مشتركين لسه</td></tr>`;
        return;
    }

    tableBody.innerHTML = participants.map((p) => `
        <tr data-id="${p.id}">
            <td>${p.id}</td>
            <td>${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.email)}</td>
            <td>${escapeHtml(p.phone)}</td>
            <td>${escapeHtml(p.friendName)}</td>
            <td>${escapeHtml(p.friendPhone)}</td>
            <td>${p.score}</td>
            <td>${p.prizes.length}</td>
            <td><span class="badge ${p.status === "completed" ? "completed" : "registered"}">
                ${p.status === "completed" ? "أكمل" : "مسجل فقط"}
            </span></td>
            <td>${new Date(p.createdAt).toLocaleString("ar-EG")}</td>
            <td><button class="deleteBtn" data-id="${p.id}" title="حذف">🗑️</button></td>
        </tr>
    `).join("");

    tableBody.querySelectorAll(".deleteBtn").forEach((btn) => {
        btn.addEventListener("click", () => handleDelete(btn.dataset.id));
    });
}

async function handleDelete(id) {
    if (!confirm("متأكد إنك عايز تحذف المشترك ده؟ الإجراء ده مش قابل للتراجع")) return;
    try {
        await apiRequest(`/api/admin/participants/${id}`, { method: "DELETE" });
        loadParticipants();
    } catch (err) {
        alert(err.message);
    }
}

document.getElementById("refreshBtn").addEventListener("click", loadParticipants);

document.getElementById("exportBtn").addEventListener("click", () => {
    window.open(API_BASE + "/api/admin/export.csv", "_blank");
});

//===========================
// أول تحميل: نحاول نجيب البيانات؛ لو مسموح يبقى فيه جلسة شغالة
//===========================

(async function init() {
    try {
        await apiRequest("/api/admin/participants");
        showDashboard();
    } catch (_) {
        showLogin();
    }
})();
