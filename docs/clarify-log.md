# Nhật ký Làm rõ Yêu cầu & Giả định (Clarify Log — Phases 1–4)

- **Học viên:** Phạm Ngọc Sơn (`2A202603533`) · **Lớp:** K5-L3A
- **Nguyên tắc:** Mọi điểm đề bài để mở hoặc có xung đột giữa lời văn và thứ tự xử lý được tổng hợp tại đây, ánh xạ trực tiếp sang các bài kiểm thử tự động trong `tests/` và đặc tả `docs/spec/phase-1..4.md`.

---

## 1. Phase 1 — PRD-0: Đảo Đèn Lồng (Contract v1.0)

Trong Phase 1, PRD-0 cố ý để mở toàn bộ hằng số gameplay để học viên tự chọn và khai báo trong `game.contract.json`:
- **Quyết định Phase 1:** Chọn `player_speed = 8`, `carry_capacity = 5`, `lantern_cost = 4`, `lantern_count_night1 = 5`, `night1_duration_s = 300`, `flames = 3`, `safe_radius = 6`, `fall_enabled = false`.
- **Nạp dở dang (Partial deposit):** Do sự kiện `deposit` trong Contract `v1.0` có cả hai trường `amount` và `deposited`, thiết kế cho phép nạp từng phần vào đèn chưa sáng và nhớ tiến độ (quyết định này sau đó khớp 100% với số chuẩn của Ticket-02 ở Phase 2).

---

## 2. Phase 2 — Ticket-02: "Ba hòn đảo" (Contract v1.1)

Ticket-02 chuẩn hóa toàn bộ hằng số và thứ tự 12 bước/tick. Các điểm đề bài không khóa cứng được chốt như sau (chi tiết trong [docs/spec/phase-2.md](spec/phase-2.md)):

| Mã | Điểm để mở trong Ticket-02 | Quyết định / Giả định đã áp dụng |
| :--- | :--- | :--- |
| **P2-1** | Quy ước góc cực `(r, θ)` trên mặt phẳng XZ | Ticket ghi "ngược chiều kim đồng hồ từ `+X`"; đối chiếu tọa độ 5 đèn Đêm 1 (`L1(0,0,25)` = `90°`, `L2(23.8,0,7.7)` = `18°`) suy ra công thức chính xác là `x = r·cos θ, z = r·sin θ` |
| **P2-2** | Điểm xuất phát của Mây ở Đêm 2 và Đêm 3 | Đêm 1–2 xuất phát tại `(0,0,0)`; riêng Đêm 3 tâm `(0,0,0)` là tháp chuông đặc `R = 2 m` ở tầng 2 (`Y = 6`), nên đặt điểm xuất phát Đêm 3 tại `(0, 0, -20)` trên tầng 0 (`Y = 0`), quay mặt `+Z` |
| **P2-3** | Thời lượng trạng thái `spawning` và hành vi `wander` của Bóng Mực | `spawning` kéo dài `60` tick (`1,0 s`); `wander` đi thẳng `2,0 m/s` theo hướng ngẫu nhiên (PRNG theo `seed`), đổi hướng mỗi `120` tick hoặc khi chạm mép vùng an toàn / biên đảo |
| **P2-4** | Điểm sinh Gió Lạc (Đêm 2 & 3) và điều kiện cướp | Sinh tại danh sách điểm sương của đảo (`shadePoints`), độ cao `+1,5 m` trên mặt đất; chỉ cướp đom đóm khi đang ở trạng thái `chase` |
| **P2-5** | Lịch và hướng Gió mạnh Đêm 3 | Cơn gió thứ `k` (`k = 1, 2, ...`) bắt đầu ở tick `1800·k` (`30 s`), kéo dài `300` tick (`5 s`), báo trước `120` tick (`2 s`); hướng gió `dir_deg` tính tất định bằng hàm băm `hash32(seed ^ k)` |

---

## 3. Phase 3 — Ticket-03: "Đèn cạn dầu" (Contract v1.2)

Ticket-03 là Change Request thay đổi mô hình đèn và luật thắng. Các điểm mơ hồ / xung đột được ghi nhận trong [docs/spec/phase-3.md](spec/phase-3.md) và [ADR-001](adr/ADR-001-lantern-state-and-win-rule.md):

