import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, setDoc, onSnapshot, query, where, orderBy, serverTimestamp, Timestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── FIREBASE KONFIG ───────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBVHg-u7qiQxtkHPOQTjdt1_uUP57mBAPQ",
  authDomain: "bs-biomechanics-d9dad.firebaseapp.com",
  projectId: "bs-biomechanics-d9dad",
  storageBucket: "bs-biomechanics-d9dad.firebasestorage.app",
  messagingSenderId: "933607213172",
  appId: "1:933607213172:web:a50dae479ce39ab5266921"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ─── GLOBAL DURUM ──────────────────────────────────────────────────────────
let mevcutKullanici = null;
let mevcutKullaniciBilgi = null;
let tumKullanicilar = [];
let takvimYil = new Date().getFullYear();
let takvimAy = new Date().getMonth();
let seciliGun = new Date();
let aktifKanalId = null;
let mesajDinleyici = null;
let bildirimAcik = false;

// ─── GİRİŞ / ÇIKIŞ ────────────────────────────────────────────────────────
document.getElementById('google-giris-btn').addEventListener('click', async () => {
  try {
    // Önce popup dene, olmazsa redirect kullan
    try {
      await signInWithPopup(auth, provider);
    } catch (popupHata) {
      if (popupHata.code === 'auth/popup-blocked' || 
          popupHata.code === 'auth/popup-closed-by-user' ||
          popupHata.code === 'auth/cancelled-popup-request') {
        // Popup çalışmadı, redirect kullan
        await signInWithRedirect(auth, provider);
      } else {
        throw popupHata;
      }
    }
  } catch (e) {
    toast('Giriş başarısız: ' + e.message, 'hata');
  }
});

// Redirect sonrası geri döndüğünde kontrol et
getRedirectResult(auth).then(async (result) => {
  if (result?.user) {
    // Kullanıcı redirect ile giriş yaptı - onAuthStateChanged halleder
  }
}).catch((e) => {
  if (e.code !== 'auth/no-current-user') {
    console.warn('Redirect result hatası:', e.message);
  }
});

window.cikisYap = async () => {
  await signOut(auth);
};

onAuthStateChanged(auth, async (kullanici) => {
  if (kullanici) {
    mevcutKullanici = kullanici;
    await kullaniciBilgiYukle(kullanici);
    ekranGoster('ana-uygulama');
    uygulamaBaslat();
  } else {
    mevcutKullanici = null;
    mevcutKullaniciBilgi = null;
    ekranGoster('giris-ekrani');
  }
});

async function kullaniciBilgiYukle(kullanici) {
  const ref = doc(db, 'users', kullanici.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const tumSnap = await getDocs(collection(db, 'users'));
    const rol = tumSnap.empty ? 'admin' : 'staff';
    const yeniKullanici = {
      name: kullanici.displayName || 'İsimsiz',
      email: kullanici.email,
      photoURL: kullanici.photoURL || '',
      role: rol,
      department: '',
      createdAt: serverTimestamp(),
      notifications: true,
      aktif: true
    };
    await setDoc(ref, yeniKullanici);
    mevcutKullaniciBilgi = { ...yeniKullanici, id: kullanici.uid };
    // İlk admin değilse hoş geldin bildirimi
    if (rol !== 'admin') {
      await bildirimGonderAdmin(`Yeni üye katıldı: ${kullanici.displayName || kullanici.email}`);
    }
  } else {
    // Fotoğraf güncellenmiş olabilir
    await updateDoc(ref, { photoURL: kullanici.photoURL || '', lastLogin: serverTimestamp() });
    mevcutKullaniciBilgi = { ...snap.data(), id: kullanici.uid, photoURL: kullanici.photoURL || '' };
  }
}

// ─── EKRAN YÖNETİMİ ────────────────────────────────────────────────────────
function ekranGoster(id) {
  document.querySelectorAll('.ekran').forEach(e => e.classList.remove('aktif'));
  document.getElementById(id).classList.add('aktif');
}

window.panelGoster = (id) => {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('aktif'));
  document.getElementById(id).classList.add('aktif');
  // Nav güncelle
  const navMap = {
    'panel-anasayfa': 'anasayfa', 'panel-takvim': 'takvim',
    'panel-gorevler': 'gorevler', 'panel-mesajlar': 'mesajlar',
    'panel-profil': 'profil'
  };
  if (navMap[id]) navGuncelleUI(navMap[id]);
};

window.navGit = (hedef) => {
  panelGoster('panel-' + hedef);
  navGuncelleUI(hedef);
  bildirimPanelKapat();
};

function navGuncelleUI(aktif) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('aktif'));
  const btn = document.getElementById('nav-' + aktif);
  if (btn) btn.classList.add('aktif');
}

