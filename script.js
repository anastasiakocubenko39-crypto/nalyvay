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


/* ===================== ДІАГНОСТИКА AUTH FLOW =====================
   Тимчасове логування для пошуку точного місця обриву ланцюжка
   Email -> redirect -> session -> profile -> showApp(). Прибрати
   (або залишити тільки частину) після підтвердження, що все працює. */

console.log("AUTH: page loaded", {
  href: window.location.href,
  origin: window.location.origin,
  pathname: window.location.pathname,
  hash: window.location.hash,
  search: window.location.search,
  hasHashToken: window.location.hash.includes("access_token"),
  hasCodeParam: new URLSearchParams(window.location.search).has("code")
});


/* ===================== SUPABASE ===================== */

const SUPABASE_URL =
  "https://yecjmwgmfwqgxbiggeby.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_DIBPiv-9rJowQacsgEBMAw_8GvIxboP";

/* Єдине джерело правди для redirect URL, яка передається в
   signInWithOtp(). ВАЖЛИВО: ця точна URL (включно зі слешем в кінці)
   має бути додана в Supabase Dashboard -> Authentication ->
   URL Configuration -> Redirect URLs. Якщо там немає точного збігу
   (напр. без "/" в кінці, або http замість https) — Supabase мовчки
   відхилить redirect і поверне на Site URL за замовчуванням, що й
   виглядає як "після Email знову форма реєстрації". */
const EMAIL_REDIRECT_TO =
  "https://anastasiakocubenko39-crypto.github.io/nalyvay/";


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


/* ===================== PKCE: ЯВНИЙ ОБМІН ?code=... НА СЕСІЮ =====================
   ГОЛОВНЕ ВИПРАВЛЕННЯ цього кола проблем ("після Email знову форма
   реєстрації"):

   Сучасні версії supabase-js (у т.ч. @supabase/supabase-js@2, який
   підключений через CDN у index.html) за замовчуванням використовують
   PKCE-флоу для Magic Link. Це означає, що посилання з листа веде на
   ваш сайт з параметром "?code=XXXXXXXX" в адресному рядку — а НЕ зі
   старим "#access_token=...", як було в implicit-флоу.

   supabase-js вміє сам розпізнати "?code=" і обміняти його на сесію
   (detectSessionInUrl: true, увімкнено за замовчуванням), АЛЕ для
   цього потрібен "code_verifier" — секрет, який клієнт зберігає у
   localStorage/sessionStorage В ТОМУ Ж САМОМУ БРАУЗЕРІ, звідки
   надсилався лист (signInWithOtp). Якщо посилання відкривається:
     - в іншому браузері на тому ж пристрої,
     - у вбудованому браузері поштового застосунку (дуже частий
       випадок на телефонах — Gmail, Outlook та інші відкривають
       посилання у власному WebView, а не в системному браузері),
     - або якщо localStorage було очищено між відправкою листа й
       переходом по посиланню,
   — code_verifier відсутній, обмін коду на сесію мовчки не
   відбувається (або падає з помилкою "invalid code verifier"), сесії
   немає, getSession() повертає null — і людина знову бачить форму
   реєстрації, хоча Email технічно підтверджено.

   Це виправлення додає ЯВНИЙ виклик exchangeCodeForSession(), який:
     1. Перевіряє, чи є "?code=" в поточному URL.
     2. Якщо є — намагається обміняти його на сесію напряму, а не
        покладається лише на автоматичне розпізнавання.
     3. Логує результат у консоль (успіх/помилку), щоб було видно,
        яка саме причина — відсутній code_verifier чи щось інше.
     4. Прибирає "?code=..." з адресного рядка після обробки, щоб він
        не намагався обмінятись повторно при оновленні сторінки.
   Викликається один раз при старті, ДО checkEmailConfirmation(). */
async function exchangePkceCodeIfPresent() {
  if (!supabaseClient) return;

  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");

  if (!code) return;

  console.log("AUTH: у URL знайдено PKCE ?code=, намагаюсь обміняти на сесію");

  try {
    const { data, error } =
      await supabaseClient.auth.exchangeCodeForSession(window.location.href);

    if (error) {
      /* Найчастіша причина саме цієї помилки — лист відкрився в
         іншому браузері/вебв'ю, ніж той, де його замовляли (немає
         code_verifier). Єдиний надійний вихід у такому разі —
         попросити людину повторно натиснути "Увійти"/"Почати
         знайомитись" у ТОМУ Ж браузері, де вона зараз знаходиться:
         тоді піде новий лист, і code_verifier буде коректним. */
      console.error("AUTH: не вдалося обміняти code на сесію:", error);
    } else {
      console.log("AUTH: code успішно обміняно на сесію", data && data.session);
    }
  } catch (err) {
    console.error("AUTH: виняток під час обміну code на сесію:", err);
  }

  // Прибираємо ?code=... з адресного рядка (і лишаємо решту query,
  // якщо там було щось інше), щоб при оновленні сторінки браузер не
  // намагався обмінятись тим самим (уже використаним) кодом повторно.
  url.searchParams.delete("code");
  window.history.replaceState({}, document.title, url.toString());
}


