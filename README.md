# SINTA Journal Scraper

Ekstensi Chrome untuk mengambil data jurnal dari SINTA Journal Index, halaman filter, atau halaman hasil pencarian.

## Cara Pasang

1. Buka `chrome://extensions`.
2. Aktifkan `Developer mode`.
3. Klik `Load unpacked`.
4. Pilih folder lokasi zip


## Cara Pakai

1. Buka homepage SINTA, halaman SINTA Journal Index, atau hasil pencarian/filter jurnal.
2. Klik ikon ekstensi `SINTA Journal Scraper`.
3. Jika ingin mencari topik tertentu, isi `Keyword jurnal`.
4. Pilih:
   - `Ambil Semua Halaman` untuk otomatis mengambil seluruh halaman index/filter/search.
   - `Ambil Halaman Ini` untuk mengambil halaman yang sedang terbuka saja.
5. Jika mulai dari homepage SINTA, ekstensi akan membuka `https://sinta.kemdiktisaintek.go.id/journals`, mengisi form `Search journals`, lalu mengambil hasilnya.
6. Saat `Ambil Semua Halaman`, tab SINTA akan berpindah halaman otomatis supaya progress scraping terlihat.
7. Saat selesai, popup ekstensi akan dicoba dibuka otomatis. Jika Chrome menolak auto-open popup, klik tombol `Lihat Tabel` pada panel kecil di halaman SINTA atau klik ikon ekstensi.
8. Klik `Export Excel` untuk mengunduh file `.xlsx`.

## Data Yang Diambil

- Nama jurnal
- Link profil SINTA
- Link jurnal / website
- Editor URL
- Google Scholar
- Garuda URL
- Afiliasi / penerbit
- P-ISSN
- E-ISSN
- Subject Area
- Akreditasi
- Scopus Indexed
- Garuda Indexed
- Impact
- H5-index
- Citations 5yr
- Citations
- Cover URL
- Source page dan waktu scraping

## Catatan

- Kolom Scopus dan Garuda ditampilkan sebagai data tabel, bukan checkbox filter awal.
- Export Excel berisi autofilter pada baris header, sehingga data bisa difilter dan diurutkan langsung di Excel berdasarkan akreditasi, subject, impact, H5, citations, Scopus/Garuda, dan kolom lain.
- Jika halaman index utama SINTA berisi ribuan halaman, proses bisa berjalan lama. Isi `Batas halaman` jika ingin uji coba sebagian dulu.
