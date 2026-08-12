/* ===================== ІНТРО-ВІДЕО ===================== */

const introOverlay = document.getElementById("introOverlay");
const introVideo = document.getElementById("introVideo");
const introLogoFallback = document.getElementById("introLogoFallback");

function hideIntro() {
  if (!introOverlay) return;
  introOverlay.classList.add("intro-hidden");
  setTimeout(() => {
    introOverlay.hidden = true;
    introOverlay.style.display = "none";
  }, 400);
}

if (introOverlay) setTimeout(hideIntro, 1000);

if (introVideo) {
  introVideo.addEventListener("error", () => {
    introVideo.hidden = true;
    if (introLogoFallback) introLogoFallback.hidden = false;
  });
}


/* ===================== СХОВИЩЕ ===================== */

const LS = {
  me: "nalyvay_me_v2",
  swipes: "nalyvay_swipes",
  matches: "nalyvay_matches",
  chats: "nalyvay_chats_demo", // локальний чат ЛИШЕ для демо-анкет (SEED_PROFILES) — не реальних людей
  places: "nalyvay_places_v2"
};


/* ===================== SUPABASE ===================== */

const SUPABASE_URL = "https://yecjmwgmfwqgxbiggeby.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DIBPiv-9rJowQacsgEBMAw_8GvIxboP";

// Має точно збігатись з Redirect URL в Supabase Dashboard -> Authentication -> URL Configuration
const EMAIL_REDIRECT_TO = "https://anastasiakocubenko39-crypto.github.io/nalyvay/";

let supabaseClient = null;

try {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (err) {
  console.error("Не вдалося ініціалізувати Supabase client:", err);
}


/* ===================== PKCE: обмін ?code=... на сесію =====================
   Magic Link веде на сайт з "?code=...". Якщо посилання відкрилось в іншому
   браузері/вебв'ю, ніж той, де замовляли лист — code_verifier відсутній і
   обмін не вдасться. У такому разі людині потрібно повторно замовити лист
   у тому самому браузері, де вона зараз знаходиться. */
async function exchangePkceCodeIfPresent() {
  if (!supabaseClient) return;

  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) return;

  try {
    const { error } = await supabaseClient.auth.exchangeCodeForSession(window.location.href);
    if (error) console.error("AUTH: не вдалося обміняти code на сесію:", error);
  } catch (err) {
    console.error("AUTH: виняток під час обміну code на сесію:", err);
  }

  url.searchParams.delete("code");
  window.history.replaceState({}, document.title, url.toString());
}


/* ===================== SUPABASE: ТАБЛИЦЯ ПРОФІЛІВ =====================
   public.profiles: id, name, email, birth_date, gender, city, bio, photo_url,
   phone_verified, age_verified, is_active, created_at, type, language,
   settlement_type, settlement_name, drinks, food, favorite_place, hobbies.
   RLS: INSERT/UPDATE лише власного рядка (auth.uid() = id),
        SELECT — усі активні анкети (is_active = true).
   public.profiles_public — view поверх profiles, що ховає email від усіх,
   окрім власника рядка; використовується для читання АНКЕТ ІНШИХ людей. */

const PROFILE_TABLE = "profiles";
const PROFILES_PUBLIC_VIEW = "profiles_public";

function ageToApproxBirthDate(age) {
  const n = Number(age);
  if (!n || n < 1) return null;
  const year = new Date().getFullYear() - n;
  return `${year}-01-01`;
}

