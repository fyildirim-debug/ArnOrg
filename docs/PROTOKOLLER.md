# Claude Code protokolleri — ArnOrg denetim başvurusu

ArnOrg'un ajanları çalışırken izleyip denetlemesi için kullandığı her kanalın teknik başvurusu.

- **Sürümler:** Claude Code CLI 2.1.287 · Claude Agent SDK (TypeScript) 0.3.287 · Python SDK 0.2.163 (CLI 2.1.286 ile gelir)
- **Tarih:** 2 Ekim 2026
- **Kaynak:** SDK tip tanımları (`sdk.d.ts`) ve derlenmiş kodu, Python SDK kaynağı, Claude Code belgeleri ve [`deneyler/gozcu`](../deneyler/gozcu) ile yakalanan gerçek trafik.
- **İşaretler:** **[deney]** canlı çalıştırmada görüldü · **[kaynak]** SDK kaynağından okundu · **[belge]** resmi belgeden · **[doğrulanmadı]** çıkarım, denenmedi.

SDK neredeyse her gün yeni sürüm çıkarıyor (her 0.3.N sürümü CLI 2.1.N ile eşleşir). ArnOrg SDK sürümünü sabitler ve her yükseltmede gözcü deneyini yeniden çalıştırır.

---

## 0. Hangi iş hangi kanaldan

| İş | Kanal | Durum |
|---|---|---|
| Ajanı başlatmak, sürdürmek | SDK `query()` → CLI'yı `stream-json` ile başlatır | [deney] |
| Her mesajı canlı görmek | stdout akışı (NDJSON) | [deney] |
| Ajanın durumu (çalışıyor / karar bekliyor / boşta) | `system/session_state_changed` | [deney] |
| Her araç çağrısını durdurmak ya da değiştirmek | `PreToolUse` kancası → `hook_callback` | [deney] |
| İnsan onayı gereken çağrı | `can_use_tool` | [deney] |
| Çalışırken araya mesaj | stdin'e yeni `user` mesajı (`priority`) | [deney] |
| Kesmek | `control_request` → `interrupt` | [deney] |
| İzin modunu, modeli değiştirmek | `set_permission_mode`, `set_model` | [kaynak] |
| ArnOrg araçları (mesaj, görev, not) | süreç içi MCP → `mcp_message` | [deney] |
| Alt ajanlar ve arka plan görevleri | `parent_tool_use_id`, `task_*`, `stop_task` | [deney] kısmen |
| Token kullanımı ve abonelik penceresi | `result.modelUsage`, `rate_limit_event` | [deney] |
| ArnOrg dışında açılan oturumlar | ayar dosyası kancaları + güvenli kapanan köprü, OpenTelemetry, kayıt dosyaları | [deney] köprü; bölüm 9–11 |
| Tekrar oynatma | oturum kayıt dosyası (JSONL) | [kaynak] |

---

## 1. Süreç: başlatma, ortam, kapanış

### 1.1 Komut satırı

SDK her zaman şunu verir **[deney]**:

```
claude --output-format stream-json --verbose --input-format stream-json [koşullu bayraklar]
```

- `-p` verilmez. CLI, stdout bir boru olduğu için etkileşimsiz moda geçer. Özel süreç başlatıcıda stdout'a asla TTY verilmemeli **[kaynak]**.
- Gözcü denemesinde yakalanan tam satır **[deney]**:
  `--max-turns 12 --max-budget-usd 0.4 --model haiku --permission-prompt-tool stdio --setting-sources= --permission-mode default`
- `canUseTool` verilince `--permission-prompt-tool stdio` eklenir; izin soruları kontrol protokolünden gelir.
- Kancalar, alt ajan tanımları, sistem talimatı ve süreç içi MCP sunucuları komut satırında **değil**, ilk `initialize` isteğinde gider.

| Seçenek | Bayrak |
|---|---|
| `model`, `fallbackModel` | `--model`, `--fallback-model` |
| `maxTurns`, `maxBudgetUsd` | `--max-turns`, `--max-budget-usd` |
| `permissionMode` | `--permission-mode` (+ `--allow-dangerously-skip-permissions`) |
| `allowedTools`, `disallowedTools`, `tools` | `--allowedTools`, `--disallowedTools`, `--tools` |
| `settingSources` | `--setting-sources=user,project,local` (boş: hiçbir ayar dosyası okunmaz) |
| `mcpServers` (süreç dışı) | `--mcp-config {...}` |
| `resume`, `forkSession`, `sessionId` | `--resume=`, `--fork-session`, `--session-id=` |
| `additionalDirectories` | `--add-dir`, tekrar eder |
| `includeHookEvents`, `includePartialMessages` | `--include-hook-events`, `--include-partial-messages` |
| `effort`, `thinking` | `--effort`, `--thinking` / `--max-thinking-tokens` |

### 1.2 Ortam değişkenleri

