# Đảo Đèn Lồng — 3 Đêm (Phase 2)

Game 3D góc nhìn thứ ba: **Mây** gom đom đóm, thắp các Đèn Lồng trên ba hòn đảo, né **Bóng Mực** và **Gió Lạc**, xua chúng bằng Tỏa Sáng, lướt qua nguy hiểm. Có bản chơi (Three.js) và chế độ **headless** theo Test Contract **v1.1**.

| Đêm | Đảo | Đèn | Thời gian | Điểm nhấn |
| :-: | :--- | :-: | :-: | :--- |
| 1 | Đảo Bến | 5 | 300 s | đảo tròn, Bóng Mực xuất hiện từ giây thứ 5 |
| 2 | Đảo Cau | 6 | 330 s | hai đảo nối bằng cầu tre không lan can, 2 bục nhảy, Bùa Gió, Gió Lạc |
| 3 | Đảo Chuông | 7 | 360 s | 3 tầng, 2 dốc, bục nhảy, tháp chuông, gió mạnh, Bóng Mực 4,5 m/s |

## Cài đặt và chạy (3 lệnh)

Cần Node.js ≥ 22 và pnpm.

```bash
pnpm install
pnpm build
pnpm dev        # mở http://localhost:5173
```

Kiểm thử: `pnpm test` (build headless + 98 test, gồm tất định và regression Phase 1 với số chuẩn).

## Điều khiển

| Phím | Việc |
| :--- | :--- |
| `W A S D` / mũi tên | Di chuyển (theo hướng camera) |
| `Space` | Nhảy (chỉ khi đang chạm đất) |
| `Shift` | **Lướt**: 14 m/s trong 0,2 s, hồi 1,5 s |
| `E` | Nạp đom đóm vào đèn gần nhất chưa sáng (trong 2 m) |
| `F` | **Tỏa Sáng**: tốn 3 đom đóm, choáng và đẩy lùi Bóng Mực trong 5 m, hồi 3 s |
| `Q` / `R` hoặc kéo chuột | Xoay camera |
| `H` | Bật/tắt nhãn tên cho mọi vật trên màn hình |
| `Esc` / `P` | Tạm dừng (Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu) |
| `Enter` | Bắt đầu đêm, sang đêm kế tiếp, chơi lại |

Luồng: **menu → giới thiệu đêm (lời Ông Đăng) → chơi → kết quả → đêm kế tiếp**; thắng Đêm 3 tới màn **Bình Minh** với tổng điểm; thua thì chơi lại đúng đêm đó. **Cài đặt** (âm lượng, độ nhạy chuột) được lưu giữa các lần mở. Mũi tên vàng chỉ tới đèn chưa sáng gần nhất khi nó ở ngoài màn hình.

## Số chuẩn (Ticket-02)

- Chạy 6 m/s; nhảy 7 m/s, trọng lực −20; Lướt 14 m/s × 0,2 s, hồi 1,5 s; Bùa Gió: chạy 7,2 m/s, lướt không hồi, 10 s, hồi lại sau 45 s.
- Mang tối đa **10** đom đóm; nhặt trong 1,0 m (XZ) và chênh cao ≤ 1,5 m. Mỗi đèn cần **10**; nạp trong 2,0 m, nhớ tiến độ. Vùng an toàn 6 m quanh đèn đã sáng.
- Bóng Mực 4,0 m/s (Đêm 3: 4,5), phát hiện 12 m / bỏ đuổi 18 m. Bị chạm: −1 Ngọn Lửa, rơi ⌊mang/2⌋ đom đóm, bất tử 90 tick. Rơi khỏi đảo (Y < −10): −1 Ngọn Lửa, mất hết đom đóm, hồi sinh sau 60 tick.
- Điểm: +10 mỗi đom đóm nạp, +100 mỗi đèn, +5 mỗi Bóng Mực trúng Tỏa Sáng; thắng: + ⌊giây còn lại⌋ × 2 + 50 × Ngọn Lửa còn lại. Tổng điểm game = tổng các đêm đã thắng.

## Headless (Test Contract v1.1)

`game.contract.json` ở gốc repo là **nguồn duy nhất** của `tuning`: sim, bản chơi và headless đều đọc từ file này.

```bash
node apps/headless/dist/headless.js --seed 1 --night 1|2|3 \
  [--scenario f.json] [--inputs f.json] --ticks 600 --out out.jsonl [--snapshot-every 10]
```

- 60 tick/giây cố định, không cửa sổ/GPU. Một Đêm đầy đủ 21.600 tick chạy dưới 1 giây (giới hạn là 30 giây).
- Mã thoát: `0` thành công · `2` inputs/scenario sai (lỗi ra stderr) · `1` lỗi dùng lệnh khác (kể cả `--night` ngoài 1–3).
- Cùng seed + scenario + inputs cho output **giống hệt từng byte** (đã kiểm Windows/Node 24 và Linux/Node 22 trong Docker, cả 3 Đêm).
- Input thêm `dash` và `pause` (kích hoạt khi `false → true`). Scenario thêm `player.{invuln_ticks,dash_cd_ticks,pulse_cd_ticks,charm_ticks}`, `shades[].{state,state_ticks_left}`, `drifters`, `charms`, `random_drifters`, `wind_enabled`.
- Ngoài các snapshot theo `--snapshot-every`, luôn ghi thêm một snapshot ở tick cuối. Sự kiện `night_start` ghi ngay sau snapshot tick 0 (với `tick: 0`).

Docker (Linux, giống môi trường chấm):

```bash
docker build -t ddl-headless .
docker run --rm -v "$PWD:/w" ddl-headless --seed 1 --night 2 --ticks 600 --out /w/out.jsonl
```

Toàn bộ giả định xem [docs/spec/phase-2.md](docs/spec/phase-2.md) (và [docs/spec/phase-1.md](docs/spec/phase-1.md)); bằng chứng ở [docs/evidence/phase-2/](docs/evidence/phase-2/); ghi chú AI và retro ở [docs/notes/phase-2.md](docs/notes/phase-2.md).

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
