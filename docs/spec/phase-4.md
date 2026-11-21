# Đặc tả Phase 4 — TICKET-04: "Bình minh: phát hành v1.0.0" (Contract v1.3)

## 1. Phạm vi & Mục tiêu

Hoàn thiện các yêu cầu phi chức năng, khả năng tiếp cận (accessibility), bảng xếp hạng cục bộ, chế độ benchmark & soak test theo **Test Contract v1.3**, đóng gói tài liệu và chuẩn bị phát hành `phase-4` / `v1.0.0`. Toàn bộ luật chơi, số liệu và đầu ra headless của Phase 1–3 (`v1.0–v1.2`) giữ nguyên tuyệt đối.

---

## 2. Ánh xạ Contract v1.3 (`game.contract.json`)

| Khóa | Giá trị | Ghi chú |
| :--- | :--- | :--- |
| `contract_version` | `"1.3"` | Nâng từ `"1.2"` |
| `build_cmd` | `"pnpm install --frozen-lockfile && pnpm build"` | Giữ nguyên |
| `run_cmd` | `"node scripts/run.mjs"` | Phục vụ bản web + API lưu đĩa `.data/leaderboard.json`, hỗ trợ `--export-leaderboard <out.json>` |
| `headless_cmd` | `"node apps/headless/dist/headless.js"` | Giữ nguyên |
| `bench_cmd` | `"node scripts/bench.mjs"` | Chạy cảnh benchmark `1280×720` trên Chrome GPU và xuất `bench.json` |
| `soak_cmd` | `"node scripts/soak.mjs"` | Chạy headless `N` Đêm liên tiếp trong cùng 1 tiến trình và xuất `soak.json` |

---

## 3. Acceptance Criteria (Tiêu chí nghiệm thu)

### B — Chế độ Benchmark (`bench_cmd`)
- **B1:** CLI nhận `--seed <int> --duration <sec> --out <path>` (mặc định `seed=42, duration=30, out=bench.json`).
- **B2:** Mở cửa sổ `1280×720` (không fullscreen), tải Đêm 1 với đầy đủ hiệu ứng & ánh sáng như khi chơi thật.
- **B3:** Cảnh benchmark sinh đúng **200 Bóng Mực** trạng thái `wander` rải đều trên đảo theo `seed`, **100 đom đóm** (vượt trần gameplay 30), và **3 đèn `L1–L3` đang sáng với `fuel = 100`**.
- **B4:** Trong cảnh benchmark tắt: sinh thêm thực thể, sát thương, nhặt đom đóm, hao dầu, điều kiện kết thúc Đêm và tắt việc Bóng Mực chuyển sang `chase`/`drain` (chỉ di chuyển `wander` bình thường).
- **B5:** Mây đứng yên tại `(0,0,0)`. Camera bay vòng tròn tâm `(0,0,0)`, bán kính `30 m`, độ cao `Y = 15 m`, luôn nhìn vào `(0,0,0)`, xuất phát ở góc `0°` (`(30, 15, 0)`), quay ngược chiều kim đồng hồ nhìn từ trên xuống (`x = 30·cos θ, z = 30·sin θ`), chu kỳ `15 s/vòng`.
- **B6:** `3 s` đầu là khởi động (không đo); sau đó đo đúng `--duration` giây rồi thoát với mã `0`.
- **B7:** File `bench.json` có đủ 10 khóa: `contract_version: "1.3"`, `avg_fps`, `p1_low_fps`, `frame_ms_p95`, `frames`, `load_ms`, `peak_mem_mb`, `vsync_off`, `renderer`, `os`. Công thức `avg_fps`, `p1_low_fps`, `frame_ms_p95` khớp định nghĩa ticket.

### K — Soak Test (`soak_cmd`)
- **K1:** CLI nhận `--seed <int> --nights <int> --out <path>` (mặc định `seed=7, nights=10, out=soak.json`).
- **K2:** Chạy `nights` Đêm liên tiếp trong **cùng một tiến trình Node** (`Đêm 1 → 2 → 3 → 1 ...`), Đêm thứ `i` (`i = 0..nights-1`) dùng seed `seed + i`.
- **K3:** Input ngẫu nhiên tất định theo seed của Đêm đó: mỗi `30` tick chọn lại hướng di chuyển; mỗi tick xác suất `5%` nhảy, `3%` lướt, `2%` tỏa sáng, `10%` tương tác.
- **K4:** Đo `mem_start_mb` (RSS tiến trình sau khi tải xong Đêm đầu tiên) và `mem_end_mb` (RSS sau khi reset xong Đêm cuối cùng).
- **K5:** Đạt ngưỡng `crashes === 0` và `mem_end_mb <= 1.2 * mem_start_mb`. Xuất JSON `{ nights, crashes, results, mem_start_mb, mem_end_mb, duration_s }`.

