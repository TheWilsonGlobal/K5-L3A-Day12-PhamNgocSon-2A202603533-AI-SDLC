# docs — Đảo Đèn Lồng (Phase 1)

Trạng thái ngày 20/11/2026.

## Trạng thái hiện tại

| Hạng mục | Trạng thái |
| :--- | :--- |
| Phase 1 (PRD-0 + Test Contract v1.0) | **Đã triển khai**, kiểm chứng tự động đạt |
| Phase 2, 3, 4 | Chưa phát hành ticket; chưa làm |
| Sim core, headless CLI, `game.contract.json` | Xong; 42/42 test, tất định (trùng hash Windows ↔ Docker Linux) |
| Bản chơi web (Three.js) | Xong, có HUD, minimap, nhãn `H`, tạm dừng + hướng dẫn `P`, nhân vật dựng lại, favicon; **chưa chơi tay trọn ván** |
| Docker | Build và chạy headless được; lệnh `docker run -v` chưa kiểm được ở máy này |
| Git | **Chưa commit, chưa tag `phase-1`** (chờ yêu cầu) |
| Việc tồn đọng | Xem "Việc còn lại" trong [notes/phase-1.md](notes/phase-1.md) |

## Mục lục

- [spec/phase-1.md](spec/phase-1.md) — tiêu chí nghiệm thu, giả định luật chơi, giao diện bản chơi.
- [notes/phase-1.md](notes/phase-1.md) — nhật ký dùng AI, kết quả kiểm chứng, lỗi đã gặp, hạn chế, việc còn lại.
- [evidence/phase-1/](evidence/phase-1/) — log test, cặp output để so hash, 12 ảnh chụp giao diện hiện tại (danh sách trong notes).
- Kế hoạch và nhật ký cập nhật (repo VIN-AIA-Docs): [phase-01-plan.md](../../../../VIN-AIA-Docs/Lab/Day12-AI-SDLC/phase-01-plan.md) · [phase-01-updated-01.md](../../../../VIN-AIA-Docs/Lab/Day12-AI-SDLC/phase-01-updated-01.md).

## Lệnh nhanh

```bash
pnpm install && pnpm build && pnpm dev   # chơi
pnpm test                                 # build headless + 42 test
pnpm typecheck && pnpm lint
```
