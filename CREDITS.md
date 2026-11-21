# CREDITS — Đảo Đèn Lồng (v1.0.0)

## Tác giả & Bản quyền nội dung gốc

- **Học viên:** Phạm Ngọc Sơn · **MSSV:** `2A202603533` · **Lớp:** K5-L3A
- **Bối cảnh, nhân vật & thiết kế gốc:** Mây, Ông Đăng, Bóng Mực, Gió Lạc, Bùa Gió và ba hòn đảo (Đảo Bến, Đảo Cau, Đảo Chuông) thuộc đề bài **Day 12 — AI SDLC Lab: Đảo Đèn Lồng**.
- **Mô hình 3D & Hình học:** Tự dựng hoàn toàn bằng hình học thủ tục (procedural geometry) với `Three.js` (`apps/web/src/characters.ts`, `creatures.ts`, `world.ts`) — không sử dụng mô hình 3D hay texture thương mại bên ngoài.
- **Biểu tượng giao diện (HUD Icons):** SVG inline tự thiết kế (`apps/web/src/hud.ts`).
- **Âm thanh & Nhạc nền:** Tự tổng hợp hoàn toàn bằng **Web Audio API** thủ tục (`apps/web/src/audio.ts`) — giai điệu chuông ngũ cung (`PENTATONIC`) và hiệu ứng âm thanh tổng hợp (`OscillatorNode`, `AudioBuffer` white-noise qua `BiquadFilterNode`), không sử dụng file nhạc hay mẫu âm thanh bên ngoài.

## Thư viện mã nguồn mở

| Thư viện                                                         | Giấy phép  | Vai trò                                                          |
| :--------------------------------------------------------------- | :--------- | :--------------------------------------------------------------- |
| [Three.js](https://threejs.org/) (`^0.170.0`)                    | MIT        | Dựng cảnh 3D WebGL2, ánh sáng, sương mù, nhân vật                |
| [Vite](https://vite.dev/) (`^6.0.0`)                             | MIT        | Đóng gói và máy chủ phát triển cho `apps/web`                    |
| [esbuild](https://esbuild.github.io/) (`^0.25.0`)                | MIT        | Đóng gói bundle CLI `apps/headless/dist/headless.js` và `sim.js` |
| [TypeScript](https://www.typescriptlang.org/) (`~6.0.0`)         | Apache-2.0 | Kiểm tra kiểu tĩnh toàn bộ monorepo                              |
| [Vitest](https://vitest.dev/) (`^3.0.0`)                         | MIT        | Khung kiểm thử tự động (unit, scenario, regression, bot, CLI)    |
| [ESLint](https://eslint.org/) & [Prettier](https://prettier.io/) | MIT        | Kiểm tra quy chuẩn mã nguồn và định dạng tự động                 |

## Công cụ AI hỗ trợ phát triển (AI SDLC Harness)

- **Claude Code / Antigravity AI Assistant:** Hỗ trợ phân tích yêu cầu, lập kế hoạch theo từng phase (`plan.md`), viết đặc tả (`docs/spec/phase-1..4.md`), ADR (`docs/adr/ADR-001-lantern-state-and-win-rule.md`), cài đặt simulation tất định (`packages/sim`), giao diện 3D (`apps/web`), bộ kiểm thử tự động (`tests/`) và kịch bản E2E trình duyệt GPU.
- **Harness trong repo:** `AGENTS.md` (quy tắc bất biến cho agent), `game.contract.json` (nguồn số chuẩn duy nhất), và hệ thống kiểm thử tất định giữa Windows / Docker Linux.
