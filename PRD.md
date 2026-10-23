# Brownout — PRD

*Latihan hari terburuk tim-mu. Simulator incident drill dengan skenario deterministik, webhook sandbox, dan skor yang bisa dibuktikan.*

Dibuat untuk TestSprite Hackathon Season 4. Dokumen ini ditulis agar bisa langsung dibaca AI coding assistant dan dipakai sebagai spesifikasi test di portal TestSprite 3.0.

## 1. Ringkasan

Brownout adalah aplikasi web tempat tim melatih respons insiden. Admin merancang skenario insiden (misalnya token kedaluwarsa atau antrean macet). Saat drill dijalankan, mesin skenario mengirim webhook ke **receiver sandbox bawaan aplikasi** pada tick tertentu, dengan kegagalan yang disuntikkan secara terjadwal. Peserta harus memilih aksi mitigasi yang benar sebelum batas tick. Hasilnya diberi skor deterministik dan laporan pasca-insiden yang bisa dibagikan.

Kata kunci desain: **deterministik** (seed + jam virtual), **bisa dijelaskan** (setiap skor punya rincian), dan **bisa diuji** (semua hasil muncul sebagai teks stabil di DOM).

## 2. Tujuan dan non-tujuan

**Tujuan**

- Logika bisnis dalam: state machine, delivery engine dengan retry, scoring engine.
- Suite test 50+ skenario yang berbeda satu sama lain, bukan duplikat.
- Aplikasi stabil di live URL publik tanpa login wall untuk halaman demo.

**Non-tujuan**

- Mengirim webhook ke URL sembarang milik pengguna (lihat bagian Keamanan).
- Multi-tenant penuh, rotasi token, atau billing.
- Optimasi performa skala besar.

## 3. Peran

- **Commander:** membuat skenario, menjalankan drill, memilih aksi mitigasi.
- **Observer:** hanya melihat drill dan laporan (read-only).
- **Tamu:** hanya bisa membuka laporan lewat link bagikan.

Sediakan dua akun demo (Commander dan Observer) dengan kredensial tertulis di README.

## 4. Konsep inti

**Jam virtual.** Satu tick = satu detik virtual. Mode normal berjalan otomatis; **mode test** punya tombol dan endpoint *Advance tick* sehingga test tidak menunggu waktu nyata.

**Skenario.** Dokumen JSON: nama, seed, batas tick, daftar event (tick, tipe, payload, kegagalan yang disuntikkan), metrik awal, aksi mitigasi wajib.

**Receiver sandbox.** Endpoint bawaan yang memverifikasi tanda tangan, menolak duplikat, dan mengurutkan pesan. Semua hasil dicatat di log yang tampil di UI.

## 5. Persyaratan fungsional

### A. Auth dan peran

- FR-A1: Sign up dan login dengan email + password (minimal 8 karakter). Pesan error stabil: `E-AUTH-001` (kredensial salah), `E-AUTH-002` (email tidak valid), `E-AUTH-003` (password pendek).
- FR-A2: Sesi kedaluwarsa mengarahkan ke login dengan pesan `E-AUTH-004`.
- FR-A3: Observer tidak bisa membuat skenario atau menjalankan drill (`E-ROLE-403`).
- FR-A4: Halaman laporan bagikan bisa dibuka tanpa login, tapi tidak menampilkan tombol aksi.

### B. Scenario builder

- FR-B1: Nama 3 sampai 60 karakter.
- FR-B2: Batas tick 10 sampai 600.
- FR-B3: Maksimal 20 event per skenario. Payload harus JSON valid dan paling besar 4 KB.
- FR-B4: Tipe kegagalan yang boleh: `http500`, `timeout`, `duplicate`, `out_of_order`, `drop`.
- FR-B5: Target event harus ID receiver sandbox yang ada. Input lain ditolak dengan `E-BLD-TARGET`.
- FR-B6: Karakter aneh (HTML, `<script>`, tanda kutip) disimpan sebagai teks dan ditampilkan ter-escape, tidak pernah dieksekusi.
- FR-B7: Status DRAFT berubah ke READY hanya jika semua validasi lolos.

