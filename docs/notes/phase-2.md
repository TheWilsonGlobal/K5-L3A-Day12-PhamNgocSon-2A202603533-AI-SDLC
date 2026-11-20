# Ghi chú Phase 2 — nhật ký AI, kết quả, retro

Cập nhật: 20/11/2026. Tổng quan trạng thái: [docs/README.md](../README.md). Spec: [docs/spec/phase-2.md](../spec/phase-2.md).

## Quy trình đã làm
Đọc ticket → rà kế hoạch (`plan.md` bên VIN-AIA-Docs) với ticket → spec + `AGENTS.md` → viết sim v1.1 → viết test (regression Phase 1 với số chuẩn + scenario cho từng tính năng) → bản web (3 đêm, luồng màn hình, HUD, âm thanh, cài đặt) → kiểm chứng (Docker, so hash, trình duyệt thật, FPS) → ghi chú.

## Dùng AI thế nào
- Một agent (Claude) viết sim, CLI, web, test, tài liệu; người dùng điều phối và đưa ticket/kế hoạch.
- **Token/chi phí:** không đo được từ phía agent nên **không ghi số ước lượng**.
- Rà kế hoạch trước khi code tìm ra: công thức góc sai (`z = −r·sin θ`; đúng là `z = r·sin θ` theo tọa độ đèn của chính ticket), bước cuối kế hoạch tự đẩy `origin/main` và gắn tag (không làm khi chưa được yêu cầu), thiếu bảng ánh xạ số chuẩn → `tuning`, thiếu danh sách giả định.

## Kết quả kiểm chứng (bằng chứng ở `docs/evidence/phase-2/`)

| Hạng mục | Kết quả (20/11/2026) |
| :--- | :--- |
| `pnpm typecheck` / `lint` / `prettier --check` / `build` | Đạt (`test-run.log`); web `index-*.js` ≈ 0,5 MB, Vite cảnh báo > 500 kB |
| `pnpm test` | 4 file, **98/98 đạt** (`test-run.log`) |
| Scenario headless cho từng tính năng | Lướt, Bùa Gió, Gió Lạc, tạm dừng, Đêm 2 (cầu, bục nhảy ×2), Đêm 3 (tầng, dốc, bục nhảy, tháp, gió, 4,5 m/s) — `tests/features.test.ts` |
| Regression Phase 1 với số chuẩn | `tests/regression.test.ts` |
| Tất định | Cả 3 Đêm (seed 42, 21.600 tick, input có Lướt): file output **giống hệt từng byte** giữa Windows/Node 24 và Docker Linux/Node 22; hash ở `determinism-hashes.txt` (JSONL ~17 MB mỗi bên không lưu lại; sinh lại bằng `bench.scenario.json`, `bench.inputs.json`) |
| Hiệu năng headless | 21.600 tick: Đêm 1 0,48 s · Đêm 2 0,54 s · Đêm 3 0,76 s (`benchmark.log`); giới hạn 30 s |
| FPS bản chơi | **59,9 FPS trung bình** ở 1280×720, Đêm 3 (Chrome headless, GPU qua ANGLE/D3D11); render phần mềm chỉ ~5 FPS và không đại diện (`e2e-browser.log`) |
| Luồng bản chơi (Chrome headless, phím thật) | menu → giới thiệu → chơi → kết quả (thắng/thua) → Bình Minh; Lướt, tạm dừng đóng băng logic, cài đặt lưu qua reload, bục nhảy Đêm 2 đáp đúng đảo B; không lỗi JS |
| Level chơi được | Bot dò đường đơn giản thắng **5/20 seed** Đêm 1 (thắng khi còn ~1–2 phút); đứng yên thì thua. Đêm 2, 3 **chưa có bot** chứng minh thắng được |

### Bằng chứng