- TypeScript SDK'da `env` seçeneği ortamı **tamamen değiştirir**; verilmezse üst sürecin ortamı aynen geçer **[kaynak]**.
- SDK şunları ekler: `CLAUDE_CODE_ENTRYPOINT=sdk-ts`, `CLAUDE_AGENT_SDK_VERSION`, `CLAUDE_CODE_SDK_READS_SESSION_STATE=1` **[deney]**.
- **Tuzak [deney]:** ArnOrg başka bir Claude Code oturumunun içinden çalışırken üst oturumun `CLAUDE_CODE_SESSION_ID` değişkeni alt ajana geçti ve alt ajan **aynı oturum kimliğini** kullandı. ArnOrg her ajanı temizlenmiş ortamla başlatır: `CLAUDECODE` ve `CLAUDE_*` değişkenleri silinir; `PATH`, `HOME`, vekil sunucu, sertifika ve kimlik doğrulama değişkenleri kalır. Uygulama: `deneyler/gozcu/gozcu.mjs` → `temizOrtam()`.
- **Tuzak [deney]:** Linux'ta root kullanıcısıyla `bypassPermissions` reddedilir (`--dangerously-skip-permissions cannot be used with root/sudo privileges`). Yalıtılmış ortamlarda `IS_SANDBOX=1` gerekir. Sunucu modunda ajanlar root olmayan bir kullanıcıyla çalışmalı.
- Yararlı değişkenler **[kaynak]**: `CLAUDE_CONFIG_DIR` (ayar ve kayıt dizini), `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1` (durum olaylarını SDK dışındaki tüketicilere de gösterir), `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS` (arka plan bekleme tavanı, varsayılan 600000).

### 1.3 Çerçeveleme

- İki yönde de **NDJSON**: her satır tek bir JSON nesnesi **[deney]**.
- TS okuyucu JSON olmayan satırları atlar; Python okuyucu satır başına 1 MiB sınırı uygular **[kaynak]**.
- SDK, `initialize` yazılana kadar diğer yazmaları bekletir.

### 1.4 stderr ve erken çıkış

- **Tuzak [deney]:** CLI erken çıktığında (ör. root'ta bypass) stdout'a hiçbir şey yazmadı; hata yalnız stderr'deydi. Araya kabuk borusu konan bir başlatıcıda gözcü sonsuza kadar bekledi. ArnOrg stderr'i her zaman okur, süreç çıkışını izler ve `initialize` yanıtı için süre tutar.
- TS SDK, stderr'in son 4 KB'ını çıkış hatasına ekler; `stderr` geri çağrısı verilirse parçaları iletir **[kaynak]**.

### 1.5 Kapanış

| Platform | Sıra **[kaynak]** |
|---|---|
| Linux | stdin kapanır → 2 sn → `SIGTERM` → 5 sn → `SIGKILL` |
| Windows | stdin kapanır → 2 sn → 5 sn daha → `SIGKILL` (TerminateProcess); SIGTERM yok |

- `is_error: true` olan bir sonuçtan sonra CLI bilerek sıfır olmayan kodla çıkar **[deney]** (`kesme` senaryosunda çıkış kodu 1).
- **stdin ajan yaşadıkça açık kalmalı.** Girdi akışı biterse SDK, oturum boşa düşünce stdin'i kapatır ve ajan ölür. ArnOrg her ajan için hiç bitmeyen bir girdi akışı tutar **[kaynak]**.
- SDK'nın `spawnClaudeCodeProcess` seçeneğiyle süreç ArnOrg tarafından başlatılabilir; gözcü denemesi ham trafiği bu yolla, kabuk betiği olmadan kaydeder (Windows'ta da çalışır) **[deney]**.

---

## 2. Çıkış akışı (Claude Code → ArnOrg)

### 2.1 Ana mesaj türleri

| `type` | Ne zaman | Önemli alanlar |
|---|---|---|
| `system` / `init` | Oturum başında | `session_id`, `model`, `permissionMode`, `tools`, `mcp_servers` (her biri `{name, status, source}`), `agents`, `skills`, `claude_code_version`, `capabilities` **[deney]** |
| `assistant` | Model yanıtı | `message.content[]`: `text`, `thinking`, `tool_use {id, name, input}`; `parent_tool_use_id` (alt ajandan geliyorsa dolu), `request_id` **[deney]** |
| `user` | Araç sonucu ya da tekrar | `message.content[]`: `tool_result {tool_use_id, content, is_error}`; `tool_use_result` (yapılandırılmış sonuç) **[deney]** |
| `result` | Tur bitti | `subtype`, `is_error`, `num_turns`, `total_cost_usd`, `usage`, `modelUsage`, `permission_denials[]`, `terminal_reason`, `stop_reason`, `duration_ms`, `result` **[deney]** |
| `stream_event` | Yalnız `includePartialMessages` ile | Kısmi model akışı |
| `rate_limit_event` | Abonelik penceresi değişince | `rate_limit_info {status, resetsAt, rateLimitType: "five_hour" …, overageStatus}` **[deney]** |
| `tool_progress` | Uzun araç çalışırken | `tool_use_id`, `tool_name`, `elapsed_time_seconds` **[kaynak]** |
| `tool_use_summary` | Araç grubu özeti | `summary`, `preceding_tool_use_ids` **[kaynak]** |
| `command_lifecycle` | `uuid` taşıyan her girdi mesajı için | `command_uuid`, `state`: `queued`, `started`, `completed`, `cancelled` **[kaynak]** |
| `control_request` / `control_response` | Kontrol protokolü | bölüm 4 |

`result.subtype` değerleri: `success`, `error_during_execution` (kesme dahil **[deney]**), `error_max_turns`, `error_max_budget_usd`, `error_max_structured_output_retries`.

### 2.2 `system` alt türleri

