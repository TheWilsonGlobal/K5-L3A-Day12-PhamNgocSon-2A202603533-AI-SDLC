# Spec Phase 3 — TICKET-03 "Đèn cạn dầu" (Contract v1.2)

Nguồn: Ticket-03 (Change Request, bản lưu `Lab/Day12-AI-SDLC/phase-03/brief-lantern-island-p3.html` trong repo VIN-AIA-Docs). Quyết định thiết kế: [ADR-001](../adr/ADR-001-lantern-state-and-win-rule.md). Ticket **thay thế** một số luật Phase 2 ([docs/spec/phase-2.md](phase-2.md) S6, S7, S13: đèn sáng không nhận thêm đom đóm, Bóng Mực không vào vùng an toàn, thắng khi sáng hết đèn, điểm cũ). Những gì ticket không thay giữ nguyên, kể cả đầu ra headless. Mỗi tiêu chí kiểm bằng một scenario headless (`--scenario`, đọc snapshot/sự kiện) hoặc một kiểm tra trên trình duyệt.

## Ánh xạ số chuẩn → `tuning` (game.contract.json)

| Ticket                         | `tuning`                       | Giá trị               |
| :----------------------------- | :----------------------------- | :-------------------- |
| Nhiên liệu tối đa              | `fuel_max`                     | 100                   |
| Hao hụt                        | `fuel_decay_per_s`             | 1.0                   |
| Mỗi đom đóm châm                | `fuel_per_mote`                | 10                    |
| Giá thắp lại                   | `relight_cost`                 | 5                     |
| Tỉ lệ thắng                    | `win_ratio`                    | 0.6                   |
| Tốc độ hút                     | `drain_per_s`                  | 5                     |
| Ngưỡng dầu yếu                 | `low_fuel_threshold`           | 30                    |
| Sức chứa tối đa                | `capacity_max`                 | 20                    |
| Thời gian đêm                  | `night1/2/3_duration_s`        | 240 / 270 / 300       |
| Sức chứa gốc / giá thắp đầu    | `carry_capacity` / `lantern_cost` | 10 / 10 (giữ nguyên) |
| Điểm (5 khóa cũ, giá trị mới)  | `score.per_mote` / `per_lantern` / `per_stun` / `per_second_left` / `per_flame_left` | 5 / 100 / 5 / 0 / 50 |
| Điểm (3 khóa mới, xem G4)      | `score.per_relight` / `per_stun_drain` / `per_lit_lantern_dawn` | 40 / 15 / 50 |

Hằng nằm ngoài contract (đầu `packages/sim/src/sim.ts`, G15): sức chứa gốc `10` và bước `+2` mỗi lần thắp thành công. Dầu lưu bằng số nguyên đơn vị 1/60 (100 dầu = 6000 đơn vị): hao 1 đơn vị mỗi tick, mỗi Bóng Mực `drain` hút 5 đơn vị mỗi tick; ngưỡng 30 = 1800 đơn vị.

## Tiêu chí nghiệm thu, theo từng mục của ticket

### Mục 1 — Nhiên liệu đèn