// ─── UYGULAMA BAŞLAT ───────────────────────────────────────────────────────
function uygulamaBaslat() {
  const ad = mevcutKullaniciBilgi.name || mevcutKullanici.displayName || 'Kullanıcı';
  document.getElementById('kullanici-adi-goster').textContent = ad;

  // Üst bar avatar — fotoğraf varsa göster
  const avatarEl = document.getElementById('kullanici-avatar');
  if (mevcutKullaniciBilgi.photoURL) {
    avatarEl.innerHTML = `<img src="${mevcutKullaniciBilgi.photoURL}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;">`;
  } else {
    avatarEl.textContent = avatarInitials(ad);
  }

  // Profil sayfası avatar
  const profilAvatarEl = document.getElementById('profil-avatar-buyuk');
  if (mevcutKullaniciBilgi.photoURL) {
    profilAvatarEl.innerHTML = `<img src="${mevcutKullaniciBilgi.photoURL}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;">`;
  } else {
    profilAvatarEl.textContent = avatarInitials(ad);
  }

  document.getElementById('profil-ad').textContent = ad;
  document.getElementById('profil-email').textContent = mevcutKullanici.email;
  document.getElementById('profil-rol').textContent = rolEtiket(mevcutKullaniciBilgi.role);
  document.getElementById('bildirim-toggle').checked = mevcutKullaniciBilgi.notifications !== false;
  document.getElementById('departman-input').value = mevcutKullaniciBilgi.department || '';

  // Yönetici alanı
  if (['admin', 'manager'].includes(mevcutKullaniciBilgi.role)) {
    document.getElementById('yonetici-alan').style.display = 'block';
    davetLinkOlustur();
    kullanicilariYukle();
  }

  tumKullanicilariYukle();
  bugunEtkinlikleriYukle();
  bekleyenGorevleriYukle();
  takvimCiz();
  gorevleriYukle('aktif');
  kanallariYukle();
  bildirimleriDinle();
  gcalKutuphaneleriYukle();
  // Profil sayfasına Google Takvim butonu ekle
  setTimeout(() => {
    const ayarListe = document.querySelector('.ayar-listesi');
    if (ayarListe && !document.getElementById('gcal-btn')) {
      const gcalDiv = document.createElement('div');
      gcalDiv.className = 'ayar-item';
      gcalDiv.style.flexDirection = 'column';
      gcalDiv.style.alignItems = 'flex-start';
      gcalDiv.style.gap = '8px';
      gcalDiv.innerHTML = `
        <span style="font-size:13px;color:var(--yazi-dim)">Google Takvim Senkronizasyonu</span>
        <button id="gcal-btn" onclick="gcalBagla()" style="
          width:100%;padding:10px;border-radius:10px;
          background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.3);
          color:#00d4ff;font-size:13px;font-weight:600;
          font-family:'Exo 2',sans-serif;cursor:pointer;text-align:center">
          Google Takvim'e Bağla
        </button>
        <p style="font-size:11px;color:var(--yazi-dim);line-height:1.5">
          Bağlandıktan sonra oluşturduğunuz tüm etkinlikler Google Takvim'inize otomatik eklenir.
        </p>`;
      // Kaydet butonundan önce ekle
      const kaydetBtn = ayarListe.querySelector('.btn-kaydet');
      if (kaydetBtn) ayarListe.insertBefore(gcalDiv, kaydetBtn);
      else ayarListe.appendChild(gcalDiv);
      // Mevcut bağlantı durumunu göster
      if (mevcutKullaniciBilgi?.gcalBagli) gcalButonGuncelle(true);
    }
  }, 500);
}

function rolEtiket(rol) {
  const map = { admin: 'Genel Yönetici', manager: 'Bölüm Yöneticisi', staff: 'Personel' };
  return map[rol] || rol;
}