function birthDateToAge(birthDate) {
  if (!birthDate) return null;
  const bd = new Date(birthDate);
  if (isNaN(bd.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  const hadBirthdayThisYear =
    now.getMonth() > bd.getMonth() ||
    (now.getMonth() === bd.getMonth() && now.getDate() >= bd.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

function buildCityString(settlementName, settlementType) {
  const name = (settlementName || "").trim();
  if (!name) return null;
  return settlementType && settlementType !== "Місто" ? `${name} (${settlementType})` : name;
}

function profileToSupabaseRow(profile) {
  return {
    id: profile.id,
    name: profile.name || "",
    email: profile.email || null,
    birth_date: ageToApproxBirthDate(profile.age),
    gender: profile.gender || null,
    city: buildCityString(profile.settlementName, profile.settlementType),
    settlement_name: profile.settlementName || null,
    bio: profile.bio || null,
    is_active: profile.online !== false,
    type: profile.type || "person",
    language: profile.language || null,
    settlement_type: profile.settlementType || null,
    drinks: profile.drinks || null,
    food: profile.food || null,
    favorite_place: profile.favoritePlace || null,
    hobbies: profile.hobbies || null,
    photo_url: profile.photo || null
  };
}

async function saveProfileToSupabase(profile) {
  if (!supabaseClient) return { data: null, error: new Error("supabaseClient недоступний") };
  if (!profile || !profile.id) return { data: null, error: new Error("У анкети немає id — Email ще не підтверджено") };

  const row = profileToSupabaseRow(profile);
  const { data, error } = await supabaseClient
    .from(PROFILE_TABLE)
    .upsert(row, { onConflict: "id" })
    .select()
    .single();

  if (error) console.error("Supabase upsert profiles error:", error);
  return { data, error };
}

function supabaseRowToCard(row) {
  return {
    id: row.id,
    name: row.name || "Без імені",
    type: row.type || "person",
    gender: row.gender || "",
    language: row.language || "",
    geo: row.city || "Локація не вказана",
    online: row.is_active !== false,
    avatar: "🙂",
    photo: row.photo_url || null,
    age: birthDateToAge(row.birth_date),
    drinks: row.drinks || "",
    food: row.food || "",
    favoritePlace: row.favorite_place || "",
    hobbies: row.hobbies || "",
    bio: row.bio || "",
    verified: !!(row.phone_verified || row.age_verified),
    _source: "supabase" // маркер реальної анкети (не тестового демо-профілю)
  };
}

function supabaseRowToLocalMe(row, sessionEmail) {
  return {
    id: row.id,
    email: row.email || sessionEmail || null,
    name: row.name || "",
    age: birthDateToAge(row.birth_date),
    type: row.type || "person",
    gender: row.gender || "жінка",
    language: row.language || "Українська",
    settlementType: row.settlement_type || "Місто",
    settlementName: row.settlement_name || row.city || "",
    drinks: row.drinks || "",
    food: row.food || "",
    favoritePlace: row.favorite_place || "",
    hobbies: row.hobbies || "",
    bio: row.bio || "",
    online: row.is_active !== false,
    avatar: "🙂",
    photo: row.photo_url || null,
    verified: !!(row.phone_verified || row.age_verified)
  };
}

async function loadRemoteProfiles() {
  if (!supabaseClient) return [];

  const me = currentMe();
  const myId = me && me.id;

  const { data, error } = await supabaseClient
    .from(PROFILES_PUBLIC_VIEW)
    .select("id,name,email,birth_date,gender,city,settlement_type,settlement_name,bio,photo_url,phone_verified,age_verified,is_active,type,language,drinks,food,favorite_place,hobbies,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase select profiles_public error:", error);
    return [];
  }

  return (data || []).filter(row => row.id !== myId).map(supabaseRowToCard);
}

let remoteProfiles = [];
let remoteProfilesLoaded = false;

async function refreshRemoteProfiles() {
  remoteProfiles = await loadRemoteProfiles();
  remoteProfilesLoaded = true;
  rebuildQueue();
  if (typeof renderChatList === "function" && chatListView && !chatListView.hidden) {
    renderChatList();
  }
}

/* Реальна анкета (з Supabase) чи демо-анкета (SEED_PROFILES, тестовий бот) */
function isRealProfile(p) {
  return !!(p && p._source === "supabase");
}

function findProfileById(id) {
  return (
    remoteProfiles.find(p => p.id === id) ||
    SEED_PROFILES_SAFE.find(p => p.id === id) ||
    null
  );
}

function cryptoId() {
  return "id-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function get(key, fallback) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

function set(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}


/* ===================== ВЕРИФІКАЦІЯ ПРОФІЛЮ ===================== */
/* Раніше в HTML була вся розмітка (verifyBox/verifyQuestion/verifyCheckBtn),
   але жодного JS-обробника на неї не було навішено — кнопка "Перевірити"
   візуально існувала, але клік нічого не робив. Додаю логіку повністю. */

const verifyBadgeText = document.getElementById("verifyBadgeText");
const verifyChallenge = document.getElementById("verifyChallenge");
const verifyQuestion = document.getElementById("verifyQuestion");
const verifyAnswerInput = document.getElementById("verifyAnswer");
const verifyCheckBtn = document.getElementById("verifyCheckBtn");
const verifyMsg = document.getElementById("verifyMsg");

let verifyExpectedAnswer = null;

function generateVerifyQuestion() {
  const a = Math.floor(Math.random() * 8) + 1;
  const b = Math.floor(Math.random() * 8) + 1;
  verifyExpectedAnswer = a + b;
  if (verifyQuestion) verifyQuestion.textContent = `${a} + ${b} = ?`;
  if (verifyAnswerInput) verifyAnswerInput.value = "";
  if (verifyMsg) verifyMsg.hidden = true;
}

function renderVerifyState() {
  const me = currentMe();
  const isVerified = !!(me && me.verified);

  if (verifyBadgeText) {
    verifyBadgeText.textContent = isVerified ? "Профіль верифікований ✓" : "Профіль не верифікований";
    verifyBadgeText.classList.toggle("verified", isVerified);
  }
  if (verifyChallenge) verifyChallenge.hidden = isVerified;

  if (!isVerified) generateVerifyQuestion();
}

if (verifyCheckBtn) {
  verifyCheckBtn.addEventListener("click", async () => {
    const raw = (verifyAnswerInput && verifyAnswerInput.value || "").trim();
    const answer = Number(raw);

    if (raw === "" || Number.isNaN(answer)) {
      verifyMsg.textContent = "Введи число.";
      verifyMsg.className = "verify-msg verify-msg-err";
      verifyMsg.hidden = false;
      return;
    }

    if (answer !== verifyExpectedAnswer) {
      verifyMsg.textContent = "Неправильно, спробуй ще раз.";
      verifyMsg.className = "verify-msg verify-msg-err";
      verifyMsg.hidden = false;
      generateVerifyQuestion();
      return;
    }

    verifyMsg.textContent = "Правильно ✓";
    verifyMsg.className = "verify-msg verify-msg-ok";
    verifyMsg.hidden = false;

    const me = currentMe() || {};
    const updated = { ...me, verified: true };
    set(LS.me, updated);
    renderVerifyState();

    // позначаємо анкету верифікованою і в Supabase (age_verified — поле,
    // яке вже є в таблиці profiles саме для цього), щоб галочка "✓"
    // з'являлась і в інших людей у колоді, а не лише в тебе локально
    if (updated.id && supabaseClient) {
      const { error } = await supabaseClient
        .from(PROFILE_TABLE)
        .update({ age_verified: true })
        .eq("id", updated.id);

      if (error) console.error("Supabase update age_verified error:", error);
      else if (typeof refreshRemoteProfiles === "function") refreshRemoteProfiles();
    }
  });
}


/* ===================== ФОТО ===================== */

function readPhotoFile(inputEl) {
  return new Promise(resolve => {
    const file = inputEl && inputEl.files && inputEl.files[0];
    if (!file) { resolve(null); return; }

    if (file.size > 4 * 1024 * 1024) {
      alert("Фото завелике (максимум 4 МБ). Обери менший файл.");
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}


/* ===================== РЕЄСТРАЦІЯ ===================== */

const regOverlay = document.getElementById("regOverlay");
const regForm = document.getElementById("regForm");

function currentMe() {
  return get(LS.me, null);
}

function showApp() {
  if (regOverlay) regOverlay.hidden = true;
  fillProfileFormFromMe();
}

function renderAvatarPreview(me) {
  const el = document.getElementById("avatarPreview");
  if (!el) return;

  if (me && me.photo) {
    el.innerHTML = `<img src="${me.photo}" alt="Фото профілю">`;
  } else {
    el.textContent = (me && me.avatar) || "🙂";
  }
}

function fillProfileFormFromMe() {
  const me = currentMe();
  if (!me) return;

  const fields = {
    pName: me.name || "",
    pAge: me.age || "",
    pType: me.type || "person",
    pGender: me.gender || "жінка",
    pLanguage: me.language || "Українська",
    pSettlementType: me.settlementType || "Місто",
    pSettlementName: me.settlementName || "",
    pDrinks: me.drinks || "",
    pFood: me.food || "",
    pFavPlace: me.favoritePlace || "",
    pHobbies: me.hobbies || "",
    pBio: me.bio || ""
  };

  Object.entries(fields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  });

  const emailField = document.getElementById("pEmail");
  if (emailField) emailField.value = me.email || "";

  const onlineToggle = document.getElementById("onlineToggle");
  if (onlineToggle) onlineToggle.checked = me.online !== false;

  renderAvatarPreview(me);
  renderVerifyState();
}


/* ===================== ВІДПРАВКА EMAIL (РЕЄСТРАЦІЯ) ===================== */

let pendingRegistration = null;

if (regForm) {
  regForm.addEventListener("submit", async e => {
    e.preventDefault();

    if (!supabaseClient) {
      alert("Сервіс реєстрації тимчасово недоступний (не вдалося з'єднатись із Supabase). Онови сторінку і спробуй ще раз.");
      return;
    }

    const email = document.getElementById("regEmail").value.trim();
    if (!email) { alert("Введи Email"); return; }

    const photo = await readPhotoFile(document.getElementById("regPhoto"));

    pendingRegistration = {
      name: document.getElementById("regName").value.trim(),
      email: email,
      age: Number(document.getElementById("regAge").value),
      type: document.getElementById("regType").value,
      gender: document.getElementById("regGender").value,
      language: document.getElementById("regLanguage").value,
      settlementType: document.getElementById("regSettlementType").value,
      settlementName: document.getElementById("regSettlementName").value.trim(),
      drinks: document.getElementById("regDrinks").value.trim(),
      food: document.getElementById("regFood").value.trim(),
      favoritePlace: document.getElementById("regFavPlace").value.trim(),
      hobbies: document.getElementById("regHobbies").value.trim(),
      bio: document.getElementById("regBio").value.trim(),
      online: true,
      avatar: "🙂",
      photo: photo || null,
      verified: false
    };

    localStorage.setItem("nalyvay_pending_registration", JSON.stringify(pendingRegistration));

    const { error } = await supabaseClient.auth.signInWithOtp({
      email: email,
      options: { shouldCreateUser: true, emailRedirectTo: EMAIL_REDIRECT_TO }
    });

    if (error) {
      console.error("Supabase email error:", error);
      alert("Не вдалося надіслати лист: " + error.message);
      return;
    }

    const confirmMessage = document.getElementById("emailConfirmMessage");
    const confirmAddress = document.getElementById("emailConfirmAddress");
    if (confirmAddress) confirmAddress.textContent = email;
    if (confirmMessage) confirmMessage.hidden = false;

    const submitButton = regForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.hidden = true;
  });
}


/* ===================== ВХІД (ДЛЯ ТИХ, ХТО ВЖЕ МАЄ АКАУНТ) ===================== */

const showLoginBtn = document.getElementById("showLoginBtn");
const backToRegisterBtn = document.getElementById("backToRegisterBtn");
const loginForm = document.getElementById("loginForm");

if (showLoginBtn && loginForm && regForm) {
  showLoginBtn.addEventListener("click", () => {
    regForm.hidden = true;
    loginForm.hidden = false;
  });
}

if (backToRegisterBtn && loginForm && regForm) {
  backToRegisterBtn.addEventListener("click", () => {
    loginForm.hidden = true;
    regForm.hidden = false;
  });
}

if (loginForm) {
  loginForm.addEventListener("submit", async e => {
    e.preventDefault();

    if (!supabaseClient) {
      alert("Сервіс входу тимчасово недоступний (не вдалося з'єднатись із Supabase). Онови сторінку і спробуй ще раз.");
      return;
    }

    const emailInput = document.getElementById("loginEmail");
    const email = emailInput ? emailInput.value.trim() : "";
    if (!email) { alert("Введи Email"); return; }

    const { error } = await supabaseClient.auth.signInWithOtp({
      email: email,
      options: { shouldCreateUser: false, emailRedirectTo: EMAIL_REDIRECT_TO }
    });

    if (error) {
      console.error("Supabase login email error:", error);
      alert("Не вдалося надіслати посилання для входу: " + error.message + ". Якщо в тебе ще немає акаунта — повернись до реєстрації.");
      return;
    }

    const loginConfirmMessage = document.getElementById("loginConfirmMessage");
    const loginConfirmAddress = document.getElementById("loginConfirmAddress");
    if (loginConfirmAddress) loginConfirmAddress.textContent = email;
    if (loginConfirmMessage) loginConfirmMessage.hidden = false;

    const loginSubmitButton = loginForm.querySelector('button[type="submit"]');
    if (loginSubmitButton) loginSubmitButton.hidden = true;
  });
}


/* ===================== ПЕРЕВІРКА EMAIL / СЕСІЇ ===================== */

let handleSessionInFlight = null;

async function handleSession(session) {
  if (!session || !session.user) return;
  if (handleSessionInFlight) { await handleSessionInFlight; return; }

  handleSessionInFlight = handleSessionInner(session);
  try { await handleSessionInFlight; } finally { handleSessionInFlight = null; }
}

let sessionHandled = false;

function applyLocalProfileAndOpenApp(meObject) {
  set(LS.me, meObject);
  showApp();
}

async function fetchOwnProfileRow(userId) {
  if (!supabaseClient) return null;

  const { data: row, error } = await supabaseClient
    .from(PROFILE_TABLE)
    .select("id,name,email,birth_date,gender,city,settlement_type,settlement_name,bio,photo_url,phone_verified,age_verified,is_active,type,language,drinks,food,favorite_place,hobbies,created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Не вдалося отримати анкету з Supabase:", error);
    return null;
  }

  return row || null;
}

async function handleSessionInner(session) {
  const userId = session.user.id;
  const already = currentMe();

  if (sessionHandled && already && already.id === userId) return;

  const pendingRaw = localStorage.getItem("nalyvay_pending_registration");

  if (pendingRaw) {
    let registration = null;
    try { registration = JSON.parse(pendingRaw); }
    catch (err) { console.error("Пошкоджені дані очікуваної реєстрації:", err); }

    if (registration) {
      registration.id = userId;
      registration.email = session.user.email;
      registration.verified = true;

      const { data: savedRow, error: saveError } = await saveProfileToSupabase(registration);

      if (saveError) {
        console.error("Не вдалося записати анкету в Supabase:", saveError);
        alert("Email підтверджено, анкету збережено локально, але не вдалося записати її в базу даних: " + saveError.message + ". Спробуй зберегти профіль ще раз на вкладці «Профіль».");
      } else {
        localStorage.removeItem("nalyvay_pending_registration");
        pendingRegistration = null;
      }

      sessionHandled = true;
      applyLocalProfileAndOpenApp(registration);

      if (typeof refreshRemoteProfiles === "function") refreshRemoteProfiles();
      if (typeof refreshRealMatches === "function") refreshRealMatches();
      if (typeof subscribeToIncomingSwipes === "function") subscribeToIncomingSwipes();
      if (typeof subscribeToIncomingMessagesGlobal === "function") subscribeToIncomingMessagesGlobal();

      return;
    }
  }

  if (already && already.id === userId) {
    sessionHandled = true;
    showApp();
    return;
  }

  const row = await fetchOwnProfileRow(userId);

  if (row) {
    sessionHandled = true;
    applyLocalProfileAndOpenApp(supabaseRowToLocalMe(row, session.user.email));
    return;
  }

  console.warn("AUTH: сесія є, але анкети немає ні локально, ні в public.profiles (userId=" + userId + "). Людина лишається на формі реєстрації.");
}

async function checkEmailConfirmation() {
  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) { console.error("Помилка отримання сесії:", error); return; }
    await handleSession(session);
  } catch (error) {
    console.error("Помилка відновлення реєстрації:", error);
  }
}

if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
      handleSession(session);
    }
  });
}


