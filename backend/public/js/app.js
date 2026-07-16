
 
 
const API_BASE = "https://sunny-dahab-production.up.railway.app"; // لو الفرونت والباك اند على نفس الدومين سيبها فاضية
// لو هتشغل الفرونت من مكان تاني، حط هنا رابط الباك اند: "https://your-backend.example.com"
 
let i = 0;
let score = 0;
let referralDone = false;
let finalPrize = "";
 
const userData = {
    id: null,
    name: "",
    email: "",
    phone: "",
    friendName: "",
    friendPhone: "",
    prizes: [],
    answers: []
};
 
const s = (id) => document.getElementById(id);
 
const home = s("home");
const register = s("register");
const referral = s("referral");
const quiz = s("quiz");
const result = s("result");
 
const progress = s("progress");
const question = s("question");
const answers = s("answers");
 
const registerForm = s("registerForm");
const referralForm = s("referralForm");
 
//===========================
// أدوات مساعدة
//===========================
 
function showError(message) {
    alert(message);
}
 
async function apiRequest(path, options = {}) {
    let response;
    try {
        response = await fetch(API_BASE + path, {
            headers: { "Content-Type": "application/json" },
            ...options
        });
    } catch (networkErr) {
        throw new Error("تعذر الاتصال بالسيرفر، تأكد من اتصالك بالإنترنت وحاول مرة أخرى");
    }
 
    let data = {};
    try {
        data = await response.json();
    } catch (_) {
        // ممكن الرد يكون فاضي
    }
 
    if (!response.ok) {
        throw new Error(data.error || "حصل خطأ غير متوقع");
    }
 
    return data;
}
 
function setFormDisabled(form, disabled) {
    const btn = form.querySelector("button[type='submit']");
    if (btn) {
        btn.disabled = disabled;
        btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
        btn.textContent = disabled ? "جاري الإرسال..." : btn.dataset.originalText;
    }
}
 
//===========================
// Start
//===========================
 
s("startBtn").onclick = () => {
 
    home.classList.add("page-exit");
 
    setTimeout(() => {
 
        home.classList.add("hidden");
 
        register.classList.remove("hidden");
        register.classList.add("page-enter");
 
    }, 600);
 
};
//===========================
// Register
//===========================
 
registerForm.addEventListener("submit", async function (e) {
    e.preventDefault();
 
    userData.name = s("name").value.trim();
    userData.email = s("email").value.trim();
    userData.phone = s("phone").value.trim();
 
    if (userData.name === "") {
        showError("ادخل الاسم");
        return;
    }
 
    if (userData.phone === "") {
        showError("ادخل رقم الهاتف");
        return;
    }
 
    setFormDisabled(registerForm, true);
 
    try {
        const data = await apiRequest("/api/register", {
            method: "POST",
            body: JSON.stringify({
                name: userData.name,
                email: userData.email,
                phone: userData.phone
            })
        });
 
        userData.id = data.id;
 
        register.classList.add("hidden");
        quiz.classList.remove("hidden");
        showQuestion();
    } catch (err) {
        showError(err.message);
    } finally {
        setFormDisabled(registerForm, false);
    }
});
 
//===========================
// Referral
//===========================
 
referralForm.addEventListener("submit", function (e) {
    e.preventDefault();
 
    userData.friendName = s("friendName").value.trim();
    userData.friendPhone = s("friendPhone").value.trim();
 
    referralDone = true;
 
    referral.classList.add("hidden");
    quiz.classList.remove("hidden");
    showQuestion();
});
 
//===========================
// Questions
//===========================
 