| `subtype` | Anlamı | ArnOrg'da kullanımı |
|---|---|---|
| `session_state_changed` | `state`: `running`, `requires_action`, `idle` **[deney]** | Ajan durum ışığı; `requires_action` = karar bekliyor |
| `task_started` / `task_progress` / `task_updated` / `task_notification` | Alt ajan ve arka plan görevi yaşam döngüsü **[deney]** kısmen | Görev ağacı, takılma tespiti |
| `background_tasks_changed` | Arka plan görevlerinin tam listesi (öncekinin yerine geçer) **[deney]** | Arka plan paneli |
| `thinking_tokens` | Düşünme ilerlemesi tahmini **[deney]** | "Düşünüyor" göstergesi |
| `status` | `compacting`, `requesting`, izin modu değişimi **[kaynak]** | Durum çubuğu |
| `compact_boundary` | Bağlam sıkıştırıldı **[kaynak]** | Kayıt sınırı |
| `api_retry` | API yeniden deneme **[kaynak]** | Sağlık göstergesi |
| `hook_started` / `hook_progress` / `hook_response` | `includeHookEvents` ile kanca olayları **[kaynak]** | Denetim kaydı |
| `permission_denied` | Reddedilen çağrı (kesin kayıt `result.permission_denials`) **[kaynak]** | Denetim kaydı |
| `notification`, `informational` | Kullanıcıya bildirim **[kaynak]** | Bildirim |
| `model_refusal_fallback` | Model reddetti, yedek modele geçti **[kaynak]** | Uyarı |

Belgelenmemiş başka alt türler de akıyor (`task_summary`, `post_turn_summary`, `turn_duration`, `session_title_changed` …) **[deney]**. ArnOrg bilmediği türü ham olarak kaydeder, hata vermez.

---

## 3. Girdi (ArnOrg → Claude Code): mesaj ve araya girme

```json
{"type":"user","message":{"role":"user","content":"Yönetici notu (Kerem): rapor.txt'nin sonuna 'Denetlendi' satırını da ekle."},"parent_tool_use_id":null}
```

- Tur sürerken yeni bir `user` satırı yazmak yeterli; sonucu beklemek gerekmez **[deney]**.
- `priority` **[kaynak]**: `next` (varsayılan) araç turları arasında mevcut tura katılır ya da sıradaki tur olur; `now` çalışan turu keser ve mesajı hemen işler; `later` sona ekler.
- Mesaja `uuid` verilirse kaderi `command_lifecycle` ile izlenir; sıradaki bir mesaj `cancel_async_message {message_uuid}` ile geri çekilir **[kaynak]**.
- Gözcü denemesinde ilk araç çağrısı görülünce gönderilen yönetici notu aynı turda işlendi **[deney]**.

---

## 4. Kontrol protokolü

### 4.1 Zarf

```json
{"type":"control_request","request_id":"9aqi0oi4ynf","request":{"subtype":"interrupt"}}
{"type":"control_response","response":{"subtype":"success","request_id":"9aqi0oi4ynf","response":{"still_queued":[]}}}
```

- İki taraf da istek gönderebilir. Hata yanıtı `{"subtype":"error","request_id":…,"error":"…"}`.
- Bekleyen istek `control_cancel_request` ile geri çekilir **[kaynak]**.
- **İzin isteğinin zaman aşımı yok; yanıtlanmayan kanca turu kilitler [kaynak].** ArnOrg her karar için kendi süresini tutar.

### 4.2 `initialize` (ArnOrg'un ilk yazdığı satır)

```json
{"subtype":"initialize",
 "hooks":{"PreToolUse":[{"hookCallbackIds":["hook_0"]}],"PostToolUse":[{"hookCallbackIds":["hook_1"]}],"Stop":[{"hookCallbackIds":["hook_2"]}]},
 "sdkMcpServers":["arnorg"],
 "systemPrompt":[""]}
```
**[deney]** Kancalar matcher (isteğe bağlı) ve `timeout` (saniye) alabilir. Diğer alanlar: `agents`, `appendSystemPrompt`, `skills`, `forwardSubagentText`, `agentProgressSummaries`, `title`.

- **Tuzak [kaynak][deney]:** sistem talimatı verilmezse SDK **boş** talimat gönderir (`"systemPrompt":[""]`). Ajanlara Claude Code'un kendi talimatı için `systemPrompt: {type: "preset", preset: "claude_code", append: "<ArnOrg rol metni>"}` verilmeli.
- Yanıt **[deney]**: `commands`, `agents`, `models`, `account`, `pid`, `current_permission_mode`, `hooks_applied`, `session_state`, `capabilities`. `account` hesap bilgisi içerir; kayıtlara yazılmaz.

### 4.3 ArnOrg → Claude Code istekleri

| `subtype` | Alanlar | Yanıt | Kullanım |
|---|---|---|---|
| `interrupt` | `cancel_queued?` | `{still_queued: []}` **[deney]** | Kes |
| `set_permission_mode` | `mode` | `{mode}` + `system/status` | Plan moduna al, tam yetki ver |
| `set_model` | `model` | `{}` | Modeli değiştir |
| `set_max_thinking_tokens` | `max_thinking_tokens` | `{}` | Düşünme token sınırı |
| `stop_task` | `task_id` | `{}` + `task_notification: stopped` | Arka plan görevini durdur |
| `background_tasks` | `tool_use_id?` | `{backgrounded}` | Ön plandaki işi arka plana al |
| `rewind_files` | `user_message_id`, `dry_run?` | `{canRewind, filesChanged, insertions, deletions}` | Dosyaları geri sar (kontrol noktası açıkken) |
| `get_context_usage` | `detail?` | bağlam doluluğu | Bağlam göstergesi |
| `mcp_status`, `mcp_set_servers`, `mcp_toggle`, `mcp_reconnect` | — | — | MCP yönetimi |
| `cancel_async_message` | `message_uuid` | `{cancelled}` | Sıradaki mesajı geri çek |
| `apply_flag_settings`, `update_settings` | `settings` | `{}` | Çalışırken ayar değiştir |

Tip tanımlarında 40 civarında alt tür var; listelenmeyenler iç kullanım ya da kararsız **[kaynak]**.

