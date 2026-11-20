# AGENTS.md — Đảo Đèn Lồng

Quy tắc cho mọi coding agent làm việc trong repo này. Phạm vi hiện tại: **Phase 2** (Ticket-02, Test Contract **v1.1**, 3 Đêm). Spec: [docs/spec/phase-2.md](docs/spec/phase-2.md) (và `phase-1.md`).

## Kiến trúc

- `packages/sim` — **sim core** thuần TypeScript (không DOM, không Three, không đồng hồ thực). Bước cố định 1/60 s. `sim.ts` (luật chơi, 12 bước/tick), `maps.ts` (3 bản đồ chuẩn + hàm độ cao `groundY`), `headless.ts` (parser inputs/scenario, `runHeadless`), `rng.ts` (`mulberry32`), `types.ts`.
- `apps/headless` — CLI mỏng gọi `runHeadless`; build bằng esbuild ra `apps/headless/dist/headless.js`.
- `apps/web` — Three.js + Vite. **Chỉ đọc state từ sim**, không chứa luật chơi. `src/main.ts` (luồng menu → đêm → kết quả → Bình Minh, vòng lặp, camera, nhập liệu), `world.ts` (địa hình từng đêm + ảnh địa hình cho minimap), `characters.ts` (Mây, Bóng Mực), `creatures.ts` (Gió Lạc, Bùa Gió), `hud.ts`, `overlay.ts` (minimap, nhãn `H`, mũi tên chỉ đèn), `audio.ts` (Web Audio thủ tục), `settings.ts` (localStorage), `palette.ts` (bảng màu chuẩn). Menu, popup và CSS nằm trong `index.html`.
- `game.contract.json` — Test Contract **v1.1**. `tuning` là nguồn duy nhất: sim/web/headless đều import từ đây. **Không** hardcode số tuning ở nơi khác. Số chuẩn không nằm trong `tuning` (nhảy 7, trọng lực −20, Bùa Gió 7,2 m/s…) là hằng ở đầu `sim.ts`.

## Quy tắc bất biến

1. **Tất định:** không `Date.now()`, không `Math.random()`, không phụ thuộc thứ tự duyệt `Map`/`Set` trong sim. Mọi ngẫu nhiên đi qua `makeRng(seed)` (gió dùng hàm băm theo `seed` và số cơn gió). `Math.random()` chỉ được dùng trong `apps/web` cho hiệu ứng thuần hình ảnh.
2. **60 tick/s**, mét, giây, trục Y hướng lên. Góc đo từ +X ngược chiều kim đồng hồ: `x = r·cos θ, z = r·sin θ`.
3. **Thứ tự 12 bước mỗi tick** (không đổi thứ tự): (1) input/pause · (2) giảm bộ đếm · (3) di chuyển Mây, rơi khỏi đảo · (4) nhặt đom đóm, bùa · (5) nạp đèn · (6) vùng an toàn · (7) Tỏa Sáng · (8) di chuyển Bóng Mực, Gió Lạc · (9) chạm: Gió Lạc cướp trước, rồi Bóng Mực (id tăng dần, tối đa 1 hit/tick) · (10) sinh theo lịch (thực thể mới chỉ tương tác từ tick sau) · (11) thắng/thua (hết lửa > thắng > hết giờ) · (12) snapshot (do `runHeadless`).
4. Mô hình tick: snapshot tick 0 sau scenario, trước input; bước k đọc input tick k, sự kiện gắn `tick = k+1`; `--ticks N` chạy đúng N tick. Khi tạm dừng `tick` tăng nhưng `sim_tick`, thời gian, hồi chiêu, spawn, TTL đứng yên.
5. Khoảng cách chạm/nhặt/nạp đo trên XZ (kèm giới hạn chênh cao nếu đề nêu); "trong bán kính r" là `≤ r`; output làm tròn 3 chữ số.
6. Dựng scenario không phát sự kiện và không cộng điểm. Tên trạng thái Bóng Mực phải đúng: `spawning`, `wander`, `chase`, `recoil`, `stunned`.
7. Sửa `tuning` hoặc hằng chuẩn ⇒ chạy lại test; test sinh tình huống từ chính các số này. Phần thêm của bản chơi (hình ảnh, âm thanh) **không** được đổi đầu ra headless.

## Lệnh

- `pnpm install` · `pnpm build` · `pnpm dev` · `pnpm test` · `pnpm typecheck` · `pnpm lint`
- TypeScript ghim `~6.0` (typescript-eslint chưa nhận TS 7). pnpm 12 chặn build script: `allowBuilds` trong `pnpm-workspace.yaml` cho phép esbuild.

## Test

- `tests/regression.test.ts`: hành vi Phase 1 với số chuẩn mới + định dạng + tất định + validate. `tests/features.test.ts`: ≥ 1 scenario headless cho mỗi tính năng mới (Lướt, Bùa Gió, Gió Lạc, tạm dừng, Đêm 2, Đêm 3, gió). `tests/cli.test.ts`: CLI đã build. `tests/bot.test.ts`: bot chơi thử Đêm 1. Dùng `tests/helpers.ts` (`run`, thế giới trống `EMPTY`).
- Thêm tính năng ⇒ thêm scenario headless kèm acceptance criteria trong `docs/spec/phase-N.md`.

## Kiểm tra giao diện web

- Không có test tự động cho `apps/web`. Kiểm bằng `pnpm typecheck`, `pnpm lint`, `pnpm build`, rồi chạy `vite` (dev) và điều khiển Chrome headless qua DevTools: xem `docs/evidence/phase-2/e2e-browser.mjs` (phím thật, ảnh chụp, đo FPS). Bản dev có hook `window.__ddl.sim` và `__ddl.fps` (chỉ tồn tại ở `import.meta.env.DEV`) để dựng tình huống; đừng dùng trong mã production.
- Đo FPS: Chrome headless mặc định render phần mềm (SwiftShader, ~5 FPS, không đại diện). Dùng cờ `--use-angle=d3d11` để chạy bằng GPU.
- File/thư mục tạm của kiểm thử để trong `out/` (đã gitignore, ESLint/Prettier bỏ qua); xóa khi xong. Không chạy lệnh có `python - <<EOF` rỗng (treo chờ stdin). Heredoc dài trong bash dễ lỗi cú pháp: dùng công cụ ghi file.
- Docker trên máy này: `docker run -v` lỗi `invalid mode` và stdout container rỗng; dùng `docker create` + `docker cp` + `docker start -a`.

## Không được báo "xong" khi chưa

- Chạy `pnpm test` (có build headless) và thấy tất cả đạt, **và**
- Với thay đổi ảnh hưởng headless: chạy lại 2 lần cùng seed và so hash, hoặc chạy trong Docker.
- Không sửa test cho đạt; nếu đổi luật thì ghi lý do trong `docs/spec/phase-N.md`.
- Không commit/push/tag khi chưa được yêu cầu. Không commit `.env`/key.