| #   | Tiêu chí                                                                                                                                                              | Kiểm chứng                                                                                          |
| :-- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------- |
| P1  | Thắp lần đầu (đủ 10) hoặc thắp lại (đủ 5): `fuel = 100`, `lit = true`, `ever_lit = true`; sự kiện `lantern_lit` có `relight: false` / `true`                          | Scenario: mang 10 đứng cạnh đèn tắt, chưa từng sáng; rồi đèn `ever_lit: true` tắt, mang 5           |
| P2  | Đèn sáng hao đúng 1 dầu/s: sau 60 tick từ `fuel = 100` thì `fuel = 99.0`; sau 6000 tick (đèn không bị hút) thì đèn tắt                                                | Scenario: 1 đèn `lit: true`, không Bóng Mực; chạy 60 và 6000 tick                                   |
| P3  | Châm dầu (`fuel` tính sau hao bước 2, G19): `used = min(mang, ceil((100 − fuel)/10))`, `fuel = min(100, fuel + 10·used)`, trừ `used` đom đóm, phát `refuel {lantern_id, amount, fuel}`                    | Scenario: `fuel 42`, mang 3 ⇒ `used 3`, `fuel 72`; `fuel 95`, mang 8 ⇒ `used 1`, `fuel 100`         |
| P4  | Theo G19 (bước 2 hao dầu trước bước 5 tương tác): đèn đặt `fuel 100` đã hao còn 5999 đơn vị khi tới bước 5, nên **vẫn là ứng viên**: nạp `used = 1`, `fuel` về 100, trừ 1 đom đóm; `fuel 90` cần 2 đom đóm. "Đèn đầy không được chọn" chỉ áp dụng khi đúng 6000 đơn vị, không đạt được ở bước 5 giữa Đêm. Hòa khoảng cách thì `id` nhỏ hơn | Scenario: đèn gần `fuel 100` + đèn xa `fuel 40` ⇒ chọn đèn gần, `used 1`; `fuel 90`, mang 5 ⇒ `used 2`; 2 đèn cách đều ⇒ `id` nhỏ |
| P5  | Chọn đèn trong đèn nhận được (chưa sáng, hoặc sáng mà chưa đạt đúng 6000 đơn vị, xem P4/G19); bán kính 2,0 m (XZ) như Phase 2                                                                 | Scenario nhiều đèn ở các khoảng cách khác nhau                                                      |
| P6  | Dầu là số nguyên 1/60; chỉ làm tròn khi xuất: snapshot `fuel` 1 chữ số thập phân, đèn tắt `fuel: 0`; không sai số tích lũy (sau 3600 tick `fuel` = 40.0 đúng)         | Scenario: `fuel 100`, 3600 tick, so snapshot                                                        |
| P7  | `fuel ≤ 0`: đèn tắt ở bước 2b, `deposited = 0`, `ever_lit = true`, sự kiện `lantern_out {lantern_id}`; ánh sáng môi trường giảm theo (`đèn sáng/tổng`)                | Scenario: `fuel 1.0` (60 đơn vị) ⇒ tắt đúng sau 60 tick; kiểm `ambient`/`deposited`/`ever_lit`      |
| P8  | Thắp lại chỉ cần 5 khi `ever_lit`; đèn chưa từng sáng vẫn cần 10; `relit_count` +1 mỗi lần thắp lại; nạp dở dang vẫn tích lũy (G7)                                    | Scenario: đèn `ever_lit: true, lit: false`, mang 5 ⇒ sáng; mang 4 ⇒ `deposited 4`, chưa sáng         |
| P9  | Web: thanh dầu trên đèn đang sáng; khi `fuel < 30` đèn và thanh dầu nhấp nháy chậm 1 Hz                                                                               | Trình duyệt: ảnh chụp `fuel 80` và `fuel 25` (qua `__ddl`), đếm chu kỳ nhấp nháy ≈ 1 s              |

### Mục 2 — Bóng Mực hút dầu