### 4.4 Claude Code → ArnOrg istekleri

**`can_use_tool`** — izin sorusu **[deney]**:
```json
{"subtype":"can_use_tool","tool_name":"Bash","display_name":"Bash",
 "input":{"command":"rm -rf eski","description":"Remove old directory"},
 "description":"Remove old directory",
 "permission_suggestions":[
   {"type":"addRules","rules":[{"toolName":"Bash","ruleContent":"rm -rf eski"}],"behavior":"allow","destination":"localSettings"},
   {"type":"addDirectories","directories":[".../eski"],"destination":"session"},
   {"type":"setMode","mode":"acceptEdits","destination":"session"}],
 "blocked_path":".../eski",
 "tool_use_id":"toolu_01T7GgMDAmikcgtCzczg3UqV"}
```
MCP araçlarında `mcp_server: {"name":"arnorg","source":"sdk"}` da gelir. Güven kararı `source` alanına göre verilir, araç adına göre değil **[kaynak]**.

Yanıtlar **[deney]**:
```json
{"behavior":"allow","updatedInput":{"file_path":".../rapor.txt","content":"# ArnOrg damgası: denetlendi\n..."},"toolUseID":"toolu_01TR..."}
{"behavior":"deny","message":"ArnOrg politikası: rm -rf yasak.","toolUseID":"toolu_01At..."}
```
`deny` ile `interrupt: true` verilirse tur da durur. `updatedPermissions` ile öneriler kalıcı kurala çevrilir.

**`hook_callback`** — kayıtlı kanca çalıştı **[deney]**:
```json
{"subtype":"hook_callback","callback_id":"hook_0","tool_use_id":"toolu_01At...",
 "input":{"session_id":"195c602f-…","transcript_path":"…","cwd":"…","prompt_id":"…","permission_mode":"default",
          "hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"rm -rf eski"},"tool_use_id":"toolu_01At..."}}
```
Yanıt (bypass modunda ret) **[deney]**:
```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"ArnOrg: rm -rf yasak (kanca)"}}
```
`PostToolUse` girdisinde ek olarak `tool_response` ve `duration_ms`; `Stop` girdisinde `last_assistant_message`, `background_tasks`, `stop_hook_active` gelir **[deney]**.

**`mcp_message`** — süreç içi ArnOrg aracı çağrıldı **[deney]**:
```json
{"subtype":"mcp_message","server_name":"arnorg",
 "message":{"jsonrpc":"2.0","id":2,"method":"tools/call",
            "params":{"name":"mesaj_gonder","arguments":{"alici":"ada","metin":"iş bitti"},
                      "_meta":{"claudecode/toolUseId":"toolu_015V...","progressToken":2}}}}
```
Yanıt: `{"mcp_response":{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"Mesaj ada kişisinin kutusuna bırakıldı."}]}}}`.

Diğerleri **[kaynak]**: `elicitation` (MCP sunucusu kullanıcıdan bilgi istiyor), `request_user_dialog` (ajan soru soruyor).

---

## 5. Denetim kapısı: `canUseTool` mı, kanca mı

| | `canUseTool` (`can_use_tool`) | `PreToolUse` kancası (`hook_callback`) |
|---|---|---|
| Ne zaman çalışır | Yalnız Claude Code izin soracaksa | **Her** araç çağrısında |
| Güvenli komutlar (`echo`, `sleep`, dosya okuma) | Uğramaz **[deney]** | Yakalar **[deney]** |
| `bypassPermissions` modu | **Hiç çalışmaz** **[deney]** | Çalışır, reddedebilir **[deney]** |
| `allowedTools` ya da ayar dosyasındaki izin kuralı | Gölgelenir; SDK `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` uyarısı verir **[kaynak]** | Etkilenmez |
| Kararlar | `allow` (+ `updatedInput`, `updatedPermissions`), `deny` (+ `interrupt`) | `allow`, `deny`, `ask`, `defer` (+ `updatedInput`, `additionalContext`) |
| Sonucu değiştirme | — | `PostToolUse` → `updatedToolOutput` (ör. çıktıdaki gizli değeri silmek) **[kaynak]** |

**ArnOrg kararı:** ana kapı `PreToolUse` kancasıdır (matcher boş ya da `*`). Ajanlar tam yetki tercihine uygun olarak `bypassPermissions` modunda soru sormadan çalışır; yıkıcı komut, gizli dosya, çalışma alanı dışı yazma ve dışarı push kuralları kancada uygulanır. "Onaya sor" kuralına takılan çağrıda kanca, ArnOrg arayüzünde sizin kararınızı bekler; bekleme süresi kanca `timeout` değeriyle sınırlanır ve süre dolunca politika gereği reddedilir **[doğrulanmadı: uzun süren kanca beklemesi]**.

Matcher kuralları **[kaynak]**: boş, `""` ya da `*` her şeyi eşler; `Bash|Write` gibi düz ad listesi tam eşleşir; diğerleri çapasız düzenli ifade olarak denenir.

---

## 6. Alt ajanlar ve arka plan görevleri

