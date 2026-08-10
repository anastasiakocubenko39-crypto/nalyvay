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

// Заставка автоматично зникає через 1 секунду
if (introOverlay) {
  setTimeout(hideIntro, 1000);
}

// Якщо відео не завантажилось — показуємо логотип,
// але заставка все одно зникне через 1 секунду
if (introVideo) {
  introVideo.addEventListener("error", () => {
    introVideo.hidden = true;

    if (introLogoFallback) {
      introLogoFallback.hidden = false;
    }
  });
}


/* ===================== СХОВИЩЕ ===================== */

const LS = {
  me: "nalyvay_me_v2",
  swipes: "nalyvay_swipes",
  matches: "nalyvay_matches",
  chats: "nalyvay_chats",
  places: "nalyvay_places_v2"
};


/* ===================== SUPABASE ===================== */

const SUPABASE_URL =
  "https://yecjmwgmfwqgxbiggeby.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_DIBPiv-9rJowQacsgEBMAw_8GvIxboP";

/* ВИПРАВЛЕНО (аудит форми реєстрації):
   Якщо бібліотека Supabase (CDN-скрипт @supabase/supabase-js) з будь-якої
   причини не встигла завантажитись до цього рядка — window.supabase.createClient
   кидав TypeError. Ця помилка була НЕОБРОБЛЕНОЮ і зупиняла виконання
   ВСЬОГО script.js нижче по файлу, включно з regForm.addEventListener("submit", ...).
   Через це обробник форми реєстрації ніколи не приєднувався, і кнопка
   "Почати знайомитись" відправляла форму нативно — сторінка перезавантажувалась,
   введені дані зникали, лист не надсилався.
   Тепер помилка ловиться, у консоль виводиться зрозуміла причина,
   а supabaseClient лишається null — решта скрипта (навігація, карта, чати,
   профіль тощо) продовжує працювати як і раніше. */
let supabaseClient = null;

try {
  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );
} catch (err) {
  console.error(
    "Не вдалося ініціалізувати Supabase client (CDN не завантажився чи заблокований мережею):",
    err
  );
}


function cryptoId() {
  return "id-" +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36);
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


/* ===================== ФОТО ===================== */

