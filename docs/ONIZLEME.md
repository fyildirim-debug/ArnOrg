# ArnOrg — İş Önizlemesi

Tarih: 2 Ekim 2026 · Durum: önizleme, kod yazılmadı

Görsel ve tıklanabilir sürüm: [`onizleme.html`](onizleme.html)

## Ürün

ArnOrg, Claude Code ajanlarından kurulan bir yazılım şirketidir. Kullanıcı yönetim kuruludur. Proje açar, ne istediğini yazar. CEO ajanı planı çıkarır, gereken rolleri işe alır, işi dağıtır, ekibi yönetir ve kullanıcıya rapor verir.

- Platform: Windows 10/11 ve Linux (x64, arm64)
- Biçim: masaüstü uygulaması + sunucu modu (aynı çekirdek)
- Ajan motoru: değiştirilmemiş Claude Code, Claude Agent SDK üzerinden
- Arayüz dili: Türkçe

## Akış

1. **Proje açılır.** Repo bağlanır ya da sıfırdan açılır; ilk vizyon ve mimari notları `.arnorg/notlar/` altına yazılır.
2. **Brief verilir.** CEO eksikleri sorar, hedefleri ve kabul ölçütlerini çıkarır.
3. **Plan ve kadro.** CEO işi epik ve görevlere böler, bağımlılıkları sıralar, rolleri ve bütçeyi önerir. Kullanıcı onaylar.
4. **İşe alım.** Her rol için kimlik dosyası, model, araç izinleri, bütçe ve kendi git worktree'si olan bir ajan doğar.
5. **Mesai.** Ajanlar görev alır, kod yazar, test çalıştırır, birbirine yazar. CEO günlük durum toplantısını yönetir.
6. **İnceleme ve teslim.** İnceleyici ajan onaylar, testler geçer, iş kullanıcı onayıyla main'e girer. CEO sprint raporunu yazar.

## İncelenen örnekler

| Proje | Aldığımız fikir | Eksik bıraktığı |
|---|---|---|
| Paperclip | İşe alım onayı, heartbeat ile kısa uyanış, atomik görev kilidi, çok düzeyli bütçe ve sert durdurma | Proje hafızası yok, CEO işe alım döngüsü, masaüstü yok, Windows hataları |
| Multica | Electron masaüstü + yerel daemon, Windows'ta yerel; çalışan ajana yön verme; mükerrer çalıştırma birleştirme | Organizasyon modeli zayıf, plan ve hafıza ikinci planda |
| Gas Town | Kalıcı kimlik + kısa oturum, durum git'te, gözcü katmanları, testli birleştirme kuyruğu | tmux bağımlı (Windows'ta WSL), bütçe yok, pahalı, ağır jargon |
| Claude Code Agent Teams | Ajan başına posta kutusu, bağımlılıklı görev listesi, kalite kapısı kancaları | SDK ve `-p` modunda çalışmıyor, sürdürmede ekip kayboluyor |
| Claude Projects / Code sekmesi | Duruma göre dikkat kutusu, satır yorumlu diff, koordinatörden doğan görev kartları | Hiyerarşi, işe alım, rol ve bütçe yok |
| Vibe Kanban / Cline Kanban / Emdash | Kart = worktree + terminal + ajan, bağımlılıkla otomatik başlama, durum kancalardan, worktree havuzu | Planlayan yönetici yok, ajanlar konuşmuyor |
| Conductor | Boşta ajanı kapatıp `--resume`, SQLite tek kaynak, arka planda kontrol noktası | Yalnız macOS, kapalı kaynak |
| CloudCLI / opcode / Claude Squad | SDK + node-pty + WebSocket yığını, maliyet paneli, kontrol noktası zaman çizelgesi | Orkestrasyon yok; opcode durdu; Claude Squad Windows'ta yalnız WSL |
| ChatDev 2.0 / MetaGPT | Roller arası belge devri gevezeliği azaltır | Gerçek repo/PR/inceleme döngüsü yok |
| CrewAI / MS Agent Framework | Görev ve ilerleme defteri, tıkanınca yeniden planlama, kapsamlı hafıza | Kütüphane; kod ajanı ve masaüstü yönetmiyor |

**Dersler:** ekip katmanı ArnOrg'da olmalı; ajanlar kısa uyanışla çalışmalı; CEO önerir, kullanıcı onaylar; bütçe çekirdekte uygulanır; döngü ve tıkanma koruması şart; hafıza repo içinde birinci sınıf; tmux ve bash sarmalayıcısı yok; sade sözlük; her şey kayıtlı ve tekrar oynatılabilir.

## Şirket modeli