- Alt ajandan gelen mesajlarda `parent_tool_use_id`, onu başlatan `Agent` çağrısının kimliğidir; ana akışta `null` **[kaynak]**.
- Varsayılan olarak alt ajanın yalnız araç çağrıları iletilir; tam metin için `forwardSubagentText: true` **[kaynak]**.
- Kanca girdileri, izin istekleri ve retler alt ajanda `agent_id` taşır; `SubagentStart` / `SubagentStop` kancaları alt ajanı çevreler **[kaynak]**.
- **Tuzak [deney]:** uzun süren bir `Bash` komutunu Claude Code kendiliğinden arka plana aldı (`Command running in background with ID: …`), `task_started` ve `background_tasks_changed` yayımladı ve turu bitirdi. ArnOrg arka plan görevlerini ayrı bir liste olarak izler; `stop_task` ile durdurur.
- Kesme varsayılan olarak arka plandaki alt ajanları da öldürür; `perTaskStopAffordance: true` ile ayrı tutulur **[kaynak]**.
- Sınırlar **[belge]**: alt ajan iç içe derinliği 3 (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`), eşzamanlı 20 (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`).

---

## 7. Oturumlar

- `session_id` CLI tarafından üretilir; `sessionId` ile verilebilir; `CLAUDE_CODE_SESSION_ID` ortamdaysa ondan alınır **[deney]**.
- Kayıt dosyası: `${CLAUDE_CONFIG_DIR:-~/.claude}/projects/<cwd'nin harf-rakam dışı karakterleri '-' yapılmış hali>/<session_id>.jsonl`; alt ajanlar `…/<session_id>/subagents/agent-<agentId>.jsonl` **[kaynak]**.
- Sürdürme `resume`, çatallama `forkSession`, belirli bir mesaja kadar sürdürme `resumeSessionAt` **[kaynak]**.
- `/clear` ve plan modundan çıkış `conversation_reset` yayımlar; ArnOrg yeni kayıt başlatır **[kaynak]**.
- `SessionStore` (alfa) kayıtları başka bir depoya aynalar; sunucu modunda oturumu başka makinede sürdürmek için **[kaynak]**.
- SDK yardımcıları: `listSessions`, `getSessionMessages`, `listSubagents`, `getSubagentMessages`, `forkSession`, `tagSession` **[kaynak]**.

---

## 8. Kullanım ve limitler

- `result.modelUsage` **birikimli**dir; her sonuçta üzerine yazılır, toplanmaz **[kaynak]**. ArnOrg oturum başına son toplamı saklar, yalnız farkı sayar.
- `modelUsage[model]` **[deney]**: `inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`, `thinkingTokens`, `contextWindow`. ArnOrg girdi, çıktı ve önbellek yazımını token olarak sayar; önbellekten okuma sayılmaz.
- Abonelikte sınır 5 saatlik ve haftalık pencerelerdir; `rate_limit_event` bunları bildirir **[deney]**. ArnOrg kurulun belirlediği yüzdede ajanları durdurur, pencere açılınca sürdürür.
- ArnOrg yalnız Claude aboneliğiyle çalışır: sonuç mesajındaki tutar alanlarını kullanmaz, `maxBudgetUsd` geçmez, API anahtarını ve bulut sağlayıcı değişkenlerini ajan ortamına vermez.

---

## 9. Ayar dosyası kancaları: ArnOrg dışında açılan oturumlar

SDK yalnız ArnOrg'un başlattığı ajanları denetler. Makinede elle açılmış bir Claude Code oturumunu (terminal, IDE, masaüstü uygulaması, arka plan ajanı) hem izleyip hem durdurabilen tek kanal ayar dosyası kancalarıdır **[belge]**.

### 9.1 Nereye yazılır

| Yer | Kapsam |
|---|---|
| `~/.claude/settings.json` (Windows: `%USERPROFILE%\.claude\settings.json`) | Kullanıcının tüm oturumları. Dış oturumları denetlemenin yolu. |
| `.claude/settings.json`, `.claude/settings.local.json` | Proje |
| Yönetilen ayar: `/etc/claude-code/managed-settings.json`, `C:\Program Files\ClaudeCode\managed-settings.json` | Makine geneli; kullanıcı kapatamaz |
| `--settings <dosya-ya-da-json>` | Tek oturum; ArnOrg'un ajan başına kanca vermesi için en iyi yer |
| Eklenti `hooks/hooks.json`, beceri ve alt ajan ön bilgisindeki `hooks:` | Eklenti, beceri ya da alt ajan çalışırken |

- Etkileşimli oturumlar çalışma alanı güveni onaylanana kadar kancaları bekletir; `-p` ve SDK oturumları klasörü güvenilir sayar **[belge]**.
- Ayar dosyası değişince kancalar yeniden başlatmadan yüklenir **[belge]**.

### 9.2 Önemli olaylar

| Olay | Ne zaman | Durdurabilir mi | Çıktı |
|---|---|---|---|
| `PreToolUse` | Her araç çağrısından önce | **Evet** | `permissionDecision`: `allow`/`deny`/`ask`/`defer`, `updatedInput`, `additionalContext` |
| `PermissionRequest` | Yalnız izin penceresi açılacaksa | Evet (yalnız JSON ile) | `decision {behavior, updatedInput, updatedPermissions, message, interrupt}` |
| `PostToolUse` | Araç başarıyla bitti | Hayır (araç çalıştı) | `updatedToolOutput`, `additionalContext`, `decision:"block"` |
| `PostToolBatch` | Paralel araç grubu bitti | Evet (döngüyü durdurur) | `continue:false` |
| `Stop` / `SubagentStop` | Ajan yanıtını bitirdi | Evet (devam ettirir) | `decision:"block"` + `reason` ajanın sonraki talimatı olur; art arda en çok 8 |
| `StopFailure` | Tur API hatasıyla bitti | Hayır | — |
| `Notification` | İzin bekliyor (~6 sn), boşta (~60 sn) | Hayır | — |
| `SubagentStart` | Alt ajan başladı | Hayır | `additionalContext` alt ajana gider |
| `UserPromptSubmit` | Kullanıcı mesaj gönderdi | Evet | `additionalContext`, `decision:"block"` |
| `SessionStart` / `SessionEnd` | Oturum açıldı / kapandı | Hayır | `SessionStart` için HTTP kancası yok |
| `PreCompact`, `FileChanged`, `WorktreeCreate`, `PreModelSwitch` | — | Kısmen | — |

