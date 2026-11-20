# ADR-001: Mô hình trạng thái đèn và luật thắng (Phase 3, Contract v1.2)

- **Status:** Accepted cho Phase 3, trừ G1 (hành vi `wander`) và G19 (thứ tự hao dầu/tương tác) còn **chưa xác nhận**, chờ giảng viên.
- **Date:** 2026-11-20
- **Liên quan:** TICKET-03 "Đèn cạn dầu"; [docs/spec/phase-3.md](../spec/phase-3.md); thay thế các luật Phase 2 trong [docs/spec/phase-2.md](../spec/phase-2.md) (S6, S7, S13).

## Context

Phase 2: đèn có hai trạng thái (tắt, sáng), sáng rồi thì vĩnh viễn; thắng ngay khi sáng hết đèn (`all_lit`); Bóng Mực không bao giờ vào vùng an toàn 6 m. Playtest cho thấy người giỏi thắp hết đèn trong 2 phút rồi Đêm kết thúc. Ticket-03 đổi mục tiêu thành "giữ đảo sáng tới bình minh", nên đèn phải có thể tắt và Bóng Mực phải có cách làm đèn tắt.

Ràng buộc của repo (`AGENTS.md`): sim tất định (không `Math.random`/`Date.now`), thứ tự 12 bước mỗi tick không đổi, `game.contract.json` là nguồn số duy nhất, đầu ra headless của phần ticket không thay phải giữ nguyên, test ẩn Phase 1–2 không bị thay thế vẫn phải đạt.

## Decision

1. **Mỗi đèn lưu `lit`, `fuel`, `ever_lit`, `relit_count`, `deposited`.** Chỉ có hai trạng thái rời rạc: tắt (`lit = false`, `fuel = 0`) và sáng (`lit = true`, `fuel` trong `(0, 100]`). Không có trạng thái thứ ba cho đèn yếu; "yếu" chỉ là điều kiện `fuel < low_fuel_threshold (30)`, tính từ `fuel` khi cần.
2. **Dầu là số nguyên đơn vị 1/60** (`fuel_max 100` = 6000 đơn vị). Hao 1 dầu/s = 1 đơn vị mỗi tick; mỗi Bóng Mực `drain` hút 5 đơn vị mỗi tick (5 dầu/s). Chỉ làm tròn (1 chữ số thập phân) khi xuất snapshot/sự kiện; điểm bình minh dùng `floor` của giá trị thực.
3. **Tick order:** giữ nguyên 12 bước. Bước 2 trừ dầu (hao + bị hút theo các con đang `drain` sau bước 8 của tick trước). **Bước 2b** ngay sau bước 2: đèn có `fuel ≤ 0`, xét `id` tăng dần, chuyển sang tắt, đặt `deposited = 0`, `ever_lit = true`, phát `lantern_out`. Bước 5 xử lý thắp, thắp lại, châm dầu. Bước 6: đèn có `fuel < 30` mất vùng an toàn (đúng 30 còn). Bước 8: thêm trạng thái `drain` cho Bóng Mực. Bước 11: hết Ngọn Lửa luôn xét trước (`lost/no_flames`, kể cả tick bình minh).
4. **Luật thắng chỉ xét ở tick bình minh:** số đèn sáng `≥ ceil(win_ratio × tổng đèn)` ⇒ `won/dawn_survived`; ít hơn ⇒ `lost/dawn`. Bỏ thắng sớm và lý do `all_lit`. Đèn hết dầu đúng tick bình minh đã tắt ở bước 2b nên không được tính (G8).
5. **Thắp, thắp lại, châm dầu dùng chung một lần tương tác ở bước 5.** Chọn đèn chỉ trong các đèn nhận được (chưa sáng, hoặc sáng mà chưa đúng 6000 đơn vị; xem G19 ở Consequences), gần nhất, hòa thì `id` nhỏ hơn. Giá thắp: chưa từng sáng 10, đã từng sáng 5 (`relight_cost`); thắp xong `fuel = 100`. Châm dầu: `used = min(carried, ceil((100 − fuel)/10))`, `fuel = min(100, fuel + 10·used)`.
6. **Châm dầu lên ≥ 30** đẩy Bóng Mực trong vùng 6 m ra mép trong ≤ 30 tick, không gây sát thương, **mọi trạng thái** (G11, sửa lại: đúng như việc thắp đèn của Phase 2, không trừ `stunned`/`spawning`; tiền đề "trừ" trước đó là sai, R2 đã tái hiện Phase 2), bằng cách **dùng lại cơ chế `eject`** (`EJECT_TICKS = 30`, logic đẩy ở `packages/sim/src/sim.ts:520–532`; dòng 765 chỉ là dòng bỏ qua con đang `eject`). Không viết cơ chế đẩy thứ hai.
7. **Bóng Mực `drain`:** chỉ con đang `wander` chọn đèn sáng có `fuel < 30` gần nhất (hòa thì `id` nhỏ hơn); cách ≤ 2 m (XZ) thì vào `drain`, đứng yên và hút. Thoát: `chase` khi Mây ≤ 6 m; `stunned` khi trúng Tỏa Sáng; `wander` khi đèn tắt, khi `fuel ≥ 30`, hoặc khi cách đèn > 2 m.
8. **G1 (UNCONFIRMED, chờ giảng viên):** giữ nguyên `wander` ngẫu nhiên của Phase 2 (2 m/s, đổi hướng mỗi 120 tick; chuyển trạng thái ở `sim.ts:782–788`). Chỉ thêm việc hướng tới đèn yếu: con `wander` có đèn sáng `fuel < 30` thì đi tới đèn gần nhất, hòa thì `id` nhỏ hơn. Ticket viết "đi về đèn tắt gần nhất như trước" nhưng Phase 2 không có hành vi đó (đi ngẫu nhiên); ta không thêm hành vi mới cho đèn tắt để không đổi đầu ra Phase 1–2.
9. **Điểm: giữ 5 khóa `tuning.score` cũ** với giá trị mới (`per_mote 5`, `per_lantern 100`, `per_stun 5`, `per_second_left 0`, `per_flame_left 50`) và thêm 3 khóa `per_relight 40`, `per_stun_drain 15`, `per_lit_lantern_dawn 50`.
10. **G15: hằng sức chứa nằm trong `sim.ts`, không nằm trong contract.** Công thức `min(capacity_max, 10 + 2·successful_lights)` dùng `capacity_max 20` từ contract, còn `10` (sức chứa gốc, trùng `carry_capacity`) và bước `+2` là hằng ở đầu `sim.ts`, vì bảng tuning v1.2 của ticket không có khóa cho chúng. Đây là ngoại lệ có chủ đích với quy tắc "contract là nguồn số duy nhất"; nếu giảng viên muốn có khóa thì thêm ở phase sau.

