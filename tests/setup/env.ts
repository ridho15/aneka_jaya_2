// Nilai palsu untuk uji; token dan alamat CCTV asli hanya ada di .env server.
process.env.CCTV_BASE_URL ??= "http://203.0.113.10:8000";
process.env.CCTV_API_TOKEN ??= "test-cctv-token";
process.env.CCTV_INTEGRATION_TOKEN ??= "test-cctv-token";
