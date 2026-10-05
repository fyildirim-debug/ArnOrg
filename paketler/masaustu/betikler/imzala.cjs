// electron-builder Windows imza kancası (win.signtoolOptions.sign): imzalanacak her dosya için çağrılır
// (uygulama, kaldırıcı, kurulum sihirbazı, MSI). Sağlayıcıyı ARNORG_IMZA ortam değişkeni seçer; boşsa hiçbir şey
// yapılmaz ve paket imzasız çıkar.
//
//   sslcom    SSL.com eSigner (bulut HSM; EV ya da OV). CodeSignTool, CODESIGNTOOL_DIZINI'ndedir (surum.yml indirir).
//             ES_USERNAME, ES_PASSWORD, ES_CREDENTIAL_ID ve ES_TOTP_SECRET gerekir.
//   digicert  DigiCert KeyLocker (bulut HSM). smctl yolda olmalıdır (surum.yml kurar). SM_HOST, SM_API_KEY,
//             SM_CLIENT_CERT_FILE, SM_CLIENT_CERT_PASSWORD ve SM_KEYPAIR_ALIAS gerekir.
//   komut     ARNORG_IMZA_KOMUTU'ndaki komut PowerShell'de çalışır; {dosya} imzalanacak dosyanın tırnaklı yoluyla
//             değişir. Başka sağlayıcılar (Azure Key Vault + AzureSignTool, donanım anahtarlı kendi koşucunuz) için.
//
// Geçerli imzası olan dosyaya (paketteki başka yayıncıların ikilileri) dokunulmaz. Her imzadan sonra Authenticode
// imzası doğrulanır: bazı araçlar başarısızlıkta da 0 koduyla çıkar. İmza tutmazsa paketleme durur; imzalı olması
// beklenen bir sürüm imzasız yayınlanmaz.

const { spawnSync } = require("node:child_process");
const { existsSync, readdirSync } = require("node:fs");
const { basename, join } = require("node:path");

/** Kayıtlarda görünmemesi gereken değerler (GitHub sırları zaten maskeler; yerel çalıştırma için de) */
const GIZLI_DEGISKENLER = ["ES_PASSWORD", "ES_TOTP_SECRET", "SM_API_KEY", "SM_CLIENT_CERT_PASSWORD"];

let imzasizBildirildi = false;
/** Aynı dosya ikinci kez gelirse (çift imza yapılandırması) yeniden imzalanmaz */
const imzalananlar = new Set();

function gizle(metin) {
  let sonuc = metin;
  for (const ad of GIZLI_DEGISKENLER) {
    const deger = process.env[ad];
    if (deger && deger.length >= 4) sonuc = sonuc.split(deger).join("***");
  }
  return sonuc;
}

function gerekli(adlar) {
  const eksik = adlar.filter((ad) => !process.env[ad]);
  if (eksik.length) throw new Error(`İmza: eksik ortam değişkeni: ${eksik.join(", ")}`);
}

function calistir(komut, argumanlar, secenekler = {}) {
  const sonuc = spawnSync(komut, argumanlar, { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...secenekler });
  const cikti = gizle(`${sonuc.stdout ?? ""}${sonuc.stderr ?? ""}`.trim());
  if (sonuc.error) throw new Error(`İmza: ${basename(komut)} çalıştırılamadı: ${sonuc.error.message}`);
  if (sonuc.status !== 0) throw new Error(`İmza: ${basename(komut)} ${sonuc.status} koduyla çıktı.\n${cikti}`);
  return cikti;
}

/** PowerShell tek tırnaklı dizgesi */
const psDizge = (metin) => `'${metin.replace(/'/g, "''")}'`;

/** Klasörde (alt klasörler dahil) adı eşleşen ilk dosya */
function bul(dizin, eslesir, derinlik = 4) {
  if (derinlik < 0 || !existsSync(dizin)) return null;
  const girdiler = readdirSync(dizin, { withFileTypes: true });
  for (const g of girdiler) if (g.isFile() && eslesir(g.name)) return join(dizin, g.name);
  for (const g of girdiler) {
    if (!g.isDirectory()) continue;
    const bulunan = bul(join(dizin, g.name), eslesir, derinlik - 1);
    if (bulunan) return bulunan;
  }
  return null;
}

