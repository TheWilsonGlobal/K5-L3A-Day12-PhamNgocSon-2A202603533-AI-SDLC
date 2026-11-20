# Đảo Đèn Lồng — Night 1 (Phase 1)

Game 3D góc nhìn thứ ba: **Mây** gom đom đóm, thắp 5 Đèn Lồng Lớn trên đảo, né **Bóng Mực** và xua chúng bằng xung sáng. Có bản chơi (Three.js) và chế độ **headless** theo Test Contract v1.0.

## Cài đặt và chạy (3 lệnh)

Cần Node.js ≥ 22 và pnpm.

```bash
pnpm install
pnpm build
pnpm dev        # mở http://localhost:5173
```

Kiểm thử: `pnpm test` (build headless + 42 test, gồm kiểm tra tất định).

## Điều khiển

| Phím | Việc |
| :--- | :--- |
| `W A S D` / mũi tên | Di chuyển (theo hướng camera) |
| `Space` | Nhảy |
| `E` | Nạp đom đóm vào đèn gần nhất chưa sáng (trong 3 m) |
| `F` | Xung sáng: choáng và đẩy lùi Bóng Mực (tốn 1 đom đóm) |
| `Q` / `R` hoặc kéo chuột | Xoay camera |
| `H` | Bật/tắt nhãn tên cho mọi vật trên màn hình |
| `P` / `G` / `Esc` | Tạm dừng và mở hướng dẫn (popup) |
| `Enter` | Chơi lại sau khi thắng/thua |

Góc phải dưới có **bản đồ nhỏ** (phía trên = hướng camera). Đom đóm được nhặt tự động khi đi qua. Mỗi đèn cần **4** đom đóm; mang tối đa **5**.

## Cách tính điểm

| Sự kiện | Điểm |
| :--- | :---: |
| Nhặt 1 đom đóm | +10 |
| Thắp sáng 1 đèn | +100 |
| Xung sáng choáng 1 Bóng Mực | +20 |
| Thắng: mỗi giây còn lại (làm tròn xuống) | +1 |
| Thắng: mỗi Ngọn Lửa còn lại | +50 |

Thắng khi thắp đủ 5 đèn (`all_lit`). Thua khi hết 3 Ngọn Lửa (`no_flames`) hoặc hết 300 s (`dawn`). Bị Bóng Mực chạm: mất 1 Ngọn Lửa, rơi một nửa số đom đóm đang mang (làm tròn lên), bất tử 2 s. Bóng Mực không vào được vòng 6 m quanh đèn đã sáng.

## Headless (Test Contract v1.0)

`game.contract.json` ở gốc repo là **nguồn duy nhất** của `tuning`: sim và bản chơi đều đọc từ file này.

```bash
node apps/headless/dist/headless.js --seed 1 --night 1 \
  [--scenario f.json] [--inputs f.json] --ticks 600 --out out.jsonl [--snapshot-every 10]
```

- 60 tick/giây cố định, không cửa sổ/GPU, chạy nhanh nhất có thể (cả đêm 18000 tick ≈ 0,25 s).
- Mã thoát: `0` thành công · `2` inputs/scenario sai (lỗi ra stderr) · `1` lỗi dùng lệnh khác.
- Cùng seed + scenario + inputs cho output **giống hệt từng byte** (đã kiểm Windows/Node 24 và Linux/Node 22 trong Docker).
- Ngoài các snapshot theo `--snapshot-every`, luôn ghi thêm một snapshot ở tick cuối trước dòng `end`.

Docker (Linux, giống môi trường chấm):

```bash
docker build -t ddl-headless .
docker run --rm -v "$PWD:/w" ddl-headless --seed 1 --night 1 --ticks 600 --out /w/out.jsonl
```

### Khái niệm không có / diễn giải trong `tuning`

- `fall_enabled: false` — đảo tròn bán kính 40 m có rào vô hình; **không có rơi khỏi đảo** nên không bao giờ ghi sự kiện `player_hit` với `by: "fall"`.
- `safe_radius` chỉ áp dụng quanh đèn **đã thắp**.
- `hit_drop_ratio` = tỉ lệ số đom đóm đang mang bị rơi (làm tròn lên).
- `pulse_cost` trừ vào số đom đóm đang mang; không đủ thì không xung được.
- Trạng thái Bóng Mực: `chase`, `stunned`. Không có `dash`.

Toàn bộ giả định xem [docs/spec/phase-1.md](docs/spec/phase-1.md); bằng chứng ở [docs/evidence/phase-1/](docs/evidence/phase-1/); ghi chú AI và retro ở [docs/notes/phase-1.md](docs/notes/phase-1.md).

---

# Day 12 — AI SDLC: Đảo Đèn Lồng

