// ArnOrg kanca köprüsü
// Claude Code ayar dosyasındaki komut kancası olarak çalışır: kanca girdisini ArnOrg gözcüsüne
// iletir, gözcünün kararını Claude Code'a döndürür. Gözcüye ulaşılamazsa PreToolUse'da
// çağrıyı engeller (çıkış kodu 2). HTTP kancaları bu durumda çağrıyı geçirir; köprü bu açığı kapatır.
//
// Ayar: {"type":"command","command":"node","args":["<yol>/kanca-koprusu.mjs","PreToolUse"],"timeout":300}
// Ortam: ARNORG_GOZCU_URL (varsayılan http://127.0.0.1:47821), ARNORG_AJAN (isteğe bağlı ajan kimliği)

const olay = process.argv[2] || "PreToolUse";
const engelleyici = olay === "PreToolUse";
const adres = (process.env.ARNORG_GOZCU_URL || "http://127.0.0.1:47821") + "/kanca/" + olay;

let girdi = "";
process.stdin.setEncoding("utf8");
for await (const parca of process.stdin) girdi += parca;

try {
  const yanit = await fetch(adres, {
    method: "POST",
    headers: { "content-type": "application/json", "x-arnorg-ajan": process.env.ARNORG_AJAN || "" },
    body: girdi,
    signal: AbortSignal.timeout(290_000),
  });
  if (!yanit.ok) throw new Error(`gözcü ${yanit.status} döndü`);
  const govde = (await yanit.text()).trim();
  if (govde) process.stdout.write(govde);
  process.exit(0);
} catch (hata) {
  if (engelleyici) {
    process.stderr.write(`ArnOrg gözcüsüne ulaşılamadı (${hata.message}); güvenlik gereği engellendi.\n`);
    process.exit(2);
  }
  process.exit(0);
}
