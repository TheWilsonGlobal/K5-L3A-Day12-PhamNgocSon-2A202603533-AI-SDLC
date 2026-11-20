# Spec Phase 1 — Đêm 1: Đảo Bến

Nguồn: PRD-0 + Test Contract v1.0 (Lab board). Mỗi mục dưới đây có test tự động tương ứng trong `tests/` (tên test nằm trong ngoặc).

## Tiêu chí nghiệm thu

| # | Tiêu chí | Kiểm chứng |
| :-- | :--- | :--- |
| A1 | `game.contract.json` đủ trường của Test Contract; `tuning` là số game thực sự dùng | test "tuning is the single source"; sim/web/headless đều import file này |
| A2 | Di chuyển `player_speed` m/s, xoay theo `cam_yaw_deg`, chuẩn hóa vector dài hơn 1 | nhóm `movement` |
| A3 | Nhặt đom đóm tự động tại `≤ pickup_radius`, không vượt `carry_capacity` | nhóm `motes` |
| A4 | `interact` (cạnh false→true) trong `interact_radius` nạp vào đèn gần nhất chưa sáng; đủ `lantern_cost` ⇒ `lantern_lit` | nhóm `lanterns` |
| A5 | Bóng Mực đuổi theo tốc độ `shade_speed`; chạm trong `shade_hit_radius` ⇒ `player_hit`, `invuln_s`, rơi đom đóm | nhóm `shades` |
| A6 | Xung sáng: choáng `pulse_stun_s`, đẩy `pulse_push_m`, hồi `pulse_cooldown_s`, tốn `pulse_cost` | nhóm `pulse` |
| A7 | Bóng Mực không vào `safe_radius` quanh đèn đã sáng | "never enter safe_radius…" |
| A8 | Thắng `all_lit`, thua `no_flames`/`dawn`; dừng sớm khi game kết thúc | `lanterns`, `shades` |
| A9 | Headless đúng tham số, mã thoát 0/2, stderr khi lỗi | `tests/cli.test.ts` |
| A10 | Mô hình tick, làm tròn 3 chữ số, snapshot/event/end đúng định dạng | nhóm `tick model & output format` |
| A11 | Tất định (cùng seed/scenario/inputs ⇒ giống hệt từng byte), kể cả id sinh ra | nhóm `determinism`, `cli` và so hash Docker/native |
| A12 | Level thắng được và cũng thua được | `tests/bot.test.ts` (bot tham lam thắng 19/20 seed) |

## Giả định (chỗ PRD-0 mơ hồ)