Tüm kancaların ortak girdisi: `session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`; alt ajanda `agent_id`, `agent_type` **[belge]**. Toplam 30'dan fazla olay ve beş işleyici türü var: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

### 9.3 Çıkış kodları ve HTTP yanıtları

| Durum | Sonuç **[belge]** |
|---|---|
| Çıkış 0 | Başarılı; stdout `{…}` ise JSON olarak okunur |
| Çıkış 2 | Engeller; `permissionDecision: allow` dese bile. Neden olarak stderr ajana gider |
| Diğer kodlar (1 dahil) | **Engellemez**, uyarı verip devam eder. Bulunamayan betik (127) politikayı sessizce kapatır |
| HTTP 2xx + JSON | Aynı çıktı şeması |
| HTTP 2xx boş | "Görüş yok" |
| HTTP 2xx dışı, bağlantı hatası, zaman aşımı | **Çağrı geçer** (fail-open) |

- Eşleşen kancalar **paralel** çalışır. `PreToolUse`'da öncelik: `deny` > `defer` > `ask` > `allow` **[belge]**.
- Varsayılan zaman aşımı 600 sn. Komut ve HTTP kancası zaman aşımına uğrarsa çağrı geçer; SDK'nın süreç içi kancası zaman aşımına uğrarsa çağrı **engellenir** **[belge]**.

### 9.4 Güvenli kapanan kanca köprüsü [deney]

HTTP kancası gözcü kapalıyken çağrıyı geçirdiği için ArnOrg dış oturumlarda `PreToolUse` için komut kancası kullanır: [`deneyler/gozcu/kanca-koprusu.mjs`](../deneyler/gozcu/kanca-koprusu.mjs) girdiyi gözcüye iletir, kararı döndürür, gözcüye ulaşamazsa 2 koduyla çıkar.

```json
{"hooks":{"PreToolUse":[{"matcher":"*","hooks":[{"type":"command","command":"node","args":["<yol>/kanca-koprusu.mjs","PreToolUse"],"timeout":300}]}]}}
```

[`dis-oturum.mjs`](../deneyler/gozcu/dis-oturum.mjs) ile `claude -p` doğrudan, SDK olmadan, bypassPermissions modunda çalıştırıldı:

| Tur | Ne oldu |
|---|---|
| Gözcü açık | Ajan `echo merhaba > selam.txt && rm -rf eski` zincirini denedi; gözcü **komutun tamamını** reddetti. Ajan `echo`'yu ayrı çalıştırdı; gözcü çağrının öncesini ve sonrasını canlı gördü. `eski/` yerinde kaldı. |
| Gözcü kapalı | Köprü `echo` ve `rm -rf` çağrılarının ikisini de engelledi; ajan "gözcüye ulaşılamıyor" diye durdu. |

**Ders [deney]:** ajanlar komutları `&&` ile zincirler. Yasak listesi komutun tamamına bakar; izin listesi yazılacaksa zincir parçalanıp her parça ayrı değerlendirilir.

### 9.5 Windows notları [belge]

- Kabuk biçimindeki kancalar Git Bash ile, yoksa PowerShell ile çalışır. `args` ile verilen biçim gerçek bir `.exe` ister: `node`, `powershell.exe`. `npx` gibi `.cmd` sarmalayıcıları çalışmaz.
- `tool_input.file_path` ters eğik çizgiyle gelir; eşleştirmeden önce normalleştirilir.
- Git Bash yoksa `Bash` yerine `PowerShell` aracı gelir; matcher `Bash|PowerShell` yazılır.
- Kabuk profili stdout'a bir şey yazarsa JSON bozulur; ArnOrg köprüsü `node` ile doğrudan çalışır.

---

## 10. Gözlem kanalları

### 10.1 OpenTelemetry [belge]

```bash
CLAUDE_CODE_ENABLE_TELEMETRY=1
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_PROTOCOL=http/json      # varsayılanı yok, verilmeli
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
OTEL_RESOURCE_ATTRIBUTES=arnorg.ajan=deniz,arnorg.gorev=T-24,arnorg.proje=siparis-paneli
```

| Metrik | Birim | Not |
|---|---|---|
| `claude_code.cost.usage` | USD | `model`, `query_source` (ana / alt ajan), `agent.name`, `mcp_tool.name` |
| `claude_code.token.usage` | token | `type`: input, output, cacheRead, cacheCreation |
| `claude_code.lines_of_code.count` | — | eklenen, silinen |
| `claude_code.commit.count`, `pull_request.count` | — | — |
| `claude_code.code_edit_tool.decision` | — | düzenleme kararları |
| `claude_code.session.count`, `active_time.total` | — | — |

Önemli olaylar: `api_request` (`cost_usd`, token sayıları), `tool_result` (`tool_use_id`, `success`, `duration_ms`, `decision_source`), `tool_decision` (`accept`/`reject`, kaynak: `config`, `hook`, `user_*`), `api_error`, `api_retries_exhausted`, `permission_mode_changed`, `subagent_completed`, `compaction`.