/* ===================== SUPABASE: ТАБЛИЦЯ ПРОФІЛІВ =====================
   Перевірено напряму в проєкті Supabase "nalyvay" (yecjmwgmfwqgxbiggeby)
   через Supabase MCP (list_tables + pg_policies). Існуюча таблиця:

     public.profiles
       id             uuid  PRIMARY KEY, FOREIGN KEY -> auth.users.id
       name           text  NOT NULL
       birth_date     date  nullable
       gender         text  nullable
       city           text  nullable
       bio            text  nullable
       photo_url      text  nullable
       phone_verified boolean default false
       age_verified   boolean default false
       is_active      boolean default true
       created_at     timestamptz default now()

   RLS (уже увімкнено, policies вже існують — нічого не змінювалось):
     INSERT — authenticated, with_check: auth.uid() = id
     UPDATE — authenticated, using/with_check: auth.uid() = id
     SELECT — authenticated, using: is_active = true (тобто будь-який
              залогінений користувач бачить усі активні анкети, у т.ч. свою)
   Анонімні (не залогінені) відвідувачі не мають жодної policy на цю
   таблицю => нічого з неї не читають. Це відповідає вимозі проєкту.

   ДОДАНО: public.profiles_public — view поверх public.profiles, яка
   ховає email від усіх, окрім власника рядка (auth.uid() = id). Усі
   інші поля анкети (ім'я, фото, вподобання, локація, тощо) видно
   будь-якому залогіненому користувачу, як і раніше через RLS вихідної
   таблиці (view створена з security_invoker = true, тож поважає ту
   саму policy "is_active = true"). Ця view використовується ЛИШЕ для
   читання анкет ІНШИХ користувачів (loadRemoteProfiles нижче) — для
   читання/запису ВЛАСНОГО профілю (fetchOwnProfileRow,
   saveProfileToSupabase) і далі використовується пряма таблиця
   public.profiles (PROFILE_TABLE), бо там потрібен повний доступ,
   включно з власним email і можливістю запису.

   ВАЖЛИВО — чого НЕМАЄ в цій таблиці (і що ми свідомо НЕ пишемо туди,
   щоб не змінювати структуру без команди):
     type (людина/заклад), language, settlementType (окремо від city),
     drinks, food, favoritePlace, hobbies.
   Ці поля анкети UI все ще збирає (форма реєстрації/профілю), але вони
   зберігаються ЛИШЕ локально (localStorage) і не синхронізуються між
   користувачами, доки в таблицю не додадуть відповідні колонки. Це
   свідомий компроміс, а не помилка — див. підсумковий звіт у чаті. */

const PROFILE_TABLE = "profiles";

/* Таблиця/view, з якої читаються анкети ІНШИХ користувачів (список,
   колода свайпів). Ховає email від усіх, окрім власника анкети. */
const PROFILES_PUBLIC_VIEW = "profiles_public";

/* Форма реєстрації/профілю питає "вік" (число), а в таблиці є лише
   "birth_date" (дата). Точної дати народження ми не збираємо, тож
   зберігаємо наближену дату — 1 січня року народження. Це навмисне
   спрощення: воно дає коректний "вік" при зворотному перерахунку
   (birthDateToAge) у будь-який день року, окрім самого 1 січня. */
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

/* Колонка "city" — один текстовий рядок. У формах є окремо назва
   населеного пункту і його тип (Місто/СМТ/Село). Об'єднуємо так само,
   як це вже робилось у buildGeoFromForm() для прев'ю анкети. */
function buildCityString(settlementName, settlementType) {
  const name = (settlementName || "").trim();

  if (!name) return null;

  return settlementType && settlementType !== "Місто"
    ? `${name} (${settlementType})`
    : name;
}

