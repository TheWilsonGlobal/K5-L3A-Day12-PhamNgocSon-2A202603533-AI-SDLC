# docs — Đảo Đèn Lồng

Trạng thái ngày 20/11/2026.

## Trạng thái hiện tại

| Hạng mục | Trạng thái |
| :--- | :--- |
| Phase 1 (PRD-0 + Test Contract v1.0) | Hoàn tất, đã commit và gắn tag `phase-1` |
| **Phase 2 (Ticket-02 "Ba hòn đảo", Contract v1.1)** | **Đã triển khai trong working tree, chưa commit, chưa tag `phase-2`** |
| Phase 3, 4 | Chưa phát hành ticket; chưa làm |
| Sim core v1.1, headless, 3 Đêm | Xong; 98/98 test; tất định cả 3 Đêm (trùng hash Windows ↔ Docker Linux); 21.600 tick < 1 s |
| Bản chơi web | 3 Đêm, menu → giới thiệu → kết quả → Bình Minh, tạm dừng, cài đặt lưu bền, âm thanh, HUD, minimap, nhãn `H`; 59,9 FPS (GPU, 1280×720); **chưa chơi tay trọn đêm, chưa nghe âm thanh** |
| Docker | Build và chạy headless được cả 3 Đêm; lệnh `docker run -v` chưa kiểm được ở máy này |
| Việc tồn đọng | "Việc còn lại" trong [notes/phase-2.md](notes/phase-2.md) |

## Mục lục

- [spec/phase-2.md](spec/phase-2.md) — số chuẩn → `tuning`, acceptance criteria theo từng mục của ticket, giả định ticket để mở. [spec/phase-1.md](spec/phase-1.md) — Phase 1 (một số quyết định bị số chuẩn Phase 2 thay thế).
- [notes/phase-2.md](notes/phase-2.md) — nhật ký dùng AI, kết quả kiểm chứng, lỗi đã gặp, hạn chế, việc còn lại. [notes/phase-1.md](notes/phase-1.md) — Phase 1.
- [evidence/phase-2/](evidence/phase-2/) — log test/benchmark/trình duyệt, hash tất định, ảnh chụp (danh sách trong notes). [evidence/phase-1/](evidence/phase-1/) — Phase 1.
- Kế hoạch và nhật ký cập nhật (repo VIN-AIA-Docs): [phase-02/plan.md](../../../../VIN-AIA-Docs/Lab/Day12-AI-SDLC/phase-02/plan.md) · [phase-02/updated-01.md](../../../../VIN-AIA-Docs/Lab/Day12-AI-SDLC/phase-02/updated-01.md) · Phase 1: [phase-01-plan.md](../../../../VIN-AIA-Docs/Lab/Day12-AI-SDLC/phase-01/phase-01-plan.md).

## Lệnh nhanh

```bash
pnpm install && pnpm build && pnpm dev   # chơi
pnpm test                                 # build headless + 98 test
pnpm typecheck && pnpm lint
```