function showQuestion() {
    if (i >= questions.length) {
        finish();
        return;
    }
if (i === 4 && !referralDone) {
    quiz.classList.add("hidden");
    referral.classList.remove("hidden");
    return;
}
 
    const q = questions[i];
 
    progress.innerHTML = `السؤال ${i + 1} من ${questions.length}`;
    question.innerHTML = q.question;
 
    answers.innerHTML = "";
 
    //===========================
    // Checkbox Question
    //===========================
 
    if (q.type === "checkbox") {
        q.answers.forEach((a, index) => {
            answers.innerHTML += `
                <label class="checkbox-item">
                    <input type="checkbox" value="${index}">
                    ${a}
                </label><br>
            `;
        });
 
        const btn = document.createElement("button");
        btn.className = "nextBtn";
        btn.innerHTML = "التالي";
 
        btn.onclick = () => {
            const checked = document.querySelectorAll("input[type='checkbox']:checked");
 
            if (checked.length === 0) {
                showError("اختر إجابة واحدة على الأقل");
                return;
            }
 
  const selected = [...checked].map(x => Number(x.value));
 
userData.answers.push(selected);
 
const correct =
    selected.length === q.correct.length &&
    selected.every(v => q.correct.includes(v));
 
if (correct) {
    score++;
}
 
i++;
showQuestion();
        };
 
        answers.appendChild(btn);
    }
 
    //===========================
    // Normal Questions
    //===========================
 
    else {
        q.answers.forEach((a, index) => {
            const btn = document.createElement("button");
            btn.className = "answer";
            btn.textContent = a;
 
            btn.onclick = () => {
                userData.answers.push(index);
 
                if (index === q.correct) {
                    score++;
                   
i++;
showQuestion();
                } else {
                    i++;
                    showQuestion();
                }
            };
 
            answers.appendChild(btn);
        });
    }
}
 
//===========================
// Prize Popup
//===========================
 
function showPrize(prize, next) {
    const popup = document.createElement("div");
    popup.className = "popup";
    popup.innerHTML = `
        <div class="popup-box">
            <h2>🎉 مبروك</h2>
            <p>لقد ربحت</p>
            <h3>${prize}</h3>
            <button id="closePrize">استمرار</button>
        </div>
    `;
 
    document.body.appendChild(popup);
 
    document.getElementById("closePrize").onclick = () => {
        popup.remove();
        if (next) next();
    };
}
 
//===========================
// Save Participant (نتيجة نهائية)
//===========================
 
async function saveParticipant() {
    if (!userData.id) {
        // لو لأي سبب ما كانش فيه تسجيل ناجح قبل كده، منقدرش نحفظ النتيجة
        console.error("لا يوجد id للمشترك، تعذر حفظ النتيجة النهائية");
        return false;
    }
 
    try {
        await apiRequest(`/api/participants/${userData.id}/complete`, {
            method: "PUT",
            body: JSON.stringify({
                friendName: userData.friendName,
                friendPhone: userData.friendPhone,
                score: score,
                prizes: userData.prizes,
                answers: userData.answers
            })
        });
        return true;
    } catch (error) {
        console.error("خطأ في حفظ النتيجة:", error);
        return false;
    }
}
window.scrollTo(0, 0);
//===========================
// Finish
//===========================
 
async function finish() {
 
    // لو النتيجة صفر (كل الإجابات غلط) مياخدش أي جائزة
    if (score === 0) {
        finalPrize = "";
        userData.prizes = [];
    } else {
        finalPrize = prizes[Math.floor(Math.random() * prizes.length)];
        userData.prizes = [finalPrize];
    }
 
    const saved = await saveParticipant();
 
    quiz.classList.add("hidden");
    result.classList.remove("hidden");
 
    const resultText = document.getElementById("resultText");
 
    if (resultText) {
 
        const prizeSection = score === 0
            ? `<p style="font-size:18px;color:#666;">للأسف مفيش جايزة المرة دي، جرب تاني في مسابقة قادمة 🍀</p>`
            : `
                <h3>🎁 هديتك</h3>
                <p style="font-size:24px;font-weight:bold;">
                    ${finalPrize}
                </p>
              `;
 
        resultText.innerHTML = `
            <h2>🎉 شكراً لمشاركتك</h2>
            <p>${saved ? "تم تسجيل بياناتك بنجاح" : "تم عرض نتيجتك، بس حصلت مشكلة بسيطة في حفظها. لو ممكن قول للمنظمين."}</p>
 
            ${prizeSection}
            <h3>النتيجة : ${score} / ${questions.length}</h3>
        `;
    }
}
 