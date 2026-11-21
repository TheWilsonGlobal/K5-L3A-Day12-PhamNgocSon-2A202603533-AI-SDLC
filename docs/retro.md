# Retrospective — Dự án Đảo Đèn Lồng (4 Phases AI SDLC)

- **Học viên:** Phạm Ngọc Sơn (`2A202603533`) · **Lớp:** K5-L3A
- **Repo:** `K5-L3A-Day12-PhamNgocSon-2A202603533-AI-SDLC` · **Phiên bản phát hành:** `v1.0.0` (Contract `v1.3`)

---

## 1. Tổng hợp Evaluation qua 4 Phase

| Phase | Tag & Contract | Trọng tâm yêu cầu | Kết quả kiểm chứng (Verification & Evidence) |
| :--- | :--- | :--- | :--- |
| **Phase 1** | `phase-1` (`v1.0`) | PRD-0 mở, Đêm 1 cơ bản, CLI headless JSONL tất định, bản 3D chơi được | **42/42 test đạt**; SHA-256 trùng khít giữa Windows và Docker Linux; WebGL 3D chạy mượt |
| **Phase 2** | `phase-2` (`v1.1`) | Chuẩn hóa số liệu, thứ tự 12 bước/tick, mở rộng 3 Đêm, Lướt, Gió Lạc, Bùa Gió, gió mạnh, HUD & bảng màu chuẩn | **98/98 test đạt**; tất định 3 Đêm giữa Windows & Docker; headless 21.600 tick `< 0,8 s` (ngưỡng 30 s); Chrome GPU **59,9 FPS** @ `1280×720` |
| **Phase 3** | `phase-3` (`v1.2`) | Change Request "Đèn cạn dầu": nhiên liệu 1/60, Bóng Mực `drain`, thắng ở bình minh (`0.6`), sức chứa tăng dần, chế độ mù màu, ADR & Changelog | **180/180 test đạt** (0 `.skip`); bot thắng cả 3 Đêm (`19/20, 12/20, 4/20`); 9/9 kịch bản (gồm đường dầu) trùng hash Native = Docker; E2E Chrome GPU `18/18` đạt (**59,9 FPS**) |
| **Phase 4** | `phase-4` + `v1.0.0` (`v1.3`) | Benchmark 200 Bóng Mực + 100 đom đóm, Soak 10 Đêm liên tiếp, Bảng xếp hạng cục bộ + CLI export, Accessibility (đổi phím, phụ đề, giảm chuyển động, chữ ≥ 18 px), đóng gói phát hành | **190/190 test đạt**; `soak.json` 10 Đêm `crashes = 0`, `mem_end_mb ≤ 1.2 × mem_start_mb`; `bench.json` đạt ngưỡng FPS & `load_ms`; E2E xác nhận đầy đủ Accessibility & Leaderboard |

---

## 2. Điều gì hiệu quả và không hiệu quả khi làm việc với AI

### Hiệu quả cao
- **Tách kiến trúc `packages/sim` thuần TypeScript ngay từ Phase 1:** Không phụ thuộc DOM, Three.js hay đồng hồ hệ thống. Nhờ vậy khi Phase 2 đồng bộ 12 bước/tick, Phase 3 thay toàn bộ mô hình đèn & luật thắng, hay Phase 4 thêm Soak 10 Đêm và cảnh Benchmark 200 Bóng Mực, AI chỉ cần sửa một nơi duy nhất (`packages/sim`) và kiểm chứng tức thì trong vài trăm mili-giây.
- **Viết `plan.md` và `docs/spec/phase-N.md` trước khi cho AI viết code:** Việc buộc AI liệt kê bảng ánh xạ số liệu và danh sách giả định (`G1..G24`) trước khi code giúp phát hiện sớm các mâu thuẫn giữa chữ trong ticket và thứ tự xử lý thực tế.
- **Dùng Chrome GPU thật (`--use-angle=d3d11`) qua CDP WebSocket để kiểm tra giao diện:** Thay vì chỉ tin vào `pnpm build`, script E2E tự động kiểm tra FPS thật, kiểm tra màu CSS, độ xẹp đèn tắt, nhấp nháy 1 Hz và chụp ảnh bằng chứng.

