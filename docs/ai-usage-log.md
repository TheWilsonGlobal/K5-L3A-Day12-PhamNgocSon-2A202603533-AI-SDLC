# Nhật ký Sử dụng AI (AI Usage Log — Phases 1–4)

- **Học viên:** Phạm Ngọc Sơn (`2A202603533`) · **Lớp:** K5-L3A
- **Dự án:** Đảo Đèn Lồng (`v1.0.0`, Test Contract `v1.0 → v1.3`)

---

## 1. Công cụ & Mô hình sử dụng

| Công cụ / Harness | Mô hình | Vai trò chính trong SDLC |
| :--- | :--- | :--- |
| **Claude Code CLI + Multi-Agent DAG** | Claude Sonnet / Opus | Lập kế hoạch theo đồ thị phụ thuộc (DAG), phân rã các node `build`, `docs`, `test-write`, `review`, `test-run`, kiểm tra chéo diff và chạy Docker determinism |
| **Antigravity AI Assistant** | Gemini | Trích xuất đặc tả từng phase, lập kế hoạch `plan.md`, rà soát code & test trước khi commit, gỡ lỗi âm thanh Web Audio, triển khai Phase 4 (`v1.3`), chạy E2E GPU và tổng hợp tài liệu phát hành |
| **Repo Harness (`AGENTS.md` + `game.contract.json` + Hooks/Linters)** | TypeScript `~6.0`, Vitest, ESLint, Prettier | Ràng buộc kiểu tĩnh, kiểm tra tất định, giữ một nguồn số chuẩn duy nhất và ngăn sửa test âm thầm |

---

## 2. Các phiên làm việc quan trọng qua 4 Phase

### Phiên 1 — Phase 1: PRD-0 & Kiến trúc cốt lõi (`tag: phase-1`)
- **Mục tiêu:** Xây dựng monorepo từ con số 0 theo PRD-0 và Test Contract `v1.0`.
- **Cách điều phối AI:** Yêu cầu tách riêng `packages/sim` (thuần TypeScript, bước `1/60 s`, PRNG `mulberry32`) khỏi `apps/headless` và `apps/web` (Three.js).
- **Can thiệp của con người:** Sau khi chơi thử bản đầu, phát hiện tạo hình Mây (chỉ là hình nón + trụ đơn giản) và Bóng Mực chưa giống mô tả nhân vật; yêu cầu AI thiết kế lại rig 3D thủ tục cho Mây (nón lá, khăn đỏ, bím tóc, đèn lồng cầm tay đung đưa) và Bóng Mực (lõi mực tối, viền tím phát sáng, mắt, giọt mực bay quanh).
- **Kết quả:** `42/42` test đạt, hash JSONL giữa Windows và Docker Linux trùng tuyệt đối.

### Phiên 2 — Phase 2: Đồng bộ số liệu chuẩn & Mở rộng 3 Đêm (`tag: phase-2`)
- **Mục tiêu:** Chuẩn hóa toàn bộ hằng số theo Ticket-02, áp dụng đúng thứ tự 12 bước/tick, thêm Đêm 2 (Đảo Cau) và Đêm 3 (Đảo Chuông), Lướt, Gió Lạc, Bùa Gió, gió mạnh, HUD chuẩn và âm thanh.
- **Lúc AI sai & cách sửa:**
  1. *Lỗi công thức góc trong bản nháp kế hoạch:* Bản nháp đầu ghi `z = -r·sin θ`. Khi đối chiếu với tọa độ đèn `L1(0,0,25)` và `L2(23.8,0,7.7)` trong đề bài, phát hiện phải là `z = r·sin θ` nên sửa ngay trước khi viết `maps.ts`.
  2. *Lỗi âm thanh nền kêu "ù ù":* AI tổng hợp nhạc nền bằng 3 oscillator sóng `triangle` ở tần số trầm (`110, 165, 220 Hz`) chạy liên tục không ngắt. Khi mở trình duyệt nghe thực tế, loa phát tiếng ù nền liên tục kể cả lúc Tạm dừng. Đã yêu cầu AI bỏ hoàn toàn các oscillator chạy liên tục trong `apps/web/src/audio.ts`, thay bằng giai điệu chuông ngũ cung từng nốt rời có envelope `fade-in/fade-out` và tự động tắt nhạc khi mở menu Pause.
- **Kết quả:** `98/98` test đạt, 3 Đêm tất định giữa Windows và Docker, Chrome GPU đạt `59,9 FPS`.