/* Перетворює анкету у форматі застосунку (LS.me / pendingRegistration)
   на рядок для запису у public.profiles. Пише ЛИШЕ ті поля, які реально
   існують у таблиці. photo_url свідомо не заповнюється тут — Supabase
   Storage bucket для фото ще не налаштований (див. звіт у чаті, п.8):
   писати base64-фото у текстову колонку без bucket'у ми не робимо
   автоматично. */
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
    hobbies: profile.hobbies || null
  };
}

/* INSERT/UPDATE анкети відбувається саме тут: upsert по первинному
   ключу id (auth.uid()). RLS дозволяє це лише коли auth.uid() === id,
   тобто користувач може писати виключно свою анкету. Пишемо напряму в
   public.profiles (не у view — view лише для читання чужих анкет). */
async function saveProfileToSupabase(profile) {
  if (!supabaseClient) {
    return { data: null, error: new Error("supabaseClient недоступний") };
  }

  if (!profile || !profile.id) {
    return { data: null, error: new Error("У анкети немає id (auth.uid()) — Email ще не підтверджено") };
  }

  const row = profileToSupabaseRow(profile);

  const { data, error } = await supabaseClient
    .from(PROFILE_TABLE)
    .upsert(row, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    console.error("Supabase upsert profiles error:", error);
  }

  return { data, error };
}

/* Перетворює рядок із public.profiles (або public.profiles_public) на
   об'єкт у форматі картки NALYVAY (те, що очікує buildCard() та
   matchesFilters()). Таблиця тепер містить усі поля анкети (після
   міграції, що додала колонки type/language/drinks/food/
   favorite_place/hobbies/settlement_type/settlement_name/email) —
   читаємо їх напряму. */
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
    _source: "supabase"
  };
}

/* Відновлює LS.me з рядка public.profiles (напр. коли людина відкрила
   застосунок на іншому пристрої/після очищення localStorage, але має
   активну сесію Supabase). Тепер усі поля анкети читаються напряму з
   бази — нічого заново заповнювати не треба. email з session.user.email
   передається як запасний варіант, якщо у profiles.email чомусь порожньо. */
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

/* SELECT анкет ІНШИХ користувачів відбувається саме тут: усі активні
   анкети (RLS уже сам фільтрує is_active = true), окрім анкети
   поточного користувача. ВАЖЛИВО: читаємо з public.profiles_public
   (view), а не з public.profiles напряму — view ховає email усіх,
   окрім власника рядка, тож у колоді/пошуку чужий email ніколи не
   потрапляє на клієнт. */
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

  return (data || [])
    .filter(row => row.id !== myId)
    .map(supabaseRowToCard);
}

/* Кеш анкет із Supabase у пам'яті — джерело для свайп-колоди. */
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

/* Знаходить анкету за id серед реальних (Supabase) і тестових (seed)
   профілів. Використовується у чатах/метчах, щоб не ламати їх тепер,
   коли колода може складатись не лише з SEED_PROFILES. */
