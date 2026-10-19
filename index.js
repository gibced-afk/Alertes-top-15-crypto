const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// ====================== CONFIGURATION ======================
const DISCORD_WEBHOOK = "https://discordapp.com/api/webhooks/1561547598077239346/y32Tj-IkL-Z-Qdk6HNDOOJ6BtAkSSjNkq0Kz4rDxZMKNSFvden5D9GHzLWRmkYxQ95v5";
const REFRESH_INTERVAL = 5 * 60 * 1000; // 3 minutes
let previousStatus = {};
let isRateLimited = false;

// ====================== FONCTIONS ======================
function getSignal(coin) {
  const change = coin.price_change_percentage_24h || 0;
  if (change >= 4.5) return { type: 'buy', label: 'Achat fort' };
  if (change >= 2.2) return { type: 'buy', label: 'Achat' };
  if (change <= -4.5) return { type: 'sell', label: 'Éviter fort' };
  if (change <= -2.2) return { type: 'sell', label: 'Éviter' };
  return { type: 'neutral', label: 'Neutre' };
}

async function sendDiscordAlert(crypto, from, to) {
  const colors = {
    buy: 0x10b981,
    neutral: 0xf59e0b,
    sell: 0xef4444
  };
  const labels = {
    buy: 'Achat',
    neutral: 'Neutre',
    sell: 'Éviter'
  };

  const payload = {
    embeds: [{
      title: "🔔 Changement de signal",
      description: `**${crypto}** est passé de **${labels[from]}** → **${labels[to]}**`,
      color: colors[to],
      timestamp: new Date().toISOString(),
      footer: {
        text: "Top 15 Cryptos • Service autonome Render"
      }
    }]
  };

  try {
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log(`✅ Alerte envoyée : ${crypto} ${from} → ${to}`);
  } catch (error) {
    console.error('Erreur Discord :', error.message);
  }
}

async function checkCryptos() {
  // Si on est en rate limit, on saute ce tour
  if (isRateLimited) {
    console.log('⏳ En attente à cause du rate limit CoinGecko...');
    return;
  }

  try {
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=15&page=1&sparkline=false';
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CryptoAlertsBot/1.0'
      }
    });

    // Gestion spécifique du 429
    if (response.status === 429) {
      console.log('⚠️ Rate limit CoinGecko (429). Pause de 10 minutes.');
      isRateLimited = true;
      
      // On désactive le rate limit après 10 minutes
      setTimeout(() => {
        isRateLimited = false;
        console.log('✅ Rate limit levé, reprise des vérifications.');
      }, 10 * 60 * 1000);
      
      return;
    }

    if (!response.ok) {
      throw new Error(`API Error ${response.status}`);
    }

    const data = await response.json();
    const newStatus = {};

    data.forEach(coin => {
      const signal = getSignal(coin);
      const id = coin.id;
      const symbol = coin.symbol.toUpperCase();

      if (previousStatus[id] && previousStatus[id] !== 