| #   | Tiêu chí                                                                                                                                                                                       | Kiểm chứng                                                                                   |
| :-- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------- |
| D1  | Đèn `fuel < 30` mất vùng an toàn; đúng `30` vẫn còn (Bóng Mực bị chặn như Phase 2)                                                                                                             | Scenario: Bóng Mực áp sát đèn `fuel 30.0` (bị chặn) và `fuel 29.9` (vào được)                |
| D2  | Chỉ Bóng Mực `wander` chọn đèn yếu: đèn sáng `fuel < 30` gần nhất, hòa thì `id` nhỏ hơn; con `chase` không đổi mục tiêu (**G1: chưa xác nhận**; `wander` ngẫu nhiên của Phase 2 giữ nguyên) | Scenario: 2 đèn yếu cách đều; 1 con `wander`, 1 con `chase`; đo hướng đi                     |
| D3  | Cách đèn ≤ 2 m (XZ) thì vào `drain`, đứng yên, hút 5 dầu/s (5 đơn vị mỗi tick); đèn vẫn hao 1/s; nhiều con cộng dồn (2 con: −11/s)                                                              | Scenario: 1 và 2 con `drain` tại đèn `fuel 29`; chạy 60 tick, so `fuel`                      |
| D4  | Thoát `drain`: `chase` khi Mây ≤ 6 m; `stunned` khi trúng Tỏa Sáng; `wander` khi đèn tắt, khi `fuel ≥ 30` do châm, hoặc khi cách đèn > 2 m                                                      | Scenario riêng cho từng nhánh chuyển trạng thái                                              |
| D5  | Hết choáng thì về `wander`                                                                                                                                                                      | Scenario: con `drain` bị Tỏa Sáng, sau 120 tick kiểm `state`                                 |
| D6  | Châm đèn lên `fuel ≥ 30` khi có Bóng Mực trong vùng 6 m: các con đó (mọi trạng thái, G11) bị đẩy ra mép trong ≤ 30 tick và không gây sát thương trong lúc đó (dùng lại `eject`)      | Scenario: 1 con `drain` + 1 con `wander` trong 6 m, châm lên 40; kiểm vị trí và không mất lửa |
| D7  | Sự kiện `fuel_drain {lantern_id, shade_id, fuel}` ghi mỗi 60 tick kể từ lúc con đó vào `drain`; `fuel` là giá trị sau khi trừ (G5); thứ tự phát theo `id` tăng dần (G13)                         | Scenario: 2 con hút cùng đèn, 130 tick ⇒ 2 sự kiện mỗi con                                  |
| D8  | Web: Bóng Mực `drain` nhìn thấy được và đèn bị hút có thể nhận ra                                                                                                                              | Trình duyệt: ảnh chụp `drain` (qua `__ddl`)                                                  |

### Mục 3 — Luật thắng mới

| #   | Tiêu chí                                                                                                                                                  | Kiểm chứng                                                                              |
| :-- | :-------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| W1  | Thời gian Đêm 1/2/3 = 240/270/300 s (14.400 / 16.200 / 18.000 tick)                                                                                      | `--night N --ticks` tới `game_over`; kiểm `tick` của `game_over`                        |
| W2  | Thắng chỉ ở tick bình minh: Mây còn sống và số đèn sáng ≥ `ceil(0.6 × tổng)` (Đêm 1: 3/5, Đêm 2: 4/6, Đêm 3: 5/7) ⇒ `won`, `reason: dawn_survived`        | Scenario mỗi Đêm: đúng ngưỡng (thắng) và thiếu 1 đèn (thua `dawn`)                     |
| W3  | Không thắng sớm: thắp đủ đèn không kết thúc Đêm; `all_lit` không còn xuất hiện ở bất kỳ `game_over.reason`                                                | Scenario: sáng hết đèn với `time_left_s` lớn ⇒ không có `game_over` trước bình minh     |
| W4  | Thua `dawn` khi hết giờ mà số đèn sáng dưới ngưỡng; thua `no_flames` khi hết Ngọn Lửa, ngay lập tức, kể cả ở tick cuối                                   | Scenario: `flames 1` bị đánh ở tick cuối                                                |
| W5  | Hết Ngọn Lửa luôn xét trước, kể cả tick bình minh: ở tick bình minh vừa đủ đèn nhưng hết lửa ⇒ `lost/no_flames`                                           | Scenario: tick bình minh, đủ đèn, `flames 1`, Bóng Mực chạm đúng tick đó                |
| W6  | Đèn hết dầu đúng tick bình minh tắt ở bước 2b trước bước 11, không được tính là sáng (G8)                                                                 | Scenario: đèn `fuel 1/60` ở tick cuối, số đèn sáng đúng ngưỡng nếu tính nó              |
| W7  | Thứ tự trong tick: bước 2 (dầu) → 2b (`lantern_out`) → … → 11; xem mục "Thứ tự tick" bên dưới                                                              | Scenario W5, W6, P7                                                                     |
| W8  | Web: màn kết quả hiển thị lý do mới (`dawn_survived`, `dawn`, `no_flames`) và điểm bình minh                                                              | Trình duyệt: ảnh chụp màn kết quả `dawn_survived`                                       |