function findProfileById(id) {
  return (
    remoteProfiles.find(p => p.id === id) ||
    SEED_PROFILES_SAFE.find(p => p.id === id) ||
    null
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
  console.log("AUTH: showApp");

  if (regOverlay) {
    regOverlay.hidden = true;
    console.log("AUTH: registration overlay hidden =", regOverlay.hidden);
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

  /* Email показуємо лише для читання (немає сенсу дозволяти його
     редагувати тут — зміна Email вимагає окремого підтвердження через
     Supabase auth.updateUser, чого поточна форма не реалізує). Поле
     pEmail — опційне: якщо його немає в HTML, просто нічого не робимо. */
  const emailField = document.getElementById("pEmail");
  if (emailField) {
    emailField.value = me.email || "";
  }

  const onlineToggle =
    document.getElementById("onlineToggle");

  if (onlineToggle) {
    onlineToggle.checked = me.online !== false;
  }

  renderAvatarPreview(me);
}


/* ===================== ВІДПРАВКА EMAIL (РЕЄСТРАЦІЯ) ===================== */

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

    console.log("AUTH: sending magic link (register)", { email, emailRedirectTo: EMAIL_REDIRECT_TO });

    const { error } =
      await supabaseClient.auth.signInWithOtp({

        email: email,

        options: {
          shouldCreateUser: true,

          emailRedirectTo: EMAIL_REDIRECT_TO
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


/* ===================== ВХІД (ДЛЯ ТИХ, ХТО ВЖЕ МАЄ АКАУНТ) =====================
   ДОДАНО: раніше в HTML була вся розмітка форми входу (showLoginBtn,
   loginForm, loginEmail, backToRegisterBtn, loginConfirmMessage), але
   жодних обробників подій на неї не було навішено — тому кнопка
   "Увійти" візуально існувала, але клік нічого не робив.

   Логіка тут навмисне дзеркальна до форми реєстрації (regForm вище),
   з двома відмінностями:
     1. НЕ збирається анкета і НЕ пишеться nalyvay_pending_registration —
        існуючий профіль підтягується напряму з public.profiles у
        handleSessionInner() (гілка "already && already.id === userId"
        або "fetchOwnProfileRow(userId)"), коли людина повернеться за
        посиланням з листа.
     2. shouldCreateUser: false — форма входу свідомо НЕ створює новий
        акаунт. Якщо Email не зареєстрований, Supabase поверне помилку
        (людині показується alert з підказкою повернутись до реєстрації)
        замість того, щоб мовчки завести дубль акаунта. */

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
      alert(
        "Сервіс входу тимчасово недоступний (не вдалося з'єднатись із Supabase). " +
        "Онови сторінку і спробуй ще раз."
      );
      return;
    }

    const emailInput = document.getElementById("loginEmail");
    const email = emailInput ? emailInput.value.trim() : "";

    if (!email) {
      alert("Введи Email");
      return;
    }

    console.log("AUTH: sending magic link (login)", { email, emailRedirectTo: EMAIL_REDIRECT_TO });

    const { error } =
      await supabaseClient.auth.signInWithOtp({

        email: email,

        options: {
          /* Не створюємо новий акаунт через форму входу. Якщо акаунта
             з таким Email не існує, Supabase поверне помилку — і ми
             підкажемо людині повернутись до реєстрації нижче. */
          shouldCreateUser: false,

          emailRedirectTo: EMAIL_REDIRECT_TO
        }

      });

    if (error) {

      console.error("Supabase login email error:", error);

      alert(
        "Не вдалося надіслати посилання для входу: " + error.message +
        ". Якщо в тебе ще немає акаунта — повернись до реєстрації."
      );

      return;
    }

    const loginConfirmMessage = document.getElementById("loginConfirmMessage");
    const loginConfirmAddress = document.getElementById("loginConfirmAddress");

    if (loginConfirmAddress) {
      loginConfirmAddress.textContent = email;
    }

    if (loginConfirmMessage) {
      loginConfirmMessage.hidden = false;
    }

    const loginSubmitButton = loginForm.querySelector('button[type="submit"]');

    if (loginSubmitButton) {
      loginSubmitButton.hidden = true;
    }

  });

}


/* ===================== ПЕРЕВІРКА EMAIL / СЕСІЇ =====================
   Перевіряємо сесію у трьох випадках:
     1. є pending-анкета   -> зберігаємо її в Supabase, showApp().
     2. немає pending, але LS.me вже належить цьому користувачу
                           -> просто showApp() (нема що підтягувати).
     3. немає ні pending, ні відповідного LS.me
                           -> тягнемо анкету з public.profiles за
                              session.user.id і, якщо вона там є,
                              відновлюємо LS.me й showApp().
   Лише якщо сесії взагалі немає АБО анкети ніде не існує (ні
   pending, ні LS.me, ні рядка в базі) — людина залишається на формі
   реєстрації, бо реєструватись їй справді ще треба. */

/* ВИПРАВЛЕНО (гонка умов): checkEmailConfirmation() (виклик під час
   ініціалізації) і onAuthStateChange (SIGNED_IN / TOKEN_REFRESHED /
   INITIAL_SESSION, див. нижче) можуть спрацювати практично одночасно
   одразу після повернення з Email. Раніше захист від дублювання
   (sessionHandled) був простим boolean-прапорцем, який виставлявся
   ЛИШЕ після завершення upsert'у в Supabase — тобто поки перший
   виклик handleSession() ще "висів" на await saveProfileToSupabase(),
   другий виклик встигав пройти ту саму перевірку (sessionHandled ===
   false) і запускав ДРУГИЙ паралельний upsert / читання pending-
   реєстрації. У гіршому випадку це могло призвести до того, що один
   із двох паралельних викликів бачив pendingRaw === null (бо інший
   встиг його видалити) і йшов гілкою "немає ні pending, ні LS.me" —
   тобто НЕ показував showApp(), користувач лишався на формі
   реєстрації, хоча Email вже підтверджено і сесія вже є.
   Тепер handleSession() — це тонка обгортка з промісом-блокуванням:
   якщо виклик уже виконується, наступний виклик просто чекає на той
   самий проміс замість того, щоб запускати паралельну спробу. */
let handleSessionInFlight = null;

async function handleSession(session) {
  if (!session || !session.user) return;

  if (handleSessionInFlight) {
    await handleSessionInFlight;
    return;
  }

  handleSessionInFlight = handleSessionInner(session);

  try {
    await handleSessionInFlight;
  } finally {
    handleSessionInFlight = null;
  }
}

let sessionHandled = false;

function applyLocalProfileAndOpenApp(meObject) {
  set(LS.me, meObject);
  showApp();
}

/* Дістає рядок ВЛАСНОЇ анкети з public.profiles за id користувача
   Supabase. ВАЖЛИВО: читаємо з прямої таблиці public.profiles
   (PROFILE_TABLE), а НЕ з view profiles_public — бо тут потрібен
   власний email і саме конкретний рядок за userId (.eq + maybeSingle).
   Повертає null, якщо рядка ще немає (напр. магік-лінк відкрився в
   іншому браузері/пристрої, де pending-анкети не було, тож анкету
   ще ніде не зберегли). */
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
  console.log("AUTH: handleSession started", session);

  const userId = session.user.id;
  console.log("AUTH: user id =", userId);

  const already = currentMe();

  if (sessionHandled && already && already.id === userId) {
    return;
  }

  const pendingRaw = localStorage.getItem("nalyvay_pending_registration");
  console.log("AUTH: pending registration =", pendingRaw);

  if (pendingRaw) {
    let registration = null;

    try {
      registration = JSON.parse(pendingRaw);
    } catch (err) {
      console.error("Пошкоджені дані очікуваної реєстрації:", err);
    }

    if (registration) {
      /* Email підтверджений. session.user.id — стабільний ідентифікатор
         користувача (auth.users.id), саме він є первинним ключем у
         public.profiles. */
      registration.id = userId;
      registration.email = session.user.email;
      registration.verified = true;

      /* ЗАПИС АНКЕТИ В SUPABASE (INSERT/UPSERT). */
      console.log("AUTH: saving profile", registration);

      const { data: savedRow, error: saveError } = await saveProfileToSupabase(registration);

      if (saveError) {
        console.error("Не вдалося записати анкету в Supabase:", saveError);

        alert(
          "Email підтверджено, анкету збережено локально, але не вдалося " +
          "записати її в базу даних: " + saveError.message + ". " +
          "Спробуй зберегти профіль ще раз на вкладці «Профіль» — " +
          "спробу запису буде повторено автоматично."
        );

        /* ВИПРАВЛЕНО: раніше nalyvay_pending_registration видалявся
           одразу, НЕЗАЛЕЖНО від успіху upsert'у в Supabase. Якщо запис
           у базу не вдавався (напр. тимчасова мережева помилка), дані
           не губились лише тому, що вони вже осідали в LS.me — але
           автоматичного повторного запису в базу при наступному
           відкритті сайту не було, бо pendingRaw уже видалили. Тепер
           pending-анкета видаляється ЛИШЕ при успішному upsert; якщо
           запис не вдався, вона лишається в localStorage, і наступний
           виклик handleSession() (напр. після оновлення сторінки)
           автоматично спробує зберегти її в Supabase ще раз. Людина
           при цьому одразу потрапляє в застосунок (showApp() нижче) —
           вона НЕ залишається мовчки на формі реєстрації. */
      } else {
        console.log("AUTH: profile saved", savedRow);

        localStorage.removeItem("nalyvay_pending_registration");
        pendingRegistration = null;
      }

      sessionHandled = true;
      applyLocalProfileAndOpenApp(registration);

      /* Підвантажуємо анкети інших користувачів заново — щоб одразу
         врахувати щойно створену власну анкету (виключити себе). */
      if (typeof refreshRemoteProfiles === "function") {
        refreshRemoteProfiles();
      }

      return;
    }
  }

  if (already && already.id === userId) {
    /* Анкета вже є локально й належить саме цьому користувачу —
       просто впускаємо в застосунок, підтягувати нічого не треба. */
    sessionHandled = true;
    showApp();
    return;
  }

  /* Немає ні pending-анкети, ні коректного LS.me — пробуємо підтягнути
     анкету напряму з public.profiles (напр. поточний браузер/пристрій
     інший, ніж той, де заповнювалась форма реєстрації — САМЕ ЦЕЙ ШЛЯХ
     використовується при вході через форму "Увійти" вище). */
  const row = await fetchOwnProfileRow(userId);

  if (row) {
    sessionHandled = true;
    applyLocalProfileAndOpenApp(supabaseRowToLocalMe(row, session.user.email));
    return;
  }

  /* Якщо рядка немає — Email підтверджено, але анкети ще справді
     ніде не існує (ні тут, ні в базі). Це нормально лише для людини,
     яка ще жодного разу не проходила форму реєстрації, — лишаємо її
     на regOverlay, заповнення форми спрацює звичайним шляхом. */
  console.warn(
    "AUTH: сесія є, але анкети немає ні локально, ні в public.profiles " +
    "(userId=" + userId + "). Людина лишається на формі реєстрації."
  );
}