- Araç başlangıcı için olay yok; canlı akış kancalardan ya da beta izlerden (`CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`) gelir.
- SDK ve `-p` modunda ArnOrg kendi `TRACEPARENT` değerini verirse Claude Code'un izleri ArnOrg'un izine bağlanır.
- `OTEL_*` değişkenleri proje ayar dosyasında yok sayılır ve Claude Code'un başlattığı alt süreçlerden silinir.
- Dış oturumlar için OTel ayarı `~/.claude/settings.json` içindeki `env` alanına yazılır; ArnOrg verileri `session.id` ile kanca kayıtlarına bağlar.

### 10.2 Oturum kayıt dosyaları [belge][yerel inceleme]

- Yer: `~/.claude/projects/<kodlanmış-cwd>/<session_id>.jsonl`; alt ajanlar `…/<session_id>/subagents/agent-<id>.jsonl` ve yanında `agent-<id>.meta.json`.
- Satır türleri: `user`, `assistant`, `attachment`, `system`, `queue-operation`, `last-prompt` ve sürüme göre değişen başkaları. Alanlar: `uuid`, `parentUuid` (ağaç; geri sarma ve çatallamada dallanır), `isSidechain`, `sessionId`, `timestamp`, `gitBranch`, `message` (ham API mesajı ve `usage`).
- **Bir API yanıtı içerik bloğu başına bir satır olarak yazılır ve `usage` her satırda tekrar eder.** Token toplanmadan önce `message.id` ile tekilleştirilir.
- Dosya yalnız eklenir; canlı izlenebilir. Son satır yarım olabilir, yazım gecikmelidir, `/clear` yeni dosya açar. Biçim resmi olarak iç kullanımdır; ArnOrg ayrıştırıcıyı sürüme bağlar.
- Kayıt dosyası makinedeki her oturum için vardır; dış oturumları ayarsız görmenin tek yolu budur (CloudCLI bu yöntemi kullanıyor).

### 10.3 Durum satırı [belge]

Etkileşimli oturumda durum satırı betiğine her mesajdan sonra JSON verilir: `session_id`, `model`, `cost.total_cost_usd`, `cost.total_lines_added/removed`, `context_window.used_percentage`, `rate_limits.five_hour.used_percentage`, `rate_limits.seven_day.used_percentage` ve `resets_at`. Bu JSON'u ArnOrg'a ileten bir durum satırı betiği, dış oturumların token kullanımını ve abonelik penceresini pasif olarak toplar. `-p` ve SDK modunda çalışmaz.

### 10.4 Arka plan ajanları [belge][yerel]

`claude agents --json` makinedeki oturumları listeler; dışarıda açılmış etkileşimli oturumlar da görünür:

| Alan | Değerler |
|---|---|
| `kind` | `interactive`, `background` |
| `state` (arka plan) | `working`, `blocked`, `done`, `failed`, `stopped` |
| `status` (süreç canlıysa) | `busy`, `waiting`, `idle` |
| `waitingFor` | `permission prompt`, `input needed`, `sandbox request`, `worker request`, `dialog open` |
| `sessionId`, `name`, `pid`, `cwd`, `startedAt` | — |

Dışarıdan yapılabilenler: listeleme, `claude stop|respawn|rm|attach <id>`. İzin vermek ya da mesaj eklemek mümkün değil. Takılan ajanı bulmak için en temiz sinyal `state: blocked` + `waitingFor`.

---

## 11. Diğer kanallar

| Kanal | Ne yapar | ArnOrg için |
|---|---|---|
| `--permission-prompt-tool <mcp aracı>` | İzin sorusunu bir MCP aracına yollar; girdi `{tool_name, input, tool_use_id}`, çıktı tek metin bloğunda `{"behavior":"allow","updatedInput":…}` ya da `deny`. Geçersiz çıktı ret sayılır **[belge]** | SDK zaten `stdio` biçimini kullanır; ayrıca gerekmez |
| `--permission-prompts none` | Soru gerektiren her şeyi reddeder (2.1.259+) **[belge]** | Gözetimsiz işlerde güvenli varsayılan |
| Oturumlar arası mesaj (`ListAgents`, `SendMessage`) | Aynı makinedeki oturumlar arasında soket ya da adlandırılmış boru; mesaj biçimi belgelenmemiş; mesajlar hiçbir şeyi onaylayamaz **[belge]** | Üzerine kurulmaz. ArnOrg ajanlarında `crossSessionInbound: "refuse"` |
| Remote Control | Yalnız claude.ai girişiyle; üçüncü taraf API'si yok **[belge]** | Yalnız insan için acil durum kapısı |
| Channels (araştırma önizlemesi) | MCP sunucusu oturuma mesaj itebilir, izin onay/ret iletebilir (girdi değiştiremez); başlatırken bayrak gerekir **[belge]** | Şimdilik kullanılmaz |
| Mods (2.1.287 ile yeni) | Süreç içi JS eklentisi: `tool.call`, `tool.check`, `$.prompt.submit` (mesaj ekle), `$.turn.abort` (kes), `$.session.usage()` (kullanım), `$.http.fetch`. `CLAUDE_CODE_PLUGIN_DIRS` ile yüklenir **[belge]** | Dış etkileşimli oturumlarda en zengin denetim yüzeyi; çok yeni, deneysel bayrak arkasında |

---

## 12. ACP ve diğer ajan motorları

ACP (Agent Client Protocol), düzenleyici ya da orkestratör ile kod ajanı arasında stdio üzerinden JSON-RPC 2.0 konuşan açık protokoldür. Sürüm 1 kararlı, sürüm 2 taslak **[belge]**.