### L — Bảng xếp hạng cục bộ (Local Leaderboard)
- **L1:** Sau màn hình **Bình Minh** (thắng Đêm 3) **hoặc** sau khi **thua ở bất kỳ Đêm nào**, cho phép nhập tên để lưu điểm.
- **L2:** Tên hợp lệ: `3–12` ký tự `[A-Za-z0-9_]`; nếu sai định dạng thì báo lỗi rõ ràng và không lưu.
- **L3:** Mỗi mục lưu đủ 5 trường: `name`, `score` (tổng điểm các Đêm đã thắng), `nights_won` (`0–3`), `achieved_at` (ISO 8601 có múi giờ), `seed`.
- **L4:** Giữ **top 10**, sắp xếp `score` giảm dần; bằng điểm thì mục đạt trước (`achieved_at` nhỏ hơn) đứng trên.
- **L5:** Lưu bền trên đĩa cục bộ (`.data/leaderboard.json`) qua server local của `run_cmd` / Vite dev middleware (kèm đồng bộ `localStorage`). Có màn hình **Bảng xếp hạng** mở từ Menu chính.
- **L6:** Lệnh `<run_cmd> --export-leaderboard out.json` xuất `{"entries": [...]}` đúng thứ tự top 10 và thoát mã `0`.

### A — Dễ tiếp cận (Accessibility)
- **A1 (Đổi phím):** Cho phép đổi phím cho đủ 9 hành động: di chuyển 4 hướng (`Lên, Xuống, Trái, Phải`), `Nhảy`, `Lướt`, `Tương tác`, `Tỏa Sáng`, `Tạm dừng`. Phát hiện trùng phím và hiển thị cảnh báo. Có nút `"Khôi phục mặc định"`. Lưu bền vào `localStorage`.
- **A2 (Phụ đề / chỉ báo hình ảnh):** Hiển thị phụ đề cho 4 tình huống: (1) Bóng Mực xuất hiện (kèm mũi tên chỉ hướng ở mép màn hình), (2) gió sắp thổi, (3) `10 s` cuối, (4) đèn có `fuel < 30`.
- **A3 (Giảm chuyển động):** Tùy chọn tắt rung camera (`shake`) và hiệu ứng chớp màn hình (`pulseFx` / blink). Lưu bền.
- **A4 (Cỡ chữ UI):** Mọi chữ UI có cỡ chữ tối thiểu **`18 px` ở `1280×720`**. Có tùy chọn **Chữ lớn (`×1.25`)** lưu bền.

### P — Đóng gói, Tài liệu & Phát hành
- **P1:** Clone sạch → tối đa 3 lệnh (`pnpm install && pnpm build && pnpm start` hoặc `pnpm dev`) → chơi được.
- **P2:** Có đủ `README.md`, `CHANGELOG.md` (4 phase), `CREDITS.md`, `LICENSE`, `docs/retro.md`, `bench.json`, `soak.json`.

---

## 4. Giả định thiết kế (Phase 4)

- **G21 (`seed` thứ `i` trong Soak test):** Đêm thứ `i` với `i = 0, 1, ..., nights - 1` dùng `seed + i` (khi `--seed 7 --nights 10`, 10 Đêm dùng seed `7..16` và xoay vòng Đêm `1, 2, 3, 1, 2, 3, 1, 2, 3, 1`).
- **G22 (Rải đều 200 Bóng Mực và 100 đom đóm trong cảnh Bench):** Dùng PRNG `makeRng(seed)` với phân bố đều theo diện tích hình tròn bán kính `36 m` (`r = 36 * sqrt(u), θ = 2π * v`) trên Đảo Bến để tái lập tất định 100% ở mọi lần chạy cùng `--seed 42`.
- **G23 (`peak_mem_mb` và `vsync_off` trong Bench Web):** Runner `scripts/bench.mjs` truyền cờ `--disable-gpu-vsync --disable-frame-rate-limit` cho Chrome (`vsync_off: true`) và lấy RSS cao nhất của tiến trình Chrome/renderer trong khoảng đo (nếu hệ điều hành không trả được RSS thì ghi `null` theo quy định ticket).
- **G24 (File đĩa của Bảng xếp hạng):** Lưu tại `.data/leaderboard.json` ở thư mục gốc repo để cả giao diện web (`node scripts/run.mjs` / `pnpm dev`) lẫn lệnh CLI `<run_cmd> --export-leaderboard out.json` đọc/ghi cùng một nguồn dữ liệu trên đĩa.