async function checkEmailConfirmation() {

  try {

    const {
      data: { session },
      error
    } =
      await supabaseClient.auth.getSession();

    console.log("AUTH: session =", session);

    if (error) {

      console.error(
        "Помилка отримання сесії:",
        error
      );

      return;
    }


    await handleSession(session);


  } catch (error) {

    console.error(
      "Помилка відновлення реєстрації:",
      error
    );

  }

}

/* Додатковий слухач подій автентифікації. supabase-js обробляє токени
   магік-лінка з URL асинхронно під час ініціалізації клієнта — у
   рідкісних випадках getSession() у checkEmailConfirmation() може
   встигнути відпрацювати ДО завершення цієї обробки (сесії ще немає),
   а трохи пізніше supabase-js сам згенерує подію SIGNED_IN. Без цього
   слухача людина в такому випадку так і лишалась би на формі
   реєстрації, хоча Email уже підтверджено. handleSession() всередині
   ідемпотентний (проміс-блокування handleSessionInFlight + прапорець
   sessionHandled), тож повторний виклик після checkEmailConfirmation()
   безпечний і не дублює запити. */
if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log("AUTH: onAuthStateChange", event, session);

    if (
      event === "SIGNED_IN" ||
      event === "TOKEN_REFRESHED" ||
      event === "INITIAL_SESSION"
    ) {
      handleSession(session);
    }
  });
}