### C. State machine drill

Status: `DRAFT`, `READY`, `RUNNING`, `PAUSED`, `RESOLVED`, `FAILED`, `EVALUATED`.

| Dari | Ke | Syarat |
| --- | --- | --- |
| DRAFT | READY | validasi lolos |
| READY | RUNNING | start (kena rate limit) |
| RUNNING | PAUSED | pause |
| PAUSED | RUNNING | resume |
| RUNNING | RESOLVED | semua aksi wajib benar sebelum batas tick |
| RUNNING | FAILED | batas tick terlewat |
| RESOLVED atau FAILED | EVALUATED | skor dihitung otomatis |
| RUNNING atau PAUSED | READY | reset (progres dihapus) |

Transisi lain ditolak dengan `E-STATE-409` dan status tidak berubah. Klik cepat berulang pada Start, Pause, Stop harus menghasilkan satu status akhir yang konsisten (tidak ada dobel eksekusi).

### D. Delivery engine dan receiver

- FR-D1: Setiap webhook membawa nomor urut, `Idempotency-Key`, dan header `X-Brownout-Signature` (HMAC-SHA256 dari `nomor.body`).
- FR-D2: Gagal terkirim diulang maksimal 3 percobaan dengan jeda 1 lalu 2 tick. Gagal ketiga masuk `DEAD_LETTER`.
- FR-D3: Tanda tangan salah ditolak (`E-SIG-401`) dan dicatat.
- FR-D4: Idempotency-Key yang sama tidak diproses ulang; log menandai `duplicate`.
- FR-D5: Pesan datang tidak berurutan ditahan sampai urutan lengkap (maksimal 3 pesan ditahan), lalu diproses berurutan.
- FR-D6: Target `timeout` atau `http500` tidak membuat server crash; kegagalan muncul di log delivery.

### E. Aksi mitigasi

Lima aksi: `restart_worker`, `scale_up`, `rotate_token`, `enable_circuit_breaker`, `failover_db`. Tiap skenario menentukan aksi yang benar. Aksi yang salah tetap dicatat dan dikenai penalti. Aksi tidak boleh dijalankan saat drill tidak RUNNING (`E-STATE-409`).

### F. Scoring (deterministik)

- Skor awal 100, dibatasi 0 sampai 100.
- MTTA: tick sampai aksi pertama. Penalti 1 poin per tick setelah tick ke-3.
- Aksi salah: minus 5 per aksi.
- Pelanggaran SLA: minus 10 per jendela tick ketika metrik kritis melewati ambang.
- Petunjuk dipakai: minus 5 per petunjuk.
- Nilai: A (90 ke atas), B (75), C (60), D (40), F (di bawah 40).
- Hasil yang sama untuk seed dan urutan aksi yang sama.

### G. Laporan pasca-insiden

Linimasa event dan aksi, rincian skor per penalti, MTTA dan MTTR, daftar webhook DEAD\_LETTER. Link bagikan read-only. Tersedia dalam bahasa Indonesia dan Inggris.

### H. Live view

- FR-H1: Metrik dan log diperbarui lewat SSE atau polling (pilih yang lebih stabil di deployment).
- FR-H2: Muat ulang halaman saat drill berjalan memulihkan riwayat dan status yang sama.
- FR-H3: Parameter URL `?motion=off` mematikan animasi.
- FR-H4: Koneksi putus menampilkan status `Menyambung ulang` lalu pulih tanpa kehilangan event.

### I. Keamanan dan batas