- Temel yöntemler: `initialize`, `session/new`, `session/prompt`, `session/cancel`, `session/update` bildirimleri (`agent_message_chunk`, `tool_call`, `tool_call_update`, `plan`, `usage_update`), `session/request_permission` (seçenekten seçme: `allow_once`, `allow_always`, `reject_once`, `reject_always`), `fs/*`, `terminal/*`.
- Claude Code'un yerel ACP modu yok. `@agentclientprotocol/claude-agent-acp` bağdaştırıcısı Agent SDK'yı sarar **[kaynak]**.
- Sınırlar: izin isteği yalnız seçenek seçer, girdi değiştiremez; yalnız soru soracak çağrılar sorulur.
- ACP konuşan diğer ajanlar: Gemini CLI (`--acp`, yerel), Codex (`codex-acp` bağdaştırıcısıyla), GitHub Copilot CLI, Cursor CLI, OpenCode ve başkaları.

| | ACP | Agent SDK / kontrol protokolü |
|---|---|---|
| Birden çok sağlayıcı | Evet | Yalnız Claude |
| Her çağrıyı durdurma | Hayır (yalnız sorulanlar) | **Evet** (`PreToolUse` geri çağrısı) |
| Girdiyi değiştirme | Hayır | **Evet** |
| Kontrol yüzeyi | prompt, iptal, mod | kesme, mod, model, bağlam, MCP, geri sarma, görev durdurma… |
| Sürüm takibi | Bağdaştırıcı her CLI sürümünü yakalamalı | Anında |

**ArnOrg kararı:** Claude ajanları SDK ile tam denetimde kalır. Faz 4'te ACP istemcisi eklenir ve Gemini, Codex gibi başka motorlar aynı panodan yönetilir.

---

## 13. Mevcut araçlar nasıl denetliyor

| Ürün | Yöntem | Canlı denetim |
|---|---|---|
| Vibe Kanban | Kontrol protokolünü Rust ile kendisi uyguluyor; oturumu bypass modunda açıp her çağrıyı `PreToolUse` geri çağrı kancasıyla durduruyor | Tam |
| Paperclip | `claude --print … stream-json`, varsayılan olarak izinler atlanıyor; ACP motoru seçeneği | Yalnız izleme |
| Multica | `-p … --permission-mode bypassPermissions`; gelen her kontrol isteğine izin veriyor | Yalnız izleme |
| CloudCLI | Kendi oturumları SDK + `canUseTool` → WebSocket → arayüz; dış oturumları kayıt dosyalarından salt okunur izliyor | Kendi oturumlarında tam |
| Conductor | Agent SDK (ikincil kaynaklara göre) | Tam |

Hiçbiri dışarıda açılmış bir oturuma canlı bağlanmıyor. ArnOrg'un yaklaşımı Vibe Kanban'ınkiyle aynı ve bunun üstüne dış oturumlar için güvenli kapanan kanca köprüsünü ekliyor.

---

## 14. ArnOrg'un denetim yığını

| İş | Kanal |
|---|---|
| ArnOrg'un başlattığı ajanlar | Agent SDK (TypeScript), temiz ortam, hiç bitmeyen girdi akışı, `PreToolUse` geri çağrı kancası (`*`), insan kararı için ArnOrg arayüzü, `interrupt`, `set_permission_mode`, `set_model` |
| Makinedeki diğer oturumlar | `~/.claude/settings.json` içinde güvenli kapanan `PreToolUse` köprüsü; izleme için `PostToolUse`, `Stop`, `Notification`, `SubagentStart/Stop`, `SessionEnd` kancaları. ArnOrg ajanları `ARNORG_AJAN` ile ayırt edilir, aynı çağrı iki kez sayılmaz |
| Kullanım | SDK `result.modelUsage` (token) ve `rate_limit_event` (abonelik pencereleri); dış oturumlarda OpenTelemetry (ajan etiketli) ve durum satırı |
| Takılma tespiti | `session_state_changed`, `claude agents --json` (`blocked` + `waitingFor`), `Notification`, `StopFailure`, `api_retry`, öncesi-sonrası kanca arası süre |
| Tekrar oynatma ve denetim kaydı | ArnOrg'un kendi olay günlüğü + oturum kayıt dosyaları (sürüme bağlı ayrıştırıcı) |
| Başka motorlar | ACP (Faz 4) |
| Kullanılmayacaklar | Daemon kontrol soketi, oturumlar arası mesaj biçimi, `~/.claude/jobs/*/state.json`: belgelenmemiş |

---

## 15. Doğrulanmamış ya da değişebilir

- Uzun süren kanca beklemesinin (insan onayı) zaman aşımı davranışı.
- `PreToolUse` → `defer` kararının tam akışı (`terminal_reason: tool_deferred`).
- `can_use_tool` isteğine hata yanıtı verilirse CLI'nın davranışı.
- Kesmenin arka plan alt ajanlarıyla etkileşimi (`perTaskStopAffordance`).
- Mods ve Channels yeni ya da önizleme aşamasında; sözleşmeleri değişebilir.
- Oturumlar arası mesaj soketinin ve daemon kontrol soketinin biçimi belgelenmemiş.
- Belgelenmemiş `system` alt türleri ve `command_lifecycle` her sürümde değişebilir.
- İzin modu verilmezse varsayılanın hesaba göre `auto` olabildiği görüldü; ArnOrg izin modunu her zaman açıkça verir.

## 16. Yeniden üretme

```bash
cd deneyler/gozcu && npm install
npm run denetim   # politika, girdi değiştirme, araya girme, ArnOrg aracı
npm run kesme     # kesme
npm run bypass    # bypass modunda kanca ile denetim
npm run dis       # ArnOrg dışında açılan oturum, kanca köprüsü
```
Ham trafik `deneyler/gozcu/kayit/` altına yazılır.
