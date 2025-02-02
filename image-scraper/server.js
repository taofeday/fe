// server.js
const express = require('express');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const archiver = require('archiver');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

/**
 * API POST /get-assets
 * Sử dụng Puppeteer để load trang động với các tùy chọn cấu hình:
 * - userAgent: chuỗi User-Agent tùy chỉnh (nếu không có thì dùng mặc định)
 * - headless: Boolean, xác định có chạy ở chế độ headless hay không (mặc định: true)
 *
 * Sau đó, lấy HTML và dùng Cheerio trích xuất các thẻ <img>,
 * hỗ trợ cả hình ảnh dạng URL thông thường và data:image base64.
 */
app.post('/get-assets', async (req, res) => {
  const { url, userAgent, headless } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'Không có URL được cung cấp' });
  }
  
  try {
    const browser = await puppeteer.launch({ headless: headless !== undefined ? headless : true });
    const page = await browser.newPage();

    const defaultUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                             "AppleWebKit/537.36 (KHTML, like Gecko) " +
                             "Chrome/115.0.0.0 Safari/537.36";
    await page.setUserAgent(userAgent || defaultUserAgent);

    // Điều hướng đến URL và chờ cho đến khi trang load xong
    await page.goto(url, { waitUntil: 'networkidle2' });
    const html = await page.content();
    await browser.close();

    const $ = cheerio.load(html);
    let images = [];
    $('img').each((i, elem) => {
      let src = $(elem).attr('src');
      if (src) {
        // Nếu src không bắt đầu bằng "http" nhưng không phải data:image, chuyển thành absolute
        if (!src.startsWith('http') && !src.startsWith('data:')) {
          src = new URL(src, url).href;
        }
        images.push(src);
      }
    });
    
    res.json({ images });
  } catch (error) {
    console.error('Lỗi khi fetch URL với Puppeteer:', error.message);
    res.status(500).json({ error: 'Có lỗi xảy ra khi truy cập URL bằng headless browser.' });
  }
});

/**
 * API POST /download-zip
 * Nhận một mảng các URL hình ảnh (URL thông thường hoặc data:image) và tạo file ZIP,
 * giữ nguyên tên file gốc nếu có thể (hoặc tạo tên mặc định nếu không thể trích xuất).
 */
app.post('/download-zip', async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'Không có danh sách URLs hợp lệ' });
  }
  
  try {
    res.setHeader('Content-Disposition', 'attachment; filename=images.zip');
    res.setHeader('Content-Type', 'application/zip');
    
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    
    const downloadPromises = urls.map(async (url, i) => {
      try {
        let filename;
        if (url.startsWith("data:")) {
          const commaIndex = url.indexOf(',');
          if (commaIndex === -1) throw new Error("Invalid data URI");
          const meta = url.substring(0, commaIndex);
          const base64Data = url.substring(commaIndex + 1);
          const matches = meta.match(/data:([^;]+);base64/);
          let mimeType = "application/octet-stream";
          if (matches && matches[1]) mimeType = matches[1];
          const ext = mimeType.split('/')[1] || "bin";
          filename = `file_${i}.${ext}`;
          const buffer = Buffer.from(base64Data, 'base64');
          archive.append(buffer, { name: filename });
        } else {
          const response = await axios.get(url, { responseType: 'stream' });
          try {
            const urlObj = new URL(url);
            filename = urlObj.pathname.substring(urlObj.pathname.lastIndexOf('/') + 1);
            if (!filename) filename = `file_${i}`;
          } catch (e) {
            filename = `file_${i}`;
          }
          archive.append(response.data, { name: filename });
        }
      } catch (err) {
        console.error(`Error downloading ${url}:`, err.message);
      }
    });
    
    await Promise.all(downloadPromises);
    await archive.finalize();
  } catch (err) {
    console.error('Error creating zip:', err.message);
    res.status(500).json({ error: 'Error creating zip file' });
  }
});

/**
 * API POST /get-cloud
 * Nhận một mảng các URL hình ảnh (URL thông thường hoặc data:image),
 * và lưu các file này vào thư mục "files" trong server,
 * phân theo loại file (ví dụ: các file PNG sẽ được lưu vào thư mục files/png/).
 */
app.post('/get-cloud', async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'Không có danh sách URLs hợp lệ' });
  }
  
  try {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      let ext, filename;
      if (url.startsWith("data:")) {
        // Xử lý data URI
        const commaIndex = url.indexOf(',');
        if (commaIndex === -1) continue; // Bỏ qua nếu không hợp lệ
        const meta = url.substring(0, commaIndex);
        const base64Data = url.substring(commaIndex + 1);
        const matches = meta.match(/data:([^;]+);base64/);
        let mimeType = "application/octet-stream";
        if (matches && matches[1]) {
          mimeType = matches[1];
        }
        ext = mimeType.split('/')[1] || "bin";
        filename = `file_${i}.${ext}`;
        const buffer = Buffer.from(base64Data, 'base64');
        const folder = path.join(__dirname, 'files', ext);
        fs.mkdirSync(folder, { recursive: true });
        const filePath = path.join(folder, filename);
        fs.writeFileSync(filePath, buffer);
      } else {
        // Xử lý URL thông thường
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        try {
          const urlObj = new URL(url);
          const pathname = urlObj.pathname;
          filename = pathname.substring(pathname.lastIndexOf('/') + 1);
          if (!filename) {
            filename = `file_${i}`;
          }
          ext = filename.split('.').pop().toLowerCase();
        } catch (e) {
          filename = `file_${i}`;
          ext = 'bin';
        }
        const folder = path.join(__dirname, 'files', ext);
        fs.mkdirSync(folder, { recursive: true });
        const filePath = path.join(folder, filename);
        fs.writeFileSync(filePath, response.data);
      }
    }
    res.json({ message: 'Files saved to cloud successfully.' });
  } catch (err) {
    console.error("Error saving files to cloud:", err.message);
    res.status(500).json({ error: "Error saving files to cloud." });
  }
});

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
