# AGENTS.md — Đảo Đèn Lồng

Quy tắc cho mọi coding agent làm việc trong repo này.

## Kiến trúc

- `packages/sim` — **sim core** thuần TypeScript (không DOM, không Three, không đồng hồ thực). Bước cố định 1/60 s, PRNG có seed (`mulberry32`). Chứa luật chơi, parser inputs/scenario, `runHeadless`.
- `apps/headless` — CLI mỏng gọi `runHeadless`; build bằng esbuild ra `apps/headless/dist/headless.js`.
- `apps/web` — Three.js + Vite. **Chỉ đọc state từ sim**, không chứa luật chơi. `src/main.ts` (vòng lặp, camera, nhập liệu, cảnh), `characters.ts` (Mây, Bóng Mực), `hud.ts` (HUD), `overlay.ts` (minimap, nhãn `H`), `public/favicon.svg`. Popup hướng dẫn (`P`) và CSS nằm trong `index.html`.
- `game.contract.json` — Test Contract v1.0. `tuning` là nguồn duy nhất: sim/web/headless đều import từ đây. **Không** hardcode số tuning ở nơi khác.

## Quy tắc bất biến

1. Tất định: không `Date.now()`, không `Math.random()`, không phụ thuộc thứ tự duyệt `Map`/`Set` trong sim. Mọi ngẫu nhiên đi qua `makeRng(seed)`.
2. Khoảng cách trong `tuning` đo trên mặt phẳng XZ; "trong bán kính r" là `≤ r`. Output làm tròn 3 chữ số.
3. Mô hình tick: snapshot tick 0 sau scenario, trước input; bước k đọc input tick k, sự kiện gắn `tick = k+1`; `--ticks N` chạy đúng N bước.
4. Dựng scenario không phát sự kiện và không cộng điểm.
5. Sửa `tuning` ⇒ chạy lại test; test sinh tình huống từ chính các số này.

## Lệnh

- `pnpm install` · `pnpm build` · `pnpm dev` · `pnpm test` · `pnpm typecheck` · `pnpm lint`
- TypeScript ghim `~6.0` (typescript-eslint chưa nhận TS 7). pnpm 12 chặn build script: `allowBuilds` trong `pnpm-workspace.yaml` cho phép esbuild.

## Kiểm tra giao diện web

- Không có test tự động cho `apps/web`. Kiểm bằng `pnpm typecheck`, `pnpm lint`, `pnpm build`, rồi chạy `vite` (dev) và điều khiển Chrome headless qua DevTools (phím thật + ảnh chụp). Bản dev có hook `window.__ddl.sim` (chỉ tồn tại ở `import.meta.env.DEV`) để dựng tình huống; đừng dùng hook này trong mã production.
- File/thư mục tạm của kiểm thử để trong `out/` (đã gitignore, ESLint/Prettier bỏ qua); xóa khi xong. Không chạy lệnh có `python - <<EOF` rỗng (treo chờ stdin).
- Docker trên máy này: `docker run -v` lỗi `invalid mode` và stdout container rỗng; dùng `docker create` + `docker cp` + `docker start -a`.

## Không được báo "xong" khi chưa

- Chạy `pnpm test` (có build headless) và thấy tất cả đạt, **và**
- Với thay đổi ảnh hưởng headless: chạy lại 2 lần cùng seed và so hash, hoặc chạy trong Docker.
- Không sửa test cho đạt; nếu đổi luật thì ghi lý do trong `docs/spec/phase-N.md`.
- Không commit/tag khi chưa được yêu cầu. Không commit `.env`/key.