### Mục 4 — Sức chứa tăng dần

| #   | Tiêu chí                                                                                                                                   | Kiểm chứng                                                                      |
| :-- | :----------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------ |
| C1  | `capacity = min(20, 10 + 2 × successful_lights)`; snapshot `player.capacity`; nhặt đom đóm bị chặn ở `capacity` (trước đây `carry_capacity`)  | Scenario: `successful_lights` 0, 3, 5, 9 ⇒ `capacity` 10, 16, 20, 20; nhặt vượt trần |
| C2  | Thắp mới và thắp lại đều cộng 1; châm dầu không cộng; đèn đặt sẵn bằng scenario không cộng (G12)                                            | Scenario: thắp mới, thắp lại, châm; đèn `lit: true` đặt sẵn                      |
| C3  | `successful_lights` đặt về 0 ở đầu mỗi Đêm (Đêm mới không kế thừa)                                                                          | Chạy Đêm 1 rồi Đêm 2 từ scenario có `successful_lights`; kiểm `capacity` tick 0 của Đêm 2 |
| C4  | Web: HUD hiển thị `đang mang / sức chứa`; lời nhắc theo ngữ cảnh: thắp mới `(x/10)`, thắp lại `(x/5)`, châm dầu "E — Châm dầu" (G14)         | Trình duyệt: ảnh chụp HUD sau 3 lần thắp (`capacity 16`)                         |

### Mục 5 — Điểm mới

| #   | Tiêu chí                                                                                                                         | Kiểm chứng                                                                       |
| :-- | :------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------- |
| S1  | +5 mỗi đom đóm nạp vào đèn (thắp mới, thắp lại, châm dầu); nhặt không cộng điểm                                                  | Scenario: nạp 10, nạp 5, châm 3 ⇒ +50, +25, +15 (chưa tính thưởng thắp)          |
| S2  | Thắp lần đầu +100; thắp lại +40; đèn đặt sẵn bằng scenario không cộng                                                            | Scenario: thắp mới (+50+100), thắp lại (+25+40)                                  |
| S3  | Bóng Mực trúng Tỏa Sáng: tổng +5 mỗi con; tổng +15 nếu ngay trước đó con đó `drain` (+15 **thay** +5, G16); chỉ tính Bóng Mực    | Scenario: Tỏa Sáng với 1 con `wander` và 1 con `drain`                           |
| S4  | Bình minh, chỉ khi thắng: mỗi đèn sáng `+50 + floor(fuel)`, mỗi Ngọn Lửa còn lại +50; thua thì không cộng                         | Scenario thắng (đèn `fuel 77.9`, 2 lửa ⇒ +127 và +100) và thua                   |
| S5  | Không còn thưởng thời gian (`per_second_left 0`)                                                                                 | Scenario: cùng kết quả thắng với `time_left_s` khác nhau chỉ lệch ở dầu          |
| S6  | Tổng điểm game, chơi lại: không đổi so với Ticket-02 (tổng điểm các Đêm đã thắng; thua thì chơi lại đêm đó)                       | Trình duyệt: chuỗi 3 Đêm; kiểm tổng điểm trên màn Bình Minh                      |

### Mục 6 — Chế độ mù màu

