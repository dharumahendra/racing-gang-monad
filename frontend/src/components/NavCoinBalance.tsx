import { useStore } from 'zustand';
import { session } from './Wallet';
import { settings } from '../lib/config';
import { previewBalance } from '../lib/mock';
import { Icon } from './Icon';

const number = (n: number) => n.toLocaleString('en-US');

export function NavCoinBalance() {
  const account = useStore(session, s => s.account);
  const balance = settings.mode === 'mock' ? previewBalance : account;
  const available = balance ? number(balance.coins - balance.coinsReserved) : '—';

  return (
    <details className="nav-resource-pill">
      <summary aria-label="Coin Balance" title="Click for coin balance details">
        <span className="resource-icon"><Icon name="coin" /></span>
        <span className="resource-amount">{available}</span>
        <span className="resource-plus" aria-hidden="true">+</span>
      </summary>
      <div className="resource-dropdown">
        <p className="resource-dropdown-title">
          {settings.mode === 'mock' ? 'Sample balance' : balance ? 'Backend balance' : 'Sign in to see your balance'}
        </p>
        <dl>
          <div>
            <dt>Available</dt>
            <dd>{available}</dd>
          </div>
          <div>
            <dt>Pending</dt>
            <dd>{balance ? `+${number(balance.coinsPending)}` : '—'}</dd>
          </div>
          <div>
            <dt>Reserved</dt>
            <dd>{balance ? number(balance.coinsReserved) : '—'}</dd>
          </div>
        </dl>
      </div>
    </details>
  );
}
