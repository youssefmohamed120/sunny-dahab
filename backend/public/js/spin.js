// spin.js
// عجلة الحظ (Spin & Win) - متصلة بالباك اند فعلياً
// المستخدم يدخل رقم الهاتف -> نتأكد إنه مسجل ومالوش سبق ولعب ->
// نطلب من السيرفر يختار جايزة (عشان يبقى عادل وميتلاعبش حد بيه من المتصفح) ->
// ندوّر العجلة بصرياً لحد ما توقف بالظبط على الجايزة اللي رجعها السيرفر.

const API_BASE = "";
// spin.html بيتقدّم من نفس السيرفر اللي فيه الـ API (server.js بيعمل serve لـ public/)
// فمفيش داعي لدومين منفصل هنا. لو يوماً استضفت spin.html على دومين تاني غير الباك اند،
// حط هنا رابط الباك اند الصحيح، زي: "https://your-backend.example.com"

const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");
const phoneInput = document.getElementById("phone");
const spinBtn = document.getElementById("spinBtn");
const statusMsg = document.getElementById("statusMsg");
const resultModal = document.getElementById("resultModal");
const resultPrizeEl = document.getElementById("resultPrize");
const closeModalBtn = document.getElementById("closeModal");

// ⚠️ لازم الأسماء دي تتطابق حرفياً مع قائمة الجوائز في server.js (spinPrizes)
const prizes = [
    { name: "Coffee Mug", color: "#FFD166" },
    { name: "Cap", color: "#06D6A0" },
    { name: "T-Shirt", color: "#118AB2" },
    { name: "Notebook", color: "#EF476F" },
    { name: "Sticker", color: "#F78C6B" },
    { name: "20% Discount", color: "#83C5BE" },
    { name: "Good luck next time", color: "#FFBE0B" }
];

const size = 500;
const center = size / 2;
const radius = 230;
const sliceAngle = (2 * Math.PI) / prizes.length;
const sliceDeg = 360 / prizes.length;

let currentRotationDeg = 0;
let isSpinning = false;
let hasFinished = false;

// ===========================
// رسم العجلة
// ===========================
function drawWheel() {
    ctx.clearRect(0, 0, size, size);

    for (let i = 0; i < prizes.length; i++) {
        const start = i * sliceAngle;
        const end = start + sliceAngle;

        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.arc(center, center, radius, start, end);
        ctx.closePath();
        ctx.fillStyle = prizes[i].color;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.save();
        ctx.translate(center, center);
        ctx.rotate(start + sliceAngle / 2);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 16px Arial";
        ctx.textAlign = "right";
        ctx.fillText(prizes[i].name, radius - 15, 6);
        ctx.restore();
    }

    // دائرة صغيرة في النص
    ctx.beginPath();
    ctx.arc(center, center, 14, 0, 2 * Math.PI);
    ctx.fillStyle = "#244b3f";
    ctx.fill();
}

drawWheel();

// ===========================
// أدوات مساعدة للواجهة
// ===========================
function showStatus(text, type = "error") {
    statusMsg.textContent = text || "";
    statusMsg.classList.remove("success");
    if (type === "success") statusMsg.classList.add("success");
}

function clearStatus() {
    statusMsg.textContent = "";
}

function setSpinning(loading) {
    spinBtn.disabled = loading;
    spinBtn.textContent = loading ? "جاري السحب..." : "SPIN NOW";
}

function lockSpinForever(text) {
    spinBtn.disabled = true;
    spinBtn.textContent = "تم استخدام اللفة";
    phoneInput.disabled = true;
    if (text) showStatus(text, "error");
}

function isValidPhone(phone) {
    return /^[0-9+\-\s]{6,20}$/.test(phone);
}

function showResultModal(prizeName) {
    resultPrizeEl.textContent = prizeName;
    resultModal.classList.remove("hidden");
}

closeModalBtn.addEventListener("click", () => {
    resultModal.classList.add("hidden");
});

// ===========================
// اتصال بالباك اند
// ===========================
async function apiRequest(path, options = {}) {
    let response;
    try {
        response = await fetch(API_BASE + path, {
            headers: { "Content-Type": "application/json" },
            ...options
        });
    } catch (networkErr) {
        throw new Error("تعذر الاتصال بالسيرفر، تأكد من اتصالك بالإنترنت");
    }

    let data = {};
    try {
        data = await response.json();
    } catch (_) {}

    if (!response.ok) {
        throw new Error(data.error || data.message || "حصل خطأ غير متوقع");
    }

    return data;
}

