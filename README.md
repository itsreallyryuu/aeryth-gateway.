# Aeryth Free Gateway

Server kecil di Vercel yang menyimpan API key Gemini milik tim, supaya key itu tidak pernah ada di aplikasi user. CLI memanggil gateway ini saat user belum punya key sendiri.

## Deploy

1. Buat project baru di Vercel dari folder `gateway/` ini (Root Directory: `gateway`).
2. Isi Environment Variables:
   - `GEMINI_API_KEY` (wajib): key dari Google AI Studio. Pakai key khusus untuk gateway ini.
   - `DEFAULT_MODEL` (disarankan): id model bawaan untuk user, ambil dari daftar model Google yang tersedia.
   - `ALLOWED_MODELS` (disarankan): daftar id model yang boleh dipakai, dipisah koma.
   - `RATE_LIMIT_PER_10MIN` (opsional, bawaan 30): batas permintaan per IP.
   - `CLIENT_TOKEN` (opsional): token yang harus dikirim klien lewat `AERYTH_GATEWAY_TOKEN`. Ini hanya penghalang ringan, bukan keamanan: token yang ikut dibagikan ke user bisa diambil user.
3. Deploy, lalu catat alamatnya (misalnya `https://nama-project.vercel.app`).
4. Di CLI: `aeryth config set gateway.url https://nama-project.vercel.app`, atau isi konstanta `DEFAULT_GATEWAY_URL` di `src/providers/aeryth.js` sebelum dibagikan.
5. Cek: `aeryth providers test aeryth`.

## Jika alamat gateway menampilkan 404

Cek dulu dengan `curl -i https://NAMA-PROJECT.vercel.app/api/gemini/default`. Jawaban yang benar adalah JSON `{"model":...}`. Rute ditangani dua cara: file `api/gemini/[...path].js` dan aturan `rewrites` di `vercel.json` yang mengarah ke `api/proxy.js`. Pastikan kedua file itu dan `vercel.json` ada di akar repository, lalu lihat tab Deployments, Functions di Vercel.

## Batas yang harus Anda tahu

- Pembatasan per IP disimpan di memori fungsi, jadi tidak ketat (bisa reset saat fungsi dimulai ulang dan tidak dibagi antar instance). Untuk pembatasan yang kuat, pakai penyimpanan bersama seperti Vercel KV atau Upstash Redis.
- Kuota dan biaya key ditanggung tim. Atur batas kuota di Google AI Studio dan pantau pemakaiannya. Jika disalahgunakan, ganti key di Vercel; user tidak perlu memperbarui aplikasi.
- Gateway hanya meneruskan `models` (daftar) dan `generateContent` / `streamGenerateContent` untuk Gemini. Path lain ditolak.