function avatarInitials(ad) {
  return (ad || 'K').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function avatarHTML(u, boyut = 36) {
  const fs = Math.floor(boyut * 0.38);
  const stil = `width:${boyut}px;height:${boyut}px;border-radius:50%;object-fit:cover;flex-shrink:0;`;
  const divStil = `width:${boyut}px;height:${boyut}px;border-radius:50%;background:linear-gradient(135deg,#0066cc,#00d4ff);display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:700;color:#0a1628;flex-shrink:0;`;
  const initials = avatarInitials(u?.name || u?.displayName);
  if (u?.photoURL) {
    return `<img src="${u.photoURL}" style="${stil}" onerror="this.outerHTML='<div style=\\'${divStil}\\'>${initials}</div>'">`;
  }
  return `<div style="${divStil}">${initials}</div>`;
}

// ─── KULLANICI İŞLEMLERİ ──────────────────────────────────────────────────
async function tumKullanicilariYukle() {
  const snap = await getDocs(collection(db, 'users'));
  tumKullanicilar = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(u => u.aktif !== false);
}

async function kullanicilariYukle() {
  const snap = await getDocs(collection(db, 'users'));
  const liste = document.getElementById('kullanici-listesi-yonetim');
  if (!liste) return;
  liste.innerHTML = '';

  const kullanicilar = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const roller = { admin: 0, manager: 0, staff: 0 };
  kullanicilar.forEach(u => { if (u.aktif !== false) roller[u.role] = (roller[u.role] || 0) + 1; });

  // Özet kartlar
  const ozet = document.createElement('div');
  ozet.style.cssText = 'display:flex;gap:8px;margin-bottom:16px;';
  ozet.innerHTML = `
    <div style="padding:10px;background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.3);border-radius:10px;flex:1;text-align:center">
      <div style="font-size:22px;font-weight:700;color:#00d4ff;font-family:'Rajdhani',sans-serif">${kullanicilar.filter(u=>u.aktif!==false).length}</div>
      <div style="font-size:11px;color:#8899aa">Toplam</div>
    </div>
    <div style="padding:10px;background:rgba(0,102,204,0.1);border:1px solid rgba(0,102,204,0.3);border-radius:10px;flex:1;text-align:center">
      <div style="font-size:22px;font-weight:700;color:#66aaff;font-family:'Rajdhani',sans-serif">${(roller.admin||0)+(roller.manager||0)}</div>
      <div style="font-size:11px;color:#8899aa">Yönetici</div>
    </div>
    <div style="padding:10px;background:rgba(255,152,0,0.1);border:1px solid rgba(255,152,0,0.3);border-radius:10px;flex:1;text-align:center">
      <div style="font-size:22px;font-weight:700;color:#ff9800;font-family:'Rajdhani',sans-serif">${roller.staff||0}</div>
      <div style="font-size:11px;color:#8899aa">Personel</div>
    </div>`;
  liste.appendChild(ozet);

  kullanicilar.forEach(u => {
    if (u.aktif === false) return;
    const el = document.createElement('div');
    el.className = 'kullanici-satir';
    el.style.marginBottom = '8px';
    const kendisi = u.id === mevcutKullanici.uid;
    el.innerHTML = `
      ${avatarHTML(u, 42)}
      <div class="kullanici-satir-bilgi" style="flex:1;min-width:0">
        <div class="kullanici-satir-ad">${u.name || 'İsimsiz'}${kendisi ? ' <span style="font-size:10px;color:#00d4ff">(siz)</span>' : ''}</div>
        <div class="kullanici-satir-email">${u.email || ''}</div>
        ${u.department ? `<div style="font-size:11px;color:#8899aa">${u.department}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <select class="rol-secici" onchange="rolDegistir('${u.id}', this.value)" ${kendisi ? 'disabled style="opacity:0.5"' : ''}>
          <option value="staff" ${u.role==='staff'?'selected':''}>Personel</option>
          <option value="manager" ${u.role==='manager'?'selected':''}>Bölüm Yön.</option>
          <option value="admin" ${u.role==='admin'?'selected':''}>Genel Yön.</option>
        </select>
        ${!kendisi && mevcutKullaniciBilgi?.role === 'admin' ?
          `<button onclick="kullaniciyiKaldir('${u.id}','${u.name?.replace(/'/g,"\\'")||"Kullanıcı"}')" style="background:rgba(244,67,54,0.1);border:1px solid rgba(244,67,54,0.3);color:#ff6b6b;font-size:11px;padding:3px 8px;border-radius:6px;cursor:pointer;font-family:'Exo 2',sans-serif">Kaldır</button>` : ''}
      </div>`;
    liste.appendChild(el);
  });
}

window.kullaniciyiKaldir = async (uid, ad) => {
  if (!confirm(`${ad} adlı kullanıcıyı sistemden kaldırmak istiyor musunuz?`)) return;
  await updateDoc(doc(db, 'users', uid), { aktif: false, role: 'passive' });
  toast(`${ad} sistemden kaldırıldı`, 'basari');
  kullanicilariYukle();
  tumKullanicilariYukle();
};

window.rolDegistir = async (uid, yeniRol) => {
  await updateDoc(doc(db, 'users', uid), { role: yeniRol });
  toast('Rol güncellendi', 'basari');
  kullanicilariYukle();
};

window.profilKaydet = async () => {
  const dep = document.getElementById('departman-input').value.trim();
  const ad = document.getElementById('profil-ad-input')?.value.trim() || mevcutKullaniciBilgi.name;
  await updateDoc(doc(db, 'users', mevcutKullanici.uid), { department: dep, name: ad });
  mevcutKullaniciBilgi.department = dep;
  mevcutKullaniciBilgi.name = ad;
  toast('Profil kaydedildi', 'basari');
};

window.profilGoster = () => navGit('profil');

window.bildirimAyar = () => {
  const ac = document.getElementById('bildirim-toggle').checked;
  updateDoc(doc(db, 'users', mevcutKullanici.uid), { notifications: ac });
};

function davetLinkOlustur() {
  const link = window.location.origin;
  const inp = document.getElementById('davet-link');
  if (inp) inp.value = link;
}

window.davetKopyala = () => {
  const inp = document.getElementById('davet-link');
  navigator.clipboard.writeText(inp.value).then(() => toast('Bağlantı kopyalandı!', 'basari'));
};

async function bildirimGonderAdmin(mesaj) {
  const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')));
  for (const d of snap.docs) {
    if (d.id !== mevcutKullanici?.uid) {
      await bildirimGonder(d.id, mesaj, 'system');
    }
  }
}

// ─── TAKVİM ───────────────────────────────────────────────────────────────
function takvimCiz() {
  const ayAdlari = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                    'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  document.getElementById('takvim-baslik').textContent = `${ayAdlari[takvimAy]} ${takvimYil}`;

  const grid = document.getElementById('takvim-grid');
  grid.innerHTML = '';

  const gunler = ['Pt','Sa','Ça','Pe','Cu','Ct','Pz'];
  gunler.forEach(g => {
    const el = document.createElement('div');
    el.className = 'takvim-gun-baslik'; el.textContent = g;
    grid.appendChild(el);
  });

  const ilkGun = new Date(takvimYil, takvimAy, 1);
  let baslangicGun = ilkGun.getDay(); // 0=Pazar
  baslangicGun = baslangicGun === 0 ? 6 : baslangicGun - 1; // Pazartesi başlasın

  for (let i = 0; i < baslangicGun; i++) {
    const bos = document.createElement('div');
    bos.className = 'takvim-gun bos'; grid.appendChild(bos);
  }

  const bugun = new Date();
  const sonGun = new Date(takvimYil, takvimAy + 1, 0).getDate();

  for (let gun = 1; gun <= sonGun; gun++) {
    const el = document.createElement('div');
    el.className = 'takvim-gun';
    el.textContent = gun;

    const tarih = new Date(takvimYil, takvimAy, gun);
    if (tarih < new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate())) {
      el.classList.add('gecmis');
    }
    if (gun === bugun.getDate() && takvimAy === bugun.getMonth() && takvimYil === bugun.getFullYear()) {
      el.classList.add('bugun');
    }
    if (seciliGun && gun === seciliGun.getDate() && takvimAy === seciliGun.getMonth() && takvimYil === seciliGun.getFullYear()) {
      el.classList.add('secili');
    }

    el.addEventListener('click', () => {
      seciliGun = new Date(takvimYil, takvimAy, gun);
      takvimCiz();
      seciliGunEtkinlikleriGoster(seciliGun);
    });
    grid.appendChild(el);
  }

  if (seciliGun) seciliGunEtkinlikleriGoster(seciliGun);
  etkinlikliGunleriIsaretle();
}

window.takvimNavigasyon = (yon) => {
  takvimAy += yon;
  if (takvimAy > 11) { takvimAy = 0; takvimYil++; }
  if (takvimAy < 0) { takvimAy = 11; takvimYil--; }
  takvimCiz();
};

async function etkinlikliGunleriIsaretle() {
  const q = query(collection(db, 'events'), where('attendees', 'array-contains', mevcutKullanici.uid));
  const snap = await getDocs(q);
  const gunler = new Set();
  snap.docs.forEach(d => {
    const e = d.data();
    if (e.start) {
      const t = e.start.toDate ? e.start.toDate() : new Date(e.start);
      if (t.getMonth() === takvimAy && t.getFullYear() === takvimYil) {
        gunler.add(t.getDate());
      }
    }
  });
  document.querySelectorAll('.takvim-gun:not(.bos)').forEach(el => {
    if (gunler.has(parseInt(el.textContent))) el.classList.add('etkinlikli');
  });
}

async function seciliGunEtkinlikleriGoster(tarih) {
  const formatli = tarihFormat(tarih);
  document.getElementById('secili-gun-baslik').textContent = formatli + ' — Etkinlikler';
  const liste = document.getElementById('secili-gun-etkinlikler');
  liste.innerHTML = '<div class="bos-durum"><p>Yükleniyor...</p></div>';

  const q = query(collection(db, 'events'), where('attendees', 'array-contains', mevcutKullanici.uid));
  const snap = await getDocs(q);
  const etkinlikler = [];
  snap.docs.forEach(d => {
    const e = d.data();
    if (e.start) {
      const t = e.start.toDate ? e.start.toDate() : new Date(e.start);
      if (t.getDate() === tarih.getDate() && t.getMonth() === tarih.getMonth() && t.getFullYear() === tarih.getFullYear()) {
        etkinlikler.push({ id: d.id, ...e });
      }
    }
  });

  liste.innerHTML = '';
  if (etkinlikler.length === 0) {
    liste.innerHTML = '<div class="bos-durum"><p>Bu gün etkinlik yok</p></div>';
    return;
  }
  etkinlikler.sort((a, b) => {
    const ta = a.start?.toDate ? a.start.toDate() : new Date(a.start);
    const tb = b.start?.toDate ? b.start.toDate() : new Date(b.start);
    return ta - tb;
  });
  etkinlikler.forEach(e => liste.appendChild(etkinlikKartOlustur(e)));
}

async function bugunEtkinlikleriYukle() {
  const bugun = new Date();
  const q = query(collection(db, 'events'), where('attendees', 'array-contains', mevcutKullanici.uid));
  const snap = await getDocs(q);
  const liste = document.getElementById('bugun-listesi');
  const etkinlikler = [];
  snap.docs.forEach(d => {
    const e = d.data();
    if (e.start) {
      const t = e.start.toDate ? e.start.toDate() : new Date(e.start);
      if (t.getDate() === bugun.getDate() && t.getMonth() === bugun.getMonth() && t.getFullYear() === bugun.getFullYear()) {
        etkinlikler.push({ id: d.id, ...e });
      }
    }
  });
  document.getElementById('bugun-etkinlik').textContent = etkinlikler.length;
  liste.innerHTML = '';
  if (etkinlikler.length === 0) {
    liste.innerHTML = '<div class="bos-durum"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><p>Bugün etkinlik yok</p></div>';
    return;
  }
  etkinlikler.forEach(e => liste.appendChild(etkinlikKartOlustur(e)));
}

function etkinlikKartOlustur(e) {
  const el = document.createElement('div');
  el.className = 'etkinlik-kart';
  const baslangic = e.start?.toDate ? e.start.toDate() : new Date(e.start);
  const bitis = e.end?.toDate ? e.end.toDate() : new Date(e.end);
  el.innerHTML = `
    <div class="etkinlik-renk renk-${e.type || 'toplanti'}"></div>
    <div class="etkinlik-bilgi">
      <div class="etkinlik-baslik-metin">${e.title || 'Başlıksız'}</div>
      <div class="etkinlik-meta">${saatFormat(baslangic)} – ${saatFormat(bitis)}${e.description ? ' · ' + e.description : ''}</div>
    </div>
    <span class="etkinlik-tur-rozet tur-${e.type || 'toplanti'}">${turEtiket(e.type)}</span>`;
  if (['admin', 'manager'].includes(mevcutKullaniciBilgi?.role) || e.createdBy === mevcutKullanici.uid) {
    el.addEventListener('click', () => etkinlikDuzenle(e));
  }
  return el;
}

window.etkinlikEkleModal = async () => {
  document.getElementById('etkinlik-id').value = '';
  document.getElementById('modal-etkinlik-baslik').textContent = 'Yeni Etkinlik';
  document.getElementById('etkinlik-baslik').value = '';
  document.getElementById('etkinlik-aciklama').value = '';
  document.getElementById('etkinlik-tur').value = 'toplanti';
  document.getElementById('etkinlik-tekrar').value = 'yok';
  const simdi = new Date();
  document.getElementById('etkinlik-baslangic').value = tarihInputFormat(simdi);
  document.getElementById('etkinlik-bitis').value = tarihInputFormat(new Date(simdi.getTime() + 60*60*1000));
  await katilimciSecimDoldur('katilimci-secim', [mevcutKullanici.uid]);
  modalAc('modal-etkinlik');
};

async function etkinlikDuzenle(e) {
  document.getElementById('etkinlik-id').value = e.id;
  document.getElementById('modal-etkinlik-baslik').textContent = 'Etkinliği Düzenle';
  document.getElementById('etkinlik-baslik').value = e.title || '';
  document.getElementById('etkinlik-aciklama').value = e.description || '';
  document.getElementById('etkinlik-tur').value = e.type || 'toplanti';
  document.getElementById('etkinlik-tekrar').value = e.recurring || 'yok';
  if (e.start) {
    const t = e.start.toDate ? e.start.toDate() : new Date(e.start);
    document.getElementById('etkinlik-baslangic').value = tarihInputFormat(t);
  }
  if (e.end) {
    const t = e.end.toDate ? e.end.toDate() : new Date(e.end);
    document.getElementById('etkinlik-bitis').value = tarihInputFormat(t);
  }
  await katilimciSecimDoldur('katilimci-secim', e.attendees || []);
  modalAc('modal-etkinlik');
}

window.etkinlikKaydet = async () => {
  const id = document.getElementById('etkinlik-id').value;
  const baslik = document.getElementById('etkinlik-baslik').value.trim();
  if (!baslik) { toast('Başlık gerekli!', 'hata'); return; }

  const secili = seciliKatilimcilar('katilimci-secim');
  if (!secili.includes(mevcutKullanici.uid)) secili.push(mevcutKullanici.uid);

  const veri = {
    title: baslik,
    description: document.getElementById('etkinlik-aciklama').value.trim(),
    type: document.getElementById('etkinlik-tur').value,
    start: Timestamp.fromDate(new Date(document.getElementById('etkinlik-baslangic').value)),
    end: Timestamp.fromDate(new Date(document.getElementById('etkinlik-bitis').value)),
    attendees: secili,
    recurring: document.getElementById('etkinlik-tekrar').value,
    updatedAt: serverTimestamp()
  };

  try {
    if (id) {
      await updateDoc(doc(db, 'events', id), veri);
      // Google Calendar güncelle
      if (gcalToken) {
        const evSnap = await getDoc(doc(db, 'events', id));
        const gcalId = evSnap.data()?.gCalEventId;
        if (gcalId) await gcalEtkinlikGuncelle(gcalId, { ...veri, start: new Date(document.getElementById('etkinlik-baslangic').value), end: new Date(document.getElementById('etkinlik-bitis').value) });
      }
      toast('Etkinlik güncellendi', 'basari');
    } else {
      veri.createdBy = mevcutKullanici.uid;
      veri.createdAt = serverTimestamp();
      const yeniRef = await addDoc(collection(db, 'events'), veri);
      // Google Calendar senkron
      if (gcalToken) {
        const gcalId = await gcalEtkinlikEkle({ ...veri, start: new Date(document.getElementById('etkinlik-baslangic').value), end: new Date(document.getElementById('etkinlik-bitis').value) });
        if (gcalId) await updateDoc(yeniRef, { gCalEventId: gcalId });
      }
      // Katılımcılara bildirim
      for (const uid of secili) {
        if (uid !== mevcutKullanici.uid) {
          await bildirimGonder(uid, `Yeni etkinlik: ${baslik}`, 'event');
        }
      }
      toast('Etkinlik oluşturuldu' + (gcalToken ? ' (Google Takvim'e eklendi)' : ''), 'basari');
    }
    modalKapat();
    bugunEtkinlikleriYukle();
    takvimCiz();
  } catch (e) { toast('Hata: ' + e.message, 'hata'); }
};

// ─── GÖREVLER ─────────────────────────────────────────────────────────────
async function gorevleriYukle(filtre) {
  const liste = document.getElementById('gorev-listesi');
  liste.innerHTML = '<div class="bos-durum"><p>Yükleniyor...</p></div>';

  let q;
  if (filtre === 'tamamlandi') {
    q = query(collection(db, 'tasks'), where('assignedTo', 'array-contains', mevcutKullanici.uid), where('status', '==', 'done'));
  } else if (filtre === 'benim') {
    q = query(collection(db, 'tasks'), where('createdBy', '==', mevcutKullanici.uid), where('status', '==', 'active'));
  } else {
    q = query(collection(db, 'tasks'), where('assignedTo', 'array-contains', mevcutKullanici.uid), where('status', '==', 'active'));
  }

  const snap = await getDocs(q);
  liste.innerHTML = '';
  if (snap.empty) {
    liste.innerHTML = '<div class="bos-durum"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><p>Görev bulunamadı</p></div>';
    return;
  }

  const gorevler = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  gorevler.sort((a, b) => {
    const onc = { acil: 0, normal: 1, dusuk: 2 };
    return (onc[a.priority] || 1) - (onc[b.priority] || 1);
  });
  gorevler.forEach(g => liste.appendChild(gorevKartOlustur(g)));
}

async function bekleyenGorevleriYukle() {
  const q = query(collection(db, 'tasks'),
    where('assignedTo', 'array-contains', mevcutKullanici.uid),
    where('status', '==', 'active'));
  const snap = await getDocs(q);
  document.getElementById('bekleyen-gorev').textContent = snap.size;
  const liste = document.getElementById('anasayfa-gorev-listesi');
  liste.innerHTML = '';
  if (snap.empty) {
    liste.innerHTML = '<div class="bos-durum"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><p>Bekleyen görev yok</p></div>';
    return;
  }
  const gorevler = snap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, 3);
  gorevler.forEach(g => liste.appendChild(gorevKartOlustur(g)));
}

function gorevKartOlustur(g) {
  const el = document.createElement('div');
  el.className = 'gorev-kart';
  const tamamlandi = g.status === 'done';
  const sonTarih = g.dueDate ? (g.dueDate.toDate ? g.dueDate.toDate() : new Date(g.dueDate)) : null;
  const sonTarihStr = sonTarih ? tarihFormat(sonTarih) : '';
  const gecmis = sonTarih && sonTarih < new Date() && !tamamlandi ? ' style="color:#ff6b6b"' : '';

  el.innerHTML = `
    <div class="gorev-checkbox ${tamamlandi ? 'tamamlandi' : ''}" onclick="gorevToggle('${g.id}', ${tamamlandi})"></div>
    <div class="gorev-icerik">
      <div class="gorev-baslik-metin ${tamamlandi ? 'tamamlandi' : ''}">${g.title || 'Görev'}</div>
      <div class="gorev-meta">
        <span class="oncelik-rozet oncelik-${g.priority || 'normal'}">${oncelikEtiket(g.priority)}</span>
        ${sonTarihStr ? `<span${gecmis}>${sonTarihStr}</span>` : ''}
        ${g.description ? `<span>${g.description.slice(0, 40)}</span>` : ''}
      </div>
    </div>
    ${(g.createdBy === mevcutKullanici.uid || ['admin','manager'].includes(mevcutKullaniciBilgi?.role))
      ? `<button class="gorev-sil-btn" onclick="gorevSil('${g.id}')">✕</button>` : ''}`;
  return el;
}

window.gorevToggle = async (id, tamamlandi) => {
  const yeniDurum = tamamlandi ? 'active' : 'done';
  await updateDoc(doc(db, 'tasks', id), { status: yeniDurum, updatedAt: serverTimestamp() });
  const aktifFiltre = document.querySelector('.filtre-btn.aktif')?.onclick?.toString().match(/'(\w+)'/)?.[1] || 'aktif';
  gorevleriYukle(aktifFiltre);
  bekleyenGorevleriYukle();
};

window.gorevSil = async (id) => {
  if (!confirm('Görevi silmek istiyor musunuz?')) return;
  await deleteDoc(doc(db, 'tasks', id));
  gorevleriYukle('aktif');
  bekleyenGorevleriYukle();
  toast('Görev silindi', 'basari');
};

window.gorevFiltre = (filtre, btn) => {
  document.querySelectorAll('.filtre-btn').forEach(b => b.classList.remove('aktif'));
  btn.classList.add('aktif');
  gorevleriYukle(filtre);
};

window.gorevEkleModal = async () => {
  document.getElementById('gorev-id').value = '';
  document.getElementById('modal-gorev-baslik').textContent = 'Yeni Görev';
  document.getElementById('gorev-baslik').value = '';
  document.getElementById('gorev-aciklama').value = '';
  document.getElementById('gorev-oncelik').value = 'normal';
  const simdi = new Date();
  simdi.setDate(simdi.getDate() + 1);
  document.getElementById('gorev-son-tarih').value = tarihInputFormat(simdi);
  await katilimciSecimDoldur('gorev-katilimci-secim', [mevcutKullanici.uid]);
  modalAc('modal-gorev');
};

window.gorevKaydet = async () => {
  const baslik = document.getElementById('gorev-baslik').value.trim();
  if (!baslik) { toast('Başlık gerekli!', 'hata'); return; }

  const secili = seciliKatilimcilar('gorev-katilimci-secim');
  if (!secili.includes(mevcutKullanici.uid)) secili.push(mevcutKullanici.uid);

  const sonTarihVal = document.getElementById('gorev-son-tarih').value;
  const veri = {
    title: baslik,
    description: document.getElementById('gorev-aciklama').value.trim(),
    priority: document.getElementById('gorev-oncelik').value,
    assignedTo: secili,
    status: 'active',
    createdBy: mevcutKullanici.uid,
    createdAt: serverTimestamp(),
    dueDate: sonTarihVal ? Timestamp.fromDate(new Date(sonTarihVal)) : null
  };

  try {
    await addDoc(collection(db, 'tasks'), veri);
    for (const uid of secili) {
      if (uid !== mevcutKullanici.uid) {
        await bildirimGonder(uid, `Yeni görev atandı: ${baslik}`, 'task');
      }
    }
    toast('Görev oluşturuldu', 'basari');
    modalKapat();
    gorevleriYukle('aktif');
    bekleyenGorevleriYukle();
  } catch (e) { toast('Hata: ' + e.message, 'hata'); }
};

// ─── MESAJLAŞMA ───────────────────────────────────────────────────────────
function kanallariYukle() {
  const q = query(collection(db, 'channels'), where('members', 'array-contains', mevcutKullanici.uid));
  onSnapshot(q, (snap) => {
    const liste = document.getElementById('kanal-listesi');
    liste.innerHTML = '';
    let okunmamisTopla = 0;
    if (snap.empty) {
      liste.innerHTML = '<div class="bos-durum"><p>Henüz kanal yok<br>+ butonu ile oluşturun</p></div>';
      return;
    }
    const kanallar = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    kanallar.forEach(k => {
      const okunmamis = k.unread?.[mevcutKullanici.uid] || 0;
      okunmamisTopla += okunmamis;
      const el = document.createElement('div');
      el.className = 'kanal-kart';
      const tur = k.type === 'dm' ? 'dm' : 'grup';
      const ikon = k.type === 'dm' ? (k.name?.[0] || 'D') : '#';
      const sonMesaj = k.lastMessage || 'Henüz mesaj yok';
      const sonZaman = k.lastMessageAt ? zamanFormat(k.lastMessageAt.toDate ? k.lastMessageAt.toDate() : new Date(k.lastMessageAt)) : '';
      el.innerHTML = `
        <div class="kanal-ikon kanal-ikon-${tur}">${ikon.toUpperCase()}</div>
        <div class="kanal-bilgi">
          <div class="kanal-adi">${k.name || 'Kanal'}</div>
          <div class="kanal-son-mesaj">${sonMesaj}</div>
        </div>
        <div class="kanal-meta">
          ${sonZaman ? `<span class="kanal-zaman">${sonZaman}</span>` : ''}
          ${okunmamis > 0 ? `<span class="kanal-rozet">${okunmamis}</span>` : ''}
        </div>`;
      el.addEventListener('click', () => kanalAc(k));
      liste.appendChild(el);
    });
    const rozet = document.getElementById('nav-mesaj-rozet');
    rozet.textContent = okunmamisTopla;
    rozet.style.display = okunmamisTopla > 0 ? 'flex' : 'none';
    document.getElementById('okunmamis-mesaj').textContent = okunmamisTopla;
  });
}

function kanalAc(k) {
  aktifKanalId = k.id;
  document.getElementById('sohbet-kanal-adi').textContent = (k.type === 'grup' ? '# ' : '') + k.name;
  document.getElementById('sohbet-kanal-uyeler').textContent = `${k.members?.length || 0} üye`;
  panelGoster('panel-sohbet');
  mesajlariYukle(k.id);
  // Okunmamışları sıfırla
  const guncelleme = {};
  guncelleme[`unread.${mevcutKullanici.uid}`] = 0;
  updateDoc(doc(db, 'channels', k.id), guncelleme);
}

function mesajlariYukle(kanalId) {
  if (mesajDinleyici) mesajDinleyici();
  const liste = document.getElementById('mesaj-listesi');
  liste.innerHTML = '';
  const q = query(collection(db, 'channels', kanalId, 'messages'), orderBy('createdAt', 'asc'));
  mesajDinleyici = onSnapshot(q, (snap) => {
    liste.innerHTML = '';
    snap.docs.forEach(d => {
      const m = d.data();
      const benim = m.senderId === mevcutKullanici.uid;
      const zaman = m.createdAt ? zamanFormat(m.createdAt.toDate ? m.createdAt.toDate() : new Date(m.createdAt)) : '';
      const el = document.createElement('div');
      el.className = `mesaj-${benim ? 'benim' : 'diger'}`;
      el.innerHTML = `
        <div class="mesaj-balon">${m.text || ''}</div>
        <div class="mesaj-meta">${benim ? '' : (m.senderName || '') + ' · '}${zaman}</div>`;
      liste.appendChild(el);
    });
    liste.scrollTop = liste.scrollHeight;
  });
}

window.mesajGonder = async () => {
  if (!aktifKanalId) return;
  const input = document.getElementById('mesaj-input');
  const metin = input.value.trim();
  if (!metin) return;
  input.value = '';

  try {
    await addDoc(collection(db, 'channels', aktifKanalId, 'messages'), {
      text: metin,
      senderId: mevcutKullanici.uid,
      senderName: mevcutKullaniciBilgi?.name || mevcutKullanici.displayName,
      createdAt: serverTimestamp()
    });
    // Kanal son mesaj güncelle
    const kanalRef = doc(db, 'channels', aktifKanalId);
    const kanalSnap = await getDoc(kanalRef);
    const uyeler = kanalSnap.data()?.members || [];
    const guncelleme = {
      lastMessage: metin.slice(0, 50),
      lastMessageAt: serverTimestamp()
    };
    uyeler.forEach(uid => {
      if (uid !== mevcutKullanici.uid) {
        guncelleme[`unread.${uid}`] = (kanalSnap.data()?.unread?.[uid] || 0) + 1;
      }
    });
    await updateDoc(kanalRef, guncelleme);
  } catch (e) { toast('Mesaj gönderilemedi', 'hata'); }
};

window.mesajGonderEnter = (e) => { if (e.key === 'Enter') mesajGonder(); };

window.yeniKanalModal = async () => {
  document.getElementById('kanal-adi').value = '';
  document.getElementById('kanal-tur').value = 'grup';
  await katilimciSecimDoldur('kanal-katilimci-secim', []);
  modalAc('modal-kanal');
};

window.kanalOlustur = async () => {
  const ad = document.getElementById('kanal-adi').value.trim();
  if (!ad) { toast('Kanal adı gerekli!', 'hata'); return; }
  const tur = document.getElementById('kanal-tur').value;
  const secili = seciliKatilimcilar('kanal-katilimci-secim');
  if (!secili.includes(mevcutKullanici.uid)) secili.push(mevcutKullanici.uid);

  try {
    await addDoc(collection(db, 'channels'), {
      name: ad,
      type: tur,
      members: secili,
      createdBy: mevcutKullanici.uid,
      createdAt: serverTimestamp(),
      lastMessage: '',
      unread: {}
    });
    toast('Kanal oluşturuldu', 'basari');
    modalKapat();
  } catch (e) { toast('Hata: ' + e.message, 'hata'); }
};

// ─── BİLDİRİMLER ──────────────────────────────────────────────────────────
function bildirimleriDinle() {
  const q = query(collection(db, 'notifications'),
    where('userId', '==', mevcutKullanici.uid),
    orderBy('createdAt', 'desc'));
  onSnapshot(q, (snap) => {
    const okunmamis = snap.docs.filter(d => !d.data().read).length;
    const rozet = document.getElementById('bildirim-rozet');
    rozet.textContent = okunmamis;
    rozet.style.display = okunmamis > 0 ? 'flex' : 'none';
    const liste = document.getElementById('bildirim-listesi');
    liste.innerHTML = '';
    if (snap.empty) {
      liste.innerHTML = '<div style="padding:16px;text-align:center;color:var(--yazi-dim);font-size:13px">Bildirim yok</div>';
      return;
    }
    snap.docs.slice(0, 20).forEach(d => {
      const b = d.data();
      const zaman = b.createdAt ? zamanFormat(b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt)) : '';
      const el = document.createElement('div');
      el.className = `bildirim-item ${b.read ? '' : 'okunmamis'}`;
      el.innerHTML = `
        <div class="bildirim-nokta"></div>
        <div class="bildirim-metin">
          ${b.message || ''}
          <div class="bildirim-zaman">${zaman}</div>
        </div>`;
      el.addEventListener('click', () => {
        updateDoc(doc(db, 'notifications', d.id), { read: true });
        el.classList.remove('okunmamis');
      });
      liste.appendChild(el);
    });
  });
}

async function bildirimGonder(userId, mesaj, tur) {
  await addDoc(collection(db, 'notifications'), {
    userId, message: mesaj, type: tur,
    read: false, createdAt: serverTimestamp()
  });
}

window.bildirimleriOku = async () => {
  const q = query(collection(db, 'notifications'),
    where('userId', '==', mevcutKullanici.uid), where('read', '==', false));
  const snap = await getDocs(q);
  const batch = snap.docs.map(d => updateDoc(doc(db, 'notifications', d.id), { read: true }));
  await Promise.all(batch);
};

// ─── BİLDİRİM PANELİ UI ──────────────────────────────────────────────────
document.getElementById('bildirim-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  bildirimAcik = !bildirimAcik;
  document.getElementById('bildirim-panel').classList.toggle('aktif', bildirimAcik);
});

document.addEventListener('click', (e) => {
  if (!document.getElementById('bildirim-panel').contains(e.target)) {
    bildirimPanelKapat();
  }
});

function bildirimPanelKapat() {
  bildirimAcik = false;
  document.getElementById('bildirim-panel').classList.remove('aktif');
}

// ─── KATILIMCİ SEÇİM YARDIMCISI ───────────────────────────────────────────
async function katilimciSecimDoldur(containerId, seciliIds) {
  if (tumKullanicilar.length === 0) await tumKullanicilariYukle();
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  tumKullanicilar.forEach(u => {
    const chip = document.createElement('button');
    chip.className = 'katilimci-chip' + (seciliIds.includes(u.id) ? ' secili' : '');
    chip.type = 'button';
    const initials = (u.name || 'K').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    chip.innerHTML = `<div class="katilimci-chip-avatar">${initials}</div>${u.name || u.email}`;
    chip.dataset.uid = u.id;
    chip.addEventListener('click', () => chip.classList.toggle('secili'));
    container.appendChild(chip);
  });
}

function seciliKatilimcilar(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} .katilimci-chip.secili`))
    .map(c => c.dataset.uid);
}

// ─── MODAL YÖNETİMİ ───────────────────────────────────────────────────────
function modalAc(id) {
  document.getElementById('modal-overlay').classList.add('aktif');
  document.getElementById(id).classList.add('aktif');
}

window.modalKapat = () => {
  document.getElementById('modal-overlay').classList.remove('aktif');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('aktif'));
};

