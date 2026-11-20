# Spec Phase 2 — TICKET-02 "Ba hòn đảo" (Contract v1.1)

Nguồn: Ticket-02 (bản lưu `Lab/Day12-AI-SDLC/phase-02/brief-lantern-island-p2.html` trong repo VIN-AIA-Docs). Số chuẩn **thay mọi giá trị tự chọn ở Phase 1**; vì vậy một số quyết định Phase 1 (`docs/spec/phase-1.md`) không còn hiệu lực: sức chứa 5 → 10, giá đèn 4 → 10, `fall_enabled` false → true, điểm cộng lúc nhặt → lúc nạp, v.v. Mỗi mục có test trong `tests/` (tên test trong ngoặc).

## Ánh xạ số chuẩn → `tuning` (game.contract.json)

| Ticket | `tuning` | Giá trị |
| :--- | :--- | :-: |
| Tốc độ chạy | `player_speed` | 6 |
| Sức chứa / giá đèn | `carry_capacity` / `lantern_cost` | 10 / 10 |
| Nhặt / nạp | `pickup_radius` / `interact_radius` | 1,0 / 2,0 |
| Tỏa Sáng | `pulse_cost` / `pulse_radius` / `pulse_cooldown_s` / `pulse_stun_s` / `pulse_push_m` | 3 / 5 / 3 / 2 (120 tick) / 4 |
| Bất tử khi bị đánh | `invuln_s` | 1,5 (90 tick) |
| Rơi đom đóm khi bị đánh | `hit_drop_ratio` | 0,5 (làm tròn xuống) |
| Vùng an toàn | `safe_radius` | 6 |
| Bóng Mực | `shade_speed` / `shade_hit_radius` | 4,0 (Đêm 3: 4,5 theo bản đồ) / 1,0 |
| Lướt (mới) | `dash_speed` / `dash_duration_s` / `dash_cooldown_s` | 14 / 0,2 / 1,5 |
| Thời gian đêm | `night1/2/3_duration_s` | 300 / 330 / 360 |
| Ngọn Lửa | `flames` | 3 |
| Rơi khỏi đảo | `fall_enabled` | true |
| Điểm | `score.per_mote` / `per_lantern` / `per_stun` / `per_second_left` / `per_flame_left` | 10 (lúc nạp) / 100 / 5 / 2 / 50 |

Hằng chuẩn nằm ngoài `tuning` (đầu `packages/sim/src/sim.ts`): nhảy 7 m/s, trọng lực −20, Bùa Gió 7,2 m/s và 600/2700 tick, rơi khỏi đảo Y < −10 chờ 60 tick và bất tử 90 tick, đom đóm khởi đầu 20/trần 30/mỗi 240 tick, Bóng Mực phát hiện 12 m/bỏ đuổi 18 m/sinh tick 300 (2 con)/recoil 2 m trong 60 tick, Gió Lạc 7 m/s…

## Tiêu chí nghiệm thu — Phần 1 (số chuẩn) và regression Phase 1