### Chưa hiệu quả
- **Tự động hóa âm thanh bằng thông số thuần lý thuyết:** Ở Phase 2, AI tạo nhạc nền bằng 3 oscillator `triangle` tần số thấp (`110/165/220 Hz`) chạy liên tục. Về mặt code không có lỗi, nhưng khi người thật nghe bằng loa lại tạo ra tiếng **ù ù** khó chịu. Phải có bước người thật chơi và nghe thử để đổi sang giai điệu chuông ngũ cung từng nốt rời có envelope.
- **Lệnh shell phức tạp trên Windows / Git Bash:** Các lệnh heredoc dài hoặc đường dẫn `/tmp/...` trong Git Bash dễ bị `MSYS` biến đổi làm lỗi lệnh Docker hoặc bật popup xin quyền.

---

## 3. Những lần AI sai và cách phát hiện / sửa lỗi

1. **Sai công thức hệ tọa độ góc ở bản nháp kế hoạch Phase 2 (`z = -r·sin θ` thay vì `z = r·sin θ`):**
   - *Cách phát hiện:* Đối chiếu tọa độ 5 đèn Đêm 1 trong ticket (`L1 (0,0,25)` ứng với `90°`, `L2 (23.8,0,7.7)` ứng với `18°`) trước khi code `maps.ts`.
   - *Cách sửa:* Chốt quy ước `x = r·cos θ, z = r·sin θ` trong `AGENTS.md` và `maps.ts`.
2. **Giả định sai ở Phase 3 (`G11`) rằng Phase 2 không đẩy Bóng Mực đang `stunned`/`spawning` khi thắp đèn:**
   - *Cách phát hiện:* Node review `R2` checkout lại mã nguồn ở tag `phase-2` để so sánh hành vi thực tế và phát hiện Phase 2 đẩy **mọi** trạng thái; việc bỏ qua `stunned`/`spawning` làm lệch đầu ra regression Phase 1–2.
   - *Cách sửa:* Node `X1` khôi phục đúng điều kiện đẩy của Phase 2 cho cả thắp mới, thắp lại và châm dầu, rồi kiểm tra lại vị trí ở tick 10 & 20 trùng khít tag `phase-2`.
3. **Mâu thuẫn giữa chữ trong ticket và thứ tự tick ở Phase 3 (`G19` — nạp vào đèn `fuel = 100`):**
   - *Cách phát hiện:* Test `P4` kiểm tra "đèn đầy dầu không nhận tương tác" bị đỏ vì bước 2a (trừ `1/60` dầu) chạy trước bước 5 (tương tác), nên đèn đặt `fuel = 100` ở đầu tick chỉ còn `5999/6000` đơn vị khi tới bước 5 và vẫn nhận `1` đom đóm.
   - *Cách sửa:* Không bẻ cong thứ tự tick để chiều test; ghi nhận chính thức thành giả định `G19` trong `docs/spec/phase-3.md` và `CHANGELOG.md`.
4. **Bot Phase 3 thua `0/20` ở Đêm 2 & Đêm 3 trong 3 lần thử đầu:**
   - *Cách phát hiện:* Thay vì hạ `win_ratio = 0.6` cho test xanh, kiểm tra log hành vi bot và phát hiện lưới dò đường `0,5 m` làm bot kẹt cạnh dốc Đêm 3, dùng Tỏa Sáng hoang phí (`27–45` đom đóm/trận) và mang nhiều đom đóm nên bị Gió Lạc cướp.
   - *Cách sửa:* Đổi chiến thuật bot sang nạp tích trữ dần vào đèn tắt rồi thắp đồng loạt cuối đêm → thắng cả 3 Đêm (`19/20`, `12/20`, `4/20`) với đúng `win_ratio = 0.6`.
5. **File rác gỡ lỗi `tests/zz_qa_trace.test.ts` làm đỏ `pnpm test` và `pnpm lint` cuối Phase 3:**
   - *Cách phát hiện:* Bước review trước khi commit chạy lại lệnh gốc của dự án phát hiện 1 file untracked sinh ra từ phiên subagent bị ngắt.
   - *Cách sửa:* Xóa file rác và chạy lại toàn bộ `typecheck + lint + prettier + test + build` xanh 100% trước khi gắn tag `phase-3`.

