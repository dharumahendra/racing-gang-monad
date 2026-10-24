import { CARS } from '@racing-gang/config';
// Only presentation colors and account balances are fixtures. Game numbers come from the shared package.
const colors = ['#DA6A37', '#477A9A', '#D5AC4D', '#94638D', '#386D60'];
export const previewCars = CARS.map(car => ({ tier: car.tier, name: car.name, speed: car.maxKmh, nearMisses: car.reqNearMiss, coins: car.coinCost, mon: car.priceMon, color: colors[car.tier] }));
export const previewBalance = { coins: 4000, coinsPending: 200, coinsReserved: 3000 };