/* ===================== ЗАПУСК АВТЕНТИФІКАЦІЇ/АНКЕТ ===================== */

async function initAuthAndProfiles() {
  if (currentMe()) showApp();

  if (supabaseClient) {
    await exchangePkceCodeIfPresent();
    await checkEmailConfirmation();
  }

  // підтягуємо мої реальні свайпи з Supabase, щоб колода не показувала
  // повторно людей, яких я вже оцінив(-ла) з іншого пристрою/сесії
  const remoteSwipes = await loadMySwipesFromSupabase();
  if (Object.keys(remoteSwipes).length > 0) {
    swipes = { ...swipes, ...remoteSwipes };
    set(LS.swipes, swipes);
  }

  await refreshRemoteProfiles();
  await refreshRealMatches();
  subscribeToIncomingSwipes();
  subscribeToIncomingMessagesGlobal();
  await refreshUnreadRealMessages();
}

initAuthAndProfiles();

/* ===================== НАВІГАЦІЯ ===================== */

const screens = document.querySelectorAll(".screen");
const navBtns = document.querySelectorAll(".nav-btn");
let mapInitialized = false;

navBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    navBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    screens.forEach(s => s.classList.toggle("active", s.id === "screen-" + tab));
    if (tab === "bars") {
      if (!mapInitialized) { initMap(); mapInitialized = true; }
      else setTimeout(() => map.invalidateSize(), 50);
    }
    if (tab === "chats") renderChatList();
  });
});

/* ===================== РОЗШИРЕНИЙ ПОШУК / ФІЛЬТРИ ===================== */

let filters = {
  type: "all", gender: "all", language: "all",
  minAge: "", maxAge: "", drinks: "", food: "", place: "", settlement: ""
};

function matchesFilters(p) {
  if (filters.type !== "all" && p.type !== filters.type) return false;
  if (filters.gender !== "all") {
    if (!p.gender || p.gender !== filters.gender) return false;
  }
  if (filters.language !== "all" && (p.language || "") !== filters.language) return false;
  if (filters.minAge && p.age < Number(filters.minAge)) return false;
  if (filters.maxAge && p.age > Number(filters.maxAge)) return false;
  if (filters.drinks && !(p.drinks || "").toLowerCase().includes(filters.drinks.toLowerCase())) return false;
  if (filters.food && !(p.food || "").toLowerCase().includes(filters.food.toLowerCase())) return false;
  if (filters.place && !(p.favoritePlace || "").toLowerCase().includes(filters.place.toLowerCase())) return false;
  if (filters.settlement && !(p.geo || "").toLowerCase().includes(filters.settlement.toLowerCase())) return false;
  return true;
}

function hasActiveFilters() {
  return filters.type !== "all" || filters.gender !== "all" || filters.language !== "all" ||
    filters.minAge || filters.maxAge || filters.drinks || filters.food || filters.place || filters.settlement;
}

function updateFilterBtnState() {
  document.getElementById("filterBtn").classList.toggle("active-filters", hasActiveFilters());
}

const filterModalOverlay = document.getElementById("filterModalOverlay");
document.getElementById("filterBtn").addEventListener("click", () => filterModalOverlay.hidden = false);
document.getElementById("filterModalCloseBtn").addEventListener("click", () => filterModalOverlay.hidden = true);
filterModalOverlay.addEventListener("click", e => { if (e.target === filterModalOverlay) filterModalOverlay.hidden = true; });
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !filterModalOverlay.hidden) filterModalOverlay.hidden = true;
});

document.querySelectorAll(".chip-row").forEach(row => {
  row.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const group = row.dataset.group;
    row.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    filters[group] = chip.dataset.value;
  });
});

document.getElementById("filterForm").addEventListener("submit", e => {
  e.preventDefault();
  filters.minAge = document.getElementById("fMinAge").value;
  filters.maxAge = document.getElementById("fMaxAge").value;
  filters.drinks = document.getElementById("fDrinks").value.trim();
  filters.food = document.getElementById("fFood").value.trim();
  filters.place = document.getElementById("fPlace").value.trim();
  filters.settlement = document.getElementById("fSettlement").value.trim();
  filterModalOverlay.hidden = true;
  updateFilterBtnState();
  rebuildQueue();
});

document.getElementById("filterResetBtn").addEventListener("click", () => {
  filters = { type: "all", gender: "all", language: "all", minAge: "", maxAge: "", drinks: "", food: "", place: "", settlement: "" };
  document.querySelectorAll(".chip-row").forEach(row => {
    row.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c.dataset.value === "all"));
  });
  document.getElementById("fMinAge").value = "";
  document.getElementById("fMaxAge").value = "";
  document.getElementById("fDrinks").value = "";
  document.getElementById("fFood").value = "";
  document.getElementById("fPlace").value = "";
  document.getElementById("fSettlement").value = "";
  updateFilterBtnState();
  rebuildQueue();
});

/* ===================== SWIPE DECK ===================== */

const deckEl = document.getElementById("deck");
const deckEmpty = document.getElementById("deckEmpty");
const deckEmptyText = document.getElementById("deckEmptyText");
const swipeActionsEl = document.querySelector(".swipe-actions");
const swipeHintEl = document.getElementById("swipeHint");

if (typeof SEED_PROFILES === "undefined") {
  console.error("SEED_PROFILES не знайдено. Переконайся, що seed-data.js підключений у index.html ПЕРЕД script.js.");
}
const SEED_PROFILES_SAFE =
  (typeof SEED_PROFILES !== "undefined" && Array.isArray(SEED_PROFILES)) ? SEED_PROFILES : [];

let swipes = get(LS.swipes, {});
let matches = get(LS.matches, []);     // метчі з демо-анкетами (лише локально)
let realMatches = [];                  // id реальних людей із взаємним лайком (Supabase)
let queue = SEED_PROFILES_SAFE.filter(p => !(p.id in swipes));

const showPassedBtn = document.getElementById("showPassedBtn");

function hasPassedProfiles() {
  return Object.values(swipes).includes("pass");
}

function sourceProfiles() {
  if (!remoteProfilesLoaded) return SEED_PROFILES_SAFE;
  return remoteProfiles.length > 0 ? remoteProfiles : SEED_PROFILES_SAFE;
}

function rebuildQueue() {
  queue = sourceProfiles().filter(p => !(p.id in swipes) && matchesFilters(p));
  renderDeck();
}

function renderDeck() {
  deckEl.innerHTML = "";
  const isEmpty = queue.length === 0;
  deckEmpty.hidden = !isEmpty;
  showPassedBtn.hidden = !(isEmpty && hasPassedProfiles() && !hasActiveFilters());

  // коли колода порожня — ховаємо кнопки "лайк/пропустити" й підказку знизу:
  // раніше вони лишались видимими навіть без жодної картки і своїм z-index
  // перекривали кнопку "Показати пропущених ще раз", тому вона була не видна
  if (swipeActionsEl) swipeActionsEl.hidden = isEmpty;
  if (swipeHintEl) swipeHintEl.hidden = isEmpty;

  if (isEmpty && hasActiveFilters()) {
    deckEmptyText.innerHTML = "Нікого не знайдено за цими фільтрами 🔍<br>Спробуй змінити критерії пошуку.";
  } else {
    deckEmptyText.innerHTML = "Це всі, хто зараз поруч 🍻<br>Заглянь пізніше — з'являться нові.";
  }

  queue.slice(0, 3).reverse().forEach(p => {
    const card = buildCard(p);
    deckEl.appendChild(card);
  });
  attachDragToTopCard();
}