- **CEO:** plan, kadro, bütçe, toplantı, rapor. Kod yazmaz. Varsayılan Opus.
- **CTO / takım lideri:** ADR yazar, görevleri teknik olarak böler, standartları belirler.
- **Geliştirici:** backend, frontend, mobil, veri. Kendi worktree'sinde çalışır.
- **Test mühendisi, kod inceleyici.**
- **Uzmanlar:** güvenlik, DevOps, tasarım, teknik yazarlık, araştırma. Gerektiğinde alınır, iş bitince bırakılır.

Çalışan kimliği repo içinde durur ve ajan oturumunun talimatına, izinlerine ve bütçesine çevrilir:

```yaml
# .arnorg/ekip/deniz.md
---
ad: Deniz
rol: backend
model: sonnet
yonetici: kerem
butce_gunluk_usd: 5
araclar: [Read, Edit, Write, Bash, Grep, Glob, arnorg]
yasak: ["git push", "rm -rf", "npm publish"]
beceriler: [api-tasarimi, postgres, vitest]
calisma_alani: arnorg/deniz/*
---
```

## İletişim

Ajanlar ArnOrg'un posta kutusu üzerinden yazışır: kanallar (`#genel`, ekip kanalları), doğrudan mesaj ve anma, görev konuşması, günlük durum toplantısı, kullanıcıya yükseltme. Anılan ajan uyanır; meşgulse mesaj sıradaki turuna eklenir. Kararlar konuşmada kalmaz, ADR olarak notlara taşınır.

ArnOrg MCP araçları: `mesaj_gonder`, `kanal_oku`, `gorev_al`, `gorev_guncelle`, `not_yaz`, `hafiza_ara`, `toplanti_cagir`, `onay_iste`, `birlestir_iste`, `ise_al` (yalnız CEO).

## Canlı denetim

ArnOrg her ajanı Claude Agent SDK ile kendisi başlatır ve Claude Code ile satır satır JSON akan iki yönlü bir kanal açar. Ajanın her mesajı ve araç çağrısı anında gelir; ArnOrg aynı kanaldan izin verir, reddeder, araç girdisini değiştirir, araya mesaj sokar, keser, izin modunu ve modeli değiştirir. Ayrıntılar ve gerçek trafik örnekleri: [`PROTOKOLLER.md`](PROTOKOLLER.md). Denemeler: [`../deneyler/gozcu`](../deneyler/gozcu).

Doğrulanan deneyler (2 Ekim 2026, Claude Code 2.1.287, SDK 0.3.287):

| Deney | Sonuç |
|---|---|
| Politika ile ret | `rm -rf eski` reddedildi, klasör yerinde kaldı |
| Girdiyi değiştirerek onay | Yazılan dosyanın başına ArnOrg damgası eklendi |
| Çalışırken araya girme | Yönetici notu aynı turda işlendi |
| Kesme | Çalışan komut ~20 ms'de durdu, tur `error_during_execution` |
| Bypass modunda denetim | İzin geri çağrısı hiç çalışmadı, `PreToolUse` kancası durdurdu |
| Dışarıda açılan oturum | Kanca köprüsü zincirli `rm -rf`'yi reddetti; gözcü kapalıyken her çağrıyı engelledi |
| ArnOrg aracı | `mesaj_gonder` çağrıldı, mesaj posta kutusuna düştü |

Öğrenilenler:

- Her çağrıyı görmek için `PreToolUse` kancası gerekir; izin geri çağrısı güvenli komutlara ve bypass moduna hiç uğramaz.
- Claude Code uzun komutları kendiliğinden arka plana alabilir; arka plan görevleri ayrıca izlenir.
- Üst oturumun ortam değişkenleri sızarsa alt ajan aynı oturum kimliğini kullanır; her ajan temiz ortamla başlar.
- Süreç erken çıkarsa hata yalnız stderr'dedir; stderr ve süreç çıkışı her zaman izlenir.
- SDK varsayılan olarak boş sistem talimatı gönderir; ajanlara Claude Code talimatı ve rol metni birlikte verilir.
- HTTP kancası gözcü kapalıyken çağrıyı geçirir; dış oturumlarda güvenli kapanan komut köprüsü kullanılır.
- Ajanlar komutları `&&` ile zincirler; politika komutun tamamına bakar.

## Planlama ve yönetişim

- Hedef → epik → görev; her görevin kabul ölçütü var.
- Bağımlılık grafiği; bağımlılığı bitmeyen görev atanmaz.
- Sprint ve sprint raporu.
- Uyandırma kuyruğu: görev, anma ya da zamanlayıcı ile uyanış.
- Bütçe: şirket, proje, ajan; günlük ve aylık; uyarı ve sert durdurma.
- Onay kapıları: işe alım, bütçe artışı, main'e birleştirme, dışarı push, deploy, geri alınamaz komut.

## Notlar, hafıza ve kod