## Rejected Alternatives

- **Dầu số thực (float).** Trừ `1/60` mỗi tick cộng dồn sai số, so sánh `fuel ≤ 0` và `fuel < 30` có thể lệch một tick giữa các nền tảng, và hash Windows/Docker có nguy cơ khác nhau. _Rejected because:_ phá yêu cầu tất định; số nguyên 1/60 chính xác và ticket cũng khuyến nghị.
- **Giữ thắng sớm (`all_lit`) song song luật bình minh.** _Rejected because:_ ticket ghi rõ "không còn thắng sớm"; thắng sớm là đúng vấn đề playtest (kết thúc sau 2 phút) và làm `game_over.reason` có hai nghĩa.
- **Thêm trạng thái đèn thứ ba `dim` (đèn yếu).** _Rejected because:_ `fuel < 30` đã đủ để quyết định mất vùng an toàn, nhấp nháy và mục tiêu của Bóng Mực; trạng thái thứ ba cần thêm chuyển trạng thái, sự kiện và trường snapshot ticket không có, và dễ lệch với `fuel`.
- **Đổi tên hoặc thay các khóa `tuning.score` cũ bằng khóa mới.** _Rejected because:_ bộ test ẩn sinh tình huống từ các khóa v1.0–v1.1; đổi tên làm vỡ chúng. Giữ 5 khóa cũ, đổi giá trị, thêm khóa mới (PM quyết định 2026-11-20).
- **Viết cơ chế đẩy riêng cho lúc châm dầu.** _Rejected because:_ `eject` đã có, đã được test ở Phase 2 và ticket yêu cầu hành vi "giống khi đèn vừa thắp".
- **Đưa `10` và `+2` vào contract bằng khóa mới.** _Rejected because:_ ticket liệt kê đúng 8 khóa mới; thêm khóa ngoài v1.2 có thể làm lệch Test Contract.

## Consequences

- **Breaking:** thời lượng Đêm 300/330/360 → 240/270/300; `game_over.reason` mất `all_lit`, thêm `dawn_survived`; công thức điểm thay hoàn toàn (không còn thưởng thời gian); sức chứa khởi đầu 10 nhưng thay đổi theo Đêm (tối đa 20); đèn đã sáng nay nhận đom đóm. Test Phase 2 dựa vào các luật này phải sửa hoặc xóa có lý do (mục "Thay đổi test" trong spec), không `skip`.
- **Snapshot/scenario/sự kiện mở rộng** theo v1.2; bản web chỉ đọc state, không chứa luật.
- **Bot Phase 2** (thắng 5/20 Đêm 1 bằng cách thắp hết đèn) không còn đủ; cần bot biết giữ dầu. Không hạ ngưỡng `win_ratio`.
- **Rủi ro mở:** G1 chưa được xác nhận; nếu giảng viên muốn `wander` quanh đèn tắt, đầu ra Phase 1–2 sẽ đổi và ADR này phải được cập nhật.
- `sim.ts` có thêm hai hằng không nằm trong contract (G15); phải ghi trong changelog.
- **G19 (UNCONFIRMED):** thứ tự tick của ticket được áp dụng nguyên văn: bước 2 (hao/hút) chạy trước bước 5 (tương tác). Hệ quả: đèn `fuel 100` đã hao còn 5999 đơn vị ở bước 5 nên vẫn là ứng viên châm dầu (`used 1`), `fuel 90` cần 2 đom đóm; "đèn đầy không được chọn" chỉ đúng ở đúng 6000 đơn vị, không đạt được ở bước 5 giữa Đêm. Tiêu chí P4 được sửa theo, sim không bị bẻ. Nếu giảng viên muốn đèn đầy bị bỏ qua, phải đổi thứ tự bước 2/5 và nhiều đầu ra sẽ đổi.
- Scenario sai logic nay thoát mã 2: `shades[].target_lantern_id` không khớp đèn nào; đèn `lit: false` tường minh với `deposited` ≥ giá thắp. `lanterns[].id` không tồn tại vẫn bị bỏ qua im lặng (như Phase 2): hạn chế đã biết.
- Bot (G18) viết lại; hằng số chỉnh trên seed 1–20 (19/20, 12/20, 4/20 cho Đêm 1/2/3), `win_ratio` không đổi.
