const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { parseTransaction } = require('./src/parser');
const db = require('./src/database');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const http = require("http");

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot alive");
}).listen(3000);


async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('Scan QR Code ini:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ BOT LEVEL 2 SUDAH JALAN!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return; 

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if (!text) return;
        
        const cmd = text.toLowerCase().trim();

        try {
            // 1. CEK SALDO
            if (cmd === 'saldo') {
                const bal = await db.getBalance();
                await sock.sendMessage(sender, { text: `💰 *Saldo Saat Ini:*\nRp ${bal.toLocaleString('id-ID')}` });
            }
            // 2. HAPUS TRANSAKSI (Bisa 'hapus 5' atau cuma 'hapus' pesan instruksi)
            else if (cmd.startsWith('hapus')) {
                const parts = cmd.split(' ');
                // Kalau user cuma ketik "hapus" doang, kasih tau caranya
                if (parts.length < 2) {
                    await sock.sendMessage(sender, { text: "⚠️ Cara hapus: Ketik `hapus [ID]`\nLihat ID di menu `rekap`." });
                    return;
                }
                
                const idToDelete = parseInt(parts[1]);
                if (isNaN(idToDelete)) return; // Abaikan kalau bukan angka

                const changes = await db.deleteById(idToDelete);
                if (changes > 0) {
                    await sock.sendMessage(sender, { text: `✅ Transaksi ID ${idToDelete} berhasil dimusnahkan.` });
                } else {
                    await sock.sendMessage(sender, { text: `❌ ID ${idToDelete} tidak ditemukan.` });
                }
            }
            // 3. REKAP DETAIL (Harian/Mingguan/Bulanan)
            else if (cmd.includes('rekap')) {
                let days = 1; // Default harian
                let title = "Hari Ini";
                
                if (cmd.includes('minggu')) { days = 7; title = "7 Hari Terakhir"; }
                if (cmd.includes('bulan')) { days = 30; title = "30 Hari Terakhir"; }

                const rows = await db.getRecap(days);
                
                if(rows.length === 0) {
                    await sock.sendMessage(sender, { text: "📭 Belum ada data transaksi." });
                    return;
                }

                // Header Laporan
                let report = `📊 *Laporan Keuangan ${title}*\n`;
                report += `_Format: [ID] Waktu - Nominal (Ket)_\n`
                report += `----------------------------------\n`;

                let totalMasuk = 0;
                let totalKeluar = 0;

                // Loop data biar rapi
                rows.forEach(r => {
                    // Format Tanggal: "26 Des 14:30"
                    const dateObj = new Date(r.date);
                    const dateStr = dateObj.toLocaleDateString('id-ID', { 
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' 
                    }).replace('.', ':'); // HP kadang formatnya pake titik, kita ganti titik dua biar ganteng

                    const icon = r.type === 'income' ? '🟢' : '🔴';
                    const amountStr = r.amount.toLocaleString('id-ID');
                    
                    // Isi Laporan: [12] 26 Des 14:00 - Rp 50.000 (Makan)
                    report += `[${r.id}] ${dateStr}\n${icon} Rp ${amountStr} _(${r.description})_\n`;

                    // Hitung total sekalian
                    if (r.type === 'income') totalMasuk += r.amount;
                    else totalKeluar += r.amount;
                });

                report += `----------------------------------\n`;
                report += `📈 Total Masuk: Rp ${totalMasuk.toLocaleString('id-ID')}\n`;
                report += `📉 Total Keluar: Rp ${totalKeluar.toLocaleString('id-ID')}\n`;
                report += `💰 *Saldo Akhir: Rp ${(totalMasuk - totalKeluar).toLocaleString('id-ID')}*`;

                await sock.sendMessage(sender, { text: report });
            }
            // 4. MENU BANTUAN
            else if (cmd === 'menu' || cmd === 'help') {
                const helpText = `🤖 *ASISTEN KEUANGAN V2*\n\n` +
                                 `📌 *Cara Catat:* \n` +
                                 `• _+ 50rb uang kaget_ (Pemasukan)\n` +
                                 `• _- 20k beli seblak_ (Pengeluaran)\n\n` +
                                 `📌 *Perintah:*\n` +
                                 `• *saldo* : Cek sisa uang\n` +
                                 `• *rekap* : Laporan hari ini\n` +
                                 `• *rekap minggu* : Laporan 7 hari\n` +
                                 `• *hapus [ID]* : Hapus transaksi (Lihat ID di rekap)`;
                await sock.sendMessage(sender, { text: helpText });
            }
            // 5. PARSER TRANSAKSI (Default)
            else {
                const trx = parseTransaction(text);
                if (trx) {
                    await db.addTransaction(trx.type, trx.amount, trx.description);
                    const formatAmt = trx.amount.toLocaleString('id-ID');
                    const emoji = trx.type === 'income' ? '📈' : '📉';
                    await sock.sendMessage(sender, { 
                        text: `${emoji} *Tercatat!* \nRp ${formatAmt}\n"${trx.description}"` 
                    });
                }
            }
        } catch (e) {
            console.error("Error:", e);
        }
    });
}

connectToWhatsApp();