- FR-I1: Aplikasi **hanya** mengirim ke receiver sandbox bawaan. Tidak ada URL bebas, sehingga tidak ada risiko SSRF atau penyalahgunaan sebagai alat serangan.
- FR-I2: Maksimal 5 start drill per menit per workspace; kelebihannya mendapat 429 dengan header `Retry-After` dan pesan `E-RATE-429`.
- FR-I3: Ukuran payload dan jumlah event dibatasi seperti di bagian B.

## 6. Aturan testability (wajib)

1. Setiap elemen penting punya `data-testid`.
2. Semua pesan error punya kode stabil seperti di atas.
3. Seed dan jam virtual membuat hasil sama setiap kali.
4. Mode test dengan *Advance tick*, tanpa menunggu waktu nyata.
5. Endpoint reset data hanya untuk akun demo dan dijaga token.
6. Test memakai data tetap, tidak bergantung pada tanggal hari ini.
7. Rate limit dikonfigurasi kecil (5 per menit) agar 429 bisa diuji dengan sedikit request.

## 7. Rencana test (target desain sekitar 60)

Angka ini target desain. Jumlah akhir bergantung pada hasil portal 3.0 dan kredit akun, jadi cek batas kredit sebelum membuat puluhan test.

| Keluarga | Contoh | Perkiraan |
| --- | --- | --- |
| Auth dan peran | login benar/salah, password pendek, sesi habis, Observer ditolak, laporan publik | 8 |
| Scenario builder | batas nama, batas tick, 20 vs 21 event, JSON rusak, XSS tersimpan aman, target tidak valid | 10 |
| State machine | setiap transisi sah, setiap transisi ilegal, klik cepat, reset | 10 |
| Delivery dan receiver | retry 1-3, dead-letter, tanda tangan salah, duplikat, out-of-order, timeout | 10 |
| Scoring dan laporan | MTTA tepat di batas, aksi salah, SLA breach, nilai A hingga F, seed sama hasil sama | 8 |
| Live view | metrik berubah, refresh saat jalan, reconnect, motion off | 5 |
| Keamanan dan batas | rate limit 429, payload terlalu besar, URL bebas ditolak | 5 |
| Kosong dan error | daftar kosong, halaman tidak ada, persistensi setelah muat ulang | 4 |

## 8. Rencana PR

1. Kerangka aplikasi, deploy publik, auth dan peran, hubungkan GitHub App, aktifkan Blocking PRs, buat suite awal di portal.
2. Scenario builder dan validasi.
3. State machine dan aksi mitigasi.
4. Delivery engine dan receiver sandbox.
5. Scoring dan laporan.
6. Live view, rate limit, dan batas keamanan.
7. README, halaman Rulebook (daftar FR dan kode error), dan polesan terakhir.

Siklus merah ke hijau harus muncul **organik** dari perubahan fitur. Jika ada bug yang sengaja disuntik untuk demo, beri label jelas di README dan di PR.

## 9. Kalau waktu mepet

**Wajib:** B, C, D (inti retry dan duplikat), F, G sederhana, auth dengan dua peran. **Bisa dipangkas:** SSE (pakai polling), bahasa kedua, Observer, lima aksi menjadi tiga. Jangan menambah fitur baru setelah suite stabil; perdalam skenario pada fitur yang ada.

## 10. Daftar pengecekan submission

- Repo publik dengan README: aplikasi, live URL, apa yang dicakup suite.
- PR dengan komentar atau status check TestSprite, test lolos.
- Live URL publik yang bisa dibuka juri.
- Email dan nama akun TestSprite yang sama dengan yang dipakai membuat suite.
- Posting PR link, live URL, dan email di #hackathon-submissions sebelum deadline.

## 11. Risiko

- Lingkup besar; jangan mulai dari live view atau WebSocket.
- Fitur real-time rawan flaky; selalu sediakan mode test manual.
- Jalur simulator insiden dan chaos testing sudah umum; pembeda Brownout adalah skor yang bisa dijelaskan dan receiver sandbox yang aman.
- Tidak ada jaminan peringkat.