// ─── TOAST ────────────────────────────────────────────────────────────────
window.toast = (mesaj, tur = '') => {
  const el = document.getElementById('toast');
  el.textContent = mesaj;
  el.className = 'toast aktif ' + tur;
  setTimeout(() => el.classList.remove('aktif'), 2500);
};

// ─── FORMAT YARDIMCILARI ──────────────────────────────────────────────────
function tarihFormat(d) {
  const gunler = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  const aylar = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  return `${gunler[d.getDay()]}, ${d.getDate()} ${aylar[d.getMonth()]}`;
}

function saatFormat(d) {
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function tarihInputFormat(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function zamanFormat(d) {
  const simdi = new Date();
  const fark = simdi - d;
  if (fark < 60000) return 'şimdi';
  if (fark < 3600000) return Math.floor(fark/60000) + 'dk';
  if (fark < 86400000) return Math.floor(fark/3600000) + 's';
  if (fark < 604800000) return Math.floor(fark/86400000) + 'g';
  return d.toLocaleDateString('tr-TR');
}

function turEtiket(tur) {
  const m = { toplanti:'Toplantı', mac:'Maç', antrenman:'Antrenman', idari:'İdari', saglik:'Sağlık', teknik:'Teknik' };
  return m[tur] || tur || 'Etkinlik';
}

function oncelikEtiket(p) {
  const m = { acil:'Acil', normal:'Normal', dusuk:'Düşük' };
  return m[p] || 'Normal';
}


// ─── GOOGLE CALENDAR SENKRON ──────────────────────────────────────────────
const GCAL_CLIENT_ID = '933607213172-4n9ndqod06o9aql5qk9lgf7nde2077f0.apps.googleusercontent.com';
const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
let gcalToken = null;
let gisLoaded = false;
let gsiLoaded = false;
let tokenClient = null;

function gcalKutuphaneleriYukle() {
  // Google Identity Services
  if (!document.getElementById('gsi-script')) {
    const s1 = document.createElement('script');
    s1.id = 'gsi-script';
    s1.src = 'https://accounts.google.com/gsi/client';
    s1.onload = () => {
      gsiLoaded = true;
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GCAL_CLIENT_ID,
        scope: GCAL_SCOPE,
        callback: (resp) => {
          if (resp.error) { toast('Google Takvim bağlantısı başarısız', 'hata'); return; }
          gcalToken = resp.access_token;
          updateDoc(doc(db, 'users', mevcutKullanici.uid), { gcalBagli: true });
          mevcutKullaniciBilgi.gcalBagli = true;
          gcalButonGuncelle(true);
          toast('Google Takvim bağlandı!', 'basari');
        }
      });
    };
    document.head.appendChild(s1);
  }
  // Google API Client
  if (!document.getElementById('gapi-script')) {
    const s2 = document.createElement('script');
    s2.id = 'gapi-script';
    s2.src = 'https://apis.google.com/js/api.js';
    s2.onload = () => {
      gapi.load('client', async () => {
        await gapi.client.init({});
        gisLoaded = true;
      });
    };
    document.head.appendChild(s2);
  }
}

