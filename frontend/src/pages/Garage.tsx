import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from 'zustand';
import { CarPreview } from '../components/CarPreview';
import { previewBalance, previewCars } from '../lib/mock';
import { settings } from '../lib/config';
import { session } from '../components/Wallet';
const number = (n: number) => n.toLocaleString('id-ID');
export function Garage() {
  const [tier, setTier] = useState(0); const car = previewCars[tier];
  const account = useStore(session, s => s.account);
  const balance = settings.mode === 'mock' ? previewBalance : account;
  return <><div className="page-heading"><div><span className="eyebrow">BENGKEL / PILIH MOBIL</span><h1>Garasimu.<br/><span>Awal setiap run.</span></h1></div><p>Gas otomatis. Cari celah, kumpulkan mepet,<br className="desktop-break"/> dan biarkan penonton menambah tantangan.</p></div>
    <section className="balances" aria-label="Saldo koin"><div><span>Tersedia untuk belanja</span><strong>{balance ? number(balance.coins - balance.coinsReserved) : '—'} <small>koin</small></strong></div><div><span>Menunggu pencatatan</span><strong>{balance ? `+${number(balance.coinsPending)}` : '—'}</strong></div><div><span>Disisihkan</span><strong>{balance ? number(balance.coinsReserved) : '—'}</strong></div><span className="balance-note">{settings.mode === 'mock' ? 'SALDO CONTOH' : account ? 'DARI BACKEND' : 'MASUK UNTUK MELIHAT SALDO'}</span></section>
    <div className="garage-grid"><section className="preview-panel"><div className="panel-label"><span>RACING GANG / {tier === 0 ? 'STARTER' : `TIER ${tier}`}</span><span>MODEL / QUATERNIUS</span></div><CarPreview key={tier} tier={tier}/><div className="preview-caption"><span>Mobil pilihan</span><strong>{car.name}</strong><span className="badge">{tier === 0 ? 'Gratis · bukan NFT' : 'Soulbound · tidak dapat ditransfer'}</span></div></section>
      <section className="car-details"><h2>Pilih kendaraan</h2><div className="tier-picker" aria-label="Pilihan mobil">{previewCars.map(c => <button key={c.tier} aria-pressed={tier === c.tier} onClick={() => setTier(c.tier)}><span>{c.tier === 0 ? 'S' : `T${c.tier}`}</span><small>{c.tier === 0 ? 'Starter' : 'Pratinjau'}</small></button>)}</div><div className="detail-title"><h3>{car.name}</h3><span className="badge">{tier === 0 ? 'Mobil awal' : 'Syarat belum diverifikasi'}</span></div><dl className="car-stats"><div><dt>Kecepatan maks.</dt><dd>{car.speed} <small>km/j</small></dd></div><div><dt>Mepet dalam 1 run</dt><dd>{car.nearMisses || '—'}</dd></div><div><dt>Harga koin</dt><dd>{number(car.coins)}</dd></div><div><dt>MON testnet</dt><dd>{car.mon}</dd></div></dl><p className="muted">{tier === 0 ? 'Starter tersedia sebagai mobil awal. NFT baru terbuka setelah syarat mepet terpenuhi.' : `Syarat memakai ${tier === 1 ? 'Starter atau lebih tinggi' : `Tier ${tier - 1} atau lebih tinggi`}. Stok dan kelulusan resmi menunggu integrasi kontrak.`}</p><button className="button wide" disabled>{tier === 0 ? 'Starter · pilihan awal' : 'Pembelian tersedia setelah integrasi'}</button><p className="fine-print">Kepemilikan dan stok akan ditampilkan saat fitur online siap.</p></section></div>
    <section className="start-strip"><div><span className="eyebrow">SATU RUN. MAKSIMAL 100 DETIK.</span><h2>Siap cari celah?</h2></div><div className="start-actions"><Link className="button" to="/play">Coba latihan <span aria-hidden="true">↗</span></Link><Link className="button secondary" to="/room">Buat room</Link><Link className="quiet-link" to="/watch">Jadi penonton →</Link></div></section>
  </>;
}