function buildCard(p) {
  const card = document.createElement("div");
  card.className = "swipe-card";
  card.dataset.id = p.id;

  const extraTags = [];
  if (p.gender) extraTags.push(`<span class="card-tag">${p.gender === "жінка" ? "♀" : p.gender === "чоловік" ? "♂" : "⚧"} ${escapeHtml(p.gender)}</span>`);
  if (p.language) extraTags.push(`<span class="card-tag">🗣 ${escapeHtml(p.language)}</span>`);
  if (p.favoritePlace && p.favoritePlace !== "—") extraTags.push(`<span class="card-tag">⭐ ${escapeHtml(p.favoritePlace)}</span>`);

  card.innerHTML = `
    <div class="card-avatar">${p.photo ? `<img src="${p.photo}" alt="${escapeHtml(p.name)}">` : p.avatar}</div>
    <div class="card-online">
      <span class="dot" style="background:${p.online ? "var(--green)" : "var(--text-dim)"}"></span>
      ${p.online ? "онлайн зараз" : "не в мережі"}
    </div>
    <div class="stamp stamp-like">LIKE</div>
    <div class="stamp stamp-nope">NOPE</div>
    <div class="card-body">
      <h3 class="card-name">${escapeHtml(p.name)}${p.verified ? ' <span class="verify-check" title="Верифікований профіль">✓</span>' : ''}<span class="card-badge ${p.type === "person" ? "badge-person" : "badge-company"}">${p.type === "person" ? "людина" : "заклад"}</span></h3>
      <p class="card-geo">📍 ${escapeHtml(p.geo)}</p>
      <div class="card-tags">
        <span class="card-tag">🍺 ${escapeHtml(p.drinks)}</span>
        <span class="card-tag">🍴 ${escapeHtml(p.food)}</span>
        ${extraTags.join("")}
      </div>
      <p class="card-bio">${escapeHtml(p.bio)}</p>
    </div>
  `;
  return card;
}

function attachDragToTopCard() {
  const cards = deckEl.querySelectorAll(".swipe-card");
  if (cards.length === 0) return;
  const top = cards[cards.length - 1];
  let startX = 0, startY = 0, dx = 0, dragging = false;

  function pointerDown(e) {
    dragging = true;
    const point = e.touches ? e.touches[0] : e;
    startX = point.clientX; startY = point.clientY;
    top.style.transition = "none";
  }
  function pointerMove(e) {
    if (!dragging) return;
    const point = e.touches ? e.touches[0] : e;
    dx = point.clientX - startX;
    const dy = point.clientY - startY;
    const rotate = dx / 14;
    top.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotate}deg)`;
    top.classList.toggle("swipe-right", dx > 40);
    top.classList.toggle("swipe-left", dx < -40);
    top.querySelector(".stamp-like").style.opacity = Math.min(Math.max(dx / 80, 0), 1);
    top.querySelector(".stamp-nope").style.opacity = Math.min(Math.max(-dx / 80, 0), 1);
  }
  function pointerUp() {
    if (!dragging) return;
    dragging = false;
    top.style.transition = "transform .25s ease";
    if (dx > 100) { finishSwipe("like"); }
    else if (dx < -100) { finishSwipe("pass"); }
    else {
      top.style.transform = "";
      top.classList.remove("swipe-right", "swipe-left");
    }
    dx = 0;
  }

  top.addEventListener("mousedown", pointerDown);
  window.addEventListener("mousemove", pointerMove);
  window.addEventListener("mouseup", pointerUp);
  top.addEventListener("touchstart", pointerDown, { passive: true });
  top.addEventListener("touchmove", pointerMove, { passive: true });
  top.addEventListener("touchend", pointerUp);
}

let isSwiping = false;

/* ---------- СВАЙПИ У SUPABASE (реальні лайки/пропуски) ---------- */

async function saveSwipeToSupabase(targetId, action) {
  if (!supabaseClient) return { data: null, error: new Error("supabaseClient недоступний") };
  const me = currentMe();
  if (!me || !me.id) return { data: null, error: new Error("не авторизовано") };

  const { data, error } = await supabaseClient
    .from("swipes")
    .upsert({ swiper_id: me.id, target_id: targetId, action }, { onConflict: "swiper_id,target_id" })
    .select()
    .single();

  if (error) console.error("Supabase upsert swipes error:", error);
  return { data, error };
}

async function loadMySwipesFromSupabase() {
  if (!supabaseClient) return {};
  const me = currentMe();
  if (!me || !me.id) return {};

  const { data, error } = await supabaseClient
    .from("swipes")
    .select("target_id,action")
    .eq("swiper_id", me.id);

  if (error) { console.error("Supabase load my swipes error:", error); return {}; }

  const map = {};
  (data || []).forEach(r => { map[r.target_id] = r.action; });
  return map;
}

async function checkMutualLike(targetId) {
  if (!supabaseClient) return false;
  const me = currentMe();
  if (!me || !me.id) return false;

  const { data, error } = await supabaseClient
    .from("swipes")
    .select("id")
    .eq("swiper_id", targetId)
    .eq("target_id", me.id)
    .eq("action", "like")
    .maybeSingle();

  if (error) { console.error("Supabase check mutual like error:", error); return false; }
  return !!data;
}

function finishSwipe(action) {
  if (isSwiping) return;
  const topCard = deckEl.querySelector(".swipe-card:last-child");
  const id = topCard?.dataset.id;
  if (!id) return;
  isSwiping = true;
  const flyX = action === "like" ? 500 : -500;
  if (topCard) {
    topCard.style.transform = `translate(${flyX}px, -40px) rotate(${flyX / 14}deg)`;
    topCard.style.opacity = "0";
  }
  swipes[id] = action;
  set(LS.swipes, swipes);

  const profile = queue.find(p => p.id === id);

  setTimeout(async () => {
    queue = queue.filter(p => p.id !== id);
    renderDeck();
    isSwiping = false;

    if (action !== "like" || !profile) return;

    if (isRealProfile(profile)) {
      // реальна людина: лайк іде в Supabase, метч буде лише при взаємності
      const { error } = await saveSwipeToSupabase(id, "like");
      if (error) { console.error("Не вдалося зберегти лайк:", error); return; }

      const mutual = await checkMutualLike(id);
      if (mutual) {
        if (!realMatches.includes(id)) realMatches.push(id);
        showMatchModal(profile);
        renderChatList();
      }
      // якщо взаємності ще немає — це просто лайк, метч з'явиться пізніше автоматично,
      // якщо інша людина теж лайкне у відповідь (див. subscribeToIncomingSwipes)
    } else {
      // демо-анкета (SEED_PROFILES) — тестовий бот для ознайомлення з інтерфейсом,
      // не реальна людина, тому метч тут імітується миттєво
      if (!matches.includes(profile.id)) {
        matches.push(profile.id);
        set(LS.matches, matches);
      }
      seedDemoChatIfEmpty(profile);
      showMatchModal(profile);
    }
  }, 220);
}

showPassedBtn.addEventListener("click", () => {
  Object.keys(swipes).forEach(id => {
    if (swipes[id] === "pass") delete swipes[id];
  });
  set(LS.swipes, swipes);
  rebuildQueue();
});
document.getElementById("passBtn")?.addEventListener("click", () => finishSwipe("pass"));
document.getElementById("likeBtn")?.addEventListener("click", () => finishSwipe("like"));

/* ---------- МЕТЧІ ---------- */

const matchOverlay = document.getElementById("matchOverlay");
const chatDot = document.getElementById("chatDot");
let lastMatchedId = null;

function showMatchModal(profile) {
  lastMatchedId = profile.id;
  document.getElementById("matchName").textContent = profile.name;
  matchOverlay.hidden = false;
  // ЧЕРВОНУ крапку на вкладці "Чати" більше НЕ вмикаємо тут напряму:
  // сам факт метчу — це ще не повідомлення. Крапка показується лише коли
  // з'являється реальне непрочитане повідомлення (див. updateChatDot нижче)
}

function seedDemoChatIfEmpty(profile) {
  const chats = get(LS.chats, {});
  if (!chats[profile.id]) {
    chats[profile.id] = [{ from: "them", text: `Привіт! Радий(-а) метчу 🍾 Ти теж любиш ${(profile.drinks || "").split(",")[0].toLowerCase()}?` }];
    set(LS.chats, chats);
    markDemoUnread(profile.id);
    updateChatDot();
  }
}

/* Мутуальні метчі з реальними людьми: я лайкнув(-ла) X і X лайкнув(-ла) мене */
async function loadRealMatches() {
  if (!supabaseClient) return [];
  const me = currentMe();
  if (!me || !me.id) return [];

  const [{ data: myLikes, error: e1 }, { data: incomingLikes, error: e2 }] = await Promise.all([
    supabaseClient.from("swipes").select("target_id").eq("swiper_id", me.id).eq("action", "like"),
    supabaseClient.from("swipes").select("swiper_id").eq("target_id", me.id).eq("action", "like")
  ]);

  if (e1 || e2) { console.error("Supabase load matches error:", e1 || e2); return []; }

  const incomingSet = new Set((incomingLikes || []).map(r => r.swiper_id));
  return (myLikes || []).map(r => r.target_id).filter(id => incomingSet.has(id));
}

async function refreshRealMatches() {
  realMatches = await loadRealMatches();
  if (typeof renderChatList === "function") renderChatList();
  if (typeof refreshUnreadRealMessages === "function") await refreshUnreadRealMessages();
}

/* Realtime: коли хтось реальний лайкає мене — перевіряємо взаємність і,
   якщо я вже лайкнув(-ла) його(її) раніше, показуємо метч без перезавантаження */
let swipesRealtimeChannel = null;

function subscribeToIncomingSwipes() {
  if (!supabaseClient) return;
  const me = currentMe();
  if (!me || !me.id) return;

  if (swipesRealtimeChannel) supabaseClient.removeChannel(swipesRealtimeChannel);

  swipesRealtimeChannel = supabaseClient
    .channel("swipes-incoming-" + me.id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "swipes", filter: `target_id=eq.${me.id}` },
      async payload => {
        const row = payload.new;
        if (row.action !== "like") return;

        let iLikedThem = swipes[row.swiper_id] === "like";
        if (!iLikedThem) {
          const { data } = await supabaseClient
            .from("swipes").select("id")
            .eq("swiper_id", me.id).eq("target_id", row.swiper_id).eq("action", "like")
            .maybeSingle();
          iLikedThem = !!data;
        }
        if (!iLikedThem) return;

        if (!realMatches.includes(row.swiper_id)) realMatches.push(row.swiper_id);

        let profile = findProfileById(row.swiper_id);
        if (!profile) { await refreshRemoteProfiles(); profile = findProfileById(row.swiper_id); }
        if (profile) showMatchModal(profile);

        renderChatList();
      })
    .subscribe();
}

document.getElementById("matchKeepSwiping").addEventListener("click", () => matchOverlay.hidden = true);
document.getElementById("matchGoToChat").addEventListener("click", () => {
  matchOverlay.hidden = true;
  navBtns.forEach(b => b.classList.remove("active"));
  document.querySelector('[data-tab="chats"]').classList.add("active");
  screens.forEach(s => s.classList.toggle("active", s.id === "screen-chats"));
  openThread(lastMatchedId);
});

/* ===================== НЕПРОЧИТАНІ ПОВІДОМЛЕННЯ / ЧЕРВОНА КРАПКА =====================
   Раніше червона крапка на вкладці "Чати" вмикалась просто від наявності метчу —
   тобто вона світилась навіть якщо жодного повідомлення ще ніхто не написав.
   Тепер крапка показується ЛИШЕ коли є реально непрочитане повідомлення:
   - для реальних людей (Supabase): порівнюємо час останнього вхідного
     повідомлення від кожного співрозмовника з часом, коли я востаннє
     відкривав(-ла) чат із ним(нею) (nalyvay_last_seen_<мій id>);
   - для демо-анкет (SEED_PROFILES): окремий локальний список "непрочитаних"
     ідентифікаторів чатів (nalyvay_unread_demo_<мій id>). */

function lastSeenKey() {
  const me = currentMe();
  return "nalyvay_last_seen_" + (me && me.id ? me.id : "guest");
}
function getLastSeenMap() { return get(lastSeenKey(), {}); }
function setLastSeenNow(otherId) {
  const map = getLastSeenMap();
  map[otherId] = new Date().toISOString();
  set(lastSeenKey(), map);
}

function unreadDemoChatsKey() {
  const me = currentMe();
  return "nalyvay_unread_demo_" + (me && me.id ? me.id : "guest");
}
function getUnreadDemoSet() { return new Set(get(unreadDemoChatsKey(), [])); }
function markDemoUnread(id) {
  const s = getUnreadDemoSet(); s.add(id);
  set(unreadDemoChatsKey(), [...s]);
}
function markDemoRead(id) {
  const s = getUnreadDemoSet(); s.delete(id);
  set(unreadDemoChatsKey(), [...s]);
}

let unreadRealSenderIds = new Set();

/* Одноразова перевірка при вході/оновленні сторінки: чи є повідомлення,
   надіслані мені, час яких пізніший за мій "lastSeen" по цьому відправнику. */
async function refreshUnreadRealMessages() {
  unreadRealSenderIds = new Set();
  if (!supabaseClient) { updateChatDot(); return; }
  const me = currentMe();
  if (!me || !me.id) { updateChatDot(); return; }

  const { data, error } = await supabaseClient
    .from("messages")
    .select("sender_id,created_at")
    .eq("receiver_id", me.id)
    .order("created_at", { ascending: false });

  if (error) { console.error("Supabase unread messages error:", error); updateChatDot(); return; }

  const lastSeen = getLastSeenMap();
  const seenSenders = new Set();
  (data || []).forEach(row => {
    if (seenSenders.has(row.sender_id)) return; // нас цікавить лише останнє повідомлення від кожного
    seenSenders.add(row.sender_id);
    const seenAt = lastSeen[row.sender_id];
    if (!seenAt || new Date(row.created_at) > new Date(seenAt)) {
      unreadRealSenderIds.add(row.sender_id);
    }
  });
  updateChatDot();
}

/* Глобальна realtime-підписка (працює незалежно від того, який чат зараз
   відкритий) — щоб крапка запалювалась одразу, коли приходить нове
   повідомлення, а не лише після перезавантаження сторінки. */
let globalMessagesChannel = null;

function subscribeToIncomingMessagesGlobal() {
  if (!supabaseClient) return;
  const me = currentMe();
  if (!me || !me.id) return;

  if (globalMessagesChannel) supabaseClient.removeChannel(globalMessagesChannel);

  globalMessagesChannel = supabaseClient
    .channel("messages-incoming-" + me.id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${me.id}` },
      payload => {
        const row = payload.new;
        const threadOpenWithSender = !chatThreadView.hidden && chatThreadView.dataset.activeId === row.sender_id;

        if (threadOpenWithSender) {
          // людина вже дивиться саме цей чат — повідомлення одразу "прочитане"
          setLastSeenNow(row.sender_id);
          unreadRealSenderIds.delete(row.sender_id);
        } else {
          unreadRealSenderIds.add(row.sender_id);
        }

        updateChatDot();
        if (typeof renderChatList === "function" && chatListView && !chatListView.hidden) renderChatList();
      })
    .subscribe();
}

