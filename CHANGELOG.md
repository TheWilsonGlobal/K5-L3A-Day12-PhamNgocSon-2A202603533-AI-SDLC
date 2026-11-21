# Changelog — Đảo Đèn Lồng

Mọi thay đổi quan trọng qua 4 phase phát triển (SDLC) của dự án **Đảo Đèn Lồng** được ghi nhận tại đây.

---

## [1.0.0] — Phase 4 / Contract 1.3 — "Bình minh: phát hành v1.0.0" (2026-11-20)

Spec: [docs/spec/phase-4.md](docs/spec/phase-4.md) · Retro: [docs/retro.md](docs/retro.md) · Tag: `phase-4` & Release `v1.0.0`.

### Added

- **Contract `v1.3` (`game.contract.json`):** nâng `contract_version: "1.3"`, bổ sung `bench_cmd` (`node scripts/bench.mjs`), `soak_cmd` (`node scripts/soak.mjs`) và cập nhật `run_cmd` (`node scripts/run.mjs`).
- **Chế độ Benchmark (`scripts/bench.mjs` & `?bench=1`):** dựng cảnh chuẩn Đêm 1 ở `1280×720` với `200` Bóng Mực `wander`, `100` đom đóm, `L1–L3` sáng `fuel = 100`, Mây đứng yên tại `(0,0,0)`, camera bay vòng tròn `r = 30 m, Y = 15 m` chu kỳ `15 s/vòng`, tắt vsync, bỏ `3 s` khởi động và đo đúng `--duration` giây; xuất `bench.json`.
- **Soak Test (`scripts/soak.mjs` & `packages/sim/src/soak.ts`):** chạy `10` Đêm liên tiếp trong cùng một tiến trình Node (`Đêm 1 → 2 → 3` xoay vòng, seed `7 + i`, input ngẫu nhiên theo seed), kiểm soát RSS `mem_end_mb ≤ 1.2 × mem_start_mb` và `crashes = 0`; xuất `soak.json`.
- **Bảng xếp hạng cục bộ (`packages/sim/src/leaderboard.ts`, `scripts/run.mjs`, `apps/web`):**
  - Cho nhập tên (`3–12` ký tự `[A-Za-z0-9_]`) để lưu điểm sau màn hình **Bình Minh** (thắng Đêm 3) hoặc sau khi thua ở bất kỳ Đêm nào.
  - Lưu top 10 trên đĩa cục bộ (`.data/leaderboard.json`, đồng bộ `localStorage`), sắp xếp theo `score` giảm dần, bằng điểm thì ai đạt trước (`achieved_at`) đứng trên.
  - Màn hình **Bảng xếp hạng** từ Menu chính và lệnh CLI `node scripts/run.mjs --export-leaderboard out.json`.
- **Dễ tiếp cận (Accessibility):**
  - **Đổi phím điều khiển:** cho phép gán lại phím cho đủ 9 hành động (di chuyển 4 hướng, nhảy, lướt, tương tác, tỏa sáng, tạm dừng), phát hiện trùng phím và cảnh báo trực tiếp, nút `"Khôi phục mặc định"`, lưu bền vào `localStorage`.
  - **Phụ đề & chỉ báo hình ảnh:** hiển thị phụ đề cho 4 sự kiện: Bóng Mực xuất hiện (kèm mũi tên chỉ hướng ở mép màn hình), gió sắp thổi, `10 s` cuối, đèn có `fuel < 30`.
  - **Giảm chuyển động:** tùy chọn tắt rung camera và hiệu ứng chớp màn hình.
  - **Cỡ chữ UI:** chuẩn hóa toàn bộ chữ UI tối thiểu **`18 px` ở `1280×720`**, kèm tùy chọn **Chữ lớn (`×1.25`)**.
- **Đóng gói & Tài liệu phát hành:** thêm `LICENSE` (MIT), `CREDITS.md`, `docs/retro.md`, `docs/spec/phase-4.md`, `bench.json`, `soak.json` và bộ test `tests/phase4.test.ts`.

---

## Phase 3 / Contract 1.2 — "Đèn cạn dầu" (2026-11-20)

Spec: [docs/spec/phase-3.md](docs/spec/phase-3.md) · Quyết định: [ADR-001](docs/adr/ADR-001-lantern-state-and-win-rule.md) · Tag: `phase-3`.

### Breaking changes

Đầu ra headless thay đổi so với Contract 1.1 (tag `phase-2`).