| # | Tiêu chí | Kiểm chứng |
| :-- | :--- | :--- |
| S1 | Contract `"1.1"`, `tuning` khớp bảng trên, có đủ 5 khóa mới | `contract v1.1`, `tests/cli.test.ts` |
| S2 | Chạy 6 m/s, dừng ngay (≤ 0,1 s: cài đặt tức thời), xoay theo yaw, chuẩn hóa vector > 1 | `movement` |
| S3 | Nhảy 7 m/s chỉ khi chạm đất | "jumps at 7 m/s only from the ground" |
| S4 | Nhặt XZ ≤ 1,0 và \|dy\| ≤ 1,5; tối đa 10; nhặt không cộng điểm | `fireflies` |
| S5 | 20 đom đóm lúc đầu ở 20 điểm khác nhau, +1 ở tick 240, 480, … tới hết điểm trống (24 ở Đêm 1) | `starts with 20…`, `adds one at ticks 240…` |
| S6 | Nạp `min(mang, thiếu)`, nhớ tiến độ, +10/đom đóm, +100 khi đủ 10; gần nhất, hòa thì id nhỏ; chỉ đèn chưa sáng; bán kính 2,0 | `lanterns` |
| S7 | Vùng an toàn 6 m chặn Bóng Mực; Bóng Mực kẹt trong vùng khi đèn vừa sáng bị đẩy ra ≤ 30 tick, không gây sát thương | `safe zones` |
| S8 | Tỏa Sáng: tốn 3, tâm = chân + 0,8 m, 3D ≤ 5, choáng 120 tick, đẩy 4 m trong 15 tick (+X nếu trùng), làm mới được, +5/lần kể cả đang choáng, hồi 180 tick | `pulse (Tỏa Sáng)` |
| S9 | Bóng Mực: 4,0 m/s, phát hiện 12/bỏ đuổi 18, chạm XZ ≤ 1 và \|dy\| ≤ 1,5, ≤ 1 hit/tick, lùi 2 m trong 60 tick, chạm lúc bất tử không làm gì | `shades` |
| S10 | Bị đánh: −1 Ngọn Lửa, rơi ⌊mang/2⌋ lên vành 1,5–2,5 m (TTL 480 tick), bất tử 90 tick | "a hit: -1 flame…", "dropped fireflies vanish after 480 ticks" |
| S11 | Lịch sinh Bóng Mực: 2 con ở tick 300 (S1, S2) rồi 1 con mỗi 480/420/360 tick; cách người chơi ≥ 15 m; trần 6/8/10 | `spawn 2 at tick 300…`, `Night 2/3` |
| S12 | Rơi khỏi đảo (Y < −10): đúng 1 lần, bỏ qua bất tử, −1 Ngọn Lửa, mất hết đom đóm (`lost`), chờ 60 tick rồi hồi sinh vận tốc 0 bất tử 90 tick; hết lửa thì thua ngay | `falling off the island` |
| S13 | Thắng/thua: hết lửa → `no_flames` (kể cả đã sáng hết); sáng hết → thắng kể cả tick cuối; hết giờ → `dawn`; điểm thắng + ⌊giây⌋×2 + 50×lửa | `win, lose and score` |
| S14 | Định dạng v1.1: snapshot (`night`, `wind`, `player.{vel,grounded,invuln,dash_cd_s,pulse_cd_s,charm_s}`, `motes[]`, `drifters[]`, `charms[]`), sự kiện mới, trạng thái `paused`, tên trạng thái Bóng Mực | `tick model & output format`, `input validation` |
| S15 | Tất định cả 3 Đêm (cùng seed/scenario/input ⇒ giống hệt từng byte, kể cả id) và giống nhau giữa Windows/Node 24 và Docker Linux/Node 22 | `determinism`, `determinism-hashes.txt` |
| S16 | Một Đêm đầy đủ (≤ 21.600 tick) ≤ 30 s | `headless performance`, `cli.test.ts`, `benchmark.log` (< 1 s) |

## Tiêu chí nghiệm thu — Phần 2 (bản đồ chuẩn)

| # | Tiêu chí | Kiểm chứng |
| :-- | :--- | :--- |
| M1 | Đêm 1: đảo R40, xuất phát (0,0,0), 5 đèn đúng tọa độ, 24 điểm đom đóm, 12 điểm Bóng Mực R37; ngoài 40 m là rơi | `uses the standard Night 1 coordinates`, `falling…` |
| M2 | Đêm 2: 2 đảo R28 (0,0,0)/(70,0,0), cầu tre x∈[26,44] z∈[−2,2] không lan can (bước ra là rơi), 6 đèn, 24 điểm đom đóm, 16 điểm Bóng Mực, 330 s | `Night 2 — Đảo Cau` |
| M3 | Bục nhảy Đêm 2: vy 14, ngang 24 m/s về tâm đảo kia, đáp trong đảo đích (~1,4 s), phím không ghi đè được, vẫn Lướt được | `jump pad (20,0,18)…`, `(50,0,-18)`, `can dash after being launched` |
| M4 | Đêm 3: đảo R45, tầng 0/1/2 (Y 0/3/6), vách đứng không leo được, bước ra thì rơi xuống tầng dưới, 2 dốc rộng 3 m ở 30°/150° (R30→R24), tháp chuông R2 cao 8 m không đi xuyên, 7 đèn, 30 điểm đom đóm, 16 điểm Bóng Mực, 360 s | `Night 3 — Đảo Chuông` |
| M5 | Bục nhảy Đêm 3 (0,3,13): vy 12, ngang 8 m/s về −Z, đáp lên tầng 2 | `jump pad (0,3,13)…` |
| M6 | Gió mạnh Đêm 3: mỗi 30 s kéo dài 5 s theo hướng theo seed, đẩy 2 m/s, báo trước 2 s (`windWarning`, lá bay + âm thanh ở bản chơi) | `a strong wind blows…`, `no wind on Nights 1 and 2` |