---

## 4. Harness nào giúp nhiều nhất

- **`AGENTS.md` (ngắn gọn, chứa đúng quy tắc bất biến & bẫy thực tế):** Là "bộ nhớ dài hạn" hiệu quả nhất. Mỗi khi gặp lỗi môi trường (như Chrome headless mặc định rơi vào SwiftShader `~5 FPS` cần `--use-angle=d3d11`, hay `docker run -v` lỗi trên Windows cần `docker create + docker cp + docker start -a`), ghi ngay vào `AGENTS.md` giúp các lượt agent sau không bao giờ lặp lại lỗi đó.
- **`game.contract.json` làm Single Source of Truth + số nguyên `1/60` cho nhiên liệu:** Mọi package (`sim`, `headless`, `web`, `tests`) import chung `game.contract.json`, loại bỏ hoàn toàn lỗi lệch hằng số giữa UI và simulation.
- **Tách node Review độc lập (`R1..R4`) chỉ đọc diff và cấm sửa test để chiều code (`FALLBACKS: none`):** Ngăn chặn thói quen phổ biến nhất của AI là âm thầm nới lỏng assertion hoặc dùng `.skip` khi test khó đạt.

---

## 5. Tổng Token / Chi phí AI ước tính & Cách tiết kiệm Token

- **Ước tính tổng lượng sử dụng qua 4 Phase:**
  - Khoảng **35–45 lượt agent / subagent** (gồm lập kế hoạch, viết spec/ADR, code `sim`/`headless`/`web`, viết test, review diff, chạy Docker & Chrome E2E, sửa lỗi âm thanh và hoàn thiện Phase 4).
  - Tổng token ước tính: **~3,5 – 4,5 triệu input tokens** (phần lớn là cache hit trên context repo) và **~250 – 350 nghìn output tokens**, tương đương chi phí ước tính **~$18 – $28 USD** theo đơn giá API tiêu chuẩn.
- **Các kỹ thuật tiết kiệm token đã áp dụng:**
  1. **Giữ `AGENTS.md` dưới 100 dòng:** Chỉ lưu quy tắc bất biến, kiến trúc file và bẫy môi trường, không nhồi lại toàn bộ đề bài vào file luôn nạp mỗi lượt.
  2. **Chia file theo miền trách nhiệm rõ ràng (`sim.ts`, `maps.ts`, `headless.ts`, `hud.ts`, `overlay.ts`, `world.ts`, `characters.ts`, `creatures.ts`, `audio.ts`, `settings.ts`):** Mỗi agent chỉ cần đọc 1–2 file liên quan trực tiếp thay vì đọc một file monolith hàng nghìn dòng.
  3. **Kiểm tra bằng Vitest headless (`< 1 giây`) trước khi mở trình duyệt hay Docker:** 95% lỗi logic được bắt ở tầng unit/scenario với chi phí log rất nhỏ, chỉ chạy Docker và Chrome E2E ở bước nghiệm thu cuối mỗi phase.

---

## 6. Nếu làm lại từ đầu sẽ thay đổi gì

1. **Thiết kế `run_cmd` là một script Node thống nhất (`node scripts/run.mjs`) ngay từ Phase 1:** Thay vì để `run_cmd: "pnpm dev"` ở Phase 1–3 rồi sang Phase 4 mới chuyển sang `node scripts/run.mjs` khi có yêu cầu `--export-leaderboard out.json` và lưu đĩa cục bộ.
2. **Đặt quy ước cỡ chữ tối thiểu (`≥ 18 px`) và CSS token bảng màu ngay từ Phase 2:** Tránh việc Phase 2 dùng một số cỡ chữ `11–15 px` và mã màu hardcode trong `overlay.ts`, rồi Phase 3–4 phải rà lại để hỗ trợ chế độ mù màu và chữ lớn `×1.25`.
3. **Nghe thử âm thanh và chơi thử tay sớm hơn ngay trong vòng lặp build:** Kết hợp kiểm thử tự động (Vitest + CDP GPU) với 2 phút trải nghiệm trực tiếp của con người ở cuối mỗi phase để bắt ngay các vấn đề cảm nhận như tiếng ù tần số thấp.