/** SSL.com eSigner: CodeSignTool'un Java'sı doğrudan çağrılır (.bat, kabukta parolaların kaçışını gerektirirdi) */
function sslcomIleImzala(dosya) {
  gerekli(["CODESIGNTOOL_DIZINI", "ES_USERNAME", "ES_PASSWORD", "ES_CREDENTIAL_ID", "ES_TOTP_SECRET"]);
  const dizin = process.env.CODESIGNTOOL_DIZINI;
  const jar = bul(join(dizin, "jar"), (ad) => /^code_sign_tool.*\.jar$/i.test(ad), 0);
  if (!jar) throw new Error(`İmza: ${dizin}\\jar altında code_sign_tool*.jar yok`);
  // Windows paketi kendi Java'sıyla gelir; bulunamazsa koşucunun Java'sı
  const java = bul(dizin, (ad) => ad.toLowerCase() === "java.exe") ?? (process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin", "java.exe") : "java");
  const e = process.env;
  // conf/code_sign_tool.properties çalışma dizinine göre okunur
  const cikti = calistir(
    java,
    ["-jar", jar, "sign", `-username=${e.ES_USERNAME}`, `-password=${e.ES_PASSWORD}`, `-credential_id=${e.ES_CREDENTIAL_ID}`, `-totp_secret=${e.ES_TOTP_SECRET}`, `-input_file_path=${dosya}`, "-override"],
    { cwd: dizin },
  );
  // CodeSignTool hatada da 0 koduyla çıkabilir; hata satırı varsa doğrulamaya bırakmadan durulur
  if (/^\s*Error:/im.test(cikti)) throw new Error(`İmza: CodeSignTool hatası.\n${cikti}`);
}

/** DigiCert KeyLocker: smctl imzalar ve zaman damgası ekler */
function digicertIleImzala(dosya) {
  gerekli(["SM_HOST", "SM_API_KEY", "SM_CLIENT_CERT_FILE", "SM_CLIENT_CERT_PASSWORD", "SM_KEYPAIR_ALIAS"]);
  calistir("smctl", ["sign", `--keypair-alias=${process.env.SM_KEYPAIR_ALIAS}`, "--input", dosya]);
}

function komutlaImzala(dosya) {
  gerekli(["ARNORG_IMZA_KOMUTU"]);
  const komut = process.env.ARNORG_IMZA_KOMUTU.split("{dosya}").join(psDizge(dosya));
  calistir("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", komut]);
}

/** Authenticode durumu: Valid, NotSigned, HashMismatch… */
function imzaDurumu(dosya) {
  return calistir("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-AuthenticodeSignature -LiteralPath ${psDizge(dosya)}).Status`]).trim();
}

const SAGLAYICILAR = { sslcom: sslcomIleImzala, digicert: digicertIleImzala, komut: komutlaImzala };

exports.default = async function imzala(yapilandirma) {
  const saglayici = (process.env.ARNORG_IMZA ?? "").trim().toLowerCase();
  if (!saglayici) {
    if (!imzasizBildirildi) console.log("  • imza: ARNORG_IMZA tanımlı değil, Windows paketleri imzasız çıkar");
    imzasizBildirildi = true;
    return;
  }
  const imzalayici = SAGLAYICILAR[saglayici];
  if (!imzalayici) throw new Error(`İmza: bilinmeyen sağlayıcı "${saglayici}" (sslcom, digicert ya da komut)`);
  if (process.platform !== "win32") throw new Error("İmza: Windows paketleri yalnız Windows'ta imzalanır");
  // Bulut araçları SHA-256 imzalar; çift imza yapılandırılırsa ikinci tur atlanır
  const dosya = yapilandirma.path;
  if (imzalananlar.has(dosya)) return;
  // Paketteki başka yayıncıların imzalı ikilileri (claude.exe, node-pty'nin OpenConsole.exe'si) kendi imzasıyla kalır
  if (imzaDurumu(dosya) === "Valid") {
    console.log(`  • imza: ${basename(dosya)} zaten imzalı, olduğu gibi kalır`);
    imzalananlar.add(dosya);
    return;
  }
  console.log(`  • imza: ${basename(dosya)} (${saglayici})`);
  imzalayici(dosya);
  const durum = imzaDurumu(dosya);
  if (durum !== "Valid") throw new Error(`İmza: ${basename(dosya)} imzası doğrulanamadı (durum: ${durum || "bilinmiyor"}).`);
  imzalananlar.add(dosya);
};
