// Το ίδιο Electron με την εφαρμογή (Chromium 108): ένα παράθυρο 1366×768 με τη σελίδα της μέτρησης
const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => { const w = new BrowserWindow({ width: 1366, height: 768, show: true, webPreferences: { contextIsolation: true } }); w.loadURL(process.env.BENCH_URL); });