window.gcalBagla = () => {
  if (!gsiLoaded || !tokenClient) {
    toast('Yükleniyor, lütfen bekleyin...', '');
    setTimeout(() => { if (tokenClient) tokenClient.requestAccessToken(); }, 1500);
    return;
  }
  tokenClient.requestAccessToken();
};

window.gcalBaglantiKes = async () => {
  gcalToken = null;
  await updateDoc(doc(db, 'users', mevcutKullanici.uid), { gcalBagli: false });
  mevcutKullaniciBilgi.gcalBagli = false;
  gcalButonGuncelle(false);
  toast('Google Takvim bağlantısı kesildi', 'basari');
};

function gcalButonGuncelle(bagli) {
  const btn = document.getElementById('gcal-btn');
  if (!btn) return;
  if (bagli) {
    btn.textContent = 'Google Takvim Bağlı ✓';
    btn.style.background = 'rgba(0,230,118,0.15)';
    btn.style.borderColor = 'rgba(0,230,118,0.4)';
    btn.style.color = '#00e676';
    btn.onclick = gcalBaglantiKes;
  } else {
    btn.textContent = 'Google Takvim'e Bağla';
    btn.style.background = 'rgba(0,212,255,0.1)';
    btn.style.borderColor = 'rgba(0,212,255,0.3)';
    btn.style.color = '#00d4ff';
    btn.onclick = gcalBagla;
  }
}