function updateChatDot() {
  const hasUnreadReal = unreadRealSenderIds.size > 0;
  const hasUnreadDemo = getUnreadDemoSet().size > 0;
  chatDot.hidden = !(hasUnreadReal || hasUnreadDemo);
}

/* ===================== ЧАТИ ===================== */

const chatListItems = document.getElementById("chatListItems");
const chatsEmpty = document.getElementById("chatsEmpty");
const chatListView = document.getElementById("chatListView");
const chatThreadView = document.getElementById("chatThreadView");

function allMatchIds() {
  return [...matches, ...realMatches];
}

/* ---------- АРХІВ ЧАТІВ (локально, окремо для кожного акаунту на пристрої) ---------- */

let chatsViewMode = "active"; // "active" | "archived"

function archivedChatsKey() {
  const me = currentMe();
  return "nalyvay_archived_matches_" + (me && me.id ? me.id : "guest");
}

function getArchivedIds() {
  return get(archivedChatsKey(), []);
}

function toggleArchive(id) {
  const ids = getArchivedIds();
  const idx = ids.indexOf(id);
  if (idx === -1) ids.push(id); else ids.splice(idx, 1);
  set(archivedChatsKey(), ids);
  renderChatList();
}

document.querySelectorAll(".chats-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".chats-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    chatsViewMode = tab.dataset.chatsTab;
    renderChatList();
  });
});

function renderChatList() {
  chatListItems.innerHTML = "";

  const archived = getArchivedIds();
  const ids = allMatchIds().filter(id =>
    chatsViewMode === "archived" ? archived.includes(id) : !archived.includes(id)
  );

  chatsEmpty.hidden = ids.length > 0;
  chatsEmpty.innerHTML = chatsViewMode === "archived"
    ? "Архів порожній."
    : "Поки що немає метчів.<br>Свайпни когось вправо 🍾";

  const demoChats = get(LS.chats, {});
  const unreadDemo = getUnreadDemoSet();

  ids.forEach(id => {
    const profile = findProfileById(id);
    if (!profile) return;

    const isReal = isRealProfile(profile);
    const isUnread = isReal ? unreadRealSenderIds.has(id) : unreadDemo.has(id);
    const previewText = isReal
      ? "Натисни, щоб відкрити переписку"
      : ((demoChats[id] && demoChats[id][demoChats[id].length - 1]?.text) || "Кажи привіт!");

    const row = document.createElement("div");
    row.className = "chat-row" + (isUnread ? " chat-row-unread" : "");
    row.innerHTML = `
      <div class="chat-avatar">${profile.photo ? `<img src="${profile.photo}" alt="${escapeHtml(profile.name)}">` : profile.avatar}</div>
      <div class="chat-meta">
        <p class="chat-name">${escapeHtml(profile.name)}${isUnread ? ' <span class="chat-unread-dot" aria-label="непрочитане"></span>' : ''}</p>
        <p class="chat-preview">${escapeHtml(previewText)}</p>
      </div>
      <button type="button" class="chat-archive-btn" title="${chatsViewMode === "archived" ? "Повернути в чати" : "Архівувати"}">
        ${chatsViewMode === "archived" ? "↩" : "🗄"}
      </button>
    `;

    // клік по всьому рядку відкриває переписку, ОКРІМ кліку по кнопці архіву —
    // stopPropagation на кнопці не дає цьому кліку "провалитись" на row
    row.querySelector(".chat-archive-btn").addEventListener("click", e => {
      e.stopPropagation();
      toggleArchive(id);
    });
    row.addEventListener("click", () => openThread(id));

    chatListItems.appendChild(row);
  });
}

let messagesRealtimeChannel = null;

