# FollowFaceBook Chrome Extension — Design Spec
**Ngày:** 2026-06-06

## Tổng quan

Chrome Extension tự động follow những người comment vào bài post Facebook của người dùng. Mục đích hỗ trợ việc "xóa xanh" (follow chéo) trong các hội nhóm tăng lượt theo dõi để bật kiếm tiền.

**Điều kiện hoạt động:** Chrome phải đang mở (có thể thu nhỏ). Không cần mở tab Facebook.

---

## Kiến trúc

### Các thành phần

| Thành phần | File | Vai trò |
|---|---|---|
| Background Service Worker | `background.js` | Lõi chính — polling comment, quản lý hàng đợi follow, lưu trữ dữ liệu |
| Content Script | `content.js` | Chạy trên tab profile được mở tạm, click nút Follow |
| Popup Dashboard | `popup.html` + `popup.js` | Giao diện người dùng — nhập bài post, xem thống kê |

### Luồng hoạt động

1. Người dùng nhập link bài post vào Popup → lưu vào `chrome.storage.local`
2. `chrome.alarms` kích hoạt Background Worker mỗi 5 phút
3. Background Worker gọi Facebook internal API để lấy danh sách comment mới (so sánh với `lastChecked`)
4. Với mỗi commenter chưa được follow: thêm vào `queue`
5. Background Worker xử lý hàng đợi: mở tab profile → Content Script click Follow → đóng tab
6. Delay ngẫu nhiên 3-7 giây giữa mỗi lần follow
7. Sau 24 giờ, kiểm tra lại xem họ có follow lại chưa

### Sơ đồ luồng

```
chrome.alarms (5 phút)
       │
       ▼
Background Worker
       │
       ├── Gọi Facebook API → lấy comment mới
       │         │
       │         ▼
       │    Lọc người chưa follow → thêm vào queue
       │
       └── Xử lý queue (tối đa 20/giờ)
                 │
                 ▼
           Mở tab profile
                 │
                 ▼
           Content Script click Follow
                 │
                 ▼
           Đóng tab → lưu storage
```

---

## Dữ liệu (`chrome.storage.local`)

```json
{
  "posts": [
    {
      "postId": "string",
      "postUrl": "string",
      "addedAt": "timestamp"
    }
  ],
  "follows": [
    {
      "userId": "string",
      "name": "string",
      "profileUrl": "string",
      "postId": "string",
      "followedAt": "timestamp",
      "followedBack": "boolean",
      "checkedAt": "timestamp | null"
    }
  ],
  "queue": [
    {
      "userId": "string",
      "profileUrl": "string",
      "postId": "string"
    }
  ],
  "lastChecked": {
    "<postId>": "timestamp"
  }
}
```

---

## Xử lý lỗi

| Tình huống | Cách xử lý |
|---|---|
| Nút Follow không tìm thấy | Đánh dấu `skipped`, không thử lại |
| Tab tải quá chậm | Timeout 10 giây, đưa lại cuối hàng đợi |
| Facebook rate-limit | Delay 3-7 giây giữa mỗi follow, tối đa 20 follow/giờ |
| Mất kết nối internet | Bỏ qua chu kỳ, thử lại chu kỳ tiếp theo |
| Facebook thay đổi DOM | Log lỗi, bỏ qua, thử lại lần sau |

**Giới hạn an toàn:**
- Tối đa 20 follow/giờ
- Delay ngẫu nhiên 3-7 giây giữa các lần follow

---

## Giao diện Popup Dashboard

```
┌─────────────────────────────────┐
│  FollowFaceBook             ⚙️  │
├─────────────────────────────────┤
│  Bài post đang theo dõi:        │
│  [Nhập link bài post...    ] [+]│
│                                 │
│  📋 Đã follow: 48  ⏳ Chờ: 3   │
│  ✅ Follow lại: 31  ❌ Chưa: 17 │
├─────────────────────────────────┤
│  Người chưa follow lại (17)     │
│  ┌─────────────────────────┐   │
│  │ 👤 Nguyễn Văn A    24h  │   │
│  │ 👤 Trần Thị B      26h  │   │
│  └─────────────────────────┘   │
│                                 │
│  Lần kiểm tra cuối: 3 phút trước│
└─────────────────────────────────┘
```

---

## Cấu trúc thư mục dự án

```
FollowFaceBook/
├── manifest.json          # Chrome Extension manifest v3
├── background.js          # Background Service Worker
├── content.js             # Content Script (chạy trên tab profile)
├── popup.html             # Giao diện popup
├── popup.js               # Logic popup
├── popup.css              # Style popup
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Các điểm kỹ thuật quan trọng

- Dùng **Manifest V3** (chuẩn mới nhất của Chrome Extension)
- Background dùng **Service Worker** (không phải background page)
- Gọi Facebook internal GraphQL API với cookie phiên hiện tại của người dùng — endpoint cụ thể cần được khám phá qua DevTools khi cài đặt
- Content Script chỉ inject vào `https://www.facebook.com/*`
- Dùng `chrome.alarms` thay vì `setInterval` vì Service Worker có thể bị sleep
- **Điều kiện:** Người dùng phải đang đăng nhập Facebook trên Chrome

## Quyền Chrome Extension (manifest.json)

```json
"permissions": ["storage", "alarms", "tabs"],
"host_permissions": ["https://www.facebook.com/*"]
```

---

## Tiêu chí thành công

- [ ] Extension tự động phát hiện comment mới mà không cần mở tab Facebook
- [ ] Tự động follow người comment với delay an toàn
- [ ] Dashboard hiển thị đúng số liệu đã follow / chưa follow lại
- [ ] Sau 24h đánh dấu đúng người chưa follow lại
- [ ] Không bị lỗi khi Facebook tải chậm hoặc mất mạng tạm thời
