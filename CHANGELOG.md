# Changelog

## Phase 3 / Contract 1.2 — "Đèn cạn dầu" (2026-11-20)

Spec: [docs/spec/phase-3.md](docs/spec/phase-3.md). Quyết định: [ADR-001](docs/adr/ADR-001-lantern-state-and-win-rule.md).

### Breaking changes

Đầu ra headless thay đổi so với Contract 1.1 (tag `phase-2`).

- **Thời lượng Đêm:** 300/330/360 s → **240/270/300 s** (`night1/2/3_duration_s`).
- **Bỏ thắng sớm:** thắp đủ đèn không còn kết thúc Đêm. `game_over.reason` mất `all_lit`.
- **Lý do kết thúc mới:** `dawn_survived` (thắng) và `dawn` (thua, thiếu đèn sáng); `no_flames` giữ nguyên và luôn xét trước, kể cả tick bình minh. Thắng chỉ ở tick bình minh, khi số đèn sáng ≥ `ceil(win_ratio × tổng)` (`win_ratio 0.6`).
- **Điểm thay hoàn toàn:** 5 khóa `score` cũ giữ tên, đổi giá trị: `per_mote` 10 → 5, `per_lantern` 100, `per_stun` 5, `per_second_left` 2 → 0, `per_flame_left` 50. Thêm 3 khóa: `per_relight` 40, `per_stun_drain` 15, `per_lit_lantern_dawn` 50. Điểm bình minh (chỉ khi thắng): mỗi đèn sáng `50 + floor(fuel)`, mỗi Ngọn Lửa còn lại +50.
- **Sức chứa tăng dần:** `capacity = min(20, 10 + 2 × successful_lights)`; nhặt đom đóm bị chặn ở `capacity` thay vì `carry_capacity`. `successful_lights` về 0 ở đầu mỗi Đêm. Hằng `10` và `+2` nằm ở đầu `packages/sim/src/sim.ts`, không nằm trong contract (G15).
- **Đèn sáng nhận đom đóm và có thể tắt:** đèn sáng hao 1 dầu/s và tắt khi `fuel ≤ 0` (`deposited = 0`, `ever_lit = true`); `E` châm dầu cho đèn sáng chưa đạt 6000 đơn vị; thắp lại đèn đã từng sáng tốn `relight_cost 5` thay vì 10.
- **Mất vùng an toàn dưới 30:** đèn `fuel < 30` không còn vùng an toàn 6 m (đúng 30 vẫn còn). Châm lên ≥ 30 đẩy Bóng Mực trong 6 m ra, mọi trạng thái (G11).
- **Trạng thái Bóng Mực mới `drain`:** hút 5 dầu/s, đứng yên ở đèn yếu; chỉ con `wander` chọn đèn yếu (G1, chưa xác nhận).
- **Snapshot:** mỗi đèn thêm `fuel` (1 chữ số thập phân, đèn tắt `0`), `ever_lit`, `relit_count`; `player.capacity`.
- **Scenario:** đèn thêm `lit`, `fuel`, `ever_lit`; `player.successful_lights`; `shades[].target_lantern_id`.
- **Sự kiện mới:** `refuel {lantern_id, amount, fuel}`, `lantern_out {lantern_id}`, `fuel_drain {lantern_id, shade_id, fuel}`; `lantern_lit` thêm `relight`.
- **Kiểm tra scenario mới, thoát mã 2:** `shades[].target_lantern_id` không khớp đèn nào; đèn `lit: false` tường minh mà `deposited` ≥ giá thắp. (`lanterns[].id` không tồn tại vẫn bị bỏ qua im lặng như Phase 2.)
- **Thứ tự tick:** vẫn 12 bước, thêm bước **2a** (hao dầu và hút dầu) và **2b** (đèn `fuel ≤ 0` tắt, phát `lantern_out`) ngay sau bước 2. Bước 2 chạy trước bước 5, nên đèn `fuel 100` đã hao còn 5999 đơn vị khi tương tác và vẫn được châm; `fuel 90` cần 2 đom đóm (G19, chưa xác nhận).

### Added

- Chế độ mù màu "Bảng màu dễ phân biệt" (lưu `localStorage`): viền Bóng Mực `#7A3CFF` → `#00B3FF`, cảnh báo `#FF5A5F` → `#FFFFFF` kèm ⚠; đèn tắt xẹp 20% và có vết rách.
- Thanh dầu trên đèn sáng; đèn và thanh dầu nhấp nháy 1 Hz khi `fuel < 30`.
- Hiệu ứng nhận biết Bóng Mực đang hút dầu và đèn bị hút.
- Biểu ngữ báo lỗi khi render gặp lỗi.
- HUD `đang mang / sức chứa`; lời nhắc theo ngữ cảnh (thắp mới `x/10`, thắp lại `x/5`, "E — Châm dầu").

### Tests

- `tests/phase3.test.ts` mới: 77 test cho tiêu chí Phase 3 (P4 viết theo G19).
- `tests/bot.test.ts` viết lại cho 3 Đêm (G18). Seed 1–20: Đêm 1 thắng 19/20, Đêm 2 12/20, Đêm 3 4/20; hằng số bot chỉnh trên chính seed 1–20; `win_ratio` không đổi.
- `tests/regression.test.ts` và `tests/features.test.ts` sửa theo luật mới, có lý do từng test ở mục "Thay đổi test" của spec. Không `skip`, không xóa test mà không có test thay. `tests/cli.test.ts` không đổi.
- `tests/zz_qa_trace.test.ts` không thuộc bộ test: tệp gỡ lỗi chưa theo dõi, chờ người dùng quyết định.

### Giả định chưa xác nhận

G1 (`wander` ngẫu nhiên giữ nguyên, thêm hướng tới đèn yếu) và G19 (thứ tự hao dầu/tương tác).
