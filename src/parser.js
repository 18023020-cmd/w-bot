const parseTransaction = (text) => {
    // 1. Bersihkan teks
    const cleanText = text.toLowerCase().trim().replace(/\s+/g, ' ');

    // 2. Regex
    const regex = /^([+\-]|\bmasuk\b|\bkeluar\b)\s*(\d+(?:[.,]\d+)?)\s*(k|rb|jt|juta|m)?(?:\s+|$)(.*)$/i;
    
    const match = cleanText.match(regex);

    // Kalau format gak cocok, return null
    if (!match) return null;

    let [_, typeStr, amountStr, unit, rawDesc] = match;

    // --- LOGIKA TIPE ---
    let type = (['+', 'masuk'].includes(typeStr)) ? 'income' : 'expense';
    
    // --- LOGIKA ANGKA ---
    let amount = parseFloat(amountStr.replace(',', '.'));

    // --- LOGIKA SATUAN ---
    if (unit) {
        if (['k', 'rb'].includes(unit)) amount *= 1000;
        if (['jt', 'juta'].includes(unit)) amount *= 1000000;
        if (['m'].includes(unit)) amount *= 1000000000;
    }

    // --- LOGIKA KETERANGAN ---
    // Ambil teks sisa, kalau undefined jadiin string kosong
    let desc = (rawDesc || '').trim();

    // Kalau kosong, kasih default
    if (!desc) {
        desc = type === 'income' ? 'Pemasukan' : 'Pengeluaran';
    }

    // --- RETURN OBJECT (INI YANG TADI SALAH) ---
    // Kita harus kembalikan sebagai 'description' agar cocok dengan index.js
    return { 
        type, 
        amount, 
        description: desc 
    };
};

module.exports = { parseTransaction };