- **Đảo:** tròn, bán kính 40 m, tâm (0,0,0), người chơi xuất phát (0,0,0). Rào vô hình ở mép ⇒ `fall_enabled=false`, không có rơi.
- **Đèn:** `L1…L5` đều trên vòng bán kính 25 m, `L1` ở (0,0,25).
- **Đom đóm:** 30 con sinh theo seed, vòng 5–33 m. Bị rơi thì sinh lại quanh người chơi (id mới `M31…`).
- **Nạp đèn:** nạp `min(carried, lantern_cost − deposited)`; sáng khi `deposited ≥ lantern_cost`. Nạp một phần được; đèn sáng không nạp thêm.
- **Chạm Bóng Mực:** −1 Ngọn Lửa, `dropped = ceil(carried × hit_drop_ratio)`, bất tử `invuln_s`. Bóng Mực choáng không gây sát thương.
- **Xung sáng:** cần `carried ≥ pulse_cost` và hết cooldown. Mọi Bóng Mực trong `pulse_radius` bị choáng + đẩy, tính `per_stun` mỗi lần (kể cả đang choáng). `stunned_ids` có thể rỗng; sự kiện vẫn ghi.
- **Bóng Mực:** 3 con khởi đầu ở vòng 36 m; mỗi 30 s sinh thêm 1 (tối đa 6) ở mép đảo, ghi `shade_spawned`. Trạng thái: `chase`, `stunned`. Vùng an toàn chỉ quanh đèn **đã sáng**.
- **Điểm:** `per_mote` lúc nhặt, `per_lantern` lúc sáng, `per_stun` mỗi Bóng Mực bị choáng; khi thắng cộng `floor(time_left)×per_second_left + flames×per_flame_left`.
- **Thứ tự kết thúc trong một bước:** thắng > hết lửa > hết giờ.
- **Scenario:** `lit:true` ⇒ `deposited = lantern_cost` ngầm, không sự kiện/điểm. `player.pos` mặc định (0,0,0). Bóng Mực trong scenario không có `pos` thì đặt ở (30,1,0).
- **Snapshot:** ngoài chu kỳ `--snapshot-every`, luôn ghi thêm snapshot ở tick cuối. Mảng `motes` được ghi (khuyến nghị).
- **Nhảy:** có nhảy (trọng lực 20, vận tốc 7 m/s) nhưng khoảng cách vẫn đo trên XZ nên nhảy không né được Bóng Mực.
- **`team`:** `2A202603533-pham-ngoc-son` (đoán theo mẫu `mssv-ho-ten`, cần đối chiếu Coach).
- **Cố định, ngoài `tuning`:** bán kính đảo 40, vòng đèn 25, 30 đom đóm, 3 Bóng Mực đầu, chu kỳ sinh 30 s, tối đa 6 Bóng Mực.

## Giao diện bản chơi (ngoài Test Contract, không ảnh hưởng chấm headless)

Toàn bộ nằm trong `apps/web/`; chỉ đọc state từ sim, không chứa luật chơi.

| # | Tính năng | Kiểm chứng |
| :-- | :--- | :--- |
| U1 | HUD kiểu game: Ngọn lửa, đom đóm, đèn lồng (tô dần theo tiến độ nạp), thời gian + thanh (30 s cuối chuyển đỏ), điểm, thanh hồi xung sáng, lời nhắc "Nhấn E" | ảnh `hud-*.png` |
| U2 | Mỗi đèn có 4 chấm tiến độ, bóng đèn ấm/to dần, nhãn luôn bật "L1 · 2/4" hoặc "✔ sáng" | `lantern-partial.png`, `lantern-lit.png`; kịch bản phím `E` thật |
| U3 | Bản đồ nhỏ góc phải dưới (trên = hướng camera): đèn kèm tiến độ, đom đóm, Bóng Mực (xanh = choáng), vòng an toàn | `minimap.png`, `hud-*.png` |
| U4 | Phím `H` bật/tắt nhãn tên mọi vật trên màn hình | `labels.png` |
| U5 | Phím `P`/`G`/`Esc` tạm dừng hẳn và mở popup hướng dẫn (cách nạp đèn, nạp dở dang, nguy hiểm, điều khiển, chú giải bản đồ) | `guide2.png`; đồng hồ đứng yên khi dừng |
| U6 | Mây (đầu, tóc, áo dài, tay chân đi bộ, nón lá nghiêng, đèn lồng nhỏ treo mép nón lắc theo bước đi) | `web-start.png`, `may-walking.png` |
| U7 | Bóng Mực (lõi mực, viền tím, vệt sáng dưới đất, giọt/vòi mực, mắt sáng nhìn Mây; choáng ⇒ xanh, nhắm mắt, sao quay) | `web-start.png`, `shade-stunned.png` |
| U8 | Phím `E`/`F`/Space bấm ngắn hơn một khung hình vẫn được tính | kịch bản trình duyệt |
| U9 | Favicon SVG (đèn lồng) | `dist/favicon.svg` phục vụ `image/svg+xml` |

Không có test tự động cho giao diện; kiểm chứng bằng Chrome headless điều khiển qua DevTools (phím thật, ảnh chụp) và `typecheck`/`lint`/`build`. Cảnh bản dev có hook `window.__ddl` để dựng tình huống; hook này bị loại khỏi bản production.