| Mã | Chỗ mơ hồ / Xung đột | Giả định áp dụng | Trạng thái |
| :--- | :--- | :--- | :--- |
| **G1** | Ticket ghi khi không có đèn yếu (`fuel < 30`) thì Bóng Mực `wander` *"đi về đèn tắt gần nhất như trước"*, nhưng ở Phase 2 `wander` là đi ngẫu nhiên `2 m/s` | Giữ `wander` ngẫu nhiên `2 m/s` của Phase 2 khi không có đèn yếu để **không làm thay đổi đầu ra regression Phase 1–2**; chỉ thêm logic nhắm tới đèn đang sáng có `fuel < 30` gần nhất | Giả định bảo toàn regression |
| **G2–G3** | Tốc độ Bóng Mực đi tới đèn yếu và ưu tiên phát hiện Mây | Đi tới đèn yếu với tốc độ `wander` (`2,0 m/s`); nếu Mây vào trong `12 m` thì vẫn chuyển sang `chase` như Phase 2 (ngưỡng `6 m` chỉ áp dụng khi đã vào trạng thái `drain`) | Đã kiểm thử ở `phase3.test.ts` |
| **G4** | Khóa `tuning.score.*` trong `game.contract.json` | Giữ nguyên tên 5 khóa cũ của `v1.0–v1.1` với giá trị mới (`per_mote: 5`, `per_second_left: 0`, v.v.) và thêm 3 khóa mới (`per_relight: 40`, `per_stun_drain: 15`, `per_lit_lantern_dawn: 50`) | Đã kiểm thử |
| **G5–G6** | Chu kỳ phát `fuel_drain` và làm tròn `fuel` | Đếm `drain_ticks` riêng cho từng Bóng Mực từ lúc vào `drain` (phát ở tick `60, 120...`), giá trị `fuel` lấy **sau** khi trừ ở tick đó, làm tròn gần nhất tới 1 chữ số thập phân; điểm bình minh dùng `floor(fuel)` thực | Đã kiểm thử |
| **G11** | Đẩy Bóng Mực (`eject`) khi châm dầu lên `≥ 30` | Áp dụng cho **mọi trạng thái** Bóng Mực trong bán kính `6 m` trong tối đa `30` tick, giống hệt cơ chế vừa thắp đèn ở Phase 2; đồng thời chuyển các con đang `drain` đèn đó về `wander` | Đã kiểm chứng đối chiếu tag `phase-2` |
| **G15** | Hằng số sức chứa `10 + 2 × successful_lights` | Giữ `carry_capacity: 10` và `capacity_max: 20` trong `tuning`; bước tăng `+2` là hằng `CAPACITY_PER_LIGHT = 2` trong `sim.ts` để không thêm khóa lạ ngoài danh sách 8 khóa mới của Ticket-03 | Đã ghi trong ADR-001 |
| **G16** | Điểm Tỏa Sáng trúng Bóng Mực đang `drain` ("tổng +15") | Cộng `+15` **thay cho** `+5` (không phải `5 + 15 = 20`) | Đã kiểm thử |
| **G19** | Tương tác với đèn vừa đặt `fuel = 100` | Do bước 2a (hao `1/60` dầu) chạy trước bước 5 (tương tác) theo đúng thứ tự tick bắt buộc của ticket, đèn `fuel = 100` ở đầu tick còn `5999/6000` đơn vị ở bước 5 nên vẫn nhận châm `1` đom đóm (`used = 1`) | Đã ghi rõ trong Spec & Changelog |

---

## 4. Phase 4 — Ticket-04: "Bình minh: phát hành v1.0.0" (Contract v1.3)

| Mã | Điểm để mở trong Ticket-04 | Quyết định / Giả định đã áp dụng |
| :--- | :--- | :--- |
| **G21** | Chỉ số `i` trong Soak Test (`seed = 7 + i`, 10 Đêm xoay vòng) | Dùng `i = 0, 1, ..., nights - 1`: 10 Đêm dùng seed `7..16` và xoay vòng Đêm `1, 2, 3, 1, 2, 3, 1, 2, 3, 1` trong cùng một tiến trình |
| **G22** | Phân bố "rải đều" 200 Bóng Mực và 100 đom đóm trong cảnh Benchmark | Dùng PRNG `makeRng(seed ^ 0x42454e43)` lấy mẫu đều theo diện tích hình tròn bán kính `37 m` (`r = 37·√u, θ = 2π·v`), với Bóng Mực tránh vùng an toàn `6 m` quanh `L1–L3` đang sáng |
| **G23** | Đo `peak_mem_mb` và tắt vsync trên bản Web Benchmark | Runner `scripts/bench.mjs` khởi chạy Chrome GPU với `--disable-gpu-vsync --disable-frame-rate-limit` (`vsync_off: true`) và lấy mẫu RSS của tiến trình Chrome trong suốt thời gian đo |
| **G24** | Vị trí lưu đĩa của Bảng xếp hạng cục bộ | Lưu tại `.data/leaderboard.json` (đã thêm vào `.gitignore`) thông qua API `/api/leaderboard` của `node scripts/run.mjs` và Vite middleware, giúp cả trình duyệt lẫn lệnh `node scripts/run.mjs --export-leaderboard out.json` dùng chung một nguồn dữ liệu trên đĩa |