### Phiên 3 — Phase 3: Change Request "Đèn cạn dầu" (`tag: phase-3`)
- **Mục tiêu:** Chuyển luật cốt lõi từ "thắp hết đèn" sang "giữ đảo sáng tới bình minh" (Contract `v1.2`), nhiên liệu đơn vị `1/60`, Bóng Mực hút dầu (`drain`), sức chứa tăng dần, chế độ mù màu, viết `ADR-001` và `CHANGELOG.md`.
- **Cách điều phối AI:** Tổ chức thành đồ thị 16 node có tách riêng nhánh viết code (`B1, B2, B3, F1, U1`), nhánh viết test (`TW1, TW2`) và nhánh review độc lập (`R1..R4`).
- **Lúc AI sai & cách sửa:**
  1. *Giả định sai `G11` về đẩy Bóng Mực (`eject`):* Node `B2` bỏ qua không đẩy Bóng Mực đang `stunned`/`spawning`. Node review `R2` dựng lại bản `phase-2` để kiểm chứng và phát hiện Phase 2 đẩy mọi trạng thái; node `X1` đã khôi phục lại đúng hành vi để không làm hỏng regression Phase 1–2.
  2. *Bot thua `0/20` ở Đêm 2 và Đêm 3:* Không cho phép hạ `win_ratio = 0.6` hay `.skip` test; phân tích log để sửa lỗi tìm đường ở dốc Đêm 3 và đổi chiến thuật sang tích trữ đom đóm vào đèn tắt rồi thắp cuối đêm ⇒ bot thắng cả 3 Đêm (`19/20, 12/20, 4/20`).
  3. *File rác `tests/zz_qa_trace.test.ts`:* Phát hiện ở bước review cuối trước khi commit do làm đỏ `pnpm lint` và `pnpm test`; đã xóa sạch và chạy lại toàn bộ kiểm chứng xanh 100%.

### Phiên 4 — Phase 4: Benchmark, Soak, Accessibility & Phát hành `v1.0.0` (`tag: phase-4`)
- **Mục tiêu:** Triển khai `bench_cmd`, `soak_cmd`, bảng xếp hạng cục bộ + `--export-leaderboard`, đổi phím 9 hành động, phụ đề + mũi tên cảnh báo Bóng Mực, giảm chuyển động, cỡ chữ `≥ 18 px` (`×1.25`), đóng gói tài liệu và quay video demo.
- **Lúc AI sai / chưa tối ưu & cách sửa:**
  - Lần chạy benchmark đầu tiên với `200` Bóng Mực chỉ đạt `avg_fps = 26,5` do mỗi Bóng Mực tạo riêng `28` mesh trang trí và `20+` geometry/material (`5.600` draw objects). Áp dụng đúng quy định Ticket-04 (*"Trong cảnh benchmark và soak test, nhân vật, kẻ địch và hiệu ứng sáng tạo thêm phải tắt"*), chia sẻ `SphereGeometry`/`Material` dùng chung và tắt các mesh trang trí phụ trong chế độ `bench` ⇒ `avg_fps` tăng vọt lên **`159,7 FPS`**, `p1_low_fps = 116,5 FPS`.

---

## 3. Ước tính Chi phí / Token & Chiến lược Tiết kiệm

| Phase | Số lượt Agent / Subagent (ước tính) | Input Tokens (ước tính, gồm cache) | Output Tokens (ước tính) | Chi phí quy đổi ước tính (USD) |
| :--- | :-: | :-: | :-: | :-: |
| **Phase 1** (`v1.0`) | ~6 | ~0,5 M | ~45 K | ~$3,00 |
| **Phase 2** (`v1.1`) | ~10 | ~1,1 M | ~85 K | ~$6,50 |
| **Phase 3** (`v1.2`) | ~18 | ~1,9 M | ~130 K | ~$11,50 |
| **Phase 4** (`v1.3`) | ~6 | ~0,6 M | ~50 K | ~$3,50 |
| **Tổng cộng** | **~40 lượt** | **~4,1 M** | **~310 K** | **~$24,50** |

- **Cách tiết kiệm token hiệu quả nhất:**
  1. Giữ `AGENTS.md` súc tích (`< 100` dòng), chỉ ghi quy tắc bất biến và cách khắc phục lỗi môi trường (Chrome GPU `--use-angle=d3d11`, Docker `create/cp/start`).
  2. Tách nhỏ module theo trách nhiệm để mỗi lượt sửa chỉ đọc đúng file cần thiết.
  3. Chạy Vitest headless (`< 1 s` cho các suite đơn lẻ) để bắt lỗi logic sớm trước khi chạy Docker hoặc trình duyệt.