## Tiêu chí nghiệm thu — Phần 3 (tính năng mới), theo từng mục của ticket

| # | Mục | Tiêu chí | Kiểm chứng |
| :-- | :--- | :--- | :--- |
| F1 | **Lướt** | 14 m/s × 12 tick theo hướng di chuyển (đứng yên: hướng mặt, mặc định +Z); hồi 90 tick từ lúc bắt đầu; trên không giữ độ cao; không bất tử; nhấn khi đang lướt bị bỏ qua; sự kiện `dash` | `dash (Lướt)` |
| F2 | **Gió Lạc** | Đêm 2, 3: sinh ở tick 1200, 2400, … (D1, D2), tối đa 2; idle 2 m/s → chase 7 m/s khi mang ≥ 5 và ≤ 15 m (điều kiện mất ⇒ về idle); chạm XZ ≤ 1,2 cướp `min(3, mang)` rồi flee 240 tick và biến mất cùng đồ; Tỏa Sáng lúc chase ⇒ flee không cướp; lúc flee có đồ ⇒ thả hết thành đom đóm rơi, biến mất sau 120 tick; không làm mất Ngọn Lửa; vùng an toàn và bất tử không chặn | `Gió Lạc (drifters)` |
| F3 | **Bùa Gió** | Đêm 2: C1 (35,0,0); Đêm 3: C1, C2 (±30,0,25); nhặt như đom đóm; 600 tick: 7,2 m/s và Lướt không hồi (vẫn phải nhấn lại, bỏ qua khi đang lướt); hồi lại sau 2700 tick; sự kiện `charm_picked` | `Bùa Gió (charm)` |
| F4 | **Chuỗi 3 Đêm** | Menu → giới thiệu (tên đảo + lời Ông Đăng) → chơi → kết quả → đêm kế tiếp; thắng Đêm 3 ⇒ Bình Minh với tổng điểm; thua ⇒ chơi lại đêm đó; tổng điểm = tổng các đêm đã thắng | trình duyệt: `e2e-browser.log` + `p2-menu`, `p2-intro-*`, `p2-result-*`, `p2-dawn` |
| F5 | **Tạm dừng** | `Esc`/`P`; logic dừng hẳn; có Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu. Headless: `pause` đổi trạng thái khi `false→true`, `tick` tăng, `sim_tick`/thời gian/hồi chiêu/spawn đứng yên, snapshot `paused`, sự kiện `paused`/`resumed` | `pause (Esc / P)`; trình duyệt: `pause: frozen true` |
| F6 | **Cài đặt** | Âm lượng + độ nhạy chuột, lưu qua các lần mở (localStorage) | trình duyệt: `after reload volume/sens ["35","150"]`, `p2-settings` |
| F7 | **Âm thanh** | Nhạc nền đêm + hiệu ứng: nhặt, thắp, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10 s (+ bùa, Gió Lạc cướp, báo gió, rơi) | **Chưa nghe thử** (xem hạn chế); mã trong `audio.ts`, gọi ở `main.ts` |
| F8 | **HUD đầy đủ** | Ngọn Lửa (trên trái), `mm:ss` (trên giữa, đỏ + nhấp nháy ≤ 30 s), đèn k/n + điểm (trên phải), thanh 10 ô (dưới giữa), hồi chiêu Lướt/Tỏa Sáng (+ Bùa Gió) (dưới phải), nhắc "E — Nạp ánh sáng (x/10)" khi ≤ 2 m, mũi tên tới đèn chưa sáng gần nhất khi ngoài màn hình | `p2-night1`, `p2-night2-pad`, `p2-night3-*` |
| F9 | **Bảng màu chuẩn + ánh sáng** | Màu đúng bảng ở `apps/web/src/palette.ts` (trời, sương, cỏ, cát, gỗ, biển mây, đèn, đom đóm, Bóng Mực thân/viền/choáng, áo + khăn Mây, bùa, viền vàng, Gió Lạc, UI); ánh sáng môi trường = (0,15 + 0,55 × đèn sáng/tổng) × hệ số 4 | mã + ảnh chụp (không đo màu tự động) |
| F10 | **Hiệu năng bản chơi** | ≥ 30 FPS trung bình ở 1280×720 | `e2e-browser.log`: **59,9 FPS** (Chrome headless, GPU qua ANGLE/D3D11, Đêm 3) |