function readPhotoFile(inputEl) {
  return new Promise(resolve => {
    const file =
      inputEl &&
      inputEl.files &&
      inputEl.files[0];

    if (!file) {
      resolve(null);
      return;
    }

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
  if (regOverlay) {
    regOverlay.hidden = true;
  }

  fillProfileFormFromMe();
}

function renderAvatarPreview(me) {
  const el = document.getElementById("avatarPreview");

  if (!el) return;

  if (me && me.photo) {
    el.innerHTML =
      `<img src="${me.photo}" alt="Фото профілю">`;
  } else {
    el.textContent =
      (me && me.avatar) || "🙂";
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

    if (el) {
      el.value = value;
    }
  });

  const onlineToggle =
    document.getElementById("onlineToggle");

  if (onlineToggle) {
    onlineToggle.checked = me.online !== false;
  }

  renderAvatarPreview(me);
}


/* ===================== ВІДПРАВКА EMAIL ===================== */

let pendingRegistration = null;

if (regForm) {

  regForm.addEventListener("submit", async e => {

    e.preventDefault();

    /* ВИПРАВЛЕНО (аудит форми реєстрації):
       Додаткова страховка — навіть якщо supabaseClient з якоїсь причини
       не ініціалізувався (див. блок SUPABASE вище), обробник submit усе одно
       приєднаний і e.preventDefault() уже спрацював, тобто сторінка НЕ
       перезавантажиться. Але без клієнта Supabase лист відправити неможливо,
       тож користувачу одразу показується зрозуміле повідомлення замість
       мовчазного нічого-не-відбувається. */
    if (!supabaseClient) {
      alert(
        "Сервіс реєстрації тимчасово недоступний (не вдалося з'єднатись із Supabase). " +
        "Онови сторінку і спробуй ще раз."
      );
      return;
    }

    const email =
      document.getElementById("regEmail").value.trim();

    if (!email) {
      alert("Введи Email");
      return;
    }

    const photo =
      await readPhotoFile(
        document.getElementById("regPhoto")
      );

    pendingRegistration = {
      name:
        document.getElementById("regName").value.trim(),

      email: email,

      age:
        Number(
          document.getElementById("regAge").value
        ),

      type:
        document.getElementById("regType").value,

      gender:
        document.getElementById("regGender").value,

      language:
        document.getElementById("regLanguage").value,

      settlementType:
        document.getElementById("regSettlementType").value,

      settlementName:
        document
          .getElementById("regSettlementName")
          .value
          .trim(),

      drinks:
        document.getElementById("regDrinks").value.trim(),

      food:
        document.getElementById("regFood").value.trim(),

      favoritePlace:
        document
          .getElementById("regFavPlace")
          .value
          .trim(),

      hobbies:
        document
          .getElementById("regHobbies")
          .value
          .trim(),

      bio:
        document
          .getElementById("regBio")
          .value
          .trim(),

      online: true,
      avatar: "🙂",
      photo: photo || null,
      verified: false
    };


    /* ВАЖЛИВО:
       Зберігаємо анкету перед переходом
       користувача в Email.
    */

    localStorage.setItem(
      "nalyvay_pending_registration",
      JSON.stringify(pendingRegistration)
    );


    /* Відправляємо Magic Link */

    const { error } =
      await supabaseClient.auth.signInWithOtp({

        email: email,

        options: {
          shouldCreateUser: true,

          emailRedirectTo:
            "https://anastasiakocubenko39-crypto.github.io/nalyvay/"
        }

      });


    /* Якщо Supabase повернув помилку */

    if (error) {

      console.error(
        "Supabase email error:",
        error
      );

      alert(
        "Не вдалося надіслати лист: " +
        error.message
      );

      return;
    }


    /* Показуємо повідомлення */

    const confirmMessage =
      document.getElementById(
        "emailConfirmMessage"
      );

    const confirmAddress =
      document.getElementById(
        "emailConfirmAddress"
      );


    if (confirmAddress) {
      confirmAddress.textContent = email;
    }


    if (confirmMessage) {
      confirmMessage.hidden = false;
    }


    /* Ховаємо кнопку,
       щоб не відправляти багато листів */

    const submitButton =
      regForm.querySelector(
        'button[type="submit"]'
      );

    if (submitButton) {
      submitButton.hidden = true;
    }

  });

}


/* ===================== ПЕРЕВІРКА EMAIL ===================== */

async function checkEmailConfirmation() {

  try {

    const {
      data: { session },
      error
    } =
      await supabaseClient.auth.getSession();


    if (error) {

      console.error(
        "Помилка отримання сесії:",
        error
      );

      return;
    }


    /* Користувач ще не підтвердив Email */

    if (!session || !session.user) {
      return;
    }


    /* Беремо збережену анкету */

    const pending =
      localStorage.getItem(
        "nalyvay_pending_registration"
      );


    if (!pending) {
      return;
    }


    const registration =
      JSON.parse(pending);


    /* Email підтверджений */

    registration.email =
      session.user.email;

    registration.verified = true;


    /* Створюємо профіль */

    set(
      LS.me,
      registration
    );


    /* Тимчасові дані більше не потрібні */

    localStorage.removeItem(
      "nalyvay_pending_registration"
    );


    pendingRegistration = null;


    /* Відкриваємо застосунок */

    showApp();


  } catch (error) {

    console.error(
      "Помилка відновлення реєстрації:",
      error
    );

  }

}


/* Перевіряємо, чи повернувся
   користувач після підтвердження Email */

checkEmailConfirmation();

/* ===================== НАВІГАЦІЯ ===================== */

const screens = document.querySelectorAll(".screen");
const navBtns = document.querySelectorAll(".nav-btn");
let mapInitialized = false;

navBtns.forEach(btn=>{
  btn.addEventListener("click", ()=>{
    navBtns.forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    screens.forEach(s=> s.classList.toggle("active", s.id === "screen-" + tab));
    if(tab === "bars"){
      if(!mapInitialized){ initMap(); mapInitialized = true; }
      else setTimeout(()=>map.invalidateSize(), 50);
    }
    if(tab === "chats") renderChatList();
  });
});

/* ===================== РОЗШИРЕНИЙ ПОШУК / ФІЛЬТРИ ===================== */

let filters = {
  type:"all", gender:"all", language:"all",
  minAge:"", maxAge:"", drinks:"", food:"", place:"", settlement:""
};

function matchesFilters(p){
  if(filters.type !== "all" && p.type !== filters.type) return false;
  if(filters.gender !== "all"){
    if(!p.gender || p.gender !== filters.gender) return false;
  }
  if(filters.language !== "all" && (p.language || "") !== filters.language) return false;
  if(filters.minAge && p.age < Number(filters.minAge)) return false;
  if(filters.maxAge && p.age > Number(filters.maxAge)) return false;
  if(filters.drinks && !(p.drinks || "").toLowerCase().includes(filters.drinks.toLowerCase())) return false;
  if(filters.food && !(p.food || "").toLowerCase().includes(filters.food.toLowerCase())) return false;
  if(filters.place && !(p.favoritePlace || "").toLowerCase().includes(filters.place.toLowerCase())) return false;
  if(filters.settlement && !(p.geo || "").toLowerCase().includes(filters.settlement.toLowerCase())) return false;
  return true;
}

function hasActiveFilters(){
  return filters.type !== "all" || filters.gender !== "all" || filters.language !== "all" ||
    filters.minAge || filters.maxAge || filters.drinks || filters.food || filters.place || filters.settlement;
}

function updateFilterBtnState(){
  document.getElementById("filterBtn").classList.toggle("active-filters", hasActiveFilters());
}

const filterModalOverlay = document.getElementById("filterModalOverlay");
document.getElementById("filterBtn").addEventListener("click", ()=> filterModalOverlay.hidden = false);
document.getElementById("filterModalCloseBtn").addEventListener("click", ()=> filterModalOverlay.hidden = true);
filterModalOverlay.addEventListener("click", e=>{ if(e.target === filterModalOverlay) filterModalOverlay.hidden = true; });
document.addEventListener("keydown", e=>{
  if(e.key === "Escape" && !filterModalOverlay.hidden) filterModalOverlay.hidden = true;
});

document.querySelectorAll(".chip-row").forEach(row=>{
  row.addEventListener("click", e=>{
    const chip = e.target.closest(".chip");
    if(!chip) return;
    const group = row.dataset.group;
    row.querySelectorAll(".chip").forEach(c=> c.classList.remove("active"));
    chip.classList.add("active");
    filters[group] = chip.dataset.value;
  });
});

document.getElementById("filterForm").addEventListener("submit", e=>{
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

document.getElementById("filterResetBtn").addEventListener("click", ()=>{
  filters = {type:"all", gender:"all", language:"all", minAge:"", maxAge:"", drinks:"", food:"", place:"", settlement:""};
  document.querySelectorAll(".chip-row").forEach(row=>{
    row.querySelectorAll(".chip").forEach(c=> c.classList.toggle("active", c.dataset.value === "all"));
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
/* ВИПРАВЛЕНО (аудит, п.11 запиту):
   У наданих файлах проєкту (index.html + script.js) немає жодного
   <script>, що визначає SEED_PROFILES — а він використовується нижче.
   Якщо на живому сайті такий файл (напр. seed-data.js) підключений
   окремо — цей рядок нічого не змінює, typeof-перевірка його не займає.
   Але якщо файл раптом не підключений/не завантажився — раніше це був
   ReferenceError: SEED_PROFILES is not defined, який зупиняв ВЕСЬ код
   нижче (свайп-колоду, карту, чати, збереження профілю). Тепер у такому
   випадку колода просто буде порожньою, а решта застосунку продовжує
   працювати. */
if (typeof SEED_PROFILES === "undefined") {
  console.error(
    "SEED_PROFILES не знайдено. Переконайся, що файл із анкетами " +
    "(напр. seed-data.js) підключений у index.html ПЕРЕД script.js."
  );
}
const SEED_PROFILES_SAFE =
  (typeof SEED_PROFILES !== "undefined" && Array.isArray(SEED_PROFILES))
    ? SEED_PROFILES
    : [];

let swipes = get(LS.swipes, {});
let matches = get(LS.matches, []);
let queue = SEED_PROFILES_SAFE.filter(p => !(p.id in swipes));

const showPassedBtn = document.getElementById("showPassedBtn");

function hasPassedProfiles(){
  return Object.values(swipes).includes("pass");
}

function rebuildQueue(){
  queue = SEED_PROFILES_SAFE.filter(p => !(p.id in swipes) && matchesFilters(p));
  renderDeck();
}

function renderDeck(){
  deckEl.innerHTML = "";
  deckEmpty.hidden = queue.length > 0;
  showPassedBtn.hidden = !(queue.length === 0 && hasPassedProfiles() && !hasActiveFilters());

  if(queue.length === 0 && hasActiveFilters()){
    deckEmptyText.innerHTML = "Нікого не знайдено за цими фільтрами 🔍<br>Спробуй змінити критерії пошуку.";
  } else {
    deckEmptyText.innerHTML = "Це всі, хто зараз поруч 🍻<br>Заглянь пізніше — з'являться нові.";
  }

  queue.slice(0, 3).reverse().forEach(p=>{
    const card = buildCard(p);
    deckEl.appendChild(card);
  });
  attachDragToTopCard();
}

function buildCard(p){
  const card = document.createElement("div");
  card.className = "swipe-card";
  card.dataset.id = p.id;

  const extraTags = [];
  if(p.gender) extraTags.push(`<span class="card-tag">${p.gender === "жінка" ? "♀" : p.gender === "чоловік" ? "♂" : "⚧"} ${escapeHtml(p.gender)}</span>`);
  if(p.language) extraTags.push(`<span class="card-tag">🗣 ${escapeHtml(p.language)}</span>`);
  if(p.favoritePlace && p.favoritePlace !== "—") extraTags.push(`<span class="card-tag">⭐ ${escapeHtml(p.favoritePlace)}</span>`);

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

function attachDragToTopCard(){
  const cards = deckEl.querySelectorAll(".swipe-card");
  if(cards.length === 0) return;
  const top = cards[cards.length - 1];
  let startX = 0, startY = 0, dx = 0, dragging = false;

  function pointerDown(e){
    dragging = true;
    const point = e.touches ? e.touches[0] : e;
    startX = point.clientX; startY = point.clientY;
    top.style.transition = "none";
  }
  function pointerMove(e){
    if(!dragging) return;
    const point = e.touches ? e.touches[0] : e;
    dx = point.clientX - startX;
    const dy = point.clientY - startY;
    const rotate = dx / 14;
    top.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotate}deg)`;
    top.classList.toggle("swipe-right", dx > 40);
    top.classList.toggle("swipe-left", dx < -40);
    top.querySelector(".stamp-like").style.opacity = Math.min(Math.max(dx/80, 0), 1);
    top.querySelector(".stamp-nope").style.opacity = Math.min(Math.max(-dx/80, 0), 1);
  }
  function pointerUp(){
    if(!dragging) return;
    dragging = false;
    top.style.transition = "transform .25s ease";
    if(dx > 100){ finishSwipe("like"); }
    else if(dx < -100){ finishSwipe("pass"); }
    else{
      top.style.transform = "";
      top.classList.remove("swipe-right","swipe-left");
    }
    dx = 0;
  }

  top.addEventListener("mousedown", pointerDown);
  window.addEventListener("mousemove", pointerMove);
  window.addEventListener("mouseup", pointerUp);
  top.addEventListener("touchstart", pointerDown, {passive:true});
  top.addEventListener("touchmove", pointerMove, {passive:true});
  top.addEventListener("touchend", pointerUp);
}

let isSwiping = false;

function finishSwipe(action){
  if(isSwiping) return;
  const topCard = deckEl.querySelector(".swipe-card:last-child");
  const id = topCard?.dataset.id;
  if(!id) return;
  isSwiping = true;
  const flyX = action === "like" ? 500 : -500;
  if(topCard){
    topCard.style.transform = `translate(${flyX}px, -40px) rotate(${flyX/14}deg)`;
    topCard.style.opacity = "0";
  }
  swipes[id] = action;
  set(LS.swipes, swipes);

 setTimeout(()=>{
    const profile = queue.find(p=>p.id === id);
    queue = queue.filter(p=>p.id !== id);
    renderDeck();
    if(action === "like" && profile){
      registerMatch(profile);
    }
    isSwiping = false;
  }, 220);
}

showPassedBtn.addEventListener("click", ()=>{
  Object.keys(swipes).forEach(id=>{
    if(swipes[id] === "pass") delete swipes[id];
  });
  set(LS.swipes, swipes);
  rebuildQueue();
});
document.getElementById("passBtn")?.addEventListener("click", ()=> finishSwipe("pass"));
document.getElementById("likeBtn")?.addEventListener("click", ()=> finishSwipe("like"));

/* ---------- МЕТЧІ ---------- */

const matchOverlay = document.getElementById("matchOverlay");
const chatDot = document.getElementById("chatDot");
let lastMatchedId = null;

function registerMatch(profile){
  if(!matches.includes(profile.id)){
    matches.push(profile.id);
    set(LS.matches, matches);
  }
  const chats = get(LS.chats, {});
  if(!chats[profile.id]){
    chats[profile.id] = [{from:"them", text:`Привіт! Радий(-а) метчу 🍾 Ти теж любиш ${profile.drinks.split(",")[0].toLowerCase()}?`}];
    set(LS.chats, chats);
  }
  lastMatchedId = profile.id;
  document.getElementById("matchName").textContent = profile.name;
  matchOverlay.hidden = false;
  chatDot.hidden = false;
}

document.getElementById("matchKeepSwiping").addEventListener("click", ()=> matchOverlay.hidden = true);
document.getElementById("matchGoToChat").addEventListener("click", ()=>{
  matchOverlay.hidden = true;
  navBtns.forEach(b=>b.classList.remove("active"));
  document.querySelector('[data-tab="chats"]').classList.add("active");
  screens.forEach(s=> s.classList.toggle("active", s.id === "screen-chats"));
  openThread(lastMatchedId);
});

/* ===================== ЧАТИ ===================== */

const chatListItems = document.getElementById("chatListItems");
const chatsEmpty = document.getElementById("chatsEmpty");
const chatListView = document.getElementById("chatListView");
const chatThreadView = document.getElementById("chatThreadView");

function renderChatList(){
  chatListItems.innerHTML = "";
  chatsEmpty.hidden = matches.length > 0;
  const chats = get(LS.chats, {});
  matches.forEach(id=>{
    const profile = SEED_PROFILES_SAFE.find(p=>p.id === id);
    if(!profile) return;
    const thread = chats[id] || [];
    const last = thread[thread.length - 1];
    const row = document.createElement("div");
    row.className = "chat-row";
    row.innerHTML = `
      <div class="chat-avatar">${profile.photo ? `<img src="${profile.photo}" alt="${escapeHtml(profile.name)}">` : profile.avatar}</div>
      <div class="chat-meta">
        <p class="chat-name">${escapeHtml(profile.name)}</p>
        <p class="chat-preview">${escapeHtml(last ? last.text : "Кажи привіт!")}</p>
      </div>
    `;
    row.addEventListener("click", ()=> openThread(id));
    chatListItems.appendChild(row);
  });
}

function openThread(id){
  const profile = SEED_PROFILES_SAFE.find(p=>p.id === id);
  if(!profile) return;
  chatListView.hidden = true;
  chatThreadView.hidden = false;
  chatDot.hidden = true;
  document.getElementById("threadHeader").innerHTML = `
    <span style="font-size:22px;">${profile.avatar}</span>
    <span>${escapeHtml(profile.name)}</span>
  `;
  chatThreadView.dataset.activeId = id;
  renderThreadMessages(id);
}

function renderThreadMessages(id){
  const chats = get(LS.chats, {});
  const thread = chats[id] || [];
  const wrap = document.getElementById("threadMessages");
  wrap.innerHTML = thread.map(m=>`
    <div class="msg ${m.from === "me" ? "msg-me" : "msg-them"}">${escapeHtml(m.text)}</div>
  `).join("");
  wrap.scrollTop = wrap.scrollHeight;
}

document.getElementById("backToChats").addEventListener("click", ()=>{
  chatThreadView.hidden = true;
  chatListView.hidden = false;
  renderChatList();
});

document.getElementById("threadForm").addEventListener("submit", e=>{
  e.preventDefault();
  const id = chatThreadView.dataset.activeId;
  const input = document.getElementById("threadInput");
  const text = input.value.trim();
  if(!text) return;
  const chats = get(LS.chats, {});
  chats[id] = chats[id] || [];
  chats[id].push({from:"me", text});
  set(LS.chats, chats);
  input.value = "";
  renderThreadMessages(id);

  setTimeout(()=>{
    /* ВИПРАВЛЕНО: та сама страховка, що й для SEED_PROFILES — якщо
       AUTO_REPLIES ніде не визначено, підставляємо один нейтральний
       варіант замість падіння з ReferenceError. */
    const repliesSafe =
      (typeof AUTO_REPLIES !== "undefined" && Array.isArray(AUTO_REPLIES) && AUTO_REPLIES.length)
        ? AUTO_REPLIES
        : ["Привіт 👋"];
    const chats2 = get(LS.chats, {});
    chats2[id].push({from:"them", text: repliesSafe[Math.floor(Math.random()*repliesSafe.length)]});
    set(LS.chats, chats2);
    if(chatThreadView.dataset.activeId === id) renderThreadMessages(id);
  }, 1100);
});

/* ===================== КАРТА ЗАКЛАДІВ ===================== */

let map;
let places = get(LS.places, null) || seedPlaces();
let markersById = {};
let activePlaceId = null;
let pendingNewCoords = null;

function seedPlaces(){
  const seed = [
    {id: cryptoId(), name:"Бар «Хвиля»", lat:49.4444, lng:32.0598,
      reviews:[{author:"Оля", rating:5, text:"Найкращий джин-тонік у місті."}]},
    {id: cryptoId(), name:"Craft Room", lat:49.4285, lng:32.0645,
      reviews:[{author:"Максим", rating:4, text:"Великий вибір крафтового пива."}]}
  ];
  set(LS.places, seed);
  return seed;
}

function initMap(){
  map = L.map("map", {zoomControl:true}).setView([49.4444, 32.0598], 13);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: "abcd", maxZoom: 19
  }).addTo(map);

  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      map.setView([pos.coords.latitude, pos.coords.longitude], 14);
    }, ()=>{});
  }

  places.forEach(addMarkerForPlace);
  renderPlacesList();

  map.on("click", e=>{
    pendingNewCoords = {lat:e.latlng.lat, lng:e.latlng.lng};
    activePlaceId = null;
    openPlaceModal();
  });
}

function neonIcon(){
  return L.divIcon({
    className:"",
    html:`<div style="font-size:26px; filter:drop-shadow(0 0 6px rgba(45,255,160,0.8));">🍸</div>`,
    iconSize:[26,26], iconAnchor:[13,22]
  });
}

function addMarkerForPlace(place){
  const marker = L.marker([place.lat, place.lng], {icon: neonIcon()}).addTo(map);
  marker.on("click", ()=>{
    activePlaceId = place.id; pendingNewCoords = null; openPlaceModal();
  });
  markersById[place.id] = marker;
}

function renderPlacesList(){
  const wrap = document.getElementById("placesListItems");
  wrap.innerHTML = "";
  if(places.length === 0){
    wrap.innerHTML = `<p class="places-empty">Ще немає закладів. Клікни на мапу, щоб додати перший.</p>`;
    return;
  }
  places.forEach(p=>{
    const item = document.createElement("div");
    item.className = "place-item";
    item.innerHTML = `
      <span class="place-item-name">${escapeHtml(p.name)}</span>
      <span class="place-item-meta">${p.reviews.length} відгук(ів)</span>
    `;
    item.addEventListener("click", ()=>{
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
const placeNewFields = document.getElementById("placeNewFields");
const newPlaceNameInput = document.getElementById("newPlaceName");
const reviewsList = document.getElementById("reviewsList");

function openPlaceModal(){
  placeModalOverlay.hidden = false;
  if(activePlaceId){
    const place = places.find(p=>p.id === activePlaceId);
    placeModalEyebrow.textContent = "заклад";
    placeModalTitle.textContent = place.name;
    placeNewFields.hidden = true;
    renderReviews(place);
  } else {
    placeModalEyebrow.textContent = "новий заклад";
    placeModalTitle.textContent = "Додай назву та перший відгук";
    placeNewFields.hidden = false;
    newPlaceNameInput.value = "";
    reviewsList.innerHTML = `<p class="no-reviews">Тут з'являться відгуки після першого запису.</p>`;
  }
}

function closePlaceModal(){
  placeModalOverlay.hidden = true;
}

document.getElementById("placeModalCloseBtn").addEventListener("click", closePlaceModal);
placeModalOverlay.addEventListener("click", e=>{
  if(e.target === placeModalOverlay) closePlaceModal();
});
document.addEventListener("keydown", e=>{
  if(e.key === "Escape" && !placeModalOverlay.hidden) closePlaceModal();
});

function renderReviews(place){
  if(place.reviews.length === 0){
    reviewsList.innerHTML = `<p class="no-reviews">Ще немає відгуків. Будь першим!</p>`; return;
  }
  reviewsList.innerHTML = place.reviews.map(r=>`
    <div class="review-item">
      <span class="review-author">${escapeHtml(r.author)}</span>
      <span class="review-rating">${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}</span>
      <p class="review-text">${escapeHtml(r.text)}</p>
    </div>
  `).join("");
}

document.getElementById("reviewForm").addEventListener("submit", e=>{
  e.preventDefault();
  const me = currentMe() || {};
  const author = me.name || "Гість";
  const text = document.getElementById("reviewText").value.trim();
  const rating = Number(document.getElementById("reviewRating").value);

  if(activePlaceId){
    const place = places.find(p=>p.id === activePlaceId);
    place.reviews.push({author, rating, text});
  } else {
    const name = newPlaceNameInput.value.trim();
    if(!name){ newPlaceNameInput.focus(); return; }
    const newPlace = {id: cryptoId(), name, lat:pendingNewCoords.lat, lng:pendingNewCoords.lng, reviews:[{author, rating, text}]};
    places.push(newPlace);
    addMarkerForPlace(newPlace);
    activePlaceId = newPlace.id;
    pendingNewCoords = null;
  }
  set(LS.places, places);
  renderPlacesList();
  renderReviews(places.find(p=>p.id === activePlaceId));
  e.target.reset();
});

/* ===================== ПРОФІЛЬ ===================== */

document.getElementById("pPhoto").addEventListener("change", async e=>{
  const photo = await readPhotoFile(e.target);
  if(photo) renderAvatarPreview({photo});
});

document.getElementById("profileForm").addEventListener("submit", async e=>{
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
  note.hidden = false;
  setTimeout(()=> note.hidden = true, 1800);
});

/* ---------- ПРЕВ'Ю АНКЕТИ ---------- */

const previewModalOverlay = document.getElementById("previewModalOverlay");
const previewCardWrap = document.getElementById("previewCardWrap");

function buildGeoFromForm(){
  const settlementName = document.getElementById("pSettlementName").value.trim();
  const settlementType = document.getElementById("pSettlementType").value;
  if(!settlementName) return "Локація не вказана";
  return settlementType && settlementType !== "Місто" ? `${settlementName} (${settlementType})` : settlementName;
}

function renderPreviewCard(){
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

  previewCardWrap.innerHTML = "";
  previewCardWrap.appendChild(buildCard(previewProfile));
}

document.getElementById("previewBtn").addEventListener("click", ()=>{
  renderPreviewCard();
  previewModalOverlay.hidden = false;
});
document.getElementById("previewModalCloseBtn").addEventListener("click", ()=> previewModalOverlay.hidden = true);
previewModalOverlay.addEventListener("click", e=>{
  if(e.target === previewModalOverlay) previewModalOverlay.hidden = true;
});
document.addEventListener("keydown", e=>{
  if(e.key === "Escape" && !previewModalOverlay.hidden) previewModalOverlay.hidden = true;
});

/* ---------- геолокація ---------- */

const myLocationBadge = document.getElementById("myLocationBadge");
myLocationBadge.addEventListener("click", ()=>{
  if(!navigator.geolocation){
    myLocationBadge.textContent = "📍 геолокація недоступна";
    return;
  }
  myLocationBadge.textContent = "📍 визначаємо…";
  navigator.geolocation.getCurrentPosition(pos=>{
    const lat = pos.coords.latitude.toFixed(3);
    const lng = pos.coords.longitude.toFixed(3);
    myLocationBadge.textContent = `📍 ${lat}, ${lng}`;
    myLocationBadge.classList.add("located");
  }, ()=>{
    myLocationBadge.textContent = "📍 доступ не надано";
  });
});

/* ===================== СТАРТ ===================== */

rebuildQueue();
if(matches.length > 0) chatDot.hidden = false;