async function gcalEtkinlikEkle(etkinlik) {
  if (!gcalToken) return;
  const baslangic = etkinlik.start?.toDate ? etkinlik.start.toDate() : new Date(etkinlik.start);
  const bitis = etkinlik.end?.toDate ? etkinlik.end.toDate() : new Date(etkinlik.end);
  const turRenkMap = {
    toplanti: '9', mac: '10', antrenman: '6', idari: '3', saglik: '4', teknik: '1'
  };
  const gcalVeri = {
    summary: etkinlik.title,
    description: etkinlik.description || '',
    start: { dateTime: baslangic.toISOString(), timeZone: 'Europe/Istanbul' },
    end: { dateTime: bitis.toISOString(), timeZone: 'Europe/Istanbul' },
    colorId: turRenkMap[etkinlik.type] || '1',
    source: { title: 'BS Biomechanics Club', url: window.location.origin }
  };
  try {
    const resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${gcalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(gcalVeri)
    });
    if (!resp.ok) throw new Error('API hatası');
    const data = await resp.json();
    return data.id;
  } catch (e) {
    console.warn('Google Calendar sync hatası:', e);
    return null;
  }
}

async function gcalEtkinlikGuncelle(gcalId, etkinlik) {
  if (!gcalToken || !gcalId) return;
  const baslangic = etkinlik.start?.toDate ? etkinlik.start.toDate() : new Date(etkinlik.start);
  const bitis = etkinlik.end?.toDate ? etkinlik.end.toDate() : new Date(etkinlik.end);
  try {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${gcalId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${gcalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: etkinlik.title,
        description: etkinlik.description || '',
        start: { dateTime: baslangic.toISOString(), timeZone: 'Europe/Istanbul' },
        end: { dateTime: bitis.toISOString(), timeZone: 'Europe/Istanbul' }
      })
    });
  } catch (e) { console.warn('GCal güncelleme hatası:', e); }
}

// ─── SERVICE WORKER KAYIT ─────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