## Giả định (chỗ ticket để mở)

- **Điểm xuất phát Đêm 3:** `(0, 0, −20)` (ticket chỉ nêu cho Đêm 1; (0,0,0) nằm trong tháp chuông). Hồi sinh ở đúng điểm này.
- **Tăng tốc/dừng:** tức thời (thỏa "≤ 0,1 s"). Trên không điều khiển đầy đủ, trừ khi đang bị bục nhảy bắn (giữ vận tốc phóng tới khi chạm đất; Lướt thay thế tạm thời, rồi trở lại vận tốc phóng).
- **Va chạm địa hình:** cột có đỉnh cao hơn chân quá 0,35 m là vách (chặn, trượt dọc tường); thấp hơn là bước lên được (dốc). Khoảng trống không có mặt đất ⇒ rơi.
- **Khoảng cách nạp đèn:** XZ (không giới hạn chênh cao). Nhặt đom đóm/bùa: XZ ≤ 1,0 và \|dy\| ≤ 1,5 theo ticket.
- **Bóng Mực:** `spawning` kéo dài 60 tick (đứng yên, vô hại, vẫn bị Tỏa Sáng); `wander` đi 2 m/s theo hướng ngẫu nhiên đổi mỗi 120 tick; điểm sinh hợp lệ = cách người chơi ≥ 15 m và ngoài vùng an toàn; scenario không nêu `state` ⇒ `wander` (chuyển `chase` ngay khi ≤ 12 m).
- **Gió Lạc:** chỉ cướp khi đang `chase`; điểm sinh = các điểm sinh Bóng Mực ("điểm sương"); bay không bị địa hình chặn; chạm tính theo XZ.
- **Gió mạnh:** cơn k bắt đầu ở tick 1800·k (k ≥ 1), hướng = băm(seed, k) (độ, đo từ +X ngược chiều kim đồng hồ), hướng đã biết từ lúc cảnh báo; `wind.dir_deg` ngoài khoảng đó là hướng cơn kế tiếp; Đêm 1, 2: `{active:false, dir_deg:0}`.
- **Tạm dừng:** cạnh `pause` đổi trạng thái; khi bật dừng ngay ở bước 1; khi tắt thì tick đó vẫn xử lý tiếp. Nút khác không tác động khi đang dừng. Bản chơi dừng bằng cách ngừng gọi `step` (tương đương).
- **`night_start`:** ghi ngay sau snapshot tick 0 với `tick: 0`. `--night` ngoài 1–3 ⇒ mã thoát 1.
- **`random_motes:false`** tắt luôn lịch sinh thêm đom đóm; `random_shades:false` tắt lịch Bóng Mực; `random_drifters`, `wind_enabled` mặc định theo đêm.
- **Điểm Bóng Mực trúng Tỏa Sáng** chỉ tính Bóng Mực (không tính Gió Lạc); `stunned_ids` chỉ gồm Bóng Mực.
- **Đom đóm rơi** có id `M…` tiếp nối, `kind:"dropped"`, `ttl_s` tính bằng giây.
- **`team`:** `2A202603533-pham-ngoc-son` (đoán theo mẫu, chưa đối chiếu Coach).