function openThread(id) {
  const profile = findProfileById(id);
  if (!profile) return;

  chatListView.hidden = true;
  chatThreadView.hidden = false;

  const threadHeader = document.getElementById("threadHeader");
  threadHeader.innerHTML = `
    <div class="thread-header-avatar">${profile.photo ? `<img src="${profile.photo}" alt="${escapeHtml(profile.name)}">` : profile.avatar}</div>
    <div class="thread-header-meta">
      <span class="thread-header-name">${escapeHtml(profile.name)}</span>
      <span class="thread-header-hint">переглянути анкету →</span>
    </div>
  `;
  // onclick (а не addEventListener) — щоб при повторних відкриттях чату
  // (той самий DOM-елемент, лише innerHTML міняється) не накопичувались
  // старі обробники на попередніх співрозмовників
  threadHeader.onclick = () => showProfileCardModal(profile, profile.name);

  chatThreadView.dataset.activeId = id;
  chatThreadView.dataset.isReal = isRealProfile(profile) ? "1" : "0";

  if (isRealProfile(profile)) {
    // відкрили чат із реальною людиною — позначаємо його прочитаним і одразу
    // ховаємо крапку, якщо інших непрочитаних більше немає
    setLastSeenNow(id);
    unreadRealSenderIds.delete(id);
    updateChatDot();
    renderChatList();

    loadRealMessages(id);
    subscribeToMessages(id);
  } else {
    markDemoRead(id);
    updateChatDot();
    renderChatList();

    if (messagesRealtimeChannel && supabaseClient) {
      supabaseClient.removeChannel(messagesRealtimeChannel);
      messagesRealtimeChannel = null;
    }
    renderDemoThreadMessages(id);
  }
}

/* ---------- РЕАЛЬНІ ПОВІДОМЛЕННЯ (Supabase) ---------- */

async function loadRealMessages(otherId) {
  const wrap = document.getElementById("threadMessages");
  wrap.innerHTML = `<p style="color:var(--text-dim);font-size:12px;text-align:center;">Завантаження…</p>`;

  const me = currentMe();
  if (!supabaseClient || !me || !me.id) return;

  const { data, error } = await supabaseClient
    .from("messages")
    .select("id,sender_id,receiver_id,text,created_at")
    .or(`and(sender_id.eq.${me.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${me.id})`)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Supabase select messages error:", error);
    wrap.innerHTML = `<p style="color:var(--red);font-size:12px;text-align:center;">Не вдалося завантажити переписку.</p>`;
    return;
  }

  renderRealMessages(data || [], me.id);
}

function renderRealMessages(rows, myId) {
  const wrap = document.getElementById("threadMessages");
  wrap.innerHTML = rows.length
    ? rows.map(m => `<div class="msg ${m.sender_id === myId ? "msg-me" : "msg-them"}">${escapeHtml(m.text)}</div>`).join("")
    : `<p style="color:var(--text-dim);font-size:12px;text-align:center;">Повідомлень ще немає. Напиши перший(-а) 👋</p>`;
  wrap.scrollTop = wrap.scrollHeight;
}

function subscribeToMessages(otherId) {
  if (!supabaseClient) return;
  const me = currentMe();
  if (!me || !me.id) return;

  if (messagesRealtimeChannel) {
    supabaseClient.removeChannel(messagesRealtimeChannel);
    messagesRealtimeChannel = null;
  }

  messagesRealtimeChannel = supabaseClient
    .channel("messages-" + me.id + "-" + otherId)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `sender_id=eq.${otherId}` },
      payload => {
        const row = payload.new;
        if (row.receiver_id !== me.id) return;
        if (chatThreadView.dataset.activeId !== otherId) return;

        const wrap = document.getElementById("threadMessages");
        const placeholder = wrap.querySelector("p");
        if (placeholder) wrap.innerHTML = "";

        const div = document.createElement("div");
        div.className = "msg msg-them";
        div.textContent = row.text;
        wrap.appendChild(div);
        wrap.scrollTop = wrap.scrollHeight;

        // чат зараз відкритий і видимий — одразу позначаємо прочитаним
        setLastSeenNow(otherId);
        unreadRealSenderIds.delete(otherId);
        updateChatDot();
      })
    .subscribe();
}

/* ---------- ДЕМО-ЧАТ (лише для тестових SEED_PROFILES, не для реальних людей) ---------- */

function renderDemoThreadMessages(id) {
  const chats = get(LS.chats, {});
  const thread = chats[id] || [];
  const wrap = document.getElementById("threadMessages");
  wrap.innerHTML = thread.map(m => `
    <div class="msg ${m.from === "me" ? "msg-me" : "msg-them"}">${escapeHtml(m.text)}</div>
  `).join("");
  wrap.scrollTop = wrap.scrollHeight;
}

document.getElementById("backToChats").addEventListener("click", () => {
  chatThreadView.hidden = true;
  chatListView.hidden = false;
  renderChatList();
});

document.getElementById("threadForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = chatThreadView.dataset.activeId;
  const isReal = chatThreadView.dataset.isReal === "1";
  const input = document.getElementById("threadInput");
  const text = input.value.trim();
  if (!text || !id) return;

  if (isReal) {
    const me = currentMe();
    if (!supabaseClient || !me || !me.id) {
      alert("Потрібно увійти, щоб писати повідомлення.");
      return;
    }

    input.value = "";
    const wrap = document.getElementById("threadMessages");
    const placeholder = wrap.querySelector("p");
    if (placeholder) wrap.innerHTML = "";

    const div = document.createElement("div");
    div.className = "msg msg-me";
    div.textContent = text;
    wrap.appendChild(div);
    wrap.scrollTop = wrap.scrollHeight;

    const { error } = await supabaseClient.from("messages").insert({
      sender_id: me.id,
      receiver_id: id,
      text
    });

    if (error) {
      console.error("Supabase insert message error:", error);
      div.style.opacity = "0.5";
      div.title = "Не надіслано: " + error.message;
    }
  } else {
    // тестовий бот (демо-анкета) — повідомлення лишається лише локально, без автовідповіді
    const chats = get(LS.chats, {});
    chats[id] = chats[id] || [];
    chats[id].push({ from: "me", text });
    set(LS.chats, chats);
    input.value = "";
    renderDemoThreadMessages(id);
  }
});

/* ===================== КАРТА ЗАКЛАДІВ ===================== */

let map;
let userLocationMarker = null;

/* Реальні заклади Черкас (назва, категорія, адреса, координати, години
   роботи) — стартовий список. Люди можуть додавати свої заклади кліком
   на мапу (як і раніше), ці додані заклади зберігаються в localStorage
   разом із цим стартовим списком. */
const REAL_PLACES_SEED = [
  // --- бари ---
  { id: "escobar-club", category: "bar", name: "Escobar club", address: "вул. Остафія Дашкевича, 19", lat: 49.4449748, lng: 32.0650723, hours: "10:00–01:00 (Пт–Сб цілодобово)" },
  { id: "tooman-lounge", category: "bar", name: "Tooman Lounge Bar", address: "вул. Хрещатик, 200", lat: 49.4421994, lng: 32.065235, hours: "10:00–00:00" },
  { id: "oblako-bar", category: "bar", name: "Oblako", address: "б-р Шевченка, 150", lat: 49.4498684, lng: 32.0478299, hours: "13:00–23:00" },
  { id: "roof-bar", category: "bar", name: "Roof Bar", address: "б-р Шевченка, 205", lat: 49.4418574, lng: 32.0647867, hours: "14:00–00:00 (Сб–Нд з 10:00)" },
  { id: "bierstube", category: "bar", name: "Bierstube", address: "вул. Хрещатик, 225", lat: 49.4455271, lng: 32.0628543, hours: "09:00–23:00" },
  { id: "oskar-pub", category: "bar", name: "Oskar (пивний паб)", address: "б-р Шевченка, 150", lat: 49.4497816, lng: 32.047608, hours: "11:00–22:00" },
  { id: "monika-2049", category: "bar", name: "Lounge bar MONIKA.2049", address: "вул. Смілянська, 2", lat: 49.4444531, lng: 32.0681076, hours: "09:30–23:00" },

  // --- кафе ---
  { id: "morris-space", category: "cafe", name: "Morris Space", address: "вул. Симоненка, 1", lat: 49.4419094, lng: 32.0624808, hours: "09:00–21:00" },
  { id: "the-room", category: "cafe", name: "The Room", address: "вул. Хрещатик, 188", lat: 49.4461896, lng: 32.06054, hours: "08:00–22:00" },
  { id: "caffeine", category: "cafe", name: "Caffeine", address: "б-р Шевченка, 83", lat: 49.4523140, lng: 32.045766, hours: "08:30–21:00" },
  { id: "varenychna", category: "cafe", name: "Вареничная", address: "вул. Небесної Сотні, 10", lat: 49.4404105, lng: 32.0676891, hours: "11:00–21:00" },
  { id: "bohema-cafe", category: "cafe", name: "Кафе BOHEMA на Хрещатику", address: "вул. Хрещатик, 200", lat: 49.4430385, lng: 32.0655079, hours: "08:00–23:00" },
  { id: "bochka", category: "cafe", name: "Бочка", address: "вул. Князя Ольгерда", lat: 49.4633856, lng: 32.036464, hours: "цілодобово" },

  // --- ресторани ---
  { id: "restaurant-1909", category: "restaurant", name: "Restaurant 1909", address: "вул. Остафія Дашкевича, 20", lat: 49.4451829, lng: 32.063071, hours: "08:00–22:00" },
  { id: "servant", category: "restaurant", name: "Servant", address: "вул. Гоголя, 242", lat: 49.4412227, lng: 32.0588857, hours: "11:00–22:30" },
  { id: "cosa-nostra", category: "restaurant", name: "Cosa Nostra", address: "б-р Шевченка, 108", lat: 49.4528714, lng: 32.0431065, hours: "10:30–23:00" },
  { id: "faro-del-porto", category: "restaurant", name: "Faro del Porto", address: "вул. Козацька, 2", lat: 49.4382345, lng: 32.1005106, hours: "11:00–23:00" },
  { id: "chacha", category: "restaurant", name: "Chacha (грузинський ресторан)", address: "вул. Хрещатик, 200", lat: 49.4428071, lng: 32.0654327, hours: "11:00–22:00" },
  { id: "forest", category: "restaurant", name: "Forest", address: "вул. П. Куліша, 25", lat: 49.4590028, lng: 32.0337399, hours: "12:00–22:00" },
  { id: "escobar-restaurant", category: "restaurant", name: "Escobar (ресторан)", address: "вул. Остафія Дашкевича", lat: 49.4450131, lng: 32.0650319, hours: "10:00–04:00" },

  // --- пляжі ---
  { id: "pushkinskyi-beach", category: "beach", name: "Пушкінський пляж", address: "Пушкінський пляж", lat: 49.4566408, lng: 32.0572392, hours: "без обмежень" },
  { id: "zhyvchyk", category: "beach", name: "Живчик (пляж)", address: "вул. Героїв Дніпра", lat: 49.4397226, lng: 32.0839388, hours: "06:00–20:00" },
  { id: "sosnovyi-bir-beach", category: "beach", name: "Пляж «Сосновий Бір»", address: "вул. Князя Ольгерда, 3", lat: 49.4645539, lng: 32.0349144, hours: "без обмежень" },
  { id: "dakhnivskyi-beach", category: "beach", name: "Дахнівський пляж", address: "вул. Сержанта Волкова, 187", lat: 49.4831326, lng: 31.9989821, hours: "06:00–20:00" }
];

