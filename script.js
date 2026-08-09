/* ===================== СХОВИЩЕ ===================== */

const LS = {
  me: "nalyvay_me",
  swipes: "nalyvay_swipes",     // {profileId: 'like'|'pass'}
  matches: "nalyvay_matches",   // [profileId]
  chats: "nalyvay_chats",       // {profileId: [{from:'me'|'them', text}]}
  places: "nalyvay_places_v2"
};

function cryptoId(){ return "id-" + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
function get(key, fallback){ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
function set(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
function escapeHtml(str){ const d = document.createElement("div"); d.textContent = str ?? ""; return d.innerHTML; }

/* ===================== СІД-ДАНІ ===================== */

const SEED_PROFILES = [
  {id:"seed-1", name:"Оля", type:"person", geo:"Черкаси, центр · 800 м", online:true, avatar:"💃",
    drinks:"Джин-тонік", food:"Суші", places:"Бар «Хвиля»", bio:"Люблю тихі бари з хорошою музикою."},
  {id:"seed-2", name:"Максим", type:"person", geo:"Черкаси, лівий берег · 1.2 км", online:true, avatar:"🕺",
    drinks:"Віскі, темне пиво", food:"Стейк, бургери", places:"Стейк-хаус на Гоголя", bio:"Настолки і келих віскі — ідеальний вечір."},
  {id:"seed-3", name:"«Три бариста»", type:"company", geo:"Черкаси, Митниця · 2.1 км", online:false, avatar:"☕",
    drinks:"Спешелті кава, вино ввечері", food:"Круасани, брускети", places:"Своя кав'ярня", bio:"Команда кав'ярні шукає компанію після зміни."},
  {id:"seed-4", name:"Настя", type:"person", geo:"Черкаси, набережна · 600 м", online:true, avatar:"🙋‍♀️",
    drinks:"Просекко, сидр", food:"Тапас", places:"Wine & Tapas Bar", bio:"Обожнюю набережну ввечері та келих просекко."},
  {id:"seed-5", name:"Craft Room", type:"company", geo:"Черкаси, центр · 950 м", online:true, avatar:"🍻",
    drinks:"20 сортів крафтового пива", food:"Снеки до пива", places:"Своя пивна", bio:"Бар шукає компанії на дегустації нових сортів."},
  {id:"seed-6", name:"Дмитро", type:"person", geo:"Черкаси, Соснівка · 3 км", online:false, avatar:"🧔",
    drinks:"Ром, мохіто", food:"Мексиканська кухня", places:"Cantina Bar", bio:"Люблю тропічну музику і хороший ром."}
];

const AUTO_REPLIES = [
  "Привіт! 🍸 Куди сьогодні підемо?",
  "О, звучить непогано, я за!",
  "А ти вже був(-ла) у «Хвилі»? Раджу 🍹",
  "Давай завтра ввечері?",
  "Го по пиву в п'ятницю 🍻"
];

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

/* ===================== SWIPE DECK ===================== */

const deckEl = document.getElementById("deck");
const deckEmpty = document.getElementById("deckEmpty");
let swipes = get(LS.swipes, {});
let matches = get(LS.matches, []);
let queue = SEED_PROFILES.filter(p => !(p.id in swipes));

function renderDeck(){
  deckEl.innerHTML = "";
  deckEmpty.hidden = queue.length > 0;

  queue.slice(0, 3).reverse().forEach((p, idxFromTop)=>{
    const card = buildCard(p);
    deckEl.appendChild(card);
  });
  attachDragToTopCard();
}

function buildCard(p){
  const card = document.createElement("div");
  card.className = "swipe-card";
  card.dataset.id = p.id;
  card.innerHTML = `
    <div class="card-avatar">${p.avatar}</div>
    <div class="card-online">
      <span class="dot" style="background:${p.online ? "var(--green)" : "var(--text-dim)"}"></span>
      ${p.online ? "онлайн зараз" : "не в мережі"}
    </div>
    <div class="stamp stamp-like">LIKE</div>
    <div class="stamp stamp-nope">NOPE</div>
    <div class="card-body">
      <h3 class="card-name">${escapeHtml(p.name)}<span class="card-badge ${p.type === "person" ? "badge-person" : "badge-company"}">${p.type === "person" ? "людина" : "заклад"}</span></h3>
      <p class="card-geo">📍 ${escapeHtml(p.geo)}</p>
      <div class="card-tags">
        <span class="card-tag">🍺 ${escapeHtml(p.drinks)}</span>
        <span class="card-tag">🍴 ${escapeHtml(p.food)}</span>
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

function finishSwipe(action){
  const topCard = deckEl.querySelector(".swipe-card:last-child");
  const id = topCard?.dataset.id;
  if(!id) return;
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
  }, 220);
}

document.getElementById("passBtn").addEventListener("click", ()=> finishSwipe("pass"));
document.getElementById("likeBtn").addEventListener("click", ()=> finishSwipe("like"));

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
    const profile = SEED_PROFILES.find(p=>p.id === id);
    if(!profile) return;
    const thread = chats[id] || [];
    const last = thread[thread.length - 1];
    const row = document.createElement("div");
    row.className = "chat-row";
    row.innerHTML = `
      <div class="chat-avatar">${profile.avatar}</div>
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
  const profile = SEED_PROFILES.find(p=>p.id === id);
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
    const chats2 = get(LS.chats, {});
    chats2[id].push({from:"them", text: AUTO_REPLIES[Math.floor(Math.random()*AUTO_REPLIES.length)]});
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
document.querySelectorAll('[data-close="place"]').forEach(btn=> btn.addEventListener("click", ()=> placeModalOverlay.hidden = true));
placeModalOverlay.addEventListener("click", e=>{ if(e.target === placeModalOverlay) placeModalOverlay.hidden = true; });

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
  const author = document.getElementById("reviewAuthor").value.trim();
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

const me = get(LS.me, {name:"", type:"person", geo:"", drinks:"", food:"", places:"", bio:"", online:true, avatar:"🙂"});
document.getElementById("pName").value = me.name;
document.getElementById("pType").value = me.type;
document.getElementById("pGeo").value = me.geo;
document.getElementById("pDrinks").value = me.drinks;
document.getElementById("pFood").value = me.food;
document.getElementById("pPlaces").value = me.places;
document.getElementById("pBio").value = me.bio;
document.getElementById("onlineToggle").checked = me.online;

document.getElementById("profileForm").addEventListener("submit", e=>{
  e.preventDefault();
  const updated = {
    name: document.getElementById("pName").value.trim(),
    type: document.getElementById("pType").value,
    geo: document.getElementById("pGeo").value.trim(),
    drinks: document.getElementById("pDrinks").value.trim(),
    food: document.getElementById("pFood").value.trim(),
    places: document.getElementById("pPlaces").value.trim(),
    bio: document.getElementById("pBio").value.trim(),
    online: document.getElementById("onlineToggle").checked,
    avatar: me.avatar
  };
  set(LS.me, updated);
  const note = document.getElementById("saveNote");
  note.hidden = false;
  setTimeout(()=> note.hidden = true, 1800);
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

renderDeck();
if(matches.length > 0) chatDot.hidden = false;
