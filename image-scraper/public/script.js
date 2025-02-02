// public/script.js

// Tạo IntersectionObserver để lazyload ảnh
const lazyImageObserver = ('IntersectionObserver' in window) ? 
  new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const lazyImage = entry.target;
        // Gán giá trị data-src cho src để tải ảnh
        lazyImage.src = lazyImage.dataset.src;
        observer.unobserve(lazyImage);
      }
    });
  }) : null;

// Các biến toàn cục để lưu danh sách hình của modal và chỉ số hiện tại
let currentModalImages = [];
let currentModalIndex = 0;

// Hàm nhóm các URL theo phần mở rộng file
function groupByExtension(urls) {
  const groups = {};
  urls.forEach(url => {
    const urlWithoutQuery = url.split('?')[0].split('#')[0];
    const parts = urlWithoutQuery.split('.');
    let ext = parts.pop().toLowerCase();
    if (!groups[ext]) {
      groups[ext] = [];
    }
    groups[ext].push(url);
  });
  return groups;
}

// Xử lý nút "Get Info"
document.getElementById('getInfoBtn').addEventListener('click', async () => {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) {
    alert("Vui lòng nhập URL.");
    return;
  }
  try {
    const response = await fetch('/get-assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await response.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    // Xóa nội dung cũ
    document.getElementById('infoCount').innerHTML = "";
    document.getElementById('result').innerHTML = "";
    
    // Nhóm hình ảnh theo phần mở rộng
    window.imageGroups = groupByExtension(data.images);
    const totalImages = data.images.length;
    document.getElementById('infoCount').innerHTML = `<p>Tìm thấy <strong>${totalImages}</strong> hình ảnh.</p>`;
    
    const resultDiv = document.getElementById('result');
    for (const ext in window.imageGroups) {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'group';
      groupDiv.innerHTML = `<h4>${ext} (${window.imageGroups[ext].length} file)</h4>`;
      
      // Nút "Get" để toggle hiển thị lưới thumbnail
      const getButton = document.createElement('button');
      getButton.className = 'get-group';
      getButton.textContent = 'Get';
      getButton.addEventListener('click', function() {
        let thumbGrid = groupDiv.querySelector('.thumb-grid');
        if (thumbGrid) {
          if (thumbGrid.style.display === 'none' || thumbGrid.style.display === '') {
            thumbGrid.style.display = 'grid';
            getButton.textContent = 'Hide';
          } else {
            thumbGrid.style.display = 'none';
            getButton.textContent = 'Get';
          }
        } else {
          thumbGrid = document.createElement('div');
          thumbGrid.className = 'thumb-grid';
          // Tạo thumbnail cho từng hình trong nhóm
          window.imageGroups[ext].forEach((src, idx) => {
            const thumbWrapper = document.createElement('div');
            thumbWrapper.className = 'thumbnail-wrapper';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'thumbnail-select';
            checkbox.value = src;
            checkbox.addEventListener('click', (e) => {
              e.stopPropagation();
            });
            
            const img = document.createElement('img');
            // Sử dụng lazyload: gán data-src thay vì src
            img.setAttribute('data-src', src);
            // Nếu hỗ trợ IntersectionObserver, quan sát ảnh; nếu không, gán src luôn
            if (lazyImageObserver) {
              lazyImageObserver.observe(img);
            } else {
              img.src = src;
            }
            img.alt = `Image ${ext}`;
            // Khi click vào thumbnail, mở modal với toàn bộ mảng hình của nhóm và chỉ số hiện tại
            img.addEventListener('click', () => { openModal(src, window.imageGroups[ext], idx); });
            
            thumbWrapper.appendChild(img);
            thumbWrapper.appendChild(checkbox);
            thumbGrid.appendChild(thumbWrapper);
          });
          groupDiv.appendChild(thumbGrid);
          getButton.textContent = 'Hide';
        }
      });
      groupDiv.appendChild(getButton);
      
      // Nút "Get All Zip"
      const zipButton = document.createElement('button');
      zipButton.className = 'get-zip';
      zipButton.textContent = 'Get All Zip';
      zipButton.addEventListener('click', async function() {
        try {
          const response = await fetch('/download-zip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: window.imageGroups[ext] })
          });
          if (!response.ok) {
            alert("Có lỗi khi tạo file zip");
            return;
          }
          const blob = await response.blob();
          const zipUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = zipUrl;
          a.download = `images_${ext}.zip`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(zipUrl);
        } catch (err) {
          console.error("Lỗi khi tải zip:", err);
          alert("Có lỗi khi tải file zip.");
        }
      });
      groupDiv.appendChild(zipButton);
      
      // Nút "Get Selected Zip"
      const selectedZipButton = document.createElement('button');
      selectedZipButton.className = 'get-selected-zip';
      selectedZipButton.textContent = 'Get Selected Zip';
      selectedZipButton.addEventListener('click', async function() {
        let thumbGrid = groupDiv.querySelector('.thumb-grid');
        if (!thumbGrid) {
          alert("Vui lòng hiển thị hình trước.");
          return;
        }
        const selectedCheckboxes = thumbGrid.querySelectorAll('.thumbnail-select:checked');
        const selectedUrls = Array.from(selectedCheckboxes).map(chk => chk.value);
        if (selectedUrls.length === 0) {
          alert("Chưa chọn hình nào.");
          return;
        }
        try {
          const response = await fetch('/download-zip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: selectedUrls })
          });
          if (!response.ok) {
            alert("Có lỗi khi tạo file zip");
            return;
          }
          const blob = await response.blob();
          const zipUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = zipUrl;
          a.download = `selected_images_${ext}.zip`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(zipUrl);
        } catch (err) {
          console.error("Lỗi khi tải zip:", err);
          alert("Có lỗi khi tải file zip.");
        }
      });
      groupDiv.appendChild(selectedZipButton);
      
      resultDiv.appendChild(groupDiv);
    }
    
  } catch (error) {
    console.error("Lỗi:", error);
    alert("Đã xảy ra lỗi khi lấy thông tin từ URL.");
  }
});

function updateModal() {
  const modalImage = document.getElementById('modal-image');
  const modalLink = document.getElementById('modal-link');
  if (currentModalImages.length > 0) {
    modalImage.src = currentModalImages[currentModalIndex];
    // Hiển thị link gốc trong ô input
    modalLink.value = currentModalImages[currentModalIndex];
  }
}

function openModal(src, group, index) {
  currentModalImages = group;
  currentModalIndex = index;
  updateModal();
  document.getElementById('modal').style.display = 'flex';
}

document.getElementById('modal-back').addEventListener('click', () => {
  if (currentModalImages.length === 0) return;
  currentModalIndex = (currentModalIndex - 1 + currentModalImages.length) % currentModalImages.length;
  updateModal();
});

document.getElementById('modal-next').addEventListener('click', () => {
  if (currentModalImages.length === 0) return;
  currentModalIndex = (currentModalIndex + 1) % currentModalImages.length;
  updateModal();
});

document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('modal').style.display = 'none';
});

document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal')) {
    document.getElementById('modal').style.display = 'none';
  }
});