function seedPlaces() {
  const seed = REAL_PLACES_SEED.map(p => ({ ...p, reviews: [] }));
  set(LS.places, seed);
  return seed;
}

function loadOrSeedPlaces() {
  const existing = get(LS.places, null);

  if (!existing || !Array.isArray(existing) || existing.length === 0) {
    return seedPlaces();
  }

  // старий демо-список ("Бар «Хвиля»", "Craft Room") не мав поля category —
  // якщо все, що є в localStorage, без category, це старий кеш, замінюємо
  // його реальним списком закладів
  const isOldDemoOnly = existing.every(p => !p.category);
  if (isOldDemoOnly) {
    return seedPlaces();
  }

  return existing;
}

let places = loadOrSeedPlaces();
let markersById = {};
let activePlaceId = null;
let pendingNewCoords = null;
let placesCategoryFilter = "all"; // "all" | "bar" | "cafe" | "restaurant" | "beach"

function categoryIcon(category) {
  switch (category) {
    case "bar": return "🍸";
    case "cafe": return "☕";
    case "restaurant": return "🍽";
    case "beach": return "🏖";
    default: return "📍";
  }
}

function categoryLabel(category) {
  switch (category) {
    case "bar": return "бар";
    case "cafe": return "кафе";
    case "restaurant": return "ресторан";
    case "beach": return "пляж";
    default: return "заклад";
  }
}

function initMap() {
  map = L.map("map", { zoomControl: true }).setView([49.4444, 32.0598], 13);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: "abcd", maxZoom: 19
  }).addTo(map);

  showMyLocationOnMap();

  places.forEach(addMarkerForPlace);
  renderPlacesList();

  map.on("click", e => {
    pendingNewCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
    activePlaceId = null;
    openPlaceModal();
  });
}

/* Високоточна геолокація: enableHighAccuracy вмикає GPS-чип пристрою
   (замість дешевшого, але менш точного визначення по вишках/Wi-Fi),
   maximumAge:0 забороняє браузеру віддати старий закешований результат */
const HIGH_ACCURACY_GEO_OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };

let userLocationAccuracyCircle = null;

/* Показує позначку "Ви тут" на мапі й центрує на ній вид. Викликається
   при відкритті мапи, і повторно з myLocationBadge (кнопка в хедері). */
function showMyLocationOnMap(recenter) {
  if (!navigator.geolocation || !map) return;

  navigator.geolocation.getCurrentPosition(pos => {
    const latlng = [pos.coords.latitude, pos.coords.longitude];
    const accuracy = Math.round(pos.coords.accuracy || 0);

    if (userLocationMarker) {
      userLocationMarker.setLatLng(latlng);
    } else {
      userLocationMarker = L.marker(latlng, {
        icon: L.divIcon({
          className: "",
          html: `<div class="my-location-dot"></div>`,
          iconSize: [18, 18], iconAnchor: [9, 9]
        }),
        zIndexOffset: 1000
      }).addTo(map);
    }
    userLocationMarker.bindPopup(`Ви тут (± ${accuracy} м)`);

    // коло похибки — наочно показує, наскільки точне визначення:
    // маленьке коло (GPS, десятки метрів) чи велике (по Wi-Fi/вишках, сотні метрів-кілометри)
    if (userLocationAccuracyCircle) map.removeLayer(userLocationAccuracyCircle);
    userLocationAccuracyCircle = L.circle(latlng, {
      radius: accuracy, color: "#e0b2a2", weight: 1, fillColor: "#e0b2a2", fillOpacity: 0.08
    }).addTo(map);

    if (recenter !== false) map.setView(latlng, 14);
  }, () => {}, HIGH_ACCURACY_GEO_OPTIONS);
}

function neonIcon(category) {
  return L.divIcon({
    className: "",
    html: `<div style="font-size:26px; filter:drop-shadow(0 0 6px rgba(45,255,160,0.8));">${categoryIcon(category)}</div>`,
    iconSize: [26, 26], iconAnchor: [13, 22]
  });
}

function addMarkerForPlace(place) {
  const marker = L.marker([place.lat, place.lng], { icon: neonIcon(place.category) }).addTo(map);
  marker.on("click", () => {
    activePlaceId = place.id; pendingNewCoords = null; openPlaceModal();
  });
  markersById[place.id] = marker;
}

document.querySelectorAll(".places-category-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".places-category-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    placesCategoryFilter = tab.dataset.category;
    renderPlacesList();

    // на мапі теж лишаємо тільки заклади обраної категорії
    Object.values(markersById).forEach(m => map.removeLayer(m));
    markersById = {};
    places
      .filter(p => placesCategoryFilter === "all" || p.category === placesCategoryFilter)
      .forEach(addMarkerForPlace);
  });
});

function renderPlacesList() {
  const wrap = document.getElementById("placesListItems");
  wrap.innerHTML = "";

  const filtered = places.filter(p => placesCategoryFilter === "all" || p.category === placesCategoryFilter);

  if (filtered.length === 0) {
    wrap.innerHTML = `<p class="places-empty">Тут поки нічого немає. Клікни на мапу, щоб додати заклад.</p>`;
    return;
  }

  filtered.forEach(p => {
    const item = document.createElement("div");
    item.className = "place-item";
    item.innerHTML = `
      <div class="place-item-main">
        <span class="place-item-name">${categoryIcon(p.category)} ${escapeHtml(p.name)}</span>
        <span class="place-item-address">${escapeHtml(p.address || "")}</span>
        ${p.hours ? `<span class="place-item-hours">🕒 ${escapeHtml(p.hours)}</span>` : ""}
      </div>
      <span class="place-item-meta">${(p.reviews || []).length} відгук(ів)</span>
    `;
    item.addEventListener("click", () => {
      map.setView([p.lat, p.lng], 16);
      activePlaceId = p.id; pendingNewCoords = null; openPlaceModal();
    });
    wrap.appendChild(item);
  });
}

/* ---------- модалка закладу ---------- */

const placeModalOverlay = document.getElementById("placeModalOverlay");
const placeModalTitle = document.getElementById("placeModalTitle");
const placeModalEyebrow = document.getElementById("placeModalEyebrow");
const placeModalMeta = document.getElementById("placeModalMeta");
const placeNewFields = document.getElementById("placeNewFields");
const newPlaceNameInput = document.getElementById("newPlaceName");
const reviewsList = document.getElementById("reviewsList");

function openPlaceModal() {
  placeModalOverlay.hidden = false;
  if (activePlaceId) {
    const place = places.find(p => p.id === activePlaceId);
    placeModalEyebrow.textContent = categoryLabel(place.category);
    placeModalTitle.textContent = place.name;
    placeModalMeta.hidden = false;
    placeModalMeta.innerHTML = `
      ${place.address ? `<p class="place-meta-line">📍 ${escapeHtml(place.address)}</p>` : ""}
      ${place.hours ? `<p class="place-meta-line place-meta-hours">🕒 ${escapeHtml(place.hours)}</p>` : ""}
    `;
    placeNewFields.hidden = true;
    renderReviews(place);
  } else {
    placeModalEyebrow.textContent = "новий заклад";
    placeModalTitle.textContent = "Додай назву та перший відгук";
    placeModalMeta.hidden = true;
    placeModalMeta.innerHTML = "";
    placeNewFields.hidden = false;
    newPlaceNameInput.value = "";
    reviewsList.innerHTML = `<p class="no-reviews">Тут з'являться відгуки після першого запису.</p>`;
  }
}

