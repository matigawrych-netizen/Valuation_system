/** NARZĘDZIE RĘCZNE (debug, sieć) — nie jest częścią pipeline'u. */
import { yahooFinance } from '../../src/yahoo-mapper.js';
yahooFinance.chart('LEH', {period1: new Date('2006-01-01'), interval: '1d'})
  .then(d => console.log('Quotes:', d.quotes.length))
  .catch(e => console.error('Error:', e.message));