- **Thời lượng Đêm:** `300/330/360 s` → **`240/270/300 s`** (`night1/2/3_duration_s`).
- **Bỏ thắng sớm:** thắp đủ đèn không còn kết thúc Đêm (`game_over.reason` bỏ `all_lit`).
- **Luật thắng mới ở bình minh:** chỉ xét thắng khi hết giờ (`dawn_survived`) nếu số đèn sáng `≥ ceil(win_ratio × tổng)` (`win_ratio = 0.6`: Đêm 1 cần `3/5`, Đêm 2 `4/6`, Đêm 3 `5/7`); thiếu đèn thì thua `dawn`. Hết Ngọn Lửa (`no_flames`) luôn xét trước, kể cả ở tick bình minh.
- **Công thức điểm mới:** `per_mote: 5`, `per_lantern: 100`, `per_relight: 40`, `per_stun: 5`, `per_stun_drain: 15`, `per_second_left: 0`, `per_lit_lantern_dawn: 50` (+ `floor(fuel)` mỗi đèn sáng khi thắng), `per_flame_left: 50`.
- **Sức chứa tăng dần:** `capacity = min(20, 10 + 2 × successful_lights)`, đặt lại mỗi Đêm.
- **Nhiên liệu đèn & Bóng Mực hút dầu (`drain`):** đèn sáng có `fuel = 100` (lưu `6000` đơn vị `1/60`), tự hao `1.0/s`; tắt khi `fuel ≤ 0` (`lantern_out`, `ever_lit = true`, thắp lại tốn `5`). Đèn `fuel < 30` mất vùng an toàn `6 m` và Bóng Mực `wander` tiến vào hút `5 fuel/s` (`fuel_drain` mỗi `60` tick). Châm dầu (`refuel`) lên `≥ 30` đẩy Bóng Mực trong `6 m` ra mép.

### Added

- Chế độ mù màu `"Bảng màu dễ phân biệt"` (`#7A3CFF → #00B3FF`, `#FF5A5F → #FFFFFF` kèm `⚠`), đèn tắt xẹp `20%` kèm vết rách, thanh dầu & nhấp nháy `1 Hz` khi `fuel < 30`.
- `tests/phase3.test.ts` (77 test) và cập nhật `tests/bot.test.ts` thắng cả 3 Đêm.

---

## Phase 2 / Contract 1.1 — "Ba hòn đảo" (2026-11-20)

Spec: [docs/spec/phase-2.md](docs/spec/phase-2.md) · Tag: `phase-2`.

### Breaking changes

- **Đồng bộ số liệu chuẩn Ticket-02:** chạy `6.0 m/s`, nhảy `7.0 m/s`, trọng lực `-20 m/s²`, sức chứa gốc `10`, giá thắp đèn `10`, vùng an toàn `6 m`, Tỏa Sáng `3 đom đóm / 5 m / hồi 3 s / choáng 120 tick / đẩy 4 m`, Bóng Mực `4.0 m/s` (Đêm 3: `4.5 m/s`), rơi `Y < -10` bỏ qua bất tử.
- **Thứ tự xử lý 12 bước/tick bắt buộc** và tên trạng thái Bóng Mực chuẩn (`spawning, wander, chase, recoil, stunned`).
- **Contract `v1.1`:** thêm `--night 1|2|3`, snapshot thêm `night`, `wind`, `player.{vel,grounded,invuln,dash_cd_s,pulse_cd_s,charm_s}`, `motes`, `drifters`, `charms` và các sự kiện mới.

### Added

- **3 Bản đồ chuẩn:** Đêm 1 (Đảo Bến), Đêm 2 (Đảo Cau — 2 đảo, cầu tre, 2 bục nhảy), Đêm 3 (Đảo Chuông — 3 tầng, 2 dốc `30°/150°`, bục nhảy, tháp chuông, gió mạnh).
- **Tính năng mới:** Lướt (`14 m/s`, `0.2 s`, hồi `1.5 s`), Gió Lạc (`D1, D2`), Bùa Gió (`C1, C2`), chuỗi 3 Đêm → màn Bình Minh, Tạm dừng (`Esc`/`P`), Cài đặt (`localStorage`), Âm thanh Web Audio ngũ cung, HUD chuẩn & Bảng màu chuẩn.

---

## Phase 1 / Contract 1.0 — "PRD-0: Đảo Đèn Lồng" (2026-11-20)

Spec: [docs/spec/phase-1.md](docs/spec/phase-1.md) · Tag: `phase-1`.

### Added

- Khởi tạo monorepo TypeScript (`packages/sim`, `apps/headless`, `apps/web`), PRNG tất định `mulberry32`, CLI headless theo **Test Contract v1.0** (JSONL snapshots/events/end, mã thoát chuẩn `0 / 2 / !=0`), Dockerfile `node:22-slim` tất định byte-for-byte với Windows, và bản chơi 3D Three.js cho Đêm 1.