| File | Nội dung |
| :--- | :--- |
| `test-run.log` | typecheck, lint, prettier, build, test |
| `benchmark.log`, `bench.scenario.json`, `bench.inputs.json` | đo 21.600 tick và đầu vào để sinh lại |
| `determinism-hashes.txt` | hash SHA-256 (16 ký tự đầu) native vs Docker, 3 Đêm |
| `e2e-browser.mjs`, `e2e-browser.log` | kịch bản Chrome DevTools và kết quả (gồm FPS) |
| `p2-menu`, `p2-intro-1/2/3` | menu, giới thiệu từng đêm (lời Ông Đăng) |
| `p2-night1`, `p2-night2-labels`, `p2-night2-pad`, `p2-night3-tier`, `p2-night3-ground` | chơi từng đêm: HUD, bản đồ nhỏ, cầu tre, bục nhảy, tầng, dốc, Bùa Gió/Gió Lạc có nhãn `H` |
| `p2-night3-warning`, `p2-night3-wind` | lá bay báo gió trước 2 s, gió đang thổi |
| `p2-pause`, `p2-settings`, `p2-guide`, `p2-guide2` | menu tạm dừng, cài đặt, hướng dẫn |
| `p2-result-3`, `p2-result-lost`, `p2-dawn` | kết quả đêm (thắng/thua), Bình Minh |

Ảnh dựng tình huống bằng hook chỉ có ở `vite dev` (không có trong bản production).

## AI sai ở đâu / điều chỉnh
- Heredoc dài trong shell lại báo lỗi cú pháp (lần thứ ba của dự án) ⇒ chuyển sang công cụ ghi file; ghi vào `AGENTS.md`.
- 8 test đầu fail, **cả 8 là lỗi của chính test** (không phải sim): chạy quá ít tick để Bóng Mực bỏ đuổi, quên bước chase trên tick bị đánh (lệch 0,067 m), đọc snapshot ngoài phạm vi, đứng đè lên bùa nên nhặt lại ngay khi bùa hồi, đếm sai tick tạm dừng (311 không phải 310), làm tròn 11,99999 → 12, đặt người chơi trên bục nhảy, đặt người chơi trong khối tầng 1. Đã sửa test, giữ nguyên sim.
- Bot Phase 1 thua 20/20 với luật mới ⇒ viết lại bot biết tránh và lướt (thắng 5/20); không hạ luật để bot thắng.
- Quên hiệu ứng **lá bay báo gió** ở bản đầu; thêm sau khi đối chiếu lại ticket.
- Dùng `rm` với biến shell bị hệ thống chặn ⇒ dùng đường dẫn cụ thể.

## Hạn chế đã biết (trung thực)
1. **Chưa ai chơi tay trọn một đêm** trên trình duyệt thật, nhất là Đêm 2 và 3 (leo dốc, qua cầu, bục nhảy bằng tay). Các kiểm tra trình duyệt là kịch bản + ảnh chụp.
2. **Âm thanh chưa được nghe.** Chrome headless không phát ra tiếng; chỉ kiểm tra không có lỗi JS khi gọi các hàm âm thanh. Nhạc nền và hiệu ứng có thể cần chỉnh.
3. **Bộ test ẩn của giảng viên chưa biết.** Nhiều chỗ ticket để mở và tôi đã chọn (xem "Giả định" trong spec): điểm xuất phát Đêm 3, tăng tốc tức thời, `spawning` 60 tick, hành vi `wander`, chỉ cướp khi `chase`, hướng/thời điểm gió… có thể lệch kỳ vọng.
4. **Bảng màu** áp dụng theo mã hex nhưng không có kiểm tra màu tự động; đèn/ánh sáng môi trường dùng hệ số riêng (×4).
5. Pause ở bản chơi dừng bằng cách ngừng gọi `step`; đường pause trong sim được test ở headless nhưng bản chơi không gửi `pause`.
6. **Tag `phase-2`, commit và push chưa làm** (chờ yêu cầu). `docker run -v` vẫn chưa kiểm được ở máy này.
7. Bot không chứng minh được Đêm 2, 3 thắng được; chỉ có test cho từng cơ chế.
8. `team` và tên repo vẫn là đoán, chưa đối chiếu Coach.

## Harness
- `AGENTS.md` cập nhật: Phase 2, hợp đồng v1.1, thứ tự 12 bước, cấu trúc web mới, cách đo FPS bằng GPU, lỗi shell hay gặp. Quy tắc "không báo xong khi chưa chạy `pnpm test`" giữ nguyên.
- Lịch sử git phải thể hiện việc cập nhật `AGENTS.md` (DoD): hiện chưa commit nên chưa thể hiện được.

## Việc còn lại trước khi tag
- Chơi thử Đêm 1–3 bằng tay; nghe âm thanh; chỉnh theo phản hồi.
- Đối chiếu `team`, tên repo, cách nộp với Coach; xem lại các giả định ở spec.
- Commit (gồm `AGENTS.md`/`docs/`), push và gắn tag `phase-2` khi được yêu cầu.
