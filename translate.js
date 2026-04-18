const fs = require('fs');

function replace(file, dict) {
  let content = fs.readFileSync(file, 'utf8');
  for (const [tr, en] of Object.entries(dict)) {
    content = content.split(tr).join(en);
  }
  fs.writeFileSync(file, content, 'utf8');
}

// 1. index.html
replace('frontend/index.html', {
  'lang="tr"': 'lang="en"',
  'title>Treeban': 'title>Treeban',
  'Odaklanarak çalış. Görevleri bağla, listeni paylaş, birlikte tamamla.': 'Focus on work. Connect tasks, share your list, complete together.',
  'Giriş Yap</button>': 'Log In</button>',
  '>Giriş Yap</a>': '>Log In</a>',
  'Giriş Yap</h2>': 'Log In</h2>',
  'Giriş yap</a>': 'Log in</a>',
  '>Üye Ol</a>': '>Sign Up</a>',
  'Üye Ol</button>': 'Sign Up</button>',
  'Üye Ol</h2>': 'Sign Up</h2>',
  'hero-badge">Yeni': 'hero-badge">New',
  'Odaklan.<br/>Bağlantı kur.<br/>Tamamla.': 'Focus.<br/>Connect.<br/>Complete.',
  'Treeban; görevleri hiyerarşik düğümlere bağlayan, gerçek zamanlı işbirliğine izin veren minimize bir görev yöneticisidir.': 'Treeban is a minimalist task manager that connects tasks into hierarchical nodes and allows real-time collaboration.',
  'Ücretsiz Başla': 'Start for Free',
  'Görevler arası bağımlılık': 'Task Dependencies',
  'Treeban kilit algoritması': 'Treeban Lock Algorithm',
  'Gerçek zamanlı işbirliği': 'Real-time Collaboration',
  'Herkese açık profiller': 'Public Profiles',
  'Hesabın yok mu?': 'No account?',
  'E-posta</label>': 'Email</label>',
  'Şifre <span': 'Password <span',
  'Şifre</label>': 'Password</label>',
  'ornek@mail.com': 'example@mail.com',
  'Zaten hesabın var mı?': 'Already have an account?',
  'Kullanıcı Adı <span': 'Username <span',
  '(herkese görünür)': '(publicly visible)',
  'kullanici_adi': 'username',
  '(en az 6 karakter)': '(min 6 chars)',
  'title="Profil"': 'title="Profile"',
  'Çıkış Yap</button>': 'Log Out</button>',
  'Listelerim': 'My Lists',
  'Yükleniyor…': 'Loading...',
  '+ Yeni Liste': '+ New List',
  'Henüz listen yok. Hemen oluştur!': "You don't have any lists yet. Create one now!",
  'Yeni Liste Oluştur': 'Create New List',
  'Liste adı…': 'List name...',
  'Herkese açık profilde göster': 'Show on public profile',
  'Oluştur</button>': 'Create</button>',
  'Görünen Ad</label>': 'Display Name</label>',
  'Hakkında</label>': 'About</label>',
  'Herkese Açık Listeler': 'Public Lists',
  'Herkese açık liste paylaşılmamış.': 'No public lists shared.',
  'Profili Düzenle': 'Edit Profile',
  'Görünen adın…': 'Your display name...',
  'Kendini tanıt…': 'Introduce yourself...',
  'Kaydet</button>': 'Save</button>',
  'Liste</span>': 'List</span>',
  'Görünüm': 'View',
  'Pano\n': 'Board\n',
  'Ağaç\n': 'Tree\n',
  'Paylaşım Ayarları': 'Share Settings',
  'Paylaşım</div': 'Sharing</div',
  'Katılımcılar</div': 'Participants</div',
  'Bağlanıyor…': 'Connecting...',
  'Görevler</h2>': 'Tasks</h2>',
  '+ Görev Ekle': '+ Add Task',
  'Yapılacak<': 'To Do<',
  'Yapılıyor<': 'In Progress<',
  'Tamamlandı<': 'Done<',
  '✓ Bitti': '✓ Done',
  '+ Ekle</button>': '+ Add</button>',
  '+ Düğüm Ekle': '+ Add Node',
  'Otomatik Dizi\n': 'Auto Layout\n',
  'Bağlantı için ⇢ tıkla, ardından hedef düğüme tıkla.': 'Click ⇢ to connect, then click target.',
  '✕ İptal': '✕ Cancel',
  'Yeni paylaşım bağlantısı oluştur:': 'Create a new share link:',
  'Yalnızca Görüntüle': 'View Only',
  'Düzenleyebilir': 'Can Edit',
  'Bağlantı Oluştur': 'Create Link',
  'Görev başlığı…': 'Task title...',
  'Açıklama yaz…': 'Write a description...',
  'Bağımlılıklar<span': 'Dependencies<span',
  '(bunlar bitmeden bu görev kilitli kalır)': '(task remains locked until these are done)',
  'Görevi Sil': 'Delete Task',
  'Yeni Görev': 'New Task',
  'Açıklama (isteğe bağlı)…': 'Description (optional)...',
  'Önce tamamlanması gereken görevler:': 'Tasks that must be completed first:'
});