> 👤 **Cá nhân** (1 người / 1 MSSV) · 🎯 Áp dụng SDLC cùng AI để xây một **game 3D** qua **4 phase**, từ yêu cầu ban đầu tới bản phát hành.
> 🏮 **Lab board + trợ giảng:** **[Đảo Đèn Lồng Lab](https://claude.ai/artifact/Q1RYyv1dxjUczzCbd2ZnoW)**

---

## Lab board

Yêu cầu dự án được phát hành tại **[Đảo Đèn Lồng Lab](https://claude.ai/artifact/Q1RYyv1dxjUczzCbd2ZnoW)**. Mỗi phase là một tab (tab chưa phát hành bị khóa), mỗi tab có trợ giảng AI riêng chỉ trả lời trong phạm vi phase đó. Trợ giảng cần đăng nhập claude.ai và dùng lượt Claude của bạn.

## Dự án

**Đảo Đèn Lồng**: game 3D góc nhìn thứ ba. Mây, người giữ đèn nhỏ tuổi, gom đom đóm để thắp lại các Đèn Lồng Lớn và né Bóng Mực trong sương đen.

- Không ràng buộc công nghệ; chạy được trên macOS hoặc Linux.
- Tuân theo **Test Contract** (chế độ headless) để được chấm tự động và so sánh với nhau.

| Phase | Bạn nhận | Nộp |
|---|---|---|
| 1 | **PRD-0** (mô tả tổng quát) + Test Contract | tag `phase-1` |
| 2 | **Ticket-02**, phát hành khi Phase 1 kết thúc | tag `phase-2` |
| 3 | **Ticket-03**, phát hành khi Phase 2 kết thúc | tag `phase-3` |
| 4 | **Ticket-04**, phát hành khi Phase 3 kết thúc | tag `phase-4` + Release `v1.0.0` |

Yêu cầu sẽ được bổ sung và có thể thay đổi giữa các phase, giống dự án thật.

---

## Gợi ý SDLC (cách làm là của bạn)

Mỗi phase là một vòng nhỏ. Công cụ, thứ tự, định dạng tài liệu đều tự do; đây chỉ là gợi ý:

1. **Requirements:** biến yêu cầu thành tiêu chí nghiệm thu kiểm chứng được. Chỗ mơ hồ thì tự giả định và ghi lại.
2. **Plan:** nghĩ cách kiểm chứng **trước** khi để agent viết code.
3. **Build:** để agent viết, bạn điều phối và review.
4. **Verify:** chạy thật, kiểm tra hành vi thật. *Không có bằng chứng thì chưa xong*: "agent bảo chạy rồi" không phải bằng chứng.
5. **Evaluate:** cái gì đạt, AI sai ở đâu, harness (AGENTS.md, skill, hook) cần chỉnh gì.
6. **Release:** gắn tag.

## Ba điều cần nhớ

- 🎯 **Game tốt là game đúng yêu cầu của khách hàng**, không phải game phức tạp hay đẹp nhất. Làm đúng và chứng minh được là đúng trước, trau chuốt sau.
- 🪙 **Cân nhắc kỹ quota token của bạn.** Đốt nhiều token không làm bài tốt hơn. Ngữ cảnh gọn, kế hoạch rõ, kiểm chứng sớm thường vừa rẻ vừa đúng hơn chạy agent liên tục.
- 🔬 **Kiểm chứng là phần quan trọng nhất.** Bằng chứng (test, output headless, ảnh, số đo) đáng giá hơn lời mô tả.

---

## Bàn giao cuối cùng

Một **repo GitHub cá nhân, public**, gồm:

1. **Toàn bộ mã nguồn** của game qua 4 phase, tag `phase-1` … `phase-4`, Release `v1.0.0`.
2. **Video demo `.mp4` dưới 5 phút** (đính kèm Release `v1.0.0` hoặc `docs/demo/demo.mp4`, link ở đầu README): chơi thử và cho thấy bằng chứng game chạy đúng.
3. **Bằng chứng kiểm chứng** của từng phase (định dạng tự chọn).
4. **Harness AI đã dùng** (AGENTS.md / CLAUDE.md, skills, hooks, plugins…), giữ nguyên trong repo và lịch sử git.
5. **Ghi chép ngắn:** spec/giả định mỗi phase, nhật ký dùng AI (gồm token/chi phí ước tính), retro.

Không commit API key, token hay `.env`. Gửi link repo theo hướng dẫn của Coach.

## Đánh giá (100 điểm)

| Hạng mục | Điểm |
|---|---|
| Test tự động ẩn (headless, gồm kiểm tra lại phase trước) | 30 |
| Kiểm chứng & bằng chứng của bạn | 20 |
| Quy trình SDLC & harness AI | 15 |
| Evaluation & retro (gồm cách bạn dùng token) | 10 |
| Hiệu năng & ổn định | 10 |
| Chất lượng sản phẩm (đúng yêu cầu, chơi được) | 10 |
| Video demo | 5 |

## Quy định

- Dùng AI thoải mái; không sao chép repo của người khác.
- Bằng chứng phải thật: test luôn đạt hay output sửa tay là vi phạm.
- Nhân vật, bối cảnh là bản gốc của lab; asset bên ngoài chỉ dùng loại CC0/CC-BY/MIT hoặc tự tạo, ghi nguồn trong `CREDITS.md`.