/* ===================== ЗАПУСК АВТЕНТИФІКАЦІЇ/АНКЕТ ===================== */

async function initAuthAndProfiles() {

  if (currentMe()) {
    showApp();
  }

  if (supabaseClient) {
    /* ВАЖЛИВО: обмін PKCE-коду має відбутись ДО getSession() у
       checkEmailConfirmation() — інакше getSession() може встигнути
       відпрацювати раніше, ніж сесія з'явиться з коду. */
    await exchangePkceCodeIfPresent();
    await checkEmailConfirmation();
  }

  await refreshRemoteProfiles();
}

initAuthAndProfiles();

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

function sourceProfiles(){
  if(!remoteProfilesLoaded){
    return SEED_PROFILES_SAFE;
  }
  return remoteProfiles.length > 0 ? remoteProfiles : SEED_PROFILES_SAFE;
}

function rebuildQueue(){
  queue = sourceProfiles().filter(p => !(p.id in swipes) && matchesFilters(p));
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
    const profile = findProfileById(id);
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
  const profile = findProfileById(id);
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

  /* Локальна копія — завжди, для миттєвого відгуку інтерфейсу */
  set(LS.me, updated);
  renderAvatarPreview(updated);

  const note = document.getElementById("saveNote");

  /* UPDATE анкети в Supabase (та сама функція, що й для реєстрації —
     upsert по id; RLS дозволяє це лише для власного профілю). Якщо
     людина ще не підтвердила Email (updated.id відсутній), апдейт
     у базу пропускається — зберігати нема куди, це очікувано. Це
     також природний "ретрай" для випадку, коли перший запис у базу
     після Email не вдався (див. коментар у handleSessionInner). */
  if (updated.id) {
    const { error } = await saveProfileToSupabase(updated);

    if (error) {
      note.textContent = "Збережено локально, але не в базі: " + error.message;
      note.hidden = false;
      setTimeout(()=> { note.hidden = true; note.textContent = "Збережено ✓"; }, 3200);
    } else {
      note.textContent = "Збережено ✓";
      note.hidden = false;
      setTimeout(()=> note.hidden = true, 1800);

      if (typeof refreshRemoteProfiles === "function") {
        refreshRemoteProfiles();
      }
    }
  } else {
    console.warn("У профілю ще немає id (Email не підтверджено) — зміни збережено лише локально.");
    note.textContent = "Збережено ✓";
    note.hidden = false;
    setTimeout(()=> note.hidden = true, 1800);
  }
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