function closePlaceModal() {
  placeModalOverlay.hidden = true;
}

document.getElementById("placeModalCloseBtn").addEventListener("click", closePlaceModal);
placeModalOverlay.addEventListener("click", e => {
  if (e.target === placeModalOverlay) closePlaceModal();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !placeModalOverlay.hidden) closePlaceModal();
});


function renderReviews(place) {
  if (place.reviews.length === 0) {
    reviewsList.innerHTML = `<p class="no-reviews">Ще немає відгуків. Будь першим!</p>`; return;
  }
  reviewsList.innerHTML = place.reviews.map(r => `
    <div class="review-item">
      <span class="review-author">${escapeHtml(r.author)}</span>
      <span class="review-rating">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
      <p class="review-text">${escapeHtml(r.text)}</p>
    </div>
  `).join("");
}

document.getElementById("reviewForm").addEventListener("submit", e => {
  e.preventDefault();
  const me = currentMe() || {};
  const author = me.name || "Гість";
  const text = document.getElementById("reviewText").value.trim();
  const rating = Number(document.getElementById("reviewRating").value);

  if (activePlaceId) {
    const place = places.find(p => p.id === activePlaceId);
    place.reviews.push({ author, rating, text });
  } else {
    const name = newPlaceNameInput.value.trim();
    if (!name) { newPlaceNameInput.focus(); return; }
    const newPlace = { id: cryptoId(), name, lat: pendingNewCoords.lat, lng: pendingNewCoords.lng, reviews: [{ author, rating, text }] };
    places.push(newPlace);
    addMarkerForPlace(newPlace);
    activePlaceId = newPlace.id;
    pendingNewCoords = null;
  }
  set(LS.places, places);
  renderPlacesList();
  renderReviews(places.find(p => p.id === activePlaceId));
  e.target.reset();
});

/* ===================== ПРОФІЛЬ ===================== */

document.getElementById("pPhoto").addEventListener("change", async e => {
  const photo = await readPhotoFile(e.target);
  if (photo) renderAvatarPreview({ photo });
});

document.getElementById("profileForm").addEventListener("submit", async e => {
  e.preventDefault();
  const me = currentMe() || {};
  const newPhoto = await readPhotoFile(document.getElementById("pPhoto"));
  const updated = {
    ...me,
    name: document.getElementById("pName").value.trim(),
    age: Number(document.getElementById("pAge").value),
    type: document.getElementById("pType").value,
    gender: document.getElementById("pGender").value,
    language: document.getElementById("pLanguage").value,
    settlementType: document.getElementById("pSettlementType").value,
    settlementName: document.getElementById("pSettlementName").value.trim(),
    drinks: document.getElementById("pDrinks").value.trim(),
    food: document.getElementById("pFood").value.trim(),
    favoritePlace: document.getElementById("pFavPlace").value.trim(),
    hobbies: document.getElementById("pHobbies").value.trim(),
    bio: document.getElementById("pBio").value.trim(),
    online: document.getElementById("onlineToggle").checked,
    avatar: me.avatar || "🙂",
    photo: newPhoto || me.photo || null
  };

  set(LS.me, updated);
  renderAvatarPreview(updated);

  const note = document.getElementById("saveNote");

  if (updated.id) {
    const { error } = await saveProfileToSupabase(updated);

    if (error) {
      note.textContent = "Збережено локально, але не в базі: " + error.message;
      note.hidden = false;
      setTimeout(() => { note.hidden = true; note.textContent = "Збережено ✓"; }, 3200);
    } else {
      note.textContent = "Збережено ✓";
      note.hidden = false;
      setTimeout(() => note.hidden = true, 1800);

      if (typeof refreshRemoteProfiles === "function") refreshRemoteProfiles();
    }
  } else {
    console.warn("У профілю ще немає id (Email не підтверджено) — зміни збережено лише локально.");
    note.textContent = "Збережено ✓";
    note.hidden = false;
    setTimeout(() => note.hidden = true, 1800);
  }
});

/* ---------- ПРЕВ'Ю АНКЕТИ (власної й співрозмовника з чату) ---------- */

const previewModalOverlay = document.getElementById("previewModalOverlay");
const previewModalTitle = document.getElementById("previewModalTitle");
const previewCardWrap = document.getElementById("previewCardWrap");

/* Спільна функція показу картки будь-якої анкети в модалці — використовується
   і для "Прев'ю анкети" на своєму профілі, і для перегляду анкети
   співрозмовника кліком на шапку чату. */
function showProfileCardModal(profile, titleText) {
  if (previewModalTitle) previewModalTitle.textContent = titleText || "Анкета";
  previewCardWrap.innerHTML = "";
  previewCardWrap.appendChild(buildCard(profile));
  previewModalOverlay.hidden = false;
}

function buildGeoFromForm() {
  const settlementName = document.getElementById("pSettlementName").value.trim();
  const settlementType = document.getElementById("pSettlementType").value;
  if (!settlementName) return "Локація не вказана";
  return settlementType && settlementType !== "Місто" ? `${settlementName} (${settlementType})` : settlementName;
}

function renderPreviewCard() {
  const me = currentMe() || {};
  const avatarEl = document.getElementById("avatarPreview");
  const imgEl = avatarEl.querySelector("img");
  const photo = imgEl ? imgEl.getAttribute("src") : (me.photo || null);

  const previewProfile = {
    id: "preview",
    name: document.getElementById("pName").value.trim() || "Без імені",
    type: document.getElementById("pType").value,
    gender: document.getElementById("pGender").value,
    language: document.getElementById("pLanguage").value,
    geo: buildGeoFromForm(),
    online: document.getElementById("onlineToggle").checked,
    avatar: me.avatar || "🙂",
    photo,
    drinks: document.getElementById("pDrinks").value.trim() || "Не вказано",
    food: document.getElementById("pFood").value.trim() || "Не вказано",
    favoritePlace: document.getElementById("pFavPlace").value.trim(),
    bio: document.getElementById("pBio").value.trim() || "Опис ще не додано.",
    verified: !!me.verified
  };

  showProfileCardModal(previewProfile, "Так тебе бачать інші");
}

document.getElementById("previewBtn").addEventListener("click", renderPreviewCard);
document.getElementById("previewModalCloseBtn").addEventListener("click", () => previewModalOverlay.hidden = true);
previewModalOverlay.addEventListener("click", e => {
  if (e.target === previewModalOverlay) previewModalOverlay.hidden = true;
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !previewModalOverlay.hidden) previewModalOverlay.hidden = true;
});

/* ---------- ВИХІД / ВИДАЛЕННЯ АНКЕТИ ---------- */

function clearLocalIdentityData() {
  [LS.me, LS.swipes, LS.matches, LS.chats, "nalyvay_pending_registration"]
    .forEach(k => localStorage.removeItem(k));
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    if (!confirm("Вийти з акаунту на цьому пристрої?")) return;

    if (supabaseClient) {
      try { await supabaseClient.auth.signOut(); }
      catch (err) { console.error("Supabase signOut error:", err); }
    }

    clearLocalIdentityData();
    window.location.reload();
  });
}

const deleteProfileBtn = document.getElementById("deleteProfileBtn");
if (deleteProfileBtn) {
  deleteProfileBtn.addEventListener("click", async () => {
    const me = currentMe();

    if (!me || !me.id) {
      alert("Немає активної анкети для видалення.");
      return;
    }

    const sure = confirm(
      "Це видалить твою анкету назавжди — інші люди більше не побачать її в застосунку. " +
      "Дію не можна скасувати. Продовжити?"
    );
    if (!sure) return;

    if (supabaseClient) {
      // видаляємо рядок анкети з public.profiles — саме він показується
      // іншим людям у колоді/списку, тож видалення прибирає анкету з застосунку
      const { error } = await supabaseClient
        .from(PROFILE_TABLE)
        .delete()
        .eq("id", me.id);

      if (error) {
        console.error("Supabase delete profile error:", error);
        alert("Не вдалося видалити анкету з бази: " + error.message + ". Спробуй ще раз.");
        return;
      }

      try { await supabaseClient.auth.signOut(); }
      catch (err) { console.error("Supabase signOut error:", err); }
    }

    clearLocalIdentityData();
    window.location.reload();
  });
}

/* ---------- геолокація ---------- */

const myLocationBadge = document.getElementById("myLocationBadge");
myLocationBadge.addEventListener("click", () => {
  if (!navigator.geolocation) {
    myLocationBadge.textContent = "📍 геолокація недоступна";
    return;
  }
  myLocationBadge.textContent = "📍 визначаємо…";
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude.toFixed(5);
    const lng = pos.coords.longitude.toFixed(5);
    const accuracy = Math.round(pos.coords.accuracy || 0);
    myLocationBadge.textContent = `📍 ${lat}, ${lng} (±${accuracy}м)`;
    myLocationBadge.classList.add("located");

    if (map) showMyLocationOnMap();
  }, () => {
    myLocationBadge.textContent = "📍 доступ не надано";
  }, HIGH_ACCURACY_GEO_OPTIONS);
});

/* ===================== СТАРТ ===================== */

rebuildQueue();
updateChatDot();
