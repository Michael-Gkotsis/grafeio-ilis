// Το ίδιο Electron με την εφαρμογή (Chromium 108): ένα παράθυρο 1366×768 με τη σελίδα της μέτρησης
const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => { const [bw, bh] = (process.env.BENCH_SIZE || '1366x768').split('x').map(Number); const w = new BrowserWindow({ width: bw, height: bh, useContentSize: !!process.env.BENCH_SIZE, show: true, webPreferences: { contextIsolation: true } }); w.loadURL(process.env.BENCH_URL); });