| #   | Tiêu chí                                                                                                                                                    | Kiểm chứng                                                                                         |
| :-- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------- |
| B1  | Cài đặt "Bảng màu dễ phân biệt" (`colorBlind` trong `settings.ts`), được lưu `localStorage`, còn sau khi tải lại trang                                       | Trình duyệt: bật, tải lại, kiểm công tắc và `localStorage`                                         |
| B2  | Bật: viền và mắt Bóng Mực `#7A3CFF` → `#00B3FF`; cả minimap đổi theo (G17)                                                                                   | Trình duyệt: đo màu pixel Bóng Mực và chấm minimap bật/tắt                                         |
| B3  | Bật: màu cảnh báo UI `#FF5A5F` → `#FFFFFF`, kèm biểu tượng ⚠                                                                                                | Trình duyệt: ảnh chụp cảnh báo (≤ 30 s, dầu yếu)                                                    |
| B4  | Đèn tắt và đèn sáng phân biệt được không cần màu: đèn tắt xẹp 20% và giấy có vết rách; đèn sắp hết dầu nhấp nháy (cả khi chế độ tắt)                          | Trình duyệt: ảnh chụp cạnh nhau, đèn tắt thấp hơn 20% so với đèn sáng                              |
| B5  | Màu đi qua token trong `palette.ts` (`shadeRim`, `danger`); không còn màu hardcode ở `overlay.ts` minimap                                                     | `pnpm lint`; `Grep` `#7a3cff` ngoài `palette.ts` không có kết quả                                  |

### Mục 7 — Test Contract v1.2

| #   | Tiêu chí                                                                                                                                                                                                     | Kiểm chứng                                                                          |
| :-- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------- |
| V1  | `contract_version: "1.2"`; đủ 8 khóa tuning mới và 3 khóa `score` mới; thời lượng 240/270/300; 5 khóa `score` cũ còn nguyên tên                                                                              | Test đọc `game.contract.json`; `tests/cli.test.ts`                                   |
| V2  | Snapshot: mỗi đèn thêm `fuel` (1 chữ số thập phân; tắt `0`), `ever_lit`, `relit_count`; `player.capacity`; trạng thái Bóng Mực `drain`                                                                       | Scenario đọc snapshot; kiểm kiểu và làm tròn                                         |
| V3  | Scenario: đèn nhận `lit`, `fuel`, `ever_lit` (`lit: true` thiếu `fuel` ⇒ `fuel = 100`); `player.successful_lights`; `shades[].target_lantern_id`; dựng scenario không phát sự kiện, không cộng điểm          | Scenario từng trường; scenario sai kiểu ⇒ mã thoát 2                                  |
| V4  | Sự kiện: `refuel`, `lantern_out`, `fuel_drain` đúng trường; `lantern_lit.relight`; `game_over.reason` ∈ `dawn_survived \| dawn \| no_flames`                                                                  | Scenario từng sự kiện; kiểm không còn `all_lit`                                      |
| V5  | Tất định cả 3 Đêm: cùng seed/scenario/input ⇒ giống hệt từng byte; native và Docker trùng hash                                                                                                              | Chạy 2 lần và so SHA-256; Docker (`docker create` + `cp` + `start -a`)               |
| V6  | Phần không thay giữ nguyên: scenario không đèn sáng, có `time_left_s` tường minh và không chạm luật thắng cho các trường Phase 2 giống Phase 2 (di chuyển, nhặt, Lướt, Gió Lạc, Bùa Gió, gió, tạm dừng)       | So các trường cũ của snapshot/sự kiện với đầu ra tag `phase-2`                       |
| V7  | Một Đêm đầy đủ (≤ 18.000 tick) chạy ≤ 30 s; bản web ≥ 30 FPS ở 1280×720                                                                                                                                     | `headless performance`; Chrome GPU (`--use-angle=d3d11`) đo FPS                      |

## Thứ tự tick (12 bước giữ nguyên, thêm bước 2b)

