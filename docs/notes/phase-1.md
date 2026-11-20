# Ghi chú Phase 1 — nhật ký AI, kết quả, retro

Cập nhật: 20/11/2026. Trạng thái tổng quan xem [docs/README.md](../README.md).

## Quy trình đã làm
Requirements (`docs/spec/phase-1.md`) → viết test trước (`tests/`) → sim core + headless → bản web → kiểm chứng (Docker, so hash, trình duyệt thật) → vòng chỉnh giao diện theo phản hồi → ghi chú.

## Dùng AI thế nào
- Một agent (Claude) viết toàn bộ sim, CLI, web, test, tài liệu; người dùng điều phối, review và đưa phản hồi chơi thử.
- **Token/chi phí:** không đo được từ phía agent nên **không ghi số ước lượng**.
- Phản hồi của người chơi thử đã đổi sản phẩm: "Đèn 0/5" gây khó hiểu ⇒ thêm tiến độ nạp đèn, hướng dẫn; muốn bản đồ và nhãn ⇒ minimap, phím `H`, `P`; nhân vật giống nấm ⇒ dựng lại Mây và Bóng Mực; HUD thô ⇒ HUD kiểu game.

## Kết quả kiểm chứng

| Hạng mục | Kết quả (kiểm lại 20/11/2026) |
| :--- | :--- |
| `pnpm typecheck` / `lint` / `build` | Đạt; `lint exit=0`; web `index-*.js` 518 kB (gzip 135 kB), Vite cảnh báo > 500 kB |
| `pnpm test` | 3 file, **42/42 đạt** (`test-run.log`) |
| Tất định | Chạy lại `quick-win` và `full-night` (seed 42, 18000 tick) trên Windows/Node 24: SHA-256 **trùng** với bản chạy Docker Linux/Node 22 (`bb8f857c…`, `3e861af3…`) |
| Hiệu năng | Cả đêm 18000 tick ≈ 0,25 s |
| Level chơi được | Bot tham lam thắng 19/20 seed (~2000 tick); đứng yên thì thua `no_flames` ở tick 767 (seed 42) |
| Bản web (trình duyệt thật, Chrome headless + phím qua DevTools) | Nạp đèn dở dang rồi hoàn tất (`deposited 2→4`, `lit`, +100 điểm); tạm dừng đóng băng đồng hồ; phím `H`/`P`/`G`/`Esc`; xung sáng làm Bóng Mực choáng; không có lỗi JS trong console |

### Bằng chứng (`docs/evidence/phase-1/`)

| File | Nội dung |
| :--- | :--- |
| `test-run.log` | typecheck, lint, build, test |
| `quick-win.{native,docker}.jsonl`, `full-night.{native,docker}.jsonl` | cặp output để so hash |
| `web-start.png`, `may-walking.png`, `shade-stunned.png` | nhân vật Mây, Bóng Mực, trạng thái choáng |
| `hud-start.png`, `hud-mid.png`, `hud-low.png` | HUD kiểu game ở 3 tình huống |
| `lantern-partial.png`, `lantern-lit.png` | đèn nạp 2/4 rồi sáng hẳn |
| `minimap.png`, `labels.png`, `guide.png`, `guide2.png` | bản đồ nhỏ (giữa ván, 2 đèn sáng, 1 đèn nạp dở), nhãn `H`, popup hướng dẫn (đầu và cuối) |

Toàn bộ 12 ảnh đã chụp lại ngày 20/11/2026 với giao diện hiện tại (HUD mới, minimap, nhân vật mới). Ảnh chụp dựng tình huống bằng hook kiểm thử chỉ có ở `vite dev` (`import.meta.env.DEV`), không có trong bản production (đã kiểm: 0 lần xuất hiện `__ddl` trong bundle).

## AI sai ở đâu / điều chỉnh
- Gõ nhiều file qua heredoc trong shell bị lỗi cú pháp, không ghi được file nào ⇒ dùng công cụ ghi file.
- Test đầu có lỗi số học của chính mình (kỳ vọng 3 m thay vì 6 m sau 1 s) — sửa test, không sửa sim.
- Test "nhanh" ban đầu chỉ chạy 767 tick vì người đứng yên chết sớm ⇒ đổi sang scenario không Bóng Mực, thêm kiểm tra `ticks == 18000`.
- pnpm 12 chặn build script esbuild ⇒ `allowBuilds` trong `pnpm-workspace.yaml`.
- Lần chụp màn hình đầu: Mây quá tối và đèn treo bị nón che ⇒ làm sáng vật liệu, dời đèn sang mép bên.
- `pnpm lint` treo vì quét thư mục scratch `out/` (có profile Chrome) ⇒ ESLint/Prettier bỏ qua `out/`.
- Lỗi thật tìm được khi chơi thử: phím `E`/`F`/Space bấm ngắn hơn một khung hình có thể bị bỏ sót ⇒ chốt phím bấm đến khi sim đọc. Và chơi lại không xóa cột đèn/vòng an toàn ván trước ⇒ dùng `Group` xóa sạch khi dựng lại.

## Hạn chế đã biết (trung thực)
1. **Chưa ai chơi tay trọn một ván** trên trình duyệt thật (di chuyển, camera, thắng/thua liền mạch); các kiểm tra trình duyệt ở trên là kịch bản + ảnh chụp.
2. **`docker run -v` không dùng được ở máy này** (`invalid mode`, stdout container rỗng); đã kiểm bằng `docker create` + `docker cp`. Lệnh bind mount trong README chưa chạy thành công ở đây.
3. Bộ test ẩn của giảng viên chưa biết; `tuning` và luật PRD-0 để mở là lựa chọn của tôi.
4. `team` và tên repo là đoán, chưa đối chiếu Coach.
5. Camera đặt sau lưng nên chưa thấy mặt Mây; ảnh chụp có đặt tay vị trí Bóng Mực.
6. Chưa có CI; chưa có `favicon.ico`/PNG (chỉ SVG).

## Harness
- `AGENTS.md` / `CLAUDE.md` có quy tắc "không báo xong khi chưa chạy `pnpm test`" và nay mô tả cấu trúc web, hook kiểm thử, thư mục `out/`. Nếu Phase 2 đổi luật: bắt buộc chạy lại regression suite Phase 1.

## Việc còn lại trước khi tag
- Chơi thử một ván trọn vẹn; sửa lỗi nếu có.
- Review code; đối chiếu `team`, tên repo, cách nộp với Coach.
- Commit và gắn tag `phase-1` **chưa làm** (chờ yêu cầu). Hiện toàn bộ mã mới đang chưa theo dõi trong `git status`; README gốc đã được sửa (thêm phần game lên đầu).
