# FollowFaceBook

Chrome Extension tự động follow những người đã comment vào bài post Facebook của bạn.

## Tính năng

- Dán link bài post Facebook → extension tự quét toàn bộ comment
- Tự động follow từng người theo thứ tự, bỏ qua người đã follow
- Giới hạn 20 follow/giờ để tránh bị Facebook hạn chế
- Theo dõi trạng thái: đang chờ, đã follow, follow lại, chưa follow lại
- Xóa link post → dừng follow ngay lập tức

## Cài đặt

### Bước 1: Tải source code

- Nhấn **Code → Download ZIP** trên trang này rồi giải nén, **hoặc**
- Clone về máy:
  ```
  git clone https://github.com/truonganDevOps/FollowFaceBook.git
  ```

### Bước 2: Mở trang Extensions của Chrome

Truy cập địa chỉ sau trên Chrome:
```
chrome://extensions
```

### Bước 3: Bật Developer Mode

Gạt công tắc **Developer mode** ở góc trên bên phải sang **ON**.

### Bước 4: Load extension

Nhấn **Load unpacked** → chọn thư mục vừa giải nén (thư mục chứa file `manifest.json`).

Extension sẽ xuất hiện trong danh sách với icon chữ **F** màu xanh.

## Cách sử dụng

1. Mở Facebook trên Chrome (phải đang đăng nhập).
2. Nhấn icon extension trên thanh công cụ.
3. Dán link bài post vào ô nhập → nhấn **+**.
4. Nhấn **Quét & Follow ngay** để bắt đầu.
5. Extension sẽ fetch comment, xếp hàng và follow từng người tự động.

> Extension cũng tự động chạy ngầm mỗi 5 phút để quét comment mới.

## Gỡ cài đặt

Vào `chrome://extensions` → tìm FollowFaceBook → nhấn **Remove**.