| Bước   | Nội dung Phase 3                                                                                                                                                                  |
| :----- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | Input / tạm dừng (không đổi)                                                                                                                                                      |
| 2      | Giảm bộ đếm; **trừ dầu**: mỗi đèn sáng −1 đơn vị (hao) và +5 đơn vị bị hút cho mỗi Bóng Mực đang `drain` (theo trạng thái sau bước 8 của tick trước, G10); đếm 60 tick của `fuel_drain` |
| **2b** | **Đèn có `fuel ≤ 0` (xét `id` tăng dần) tắt: `lit = false`, `deposited = 0`, `ever_lit = true`; phát `lantern_out`**                                                                |
| 3–4    | Di chuyển Mây, rơi khỏi đảo; nhặt đom đóm, bùa (trần là `capacity`)                                                                                                               |
| 5      | Thắp, thắp lại, châm dầu (chọn đèn nhận được gần nhất); phát `lantern_lit` / `refuel`; châm lên ≥ 30 thì kích `eject`                                                              |
| 6      | Vùng an toàn: đèn `fuel < 30` không còn vùng (đúng 30 vẫn còn)                                                                                                                    |
| 7      | Tỏa Sáng (+5 / +15 nếu con đó đang `drain`)                                                                                                                                       |
| 8      | Di chuyển Bóng Mực, Gió Lạc; AI Bóng Mực gồm `wander → drain` và các nhánh thoát `drain`                                                                                          |
| 9–10   | Chạm; sinh theo lịch                                                                                                                                                              |
| 11     | Thắng/thua: hết Ngọn Lửa (`lost/no_flames`) luôn xét trước, kể cả tick bình minh; chỉ ở tick bình minh: đủ đèn ⇒ `won/dawn_survived`, thiếu ⇒ `lost/dawn`; cộng điểm bình minh       |
| 12     | Snapshot (do `runHeadless`)                                                                                                                                                       |

## Giả định (chỗ ticket để mở)

Tất cả giá trị dưới đây là **tạm, chưa xác nhận** với giảng viên. Cột cuối là node/tiêu chí kiểm.