// 2. main.js
replace('frontend/main.js', {
  "Hoş geldin": "Welcome",
  "◉ Herkese Açık": "◉ Public",
  "◎ Özel": "◎ Private",
  "'Yeni Liste'": "'New List'",
  "Kullanıcı bulunamadı": "User not found",
  "✎ Düzenle": "✎ Edit",
  "◈ Sahip": "◈ Owner",
  "✎ Düzenleyebilir": "✎ Can Edit",
  "👁 Yalnızca Görüntüle": "👁 View Only",
  "'Bağlı'": "'Connected'",
  "'Bağlanıyor…'": "'Connecting...'",
  "'Bağlantı kesildi'": "'Disconnected'",
  "Açıklama var": "Has description",
  "Bağımlılık bitmedi": "Dependencies pending",
  "✓ Bitti": "✓ Done",
  "↗ Detay": "↗ Details",
  "'Misafir'": "'Guest'",
  " (sen)": " (you)",
  "Bağımlılık yok": "No dependencies",
  "Sil?": "Delete?",
  "'Görev'": "'Task'",
  "Düzenle'": "Edit'",
  "Görüntüle'": "View'",
  "Kopyala": "Copy",
  "Henüz paylaşım bağlantısı yok.": "No share links yet.",
  "'Liste'": "'List'",
  "Bağlantı için ⇢ tıkla, ardından hedef düğüme tıkla.": "Click ⇢ to connect, then click target.",
  " → hedef düğüme tıkla": " → click target node",
  "'Yapılacak'": "'To Do'",
  "'Yapılıyor'": "'In Progress'",
  "'Tamamlandı'": "'Done'"
});

// 3. server.js
replace('backend/server.js', {
  "Tüm alanlar zorunludur.": "All fields are required.",
  "Kullanıcı adı 3-30 karakter, sadece harf/rakam/_": "Username must be 3-30 chars, alphanumeric or underscore.",
  "Şifre en az 6 karakter olmalıdır.": "Password must be at least 6 characters.",
  "Bu e-posta zaten kullanılıyor.": "Email is already in use.",
  "Bu kullanıcı adı veya e-posta alınmış.": "Username or email is already taken.",
  "Sunucu hatası.": "Server error.",
  "E-posta ve şifre gerekli.": "Email and password are required.",
  "E-posta veya şifre hatalı.": "Invalid email or password.",
  "Kullanıcı bulunamadı.": "User not found.",
  "Liste bulunamadı.": "List not found.",
  "Bu listeye erişim izniniz yok.": "You do not have permission to access this list.",
  "Sadece sahip düzenleyebilir.": "Only the owner can edit.",
  "Sadece sahip paylaşabilir.": "Only the owner can share.",
  "Yetkisiz.": "Unauthorized."
});

// 4. auth.js
replace('backend/auth.js', {
  "Giriş yapılmamış.": "Not logged in."
});

console.log("Translation complete!");