// ===========================
// تدوير العجلة بصرياً لحد ما توقف بالظبط على الجايزة
// ===========================
function spinWheelToPrize(prizeName) {
    const idx = prizes.findIndex((p) => p.name === prizeName);

    // لو الاسم الراجع من السيرفر مش موجود في تعريف العجلة (اختلاف بيانات)
    // بندور على أي حال ونوقف على أقرب حاجة، بدل ما نكسر التجربة
    const safeIdx = idx === -1 ? 0 : idx;

    const segmentCenterDeg = safeIdx * sliceDeg + sliceDeg / 2;

    // جيتر بسيط جوه حدود القطاع نفسه عشان الوقفة متبقاش نفس النقطة بالظبط كل مرة
    const maxJitter = sliceDeg * 0.35;
    const jitter = (Math.random() - 0.5) * 2 * maxJitter;

    // المؤشر (pointer) موجود فوق العجلة، يعني عند زاوية 270 (أو -90) درجة
    const pointerDeg = 270;

    const baseRotation = ((pointerDeg - segmentCenterDeg - jitter) % 360 + 360) % 360;

    const fullSpins = 360 * (6 + Math.floor(Math.random() * 3)); // 6-8 لفة كاملة

    // نتأكد إن الدوران الجديد دايماً أكبر من اللي قبله عشان الحركة تكمل للقدام
    const previousMod = ((currentRotationDeg % 360) + 360) % 360;
    let extra = baseRotation - previousMod;
    if (extra < 0) extra += 360;

    currentRotationDeg = currentRotationDeg + fullSpins + extra;

    canvas.style.transition = "transform 5.5s cubic-bezier(0.12, 0.67, 0.1, 1)";
    canvas.style.transform = `rotate(${currentRotationDeg}deg)`;
}

// ===========================
// زرار الـ SPIN
// ===========================
spinBtn.addEventListener("click", async () => {
    if (isSpinning || hasFinished) return;

    const phone = phoneInput.value.trim();

    if (!phone) {
        showStatus("من فضلك أدخل رقم الهاتف");
        return;
    }

    if (!isValidPhone(phone)) {
        showStatus("رقم الهاتف غير صحيح");
        return;
    }

    clearStatus();
    setSpinning(true);

    try {
        // 1) نتأكد إنه يقدر يلعب
        const checkData = await apiRequest("/api/spin/check", {
            method: "POST",
            body: JSON.stringify({ phone })
        });

        if (checkData.canSpin === false) {
            hasFinished = true;
            lockSpinForever(checkData.message || "لقد لعبت من قبل");
            return;
        }

        // 2) نطلب من السيرفر ينفذ اللفة ويرجع الجايزة
        const playData = await apiRequest("/api/spin/play", {
            method: "POST",
            body: JSON.stringify({ phone })
        });

        isSpinning = true;
        phoneInput.disabled = true;
        spinWheelToPrize(playData.prize);

        canvas.addEventListener(
            "transitionend",
            function onDone() {
                canvas.removeEventListener("transitionend", onDone);
                isSpinning = false;
                hasFinished = true;
                setSpinning(false);
                spinBtn.textContent = "تم استخدام اللفة";
                spinBtn.disabled = true;
                showStatus("مبروك! شوف جايزتك 🎉", "success");
                showResultModal(playData.prize);
            },
            { once: true }
        );
    } catch (err) {
        setSpinning(false);
        showStatus(err.message);
    }
});

// ===========================
// نتأكد من حالة اللاعب لو دخل رقمه ورجع تاني للصفحة
// ===========================
phoneInput.addEventListener("blur", async () => {
    const phone = phoneInput.value.trim();
    if (!phone || !isValidPhone(phone) || hasFinished) return;

    try {
        const checkData = await apiRequest("/api/spin/check", {
            method: "POST",
            body: JSON.stringify({ phone })
        });

        if (checkData.canSpin === false) {
            hasFinished = true;
            lockSpinForever(checkData.message || "لقد لعبت من قبل");
        } else {
            clearStatus();
        }
    } catch (_) {
        // لو الرقم مش مسجل أو حصل خطأ، منعرضش رسالة قبل ما يضغط SPIN فعلياً
    }
});