| #   | Chỗ mơ hồ                                                                                                                                                                       | Giả định tạm (chưa xác nhận)                                                                                                                                       | Kiểm ở      |
| :-- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| G1  | Ticket: Bóng Mực không có đèn yếu thì "đi về đèn tắt gần nhất như trước". Phase 2 cài `wander` đi ngẫu nhiên 2 m/s, đổi hướng mỗi 120 tick (`phase-2.md` §Giả định; `sim.ts:782–788`) | **UNCONFIRMED, giảng viên cần xác nhận.** Giữ `wander` ngẫu nhiên của Phase 2; chỉ thêm việc đi tới đèn sáng `fuel < 30` gần nhất (hòa thì `id` nhỏ hơn). Không thêm hành vi đi về đèn tắt | D2          |
| G2  | Tốc độ Bóng Mực `wander` khi đi tới đèn yếu                                                                                                                                     | Dùng tốc độ `wander` hiện có (2 m/s), không dùng `shade_speed`                                                                                                     | D2          |
| G3  | Con `wander` đang đi tới đèn yếu có chuyển `chase` khi Mây ≤ 12 m không                                                                                                          | Có; luật phát hiện 12 m giữ nguyên. Ngưỡng 6 m chỉ áp dụng khi đang `drain`                                                                                          | D2, D4      |
| G4  | Ticket chỉ liệt kê 8 khóa tuning mới; số phận khóa `score.*` cũ                                                                                                                 | Giữ 5 khóa cũ với giá trị mới; thêm `per_relight 40`, `per_stun_drain 15`, `per_lit_lantern_dawn 50`                                                                 | V1          |
| G5  | `fuel_drain` mỗi 60 tick: đếm từ đâu; `fuel` trước hay sau khi trừ                                                                                                              | Đếm riêng từng con từ lúc vào `drain` (sự kiện đầu ở tick hút thứ 60); `fuel` là giá trị sau khi trừ ở tick đó                                                       | D7          |
| G6  | Làm tròn `fuel` ra 1 chữ số thập phân                                                                                                                                           | Làm tròn gần nhất từ đơn vị 1/60; điểm bình minh dùng `floor` của giá trị thực                                                                                       | P6, S4      |
| G7  | Thắp lại khi mang không đủ 5                                                                                                                                                    | Vẫn nạp dở dang: `deposited` tích lũy tới 5 (đã từng sáng) hoặc 10 (chưa từng sáng); `lantern_out` đặt `deposited = 0`                                               | P8          |
| G8  | Đèn hết dầu đúng tick bình minh                                                                                                                                                 | Tắt ở bước 2b trước bước xét thắng, không được tính là sáng                                                                                                         | W6          |
| G9  | Đang tạm dừng thì dầu có hao không                                                                                                                                              | Không: dầu đứng yên như mọi bộ đếm ở bước 2. Ở bản web, Pause chỉ ngừng gọi `step` (giới hạn Phase 2), nên dầu cũng đứng yên; đường `pause` của sim kiểm ở headless  | P2 (có `pause`) |
| G10 | Bước 2 tính lượng hút theo trạng thái nào                                                                                                                                       | Theo các con đang `drain` sau bước 8 của tick trước                                                                                                                 | D3          |
| G11 | Bóng Mực trong vùng 6 m bị đẩy khi châm lên ≥ 30: chỉ `drain` hay mọi trạng thái                                                                                                 | **Sửa lại (PM, sau review R2 tái hiện Phase 2 trên bản phase-2):** đẩy **mọi trạng thái**, đúng như việc thắp đèn của Phase 2 (kể cả `stunned`, `spawning`); áp dụng cho thắp, thắp lại và châm lên ≥ 30. Bản ghi trước ("trừ `stunned`/`spawning`") dựa trên tiền đề sai về Phase 2 | D6          |
| G12 | `player.successful_lights` trong scenario                                                                                                                                       | Đặt thẳng bộ đếm; đèn đặt sẵn `lit: true` không cộng                                                                                                                | C2          |
| G13 | Nhiều đèn tắt hoặc nhiều con hút cùng một tick                                                                                                                                  | Phát sự kiện theo `id` tăng dần (đèn, rồi Bóng Mực)                                                                                                                 | D7          |
| G14 | Lời nhắc HUD "E — Nạp ánh sáng (x/10)"                                                                                                                                          | Đổi theo ngữ cảnh: thắp lại `(x/5)`, châm dầu "E — Châm dầu"                                                                                                        | C4          |
| G15 | Hằng sức chứa `10 + 2 × successful_lights` không nằm trong tuning v1.2                                                                                                          | Giữ `10` và `+2` trong `sim.ts`, không thêm khóa contract ngoài v1.2; ghi trong ADR-001 và changelog                                                                 | C1          |
| G16 | "Tổng +15 nếu đang drain": thay hay cộng thêm                                                                                                                                   | +15 thay +5 (tổng 15 mỗi con)                                                                                                                                       | S3          |
| G17 | Phạm vi đổi màu chế độ mù màu                                                                                                                                                   | Cả minimap và HUD đi qua token; đèn tắt xẹp 20% và vết rách do bản web làm                                                                                           | B2, B4      |
| G18 | Bot kiểm tra thắng Đêm 2 và 3 (Phase 2 chưa có)                                                                                                                                 | Bot viết lại (chiến lược tích trữ/chạy nước rút) cho cả 3 Đêm. Seed 1–20: Đêm 1 thắng 19/20, Đêm 2 12/20, Đêm 3 4/20. Hằng số bot chỉnh khi nhìn chính seed 1–20 nên là số đo trên tập đã dùng để chỉnh, không phải ước lượng độc lập; `win_ratio` giữ 0,6 | W2          |
| G19 | Thứ tự tick của ticket (bước 2 hao dầu trước bước 5 tương tác) so với "đèn đầy không được chọn"                                                                                 | **UNCONFIRMED.** Áp dụng thứ tự tick nguyên văn: đèn `fuel 100` đã hao còn 5999 đơn vị ở bước 5 nên vẫn là ứng viên (`used 1`), `fuel 90` cần 2 đom đóm. "Đèn đầy" chỉ đúng ở 6000 đơn vị, không đạt được ở bước 5 giữa Đêm. Sửa tiêu chí P4 theo, không sửa sim | P3, P4, P5  |
| G20 | Scenario sai logic: `shades[].target_lantern_id` không khớp đèn nào; đèn `lit: false` tường minh mà `deposited` ≥ giá thắp (không bao giờ thắp được) | Thoát mã 2 (`InputError`). `lanterns[].id` không tồn tại vẫn bị bỏ qua im lặng như Phase 2: **hạn chế đã biết**, không đổi để giữ đầu ra Phase 2 | V3          |

