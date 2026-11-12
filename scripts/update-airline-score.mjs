import { updateAirlineScore } from './airline-market.mjs';

const { date, changePercent, recorded } = await updateAirlineScore(process.env);
console.log(`JETS ${date}: ${changePercent}% (${recorded ? 'recorded' : 'already recorded'})`);