```
siparis-paneli/
├─ .arnorg/
│  ├─ proje.yaml     bütçe, onay kuralları, birleştirme politikası
│  ├─ ekip/          çalışan kimlikleri
│  ├─ notlar/        vizyon, mimari, kararlar (ADR), sözlük
│  └─ hafiza/        ajan günlükleri
├─ CLAUDE.md         ortak kurallar
└─ src/
```

- Her görev `arnorg/<ajan>/<görev>` dalı ve kendi worktree'si.
- İnceleyici ajan onaylamadan iş kuyruğa girmez.
- Birleştirme kuyruğu işleri sırayla main'e alır, testleri yeniden çalıştırır.
- Mesaj, olay ve maliyet kayıtları uygulamanın SQLite veritabanında.

## Kod editörü

ArnOrg'un içinde tam bir kod editörü olur. Her ajanın çalışma alanı ayrı açılır; ajanın yazdığı satırlar anında görünür, testleri terminalde akar, hata işaretleri hem kullanıcıya hem ajana gider.

- **Dosya gezgini ve sekmeler:** worktree başına; ajanın değiştirdiği (M) ve eklediği (A) dosyalar işaretli.
- **Canlı ajan düzenlemesi:** ajanın yazdığı satır imleciyle görünür; satır başı işareti satırı kimin, hangi görevde değiştirdiğini gösterir.
- **Fark ve inceleme:** main ile fark, yan yana ya da satır içi; satır yorumu ajana gider; parça parça kabul/ret.
- **Dil desteği:** renklendirme, otomatik tamamlama, tanıma git, yeniden adlandırma, hata işaretleri (LSP).
- **Terminal:** her çalışma alanında gerçek terminal (xterm.js + node-pty, Windows'ta ConPTY); ajan komutları ayrı sekmede.
- **Arama ve değiştirme:** proje geneli ripgrep araması, düzenli ifade, toplu değiştirme.
- **Git paneli:** dallar, worktree'ler, commit geçmişi, birleştirme kuyruğu, çakışma çözme.
- **Uygulama önizlemesi:** geliştirme sunucusu gömülü tarayıcıda; ajan ekran görüntüsüyle kendi işini kontrol eder.
- **Çakışma koruması:** ajanın düzenlediği dosya kullanıcıya salt okunur; "duraklat ve düzenle" ile kontrol kullanıcıya geçer, kaydedince ajana değişiklik notu gider.
- **Dış editör:** tek tıkla VSCodium, VS Code ya da Cursor'da açma; çalışma alanları sıradan klasörlerdir.

**Editör kararı (2 Ekim 2026):**

- **Bileşen: Monaco.** Stüdyo `http://127.0.0.1` üzerinden yüklendiği için Monaco'nun worker'ları sorunsuz çalışır; masaüstünde paket boyutu (~1,2 MB gzip) önemsiz; VS Code ile aynı kısayollar, minimap ve fark editörü hazır gelir. CodeMirror 6 (daha hafif, parça parça kabul/ret yapabilen birleştirme görünümü, resmi LSP istemcisi) yedek seçenek olarak tutulur.
- **Dil desteği:** dil sunucuları çekirdekte, çalışma alanı ve dil başına, ihtiyaç olunca açılır; editöre WebSocket ile köprülenir (Faz 2).
- **Claude Code IDE protokolü uygulanmaz.** Protokol (`~/.claude/ide/<port>.lock`, WebSocket MCP) yalnız etkileşimli oturumlara bağlanıyor; SDK ajanlarına IDE bağlanamıyor (`ws-ide` türü yapılandırmayla eklenemez). Aynı işler SDK karşılıklarıyla yapılır: değişiklik onayı denetim kapısında, tanılamalar ArnOrg aracıyla, seçili metin mesaja eklenerek.
- **Çakışma:** ajan bir dosyayı düzenlerken kurula salt okunur; kurul kaydedince dosya 30 saniye ajanlara kilitlenir ve ajana "yeniden oku" notu gider. Claude Code da okuduktan sonra değişen dosyayı ajana bildirir.
- **Tam VS Code gömülmez:** code-server'ın Windows sürümü yok, VS Code Server lisansı yeniden dağıtıma izin vermiyor.

## Mimari

- **Stüdyo:** React arayüz; Electron penceresinde ya da tarayıcıda.
- **Çekirdek (arnorg-server):** Node.js 22. Orkestratör, uyandırma kuyruğu, görev durum makinesi, posta kutusu, bütçe ve onay, worktree havuzu, birleştirme kuyruğu, hafıza ve arama, olay günlüğü, arnorg MCP araçları.
- **Ajanlar:** her çalışan bir Claude Agent SDK oturumu; mesajlar akış girdisiyle (`streamInput`) teslim edilir; içeride yerel alt ajanlar serbest.
- **Depolama:** SQLite (WAL), repo içi `.arnorg/`, git worktree'leri; sunucu modunda isteğe bağlı PostgreSQL.

## Teknoloji yığını

| Katman | Seçim |
|---|---|
| Ajan motoru | Claude Agent SDK (TypeScript), sürüm sabit |
| Çekirdek | Node.js 22 LTS + TypeScript |
| Veri | SQLite (better-sqlite3, WAL) + Drizzle, FTS5 |
| Arayüz | React 19, Vite, TanStack Router + Query, Zustand |
| Bileşenler | Monaco, xterm.js, React Flow, react-virtuoso |
| Masaüstü | Electron + electron-builder (NSIS, MSI, AppImage, deb, rpm) |
| Terminal | node-pty (Windows'ta ConPTY) |
| Gözlem | OpenTelemetry + kanca olayları |
| Depo ve CI | pnpm monorepo, GitHub Actions (windows-latest + ubuntu-latest) |

## Windows ve Linux

- Ajanlar tmux ya da bash sarmalayıcısı olmadan başlatılır; kapatmada süreç ağacı sonlanır (`taskkill /T`).
- Bash aracı için Git for Windows denetlenir ve kurulumu yönlendirilir.
- 8.3 yolları uzun yola çevrilir, boşluklu yollar tırnaklanır, `core.longpaths` açılır, satır sonları `.gitattributes` ile sabitlenir.
- Kancalar ve betikler Node ile yazılır.
- Claude Code sandbox'ı Windows'ta yalnız WSL2'de; yerelde izin kuralları ve kanca denetimi.
- Her sürüm iki platformda uçtan uca testten geçer.

## Yol haritası

| Faz | İçerik | Çıktı |
|---|---|---|
| 0 · Temel | Monorepo, çekirdek iskeleti, SQLite şeması, tek çalışan oturumu, gözcü (canlı akış, PreToolUse kapısı, araya girme, kesme, temiz ortam), proje açma, Stüdyo kabuğu, iki platformda CI ve paket | Tek ajanla konuşulan masaüstü uygulaması |
| 1 · Ekip | Rol kataloğu, işe alım, worktree havuzu, arnorg MCP, görev durum makinesi, pano, kanallar, canlı akış, maliyet sayacı | Elle kurulan ekip birlikte çalışır |
| 2 · CEO | Brief → plan → kadro, onay kapıları, uyandırma kuyruğu, toplantı, tıkanma koruması, inceleme ve birleştirme kuyruğu, sprint raporu | Brief'ten main'e giren özellik |
| 3 · Şirket | Bütçe politikaları, hafıza araması, şablonlar, sunucu modu, oturum tekrarı, bildirim, otomatik güncelleme | 1.0 |
| 4 · Genişleme | Eklentiler, AXConnector köprüsü, başka ajan motorları, çoklu şirket | Ekosistem |

## Karar bekleyenler (öneriyle)

0. **Denetim kapısı:** ajanlar tam yetki tercihine uygun olarak bypassPermissions modunda soru sormadan çalışır; her araç çağrısı ArnOrg'un `PreToolUse` kancasından geçer, yalnız "onaya sor" kuralına takılan çağrı kullanıcıya gelir.
1. **Claude'a giriş:** ArnOrg kimlik bilgisine dokunmaz. Kişisel kullanımda ajanlar makinedeki Claude Code girişiyle çalışır; dağıtımda her kullanıcı kendi API anahtarını kullanır. Anthropic üçüncü taraf ürünlerin claude.ai girişi sunmasına izin vermiyor; giriş katmanı değiştirilebilir tutulur.
2. **Masaüstü kabuğu:** Electron (Tauri'de Node yan süreç ve yerel modül paketleme sorunu, Linux WebKitGTK sorunları, güncelleyici deb/rpm desteklemiyor).
3. **Ajanlar arası iletişim:** kendi posta kutumuz; Agent Teams deneysel ve SDK modunda yok.
4. **Ajan oturumu:** kısa uyanış, kalıcı kimlik, sürdürülen oturum.
5. **Git politikası:** ajanlar main'e doğrudan yazmaz; onaylı iş kuyruktan main'e girer, sonra push.
6. **Sunucu modu:** arnex.codes geliştirme sunucusunda systemd hizmeti, Cloudflare Access arkasında.
7. **Arayüz dili:** Türkçe, çeviri dosyalarıyla.

## Kaynaklar

- Paperclip — https://github.com/paperclipai/paperclip
- Multica — https://github.com/multica-ai/multica
- Gas Town — https://github.com/gastownhall/gastown
- Agent Teams — https://code.claude.com/docs/en/agent-teams
- Agent SDK — https://code.claude.com/docs/en/agent-sdk/overview
- Claude Code hukuki koşulları — https://code.claude.com/docs/en/legal-and-compliance
- Conductor yeniden yazımı — https://performance.dev/the-conductor-rewrite