**Kế thừa từ Phase 2** (giữ nguyên trừ khi ticket nói khác; xem [phase-2.md](phase-2.md) §Giả định): điểm xuất phát Đêm 3 `(0, 0, −20)`; `spawning` 60 tick; `wander` 2 m/s đổi hướng mỗi 120 tick; Gió Lạc chỉ cướp khi `chase`; điểm sinh Gió Lạc = điểm sinh Bóng Mực; gió theo `seed`, cơn thứ k ở tick 1800·k; khoảng cách nạp đèn đo XZ; tạm dừng đổi trạng thái theo cạnh `pause`; `night_start` ngay sau snapshot tick 0; `random_motes:false`/`random_shades:false` như cũ; `team` chưa đối chiếu Coach.

**Hạn chế đã biết:** chưa chơi thử bằng tay, chưa nghe âm thanh. Bot (G18) thắng 19/20, 12/20, 4/20 ở Đêm 1/2/3 trên seed 1–20 là tập dùng để chỉnh bot. Scenario có `lanterns[].id` không tồn tại vẫn bị bỏ qua im lặng (G20). G1 và G19 chưa được giảng viên xác nhận.

## Thay đổi test

Mỗi test Phase 1–2 bị luật mới làm sai đều được sửa hoặc thay thế kèm lý do; không `skip`, không xóa test nào mà không có test thay. Test mới nằm ở `tests/phase3.test.ts` (77 test).

| Tệp | Test | Thay đổi | Lý do |
| :-- | :--- | :------- | :---- |
| `regression.test.ts` | "contract v1.1" | Thành v1.2, tính lại: thời lượng 300/330/360 → 240/270/300, thêm 8 khóa tuning mới, `per_mote` 10 → 5, `per_second_left` 2 → 0 | Test Contract v1.2 (V1) |
| `regression.test.ts` | "deposits min(carried, missing)…" | Tính lại điểm theo `per_mote 5` | Điểm mới (S1) |
| `regression.test.ts` | "picks the nearest unlit lantern … skips lit ones" | Đổi thành "nearest receptive lantern": đèn sáng nay nhận đom đóm (châm dầu) | Ticket mục 1 [THAY THẾ], G19 |
| `regression.test.ts` | "win adds floor(seconds left)*2 + 50 per flame" | Thay bằng "lighting the last lantern no longer ends the night" | Bỏ thắng sớm (mục 3), bỏ thưởng thời gian (mục 5) |
| `regression.test.ts` | (mới) "dawn win scores 50 + floor(fuel) per lit lantern and 50 per flame" | Thêm | Điểm bình minh (S4) |
| `regression.test.ts` | "lighting the last lantern on the very last tick is a win" | Đổi thành "still counts at dawn", tính lại điểm | Thắng chỉ ở bình minh (W2) |
| `regression.test.ts` | snapshot tick-model | `time_left_s` 298.5 → 238.5, thêm khóa `capacity` | Thời lượng 240 s, V2 |
| `features.test.ts` | Đêm 2, Đêm 3 | Đồng hồ 330 → 270, 360 → 300 | Thời lượng mới (W1) |
| `bot.test.ts` | bot | Viết lại cho 3 Đêm | G18; bot Phase 2 thắng bằng thắp hết đèn nên không còn đủ |
| `cli.test.ts` | — | Không đổi | — |
| `phase3.test.ts` | Tiêu chí mục 1–5 và 7; P4 viết theo G19 | Tệp mới | Nghiệm thu Phase 3 |

Ngoài bộ test thiết kế: `tests/zz_qa_trace.test.ts` là vết gỡ lỗi chưa theo dõi (untracked), giữ lại theo chỉ thị của điều phối viên chờ người dùng quyết định; **không** thuộc bộ test.
